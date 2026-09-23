<?php
declare(strict_types=1);

/**
 * Presupuestos mensuales por categoría de gasto.
 *
 *   GET    ?periodo=AAAA-MM        → categorías de gasto con su presupuesto y lo gastado
 *   PUT                            → fija (o actualiza) el presupuesto de una categoría
 *   DELETE ?categoria_id&periodo   → elimina el presupuesto de una categoría
 *   POST   ?accion=copiar          → copia los presupuestos de un mes a otro
 */

require_once __DIR__ . '/config.php';

$usuarioId = exigirSesionValida();
$pdo = db();

if ((string) ($_GET['accion'] ?? '') === 'copiar' && metodo() === 'POST') {
    $datos  = cuerpo();
    $origen  = campoPeriodo($datos, 'origen');
    $destino = campoPeriodo($datos, 'destino');

    if ($origen === $destino) {
        throw new ErrorApi('El mes de origen y el de destino no pueden ser el mismo', 422);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO presupuestos (usuario_id, categoria_id, periodo, importe)
         SELECT usuario_id, categoria_id, ?, importe
           FROM presupuestos
          WHERE usuario_id = ? AND periodo = ?
         ON DUPLICATE KEY UPDATE importe = VALUES(importe)'
    );
    $stmt->execute([$destino, $usuarioId, $origen]);

    responder(['ok' => true, 'copiados' => $stmt->rowCount()]);
}

switch (metodo()) {

    case 'GET':
        $periodo = campoPeriodo($_GET);
        $inicio  = $periodo . '-01';
        $fin     = (new DateTimeImmutable($inicio))->modify('last day of this month')->format('Y-m-d');

        $stmt = $pdo->prepare(
            'SELECT c.id AS categoria_id, c.nombre, c.color, c.icono, c.archivada,
                    COALESCE(p.importe, 0) AS presupuesto,
                    COALESCE(g.gastado, 0) AS gastado
               FROM categorias c
               LEFT JOIN presupuestos p
                      ON p.categoria_id = c.id AND p.usuario_id = c.usuario_id AND p.periodo = ?
               LEFT JOIN (
                     SELECT categoria_id, SUM(importe) AS gastado
                       FROM transacciones
                      WHERE usuario_id = ? AND tipo = "gasto" AND fecha BETWEEN ? AND ?
                      GROUP BY categoria_id
                   ) g ON g.categoria_id = c.id
              WHERE c.usuario_id = ? AND c.tipo = "gasto"
              ORDER BY c.archivada, (p.importe IS NULL), c.nombre'
        );
        $stmt->execute([$periodo, $usuarioId, $inicio, $fin, $usuarioId]);

        $items = [];
        $totalPresupuestado = 0.0;
        $totalGastado = 0.0;

        foreach ($stmt->fetchAll() as $fila) {
            $presupuesto = round((float) $fila['presupuesto'], 2);
            $gastado     = round((float) $fila['gastado'], 2);

            // Las categorías archivadas sin presupuesto ni gasto no aportan nada.
            if ($fila['archivada'] && $presupuesto === 0.0 && $gastado === 0.0) {
                continue;
            }

            $totalPresupuestado += $presupuesto;
            $totalGastado       += $gastado;

            $items[] = [
                'categoria_id' => (int) $fila['categoria_id'],
                'nombre'       => $fila['nombre'],
                'color'        => $fila['color'],
                'icono'        => $fila['icono'],
                'archivada'    => (bool) $fila['archivada'],
                'presupuesto'  => $presupuesto,
                'gastado'      => $gastado,
                'restante'     => round($presupuesto - $gastado, 2),
                'uso'          => $presupuesto > 0 ? round($gastado / $presupuesto, 4) : null,
            ];
        }

        responder([
            'periodo' => $periodo,
            'items'   => $items,
            'totales' => [
                'presupuestado' => round($totalPresupuestado, 2),
                'gastado'       => round($totalGastado, 2),
                'restante'      => round($totalPresupuestado - $totalGastado, 2),
                'excedidas'     => count(array_filter(
                    $items,
                    static fn(array $i): bool => $i['presupuesto'] > 0 && $i['gastado'] > $i['presupuesto']
                )),
            ],
        ]);

    case 'PUT':
        $datos       = cuerpo();
        $categoriaId = (int) campoEntero($datos, 'categoria_id', true, 'categoría');
        $periodo     = campoPeriodo($datos);
        $importe     = campoImporte($datos);

        categoriaDelUsuario($usuarioId, $categoriaId, 'gasto');

        $pdo->prepare(
            'INSERT INTO presupuestos (usuario_id, categoria_id, periodo, importe) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE importe = VALUES(importe)'
        )->execute([$usuarioId, $categoriaId, $periodo, $importe]);

        responder(['ok' => true]);

    case 'DELETE':
        $categoriaId = (int) campoEntero($_GET, 'categoria_id', true, 'categoría');
        $periodo     = campoPeriodo($_GET);

        $stmt = $pdo->prepare('DELETE FROM presupuestos WHERE usuario_id = ? AND categoria_id = ? AND periodo = ?');
        $stmt->execute([$usuarioId, $categoriaId, $periodo]);

        responder(['ok' => true, 'eliminados' => $stmt->rowCount()]);

    default:
        metodoNoPermitido('GET', 'PUT', 'DELETE', 'POST');
}
