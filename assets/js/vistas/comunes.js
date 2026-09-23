/**
 * Piezas compartidas por varias vistas: selector de mes, filas de movimiento,
 * el formulario de alta/edición y la caché de categorías.
 */

import {
  el, icono, campo, campoImporte, selector, segmentado, modal, vacio, aviso, avisoExito,
} from '../ui.js';
import {
  estado, obtener, enviar, modificar, encolar, hoyISO, dinero, dineroConSigno,
  fechaRelativa, mesLargo, desplazarPeriodo, periodoActual, color,
  METODOS_PAGO,
} from '../core.js';

/** Recarga la caché de categorías del usuario. */
export async function cargarCategorias(forzar = false) {
  if (!forzar && estado.categorias.length) return estado.categorias;
  const { items } = await obtener('categorias.php');
  estado.categorias = items;
  return items;
}

export const categoriasDe = (tipo) =>
  estado.categorias.filter((c) => c.tipo === tipo && !c.archivada);


/* --- Selector de mes -------------------------------------------------------- */

/**
 * Navegación mes a mes. No deja avanzar más allá del mes en curso: no hay
 * datos futuros que mostrar y un mes vacío se confunde con un error.
 */
export function selectorPeriodo(periodo, alCambiar) {
  const etiqueta = el('strong', { class: 'num', style: { minWidth: '9.5ch', textAlign: 'center' } },
    mesLargo(periodo));

  const ir = (delta) => {
    const destino = desplazarPeriodo(periodo, delta);
    if (destino > periodoActual()) return;
    alCambiar(destino);
  };

  const siguiente = el('button', {
    type: 'button', class: 'btn btn-fantasma btn-icono btn-sm',
    'aria-label': 'Mes siguiente',
    disabled: periodo >= periodoActual(),
    onClick: () => ir(1),
  }, icono('flecha-derecha'));

  return el('div', { class: 'fila', style: { gap: '2px' } },
    el('button', {
      type: 'button', class: 'btn btn-fantasma btn-icono btn-sm',
      'aria-label': 'Mes anterior', onClick: () => ir(-1),
    }, icono('flecha-izquierda')),
    etiqueta,
    siguiente,
    periodo !== periodoActual()
      ? el('button', { type: 'button', class: 'btn btn-sm', onClick: () => alCambiar(periodoActual()) }, 'Hoy')
      : null);
}


/* --- Movimientos ------------------------------------------------------------ */

/** Fila de movimiento para las listas compactas. */
export function filaMovimiento(movimiento, { alPulsar = null } = {}) {
  const contenido = [
    el('div', { class: 'icono-cat', style: { '--c': color(movimiento.color) } },
      icono(movimiento.icono || 'etiqueta')),
    el('div', { class: 'lista-info' },
      el('strong', null, movimiento.descripcion || movimiento.categoria),
      el('small', null,
        `${movimiento.categoria} · ${fechaRelativa(movimiento.fecha)}`,
        movimiento.origen === 'recurrente' ? ' · fijo' : '',
        movimiento.origen === 'offline' ? ' · sin conexión' : '')),
    el('span', {
      class: `importe importe-${movimiento.tipo === 'ingreso' ? 'ingreso' : 'gasto'}`,
    }, dineroConSigno(movimiento.importe, movimiento.tipo)),
  ];

  return el('li', alPulsar ? { style: { cursor: 'pointer' }, onClick: alPulsar } : null, ...contenido);
}

/**
 * Formulario de alta o edición de un movimiento.
 * Si no hay conexión, el alta se guarda en la cola local y se envía después.
 *
 * @param {object|null} movimiento  null para un alta
 * @returns {Promise<boolean>} true si se guardó algo
 */
export async function formularioMovimiento(movimiento = null, { tipoInicial = 'gasto', valores = null } = {}) {
  await cargarCategorias();

  const edicion = Boolean(movimiento);
  // `inicial` rellena los campos; `edicion` decide si se hace POST o PUT. Así
  // «duplicar» reutiliza los datos de un movimiento existente para crear otro.
  const inicial = movimiento || valores;
  let tipo = inicial?.tipo || tipoInicial;

  if (!categoriasDe(tipo).length && !categoriasDe(tipo === 'gasto' ? 'ingreso' : 'gasto').length) {
    aviso('Crea primero una categoría en la sección Categorías.', 'error');
    return false;
  }

  const selectCategoria = selector({ name: 'categoria_id', required: true }, [], null);

  const refrescarCategorias = () => {
    const opciones = categoriasDe(tipo);
    selectCategoria.replaceChildren(...opciones.map((c) =>
      el('option', { value: c.id, selected: String(c.id) === String(inicial?.categoria_id) }, c.nombre)));

    if (!opciones.length) {
      selectCategoria.append(el('option', { value: '' }, `Sin categorías de ${tipo}`));
    }
  };
  refrescarCategorias();

  const entradaImporte = campoImporte('Importe', {
    name: 'importe', required: true, value: inicial ? String(inicial.importe) : '',
    placeholder: '0,00', autofocus: true,
  });

  const contenido = el('div', { class: 'pila' },
    segmentado(
      [{ valor: 'gasto', texto: 'Gasto' }, { valor: 'ingreso', texto: 'Ingreso' }],
      tipo,
      (nuevo) => { tipo = nuevo; refrescarCategorias(); },
      'segmentado-tipo'),

    entradaImporte,

    el('div', { class: 'rejilla rejilla-form' },
      campo('Categoría', selectCategoria),
      campo('Fecha', el('input', {
        type: 'date', name: 'fecha', required: true,
        value: movimiento?.fecha || hoyISO(), max: '2100-12-31',
      }))),

    campo('Descripción', el('input', {
      type: 'text', name: 'descripcion', maxlength: 180,
      value: inicial?.descripcion || '', placeholder: 'Opcional — p. ej. «Compra semanal»',
    })),

    campo('Método de pago', selector({ name: 'metodo_pago' },
      Object.entries(METODOS_PAGO).map(([valor, texto]) => ({ valor, texto })),
      inicial?.metodo_pago || 'tarjeta')));

  return modal({
    titulo: edicion ? 'Editar movimiento' : 'Nuevo movimiento',
    contenido,
    textoAceptar: edicion ? 'Guardar cambios' : 'Añadir',
    alAceptar: async () => {
      const formulario = contenido.closest('form');
      const datos = new FormData(formulario);

      const cuerpo = {
        tipo,
        categoria_id: Number(datos.get('categoria_id')),
        fecha: datos.get('fecha'),
        importe: Number(String(datos.get('importe')).replace(',', '.')),
        descripcion: datos.get('descripcion') || null,
        metodo_pago: datos.get('metodo_pago'),
      };

      if (!cuerpo.categoria_id) throw new Error('Elige una categoría');
      if (!(cuerpo.importe > 0)) throw new Error('El importe debe ser mayor que cero');

      if (edicion) {
        await modificar(`transacciones.php?id=${movimiento.id}`, cuerpo);
        avisoExito('Movimiento actualizado');
        return true;
      }

      if (!navigator.onLine) {
        encolar(cuerpo);
        aviso('Guardado sin conexión. Se enviará al recuperarla.', 'info');
        return true;
      }

      await enviar('transacciones.php', cuerpo);
      avisoExito(`${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} de ${dinero(cuerpo.importe)} registrado`);
      return true;
    },
  });
}


/* --- Utilidades de vista ---------------------------------------------------- */

export function tarjeta({ titulo, subtitulo, acciones = null, cuerpo, pie = null, sinRelleno = false }) {
  return el('section', { class: 'tarjeta' },
    titulo
      ? el('header', { class: 'tarjeta-cab' },
          el('div', { class: 'crece' },
            el('h2', null, titulo),
            subtitulo ? el('p', null, subtitulo) : null),
          acciones ? el('div', { class: 'fila-fin' }, acciones) : null)
      : null,
    el('div', { class: `tarjeta-cuerpo ${sinRelleno ? 'sin-relleno' : ''}`.trim() }, cuerpo),
    pie ? el('footer', { class: 'tarjeta-pie' }, pie) : null);
}

export const estadoVacio = vacio;

/** Envuelve el montaje de una vista y muestra el error sin romper el shell. */
export async function protegido(contenedor, trabajo) {
  try {
    await trabajo();
  } catch (error) {
    if (error.estado === 401) return;   // el shell ya redirige al login
    contenedor.replaceChildren(
      vacio({
        icono: 'alerta',
        titulo: 'No se han podido cargar los datos',
        texto: error.message,
        accion: el('button', {
          type: 'button', class: 'btn btn-principal', onClick: () => location.reload(),
        }, 'Reintentar'),
      }));
  }
}
