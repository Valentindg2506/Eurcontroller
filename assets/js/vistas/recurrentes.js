/**
 * Movimientos recurrentes: alquiler, suscripciones, nómina…
 * El servidor los convierte en movimientos reales cuando llega su fecha, así
 * que aquí solo se definen y se consultan.
 */

import {
  el, icono, vaciar, campo, campoImporte, selector, interruptor, segmentado,
  modal, confirmar, avisoExito, esqueletoLista, menu, banda,
} from '../ui.js';
import {
  obtener, enviar, modificar, borrar, dinero, fechaLarga, fechaRelativa, hoyISO, color,
  METODOS_PAGO, FRECUENCIAS,
} from '../core.js';
import { tarjeta, cargarCategorias, categoriasDe, estadoVacio, protegido } from './comunes.js';

export const meta = { titulo: 'Gastos fijos', subtitulo: 'Lo que se repite cada mes' };

export async function montarVista(contenedor, { acciones, recargar }) {
  vaciar(acciones).append(el('button', {
    type: 'button', class: 'btn btn-principal btn-sm',
    onClick: async () => { if (await formulario()) recargar(); },
  }, icono('mas'), 'Nuevo fijo'));

  contenedor.replaceChildren(el('div', { class: 'tarjeta' }, esqueletoLista(4)));

  await protegido(contenedor, async () => {
    await cargarCategorias();
    const { items, totales } = await obtener('recurrentes.php');
    contenedor.replaceChildren(construir(items, totales, recargar));
  });
}

function construir(items, totales, recargar) {
  if (!items.length) {
    return tarjeta({
      cuerpo: estadoVacio({
        icono: 'repetir',
        titulo: 'Sin movimientos fijos',
        texto: 'Da de alta el alquiler, las suscripciones o la nómina y se registrarán '
             + 'solos cada mes, sin que tengas que acordarte.',
        accion: el('button', {
          type: 'button', class: 'btn btn-principal',
          onClick: async () => { if (await formulario()) recargar(); },
        }, icono('mas'), 'Crear el primero'),
      }),
    });
  }

  const activos = items.filter((i) => i.activa);
  const pausados = items.filter((i) => !i.activa);

  return el('div', { class: 'pila' },
    el('div', { class: 'rejilla rejilla-kpi' },
      el('article', { class: 'kpi', style: { '--c': 'var(--gasto)' } },
        el('div', { class: 'kpi-cab' },
          el('span', { class: 'kpi-etiqueta' }, 'Gasto fijo mensual'),
          el('span', { class: 'kpi-icono' }, icono('salida'))),
        el('span', { class: 'kpi-valor' }, dinero(totales.gasto_mensual)),
        el('div', { class: 'kpi-pie' }, 'Equivalente al mes de todos los fijos activos')),

      el('article', { class: 'kpi', style: { '--c': 'var(--ingreso)' } },
        el('div', { class: 'kpi-cab' },
          el('span', { class: 'kpi-etiqueta' }, 'Ingreso fijo mensual'),
          el('span', { class: 'kpi-icono' }, icono('entrada'))),
        el('span', { class: 'kpi-valor' }, dinero(totales.ingreso_mensual)),
        el('div', { class: 'kpi-pie' }, 'Nóminas y cobros periódicos')),

      el('article', { class: 'kpi', style: { '--c': totales.neto_mensual >= 0 ? 'var(--ingreso)' : 'var(--gasto)' } },
        el('div', { class: 'kpi-cab' },
          el('span', { class: 'kpi-etiqueta' }, 'Neto fijo'),
          el('span', { class: 'kpi-icono' }, icono('balanza'))),
        el('span', { class: 'kpi-valor' }, dinero(totales.neto_mensual)),
        el('div', { class: 'kpi-pie' }, 'Lo que te queda antes de gastos variables'))),

    tarjeta({
      titulo: 'Activos',
      subtitulo: `${activos.length} movimiento${activos.length === 1 ? '' : 's'} programado${activos.length === 1 ? '' : 's'}`,
      sinRelleno: true,
      cuerpo: activos.length
        ? el('ul', { class: 'lista' }, ...activos.map((i) => fila(i, recargar)))
        : estadoVacio({ icono: 'pausa', titulo: 'Todos están en pausa' }),
    }),

    pausados.length
      ? tarjeta({
          titulo: 'En pausa',
          subtitulo: 'No generan movimientos hasta que los reactives',
          sinRelleno: true,
          cuerpo: el('ul', { class: 'lista' }, ...pausados.map((i) => fila(i, recargar))),
        })
      : null);
}

function fila(item, recargar) {
  const boton = el('button', {
    type: 'button', class: 'btn btn-fantasma btn-icono btn-sm', 'aria-label': `Acciones de ${item.concepto}`,
    onClick: () => menu(boton, [
      {
        texto: 'Editar', icono: 'lapiz',
        alPulsar: async () => { if (await formulario(item)) recargar(); },
      },
      {
        texto: item.activa ? 'Pausar' : 'Reactivar',
        icono: item.activa ? 'pausa' : 'reproducir',
        alPulsar: async () => {
          await modificar(`recurrentes.php?id=${item.id}`, { ...item, activa: !item.activa });
          avisoExito(item.activa ? 'Movimiento fijo pausado' : 'Movimiento fijo reactivado');
          recargar();
        },
      },
      'separador',
      {
        texto: 'Eliminar', icono: 'papelera', peligro: true,
        alPulsar: async () => {
          const confirmado = await confirmar({
            titulo: `Eliminar «${item.concepto}»`,
            mensaje: 'Dejará de generarse cada periodo. Los movimientos ya creados se conservan.',
          });
          if (!confirmado) return;

          await borrar(`recurrentes.php?id=${item.id}`);
          avisoExito('Movimiento fijo eliminado');
          recargar();
        },
      },
    ]),
  }, icono('mas-opciones'));

  return el('li', null,
    el('span', { class: 'icono-cat', style: { '--c': color(item.color) } },
      icono(item.icono || 'repetir')),
    el('div', { class: 'lista-info' },
      el('strong', null, item.concepto),
      el('small', null,
        `${item.categoria} · ${FRECUENCIAS[item.frecuencia]}`,
        item.activa ? ` · próximo ${fechaRelativa(item.proxima_fecha).toLowerCase()}` : ' · en pausa')),
    el('div', { style: { textAlign: 'right' } },
      el('div', { class: `importe importe-${item.tipo === 'ingreso' ? 'ingreso' : 'gasto'}` },
        dinero(item.importe)),
      item.frecuencia !== 'mensual'
        ? el('small', { class: 'tenue diminuto num' }, `${dinero(item.mensualizado)}/mes`)
        : null),
    boton);
}

async function formulario(item = null) {
  await cargarCategorias();
  const edicion = Boolean(item);
  let tipo = item?.tipo || 'gasto';

  const selectCategoria = selector({ name: 'categoria_id', required: true }, [], null);

  const refrescarCategorias = () => {
    const opciones = categoriasDe(tipo);
    selectCategoria.replaceChildren(...opciones.map((c) =>
      el('option', { value: c.id, selected: String(c.id) === String(item?.categoria_id) }, c.nombre)));
    if (!opciones.length) selectCategoria.append(el('option', { value: '' }, `Sin categorías de ${tipo}`));
  };
  refrescarCategorias();

  const contenido = el('div', { class: 'pila' },
    segmentado(
      [{ valor: 'gasto', texto: 'Gasto fijo' }, { valor: 'ingreso', texto: 'Ingreso fijo' }],
      tipo,
      (nuevo) => { tipo = nuevo; refrescarCategorias(); },
      'segmentado-tipo'),

    campo('Concepto', el('input', {
      type: 'text', name: 'concepto', required: true, maxlength: 120,
      value: item?.concepto || '', placeholder: 'p. ej. Alquiler, Netflix, Nómina',
    })),

    el('div', { class: 'rejilla rejilla-form' },
      campoImporte('Importe', {
        name: 'importe', required: true, value: item ? String(item.importe) : '', placeholder: '0,00',
      }),
      campo('Frecuencia', selector({ name: 'frecuencia' },
        Object.entries(FRECUENCIAS).map(([valor, texto]) => ({ valor, texto })),
        item?.frecuencia || 'mensual'))),

    el('div', { class: 'rejilla rejilla-form' },
      campo('Categoría', selectCategoria),
      campo('Método de pago', selector({ name: 'metodo_pago' },
        Object.entries(METODOS_PAGO).map(([valor, texto]) => ({ valor, texto })),
        item?.metodo_pago || 'domiciliado'))),

    el('div', { class: 'rejilla rejilla-form' },
      campo('Próximo cargo', el('input', {
        type: 'date', name: 'proxima_fecha', required: true,
        value: item?.proxima_fecha || hoyISO(),
      })),
      campo('Hasta (opcional)', el('input', {
        type: 'date', name: 'fecha_fin', value: item?.fecha_fin || '',
      }), 'Déjalo vacío si no tiene fin')),

    edicion ? null : banda(
      'Si pones una fecha pasada, se crearán de golpe todos los movimientos vencidos hasta hoy.',
      'info'));

  return modal({
    titulo: edicion ? 'Editar movimiento fijo' : 'Nuevo movimiento fijo',
    contenido,
    textoAceptar: edicion ? 'Guardar cambios' : 'Crear',
    alAceptar: async () => {
      const datos = new FormData(contenido.closest('form'));
      const cuerpo = {
        tipo,
        categoria_id: Number(datos.get('categoria_id')),
        concepto: datos.get('concepto'),
        importe: Number(String(datos.get('importe')).replace(',', '.')),
        metodo_pago: datos.get('metodo_pago'),
        frecuencia: datos.get('frecuencia'),
        proxima_fecha: datos.get('proxima_fecha'),
        fecha_fin: datos.get('fecha_fin') || null,
        activa: item ? item.activa : true,
      };

      if (!cuerpo.categoria_id) throw new Error('Elige una categoría');

      if (edicion) {
        await modificar(`recurrentes.php?id=${item.id}`, cuerpo);
        avisoExito('Movimiento fijo actualizado');
      } else {
        await enviar('recurrentes.php', cuerpo);
        avisoExito('Movimiento fijo creado');
      }
      return true;
    },
  });
}
