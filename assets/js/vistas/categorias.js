/**
 * Categorías: alta, edición, archivado y borrado.
 * El color elegido aquí es el que usan los gráficos del panel.
 */

import {
  el, icono, vaciar, campo, selector, paletaColores, modal, confirmar,
  avisoExito, aviso, esqueletoLista, menu,
} from '../ui.js';
import { obtener, enviar, modificar, borrar, dinero, color, PALETA } from '../core.js';
import { tarjeta, cargarCategorias, estadoVacio, protegido } from './comunes.js';

export const meta = { titulo: 'Categorías', subtitulo: 'Cómo se clasifican tus movimientos' };

const ICONOS = [
  'etiqueta', 'carrito', 'casa', 'transporte', 'ocio', 'salud', 'compras',
  'repetir', 'trabajo', 'entrada', 'restaurante', 'educacion', 'mascota',
  'regalo', 'viaje', 'movil', 'hucha', 'rayo',
];

export async function montarVista(contenedor, { acciones, recargar }) {
  vaciar(acciones).append(el('button', {
    type: 'button', class: 'btn btn-principal btn-sm',
    onClick: async () => { if (await formulario()) recargar(); },
  }, icono('mas'), 'Nueva categoría'));

  contenedor.replaceChildren(el('div', { class: 'tarjeta' }, esqueletoLista(6)));

  await protegido(contenedor, async () => {
    const { items } = await obtener('categorias.php');

    const gastos = items.filter((c) => c.tipo === 'gasto' && !c.archivada);
    const ingresos = items.filter((c) => c.tipo === 'ingreso' && !c.archivada);
    const archivadas = items.filter((c) => c.archivada);

    contenedor.replaceChildren(el('div', { class: 'pila' },
      seccion('Gastos', gastos, recargar, 'gasto'),
      seccion('Ingresos', ingresos, recargar, 'ingreso'),
      archivadas.length ? seccion('Archivadas', archivadas, recargar, null, true) : null));
  });
}

function seccion(titulo, categorias, recargar, tipo, esArchivo = false) {
  return tarjeta({
    titulo,
    subtitulo: esArchivo
      ? 'Ya no aparecen en los formularios, pero conservan su histórico'
      : `${categorias.length} categoría${categorias.length === 1 ? '' : 's'}`,
    sinRelleno: true,
    cuerpo: categorias.length
      ? el('ul', { class: 'lista' }, ...categorias.map((c) => fila(c, recargar)))
      : estadoVacio({
          icono: 'etiqueta',
          titulo: `Sin categorías de ${tipo === 'gasto' ? 'gasto' : 'ingreso'}`,
          texto: 'Créala para poder clasificar tus movimientos.',
          accion: el('button', {
            type: 'button', class: 'btn btn-principal',
            onClick: async () => { if (await formulario(null, tipo)) recargar(); },
          }, icono('mas'), 'Crear categoría'),
        }),
  });
}

function fila(categoria, recargar) {
  const boton = el('button', {
    type: 'button', class: 'btn btn-fantasma btn-icono btn-sm', 'aria-label': `Acciones de ${categoria.nombre}`,
    onClick: () => menu(boton, [
      {
        texto: 'Editar', icono: 'lapiz',
        alPulsar: async () => { if (await formulario(categoria)) recargar(); },
      },
      {
        texto: categoria.archivada ? 'Reactivar' : 'Archivar',
        icono: categoria.archivada ? 'deshacer' : 'archivo',
        alPulsar: async () => {
          await modificar(`categorias.php?id=${categoria.id}`, {
            ...categoria, archivada: !categoria.archivada,
          });
          avisoExito(categoria.archivada ? 'Categoría reactivada' : 'Categoría archivada');
          recargar();
        },
      },
      'separador',
      {
        texto: 'Eliminar', icono: 'papelera', peligro: true,
        alPulsar: async () => {
          const confirmado = await confirmar({
            titulo: `Eliminar «${categoria.nombre}»`,
            mensaje: categoria.movimientos > 0
              ? `Tiene ${categoria.movimientos} movimiento(s) asociados, así que se archivará `
                + 'en lugar de borrarse para no perder el histórico.'
              : 'La categoría se eliminará definitivamente.',
            textoAceptar: categoria.movimientos > 0 ? 'Archivar' : 'Eliminar',
          });
          if (!confirmado) return;

          const respuesta = await borrar(`categorias.php?id=${categoria.id}`);
          aviso(respuesta.mensaje || 'Categoría eliminada', 'exito');
          recargar();
        },
      },
    ]),
  }, icono('mas-opciones'));

  return el('li', null,
    el('span', { class: 'icono-cat', style: { '--c': color(categoria.color) } },
      icono(categoria.icono || 'etiqueta')),
    el('div', { class: 'lista-info' },
      el('strong', null, categoria.nombre),
      el('small', null,
        categoria.movimientos
          ? `${categoria.movimientos} movimiento${categoria.movimientos > 1 ? 's' : ''} · ${dinero(categoria.total)}`
          : 'Sin movimientos')),
    categoria.archivada ? el('span', { class: 'chip' }, 'Archivada') : null,
    boton);
}

/** Alta o edición. @returns {Promise<boolean>} */
async function formulario(categoria = null, tipoInicial = 'gasto') {
  const edicion = Boolean(categoria);
  let colorElegido = categoria?.color || PALETA[0];
  let iconoElegido = categoria?.icono || 'etiqueta';

  const vistaPrevia = el('span', {
    class: 'icono-cat', style: { '--c': color(colorElegido) },
  }, icono(iconoElegido));

  const refrescarVistaPrevia = () => {
    vistaPrevia.style.setProperty('--c', color(colorElegido));
    vaciar(vistaPrevia).append(icono(iconoElegido));
  };

  const rejillaIconos = el('div', { class: 'paleta', role: 'group', 'aria-label': 'Icono' });
  const botonesIcono = ICONOS.map((nombre, indice) =>
    el('button', {
      type: 'button',
      class: 'btn btn-icono btn-sm',
      'aria-label': nombre,
      'aria-pressed': String(nombre === iconoElegido),
      style: { borderRadius: '999px' },
      onClick: () => {
        iconoElegido = nombre;
        botonesIcono.forEach((b, i) => b.setAttribute('aria-pressed', String(i === indice)));
        refrescarVistaPrevia();
      },
    }, icono(nombre)));
  rejillaIconos.append(...botonesIcono);

  const contenido = el('div', { class: 'pila' },
    el('div', { class: 'fila' }, vistaPrevia,
      el('span', { class: 'pequeno tenue' }, 'Así se verá en las listas y los gráficos')),

    campo('Nombre', el('input', {
      type: 'text', name: 'nombre', required: true, maxlength: 80,
      value: categoria?.nombre || '', placeholder: 'p. ej. Alimentación',
    })),

    edicion
      ? null
      : campo('Tipo', selector({ name: 'tipo' }, [
          { valor: 'gasto', texto: 'Gasto' },
          { valor: 'ingreso', texto: 'Ingreso' },
        ], tipoInicial),
        'El tipo no se puede cambiar después: los movimientos ya clasificados dejarían de cuadrar.'),

    campo('Color', paletaColores(PALETA, colorElegido, (hex) => {
      colorElegido = hex;
      refrescarVistaPrevia();
    })),

    campo('Icono', rejillaIconos));

  return modal({
    titulo: edicion ? `Editar «${categoria.nombre}»` : 'Nueva categoría',
    contenido,
    textoAceptar: edicion ? 'Guardar cambios' : 'Crear',
    alAceptar: async () => {
      const datos = new FormData(contenido.closest('form'));
      const cuerpo = {
        nombre: datos.get('nombre'),
        color: colorElegido,
        icono: iconoElegido,
      };

      if (edicion) {
        await modificar(`categorias.php?id=${categoria.id}`, { ...cuerpo, archivada: categoria.archivada });
        avisoExito('Categoría actualizada');
      } else {
        await enviar('categorias.php', { ...cuerpo, tipo: datos.get('tipo') });
        avisoExito('Categoría creada');
      }

      await cargarCategorias(true);
      return true;
    },
  });
}
