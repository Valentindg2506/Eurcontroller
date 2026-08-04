<?php
declare(strict_types=1);

/**
 * Autenticación.
 *
 *   GET  ?accion=sesion    → usuario actual (o autenticado:false) + token CSRF
 *   POST ?accion=registro  → alta de cuenta e inicio de sesión
 *   POST ?accion=login     → inicio de sesión
 *   POST ?accion=logout    → cierre de sesión
 */

require_once __DIR__ . '/config.php';

iniciarSesion();

$accion = (string) ($_GET['accion'] ?? '');

/** Datos públicos de un usuario (nunca el hash de la contraseña). */
function usuarioPublico(int $id): array
{
    $stmt = db()->prepare('SELECT id, email, nombre, moneda, tema, creado_en FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $usuario = $stmt->fetch();
    if (!$usuario) {
        throw new ErrorApi('La cuenta ya no existe', 401);
    }
    return $usuario;
}

function registrarIntento(string $email, bool $exito): void
{
    $stmt = db()->prepare('INSERT INTO intentos_login (email, ip, exito) VALUES (?, ?, ?)');
    $stmt->execute([mb_substr($email, 0, 190), ipCliente(), $exito ? 1 : 0]);

    // Poda oportunista: mantiene la tabla pequeña sin necesitar un cron.
    if (random_int(1, 50) === 1) {
        db()->exec('DELETE FROM intentos_login WHERE creado_en < (NOW() - INTERVAL 1 DAY)');
    }
}

/** Frena la fuerza bruta por combinación email + IP. */
function comprobarLimiteLogin(string $email): void
{
    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM intentos_login
          WHERE exito = 0 AND email = ? AND ip = ?
            AND creado_en > (NOW() - INTERVAL ' . LOGIN_VENTANA_MIN . ' MINUTE)'
    );
    $stmt->execute([mb_substr($email, 0, 190), ipCliente()]);
    if ((int) $stmt->fetchColumn() >= LOGIN_MAX_FALLOS) {
        throw new ErrorApi(
            'Demasiados intentos fallidos. Vuelve a probar dentro de ' . LOGIN_VENTANA_MIN . ' minutos.',
            429
        );
    }
}

/** Fija la sesión tras autenticar. Regenerar el id evita la fijación de sesión. */
function abrirSesion(int $usuarioId): void
{
    session_regenerate_id(true);
    $_SESSION['usuario_id'] = $usuarioId;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}


// --- GET ?accion=sesion ------------------------------------------------------

if (metodo() === 'GET' && $accion === 'sesion') {
    $id = $_SESSION['usuario_id'] ?? null;
    if ($id === null) {
        responder(['autenticado' => false, 'csrf' => tokenCsrf()]);
    }
    responder([
        'autenticado' => true,
        'usuario'     => usuarioPublico((int) $id),
        'csrf'        => tokenCsrf(),
    ]);
}


// --- POST ?accion=registro ---------------------------------------------------

if (metodo() === 'POST' && $accion === 'registro') {
    exigirCsrf();
    $datos = cuerpo();

    $nombre = (string) campoTexto($datos, 'nombre', 120, true, 'nombre');
    $email  = mb_strtolower((string) campoTexto($datos, 'email', 190, true, 'email'));
    $clave  = (string) ($datos['password'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new ErrorApi('El email no tiene un formato válido', 422);
    }
    if (mb_strlen($clave) < PASSWORD_MIN) {
        throw new ErrorApi('La contraseña debe tener al menos ' . PASSWORD_MIN . ' caracteres', 422);
    }
    if (mb_strlen($clave) > 200) {
        throw new ErrorApi('La contraseña es demasiado larga', 422);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('INSERT INTO usuarios (email, password_hash, nombre) VALUES (?, ?, ?)');
        $stmt->execute([$email, password_hash($clave, PASSWORD_DEFAULT), $nombre]);
        $usuarioId = (int) $pdo->lastInsertId();
        crearCategoriasIniciales($usuarioId);
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        if (($e->errorInfo[1] ?? 0) === 1062) {   // clave duplicada
            throw new ErrorApi('Ya existe una cuenta con ese email', 409);
        }
        throw $e;
    }

    abrirSesion($usuarioId);
    registrarIntento($email, true);

    responder([
        'ok'      => true,
        'usuario' => usuarioPublico($usuarioId),
        'csrf'    => tokenCsrf(),
    ], 201);
}


// --- POST ?accion=login ------------------------------------------------------

if (metodo() === 'POST' && $accion === 'login') {
    exigirCsrf();
    $datos = cuerpo();

    $email = mb_strtolower(trim((string) ($datos['email'] ?? '')));
    $clave = (string) ($datos['password'] ?? '');

    if ($email === '' || $clave === '') {
        throw new ErrorApi('Indica tu email y tu contraseña', 422);
    }
    comprobarLimiteLogin($email);

    $stmt = db()->prepare('SELECT id, password_hash FROM usuarios WHERE email = ?');
    $stmt->execute([$email]);
    $usuario = $stmt->fetch();

    // Se verifica siempre contra un hash bcrypt real, exista o no la cuenta: así
    // el coste de la comprobación no revela qué emails están registrados.
    $hash = $usuario['password_hash'] ?? '$2y$12$o7rwJPtm8JN7DRhptuEHN.g4x.6xJVI8r5t3xNW4crDxd/ZjGfdYi';
    $valida = password_verify($clave, $hash);

    if (!$usuario || !$valida) {
        registrarIntento($email, false);
        throw new ErrorApi('Email o contraseña incorrectos', 401);
    }

    if (password_needs_rehash($usuario['password_hash'], PASSWORD_DEFAULT)) {
        db()->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($clave, PASSWORD_DEFAULT), $usuario['id']]);
    }

    abrirSesion((int) $usuario['id']);
    registrarIntento($email, true);

    responder([
        'ok'      => true,
        'usuario' => usuarioPublico((int) $usuario['id']),
        'csrf'    => tokenCsrf(),
    ]);
}


// --- POST ?accion=logout -----------------------------------------------------

if (metodo() === 'POST' && $accion === 'logout') {
    exigirCsrf();

    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $p['path'],
            'domain'   => $p['domain'],
            'secure'   => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => $p['samesite'],
        ]);
    }
    session_destroy();

    responder(['ok' => true]);
}


throw new ErrorApi('Acción no encontrada', 404);
