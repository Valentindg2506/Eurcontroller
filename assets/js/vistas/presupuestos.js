/**
 * Presupuestos mensuales por categoría de gasto.
 * Cada fila muestra lo presupuestado, lo gastado y cuánto queda; si el mes
 * está en curso, además avisa cuando el ritmo de gasto va a desbordarlo.
 */

import {
  el, icono, vaciar, campoImporte, modal, confirmar, avisoExito, esqueletoLista, banda, menu,
} from '../ui.js';
import {
  obtener, modificar, enviar, borrar, query, dinero, porcentaje, color, mesLargo,
  desplazarPeriodo, periodoActual,
} from '../core.js';
import { barraProgreso } from '../charts.js';
import { tarjeta, selectorPeriodo, estadoVacio, protegido } from './comunes.js';

export const meta = { titulo: 'Presupuestos', subtitulo: 'Cuánto quieres gastar en cada cosa' };

/** Días transcurridos a partir de los cuales tiene sentido extrapolar el ritmo de gasto. */
const DIAS_MINIMOS_PROYECCION = 10;

export async function montarVista(contenedor, { acciones, periodo, alCambiarPeriodo, recargar }) {
  vaciar(acciones).append(
    selectorPeriodo(periodo, alCambiarPeriodo),
    el('button', {
      type: 'button', class: 'btn btn-sm',
      onClick: async () => {
        const origen = desplazarPeriodo(periodo, -1);
        const confirmado = await confirmar({
          titulo: 'Copiar del mes anterior',
          mensaje: `Se copiarán los presupuestos de ${mesLargo(origen)} a ${mesLargo(periodo)}. `
                 + 'Los que ya existan en el mes de destino se sobrescribirán.',
          textoAceptar: 'Copiar',
          peligro: false,
        });
        if (!confirmado) return;

        const respuesta = await enviar('presupuestos.php?accion=copiar', { origen, destino: periodo });
        avisoExito(respuesta.copiados ? 'Presupuestos copiados' : 'El mes anterior no tenía presupuestos');
        recargar();
      },
    }, icono('copiar'), 'Copiar mes anterior'));

  contenedor.replaceChildren(el('div', { class: 'tarjeta' }, esqueletoLista(6)));

  await protegido(contenedor, async () => {
    const datos = await obtener(`presupuestos.php${query({ periodo })}`);
    contenedor.replaceChildren(construir(datos, periodo, recargar));
  });
}

function construir(datos, periodo, recargar) {
  const { items, totales } = datos;
  const conPresupuesto = items.filter((i) => i.presupuesto > 0);
  const sinPresupuesto = items.filter((i) => i.presupuesto === 0);

  const raiz = el('div', { class: 'pila' });

  /* Progreso global */
  if (conPresupuesto.length) {
    const uso = totales.presupuestado > 0 ? totales.gastado / totales.presupuestado : 0;
    const restante = totales.presupuestado - totales.gastado;

    raiz.append(tarjeta({
      titulo: `Presupuesto de ${mesLargo(periodo)}`,
      subtitulo: `${conPresupuesto.length} categoría${conPresupuesto.length > 1 ? 's' : ''} con límite`,
      acciones: totales.excedidas > 0
        ? el('span', { class: 'chip chip-gasto' }, icono('alerta'),
            `${totales.excedidas} excedido${totales.excedidas > 1 ? 's' : ''}`)
        : el('span', { class: 'chip chip-ingreso' }, icono('check'), 'Dentro del límite'),
      cuerpo: el('div', { class: 'pila-sm' },
        el('div', { class: 'fila' },
          el('span', { class: 'kpi-valor' }, dinero(totales.gastado)),
          el('span', { class: 'silenciado' }, `de ${dinero(totales.presupuestado)}`)),
        barraProgreso(uso, 'var(--marca)', { alta: true, excedido: uso > 1 }),
        el('div', { class: 'fila pequeno' },
          el('span', { class: 'tenue' }, `${porcentaje(uso)} consumido`),
          el('span', { class: `fila-fin negrita ${restante >= 0 ? 'importe-ingreso' : 'importe-gasto'}` },
            restante >= 0 ? `Quedan ${dinero(restante)}` : `Excedido en ${dinero(-restante)}`))),
    }));
  }

  /* Categorías con presupuesto */
  raiz.append(tarjeta({
    titulo: 'Por categoría',
    subtitulo: conPresupuesto.length ? null : 'Todavía no has fijado ningún límite',
    sinRelleno: Boolean(conPresupuesto.length),
    cuerpo: conPresupuesto.length
      ? el('div', null, ...conPresupuesto.map((i) => filaPresupuesto(i, periodo, recargar, true)))
      : estadoVacio({
          icono: 'diana',
          titulo: 'Sin presupuestos este mes',
          texto: 'Elige una categoría de la lista de abajo y ponle un límite mensual.',
        }),
  }));

  /* Categorías sin presupuesto */
  if (sinPresupuesto.length) {
    raiz.append(tarjeta({
      titulo: 'Sin presupuesto',
      subtitulo: 'Pulsa en una para asignarle un límite este mes',
      sinRelleno: true,
      cuerpo: el('ul', { class: 'lista' }, ...sinPresupuesto.map((i) =>
        el('li', {
          style: { cursor: 'pointer' },
          onClick: async () => { if (await formulario(i, periodo)) recargar(); },
        },
          el('span', { class: 'icono-cat', style: { '--c': color(i.color) } },
            icono(i.icono || 'etiqueta')),
          el('div', { class: 'lista-info' },
            el('strong', null, i.nombre),
            el('small', null, i.gastado > 0 ? `Llevas ${dinero(i.gastado)} gastados` : 'Sin gasto este mes')),
          el('span', { class: 'btn btn-fantasma btn-sm' }, icono('mas'), 'Fijar límite')))),
    }));
  }

  return raiz;
}

function filaPresupuesto(item, periodo, recargar, editable) {
  const uso = item.uso || 0;
  const excedido = uso > 1;
  const enCurso = periodo === periodoActual();

  // Con el mes a medias, lo útil no es el gasto acumulado sino si el ritmo
  // actual va a desbordar el límite antes de que acabe. Se exige un mínimo de
  // días para no extrapolar sobre cuatro datos: un recibo cobrado el día 2
  // daría una proyección disparatada.
  const hoy = new Date();
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const proyeccion = enCurso ? (item.gastado / hoy.getDate()) * diasMes : item.gastado;
  const riesgo = enCurso && !excedido
    && hoy.getDate() >= DIAS_MINIMOS_PROYECCION
    && proyeccion > item.presupuesto;

  return el('div', {
    style: { padding: '14px 18px', borderBottom: '1px solid var(--borde)' },
  },
    el('div', { class: 'fila', style: { marginBottom: '8px' } },
      el('span', { class: 'icono-cat sm', style: { '--c': color(item.color) } },
        icono(item.icono || 'etiqueta')),
      el('div', { class: 'crece' },
        el('strong', { class: 'pequeno' }, item.nombre),
        el('div', { class: 'diminuto tenue num' },
          `${dinero(item.gastado)} de ${dinero(item.presupuesto)}`)),
      el('span', {
        class: `negrita num pequeno ${excedido ? 'importe-gasto' : 'importe-ingreso'}`,
      }, excedido ? `−${dinero(item.gastado - item.presupuesto)}` : dinero(item.restante)),
      editable ? menuFila(item, periodo, recargar) : null),

    barraProgreso(uso, color(item.color), { excedido }),

    excedido || riesgo
      ? el('div', { class: 'diminuto', style: { marginTop: '6px' } },
          el('span', { class: excedido ? 'importe-gasto' : '', style: excedido ? null : { color: 'var(--aviso)' } },
            excedido
              ? `Has superado el límite en ${dinero(item.gastado - item.presupuesto)}`
              : `A este ritmo acabarás el mes en ${dinero(proyeccion)}`))
      : null);
}

function menuFila(item, periodo, recargar) {
  const boton = el('button', {
    type: 'button', class: 'btn btn-fantasma btn-icono btn-sm',
    'aria-label': `Acciones de ${item.nombre}`,
    onClick: () => menu(boton, [
      {
        texto: 'Editar límite', icono: 'lapiz',
        alPulsar: async () => { if (await formulario(item, periodo)) recargar(); },
      },
      'separador',
      {
        texto: 'Quitar límite', icono: 'papelera', peligro: true,
        alPulsar: async () => {
          const confirmado = await confirmar({
            titulo: `Quitar el presupuesto de «${item.nombre}»`,
            mensaje: `Dejará de haber límite en ${mesLargo(periodo)}. Los movimientos no se tocan.`,
            textoAceptar: 'Quitar',
          });
          if (!confirmado) return;

          await borrar(`presupuestos.php${query({ categoria_id: item.categoria_id, periodo })}`);
          avisoExito('Presupuesto eliminado');
          recargar();
        },
      },
    ]),
  }, icono('mas-opciones'));

  return boton;
}

async function formulario(item, periodo) {
  const existe = item.presupuesto > 0;

  const contenido = el('div', { class: 'pila' },
    el('div', { class: 'fila' },
      el('span', { class: 'icono-cat', style: { '--c': color(item.color) } },
        icono(item.icono || 'etiqueta')),
      el('div', null,
        el('strong', null, item.nombre),
        el('div', { class: 'diminuto tenue' }, mesLargo(periodo)))),

    campoImporte('Límite mensual', {
      name: 'importe', required: true,
      value: existe ? String(item.presupuesto) : '',
      placeholder: '0,00',
    }),

    item.gastado > 0
      ? banda(`Este mes ya llevas ${dinero(item.gastado)} gastados en esta categoría.`, 'info')
      : null);

  return modal({
    titulo: existe ? 'Editar presupuesto' : 'Nuevo presupuesto',
    contenido,
    textoAceptar: 'Guardar',
    alAceptar: async () => {
      const datos = new FormData(contenido.closest('form'));
      await modificar('presupuestos.php', {
        categoria_id: item.categoria_id,
        periodo,
        importe: Number(String(datos.get('importe')).replace(',', '.')),
      });
      avisoExito('Presupuesto guardado');
      return true;
    },
  });
}
