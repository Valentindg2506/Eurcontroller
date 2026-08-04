<?php
declare(strict_types=1);

/**
 * Gestión de la cuenta.
 *
 *   PUT    ?accion=perfil                    → nombre, moneda y tema
 *   PUT    ?accion=password                  → cambio de contraseña
 *   GET    ?accion=exportar&formato=json|csv → descarga de todos los datos (RGPD)
 *   DELETE ?accion=eliminar                  → borrado de la cuenta y sus datos
 */

require_once __DIR__ . '/config.php';

$usuarioId = exigirSesionValida();
$pdo = db();
$accion = (string) ($_GET['accion'] ?? '');


// --- PUT ?accion=perfil ------------------------------------------------------

if ($accion === 'perfil' && metodo() === 'PUT') {
    $datos  = cuerpo();
    $nombre = (string) campoTexto($datos, 'nombre', 120, true, 'nombre');
    $moneda = campoEnum($datos, 'moneda', MONEDAS, 'EUR');
    $tema   = campoEnum($datos, 'tema', TEMAS, 'sistema');

    $pdo->prepare('UPDATE usuarios SET nombre = ?, moneda = ?, tema = ? WHERE id = ?')
        ->execute([$nombre, $moneda, $tema, $usuarioId]);

    $stmt = $pdo->prepare('SELECT id, email, nombre, moneda, tema, creado_en FROM usuarios WHERE id = ?');
    $stmt->execute([$usuarioId]);

    responder(['ok' => true, 'usuario' => $stmt->fetch()]);
}


// --- PUT ?accion=password ----------------------------------------------------

if ($accion === 'password' && metodo() === 'PUT') {
    $datos  = cuerpo();
    $actual = (string) ($datos['password_actual'] ?? '');
    $nueva  = (string) ($datos['password_nueva'] ?? '');

    if (mb_strlen($nueva) < PASSWORD_MIN) {
        throw new ErrorApi('La nueva contraseña debe tener al menos ' . PASSWORD_MIN . ' caracteres', 422);
    }
    if (mb_strlen($nueva) > 200) {
        throw new ErrorApi('La nueva contraseña es demasiado larga', 422);
    }

    $stmt = $pdo->prepare('SELECT password_hash FROM usuarios WHERE id = ?');
    $stmt->execute([$usuarioId]);
    $hash = (string) $stmt->fetchColumn();

    if (!password_verify($actual, $hash)) {
        throw new ErrorApi('La contraseña actual no es correcta', 403);
    }
    if (password_verify($nueva, $hash)) {
        throw new ErrorApi('La nueva contraseña debe ser distinta de la actual', 422);
    }

    $pdo->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($nueva, PASSWORD_DEFAULT), $usuarioId]);

    // Cambiar la contraseña invalida cualquier sesión robada previa.
    session_regenerate_id(true);

    responder(['ok' => true]);
}


// --- GET ?accion=exportar ----------------------------------------------------

if ($accion === 'exportar' && metodo() === 'GET') {
    $formato = campoEnum($_GET, 'formato', ['json', 'csv'], 'json');
    $sello = (new DateTimeImmutable('now'))->format('Ymd-His');

    $movimientos = $pdo->prepare(
        'SELECT t.fecha, t.tipo, c.nombre AS categoria, t.descripcion, t.importe, t.metodo_pago, t.origen
           FROM transacciones t
           JOIN categorias c ON c.id = t.categoria_id
          WHERE t.usuario_id = ?
          ORDER BY t.fecha DESC, t.id DESC'
    );
    $movimientos->execute([$usuarioId]);
    $filas = $movimientos->fetchAll();

    if ($formato === 'csv') {
        if (!headers_sent()) {
            header('Content-Type: text/csv; charset=utf-8');
            header("Content-Disposition: attachment; filename=\"eurcontroller-{$sello}.csv\"");
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
        }
        $salida = fopen('php://output', 'w');
        fwrite($salida, "\xEF\xBB\xBF");   // BOM, para que Excel respete los acentos
        fputcsv($salida, ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Importe', 'Método de pago', 'Origen'], ';');
        foreach ($filas as $f) {
            fputcsv($salida, [
                $f['fecha'], $f['tipo'], $f['categoria'], $f['descripcion'] ?? '',
                number_format((float) $f['importe'], 2, ',', ''), $f['metodo_pago'], $f['origen'],
            ], ';');
        }
        fclose($salida);
        exit;
    }

    $consulta = static function (string $sql) use ($pdo, $usuarioId): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$usuarioId]);
        return $stmt->fetchAll();
    };

    if (!headers_sent()) {
        header("Content-Disposition: attachment; filename=\"eurcontroller-{$sello}.json\"");
    }
    responder([
        'exportado_en' => (new DateTimeImmutable('now'))->format(DATE_ATOM),
        'usuario'      => $consulta('SELECT email, nombre, moneda, creado_en FROM usuarios WHERE id = ?')[0] ?? null,
        'categorias'   => $consulta('SELECT nombre, tipo, color, icono, archivada FROM categorias WHERE usuario_id = ? ORDER BY tipo, nombre'),
        'movimientos'  => $filas,
        'presupuestos' => $consulta(
            'SELECT p.periodo, c.nombre AS categoria, p.importe
               FROM presupuestos p JOIN categorias c ON c.id = p.categoria_id
              WHERE p.usuario_id = ? ORDER BY p.periodo DESC, c.nombre'
        ),
        'recurrentes'  => $consulta(
            'SELECT r.concepto, r.tipo, c.nombre AS categoria, r.importe, r.frecuencia, r.proxima_fecha, r.activa
               FROM recurrentes r JOIN categorias c ON c.id = r.categoria_id
              WHERE r.usuario_id = ? ORDER BY r.concepto'
        ),
        'objetivos'    => $consulta('SELECT nombre, monto_objetivo, fecha_limite, estado FROM objetivos WHERE usuario_id = ? ORDER BY id'),
        'aportaciones' => $consulta(
            'SELECT o.nombre AS objetivo, a.fecha, a.importe, a.nota
               FROM aportaciones a JOIN objetivos o ON o.id = a.objetivo_id
              WHERE a.usuario_id = ? ORDER BY a.fecha DESC'
        ),
    ]);
}


// --- DELETE ?accion=eliminar -------------------------------------------------

if ($accion === 'eliminar' && metodo() === 'DELETE') {
    $datos = cuerpo();
    $clave = (string) ($datos['password'] ?? '');

    $stmt = $pdo->prepare('SELECT password_hash FROM usuarios WHERE id = ?');
    $stmt->execute([$usuarioId]);

    if (!password_verify($clave, (string) $stmt->fetchColumn())) {
        throw new ErrorApi('La contraseña no es correcta', 403);
    }

    $pdo->beginTransaction();
    try {
        borrarDatosUsuario($usuarioId);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $_SESSION = [];
    session_destroy();

    responder(['ok' => true]);
}


throw new ErrorApi('Acción no encontrada', 404);
