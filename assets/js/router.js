/**
 * Enrutado por hash (#/movimientos). No necesita reescritura en el servidor,
 * así que la app funciona igual en la raíz que en cualquier subdirectorio.
 */

const oyentes = [];

export function rutaActual() {
  const bruta = (location.hash || '#/panel').replace(/^#\/?/, '');
  const [ruta, consulta] = bruta.split('?');
  return {
    ruta: ruta || 'panel',
    parametros: Object.fromEntries(new URLSearchParams(consulta || '')),
  };
}

export function irA(ruta, parametros = {}) {
  const consulta = new URLSearchParams(parametros).toString();
  const destino = `#/${ruta}${consulta ? `?${consulta}` : ''}`;

  if (location.hash === destino) {
    oyentes.forEach((fn) => fn(rutaActual()));
  } else {
    location.hash = destino;
  }
}

export function alCambiarRuta(fn) {
  oyentes.push(fn);
}

window.addEventListener('hashchange', () => oyentes.forEach((fn) => fn(rutaActual())));
