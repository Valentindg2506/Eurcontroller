<?php
declare(strict_types=1);

/**
 * Categorías del usuario.
 *
 *   GET                 → listado (con nº de movimientos y gasto acumulado)
 *   POST                → alta
 *   PUT    ?id={id}     → edición (nombre, color, icono, archivada)
 *   DELETE ?id={id}     → baja; si tiene movimientos se archiva en lugar de borrar
 */

require_once __DIR__ . '/config.php';

$usuarioId = exigirSesionValida();
$pdo = db();

switch (metodo()) {

    case 'GET':
        $stmt = $pdo->prepare(
            'SELECT c.id, c.nombre, c.tipo, c.color, c.icono, c.archivada,
                    COUNT(t.id)                AS movimientos,
                    COALESCE(SUM(t.importe),0) AS total
               FROM categorias c
               LEFT JOIN transacciones t ON t.categoria_id = c.id
              WHERE c.usuario_id = ?
              GROUP BY c.id
              ORDER BY c.archivada, c.tipo, c.nombre'
        );
        $stmt->execute([$usuarioId]);

        $items = array_map(static fn(array $c): array => [
            'id'           => (int) $c['id'],
            'nombre'       => $c['nombre'],
            'tipo'         => $c['tipo'],
            'color'        => $c['color'],
            'icono'        => $c['icono'],
            'archivada'    => (bool) $c['archivada'],
            'movimientos'  => (int) $c['movimientos'],
            'total'        => round((float) $c['total'], 2),
        ], $stmt->fetchAll());

        responder(['items' => $items]);

    case 'POST':
        $datos = cuerpo();
        $nombre = (string) campoTexto($datos, 'nombre', 80, true, 'nombre');
        $tipo   = campoEnum($datos, 'tipo', TIPOS, 'gasto');
        $color  = campoColor($datos, 'color', PALETA[0]);
        $icono  = (string) campoTexto($datos, 'icono', 32, false, 'icono') ?: 'etiqueta';

        try {
            $stmt = $pdo->prepare(
                'INSERT INTO categorias (usuario_id, nombre, tipo, color, icono) VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$usuarioId, $nombre, $tipo, $color, $icono]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062) {
                throw new ErrorApi("Ya tienes una categoría de {$tipo} llamada «{$nombre}»", 409);
            }
            throw $e;
        }

        responder(['ok' => true, 'id' => (int) $pdo->lastInsertId()], 201);

    case 'PUT':
        $id = campoEntero($_GET, 'id', true, 'id');
        $actual = categoriaDelUsuario($usuarioId, (int) $id);
        $datos = cuerpo();

        $nombre    = (string) campoTexto($datos, 'nombre', 80, true, 'nombre');
        $color     = campoColor($datos, 'color', $actual['color']);
        $icono     = (string) campoTexto($datos, 'icono', 32, false, 'icono') ?: $actual['icono'];
        $archivada = !empty($datos['archivada']) ? 1 : 0;

        try {
            $stmt = $pdo->prepare(
                'UPDATE categorias SET nombre = ?, color = ?, icono = ?, archivada = ?
                  WHERE id = ? AND usuario_id = ?'
            );
            $stmt->execute([$nombre, $color, $icono, $archivada, $id, $usuarioId]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062) {
                throw new ErrorApi("Ya tienes otra categoría llamada «{$nombre}»", 409);
            }
            throw $e;
        }

        responder(['ok' => true]);

    case 'DELETE':
        $id = (int) campoEntero($_GET, 'id', true, 'id');
        categoriaDelUsuario($usuarioId, $id);

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM transacciones WHERE categoria_id = ? AND usuario_id = ?');
        $stmt->execute([$id, $usuarioId]);
        $movimientos = (int) $stmt->fetchColumn();

        // Borrar arrastraría el histórico: se archiva y deja de ofrecerse en los
        // formularios, pero los movimientos pasados siguen siendo consultables.
        if ($movimientos > 0) {
            $pdo->prepare('UPDATE categorias SET archivada = 1 WHERE id = ? AND usuario_id = ?')
                ->execute([$id, $usuarioId]);
            responder([
                'ok'       => true,
                'archivada' => true,
                'mensaje'  => "La categoría tiene {$movimientos} movimiento(s), así que se ha archivado en lugar de borrarse.",
            ]);
        }

        $pdo->prepare('DELETE FROM categorias WHERE id = ? AND usuario_id = ?')->execute([$id, $usuarioId]);
        responder(['ok' => true, 'archivada' => false]);

    default:
        metodoNoPermitido('GET', 'POST', 'PUT', 'DELETE');
}
