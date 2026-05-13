<?php
require_once __DIR__ . '/config.php';

iniciarSesionSegura();
$pdo = obtenerConexion();

$metodo = $_SERVER['REQUEST_METHOD'];
$accion = $_GET['accion'] ?? '';

if ($metodo === 'POST' && $accion === 'registro') {
    $datos = json_decode(file_get_contents('php://input'), true);
    $email = trim($datos['email'] ?? '');
    $password = $datos['password'] ?? '';
    $nombre = trim($datos['nombre'] ?? '');

    if (!$email || !$password || !$nombre) {
        http_response_code(400);
        echo json_encode(['error' => 'Faltan campos obligatorios']);
        exit;
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'El email no tiene un formato válido']);
        exit;
    }
    if (strlen($password) < 6) {
        http_response_code(400);
        echo json_encode(['error' => 'La contraseña debe tener al menos 6 caracteres']);
        exit;
    }

    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Ya existe un usuario con ese email']);
        exit;
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('INSERT INTO usuarios (email, password_hash, nombre) VALUES (?, ?, ?)');
    $stmt->execute([$email, $hash, $nombre]);
    $usuario_id = $pdo->lastInsertId();

    $_SESSION['usuario_id'] = $usuario_id;

    echo json_encode(['ok' => true, 'usuario' => [
        'id' => $usuario_id,
        'email' => $email,
        'nombre' => $nombre,
    ]]);
    exit;
}

if ($metodo === 'POST' && $accion === 'login') {
    $datos = json_decode(file_get_contents('php://input'), true);
    $email = trim($datos['email'] ?? '');
    $password = $datos['password'] ?? '';

    if (!$email || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Debes indicar email y contraseña']);
        exit;
    }

    $stmt = $pdo->prepare('SELECT id, password_hash, nombre FROM usuarios WHERE email = ?');
    $stmt->execute([$email]);
    $usuario = $stmt->fetch();

    if (!$usuario || !password_verify($password, $usuario['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Credenciales no válidas']);
        exit;
    }

    $_SESSION['usuario_id'] = $usuario['id'];

    echo json_encode(['ok' => true, 'usuario' => [
        'id' => $usuario['id'],
        'email' => $email,
        'nombre' => $usuario['nombre'],
    ]]);
    exit;
}

if ($metodo === 'POST' && $accion === 'logout') {
    session_destroy();
    echo json_encode(['ok' => true]);
    exit;
}

if ($metodo === 'GET' && $accion === 'yo') {
    if (!isset($_SESSION['usuario_id'])) {
        echo json_encode(['autenticado' => false]);
        exit;
    }

    $stmt = $pdo->prepare('SELECT id, email, nombre, moneda_preferida FROM usuarios WHERE id = ?');
    $stmt->execute([$_SESSION['usuario_id']]);
    $u = $stmt->fetch();
    echo json_encode(['autenticado' => true, 'usuario' => $u]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Ruta no encontrada']);
