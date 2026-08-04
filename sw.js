/**
 * Service worker de Eurcontroller.
 *
 * Estrategia:
 *   · /api/…        → nunca se intercepta. Los datos financieros siempre salen
 *                     de la red; una respuesta cacheada aquí sería un error.
 *   · navegaciones  → red primero, con el shell cacheado como respaldo.
 *   · estáticos     → caché primero y revalidación en segundo plano, para que
 *                     la app abra al instante y aun así se actualice sola.
 *
 * Todas las rutas se resuelven contra el ámbito del registro, así que funciona
 * igual en la raíz del dominio que en un subdirectorio.
 */

/**
 * IMPORTANTE AL DESPLEGAR: sube este número cada vez que cambies un archivo de
 * `assets/` o `index.html`.
 *
 * Los estáticos se sirven desde la caché y se revalidan por detrás, así que sin
 * cambiar la versión el navegador seguiría mostrando el código anterior hasta la
 * siguiente recarga. Al cambiarla, el service worker se reinstala, borra las
 * cachés viejas y toma el control de inmediato.
 */
const VERSION = 'eurcontroller-v4';
const AMBITO = self.registration.scope;

const url = (ruta) => new URL(ruta, AMBITO).href;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/app.css',
  'assets/js/app.js',
  'assets/js/core.js',
  'assets/js/ui.js',
  'assets/js/charts.js',
  'assets/js/router.js',
  'assets/js/instalar.js',
  'assets/js/vistas/comunes.js',
  'assets/js/vistas/panel.js',
  'assets/js/vistas/movimientos.js',
  'assets/js/vistas/categorias.js',
  'assets/js/vistas/presupuestos.js',
  'assets/js/vistas/recurrentes.js',
  'assets/js/vistas/ahorro.js',
  'assets/js/vistas/ajustes.js',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
].map(url);


self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll() aborta entero si falla un solo recurso; se cachea uno a uno para
    // que un archivo ausente no deje la app sin service worker.
    await Promise.all(SHELL.map((recurso) =>
      cache.add(new Request(recurso, { cache: 'reload' })).catch(() => null)));
    await self.skipWaiting();
  })());
});


self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});


self.addEventListener('fetch', (evento) => {
  const { request } = evento;

  if (request.method !== 'GET') return;

  const destino = new URL(request.url);
  if (destino.origin !== self.location.origin) return;

  // La API queda siempre fuera: ni se cachea ni se sirve desde caché.
  if (destino.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    evento.respondWith(navegacion(request));
    return;
  }

  evento.respondWith(estatico(request));
});


/** Red primero; si no hay conexión, el shell cacheado. */
async function navegacion(request) {
  try {
    const respuesta = await fetch(request);
    const cache = await caches.open(VERSION);
    cache.put(url('index.html'), respuesta.clone());
    return respuesta;
  } catch {
    return (await caches.match(url('index.html')))
        || (await caches.match(url('./')))
        || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}


/** Caché primero, revalidando por detrás. */
async function estatico(request) {
  const cache = await caches.open(VERSION);
  const cacheado = await cache.match(request);

  const desdeRed = fetch(request)
    .then((respuesta) => {
      if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
        cache.put(request, respuesta.clone());
      }
      return respuesta;
    })
    .catch(() => null);

  if (cacheado) return cacheado;

  const respuesta = await desdeRed;
  return respuesta || new Response('', { status: 504 });
}
