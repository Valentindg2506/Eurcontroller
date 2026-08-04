<?php
declare(strict_types=1);

/**
 * Movimientos (gastos e ingresos).
 *
 *   GET               → listado paginado con filtros y totales del filtro
 *   POST              → alta (idempotente si se envía uid_local)
 *   PUT    ?id={id}   → edición
 *   DELETE ?id={id}   → baja
 *
 * Filtros admitidos en GET: desde, hasta, tipo, categoria_id, metodo_pago,
 * buscar, pagina, por_pagina.
 */

require_once __DIR__ . '/config.php';

$usuarioId = exigirSesionValida();
$pdo = db();

/** Escapa los comodines de LIKE para que el texto buscado sea literal. */
function comodinLike(string $texto): string
{
    return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $texto) . '%';
}

/** Traduce los filtros de la query string a un WHERE parametrizado. */
function filtrosTransacciones(int $usuarioId): array
{
    $sql = ' WHERE t.usuario_id = ?';
    $params = [$usuarioId];

    if (!empty($_GET['desde'])) {
        $sql .= ' AND t.fecha >= ?';
        $params[] = normalizarFecha((string) $_GET['desde'], 'desde');
    }
    if (!empty($_GET['hasta'])) {
        $sql .= ' AND t.fecha <= ?';
        $params[] = normalizarFecha((string) $_GET['hasta'], 'hasta');
    }
    if (!empty($_GET['tipo'])) {
        $sql .= ' AND t.tipo = ?';
        $params[] = campoEnum($_GET, 'tipo', TIPOS);
    }
    if (!empty($_GET['metodo_pago'])) {
        $sql .= ' AND t.metodo_pago = ?';
        $params[] = campoEnum($_GET, 'metodo_pago', METODOS_PAGO);
    }
    if (!empty($_GET['categoria_id'])) {
        $sql .= ' AND t.categoria_id = ?';
        $params[] = (int) campoEntero($_GET, 'categoria_id', true, 'categoria_id');
    }
    if (isset($_GET['buscar']) && trim((string) $_GET['buscar']) !== '') {
        $patron = comodinLike(trim((string) $_GET['buscar']));
        $sql .= ' AND (t.descripcion LIKE ? ESCAPE \'\\\\\' OR c.nombre LIKE ? ESCAPE \'\\\\\')';
        $params[] = $patron;
        $params[] = $patron;
    }

    return [$sql, $params];
}

switch (metodo()) {

    case 'GET':
        // Los movimientos recurrentes vencidos se materializan al consultar,
        // así el listado siempre está al día sin necesitar un cron.
        $generados = generarRecurrentesPendientes($usuarioId);

        [$where, $params] = filtrosTransacciones($usuarioId);
        $desde = 'FROM transacciones t JOIN categorias c ON c.id = t.categoria_id';

        $stmt = $pdo->prepare(
            "SELECT COUNT(*) AS n,
                    COALESCE(SUM(CASE WHEN t.tipo = 'ingreso' THEN t.importe END), 0) AS ingresos,
                    COALESCE(SUM(CASE WHEN t.tipo = 'gasto'   THEN t.importe END), 0) AS gastos
               {$desde}{$where}"
        );
        $stmt->execute($params);
        $agregados = $stmt->fetch();

        $total      = (int) $agregados['n'];
        $porPagina  = min(max((int) ($_GET['por_pagina'] ?? 50), 1), PAGINA_MAX);
        $paginas    = max(1, (int) ceil($total / $porPagina));
        $pagina     = min(max((int) ($_GET['pagina'] ?? 1), 1), $paginas);
        $offset     = ($pagina - 1) * $porPagina;

        $stmt = $pdo->prepare(
            "SELECT t.id, t.tipo, t.fecha, t.importe, t.descripcion, t.metodo_pago, t.origen,
                    t.categoria_id, c.nombre AS categoria, c.color, c.icono
               {$desde}{$where}
              ORDER BY t.fecha DESC, t.id DESC
              LIMIT {$porPagina} OFFSET {$offset}"
        );
        $stmt->execute($params);

        $items = array_map(static fn(array $t): array => [
            'id'           => (int) $t['id'],
            'tipo'         => $t['tipo'],
            'fecha'        => $t['fecha'],
            'importe'      => round((float) $t['importe'], 2),
            'descripcion'  => $t['descripcion'],
            'metodo_pago'  => $t['metodo_pago'],
            'origen'       => $t['origen'],
            'categoria_id' => (int) $t['categoria_id'],
            'categoria'    => $t['categoria'],
            'color'        => $t['color'],
            'icono'        => $t['icono'],
        ], $stmt->fetchAll());

        $ingresos = round((float) $agregados['ingresos'], 2);
        $gastos   = round((float) $agregados['gastos'], 2);

        responder([
            'items'   => $items,
            'total'   => $total,
            'pagina'  => $pagina,
            'paginas' => $paginas,
            'totales' => [
                'ingresos' => $ingresos,
                'gastos'   => $gastos,
                'saldo'    => round($ingresos - $gastos, 2),
            ],
            'recurrentes_generados' => $generados,
        ]);

    case 'POST':
        $datos = cuerpo();

        $tipo        = campoEnum($datos, 'tipo', TIPOS);
        $categoriaId = (int) campoEntero($datos, 'categoria_id', true, 'categoría');
        $fecha       = (string) campoFecha($datos, 'fecha');
        $importe     = campoImporte($datos);
        $descripcion = campoTexto($datos, 'descripcion', 180, false, 'descripción');
        $metodoPago  = campoEnum($datos, 'metodo_pago', METODOS_PAGO, 'tarjeta');
        $uidLocal    = campoTexto($datos, 'uid_local', 36, false, 'uid_local');
        $origen      = $uidLocal !== null ? 'offline' : 'manual';

        categoriaDelUsuario($usuarioId, $categoriaId, $tipo);

        // Con uid_local el alta es idempotente: la cola offline puede reenviar
        // el mismo movimiento sin llegar a duplicarlo.
        $stmt = $pdo->prepare(
            'INSERT INTO transacciones
                (usuario_id, categoria_id, tipo, fecha, importe, descripcion, metodo_pago, origen, uid_local)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        try {
            $stmt->execute([$usuarioId, $categoriaId, $tipo, $fecha, $importe,
                            $descripcion, $metodoPago, $origen, $uidLocal]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062 && $uidLocal !== null) {
                $ya = $pdo->prepare('SELECT id FROM transacciones WHERE usuario_id = ? AND uid_local = ?');
                $ya->execute([$usuarioId, $uidLocal]);
                responder(['ok' => true, 'id' => (int) $ya->fetchColumn(), 'duplicado' => true]);
            }
            throw $e;
        }

        responder(['ok' => true, 'id' => (int) $pdo->lastInsertId()], 201);

    case 'PUT':
        $id = (int) campoEntero($_GET, 'id', true, 'id');
        $datos = cuerpo();

        $tipo        = campoEnum($datos, 'tipo', TIPOS);
        $categoriaId = (int) campoEntero($datos, 'categoria_id', true, 'categoría');
        $fecha       = (string) campoFecha($datos, 'fecha');
        $importe     = campoImporte($datos);
        $descripcion = campoTexto($datos, 'descripcion', 180, false, 'descripción');
        $metodoPago  = campoEnum($datos, 'metodo_pago', METODOS_PAGO, 'tarjeta');

        categoriaDelUsuario($usuarioId, $categoriaId, $tipo);

        $stmt = $pdo->prepare(
            'UPDATE transacciones
                SET tipo = ?, categoria_id = ?, fecha = ?, importe = ?, descripcion = ?, metodo_pago = ?
              WHERE id = ? AND usuario_id = ?'
        );
        $stmt->execute([$tipo, $categoriaId, $fecha, $importe, $descripcion, $metodoPago, $id, $usuarioId]);

        if ($stmt->rowCount() === 0) {
            // rowCount() es 0 tanto si no existe como si no cambió nada: hay que distinguirlo.
            $existe = $pdo->prepare('SELECT 1 FROM transacciones WHERE id = ? AND usuario_id = ?');
            $existe->execute([$id, $usuarioId]);
            if (!$existe->fetchColumn()) {
                throw new ErrorApi('El movimiento no existe', 404);
            }
        }

        responder(['ok' => true]);

    case 'DELETE':
        $id = (int) campoEntero($_GET, 'id', true, 'id');
        $stmt = $pdo->prepare('DELETE FROM transacciones WHERE id = ? AND usuario_id = ?');
        $stmt->execute([$id, $usuarioId]);

        if ($stmt->rowCount() === 0) {
            throw new ErrorApi('El movimiento no existe', 404);
        }
        responder(['ok' => true]);

    default:
        metodoNoPermitido('GET', 'POST', 'PUT', 'DELETE');
}
