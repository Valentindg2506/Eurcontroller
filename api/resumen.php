<?php
declare(strict_types=1);

/**
 * Agregados del panel principal, en una sola petición.
 *
 *   GET ?periodo=AAAA-MM
 *
 * Devuelve indicadores del mes, comparativa con el mes anterior, reparto por
 * categoría, serie diaria, serie de los últimos 12 meses, estado de los
 * presupuestos, objetivos activos y los últimos movimientos.
 */

require_once __DIR__ . '/config.php';

$usuarioId = exigirSesionValida();
$pdo = db();

if (metodo() !== 'GET') {
    metodoNoPermitido('GET');
}

// Mantiene al día los movimientos fijos antes de calcular nada.
generarRecurrentesPendientes($usuarioId);

$periodo    = campoPeriodo($_GET);
$mes        = new DateTimeImmutable($periodo . '-01');
$inicio     = $mes->format('Y-m-d');
$fin        = $mes->modify('last day of this month')->format('Y-m-d');
$mesPrevio  = $mes->modify('-1 month');
$inicioPrev = $mesPrevio->format('Y-m-d');
$finPrev    = $mesPrevio->modify('last day of this month')->format('Y-m-d');

/** Totales de ingresos y gastos en un rango de fechas. */
function totalesEntre(int $usuarioId, string $desde, string $hasta): array
{
    $stmt = db()->prepare(
        'SELECT COALESCE(SUM(CASE WHEN tipo = "ingreso" THEN importe END), 0) AS ingresos,
                COALESCE(SUM(CASE WHEN tipo = "gasto"   THEN importe END), 0) AS gastos
           FROM transacciones
          WHERE usuario_id = ? AND fecha BETWEEN ? AND ?'
    );
    $stmt->execute([$usuarioId, $desde, $hasta]);
    $fila = $stmt->fetch();

    $ingresos = round((float) $fila['ingresos'], 2);
    $gastos   = round((float) $fila['gastos'], 2);
    return ['ingresos' => $ingresos, 'gastos' => $gastos, 'saldo' => round($ingresos - $gastos, 2)];
}

/** Variación relativa entre dos valores; null cuando no hay base con la que comparar. */
function variacion(float $actual, float $previo): ?float
{
    if ($previo <= 0.0) {
        return null;
    }
    return round(($actual - $previo) / $previo, 4);
}

$actual = totalesEntre($usuarioId, $inicio, $fin);
$previo = totalesEntre($usuarioId, $inicioPrev, $finPrev);

// --- Reparto por categoría (gastos del mes) ----------------------------------

$stmt = $pdo->prepare(
    'SELECT c.id, c.nombre, c.color, c.icono, SUM(t.importe) AS total
       FROM transacciones t
       JOIN categorias c ON c.id = t.categoria_id
      WHERE t.usuario_id = ? AND t.tipo = "gasto" AND t.fecha BETWEEN ? AND ?
      GROUP BY c.id
      ORDER BY total DESC'
);
$stmt->execute([$usuarioId, $inicio, $fin]);

$porCategoria = array_map(static function (array $c) use ($actual): array {
    $total = round((float) $c['total'], 2);
    return [
        'categoria_id' => (int) $c['id'],
        'nombre'       => $c['nombre'],
        'color'        => $c['color'],
        'icono'        => $c['icono'],
        'total'        => $total,
        'pct'          => $actual['gastos'] > 0 ? round($total / $actual['gastos'], 4) : 0,
    ];
}, $stmt->fetchAll());

// --- Serie diaria del mes ----------------------------------------------------

$stmt = $pdo->prepare(
    'SELECT fecha,
            COALESCE(SUM(CASE WHEN tipo = "ingreso" THEN importe END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN tipo = "gasto"   THEN importe END), 0) AS gastos
       FROM transacciones
      WHERE usuario_id = ? AND fecha BETWEEN ? AND ?
      GROUP BY fecha'
);
$stmt->execute([$usuarioId, $inicio, $fin]);

$porDia = [];
foreach ($stmt->fetchAll() as $fila) {
    $porDia[$fila['fecha']] = [
        'ingresos' => round((float) $fila['ingresos'], 2),
        'gastos'   => round((float) $fila['gastos'], 2),
    ];
}

$serieDiaria = [];
$acumulado = 0.0;
$diasMes = (int) $mes->format('t');
for ($d = 1; $d <= $diasMes; $d++) {
    $fecha = $mes->setDate((int) $mes->format('Y'), (int) $mes->format('n'), $d)->format('Y-m-d');
    $dia = $porDia[$fecha] ?? ['ingresos' => 0.0, 'gastos' => 0.0];
    $acumulado += $dia['gastos'];
    $serieDiaria[] = [
        'fecha'     => $fecha,
        'dia'       => $d,
        'ingresos'  => $dia['ingresos'],
        'gastos'    => $dia['gastos'],
        'acumulado' => round($acumulado, 2),
    ];
}

// --- Serie de los últimos 12 meses -------------------------------------------

$desde12 = $mes->modify('-11 months')->format('Y-m-d');
$stmt = $pdo->prepare(
    'SELECT DATE_FORMAT(fecha, "%Y-%m") AS periodo,
            COALESCE(SUM(CASE WHEN tipo = "ingreso" THEN importe END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN tipo = "gasto"   THEN importe END), 0) AS gastos
       FROM transacciones
      WHERE usuario_id = ? AND fecha BETWEEN ? AND ?
      GROUP BY periodo'
);
$stmt->execute([$usuarioId, $desde12, $fin]);

$porMes = [];
foreach ($stmt->fetchAll() as $fila) {
    $porMes[$fila['periodo']] = [
        'ingresos' => round((float) $fila['ingresos'], 2),
        'gastos'   => round((float) $fila['gastos'], 2),
    ];
}

$serieMensual = [];
for ($i = 11; $i >= 0; $i--) {
    $m = $mes->modify("-{$i} months");
    $clave = $m->format('Y-m');
    $valores = $porMes[$clave] ?? ['ingresos' => 0.0, 'gastos' => 0.0];
    $serieMensual[] = [
        'periodo'  => $clave,
        'ingresos' => $valores['ingresos'],
        'gastos'   => $valores['gastos'],
        'saldo'    => round($valores['ingresos'] - $valores['gastos'], 2),
    ];
}

// --- Presupuestos del mes ----------------------------------------------------

$stmt = $pdo->prepare(
    'SELECT p.categoria_id, p.importe AS presupuesto, c.nombre, c.color,
            COALESCE(g.gastado, 0) AS gastado
       FROM presupuestos p
       JOIN categorias c ON c.id = p.categoria_id
       LEFT JOIN (
             SELECT categoria_id, SUM(importe) AS gastado
               FROM transacciones
              WHERE usuario_id = ? AND tipo = "gasto" AND fecha BETWEEN ? AND ?
              GROUP BY categoria_id
           ) g ON g.categoria_id = p.categoria_id
      WHERE p.usuario_id = ? AND p.periodo = ?
      ORDER BY (COALESCE(g.gastado,0) / p.importe) DESC'
);
$stmt->execute([$usuarioId, $inicio, $fin, $usuarioId, $periodo]);

$presupuestos = [];
$presupuestado = 0.0;
$gastadoPresupuestado = 0.0;
foreach ($stmt->fetchAll() as $p) {
    $importe = round((float) $p['presupuesto'], 2);
    $gastado = round((float) $p['gastado'], 2);
    $presupuestado += $importe;
    $gastadoPresupuestado += $gastado;
    $presupuestos[] = [
        'categoria_id' => (int) $p['categoria_id'],
        'nombre'       => $p['nombre'],
        'color'        => $p['color'],
        'presupuesto'  => $importe,
        'gastado'      => $gastado,
        'uso'          => $importe > 0 ? round($gastado / $importe, 4) : null,
    ];
}

// --- Objetivos activos -------------------------------------------------------

$stmt = $pdo->prepare(
    'SELECT o.id, o.nombre, o.monto_objetivo, o.fecha_limite, o.color,
            COALESCE(SUM(a.importe), 0) AS acumulado
       FROM objetivos o
       LEFT JOIN aportaciones a ON a.objetivo_id = o.id
      WHERE o.usuario_id = ? AND o.estado = "activo"
      GROUP BY o.id
      ORDER BY o.fecha_limite IS NULL, o.fecha_limite, o.id
      LIMIT 4'
);
$stmt->execute([$usuarioId]);

$objetivos = array_map(static function (array $o): array {
    $meta = round((float) $o['monto_objetivo'], 2);
    $acum = round((float) $o['acumulado'], 2);
    return [
        'id'             => (int) $o['id'],
        'nombre'         => $o['nombre'],
        'monto_objetivo' => $meta,
        'acumulado'      => $acum,
        'progreso'       => $meta > 0 ? min(1, $acum / $meta) : 0,
        'fecha_limite'   => $o['fecha_limite'],
        'color'          => $o['color'],
    ];
}, $stmt->fetchAll());

// --- Últimos movimientos -----------------------------------------------------

$stmt = $pdo->prepare(
    'SELECT t.id, t.tipo, t.fecha, t.importe, t.descripcion, t.metodo_pago, t.origen,
            c.nombre AS categoria, c.color, c.icono
       FROM transacciones t
       JOIN categorias c ON c.id = t.categoria_id
      WHERE t.usuario_id = ?
      ORDER BY t.fecha DESC, t.id DESC
      LIMIT 6'
);
$stmt->execute([$usuarioId]);

$recientes = array_map(static fn(array $t): array => [
    'id'          => (int) $t['id'],
    'tipo'        => $t['tipo'],
    'fecha'       => $t['fecha'],
    'importe'     => round((float) $t['importe'], 2),
    'descripcion' => $t['descripcion'],
    'metodo_pago' => $t['metodo_pago'],
    'origen'      => $t['origen'],
    'categoria'   => $t['categoria'],
    'color'       => $t['color'],
    'icono'       => $t['icono'],
], $stmt->fetchAll());

// --- Saldo histórico y proyección --------------------------------------------

$stmt = $pdo->prepare(
    'SELECT COALESCE(SUM(CASE WHEN tipo = "ingreso" THEN importe ELSE -importe END), 0) AS saldo,
            COUNT(*) AS movimientos
       FROM transacciones WHERE usuario_id = ?'
);
$stmt->execute([$usuarioId]);
$historico = $stmt->fetch();

$hoy = new DateTimeImmutable('today');
$esMesEnCurso = $hoy->format('Y-m') === $periodo;
$diasTranscurridos = $esMesEnCurso ? (int) $hoy->format('j') : $diasMes;
$gastoDiario = $diasTranscurridos > 0 ? $actual['gastos'] / $diasTranscurridos : 0.0;

responder([
    'periodo' => $periodo,
    'kpis' => [
        'ingresos'           => $actual['ingresos'],
        'gastos'             => $actual['gastos'],
        'saldo'              => $actual['saldo'],
        'tasa_ahorro'        => $actual['ingresos'] > 0
                                    ? round($actual['saldo'] / $actual['ingresos'], 4)
                                    : null,
        'gasto_diario_medio' => round($gastoDiario, 2),
        'proyeccion_gasto'   => $esMesEnCurso ? round($gastoDiario * $diasMes, 2) : $actual['gastos'],
        'dias_transcurridos' => $diasTranscurridos,
        'dias_mes'           => $diasMes,
        'mes_en_curso'       => $esMesEnCurso,
    ],
    'comparativa' => [
        'ingresos_previo' => $previo['ingresos'],
        'gastos_previo'   => $previo['gastos'],
        'saldo_previo'    => $previo['saldo'],
        'var_ingresos'    => variacion($actual['ingresos'], $previo['ingresos']),
        'var_gastos'      => variacion($actual['gastos'], $previo['gastos']),
    ],
    'historico' => [
        'saldo'       => round((float) $historico['saldo'], 2),
        'movimientos' => (int) $historico['movimientos'],
    ],
    'por_categoria'  => $porCategoria,
    'serie_diaria'   => $serieDiaria,
    'serie_mensual'  => $serieMensual,
    'presupuestos'   => [
        'items'         => $presupuestos,
        'presupuestado' => round($presupuestado, 2),
        'gastado'       => round($gastadoPresupuestado, 2),
        'excedidas'     => count(array_filter(
            $presupuestos,
            static fn(array $p): bool => $p['uso'] !== null && $p['uso'] > 1
        )),
    ],
    'objetivos' => $objetivos,
    'recientes' => $recientes,
]);
