<?php
require_once __DIR__ . '/config.php';

iniciarSesionSegura();
if (!isset($_SESSION['usuario_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado']);
    exit;
}

$pdo = obtenerConexion();
$usuario_id = $_SESSION['usuario_id'];
$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'GET') {
    $desde = $_GET['desde'] ?? null;
    $hasta = $_GET['hasta'] ?? null;
    $tipo = $_GET['tipo'] ?? null;
    $categoria_id = $_GET['categoria_id'] ?? null;

    $sql = 'SELECT t.id, t.tipo, t.fecha, t.importe, t.descripcion, t.metodo_pago, t.creado_offline,
                   c.nombre AS categoria_nombre
            FROM transacciones t
            JOIN categorias c ON c.id = t.categoria_id
            WHERE t.usuario_id = ?';
    $params = [$usuario_id];

    if ($desde) { $sql .= ' AND t.fecha >= ?'; $params[] = $desde; }
    if ($hasta) { $sql .= ' AND t.fecha <= ?'; $params[] = $hasta; }
    if ($tipo && in_array($tipo, ['gasto','ingreso'])) { $sql .= ' AND t.tipo = ?'; $params[] = $tipo; }
    if ($categoria_id) { $sql .= ' AND t.categoria_id = ?'; $params[] = $categoria_id; }

    $sql .= ' ORDER BY t.fecha DESC, t.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $transacciones = $stmt->fetchAll();

    echo json_encode(['items' => $transacciones]);
    exit;
}

if ($metodo === 'POST') {
    $datos = json_decode(file_get_contents('php://input'), true);
    $tipo = $datos['tipo'] ?? '';
    $categoria_id = (int)($datos['categoria_id'] ?? 0);
    $fecha = $datos['fecha'] ?? '';
    $importe = (float)($datos['importe'] ?? 0);
    $descripcion = $datos['descripcion'] ?? null;
    $metodo_pago = $datos['metodo_pago'] ?? null;
    $creado_offline = !empty($datos['creado_offline']) ? 1 : 0;

    if (!in_array($tipo, ['gasto','ingreso']) || !$categoria_id || !$fecha || !$importe) {
        http_response_code(400);
        echo json_encode(['error' => 'Datos de transacción incompletos']);
        exit;
    }

    $stmt = $pdo->prepare('INSERT INTO transacciones (usuario_id, categoria_id, tipo, fecha, importe, descripcion, metodo_pago, creado_offline)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$usuario_id, $categoria_id, $tipo, $fecha, $importe, $descripcion, $metodo_pago, $creado_offline]);

    echo json_encode(['ok' => true, 'id' => $pdo->lastInsertId()]);
    exit;
}

if ($metodo === 'DELETE') {
    parse_str($_SERVER['QUERY_STRING'] ?? '', $query);
    $id = isset($query['id']) ? (int)$query['id'] : 0;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Falta id']);
        exit;
    }
    $stmt = $pdo->prepare('DELETE FROM transacciones WHERE id = ? AND usuario_id = ?');
    $stmt->execute([$id, $usuario_id]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método no permitido']);
