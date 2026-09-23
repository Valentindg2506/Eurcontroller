/**
 * Capa de interfaz: construcción de DOM, iconos, avisos, modales y
 * los estados de carga / vacío que comparten todas las vistas.
 *
 * Todo el texto se inserta con textContent: no hay ningún punto donde un dato
 * del usuario pueda llegar a interpretarse como HTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Crea un elemento.
 *   el('div', { class: 'tarjeta' }, 'texto', otroNodo)
 * `props` admite class, dataset, style, atributos, propiedades y on<Evento>.
 */
export function el(etiqueta, props = null, ...hijos) {
  const nodo = document.createElement(etiqueta);

  if (props) {
    // `type` debe fijarse antes que `value`: algunos navegadores descartan el
    // valor si el input cambia de tipo después de recibirlo.
    if (props.type) nodo.type = props.type;

    for (const [clave, valor] of Object.entries(props)) {
      if (valor === null || valor === undefined || valor === false || clave === 'type') continue;

      if (clave === 'class') nodo.className = valor;
      else if (clave === 'dataset') Object.assign(nodo.dataset, valor);
      else if (clave === 'style') aplicarEstilo(nodo, valor);
      else if (clave === 'for') nodo.htmlFor = valor;
      else if (clave.startsWith('on') && typeof valor === 'function') {
        nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
      } else if (clave.includes('-') || clave.startsWith('aria')) {
        nodo.setAttribute(clave, valor === true ? '' : valor);
      } else if (clave in nodo) {
        nodo[clave] = valor;
      } else {
        nodo.setAttribute(clave, valor);
      }
    }
  }

  agregar(nodo, hijos);
  return nodo;
}

/**
 * Aplica un objeto de estilos.
 *
 * Las propiedades personalizadas (--c) hay que fijarlas con setProperty: una
 * asignación directa sobre CSSStyleDeclaration las descarta en silencio, y de
 * ellas dependen todos los colores por categoría de la aplicación.
 */
function aplicarEstilo(nodo, estilos) {
  for (const [propiedad, valor] of Object.entries(estilos)) {
    if (valor === null || valor === undefined) continue;
    if (propiedad.startsWith('--')) nodo.style.setProperty(propiedad, valor);
    else nodo.style[propiedad] = valor;
  }
}

/** Añade hijos aceptando nodos, texto, null y arrays anidados. */
export function agregar(padre, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    padre.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return padre;
}

export function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  return nodo;
}

/**
 * Icono del sprite SVG incrustado en index.html.
 *
 * Los atributos de trazo se ponen aquí y no en cada <symbol>: el contenido
 * referenciado por <use> hereda del elemento que lo referencia, así que basta
 * con declararlos una vez.
 */
export function icono(nombre, clase) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (clase) svg.setAttribute('class', clase);

  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${nombre}`);
  svg.appendChild(use);
  return svg;
}

/** Elemento SVG genérico, para los gráficos. */
export function svg(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElementNS(SVG_NS, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    nodo.setAttribute(clave, valor);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}


/* --- Componentes de formulario -------------------------------------------- */

export function campo(etiqueta, control, ayuda) {
  return el('label', { class: 'campo' },
    el('span', null, etiqueta),
    control,
    ayuda ? el('span', { class: 'campo-ayuda' }, ayuda) : null);
}

export function entrada(props) {
  return el('input', { type: 'text', ...props });
}

/** Campo de importe con el símbolo de la moneda incrustado. */
export function campoImporte(etiqueta, props = {}, simbolo = '€') {
  const input = el('input', { type: 'number', step: '0.01', min: '0.01', inputmode: 'decimal', ...props });
  return el('label', { class: 'campo' },
    el('span', null, etiqueta),
    el('div', { class: 'campo-importe', dataset: { simbolo } }, input));
}

export function selector(props, opciones, seleccionado) {
  const select = el('select', props);
  for (const opcion of opciones) {
    const { valor, texto } = typeof opcion === 'string' ? { valor: opcion, texto: opcion } : opcion;
    select.append(el('option', { value: valor, selected: String(valor) === String(seleccionado) }, texto));
  }
  return select;
}

export function interruptor(etiqueta, props = {}) {
  return el('label', { class: 'interruptor' },
    el('input', { type: 'checkbox', ...props }),
    el('span', { class: 'interruptor-pista' }),
    el('span', null, etiqueta));
}

/**
 * Control segmentado accesible.
 * @param {{valor: string, texto: string}[]} opciones
 * @param {(valor: string) => void} alCambiar
 */
export function segmentado(opciones, valorInicial, alCambiar, clase = '') {
  const contenedor = el('div', { class: `segmentado ${clase}`.trim(), role: 'group' });

  const botones = opciones.map((opcion, indice) =>
    el('button', {
      type: 'button',
      'aria-pressed': String(opcion.valor === valorInicial),
      dataset: { tipo: opcion.valor },
      onClick: () => {
        botones.forEach((otro, i) => otro.setAttribute('aria-pressed', String(i === indice)));
        alCambiar(opcion.valor);
      },
    }, opcion.texto));

  contenedor.append(...botones);
  return contenedor;
}

/** Selector de color a partir de la paleta de la aplicación. */
export function paletaColores(colores, seleccionado, alCambiar) {
  const contenedor = el('div', { class: 'paleta', role: 'group', 'aria-label': 'Color' });

  const botones = colores.map((hex, indice) =>
    el('button', {
      type: 'button',
      style: { background: hex },
      'aria-label': `Color ${hex}`,
      'aria-pressed': String(hex === seleccionado),
      onClick: () => {
        botones.forEach((otro, i) => otro.setAttribute('aria-pressed', String(i === indice)));
        alCambiar(hex);
      },
    }));

  contenedor.append(...botones);
  return contenedor;
}


/* --- Avisos ---------------------------------------------------------------- */

const ICONO_AVISO = { exito: 'check-circulo', error: 'alerta', info: 'info' };

export function aviso(mensaje, tipo = 'info', duracion = 4200) {
  const contenedor = document.getElementById('avisos');
  if (!contenedor) return;

  const nodo = el('div', { class: `aviso aviso-${tipo}`, role: tipo === 'error' ? 'alert' : 'status' },
    icono(ICONO_AVISO[tipo] || 'info'),
    el('div', { class: 'crece' }, mensaje));

  contenedor.append(nodo);
  requestAnimationFrame(() => nodo.classList.add('visible'));

  setTimeout(() => {
    nodo.classList.remove('visible');
    setTimeout(() => nodo.remove(), 250);
  }, duracion);
}

export const avisoExito = (mensaje) => aviso(mensaje, 'exito');
export const avisoError = (mensaje) => aviso(mensaje, 'error');

export function banda(mensaje, tipo = 'info') {
  return el('div', { class: `banda banda-${tipo}` },
    icono(ICONO_AVISO[tipo] || 'info'),
    el('span', null, mensaje));
}


/* --- Modales --------------------------------------------------------------- */

/**
 * Abre un modal. `alAceptar` puede ser asíncrono: mientras se resuelve, los
 * botones quedan deshabilitados y cualquier error se muestra dentro del modal
 * en lugar de cerrarlo (así no se pierde lo que el usuario había escrito).
 *
 * @returns {Promise<boolean>} true si se aceptó, false si se canceló
 */
export function modal({
  titulo,
  contenido,
  textoAceptar = 'Guardar',
  textoCancelar = 'Cancelar',
  peligro = false,
  sinPie = false,
  alAceptar = null,
}) {
  return new Promise((resolver) => {
    const errores = el('div', { class: 'oculto' });

    const botonAceptar = el('button', {
      type: 'submit',
      class: `btn ${peligro ? 'btn-peligro-solido' : 'btn-principal'}`,
    }, textoAceptar);

    const botonCancelar = el('button', {
      type: 'button',
      class: 'btn',
      onClick: () => cerrar(false),
    }, textoCancelar);

    const formulario = el('form', { method: 'dialog', novalidate: true },
      el('div', { class: 'modal-cuerpo' }, errores, contenido),
      sinPie ? null : el('div', { class: 'modal-pie' }, botonCancelar, botonAceptar));

    const dialogo = el('dialog', { class: 'modal', 'aria-label': titulo },
      el('div', { class: 'modal-cab' },
        el('h2', null, titulo),
        el('button', {
          type: 'button', class: 'btn btn-fantasma btn-icono btn-sm',
          'aria-label': 'Cerrar', onClick: () => cerrar(false),
        }, icono('cerrar'))),
      formulario);

    let resuelto = false;
    function cerrar(resultado) {
      if (resuelto) return;
      resuelto = true;
      dialogo.close();
      dialogo.remove();
      resolver(resultado);
    }

    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (!formulario.reportValidity()) return;

      if (!alAceptar) return cerrar(true);

      botonAceptar.disabled = true;
      botonCancelar.disabled = true;
      const textoOriginal = botonAceptar.textContent;
      botonAceptar.textContent = 'Guardando…';
      errores.classList.add('oculto');

      try {
        const resultado = await alAceptar();
        if (resultado !== false) return cerrar(true);
      } catch (error) {
        vaciar(errores).append(banda(error.message || 'No se ha podido guardar', 'error'));
        errores.classList.remove('oculto');
      }

      botonAceptar.disabled = false;
      botonCancelar.disabled = false;
      botonAceptar.textContent = textoOriginal;
    });

    // Escape y clic en el fondo cancelan.
    dialogo.addEventListener('cancel', (evento) => { evento.preventDefault(); cerrar(false); });
    dialogo.addEventListener('click', (evento) => { if (evento.target === dialogo) cerrar(false); });

    document.body.append(dialogo);
    dialogo.showModal();

    const primero = dialogo.querySelector('input:not([type="hidden"]), select, textarea');
    if (primero) primero.focus();
  });
}

/** Confirmación destructiva. @returns {Promise<boolean>} */
export function confirmar({ titulo, mensaje, textoAceptar = 'Eliminar', peligro = true }) {
  return modal({
    titulo,
    contenido: el('p', { class: 'silenciado' }, mensaje),
    textoAceptar,
    peligro,
  });
}

/** Menú contextual anclado a un botón. */
export function menu(ancla, elementos) {
  document.querySelectorAll('.menu').forEach((m) => m.remove());

  const contenedor = el('div', { class: 'menu', role: 'menu' });

  for (const item of elementos) {
    if (item === 'separador') {
      contenedor.append(el('hr'));
      continue;
    }
    contenedor.append(el('button', {
      type: 'button',
      role: 'menuitem',
      class: item.peligro ? 'peligro' : '',
      onClick: () => { contenedor.remove(); item.alPulsar(); },
    }, item.icono ? icono(item.icono) : null, item.texto));
  }

  document.body.append(contenedor);

  const caja = ancla.getBoundingClientRect();
  const alto = contenedor.offsetHeight;
  const abajo = caja.bottom + alto + 8 > window.innerHeight;

  contenedor.style.top = `${(abajo ? caja.top - alto - 6 : caja.bottom + 6) + window.scrollY}px`;
  contenedor.style.left = `${Math.max(8, Math.min(caja.right - contenedor.offsetWidth, window.innerWidth - contenedor.offsetWidth - 8)) + window.scrollX}px`;

  const fuera = (evento) => {
    if (!contenedor.contains(evento.target) && evento.target !== ancla) {
      contenedor.remove();
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', escape);
    }
  };
  const escape = (evento) => { if (evento.key === 'Escape') fuera({ target: document.body }); };

  setTimeout(() => {
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', escape);
  }, 0);

  return contenedor;
}


/* --- Estados --------------------------------------------------------------- */

export function vacio({ icono: nombreIcono = 'caja', titulo, texto, accion = null }) {
  return el('div', { class: 'vacio' },
    el('div', { class: 'vacio-icono' }, icono(nombreIcono)),
    el('h3', null, titulo),
    texto ? el('p', null, texto) : null,
    accion);
}

export function esqueleto(alto = 16, ancho = '100%') {
  return el('div', {
    class: 'esqueleto',
    style: { height: typeof alto === 'number' ? `${alto}px` : alto, width: ancho },
  });
}

/** Bloque de esqueletos con el que rellenar una tarjeta mientras carga. */
export function esqueletoLista(filas = 4) {
  return el('div', { class: 'pila-sm', style: { padding: '18px' }, 'aria-busy': 'true' },
    ...Array.from({ length: filas }, () =>
      el('div', { class: 'fila', style: { gap: '12px' } },
        esqueleto(34, '34px'),
        el('div', { class: 'crece pila-sm' }, esqueleto(12, '55%'), esqueleto(10, '32%')),
        esqueleto(14, '78px'))));
}

/** Botón que se deshabilita mientras la acción está en curso. */
export function botonAsincrono(props, ...hijos) {
  const { alPulsar, textoOcupado = 'Un momento…', ...resto } = props;

  const boton = el('button', {
    type: 'button',
    ...resto,
    onClick: async () => {
      const original = boton.textContent;
      boton.disabled = true;
      boton.textContent = textoOcupado;
      try {
        await alPulsar();
      } finally {
        boton.disabled = false;
        vaciar(boton);
        agregar(boton, [original]);
      }
    },
  }, ...hijos);

  return boton;
}
