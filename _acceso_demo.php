<?php
require_once __DIR__ . '/api/config.php';
iniciarSesion();
$stmt = db()->prepare('SELECT id FROM usuarios WHERE email = ?');
$stmt->execute(['demo@eurcontroller.test']);
$_SESSION['usuario_id'] = (int) $stmt->fetchColumn();
$_SESSION['csrf'] = bin2hex(random_bytes(32));
header('Location: ./');
