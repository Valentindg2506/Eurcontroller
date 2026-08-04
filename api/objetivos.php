<?php
declare(strict_types=1);

/**
 * Objetivos de ahorro y sus aportaciones.
 *
 *   GET                                    → objetivos con acumulado y progreso
 *   GET    ?accion=aportaciones&id={id}    → aportaciones de un objetivo
 *   POST                                   → alta de objetivo
 *   POST   ?accion=aportacion&id={id}      → registrar una aportación
 *   PUT    ?id={id}                        → editar objetivo
 *   DELETE ?id={id}                        → borrar objetivo (y sus aportaciones)
 *   DELETE ?accion=aportacion&id={id}      → borrar una aportación
 *
 * El acumulado siempre se calcula como SUM(aportaciones): no hay contador
 * denormalizado que pueda quedar desincronizado.
 */

require_once __DIR__ . '/config.php';

$usuarioId = exigirSesionValida();
$pdo = db();
$accion = (string) ($_GET['accion'] ?? '');

function objetivoDelUsuario(int $usuarioId, int $objetivoId): array
{
    $stmt = db()->prepare('SELECT * FROM objetivos WHERE id = ? AND usuario_id = ?');
    $stmt->execute([$objetivoId, $usuarioId]);
    $objetivo = $stmt->fetch();
    if (!$objetivo) {
        throw new ErrorApi('El objetivo no existe', 404);
    }
    return $objetivo;
}


// --- Aportaciones ------------------------------------------------------------

if ($accion === 'aportaciones' && metodo() === 'GET') {
    $objetivoId = (int) campoEntero($_GET, 'id', true, 'id');
    objetivoDelUsuario($usuarioId, $objetivoId);

    $stmt = $pdo->prepare(
        'SELECT id, fecha, importe, nota FROM aportaciones
          WHERE objetivo_id = ? AND usuario_id = ?
          ORDER BY fecha DESC, id DESC'
    );
    $stmt->execute([$objetivoId, $usuarioId]);

    responder(['items' => array_map(static fn(array $a): array => [
        'id'      => (int) $a['id'],
        'fecha'   => $a['fecha'],
        'importe' => round((float) $a['importe'], 2),
        'nota'    => $a['nota'],
    ], $stmt->fetchAll())]);
}

if ($accion === 'aportacion' && metodo() === 'POST') {
    $objetivoId = (int) campoEntero($_GET, 'id', true, 'id');
    $objetivo = objetivoDelUsuario($usuarioId, $objetivoId);

    $datos   = cuerpo();
    $importe = campoImporte($datos);
    $fecha   = campoFecha($datos, 'fecha', false) ?? (new DateTimeImmutable('today'))->format('Y-m-d');
    $nota    = campoTexto($datos, 'nota', 160, false, 'nota');

    $pdo->prepare('INSERT INTO aportaciones (objetivo_id, usuario_id, fecha, importe, nota) VALUES (?, ?, ?, ?, ?)')
        ->execute([$objetivoId, $usuarioId, $fecha, $importe, $nota]);

    // Alcanzar la meta marca el objetivo como completado automáticamente.
    $acumulado = $pdo->prepare('SELECT COALESCE(SUM(importe),0) FROM aportaciones WHERE objetivo_id = ?');
    $acumulado->execute([$objetivoId]);
    $total = (float) $acumulado->fetchColumn();

    if ($objetivo['estado'] === 'activo' && $total >= (float) $objetivo['monto_objetivo']) {
        $pdo->prepare('UPDATE objetivos SET estado = "completado" WHERE id = ? AND usuario_id = ?')
            ->execute([$objetivoId, $usuarioId]);
    }

    responder([
        'ok'         => true,
        'id'         => (int) $pdo->lastInsertId(),
        'acumulado'  => round($total, 2),
        'completado' => $total >= (float) $objetivo['monto_objetivo'],
    ], 201);
}

if ($accion === 'aportacion' && metodo() === 'DELETE') {
    $id = (int) campoEntero($_GET, 'id', true, 'id');
    $stmt = $pdo->prepare('DELETE FROM aportaciones WHERE id = ? AND usuario_id = ?');
    $stmt->execute([$id, $usuarioId]);

    if ($stmt->rowCount() === 0) {
        throw new ErrorApi('La aportación no existe', 404);
    }
    responder(['ok' => true]);
}


// --- Objetivos ---------------------------------------------------------------

switch (metodo()) {

    case 'GET':
        $stmt = $pdo->prepare(
            'SELECT o.id, o.nombre, o.monto_objetivo, o.fecha_limite, o.color, o.estado, o.creado_en,
                    COALESCE(SUM(a.importe), 0) AS acumulado,
                    COUNT(a.id)                 AS n_aportaciones
               FROM objetivos o
               LEFT JOIN aportaciones a ON a.objetivo_id = o.id
              WHERE o.usuario_id = ?
              GROUP BY o.id
              ORDER BY FIELD(o.estado, "activo", "completado", "cancelado"),
                       o.fecha_limite IS NULL, o.fecha_limite, o.id DESC'
        );
        $stmt->execute([$usuarioId]);

        $items = array_map(static function (array $o): array {
            $meta      = round((float) $o['monto_objetivo'], 2);
            $acumulado = round((float) $o['acumulado'], 2);
            return [
                'id'             => (int) $o['id'],
                'nombre'         => $o['nombre'],
                'monto_objetivo' => $meta,
                'acumulado'      => $acumulado,
                'restante'       => round(max(0, $meta - $acumulado), 2),
                'progreso'       => $meta > 0 ? min(1, $acumulado / $meta) : 0,
                'fecha_limite'   => $o['fecha_limite'],
                'color'          => $o['color'],
                'estado'         => $o['estado'],
                'n_aportaciones' => (int) $o['n_aportaciones'],
            ];
        }, $stmt->fetchAll());

        responder(['items' => $items]);

    case 'POST':
        $datos  = cuerpo();
        $nombre = (string) campoTexto($datos, 'nombre', 120, true, 'nombre');
        $monto  = campoImporte($datos, 'monto_objetivo', 'importe objetivo');
        $limite = campoFecha($datos, 'fecha_limite', false, 'fecha límite');
        $color  = campoColor($datos, 'color', '#4a3aa7');

        $pdo->prepare(
            'INSERT INTO objetivos (usuario_id, nombre, monto_objetivo, fecha_limite, color) VALUES (?, ?, ?, ?, ?)'
        )->execute([$usuarioId, $nombre, $monto, $limite, $color]);

        responder(['ok' => true, 'id' => (int) $pdo->lastInsertId()], 201);

    case 'PUT':
        $id = (int) campoEntero($_GET, 'id', true, 'id');
        $actual = objetivoDelUsuario($usuarioId, $id);
        $datos = cuerpo();

        $nombre = (string) campoTexto($datos, 'nombre', 120, true, 'nombre');
        $monto  = campoImporte($datos, 'monto_objetivo', 'importe objetivo');
        $limite = campoFecha($datos, 'fecha_limite', false, 'fecha límite');
        $color  = campoColor($datos, 'color', $actual['color']);
        $estado = campoEnum($datos, 'estado', ESTADOS_OBJETIVO, $actual['estado']);

        $pdo->prepare(
            'UPDATE objetivos SET nombre = ?, monto_objetivo = ?, fecha_limite = ?, color = ?, estado = ?
              WHERE id = ? AND usuario_id = ?'
        )->execute([$nombre, $monto, $limite, $color, $estado, $id, $usuarioId]);

        responder(['ok' => true]);

    case 'DELETE':
        $id = (int) campoEntero($_GET, 'id', true, 'id');
        $stmt = $pdo->prepare('DELETE FROM objetivos WHERE id = ? AND usuario_id = ?');
        $stmt->execute([$id, $usuarioId]);

        if ($stmt->rowCount() === 0) {
            throw new ErrorApi('El objetivo no existe', 404);
        }
        responder(['ok' => true]);

    default:
        metodoNoPermitido('GET', 'POST', 'PUT', 'DELETE');
}
