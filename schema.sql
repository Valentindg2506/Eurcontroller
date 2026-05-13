-- Esquema de base de datos para la PWA de control de gastos

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  moneda_preferida VARCHAR(10) DEFAULT 'EUR',
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  tipo ENUM('gasto','ingreso') NOT NULL,
  es_recurrente TINYINT(1) DEFAULT 0,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE objetivos_ahorro (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  monto_objetivo DECIMAL(10,2) NOT NULL,
  fecha_limite DATE NULL,
  estado ENUM('activo','completado','cancelado') DEFAULT 'activo',
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE transacciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  categoria_id INT NOT NULL,
  objetivo_id INT NULL,
  tipo ENUM('gasto','ingreso') NOT NULL,
  fecha DATE NOT NULL,
  importe DECIMAL(10,2) NOT NULL,
  descripcion VARCHAR(255) NULL,
  metodo_pago VARCHAR(60) NULL,
  creado_offline TINYINT(1) DEFAULT 0,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT,
  FOREIGN KEY (objetivo_id) REFERENCES objetivos_ahorro(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
