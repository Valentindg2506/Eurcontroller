<?php
require_once __DIR__ . '/../api/config.php';
$pdo = db();
$email = 'demo@eurcontroller.test';

$stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
$stmt->execute([$email]);
$uid = $stmt->fetchColumn();

if (!$uid) die("No demo user");

$uid = (int) $uid;

function dumpTable($pdo, $table, $where) {
    $stmt = $pdo->query("SELECT * FROM $table WHERE $where");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $out = "";
    foreach($rows as $row) {
        $cols = array_keys($row);
        // Do not insert ID if it's auto_increment and we want fresh IDs? 
        // No, we need relationships. Let's offset the IDs by 90000 to avoid clashes.
        $safeVals = array_map(function($k, $v) use ($pdo) {
            if ($v === null) return 'NULL';
            if ($k === 'id' || str_ends_with($k, '_id')) {
                // Apply offset to IDs to avoid production collisions
                return (int)$v + 90000;
            }
            return $pdo->quote((string)$v);
        }, array_keys($row), array_values($row));
        $out .= "INSERT INTO `$table` (`" . implode("`, `", $cols) . "`) VALUES (" . implode(", ", $safeVals) . ");\n";
    }
    return $out;
}

$sql = "-- Archivo SQL generado para crear el usuario demo en producción\n";
$sql .= "SET FOREIGN_KEY_CHECKS = 0;\n";
$sql .= "DELETE FROM usuarios WHERE email = '$email';\n\n";

$sql .= dumpTable($pdo, 'usuarios', "id = $uid");
$sql .= dumpTable($pdo, 'categorias', "usuario_id = $uid");
$sql .= dumpTable($pdo, 'presupuestos', "usuario_id = $uid");
$sql .= dumpTable($pdo, 'recurrentes', "usuario_id = $uid");
$sql .= dumpTable($pdo, 'transacciones', "usuario_id = $uid");
$sql .= dumpTable($pdo, 'objetivos', "usuario_id = $uid");
$sql .= dumpTable($pdo, 'aportaciones', "usuario_id = $uid");

$sql .= "\nSET FOREIGN_KEY_CHECKS = 1;\n";

file_put_contents(__DIR__ . '/demo_produccion.sql', $sql);
echo "OK";
