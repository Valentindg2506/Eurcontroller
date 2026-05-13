# Eurcontroller (Mis Finanzas PWA)

Aplicación web progresiva (PWA) para control de gastos, ingresos y objetivos de ahorro, con backend en PHP y base de datos MySQL.

## ✨ Funcionalidades principales

- Registro e inicio de sesión de usuario.
- Gestión de categorías de gasto e ingreso.
- Registro de transacciones (gastos/ingresos) con fecha, importe, descripción y método de pago.
- Objetivos de ahorro con importe objetivo, fecha límite y estado.
- Dashboard con tarjetas de resumen (ingresos, gastos, saldo).
- Listado filtrable de transacciones (por fecha, tipo y búsqueda por texto).
- Soporte offline con cola de transacciones almacenadas en el navegador y sincronización cuando vuelve la conexión.
- Instalación como PWA (añadir a pantalla de inicio) y funcionamiento en modo standalone.

## 🧱 Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript vanilla.
- **PWA**: `manifest.json` + `service-worker.js` (Cache API).
- **Backend**: PHP 7+/8+ con PDO.
- **Base de datos**: MySQL/MariaDB.

## 📁 Estructura de archivos (raíz del repo)

- `index.html` – SPA con vistas de autenticación, dashboard, transacciones, categorías y objetivos.
- `styles.css` – Estilos responsive tipo dashboard.
- `app.js` – Lógica de frontend, llamadas a API, cola offline y registro del service worker.
- `manifest.json` – Configuración PWA (nombre, colores, iconos, start_url).
- `service-worker.js` – Caché de recursos estáticos (cache-first) con exclusión de rutas `/api/`.
- `schema.sql` – Script de creación de tablas MySQL.
- `api/` – Endpoints PHP:
  - `config.php` – Conexión PDO y helpers comunes.
  - `auth.php` – Registro, login, logout y consulta de usuario actual.
  - `transacciones.php` – Listado, alta y eliminación de transacciones.
  - `categorias.php` – Alta y listado de categorías por usuario.
  - `objetivos.php` – Alta y gestión de estado de objetivos de ahorro.
- `legal/` – Textos legales básicos:
  - `aviso-legal.html`
  - `politica-privacidad.html`
  - `politica-cookies.html`
  - `terminos-condiciones.html`

## 🔐 Configuración de la base de datos

1. Crear una base de datos MySQL (por ejemplo, `gastos_pwa`).
2. Ejecutar el script `schema.sql` para crear las tablas necesarias.
3. Editar `api/config.php` y configurar:
   ```php
   $DB_HOST = 'localhost';
   $DB_NAME = 'gastos_pwa';
   $DB_USER = 'usuario_mysql';
   $DB_PASS = 'password_mysql_segura';
   ```

## 🌐 API: resumen de endpoints

Los endpoints devuelven y reciben JSON, usando cookies de sesión PHP para autenticación.

### Auth (`api/auth.php`)

- `POST ?accion=registro` – Crea un usuario nuevo.
  - Body: `{ "nombre", "email", "password" }`
- `POST ?accion=login` – Inicia sesión.
  - Body: `{ "email", "password" }`
- `POST ?accion=logout` – Cierra sesión.
- `GET ?accion=yo` – Devuelve el usuario autenticado o `autenticado: false`.

### Categorías (`api/categorias.php`)

- `GET` – Lista las categorías del usuario autenticado.
- `POST` – Crea una categoría.
  - Body: `{ "nombre", "tipo": "gasto"|"ingreso", "es_recurrente": bool }`

### Transacciones (`api/transacciones.php`)

- `GET` – Lista transacciones del usuario autenticado, con filtros opcionales por query string:
  - `desde`, `hasta` (fecha), `tipo` (`gasto`|`ingreso`).
- `POST` – Crea una transacción.
  - Body: `{ "tipo", "categoria_id", "fecha", "importe", "descripcion?", "metodo_pago?", "creado_offline?" }`
- `DELETE ?id={id}` – Elimina una transacción por id.

### Objetivos de ahorro (`api/objetivos.php`)

- `GET` – Lista objetivos del usuario.
- `POST` – Crea un objetivo.
  - Body: `{ "nombre", "monto_objetivo", "fecha_limite?" }`
- `PUT ?id={id}` – Actualiza el estado de un objetivo.
  - Body: `{ "estado": "activo"|"completado"|"cancelado" }`

## ⚖️ Aspectos legales

En la carpeta `legal/` se incluyen plantillas en HTML listas para adaptar con tus datos reales:

- Aviso legal (titular, NIF/CIF, domicilio, jurisdicción).
- Política de privacidad conforme a RGPD/LOPDGDD.
- Política de cookies (solo cookies técnicas/preferencias en esta versión).
- Términos y condiciones de uso de la aplicación.

Asegúrate de completar los campos entre corchetes (`[ ]`) con tus datos antes de publicar la app en producción.
