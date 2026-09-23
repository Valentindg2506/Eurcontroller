/**
 * Instalación como aplicación (añadir a la pantalla de inicio).
 *
 * Hay tres caminos distintos y ninguno es intercambiable:
 *
 *   · Chrome, Edge y Android disparan `beforeinstallprompt`. Se guarda el
 *     evento y se lanza cuando el usuario pulsa el botón; el navegador solo
 *     acepta lanzarlo desde un gesto suyo.
 *   · Safari en iOS no tiene ese evento: hay que explicarle al usuario que
 *     use Compartir → Añadir a pantalla de inicio.
 *   · Sin contexto seguro (HTTP que no sea localhost) ningún navegador ofrece
 *     instalar, por bien formado que esté el manifiesto.
 */

import { el, icono, banda } from './ui.js';

let eventoDiferido = null;
const suscriptores = [];

const anunciar = () => suscriptores.forEach((fn) => fn(estadoInstalacion()));

window.addEventListener('beforeinstallprompt', (evento) => {
  // Se evita el minibanner propio del navegador para ofrecer la instalación
  // desde la interfaz de la app, donde se puede explicar qué aporta.
  evento.preventDefault();
  eventoDiferido = evento;
  anunciar();
});

window.addEventListener('appinstalled', () => {
  eventoDiferido = null;
  anunciar();
});


/** true si la app se está ejecutando ya como aplicación instalada. */
export function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: window-controls-overlay)').matches
      || window.navigator.standalone === true;
}

function esIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
      // iPadOS 13+ se identifica como Mac; se distingue por el táctil.
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const esFirefox = () => /Firefox/.test(navigator.userAgent);

/**
 * @returns {{estado: string, seguro: boolean}} estado ∈
 *   'instalada' | 'disponible' | 'ios' | 'inseguro' | 'no-soportado' | 'espera'
 */
export function estadoInstalacion() {
  const seguro = window.isSecureContext;

  if (estaInstalada()) return { estado: 'instalada', seguro };
  if (!seguro) return { estado: 'inseguro', seguro };
  if (eventoDiferido) return { estado: 'disponible', seguro };
  if (esIOS()) return { estado: 'ios', seguro };
  if (esFirefox()) return { estado: 'no-soportado', seguro };

  // Chrome tarda un instante en emitir beforeinstallprompt, y no lo emite si
  // la app ya estaba instalada en otro perfil o si aún no ha decidido.
  return { estado: 'espera', seguro };
}

export function alCambiarInstalacion(fn) {
  suscriptores.push(fn);
}

/**
 * Lanza el diálogo nativo de instalación.
 * @returns {Promise<boolean>} true si el usuario aceptó
 */
export async function lanzarInstalacion() {
  if (!eventoDiferido) return false;

  eventoDiferido.prompt();
  const { outcome } = await eventoDiferido.userChoice;

  // El evento es de un solo uso: si se rechaza, el navegador emitirá otro
  // más adelante si lo considera oportuno.
  eventoDiferido = null;
  anunciar();

  return outcome === 'accepted';
}


/* --- Interfaz ---------------------------------------------------------------- */

const PASOS_IOS = [
  ['compartir', 'Pulsa el botón Compartir de Safari (el cuadrado con la flecha hacia arriba).'],
  ['mas', 'Baja en la lista y elige «Añadir a pantalla de inicio».'],
  ['check', 'Confirma. El icono de Eurcontroller aparecerá junto a tus demás apps.'],
];

/** Contenido de la tarjeta de instalación, según el estado del navegador. */
export function contenidoInstalacion(alInstalar) {
  const { estado } = estadoInstalacion();

  if (estado === 'instalada') {
    return el('div', { class: 'fila' },
      el('span', { class: 'chip chip-ingreso' }, icono('check-circulo'), 'Instalada'),
      el('span', { class: 'pequeno silenciado crece' },
        'Estás usando Eurcontroller como aplicación.'));
  }

  if (estado === 'inseguro') {
    return el('div', { class: 'pila-sm' },
      banda('Para poder instalarla, la página tiene que servirse por HTTPS. '
          + 'Ahora mismo estás en una conexión sin cifrar, y ningún navegador '
          + 'ofrece la instalación en esas condiciones.', 'aviso'),
      el('p', { class: 'pequeno silenciado' },
        'Publica la aplicación en un dominio con certificado y el botón de '
        + 'instalar aparecerá solo. En «localhost» sí funciona, por si quieres probarlo.'));
  }

  if (estado === 'ios') {
    return el('div', { class: 'pila-sm' },
      el('p', { class: 'pequeno silenciado' },
        'En iPhone y iPad la instalación se hace desde el propio Safari:'),
      el('ol', { class: 'pasos' },
        ...PASOS_IOS.map(([nombreIcono, texto]) =>
          el('li', null,
            el('span', { class: 'pasos-icono' }, icono(nombreIcono)),
            el('span', null, texto)))));
  }

  if (estado === 'no-soportado') {
    return el('p', { class: 'pequeno silenciado' },
      'Tu navegador no permite instalar aplicaciones web. Ábrela en Chrome, Edge '
      + 'o Safari y podrás añadirla a la pantalla de inicio.');
  }

  if (estado === 'espera') {
    return el('div', { class: 'pila-sm' },
      el('p', { class: 'pequeno silenciado' },
        'Tu navegador todavía no ha ofrecido la instalación. Suele aparecer tras '
        + 'usar la aplicación un rato; también puedes instalarla desde el menú del '
        + 'navegador, en «Instalar Eurcontroller» o «Añadir a la pantalla de inicio».'),
      el('button', {
        type: 'button', class: 'btn', style: { alignSelf: 'flex-start' },
        onClick: () => location.reload(),
      }, icono('sincronizar'), 'Volver a comprobar'));
  }

  return el('div', { class: 'pila-sm' },
    el('p', { class: 'pequeno silenciado' },
      'Instálala para abrirla desde el icono, a pantalla completa y sin barra de '
      + 'navegador. Sigue funcionando sin conexión.'),
    el('button', {
      type: 'button', class: 'btn btn-principal', style: { alignSelf: 'flex-start' },
      onClick: alInstalar,
    }, icono('descarga'), 'Instalar Eurcontroller'));
}
