-- ---------------------------------------------------------------------------
-- Eurcontroller · esquema de base de datos (MySQL 8 / MariaDB 10.4+)
--
-- Uso:  mysql -u <usuario> -p <base_de_datos> < schema.sql
--
-- El script es idempotente: borra las tablas de la aplicación y las recrea.
-- NO ejecutar sobre una base de datos con datos que quieras conservar.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS aportaciones;
DROP TABLE IF EXISTS recurrentes;
DROP TABLE IF EXISTS presupuestos;
DROP TABLE IF EXISTS transacciones;
DROP TABLE IF EXISTS objetivos;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS intentos_login;
DROP TABLE IF EXISTS usuarios;
-- Tabla del esquema v1 que ya no se usa (sustituida por `objetivos`).
DROP TABLE IF EXISTS objetivos_ahorro;
SET FOREIGN_KEY_CHECKS = 1;


-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE usuarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(190)  NOT NULL,
  password_hash   VARCHAR(255)  NOT NULL,
  nombre          VARCHAR(120)  NOT NULL,
  moneda          CHAR(3)       NOT NULL DEFAULT 'EUR',
  tema            ENUM('sistema','claro','oscuro') NOT NULL DEFAULT 'sistema',
  creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- Intentos de inicio de sesión (limitación de fuerza bruta)
-- ---------------------------------------------------------------------------
CREATE TABLE intentos_login (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(190) NOT NULL,
  ip         VARCHAR(45)  NOT NULL,
  exito      TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_intentos_email (email, creado_en),
  KEY idx_intentos_ip (ip, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- Categorías (por usuario). El color se reutiliza en los gráficos del panel.
-- ---------------------------------------------------------------------------
CREATE TABLE categorias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  tipo        ENUM('gasto','ingreso') NOT NULL,
  color       CHAR(7)      NOT NULL DEFAULT '#2a78d6',
  icono       VARCHAR(32)  NOT NULL DEFAULT 'etiqueta',
  archivada   TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_categorias_nombre (usuario_id, tipo, nombre),
  KEY idx_categorias_usuario (usuario_id, archivada, tipo),
  CONSTRAINT fk_categorias_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- Objetivos de ahorro
-- ---------------------------------------------------------------------------
CREATE TABLE objetivos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT UNSIGNED  NOT NULL,
  nombre          VARCHAR(120)  NOT NULL,
  monto_objetivo  DECIMAL(12,2) NOT NULL,
  fecha_limite    DATE          NULL,
  color           CHAR(7)       NOT NULL DEFAULT '#4a3aa7',
  estado          ENUM('activo','completado','cancelado') NOT NULL DEFAULT 'activo',
  creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_objetivos_usuario (usuario_id, estado),
  CONSTRAINT fk_objetivos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- Aportaciones a objetivos. El acumulado de un objetivo es SUM(importe),
-- nunca un contador denormalizado: así no puede desincronizarse.
-- ---------------------------------------------------------------------------
CREATE TABLE aportaciones (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  objetivo_id  INT UNSIGNED  NOT NULL,
  usuario_id   INT UNSIGNED  NOT NULL,
  fecha        DATE          NOT NULL,
  importe      DECIMAL(12,2) NOT NULL,
  nota         VARCHAR(160)  NULL,
  creado_en    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_aportaciones_objetivo (objetivo_id, fecha),
  KEY idx_aportaciones_usuario (usuario_id),
  CONSTRAINT fk_aportaciones_objetivo FOREIGN KEY (objetivo_id)
    REFERENCES objetivos(id) ON DELETE CASCADE,
  CONSTRAINT fk_aportaciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- Transacciones
--
-- uid_local permite que la cola offline reenvíe sin duplicar: la clave única
-- (usuario_id, uid_local) hace el alta idempotente. MySQL admite varios NULL
-- en una clave única, así que las altas online no la ocupan.
-- ---------------------------------------------------------------------------
CREATE TABLE transacciones (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT UNSIGNED  NOT NULL,
  categoria_id    INT UNSIGNED  NOT NULL,
  tipo            ENUM('gasto','ingreso') NOT NULL,
  fecha           DATE          NOT NULL,
  importe         DECIMAL(12,2) NOT NULL,
  descripcion     VARCHAR(180)  NULL,
  metodo_pago     ENUM('tarjeta','efectivo','transferencia','domiciliado','bizum','otro')
                  NOT NULL DEFAULT 'tarjeta',
  origen          ENUM('manual','offline','recurrente') NOT NULL DEFAULT 'manual',
  uid_local       CHAR(36)      NULL,
  creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_transacciones_uid (usuario_id, uid_local),
  KEY idx_transacciones_fecha (usuario_id, fecha, id),
  KEY idx_transacciones_categoria (usuario_id, categoria_id),
  KEY idx_transacciones_tipo (usuario_id, tipo, fecha),
  CONSTRAINT fk_transacciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_transacciones_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- Presupuestos mensuales por categoría. periodo = 'YYYY-MM'.
-- ---------------------------------------------------------------------------
CREATE TABLE presupuestos (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED  NOT NULL,
  categoria_id  INT UNSIGNED  NOT NULL,
  periodo       CHAR(7)       NOT NULL,
  importe       DECIMAL(12,2) NOT NULL,
  creado_en     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_presupuestos (usuario_id, categoria_id, periodo),
  KEY idx_presupuestos_periodo (usuario_id, periodo),
  CONSTRAINT fk_presupuestos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_presupuestos_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- Movimientos recurrentes (gastos fijos / nóminas).
-- El servidor materializa las transacciones vencidas al consultar la API.
-- ---------------------------------------------------------------------------
CREATE TABLE recurrentes (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT UNSIGNED  NOT NULL,
  categoria_id   INT UNSIGNED  NOT NULL,
  tipo           ENUM('gasto','ingreso') NOT NULL,
  concepto       VARCHAR(120)  NOT NULL,
  importe        DECIMAL(12,2) NOT NULL,
  metodo_pago    ENUM('tarjeta','efectivo','transferencia','domiciliado','bizum','otro')
                 NOT NULL DEFAULT 'domiciliado',
  frecuencia     ENUM('semanal','mensual','trimestral','anual') NOT NULL DEFAULT 'mensual',
  proxima_fecha  DATE          NOT NULL,
  fecha_fin      DATE          NULL,
  activa         TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_recurrentes_usuario (usuario_id, activa, proxima_fecha),
  CONSTRAINT fk_recurrentes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_recurrentes_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
