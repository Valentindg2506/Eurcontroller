/**
 * Núcleo de la aplicación: cliente de API, estado compartido, formateo,
 * tema y cola de movimientos creados sin conexión.
 */

/* La base se resuelve a partir del documento, así la app funciona igual en la
   raíz del dominio que en un subdirectorio (/GitHub/Eurcontroller/). */
export const BASE = new URL('.', document.baseURI).href;
const API = new URL('api/', BASE).href;

export const estado = {
  usuario: null,
  csrf: null,
  categorias: [],
  periodo: periodoActual(),
  enLinea: navigator.onLine,
};

export function periodoActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

export function hoyISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}


/* --- Cliente de API ------------------------------------------------------- */

export class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

const suscriptores = { sesionCaducada: [] };

/** Permite que el shell reaccione cuando el servidor invalida la sesión. */
export function alCaducarSesion(fn) {
  suscriptores.sesionCaducada.push(fn);
}

/**
 * Envuelve fetch: adjunta la cookie de sesión y el token CSRF, y convierte
 * cualquier respuesta de error en una ErrorApi con el mensaje del servidor.
 */
export async function api(ruta, opciones = {}) {
  const cabeceras = { Accept: 'application/json', ...(opciones.headers || {}) };
  if (opciones.body !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (estado.csrf) cabeceras['X-CSRF-Token'] = estado.csrf;

  let respuesta;
  try {
    respuesta = await fetch(new URL(ruta, API).href, {
      credentials: 'same-origin',
      ...opciones,
      headers: cabeceras,
      body: opciones.body !== undefined && typeof opciones.body !== 'string'
        ? JSON.stringify(opciones.body)
        : opciones.body,
    });
  } catch {
    throw new ErrorApi('Sin conexión con el servidor', 0);
  }

  const tipo = respuesta.headers.get('Content-Type') || '';
  const datos = tipo.includes('application/json') ? await respuesta.json().catch(() => null) : null;

  if (!respuesta.ok) {
    if (respuesta.status === 401) suscriptores.sesionCaducada.forEach(fn => fn());
    throw new ErrorApi(datos?.error || `Error ${respuesta.status}`, respuesta.status);
  }
  return datos;
}

export const obtener  = (ruta) => api(ruta);
export const enviar   = (ruta, body) => api(ruta, { method: 'POST', body });
export const modificar = (ruta, body) => api(ruta, { method: 'PUT', body });
export const borrar   = (ruta, body) => api(ruta, { method: 'DELETE', ...(body ? { body } : {}) });

/** Construye una query string omitiendo los valores vacíos. */
export function query(parametros) {
  const qs = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== null && valor !== undefined && valor !== '') qs.set(clave, valor);
  }
  const texto = qs.toString();
  return texto ? `?${texto}` : '';
}


/* --- Formateo ------------------------------------------------------------- */

let formateadorDinero = null;
let formateadorCompacto = null;

export function configurarMoneda(moneda = 'EUR') {
  formateadorDinero = new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: moneda, minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  formateadorCompacto = new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: moneda, notation: 'compact', maximumFractionDigits: 1,
  });
}
configurarMoneda();

export function dinero(valor) {
  return formateadorDinero.format(Number(valor) || 0);
}

/** Versión abreviada (1,2 mil €) para ejes y etiquetas donde no cabe todo. */
export function dineroCorto(valor) {
  const n = Number(valor) || 0;
  return Math.abs(n) >= 1000 ? formateadorCompacto.format(n) : formateadorDinero.format(n);
}

/** Importe con signo explícito: la identidad no depende solo del color. */
export function dineroConSigno(valor, tipo) {
  return (tipo === 'ingreso' ? '+' : '−') + dinero(Math.abs(Number(valor) || 0)).replace('-', '');
}

export function porcentaje(valor, decimales = 0) {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'percent', minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  }).format(valor);
}

const FECHA_CORTA = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' });
const FECHA_LARGA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const MES_LARGO   = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const MES_CORTO   = new Intl.DateTimeFormat('es-ES', { month: 'short' });

/* Se construye con hora fija para que el desfase horario no reste un día. */
const comoFecha = (iso) => new Date(`${iso}T12:00:00`);

export const fechaCorta = (iso) => (iso ? FECHA_CORTA.format(comoFecha(iso)) : '—');
export const fechaLarga = (iso) => (iso ? FECHA_LARGA.format(comoFecha(iso)) : '—');
export const mesLargo   = (periodo) => capitalizar(MES_LARGO.format(comoFecha(`${periodo}-01`)));
export const mesCorto   = (periodo) => MES_CORTO.format(comoFecha(`${periodo}-01`)).replace('.', '');

export const capitalizar = (texto) => (texto ? texto[0].toUpperCase() + texto.slice(1) : '');

/** «hoy», «ayer» o la fecha corta. */
export function fechaRelativa(iso) {
  if (!iso) return '—';
  const dias = Math.round((comoFecha(iso) - comoFecha(hoyISO())) / 86400000);
  if (dias === 0) return 'Hoy';
  if (dias === -1) return 'Ayer';
  if (dias === 1) return 'Mañana';
  if (dias > 1 && dias <= 7) return `En ${dias} días`;
  return fechaCorta(iso);
}

export function desplazarPeriodo(periodo, meses) {
  const [anio, mes] = periodo.split('-').map(Number);
  const fecha = new Date(anio, mes - 1 + meses, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

export const rangoDelPeriodo = (periodo) => {
  const [anio, mes] = periodo.split('-').map(Number);
  const fin = new Date(anio, mes, 0);
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(fin.getDate()).padStart(2, '0')}` };
};

export const METODOS_PAGO = {
  tarjeta: 'Tarjeta',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  domiciliado: 'Domiciliado',
  bizum: 'Bizum',
  otro: 'Otro',
};

export const FRECUENCIAS = {
  semanal: 'Semanal',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  anual: 'Anual',
};


/* --- Color ---------------------------------------------------------------- */

/**
 * Las categorías guardan un único color pensado para fondo claro. Sobre la
 * superficie oscura esos tonos se salen de la banda de luminosidad, así que
 * cada uno tiene su versión escalonada para modo oscuro.
 */
const COLOR_OSCURO = {
  '#2a78d6': '#3987e5',
  '#eb6834': '#d95926',
  '#1baf7a': '#199e70',
  '#eda100': '#c98500',
  '#e87ba4': '#d55181',
  '#008300': '#008300',
  '#4a3aa7': '#9085e9',
  '#e34948': '#e66767',
};

export const PALETA = Object.keys(COLOR_OSCURO);

export function color(hex) {
  if (!hex) return 'var(--marca)';
  return temaResuelto() === 'oscuro' ? (COLOR_OSCURO[hex.toLowerCase()] || hex) : hex;
}


/* --- Tema ----------------------------------------------------------------- */

const consultaOscuro = window.matchMedia('(prefers-color-scheme: dark)');

export function temaResuelto() {
  return document.documentElement.dataset.tema === 'oscuro' ? 'oscuro' : 'claro';
}

/**
 * Aplica la preferencia ('sistema' | 'claro' | 'oscuro') al documento.
 *
 * `persistir: false` sirve para reaplicar el tema al arrancar sin dejar rastro
 * en localStorage: así se distingue «el usuario eligió sistema» de «el usuario
 * no ha elegido nada», que es lo que decide si manda el dispositivo o la cuenta.
 */
export function aplicarTema(preferencia = 'sistema', { persistir = true } = {}) {
  const resuelto = preferencia === 'sistema'
    ? (consultaOscuro.matches ? 'oscuro' : 'claro')
    : preferencia;

  document.documentElement.dataset.tema = resuelto;
  if (persistir) localStorage.setItem('eurc_tema', preferencia);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resuelto === 'oscuro' ? '#070b14' : '#f4f6fb';

  document.dispatchEvent(new CustomEvent('tema:cambio', { detail: { resuelto } }));
}

export const temaGuardado = () => localStorage.getItem('eurc_tema') || 'sistema';

/** true si el usuario ha elegido tema explícitamente en este dispositivo. */
export const hayTemaLocal = () => localStorage.getItem('eurc_tema') !== null;

consultaOscuro.addEventListener('change', () => {
  if (temaGuardado() === 'sistema') aplicarTema('sistema');
});


/* --- Cola sin conexión ----------------------------------------------------- */

const CLAVE_COLA = 'eurc_cola_offline';

/** Códigos que significan «estos datos nunca se van a aceptar». */
const DESCARTABLES = new Set([400, 404, 409, 422]);

const uuid = () =>
  (crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }));

export function leerCola() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COLA)) || [];
  } catch {
    return [];
  }
}

const guardarCola = (cola) => localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));

/** Encola un movimiento para enviarlo cuando vuelva la conexión. */
export function encolar(movimiento) {
  const cola = leerCola();
  cola.push({ ...movimiento, uid_local: uuid() });
  guardarCola(cola);
  document.dispatchEvent(new CustomEvent('cola:cambio', { detail: { pendientes: cola.length } }));
  return cola.length;
}

/**
 * Reenvía la cola. El servidor deduplica por uid_local, así que reintentar
 * nunca duplica un movimiento.
 *
 * @returns {Promise<{enviados: number, pendientes: number}>}
 */
export async function sincronizarCola() {
  if (!navigator.onLine) return { enviados: 0, pendientes: leerCola().length };

  let cola = leerCola();
  let enviados = 0;

  for (const movimiento of [...cola]) {
    try {
      await enviar('transacciones.php', movimiento);
      cola = cola.filter((m) => m.uid_local !== movimiento.uid_local);
      guardarCola(cola);
      enviados++;
    } catch (error) {
      // Un rechazo por datos inválidos no se va a resolver reintentando: se
      // descarta para que un registro corrupto no bloquee toda la cola. El
      // resto (sesión caducada, CSRF, límite de peticiones, errores del
      // servidor) sí son transitorios, así que se corta y se reintenta luego.
      if (DESCARTABLES.has(error.estado)) {
        cola = cola.filter((m) => m.uid_local !== movimiento.uid_local);
        guardarCola(cola);
        continue;
      }
      break;
    }
  }

  document.dispatchEvent(new CustomEvent('cola:cambio', { detail: { pendientes: cola.length } }));
  return { enviados, pendientes: cola.length };
}

window.addEventListener('online', () => {
  estado.enLinea = true;
  document.dispatchEvent(new CustomEvent('conexion:cambio', { detail: { enLinea: true } }));
});
window.addEventListener('offline', () => {
  estado.enLinea = false;
  document.dispatchEvent(new CustomEvent('conexion:cambio', { detail: { enLinea: false } }));
});
