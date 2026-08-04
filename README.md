# Eurcontroller

Aplicación web progresiva para llevar el control del dinero: gastos, ingresos,
presupuestos mensuales, gastos fijos y objetivos de ahorro.

Backend en PHP 8 con MySQL, frontend en JavaScript sin dependencias ni paso de
compilación. Se despliega copiando la carpeta en cualquier servidor con PHP.

---

## Funcionalidades

**Panel**
Indicadores del mes (ingresos, gastos, saldo y tasa de ahorro) con la variación
frente al mes anterior, gasto acumulado día a día con la línea del presupuesto,
reparto por categoría, comparativa de los últimos doce meses, estado de los
presupuestos, objetivos activos y últimos movimientos. Todo en una sola petición.

**Movimientos**
Alta, edición, duplicado y baja. Filtros por texto, rango de fechas, tipo,
categoría y método de pago, con paginación en servidor y totales del filtro.
En pantallas estrechas la tabla se sustituye por una lista.

**Presupuestos**
Límite mensual por categoría, progreso frente al gasto real, aviso cuando el
ritmo de gasto va a desbordar el límite y copia de los presupuestos de un mes
a otro.

**Gastos fijos**
Alquiler, suscripciones o nóminas con frecuencia semanal, mensual, trimestral o
anual. El servidor los convierte en movimientos reales cuando vence su fecha, sin
necesidad de cron. Muestra el equivalente mensual de cada uno para poder sumarlos.

**Ahorro**
Objetivos con importe, fecha límite y color. Aportaciones con histórico, progreso,
cuánto habría que apartar al mes para llegar a tiempo y cierre automático al
alcanzar la meta.

**Categorías**
Alta, edición, color e icono. Al borrar una categoría con movimientos se archiva
en lugar de eliminarse, para no perder el histórico.

**Ajustes**
Nombre, moneda (9 divisas), tema claro/oscuro/automático, cambio de contraseña,
exportación de todos los datos en CSV y JSON, y baja de la cuenta.

**Sin conexión**
Los movimientos creados sin red se guardan en el dispositivo y se envían al
recuperarla. El reenvío es idempotente: cada uno lleva un identificador local y
el servidor descarta los repetidos.

**Instalable**
Se añade a la pantalla de inicio del móvil o al escritorio y se abre a pantalla
completa, con su icono y sin barra de navegador. Ver [Instalación como app](#instalación-como-app).

---

## Puesta en marcha

### 1. Requisitos

- PHP 8.0 o superior con las extensiones `pdo_mysql` y `mbstring`
- MySQL 8 o MariaDB 10.4 o superior
- Un servidor web (Apache o Nginx)

### 2. Base de datos

```bash
mysql -u root -p -e "CREATE DATABASE gastos_pwa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p gastos_pwa < schema.sql
```

> `schema.sql` borra y recrea las tablas de la aplicación. No lo ejecutes sobre
> una base de datos con datos que quieras conservar.

### 3. Credenciales

```bash
cp api/credenciales.example.php api/credenciales.php
```

Edita `api/credenciales.php` con los datos de tu servidor. El archivo está en
`.gitignore` y nunca debe subirse al repositorio. Como alternativa puedes usar
las variables de entorno `EURC_DB_HOST`, `EURC_DB_PORT`, `EURC_DB_NAME`,
`EURC_DB_USER` y `EURC_DB_PASS`.

### 4. Servir la carpeta

La aplicación resuelve todas sus rutas de forma relativa, así que funciona igual
en la raíz de un dominio (`https://ejemplo.com/`) que en un subdirectorio
(`https://ejemplo.com/eurcontroller/`). No hace falta reescritura de URL.

Abre la dirección en el navegador y crea tu cuenta: se generan diez categorías
iniciales para poder empezar a registrar desde el primer minuto.

> **Al actualizar la app**, sube el número de `VERSION` en `sw.js`. El service
> worker sirve los estáticos desde caché, así que sin ese cambio los navegadores
> que ya la tengan instalada seguirían mostrando la versión anterior.

### 5. Datos de prueba (opcional)

```bash
php herramientas/sembrar-demo.php
```

Crea `demo@eurcontroller.test` / `DemoEurcontroller1` con ocho meses de
movimientos, presupuestos, gastos fijos y objetivos.

---

## Instalación como app

La aplicación es una PWA completa: manifiesto, service worker, iconos en todos
los tamaños (incluido el *maskable* que Android recorta en círculo) y capturas
que el navegador muestra en el diálogo de instalación.

### El requisito que no se puede saltar: HTTPS

**Ningún navegador ofrece instalar una web servida por HTTP.** La única
excepción es `localhost`. Si entras desde el móvil a `http://192.168.1.50/…`,
la opción no aparecerá por muy bien formado que esté el manifiesto.

Dentro de la app, en **Ajustes → Instalar en el dispositivo**, se detecta la
situación y se explica qué falta en cada caso.

### Cómo se instala una vez hay HTTPS

| Navegador | Qué ocurre |
|---|---|
| Chrome / Edge (Android y escritorio) | Aparece «Instalar app» en la barra lateral y en Ajustes. También sale el icono de instalación en la barra de direcciones. |
| Safari (iPhone y iPad) | No existe el diálogo automático. Ajustes muestra los pasos: Compartir → Añadir a pantalla de inicio. |
| Firefox | No admite la instalación de aplicaciones web; se indica en Ajustes. |

### Publicarla con certificado

La forma más simple es un dominio apuntando a tu servidor y Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d tudominio.com
```

Con eso, `https://tudominio.com/eurcontroller/` ya es instalable. Para probarlo
sin dominio propio sirve cualquier túnel con HTTPS (`cloudflared tunnel`,
`ngrok http 80`): la URL que devuelven es un contexto seguro y la instalación
funciona igual.

---

## Estructura

```
index.html                 SPA y sprite de iconos SVG
manifest.webmanifest       Configuración PWA
sw.js                      Service worker
service-worker.js          Retirada del service worker de la versión anterior
schema.sql                 Esquema de base de datos

assets/
  css/app.css              Sistema de diseño: tokens, componentes, temas
  icons/                   Iconos de la PWA (incluido el maskable)
  screenshots/             Capturas del diálogo de instalación
  js/
    core.js                Cliente de API, estado, formateo, tema, cola offline
    ui.js                  Construcción de DOM, modales, avisos, formularios
    charts.js              Gráficos (barras de reparto, comparativa, área)
    instalar.js            Detección e instalación como aplicación
    router.js              Enrutado por hash
    app.js                 Shell, autenticación y navegación
    vistas/                Una vista por sección

api/
  config.php               Arranque: PDO, sesión, CSRF, validación, reglas comunes
  credenciales.php         Credenciales locales (fuera de control de versiones)
  auth.php                 Registro, acceso, cierre de sesión
  transacciones.php        Movimientos
  categorias.php           Categorías
  presupuestos.php         Presupuestos mensuales
  recurrentes.php          Gastos fijos
  objetivos.php            Objetivos de ahorro y aportaciones
  resumen.php              Agregados del panel
  cuenta.php               Perfil, contraseña, exportación y baja

herramientas/
  sembrar-demo.php         Generador de datos de demostración

legal/                     Aviso legal, privacidad, cookies y términos
```

---

## Seguridad

- Contraseñas con `password_hash` (bcrypt) y rehash automático al mejorar el coste.
- Cookie de sesión `HttpOnly`, `SameSite=Lax`, `Secure` bajo HTTPS y acotada a la
  ruta de la aplicación. El identificador se regenera al iniciar sesión y al
  cambiar la contraseña.
- Token CSRF obligatorio en toda petición que modifica datos.
- Consultas exclusivamente preparadas, sin concatenación de entrada.
- Toda consulta filtra por `usuario_id`, y la pertenencia de la categoría se
  comprueba antes de imputar cualquier movimiento.
- Límite de intentos de acceso por email e IP (8 fallos en 15 minutos).
- El acceso verifica siempre contra un hash real, exista o no la cuenta, para no
  revelar por tiempo de respuesta qué emails están registrados.
- El frontend inserta texto con `textContent`: no hay ningún punto donde un dato
  del usuario pueda interpretarse como HTML.
- Los errores se registran en el log del servidor y al cliente solo le llega un
  mensaje genérico.

Si encuentras un problema de seguridad, consulta [SECURITY.md](SECURITY.md).

---

## Accesibilidad y diseño

La paleta es **cobalto sobre azul medianoche**. La marca es azul a propósito:
así no compite con el verde de los ingresos ni con el rojo de los gastos, que
son los colores que llevan significado. El tema oscuro usa superficies teñidas
de azul en lugar de gris neutro.

- Tema claro y oscuro, cada uno con sus propios valores (no es una inversión
  automática), respetando además la preferencia del sistema.
- Paleta de gráficos validada para daltonismo: separación protan/deutan
  ΔE ≥ 8 en ambos temas, medida sobre la superficie real de cada modo.
  La pareja ingresos/gastos llega a ΔE 10,2 en oscuro y 11,5 en claro.
- Todo el texto supera 4,5:1 de contraste sobre su fondo; el gris terciario,
  reservado a ejes y notas al pie, supera 3:1.
- Ingresos y gastos nunca se distinguen solo por el color: llevan siempre signo
  explícito, etiqueta y leyenda.
- El reparto por categoría son barras ordenadas y no un gráfico circular: en uno
  circular los segmentos se ordenan por importe, así que dos colores cualesquiera
  pueden acabar contiguos, y con ocho tonos no existe paleta que supere el umbral
  de distinción en *todas* las parejas posibles. Con barras, cada una lleva su
  nombre y su importe al lado y el color deja de ser necesario para leer el dato.
- Cada gráfico incorpora una tabla equivalente para lectores de pantalla.
- Navegación por teclado con indicadores de foco visibles y respeto por
  `prefers-reduced-motion`.

---

## API

Todos los endpoints intercambian JSON y usan la cookie de sesión. Las peticiones
que modifican datos exigen la cabecera `X-CSRF-Token`, cuyo valor entrega
`auth.php?accion=sesion`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `auth.php?accion=sesion` | Usuario actual y token CSRF |
| `POST` | `auth.php?accion=registro` | Alta de cuenta |
| `POST` | `auth.php?accion=login` | Inicio de sesión |
| `POST` | `auth.php?accion=logout` | Cierre de sesión |
| `GET` | `resumen.php?periodo=AAAA-MM` | Agregados del panel |
| `GET` `POST` `PUT` `DELETE` | `transacciones.php` | Movimientos |
| `GET` `POST` `PUT` `DELETE` | `categorias.php` | Categorías |
| `GET` `PUT` `DELETE` | `presupuestos.php` | Presupuestos |
| `POST` | `presupuestos.php?accion=copiar` | Copiar presupuestos entre meses |
| `GET` `POST` `PUT` `DELETE` | `recurrentes.php` | Gastos fijos |
| `GET` `POST` `PUT` `DELETE` | `objetivos.php` | Objetivos de ahorro |
| `POST` `DELETE` | `objetivos.php?accion=aportacion` | Aportaciones |
| `PUT` | `cuenta.php?accion=perfil` | Nombre, moneda y tema |
| `PUT` | `cuenta.php?accion=password` | Cambio de contraseña |
| `GET` | `cuenta.php?accion=exportar&formato=csv\|json` | Descarga de datos |
| `DELETE` | `cuenta.php?accion=eliminar` | Baja de la cuenta |

Códigos de error: `401` sin sesión, `403` CSRF o contraseña incorrecta,
`404` no encontrado, `409` conflicto, `422` datos no válidos, `429` demasiados
intentos.

---

## Aspectos legales

En `legal/` hay plantillas de aviso legal, política de privacidad, política de
cookies y términos de uso. Los datos que debes completar aparecen resaltados en
amarillo entre corchetes; revísalos y sustitúyelos todos antes de publicar.

---

## Licencia

[MIT](LICENSE).
