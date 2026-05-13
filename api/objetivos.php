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
    $stmt = $pdo->prepare('SELECT id, nombre, monto_objetivo, fecha_limite, estado FROM objetivos_ahorro WHERE usuario_id = ? ORDER BY estado, fecha_limite');
    $stmt->execute([$usuario_id]);
    echo json_encode(['items' => $stmt->fetchAll()]);
    exit;
}

if ($metodo === 'POST') {
    $datos = json_decode(file_get_contents('php://input'), true);
    $nombre = trim($datos['nombre'] ?? '');
    $monto_objetivo = (float)($datos['monto_objetivo'] ?? 0);
    $fecha_limite = $datos['fecha_limite'] ?? null;

    if (!$nombre || !$monto_objetivo) {
        http_response_code(400);
        echo json_encode(['error' => 'Datos de objetivo incompletos']);
        exit;
    }

    $stmt = $pdo->prepare('INSERT INTO objetivos_ahorro (usuario_id, nombre, monto_objetivo, fecha_limite) VALUES (?, ?, ?, ?)');
    $stmt->execute([$usuario_id, $nombre, $monto_objetivo, $fecha_limite]);
    echo json_encode(['ok' => true, 'id' => $pdo->lastInsertId()]);
    exit;
}

if ($metodo === 'PUT') {
    parse_str($_SERVER['QUERY_STRING'] ?? '', $query);
    $id = isset($query['id']) ? (int)$query['id'] : 0;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Falta id']);
        exit;
    }
    $datos = json_decode(file_get_contents('php://input'), true);
    $estado = $datos['estado'] ?? null;
    if (!in_array($estado, ['activo','completado','cancelado'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Estado no válido']);
        exit;
    }

    $stmt = $pdo->prepare('UPDATE objetivos_ahorro SET estado = ? WHERE id = ? AND usuario_id = ?');
    $stmt->execute([$estado, $id, $usuario_id]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método no permitido']);
