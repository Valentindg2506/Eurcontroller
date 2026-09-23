/**
 * Movimientos: listado filtrable y paginado, con alta, edición y baja.
 * En pantallas estrechas la tabla se sustituye por una lista, que es lo que
 * de verdad se lee bien en un móvil.
 */

import {
  el, icono, vaciar, campo, selector, confirmar, avisoExito, esqueletoLista, menu,
} from '../ui.js';
import {
  estado, obtener, borrar, query, dinero, dineroConSigno, fechaCorta, fechaLarga, color,
  BASE, METODOS_PAGO,
} from '../core.js';
import {
  tarjeta, filaMovimiento, formularioMovimiento, cargarCategorias, estadoVacio, protegido,
} from './comunes.js';

export const meta = { titulo: 'Movimientos', subtitulo: 'Todos tus gastos e ingresos' };

const FILTROS_VACIOS = {
  buscar: '', desde: '', hasta: '', tipo: '', categoria_id: '', metodo_pago: '', pagina: 1,
};

let filtros = { ...FILTROS_VACIOS };

const estrecha = window.matchMedia('(max-width: 760px)');

export async function montarVista(contenedor, { acciones, recargar }) {
  vaciar(acciones).append(
    el('button', {
      type: 'button', class: 'btn btn-sm',
      onClick: () => { window.location.href = new URL('api/cuenta.php?accion=exportar&formato=csv', BASE).href; },
    }, icono('descarga'), 'Exportar'),
    el('button', {
      type: 'button', class: 'btn btn-principal btn-sm',
      onClick: async () => { if (await formularioMovimiento()) recargar(); },
    }, icono('mas'), 'Nuevo'));

  const barraFiltros = el('div');
  const resultados = el('div');

  contenedor.replaceChildren(el('div', { class: 'pila' }, barraFiltros, resultados));

  const recargarLista = async () => {
    resultados.replaceChildren(el('div', { class: 'tarjeta' }, esqueletoLista(6)));
    await protegido(resultados, async () => {
      const datos = await obtener(`transacciones.php${query(filtros)}`);
      resultados.replaceChildren(construirResultados(datos, recargarLista));
    });
  };

  await protegido(contenedor, async () => {
    await cargarCategorias();
    barraFiltros.replaceChildren(construirFiltros(recargarLista));
    await recargarLista();
  });

  // Cambiar de tabla a lista (o al revés) requiere volver a pintar.
  const alCambiarAncho = () => recargarLista();
  estrecha.addEventListener('change', alCambiarAncho);
  contenedor.addEventListener('vista:desmontar', () => estrecha.removeEventListener('change', alCambiarAncho), { once: true });
}


/* --- Filtros ---------------------------------------------------------------- */

function construirFiltros(recargar) {
  let temporizador = null;

  const aplicar = (retardo = 0) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { filtros.pagina = 1; recargar(); }, retardo);
  };

  const busqueda = el('input', {
    type: 'search', placeholder: 'Buscar por concepto o categoría', value: filtros.buscar,
    onInput: (e) => { filtros.buscar = e.target.value; aplicar(320); },
  });

  const campos = [
    el('label', { class: 'campo crece', style: { minWidth: '220px' } },
      el('span', null, 'Buscar'),
      el('div', { class: 'campo-busqueda' }, icono('lupa'), busqueda)),

    campo('Desde', el('input', {
      type: 'date', value: filtros.desde,
      onChange: (e) => { filtros.desde = e.target.value; aplicar(); },
    })),

    campo('Hasta', el('input', {
      type: 'date', value: filtros.hasta,
      onChange: (e) => { filtros.hasta = e.target.value; aplicar(); },
    })),

    campo('Tipo', selector({
      onChange: (e) => { filtros.tipo = e.target.value; aplicar(); },
    }, [
      { valor: '', texto: 'Todos' },
      { valor: 'gasto', texto: 'Solo gastos' },
      { valor: 'ingreso', texto: 'Solo ingresos' },
    ], filtros.tipo)),

    campo('Categoría', selector({
      onChange: (e) => { filtros.categoria_id = e.target.value; aplicar(); },
    }, [
      { valor: '', texto: 'Todas' },
      ...cargarOpcionesCategoria(),
    ], filtros.categoria_id)),

    campo('Método', selector({
      onChange: (e) => { filtros.metodo_pago = e.target.value; aplicar(); },
    }, [
      { valor: '', texto: 'Todos' },
      ...Object.entries(METODOS_PAGO).map(([valor, texto]) => ({ valor, texto })),
    ], filtros.metodo_pago)),
  ];

  const hayFiltros = Object.entries(filtros)
    .some(([clave, valor]) => clave !== 'pagina' && valor !== '');

  return tarjeta({
    cuerpo: el('div', { class: 'pila-sm' },
      el('div', { class: 'rejilla rejilla-form' }, ...campos),
      hayFiltros
        ? el('div', { class: 'fila' },
            el('button', {
              type: 'button', class: 'btn btn-fantasma btn-sm',
              onClick: () => { filtros = { ...FILTROS_VACIOS }; recargar(); },
            }, icono('cerrar'), 'Limpiar filtros'))
        : null),
  });
}

function cargarOpcionesCategoria() {
  return estado.categorias.map((c) => ({
    valor: c.id,
    texto: `${c.nombre} (${c.tipo})`,
  }));
}


/* --- Resultados ------------------------------------------------------------- */

function construirResultados(datos, recargar) {
  const { items, total, pagina, paginas, totales } = datos;

  if (!total) {
    return tarjeta({
      cuerpo: estadoVacio({
        icono: 'lupa',
        titulo: 'Ningún movimiento coincide',
        texto: 'Prueba a ampliar el rango de fechas o a quitar algún filtro.',
      }),
    });
  }

  const resumen = el('div', { class: 'fila diminuto', style: { gap: '18px' } },
    el('span', null, el('strong', { class: 'num' }, String(total)),
      ` movimiento${total > 1 ? 's' : ''}`),
    el('span', { class: 'importe-ingreso' }, `Ingresos ${dinero(totales.ingresos)}`),
    el('span', { class: 'importe-gasto' }, `Gastos ${dinero(totales.gastos)}`),
    el('span', { class: 'negrita' }, `Saldo ${dinero(totales.saldo)}`));

  return tarjeta({
    titulo: 'Listado',
    acciones: resumen,
    sinRelleno: true,
    cuerpo: estrecha.matches ? construirLista(items, recargar) : construirTabla(items, recargar),
    pie: paginas > 1 ? construirPaginacion(pagina, paginas, total, recargar) : null,
  });
}

function acciones(movimiento, recargar) {
  const boton = el('button', {
    type: 'button', class: 'btn btn-fantasma btn-icono btn-sm', 'aria-label': 'Acciones',
    onClick: () => menu(boton, [
      {
        texto: 'Editar', icono: 'lapiz',
        alPulsar: async () => { if (await formularioMovimiento(movimiento)) recargar(); },
      },
      {
        texto: 'Duplicar', icono: 'copiar',
        // Se abre un alta ya rellenada con los mismos datos: el modal la trata
        // como nueva porque el registro que recibe no lleva id.
        alPulsar: async () => {
          const { id, ...copia } = movimiento;
          if (await formularioMovimiento(null, { tipoInicial: movimiento.tipo, valores: copia })) {
            recargar();
          }
        },
      },
      'separador',
      {
        texto: 'Eliminar', icono: 'papelera', peligro: true,
        alPulsar: async () => {
          const confirmado = await confirmar({
            titulo: 'Eliminar movimiento',
            mensaje: `Se eliminará «${movimiento.descripcion || movimiento.categoria}» `
                   + `de ${dinero(movimiento.importe)} del ${fechaLarga(movimiento.fecha)}. `
                   + 'Esta acción no se puede deshacer.',
          });
          if (!confirmado) return;
          await borrar(`transacciones.php?id=${movimiento.id}`);
          avisoExito('Movimiento eliminado');
          recargar();
        },
      },
    ]),
  }, icono('mas-opciones'));

  return boton;
}

function construirTabla(items, recargar) {
  return el('div', { class: 'tabla-scroll' },
    el('table', { class: 'tabla' },
      el('thead', null, el('tr', null,
        el('th', null, 'Fecha'),
        el('th', null, 'Concepto'),
        el('th', null, 'Método'),
        el('th', { class: 'col-num' }, 'Importe'),
        el('th', { class: 'col-acciones' }, el('span', { class: 'solo-lectores' }, 'Acciones')))),
      el('tbody', null, ...items.map((m) =>
        el('tr', null,
          el('td', { class: 'num tenue' }, fechaCorta(m.fecha)),
          el('td', null,
            el('div', { class: 'celda-cat' },
              el('span', { class: 'icono-cat sm', style: { '--c': color(m.color) } },
                icono(m.icono || 'etiqueta')),
              el('div', { class: 'crece truncar' },
                el('strong', null, m.descripcion || m.categoria),
                el('small', null, m.categoria,
                  m.origen === 'recurrente' ? ' · fijo' : '')))),
          el('td', { class: 'tenue pequeno' }, METODOS_PAGO[m.metodo_pago] || m.metodo_pago),
          el('td', { class: `col-num importe importe-${m.tipo === 'ingreso' ? 'ingreso' : 'gasto'}` },
            dineroConSigno(m.importe, m.tipo)),
          el('td', { class: 'col-acciones' }, acciones(m, recargar)))))));
}

function construirLista(items, recargar) {
  return el('ul', { class: 'lista' }, ...items.map((m) => {
    const fila = filaMovimiento(m);
    fila.append(acciones(m, recargar));
    return fila;
  }));
}

function construirPaginacion(pagina, paginas, total, recargar) {
  const ir = (destino) => { filtros.pagina = destino; recargar(); };

  return el('div', { class: 'fila crece' },
    el('span', { class: 'pequeno tenue' }, `Página ${pagina} de ${paginas} · ${total} movimientos`),
    el('div', { class: 'fila-fin fila', style: { gap: '6px' } },
      el('button', {
        type: 'button', class: 'btn btn-sm', disabled: pagina <= 1, onClick: () => ir(pagina - 1),
      }, icono('flecha-izquierda'), 'Anterior'),
      el('button', {
        type: 'button', class: 'btn btn-sm', disabled: pagina >= paginas, onClick: () => ir(pagina + 1),
      }, 'Siguiente', icono('flecha-derecha'))));
}
