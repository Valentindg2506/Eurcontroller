<?php
$DB_HOST = 'localhost';
$DB_NAME = 'gastos_pwa';
$DB_USER = 'usuario_mysql';
$DB_PASS = 'password_mysql_segura';

function obtenerConexion() {
    global $DB_HOST, $DB_NAME, $DB_USER, $DB_PASS;

    $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4";

    try {
        $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error de conexión a la base de datos']);
        exit;
    }
}

function iniciarSesionSegura() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start([
            'cookie_httponly' => true,
            'cookie_secure' => isset($_SERVER['HTTPS']),
            'cookie_samesite' => 'Lax',
        ]);
    }
}

header('Content-Type: application/json; charset=utf-8');

function responderJson($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}
?>
