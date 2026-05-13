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
    $stmt = $pdo->prepare('SELECT id, nombre, tipo, es_recurrente FROM categorias WHERE usuario_id = ? ORDER BY tipo, nombre');
    $stmt->execute([$usuario_id]);
    echo json_encode(['items' => $stmt->fetchAll()]);
    exit;
}

if ($metodo === 'POST') {
    $datos = json_decode(file_get_contents('php://input'), true);
    $nombre = trim($datos['nombre'] ?? '');
    $tipo = $datos['tipo'] ?? 'gasto';
    $es_recurrente = !empty($datos['es_recurrente']) ? 1 : 0;

    if (!$nombre || !in_array($tipo, ['gasto','ingreso'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Datos de categoría no válidos']);
        exit;
    }

    $stmt = $pdo->prepare('INSERT INTO categorias (usuario_id, nombre, tipo, es_recurrente) VALUES (?, ?, ?, ?)');
    $stmt->execute([$usuario_id, $nombre, $tipo, $es_recurrente]);
    echo json_encode(['ok' => true, 'id' => $pdo->lastInsertId()]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método no permitido']);
