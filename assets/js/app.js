/**
 * Shell de la aplicación: autenticación, estructura, navegación y montaje
 * de las vistas.
 */

import { el, icono, vaciar, campo, aviso, avisoError, avisoExito, menu, banda } from './ui.js';
import {
  estado, obtener, enviar, alCaducarSesion, aplicarTema, temaGuardado, hayTemaLocal,
  configurarMoneda, periodoActual, leerCola, sincronizarCola, BASE,
} from './core.js';
import { rutaActual, irA, alCambiarRuta } from './router.js';
import { formularioMovimiento, cargarCategorias } from './vistas/comunes.js';
import { estadoInstalacion, lanzarInstalacion, alCambiarInstalacion } from './instalar.js';

import * as panel from './vistas/panel.js';
import * as movimientos from './vistas/movimientos.js';
import * as presupuestos from './vistas/presupuestos.js';
import * as ahorro from './vistas/ahorro.js';
import * as recurrentes from './vistas/recurrentes.js';
import * as categorias from './vistas/categorias.js';
import * as ajustes from './vistas/ajustes.js';

const VISTAS = {
  panel:         { modulo: panel,         icono: 'panel',    etiqueta: 'Resumen',      enBarra: true },
  movimientos:   { modulo: movimientos,   icono: 'lista',    etiqueta: 'Movimientos',  enBarra: true },
  presupuestos:  { modulo: presupuestos,  icono: 'diana',    etiqueta: 'Presupuestos', enBarra: true },
  ahorro:        { modulo: ahorro,        icono: 'hucha',    etiqueta: 'Ahorro',       enBarra: true },
  recurrentes:   { modulo: recurrentes,   icono: 'repetir',  etiqueta: 'Gastos fijos' },
  categorias:    { modulo: categorias,    icono: 'etiqueta', etiqueta: 'Categorías' },
  ajustes:       { modulo: ajustes,       icono: 'ajustes',  etiqueta: 'Ajustes' },
};

/** Vistas cuyo contenido depende del mes seleccionado. */
const CON_PERIODO = new Set(['panel', 'presupuestos']);

const raiz = document.getElementById('app');
let desmontarVista = null;


/* --- Arranque --------------------------------------------------------------- */

async function arrancar() {
  aplicarTema(temaGuardado(), { persistir: false });

  try {
    const sesion = await obtener('auth.php?accion=sesion');
    estado.csrf = sesion.csrf;

    if (sesion.autenticado) {
      entrar(sesion.usuario);
    } else {
      pantallaAuth();
    }
  } catch (error) {
    raiz.replaceChildren(el('div', { class: 'auth-panel' },
      el('div', { class: 'auth-caja' },
        banda(`No se ha podido contactar con el servidor: ${error.message}`, 'error'),
        el('button', { type: 'button', class: 'btn btn-principal', onClick: () => location.reload() },
          'Reintentar'))));
  }

  registrarServiceWorker();
}

alCaducarSesion(() => {
  if (estado.usuario) {
    estado.usuario = null;
    aviso('Tu sesión ha caducado. Vuelve a entrar.', 'error');
    pantallaAuth();
  }
});


/* --- Pantalla de acceso ------------------------------------------------------ */

function pantallaAuth(modoInicial = 'login') {
  let modo = modoInicial;

  const contenedorFormulario = el('div');

  const pintar = () => {
    const esLogin = modo === 'login';

    const entradaNombre = el('input', {
      type: 'text', name: 'nombre', required: true, maxlength: 120,
      autocomplete: 'name', placeholder: 'Tu nombre',
    });
    const entradaEmail = el('input', {
      type: 'email', name: 'email', required: true, autocomplete: 'email',
      placeholder: 'tu@email.com',
    });
    const entradaClave = el('input', {
      type: 'password', name: 'password', required: true,
      minlength: esLogin ? null : 8,
      autocomplete: esLogin ? 'current-password' : 'new-password',
      placeholder: esLogin ? 'Tu contraseña' : 'Mínimo 8 caracteres',
    });

    const errores = el('div', { class: 'oculto' });
    const boton = el('button', { type: 'submit', class: 'btn btn-principal btn-bloque' },
      esLogin ? 'Entrar' : 'Crear cuenta');

    const formulario = el('form', {
      onSubmit: async (evento) => {
        evento.preventDefault();
        boton.disabled = true;
        boton.textContent = esLogin ? 'Entrando…' : 'Creando la cuenta…';
        errores.classList.add('oculto');

        try {
          const cuerpo = esLogin
            ? { email: entradaEmail.value, password: entradaClave.value }
            : { nombre: entradaNombre.value, email: entradaEmail.value, password: entradaClave.value };

          const respuesta = await enviar(`auth.php?accion=${esLogin ? 'login' : 'registro'}`, cuerpo);
          estado.csrf = respuesta.csrf;
          entrar(respuesta.usuario);
          if (!esLogin) avisoExito(`¡Bienvenido, ${respuesta.usuario.nombre}!`);
        } catch (error) {
          vaciar(errores).append(banda(error.message, 'error'));
          errores.classList.remove('oculto');
          boton.disabled = false;
          boton.textContent = esLogin ? 'Entrar' : 'Crear cuenta';
        }
      },
    },
      el('div', { class: 'pila' },
        errores,
        esLogin ? null : campo('Nombre', entradaNombre),
        campo('Email', entradaEmail),
        campo('Contraseña', entradaClave),
        boton));

    contenedorFormulario.replaceChildren(
      el('section', { class: 'tarjeta' },
        el('div', { class: 'tarjeta-cuerpo' },
          el('div', { class: 'pila' },
            el('div', null,
              el('h1', null, esLogin ? 'Entra en tu cuenta' : 'Crea tu cuenta'),
              el('p', { class: 'silenciado pequeno', style: { marginTop: '4px' } },
                esLogin
                  ? 'Controla en qué se te va el dinero.'
                  : 'Es gratis y tus datos se quedan en tu servidor.')),
            formulario,
            el('p', { class: 'centrado pequeno silenciado' },
              esLogin ? '¿Todavía no tienes cuenta? ' : '¿Ya tienes cuenta? ',
              el('button', {
                type: 'button', class: 'btn-enlace',
                onClick: () => { modo = esLogin ? 'registro' : 'login'; pintar(); },
              }, esLogin ? 'Crear una' : 'Inicia sesión'))))));

    const primero = contenedorFormulario.querySelector('input');
    if (primero) primero.focus();
  };

  pintar();

  raiz.replaceChildren(el('div', { class: 'auth' },
    el('aside', { class: 'auth-lateral' },
      logotipo(true),
      el('div', { class: 'pila' },
        el('h2', null, 'Sabe exactamente en qué se te va el dinero'),
        el('p', null,
          'Registra gastos e ingresos, ponte presupuestos y mira crecer tus '
          + 'objetivos de ahorro. Todo en tu propio servidor.'),
        el('ul', { class: 'auth-ventajas' },
          ...[
            'Panel con gráficos de evolución y reparto por categoría',
            'Presupuestos mensuales que avisan antes de que te pases',
            'Gastos fijos que se registran solos cada mes',
            'Funciona sin conexión y sincroniza al volver',
          ].map((texto) => el('li', null, icono('check-circulo'), texto)))),
      el('p', { class: 'diminuto', style: { color: 'rgba(255,255,255,.55)' } },
        '© Eurcontroller')),

    el('div', { class: 'auth-panel' },
      el('div', { class: 'auth-caja' },
        contenedorFormulario,
        el('p', { class: 'auth-legal' },
          'Al continuar aceptas los ',
          el('a', { href: new URL('legal/terminos-condiciones.html', BASE).href, target: '_blank' },
            'términos y condiciones'),
          ' y la ',
          el('a', { href: new URL('legal/politica-privacidad.html', BASE).href, target: '_blank' },
            'política de privacidad'),
          '.')))));
}


/* --- Shell ------------------------------------------------------------------- */

function logotipo(claro = false) {
  return el('div', { class: 'marca-app' },
    el('span', { class: 'logo' }, icono('euro')),
    el('div', null,
      el('strong', null, 'Eurcontroller'),
      el('small', null, 'Control de gastos')));
}

async function entrar(usuario) {
  estado.usuario = usuario;
  configurarMoneda(usuario.moneda);

  // El tema de la cuenta solo sirve para estrenar un dispositivo: si aquí ya se
  // eligió uno, manda el del dispositivo (es lo que dice la pantalla de ajustes).
  if (!hayTemaLocal() && usuario.tema) aplicarTema(usuario.tema, { persistir: false });

  construirShell();

  try {
    await cargarCategorias(true);
  } catch { /* la vista lo volverá a intentar */ }

  if (!location.hash) location.hash = '#/panel';
  await montarRuta();

  const { pendientes } = await sincronizarCola();
  if (pendientes === 0 && leerCola().length === 0) refrescarEstadoConexion();
}

function construirShell() {
  const contenido = el('main', { class: 'contenido', id: 'contenido', tabindex: '-1' });
  const acciones = el('div', { class: 'topbar-acciones', id: 'acciones' });
  const titulo = el('h1', null, '');
  const subtitulo = el('p', null, '');

  raiz.replaceChildren(el('div', { class: 'shell' },
    barraLateral(),
    el('div', { class: 'principal' },
      el('header', { class: 'topbar' },
        el('div', { class: 'topbar-titulo' }, titulo, subtitulo),
        acciones),
      contenido),
    barraInferior(),
    el('button', {
      class: 'fab', 'aria-label': 'Nuevo movimiento',
      onClick: async () => { if (await formularioMovimiento()) recargarVista(); },
    }, icono('mas'))));
}

function barraLateral() {
  const principales = ['panel', 'movimientos', 'presupuestos', 'ahorro'];
  const gestion = ['recurrentes', 'categorias'];

  const enlace = (clave) => el('button', {
    type: 'button', class: 'nav-item', dataset: { ruta: clave },
    onClick: () => irA(clave),
  }, icono(VISTAS[clave].icono), VISTAS[clave].etiqueta);

  const iniciales = estado.usuario.nombre.trim().slice(0, 2).toUpperCase();

  return el('aside', { class: 'sidebar' },
    logotipo(),
    ...principales.map(enlace),
    el('div', { class: 'nav-titulo' }, 'Gestión'),
    ...gestion.map(enlace),

    el('div', { class: 'sidebar-pie' },
      contenedorInstalar(),
      enlace('ajustes'),
      el('button', {
        type: 'button', class: 'perfil',
        onClick: (evento) => menuPerfil(evento.currentTarget),
      },
        el('span', { class: 'perfil-avatar' }, iniciales),
        el('span', { class: 'perfil-datos' },
          el('strong', null, estado.usuario.nombre),
          el('small', null, estado.usuario.email)),
        icono('mas-opciones'))));
}

/**
 * Acceso directo a la instalación en la barra lateral. Solo aparece cuando el
 * navegador la ofrece de verdad; el resto de casos (iOS, sin HTTPS…) se
 * explican en Ajustes, donde hay sitio para contarlos.
 */
function contenedorInstalar() {
  const contenedor = el('div');

  const pintar = () => {
    if (estadoInstalacion().estado !== 'disponible') {
      contenedor.replaceChildren();
      return;
    }
    contenedor.replaceChildren(el('button', {
      type: 'button', class: 'nav-item nav-instalar',
      onClick: async () => {
        if (await lanzarInstalacion()) avisoExito('Eurcontroller se está instalando');
        pintar();
      },
    }, icono('movil-inicio'), 'Instalar app'));
  };

  pintar();
  alCambiarInstalacion(pintar);
  return contenedor;
}

function barraInferior() {
  const claves = Object.keys(VISTAS).filter((c) => VISTAS[c].enBarra);

  const boton = (clave) => el('button', {
    type: 'button', dataset: { ruta: clave }, onClick: () => irA(clave),
  }, icono(VISTAS[clave].icono), VISTAS[clave].etiqueta);

  const mas = el('button', {
    type: 'button',
    onClick: () => menu(mas, [
      { texto: 'Gastos fijos', icono: 'repetir', alPulsar: () => irA('recurrentes') },
      { texto: 'Categorías', icono: 'etiqueta', alPulsar: () => irA('categorias') },
      { texto: 'Ajustes', icono: 'ajustes', alPulsar: () => irA('ajustes') },
      estadoInstalacion().estado === 'disponible'
        ? {
            texto: 'Instalar app', icono: 'movil-inicio',
            alPulsar: async () => {
              if (await lanzarInstalacion()) avisoExito('Eurcontroller se está instalando');
            },
          }
        : null,
      'separador',
      { texto: 'Cerrar sesión', icono: 'salir', alPulsar: () => cerrarSesion() },
    ].filter(Boolean)),
  }, icono('mas-opciones'), 'Más');

  return el('nav', { class: 'nav-inferior', 'aria-label': 'Navegación principal' },
    el('div', { class: 'nav-inferior-lista' }, ...claves.map(boton), mas));
}

function menuPerfil(ancla) {
  menu(ancla, [
    { texto: 'Ajustes', icono: 'ajustes', alPulsar: () => irA('ajustes') },
    { texto: 'Descargar mis datos', icono: 'descarga', alPulsar: () => {
      window.location.href = new URL('api/cuenta.php?accion=exportar&formato=csv', BASE).href;
    } },
    'separador',
    { texto: 'Cerrar sesión', icono: 'salir', peligro: true, alPulsar: () => cerrarSesion() },
  ]);
}

async function cerrarSesion({ silencioso = false } = {}) {
  if (!silencioso) {
    try {
      await enviar('auth.php?accion=logout');
    } catch { /* la sesión se descarta igualmente en el cliente */ }
  }

  estado.usuario = null;
  estado.categorias = [];

  try {
    const sesion = await obtener('auth.php?accion=sesion');
    estado.csrf = sesion.csrf;
  } catch { /* sin token nuevo, el formulario mostrará el error al enviar */ }

  location.hash = '';
  pantallaAuth();
}


/* --- Montaje de vistas -------------------------------------------------------- */

async function montarRuta() {
  const { ruta } = rutaActual();
  const definicion = VISTAS[ruta] || VISTAS.panel;

  const contenido = document.getElementById('contenido');
  const acciones = document.getElementById('acciones');
  if (!contenido) return;

  // Da a la vista anterior la oportunidad de soltar sus escuchadores.
  contenido.dispatchEvent(new CustomEvent('vista:desmontar'));
  if (desmontarVista) { desmontarVista(); desmontarVista = null; }

  document.querySelectorAll('[data-ruta]').forEach((nodo) => {
    if (nodo.dataset.ruta === ruta) nodo.setAttribute('aria-current', 'page');
    else nodo.removeAttribute('aria-current');
  });

  const { meta } = definicion.modulo;
  document.querySelector('.topbar-titulo h1').textContent = meta.titulo;
  document.querySelector('.topbar-titulo p').textContent = meta.subtitulo;
  document.title = `${meta.titulo} · Eurcontroller`;

  window.scrollTo({ top: 0 });

  await definicion.modulo.montarVista(contenido, contexto(ruta));
  refrescarEstadoConexion();
}

function contexto(ruta) {
  return {
    acciones: document.getElementById('acciones'),
    periodo: estado.periodo,
    alCambiarPeriodo: (nuevo) => {
      estado.periodo = nuevo;
      if (CON_PERIODO.has(ruta)) montarRuta();
    },
    recargar: () => montarRuta(),
    alCerrarSesion: cerrarSesion,
  };
}

const recargarVista = () => montarRuta();

alCambiarRuta(() => { if (estado.usuario) montarRuta(); });


/* --- Conexión ----------------------------------------------------------------- */

function refrescarEstadoConexion() {
  const acciones = document.getElementById('acciones');
  if (!acciones) return;

  acciones.querySelector('[data-conexion]')?.remove();

  const pendientes = leerCola().length;
  if (navigator.onLine && !pendientes) return;

  acciones.prepend(el('span', {
    class: `chip ${navigator.onLine ? 'chip-aviso' : 'chip-gasto'}`,
    dataset: { conexion: '1' },
    title: navigator.onLine
      ? 'Hay movimientos guardados en este dispositivo pendientes de enviar'
      : 'Estás sin conexión: los movimientos nuevos se guardarán aquí',
  },
    icono(navigator.onLine ? 'sincronizar' : 'sin-conexion'),
    navigator.onLine ? `${pendientes} sin enviar` : 'Sin conexión'));
}

document.addEventListener('conexion:cambio', async (evento) => {
  refrescarEstadoConexion();

  if (evento.detail.enLinea && leerCola().length) {
    const { enviados } = await sincronizarCola();
    if (enviados) {
      avisoExito(`${enviados} movimiento(s) sincronizados`);
      montarRuta();
    }
    refrescarEstadoConexion();
  }
});

document.addEventListener('cola:cambio', refrescarEstadoConexion);

// Los colores de categoría se resuelven según el tema, así que al cambiarlo
// hay que volver a pintar la vista para que los gráficos se actualicen.
document.addEventListener('tema:cambio', () => { if (estado.usuario) montarRuta(); });


/* --- Service worker ------------------------------------------------------------ */

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register(new URL('sw.js', BASE).href, { scope: BASE })
    .catch((error) => console.warn('No se ha podido registrar el service worker', error));
}


arrancar();
