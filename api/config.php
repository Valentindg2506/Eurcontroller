<?php
declare(strict_types=1);

/**
 * Eurcontroller · arranque común de la API.
 *
 * Todo endpoint hace `require_once __DIR__ . '/config.php';` como primera línea.
 * Aquí viven: configuración, conexión PDO, sesión, CSRF, respuestas JSON,
 * validación de entrada y las reglas de negocio compartidas.
 */

ini_set('display_errors', '0');   // nunca filtrar trazas al cliente
ini_set('log_errors', '1');
error_reporting(E_ALL);
mb_internal_encoding('UTF-8');
date_default_timezone_set('Europe/Madrid');

// --- Constantes de dominio ---------------------------------------------------

const TIPOS             = ['gasto', 'ingreso'];
const METODOS_PAGO      = ['tarjeta', 'efectivo', 'transferencia', 'domiciliado', 'bizum', 'otro'];
const FRECUENCIAS       = ['semanal', 'mensual', 'trimestral', 'anual'];
const ESTADOS_OBJETIVO  = ['activo', 'completado', 'cancelado'];
const TEMAS             = ['sistema', 'claro', 'oscuro'];
const MONEDAS           = ['EUR', 'USD', 'GBP', 'CHF', 'ARS', 'MXN', 'COP', 'CLP', 'BRL'];

const PASSWORD_MIN      = 8;
const LOGIN_MAX_FALLOS  = 8;    // por email + IP
const LOGIN_VENTANA_MIN = 15;   // minutos
const PAGINA_MAX        = 200;

/** Paleta por defecto para categorías nuevas (validada para daltonismo). */
const PALETA = [
    '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
    '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];


// --- Errores -----------------------------------------------------------------

/** Error previsto que se traduce a una respuesta JSON con su código HTTP. */
final class ErrorApi extends RuntimeException
{
    public function __construct(string $mensaje, int $estado = 400)
    {
        parent::__construct($mensaje, $estado);
    }
}

set_exception_handler(static function (Throwable $e): void {
    if ($e instanceof ErrorApi) {
        responder(['error' => $e->getMessage()], $e->getCode() ?: 400);
    }
    error_log('[Eurcontroller] ' . $e::class . ': ' . $e->getMessage()
        . ' en ' . $e->getFile() . ':' . $e->getLine());
    responder(['error' => 'Error interno del servidor'], 500);
});


// --- Configuración y conexión ------------------------------------------------

/**
 * Credenciales, por orden de prioridad:
 *   1. api/credenciales.php (fuera de control de versiones)
 *   2. variables de entorno EURC_DB_*
 *   3. valores por defecto de desarrollo
 */
function configuracion(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $archivo = __DIR__ . '/credenciales.php';
    $local = is_readable($archivo) ? require $archivo : [];
    if (!is_array($local)) {
        $local = [];
    }

    $config = [
        'db_host' => $local['db_host'] ?? (getenv('EURC_DB_HOST') ?: 'localhost'),
        'db_port' => (int) ($local['db_port'] ?? (getenv('EURC_DB_PORT') ?: 3306)),
        'db_name' => $local['db_name'] ?? (getenv('EURC_DB_NAME') ?: 'gastos_pwa'),
        'db_user' => $local['db_user'] ?? (getenv('EURC_DB_USER') ?: 'root'),
        'db_pass' => $local['db_pass'] ?? (getenv('EURC_DB_PASS') ?: ''),
    ];
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $c = configuracion();
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $c['db_host'], $c['db_port'], $c['db_name']);

    try {
        $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_STRINGIFY_FETCHES  => false,
        ]);
    } catch (PDOException $e) {
        error_log('[Eurcontroller] conexión BD: ' . $e->getMessage());
        throw new ErrorApi('No se puede conectar con la base de datos', 503);
    }
    return $pdo;
}


// --- Sesión y CSRF -----------------------------------------------------------

function iniciarSesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('eurc_sid');
    session_start([
        'cookie_httponly' => true,
        'cookie_secure'   => esHttps(),
        'cookie_samesite' => 'Lax',
        'cookie_path'     => rutaBase(),
        'use_strict_mode' => true,
        'gc_maxlifetime'  => 60 * 60 * 24 * 14,
    ]);
}

function esHttps(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['SERVER_PORT'] ?? '') === '443'
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

/** Ruta de la aplicación ('/' o '/GitHub/Eurcontroller/'), para acotar la cookie. */
function rutaBase(): string
{
    $script = $_SERVER['SCRIPT_NAME'] ?? '/api/config.php';
    $base = str_replace('\\', '/', dirname(dirname($script)));
    return rtrim($base, '/') . '/';
}

function tokenCsrf(): string
{
    iniciarSesion();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

/**
 * Obligatorio en todo método que modifica estado.
 *
 * Se responde 403 y no 419: Apache normaliza a 500 cualquier código que no
 * esté registrado en IANA, así que un 419 nunca llegaría al cliente.
 */
function exigirCsrf(): void
{
    if (in_array(metodo(), ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }
    $enviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($enviado) || $enviado === '' || !hash_equals(tokenCsrf(), $enviado)) {
        throw new ErrorApi('Token de seguridad no válido. Recarga la página.', 403);
    }
}

/** Identidad del usuario autenticado, o 401. */
function exigirAuth(): int
{
    iniciarSesion();
    $id = $_SESSION['usuario_id'] ?? null;
    if ($id === null || (!is_int($id) && !ctype_digit((string) $id))) {
        throw new ErrorApi('No autenticado', 401);
    }
    return (int) $id;
}

/** Combinación habitual: sesión válida + CSRF en escrituras. */
function exigirSesionValida(): int
{
    $id = exigirAuth();
    exigirCsrf();
    return $id;
}

function ipCliente(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}


// --- Entrada / salida --------------------------------------------------------

function metodo(): string
{
    return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

function responder(mixed $datos, int $estado = 200): never
{
    if (!headers_sent()) {
        http_response_code($estado);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
    }
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Cuerpo JSON de la petición como array asociativo. */
function cuerpo(): array
{
    static $datos = null;
    if ($datos !== null) {
        return $datos;
    }
    $crudo = file_get_contents('php://input') ?: '';
    if (trim($crudo) === '') {
        return $datos = [];
    }
    $decodificado = json_decode($crudo, true);
    if (!is_array($decodificado)) {
        throw new ErrorApi('El cuerpo de la petición no es JSON válido', 400);
    }
    return $datos = $decodificado;
}

function metodoNoPermitido(string ...$permitidos): never
{
    if (!headers_sent()) {
        header('Allow: ' . implode(', ', $permitidos));
    }
    throw new ErrorApi('Método no permitido', 405);
}


// --- Validación --------------------------------------------------------------

function campoTexto(array $d, string $clave, int $max, bool $obligatorio = true, string $etiqueta = ''): ?string
{
    $etiqueta = $etiqueta ?: $clave;
    $valor = $d[$clave] ?? null;
    if ($valor === null || (is_string($valor) && trim($valor) === '')) {
        if ($obligatorio) {
            throw new ErrorApi("El campo «{$etiqueta}» es obligatorio", 422);
        }
        return null;
    }
    if (!is_scalar($valor)) {
        throw new ErrorApi("El campo «{$etiqueta}» no es válido", 422);
    }
    $texto = trim((string) $valor);
    if (mb_strlen($texto) > $max) {
        throw new ErrorApi("El campo «{$etiqueta}» supera los {$max} caracteres", 422);
    }
    return $texto;
}

function campoImporte(array $d, string $clave = 'importe', string $etiqueta = 'importe'): float
{
    $valor = $d[$clave] ?? null;
    if (!is_numeric($valor)) {
        throw new ErrorApi("El campo «{$etiqueta}» debe ser un número", 422);
    }
    $importe = round((float) $valor, 2);
    if ($importe <= 0) {
        throw new ErrorApi("El campo «{$etiqueta}» debe ser mayor que cero", 422);
    }
    if ($importe > 99999999.99) {
        throw new ErrorApi("El campo «{$etiqueta}» es demasiado grande", 422);
    }
    return $importe;
}

function campoFecha(array $d, string $clave = 'fecha', bool $obligatorio = true, string $etiqueta = 'fecha'): ?string
{
    $valor = $d[$clave] ?? null;
    if ($valor === null || $valor === '') {
        if ($obligatorio) {
            throw new ErrorApi("El campo «{$etiqueta}» es obligatorio", 422);
        }
        return null;
    }
    return normalizarFecha((string) $valor, $etiqueta);
}

function normalizarFecha(string $valor, string $etiqueta = 'fecha'): string
{
    $fecha = DateTimeImmutable::createFromFormat('!Y-m-d', $valor);
    $errores = DateTimeImmutable::getLastErrors();
    if (!$fecha || ($errores && ($errores['warning_count'] || $errores['error_count']))) {
        throw new ErrorApi("El campo «{$etiqueta}» debe tener el formato AAAA-MM-DD", 422);
    }
    if ($fecha < new DateTimeImmutable('1970-01-01') || $fecha > new DateTimeImmutable('2100-12-31')) {
        throw new ErrorApi("El campo «{$etiqueta}» está fuera de rango", 422);
    }
    return $fecha->format('Y-m-d');
}

function campoEnum(array $d, string $clave, array $permitidos, ?string $defecto = null, string $etiqueta = ''): string
{
    $etiqueta = $etiqueta ?: $clave;
    $valor = $d[$clave] ?? null;
    if ($valor === null || $valor === '') {
        if ($defecto !== null) {
            return $defecto;
        }
        throw new ErrorApi("El campo «{$etiqueta}» es obligatorio", 422);
    }
    $valor = is_scalar($valor) ? (string) $valor : '';
    if (!in_array($valor, $permitidos, true)) {
        throw new ErrorApi("El campo «{$etiqueta}» debe ser uno de: " . implode(', ', $permitidos), 422);
    }
    return $valor;
}

function campoEntero(array $d, string $clave, bool $obligatorio = true, string $etiqueta = ''): ?int
{
    $etiqueta = $etiqueta ?: $clave;
    $valor = $d[$clave] ?? null;
    if ($valor === null || $valor === '') {
        if ($obligatorio) {
            throw new ErrorApi("El campo «{$etiqueta}» es obligatorio", 422);
        }
        return null;
    }
    if (!is_numeric($valor) || (int) $valor != $valor) {
        throw new ErrorApi("El campo «{$etiqueta}» debe ser un número entero", 422);
    }
    return (int) $valor;
}

function campoColor(array $d, string $clave, string $defecto): string
{
    $valor = $d[$clave] ?? null;
    if (!is_string($valor) || $valor === '') {
        return $defecto;
    }
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $valor)) {
        throw new ErrorApi('El color debe estar en formato #rrggbb', 422);
    }
    return strtolower($valor);
}

/** Periodo mensual 'AAAA-MM'; por defecto, el mes en curso. */
function campoPeriodo(array|string|null $origen, string $clave = 'periodo'): string
{
    $valor = is_array($origen) ? ($origen[$clave] ?? null) : $origen;
    if ($valor === null || $valor === '') {
        return (new DateTimeImmutable('today'))->format('Y-m');
    }
    if (!is_string($valor) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $valor)) {
        throw new ErrorApi('El periodo debe tener el formato AAAA-MM', 422);
    }
    return $valor;
}


// --- Reglas de negocio compartidas -------------------------------------------

/**
 * Comprueba que la categoría existe y pertenece al usuario.
 * Sin esto, cualquiera podría imputar movimientos a categorías ajenas.
 */
function categoriaDelUsuario(int $usuarioId, int $categoriaId, ?string $tipo = null): array
{
    $stmt = db()->prepare('SELECT id, nombre, tipo, color, icono FROM categorias WHERE id = ? AND usuario_id = ?');
    $stmt->execute([$categoriaId, $usuarioId]);
    $categoria = $stmt->fetch();
    if (!$categoria) {
        throw new ErrorApi('La categoría indicada no existe', 422);
    }
    if ($tipo !== null && $categoria['tipo'] !== $tipo) {
        throw new ErrorApi("La categoría «{$categoria['nombre']}» es de tipo {$categoria['tipo']}, no {$tipo}", 422);
    }
    return $categoria;
}

/** Categorías iniciales para que una cuenta recién creada sea usable desde el minuto cero. */
function crearCategoriasIniciales(int $usuarioId): void
{
    $iniciales = [
        ['Alimentación',   'gasto',   PALETA[0], 'carrito'],
        ['Vivienda',       'gasto',   PALETA[1], 'casa'],
        ['Transporte',     'gasto',   PALETA[2], 'transporte'],
        ['Ocio',           'gasto',   PALETA[3], 'ocio'],
        ['Salud',          'gasto',   PALETA[4], 'salud'],
        ['Compras',        'gasto',   PALETA[5], 'compras'],
        ['Suscripciones',  'gasto',   PALETA[6], 'repetir'],
        ['Otros gastos',   'gasto',   PALETA[7], 'etiqueta'],
        ['Nómina',         'ingreso', PALETA[2], 'trabajo'],
        ['Otros ingresos', 'ingreso', PALETA[0], 'entrada'],
    ];

    $stmt = db()->prepare(
        'INSERT INTO categorias (usuario_id, nombre, tipo, color, icono) VALUES (?, ?, ?, ?, ?)'
    );
    foreach ($iniciales as [$nombre, $tipo, $color, $icono]) {
        $stmt->execute([$usuarioId, $nombre, $tipo, $color, $icono]);
    }
}

/**
 * Borra todos los datos de un usuario en orden de dependencia.
 *
 * No basta con `DELETE FROM usuarios`: aunque todas las tablas cuelgan del
 * usuario con ON DELETE CASCADE, InnoDB no garantiza el orden entre cascadas,
 * y `transacciones.categoria_id` es RESTRICT. Si intenta borrar `categorias`
 * antes que `transacciones`, la operación falla con un error 1451.
 *
 * Debe invocarse dentro de una transacción.
 *
 * @param bool $incluirCuenta si además se elimina la fila de `usuarios`
 */
function borrarDatosUsuario(int $usuarioId, bool $incluirCuenta = true): void
{
    $tablas = ['transacciones', 'presupuestos', 'recurrentes', 'aportaciones', 'objetivos', 'categorias'];

    foreach ($tablas as $tabla) {
        db()->prepare("DELETE FROM {$tabla} WHERE usuario_id = ?")->execute([$usuarioId]);
    }

    if ($incluirCuenta) {
        db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$usuarioId]);
    }
}

/** Avanza una fecha según la frecuencia de un movimiento recurrente. */
function avanzarFecha(DateTimeImmutable $fecha, string $frecuencia): DateTimeImmutable
{
    return match ($frecuencia) {
        'semanal'    => $fecha->modify('+7 days'),
        'trimestral' => $fecha->modify('+3 months'),
        'anual'      => $fecha->modify('+1 year'),
        default      => $fecha->modify('+1 month'),
    };
}

/**
 * Materializa como transacciones reales los movimientos recurrentes vencidos.
 * Se invoca al listar transacciones y al abrir el panel, de modo que la app se
 * mantiene al día sin necesidad de un cron.
 *
 * @return int número de transacciones creadas
 */
function generarRecurrentesPendientes(int $usuarioId): int
{
    $pdo = db();
    $hoy = new DateTimeImmutable('today');

    $stmt = $pdo->prepare(
        'SELECT id, categoria_id, tipo, concepto, importe, metodo_pago, frecuencia, proxima_fecha, fecha_fin
           FROM recurrentes
          WHERE usuario_id = ? AND activa = 1 AND proxima_fecha <= ?'
    );
    $stmt->execute([$usuarioId, $hoy->format('Y-m-d')]);
    $pendientes = $stmt->fetchAll();
    if (!$pendientes) {
        return 0;
    }

    $insertar = $pdo->prepare(
        'INSERT INTO transacciones
            (usuario_id, categoria_id, tipo, fecha, importe, descripcion, metodo_pago, origen)
         VALUES (?, ?, ?, ?, ?, ?, ?, "recurrente")'
    );
    $actualizar = $pdo->prepare('UPDATE recurrentes SET proxima_fecha = ?, activa = ? WHERE id = ? AND usuario_id = ?');

    $creadas = 0;
    $pdo->beginTransaction();
    try {
        foreach ($pendientes as $r) {
            $siguiente = new DateTimeImmutable($r['proxima_fecha']);
            $fin = $r['fecha_fin'] ? new DateTimeImmutable($r['fecha_fin']) : null;
            $activa = 1;

            // Tope de seguridad: impide un bucle largo si los datos son extraños.
            for ($i = 0; $i < 120 && $siguiente <= $hoy; $i++) {
                if ($fin && $siguiente > $fin) {
                    break;
                }
                $insertar->execute([
                    $usuarioId, $r['categoria_id'], $r['tipo'], $siguiente->format('Y-m-d'),
                    $r['importe'], $r['concepto'], $r['metodo_pago'],
                ]);
                $creadas++;
                $siguiente = avanzarFecha($siguiente, $r['frecuencia']);
            }

            if ($fin && $siguiente > $fin) {
                $activa = 0;
            }
            $actualizar->execute([$siguiente->format('Y-m-d'), $activa, $r['id'], $usuarioId]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return $creadas;
}
