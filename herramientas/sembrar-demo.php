<?php
declare(strict_types=1);

/**
 * Genera una cuenta de demostración con datos realistas de varios meses.
 *
 * Uso:
 *   php herramientas/sembrar-demo.php [email] [contraseña]
 *
 * Por defecto crea demo@eurcontroller.test / DemoEurcontroller1
 * Si la cuenta ya existe, borra sus datos y los vuelve a generar.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Esta herramienta solo puede ejecutarse desde la línea de comandos.\n");
}

require_once __DIR__ . '/../api/config.php';

$email = $argv[1] ?? 'demo@eurcontroller.test';
$clave = $argv[2] ?? 'DemoEurcontroller1';

$pdo = db();
$pdo->beginTransaction();

// Partir de cero: se borra en orden de dependencia (ver borrarDatosUsuario()).
$stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
$stmt->execute([$email]);
$anterior = $stmt->fetchColumn();
if ($anterior !== false) {
    borrarDatosUsuario((int) $anterior);
}

$pdo->prepare('INSERT INTO usuarios (email, password_hash, nombre, moneda) VALUES (?, ?, ?, "EUR")')
    ->execute([$email, password_hash($clave, PASSWORD_DEFAULT), 'Valentín']);
$usuarioId = (int) $pdo->lastInsertId();

crearCategoriasIniciales($usuarioId);

$stmt = $pdo->prepare('SELECT id, nombre, tipo FROM categorias WHERE usuario_id = ?');
$stmt->execute([$usuarioId]);

$categorias = [];
foreach ($stmt->fetchAll() as $c) {
    $categorias[$c['nombre']] = (int) $c['id'];
}

/**
 * Perfil de gasto por categoría: cuántas veces al mes aparece y en qué horquilla
 * de importe, para que las series no parezcan ruido aleatorio.
 *
 * [categoría, vecesAlMes, importeMín, importeMáx, conceptos]
 */
$perfil = [
    ['Alimentación',  9, 12, 78,  ['Supermercado', 'Frutería', 'Compra semanal', 'Panadería', 'Carnicería']],
    ['Transporte',    5,  8, 62,  ['Gasolina', 'Abono transporte', 'Taxi', 'Peaje', 'Parking']],
    ['Ocio',          5, 10, 95,  ['Cena fuera', 'Cine', 'Concierto', 'Cañas', 'Escapada']],
    ['Compras',       3, 18, 145, ['Ropa', 'Zapatillas', 'Libro', 'Regalo', 'Menaje']],
    ['Salud',         1, 20, 85,  ['Farmacia', 'Dentista', 'Óptica']],
    ['Suscripciones', 2,  8, 16,  ['Streaming', 'Música', 'Almacenamiento en la nube']],
    ['Otros gastos',  2,  9, 55,  ['Varios', 'Imprevisto', 'Comisión bancaria']],
];

$metodos = ['tarjeta', 'tarjeta', 'tarjeta', 'efectivo', 'bizum', 'transferencia'];

$insertar = $pdo->prepare(
    'INSERT INTO transacciones
        (usuario_id, categoria_id, tipo, fecha, importe, descripcion, metodo_pago, origen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);

$hoy = new DateTimeImmutable('today');
$movimientos = 0;

// Ocho meses de histórico para que la comparativa anual tenga forma.
for ($atras = 7; $atras >= 0; $atras--) {
    $mes = $hoy->modify("-{$atras} months")->modify('first day of this month');
    $diasMes = (int) $mes->format('t');
    $limite = $atras === 0 ? (int) $hoy->format('j') : $diasMes;

    // Nómina el día 1 de cada mes, con alguna variación por pagas extra.
    $nomina = $atras % 6 === 0 ? 2450.00 : 1980.00 + random_int(-40, 60);
    $insertar->execute([
        $usuarioId, $categorias['Nómina'], 'ingreso',
        $mes->format('Y-m-d'), $nomina, 'Nómina', 'transferencia', 'manual',
    ]);
    $movimientos++;

    // Nunca se generan fechas futuras: el mes en curso se corta en el día de hoy.
    if (random_int(1, 3) === 1 && $limite >= 6) {
        $insertar->execute([
            $usuarioId, $categorias['Otros ingresos'], 'ingreso',
            $mes->modify('+' . (random_int(5, min(20, $limite)) - 1) . ' days')->format('Y-m-d'),
            random_int(60, 340), 'Trabajo puntual', 'bizum', 'manual',
        ]);
        $movimientos++;
    }

    // Alquiler el día 3.
    if ($limite >= 3) {
        $insertar->execute([
            $usuarioId, $categorias['Vivienda'], 'gasto',
            $mes->modify('+2 days')->format('Y-m-d'), 720.00, 'Alquiler', 'domiciliado', 'recurrente',
        ]);
        $movimientos++;
    }

    // El mes en curso lleva solo una parte de los días, así que el número de
    // movimientos se escala en proporción: si no, parecería un mes de excesos.
    $proporcion = $limite / $diasMes;

    foreach ($perfil as [$nombre, $veces, $minimo, $maximo, $conceptos]) {
        $repeticiones = max(0, (int) round($veces * $proporcion) + random_int(-1, 1));
        for ($i = 0; $i < $repeticiones; $i++) {
            $dia = random_int(1, $limite);
            $insertar->execute([
                $usuarioId, $categorias[$nombre], 'gasto',
                $mes->modify('+' . ($dia - 1) . ' days')->format('Y-m-d'),
                random_int($minimo * 100, $maximo * 100) / 100,
                $conceptos[array_rand($conceptos)],
                $metodos[array_rand($metodos)],
                'manual',
            ]);
            $movimientos++;
        }
    }
}

// Presupuestos del mes en curso y del anterior.
$presupuestos = [
    'Alimentación' => 420, 'Vivienda' => 750, 'Transporte' => 180,
    'Ocio' => 220, 'Compras' => 160, 'Suscripciones' => 40,
];

$stmtPresupuesto = $pdo->prepare(
    'INSERT INTO presupuestos (usuario_id, categoria_id, periodo, importe) VALUES (?, ?, ?, ?)'
);
foreach ([$hoy->format('Y-m'), $hoy->modify('-1 month')->format('Y-m')] as $periodo) {
    foreach ($presupuestos as $nombre => $importe) {
        $stmtPresupuesto->execute([$usuarioId, $categorias[$nombre], $periodo, $importe]);
    }
}

// Movimientos fijos.
$stmtRecurrente = $pdo->prepare(
    'INSERT INTO recurrentes
        (usuario_id, categoria_id, tipo, concepto, importe, metodo_pago, frecuencia, proxima_fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
$diaSiguiente = $hoy->modify('first day of next month');
foreach ([
    ['Vivienda',      'gasto',   'Alquiler',            720.00, 'domiciliado', 'mensual',    $diaSiguiente->format('Y-m-d')],
    ['Suscripciones', 'gasto',   'Streaming de vídeo',   12.99, 'tarjeta',     'mensual',    $diaSiguiente->modify('+4 days')->format('Y-m-d')],
    ['Suscripciones', 'gasto',   'Streaming de música',   10.99, 'tarjeta',    'mensual',    $diaSiguiente->modify('+9 days')->format('Y-m-d')],
    ['Salud',         'gasto',   'Seguro médico',         58.40, 'domiciliado', 'trimestral', $hoy->modify('+18 days')->format('Y-m-d')],
    ['Transporte',    'gasto',   'Seguro del coche',     312.00, 'domiciliado', 'anual',      $hoy->modify('+2 months')->format('Y-m-d')],
    ['Nómina',        'ingreso', 'Nómina',              1980.00, 'transferencia', 'mensual',  $diaSiguiente->format('Y-m-d')],
] as [$categoria, $tipo, $concepto, $importe, $metodo, $frecuencia, $proxima]) {
    $stmtRecurrente->execute([
        $usuarioId, $categorias[$categoria], $tipo, $concepto, $importe, $metodo, $frecuencia, $proxima,
    ]);
}

// Objetivos de ahorro con sus aportaciones.
$stmtObjetivo = $pdo->prepare(
    'INSERT INTO objetivos (usuario_id, nombre, monto_objetivo, fecha_limite, color, estado) VALUES (?, ?, ?, ?, ?, ?)'
);
$stmtAportacion = $pdo->prepare(
    'INSERT INTO aportaciones (objetivo_id, usuario_id, fecha, importe, nota) VALUES (?, ?, ?, ?, ?)'
);

foreach ([
    ['Viaje a Japón',        4200, $hoy->modify('+10 months')->format('Y-m-d'), '#7a6aa0', 'activo',      6, 210],
    ['Colchón de seguridad', 6000, null,                                        '#5a8a5c', 'activo',      8, 300],
    ['Portátil nuevo',       1400, $hoy->modify('+4 months')->format('Y-m-d'),  '#c46838', 'activo',      3, 150],
    ['Bici de carretera',     900, $hoy->modify('-1 month')->format('Y-m-d'),   '#b88a3e', 'completado',  6, 150],
] as [$nombre, $meta, $limite, $color, $estado, $aportaciones, $importeBase]) {
    $stmtObjetivo->execute([$usuarioId, $nombre, $meta, $limite, $color, $estado]);
    $objetivoId = (int) $pdo->lastInsertId();

    for ($i = $aportaciones; $i >= 1; $i--) {
        $stmtAportacion->execute([
            $objetivoId, $usuarioId,
            $hoy->modify("-{$i} months")->format('Y-m-d'),
            $importeBase + random_int(-30, 45),
            $i === $aportaciones ? 'Primera aportación' : null,
        ]);
    }
}

$pdo->commit();

printf("Cuenta de demostración lista.\n");
printf("  Email:       %s\n", $email);
printf("  Contraseña:  %s\n", $clave);
printf("  Movimientos: %d\n", $movimientos);
