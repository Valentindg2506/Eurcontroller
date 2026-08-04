<?php
declare(strict_types=1);

/**
 * Movimientos recurrentes (gastos fijos, nóminas, suscripciones).
 *
 *   GET               → listado con la próxima fecha de cargo
 *   POST              → alta
 *   PUT    ?id={id}   → edición
 *   DELETE ?id={id}   → baja
 *
 * El servidor los materializa como transacciones al consultar la API
 * (ver generarRecurrentesPendientes() en config.php).
 */

require_once __DIR__ . '/config.php';

$usuarioId = exigirSesionValida();
$pdo = db();

/** Importe equivalente al mes, para poder sumar frecuencias distintas. */
function importeMensualizado(float $importe, string $frecuencia): float
{
    return round($importe * match ($frecuencia) {
        'semanal'    => 52 / 12,
        'trimestral' => 1 / 3,
        'anual'      => 1 / 12,
        default      => 1,
    }, 2);
}

switch (metodo()) {

    case 'GET':
        generarRecurrentesPendientes($usuarioId);

        $stmt = $pdo->prepare(
            'SELECT r.id, r.categoria_id, r.tipo, r.concepto, r.importe, r.metodo_pago,
                    r.frecuencia, r.proxima_fecha, r.fecha_fin, r.activa,
                    c.nombre AS categoria, c.color, c.icono
               FROM recurrentes r
               JOIN categorias c ON c.id = r.categoria_id
              WHERE r.usuario_id = ?
              ORDER BY r.activa DESC, r.proxima_fecha, r.id'
        );
        $stmt->execute([$usuarioId]);

        $items = [];
        $gastoMensual = 0.0;
        $ingresoMensual = 0.0;

        foreach ($stmt->fetchAll() as $r) {
            $importe = round((float) $r['importe'], 2);
            $mensual = importeMensualizado($importe, $r['frecuencia']);

            if ($r['activa']) {
                if ($r['tipo'] === 'gasto') {
                    $gastoMensual += $mensual;
                } else {
                    $ingresoMensual += $mensual;
                }
            }

            $items[] = [
                'id'            => (int) $r['id'],
                'categoria_id'  => (int) $r['categoria_id'],
                'categoria'     => $r['categoria'],
                'color'         => $r['color'],
                'icono'         => $r['icono'],
                'tipo'          => $r['tipo'],
                'concepto'      => $r['concepto'],
                'importe'       => $importe,
                'mensualizado'  => $mensual,
                'metodo_pago'   => $r['metodo_pago'],
                'frecuencia'    => $r['frecuencia'],
                'proxima_fecha' => $r['proxima_fecha'],
                'fecha_fin'     => $r['fecha_fin'],
                'activa'        => (bool) $r['activa'],
            ];
        }

        responder([
            'items'   => $items,
            'totales' => [
                'gasto_mensual'   => round($gastoMensual, 2),
                'ingreso_mensual' => round($ingresoMensual, 2),
                'neto_mensual'    => round($ingresoMensual - $gastoMensual, 2),
            ],
        ]);

    case 'POST':
    case 'PUT':
        $datos       = cuerpo();
        $tipo        = campoEnum($datos, 'tipo', TIPOS);
        $categoriaId = (int) campoEntero($datos, 'categoria_id', true, 'categoría');
        $concepto    = (string) campoTexto($datos, 'concepto', 120, true, 'concepto');
        $importe     = campoImporte($datos);
        $metodoPago  = campoEnum($datos, 'metodo_pago', METODOS_PAGO, 'domiciliado');
        $frecuencia  = campoEnum($datos, 'frecuencia', FRECUENCIAS, 'mensual');
        $proxima     = (string) campoFecha($datos, 'proxima_fecha', true, 'próximo cargo');
        $fin         = campoFecha($datos, 'fecha_fin', false, 'fecha de fin');
        $activa      = array_key_exists('activa', $datos) ? (!empty($datos['activa']) ? 1 : 0) : 1;

        if ($fin !== null && $fin < $proxima) {
            throw new ErrorApi('La fecha de fin no puede ser anterior al próximo cargo', 422);
        }
        categoriaDelUsuario($usuarioId, $categoriaId, $tipo);

        if (metodo() === 'POST') {
            $pdo->prepare(
                'INSERT INTO recurrentes
                    (usuario_id, categoria_id, tipo, concepto, importe, metodo_pago, frecuencia, proxima_fecha, fecha_fin, activa)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([$usuarioId, $categoriaId, $tipo, $concepto, $importe,
                        $metodoPago, $frecuencia, $proxima, $fin, $activa]);

            responder(['ok' => true, 'id' => (int) $pdo->lastInsertId()], 201);
        }

        $id = (int) campoEntero($_GET, 'id', true, 'id');
        $stmt = $pdo->prepare(
            'UPDATE recurrentes
                SET categoria_id = ?, tipo = ?, concepto = ?, importe = ?, metodo_pago = ?,
                    frecuencia = ?, proxima_fecha = ?, fecha_fin = ?, activa = ?
              WHERE id = ? AND usuario_id = ?'
        );
        $stmt->execute([$categoriaId, $tipo, $concepto, $importe, $metodoPago,
                        $frecuencia, $proxima, $fin, $activa, $id, $usuarioId]);

        if ($stmt->rowCount() === 0) {
            $existe = $pdo->prepare('SELECT 1 FROM recurrentes WHERE id = ? AND usuario_id = ?');
            $existe->execute([$id, $usuarioId]);
            if (!$existe->fetchColumn()) {
                throw new ErrorApi('El movimiento recurrente no existe', 404);
            }
        }

        responder(['ok' => true]);

    case 'DELETE':
        $id = (int) campoEntero($_GET, 'id', true, 'id');
        $stmt = $pdo->prepare('DELETE FROM recurrentes WHERE id = ? AND usuario_id = ?');
        $stmt->execute([$id, $usuarioId]);

        if ($stmt->rowCount() === 0) {
            throw new ErrorApi('El movimiento recurrente no existe', 404);
        }
        responder(['ok' => true]);

    default:
        metodoNoPermitido('GET', 'POST', 'PUT', 'DELETE');
}
