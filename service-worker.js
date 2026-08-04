/**
 * Service worker heredado de la versión anterior (rutas /public/…).
 *
 * Se conserva únicamente para que los navegadores que aún lo tengan registrado
 * lo descarten y borren sus cachés; de lo contrario podrían seguir sirviendo
 * indefinidamente el HTML antiguo. El service worker vigente es `sw.js`.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.map((clave) => caches.delete(clave)));
    await self.registration.unregister();

    const clientes = await self.clients.matchAll({ type: 'window' });
    clientes.forEach((cliente) => cliente.navigate(cliente.url));
  })());
});
