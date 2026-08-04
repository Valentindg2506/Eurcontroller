/**
 * Panel: indicadores del mes, evolución del gasto, reparto por categoría,
 * comparativa anual, presupuestos, objetivos y últimos movimientos.
 */

import { el, icono, vaciar, esqueletoLista, esqueleto } from '../ui.js';
import {
  obtener, query, dinero, dineroCorto, porcentaje, color, mesLargo, fechaCorta,
} from '../core.js';
import { barrasRango, barrasComparativas, areaAcumulada, leyenda, barraProgreso, montar } from '../charts.js';
import { tarjeta, selectorPeriodo, filaMovimiento, formularioMovimiento, estadoVacio, protegido } from './comunes.js';
import { irA } from '../router.js';

export const meta = { titulo: 'Resumen', subtitulo: 'Tu situación de un vistazo' };

/**
 * Días que deben haber transcurrido para extrapolar el gasto a fin de mes.
 * Con menos, un alquiler cobrado el día 2 dispara la proyección a cifras
 * absurdas y el dato engaña más de lo que informa.
 */
const DIAS_MINIMOS_PROYECCION = 10;

/** Indicador de variación respecto al mes anterior. */
function delta(variacion, { subirEsMalo = false } = {}) {
  if (variacion === null || variacion === undefined) {
    return el('span', { class: 'delta delta-neutro' }, 'Sin datos del mes anterior');
  }

  const sube = variacion > 0.0005;
  const baja = variacion < -0.0005;
  const bueno = sube ? !subirEsMalo : baja ? subirEsMalo : null;

  return el('span', {
    class: `delta ${bueno === null ? 'delta-neutro' : bueno ? 'delta-bien' : 'delta-mal'}`,
  },
    icono(sube ? 'tendencia-arriba' : baja ? 'tendencia-abajo' : 'igual'),
    `${porcentaje(Math.abs(variacion), Math.abs(variacion) < 0.1 ? 1 : 0)} vs. mes anterior`);
}

function subtituloGastoAcumulado(kpis, periodo) {
  if (!kpis.mes_en_curso) {
    return `${mesLargo(periodo)} · media de ${dinero(kpis.gasto_diario_medio)} al día`;
  }
  if (kpis.dias_transcurridos < DIAS_MINIMOS_PROYECCION) {
    return `Llevas ${kpis.dias_transcurridos} día${kpis.dias_transcurridos === 1 ? '' : 's'} del mes`
         + ` · media de ${dinero(kpis.gasto_diario_medio)} al día`;
  }
  return `Media de ${dinero(kpis.gasto_diario_medio)} al día`
       + ` · proyección de ${dinero(kpis.proyeccion_gasto)} a fin de mes`;
}

function tarjetaKpi({ etiqueta, valor, colorAcento, iconoNombre, pie }) {
  return el('article', { class: 'kpi', style: { '--c': colorAcento } },
    el('div', { class: 'kpi-cab' },
      el('span', { class: 'kpi-etiqueta' }, etiqueta),
      el('span', { class: 'kpi-icono' }, icono(iconoNombre))),
    el('span', { class: 'kpi-valor' }, valor),
    el('div', { class: 'kpi-pie' }, pie));
}

/** Agrupa la cola larga en «Otras» para que la lista no se haga interminable. */
function agruparCategorias(categorias, maximo = 7) {
  if (categorias.length <= maximo + 1) return categorias;

  const principales = categorias.slice(0, maximo);
  const resto = categorias.slice(maximo);

  return [...principales, {
    nombre: `Otras (${resto.length})`,
    total: resto.reduce((suma, c) => suma + c.total, 0),
    color: '#94a3b8',
  }];
}

export async function montarVista(contenedor, { acciones, periodo, alCambiarPeriodo }) {
  vaciar(acciones).append(selectorPeriodo(periodo, alCambiarPeriodo));

  contenedor.replaceChildren(
    el('div', { class: 'pila' },
      el('div', { class: 'rejilla rejilla-kpi' },
        ...Array.from({ length: 4 }, () => el('div', { class: 'kpi' }, esqueleto(56)))),
      el('div', { class: 'tarjeta' }, esqueletoLista(5))));

  await protegido(contenedor, async () => {
    const datos = await obtener(`resumen.php${query({ periodo })}`);
    contenedor.replaceChildren(construir(datos, periodo));
  });
}

function construir(datos, periodo) {
  const { kpis, comparativa, por_categoria: categorias, historico } = datos;
  const sinDatos = historico.movimientos === 0;

  if (sinDatos) {
    return el('div', { class: 'pila' }, bienvenida());
  }

  const raiz = el('div', { class: 'pila' });

  /* --- Indicadores ------------------------------------------------------- */

  raiz.append(el('div', { class: 'rejilla rejilla-kpi' },
    tarjetaKpi({
      etiqueta: 'Ingresos',
      valor: dinero(kpis.ingresos),
      colorAcento: 'var(--ingreso)',
      iconoNombre: 'entrada',
      pie: delta(comparativa.var_ingresos),
    }),
    tarjetaKpi({
      etiqueta: 'Gastos',
      valor: dinero(kpis.gastos),
      colorAcento: 'var(--gasto)',
      iconoNombre: 'salida',
      pie: delta(comparativa.var_gastos, { subirEsMalo: true }),
    }),
    tarjetaKpi({
      etiqueta: 'Saldo del mes',
      valor: dinero(kpis.saldo),
      colorAcento: kpis.saldo >= 0 ? 'var(--ingreso)' : 'var(--gasto)',
      iconoNombre: 'balanza',
      pie: el('span', { class: 'tenue' },
        kpis.saldo >= 0 ? 'Has ingresado más de lo que has gastado' : 'Has gastado más de lo que has ingresado'),
    }),
    tarjetaKpi({
      etiqueta: 'Tasa de ahorro',
      valor: kpis.tasa_ahorro === null ? '—' : porcentaje(kpis.tasa_ahorro, 1),
      colorAcento: 'var(--marca)',
      iconoNombre: 'hucha',
      pie: el('span', { class: 'tenue' },
        kpis.tasa_ahorro === null ? 'Registra ingresos para calcularla' : 'Del total ingresado este mes'),
    })));

  /* --- Evolución + reparto ------------------------------------------------ */

  const lienzoArea = el('div');

  const referencia = datos.presupuestos.presupuestado > 0
    ? { valor: datos.presupuestos.presupuestado, etiqueta: `Presupuesto ${dineroCorto(datos.presupuestos.presupuestado)}` }
    : null;

  raiz.append(el('div', { class: 'rejilla rejilla-panel' },
    tarjeta({
      titulo: 'Gasto acumulado',
      subtitulo: subtituloGastoAcumulado(kpis, periodo),
      cuerpo: lienzoArea,
    }),

    tarjeta({
      titulo: 'Reparto por categoría',
      subtitulo: categorias.length
        ? `${dinero(kpis.gastos)} repartidos en ${categorias.length} categoría${categorias.length === 1 ? '' : 's'}`
        : 'Gastos del mes',
      cuerpo: barrasRango(agruparCategorias(categorias), { total: kpis.gastos }),
    })));

  montar(lienzoArea, (ancho) => areaAcumulada(datos.serie_diaria, ancho, {
    alto: 250,
    referencia,
    hastaDia: kpis.mes_en_curso ? kpis.dias_transcurridos : null,
  }));

  /* --- Comparativa anual -------------------------------------------------- */

  const lienzoBarras = el('div');

  raiz.append(tarjeta({
    titulo: 'Ingresos y gastos',
    subtitulo: 'Últimos doce meses',
    acciones: leyenda([
      { nombre: 'Ingresos', color: 'var(--ingreso)' },
      { nombre: 'Gastos', color: 'var(--gasto)' },
    ]),
    cuerpo: lienzoBarras,
  }));

  montar(lienzoBarras, (ancho) =>
    barrasComparativas(datos.serie_mensual, ancho, { alto: 250, resaltar: periodo }));

  /* --- Presupuestos y objetivos ------------------------------------------- */

  raiz.append(el('div', { class: 'rejilla rejilla-2' },
    tarjetaPresupuestos(datos.presupuestos, periodo),
    tarjetaObjetivos(datos.objetivos)));

  /* --- Últimos movimientos ------------------------------------------------ */

  raiz.append(tarjeta({
    titulo: 'Últimos movimientos',
    acciones: el('button', {
      type: 'button', class: 'btn btn-sm', onClick: () => irA('movimientos'),
    }, 'Ver todos', icono('flecha-derecha')),
    sinRelleno: true,
    cuerpo: datos.recientes.length
      ? el('ul', { class: 'lista' }, ...datos.recientes.map((m) => filaMovimiento(m)))
      : estadoVacio({ icono: 'lista', titulo: 'Sin movimientos todavía' }),
  }));

  return raiz;
}

function tarjetaPresupuestos(presupuestos, periodo) {
  if (!presupuestos.items.length) {
    return tarjeta({
      titulo: 'Presupuestos',
      cuerpo: estadoVacio({
        icono: 'diana',
        titulo: 'Sin presupuestos este mes',
        texto: 'Fija un límite por categoría y verás aquí cuánto te queda.',
        accion: el('button', {
          type: 'button', class: 'btn btn-principal', onClick: () => irA('presupuestos'),
        }, 'Crear presupuesto'),
      }),
    });
  }

  const usado = presupuestos.presupuestado > 0 ? presupuestos.gastado / presupuestos.presupuestado : 0;

  return tarjeta({
    titulo: 'Presupuestos',
    subtitulo: `${dinero(presupuestos.gastado)} de ${dinero(presupuestos.presupuestado)}`,
    acciones: presupuestos.excedidas > 0
      ? el('span', { class: 'chip chip-gasto' }, icono('alerta'),
          `${presupuestos.excedidas} excedido${presupuestos.excedidas > 1 ? 's' : ''}`)
      : el('span', { class: 'chip chip-ingreso' }, icono('check'), 'Bajo control'),
    cuerpo: el('div', { class: 'pila-sm' },
      barraProgreso(usado, 'var(--marca)', { alta: true, excedido: usado > 1 }),
      el('div', { class: 'fila diminuto tenue' },
        el('span', null, porcentaje(usado)),
        el('span', { class: 'fila-fin' },
          presupuestos.presupuestado - presupuestos.gastado >= 0
            ? `Quedan ${dinero(presupuestos.presupuestado - presupuestos.gastado)}`
            : `Excedido en ${dinero(presupuestos.gastado - presupuestos.presupuestado)}`)),
      el('hr', { class: 'sep', style: { margin: '4px 0' } }),
      ...presupuestos.items.slice(0, 4).map((p) =>
        el('div', { class: 'pila-sm', style: { gap: '5px' } },
          el('div', { class: 'fila diminuto' },
            el('span', { class: 'negrita' }, p.nombre),
            el('span', { class: 'fila-fin num tenue' }, `${dinero(p.gastado)} / ${dinero(p.presupuesto)}`)),
          barraProgreso(p.uso || 0, color(p.color), { excedido: p.uso > 1 })))),
    pie: el('button', {
      type: 'button', class: 'btn btn-sm', onClick: () => irA('presupuestos', { periodo }),
    }, 'Gestionar presupuestos'),
  });
}

function tarjetaObjetivos(objetivos) {
  if (!objetivos.length) {
    return tarjeta({
      titulo: 'Objetivos de ahorro',
      cuerpo: estadoVacio({
        icono: 'hucha',
        titulo: 'Sin objetivos activos',
        texto: 'Ponle nombre y cifra a eso que quieres conseguir.',
        accion: el('button', {
          type: 'button', class: 'btn btn-principal', onClick: () => irA('ahorro'),
        }, 'Crear objetivo'),
      }),
    });
  }

  return tarjeta({
    titulo: 'Objetivos de ahorro',
    subtitulo: `${objetivos.length} activo${objetivos.length > 1 ? 's' : ''}`,
    cuerpo: el('div', { class: 'pila' }, ...objetivos.map((o) =>
      el('div', { class: 'pila-sm', style: { gap: '6px' } },
        el('div', { class: 'fila' },
          el('span', { class: 'negrita pequeno' }, o.nombre),
          el('span', { class: 'fila-fin num pequeno tenue' },
            `${dinero(o.acumulado)} / ${dinero(o.monto_objetivo)}`)),
        barraProgreso(o.progreso, color(o.color), { alta: true }),
        el('div', { class: 'fila diminuto tenue' },
          el('span', null, porcentaje(o.progreso)),
          o.fecha_limite
            ? el('span', { class: 'fila-fin' }, `Fecha límite: ${fechaCorta(o.fecha_limite)}`)
            : null)))),
    pie: el('button', {
      type: 'button', class: 'btn btn-sm', onClick: () => irA('ahorro'),
    }, 'Ver objetivos'),
  });
}

/** Pantalla de bienvenida: la primera vez no hay nada que graficar. */
function bienvenida() {
  return el('section', { class: 'tarjeta' },
    el('div', { class: 'tarjeta-cuerpo' },
      estadoVacio({
        icono: 'cohete',
        titulo: 'Bienvenido a Eurcontroller',
        texto: 'Registra tu primer movimiento y el panel se llenará de indicadores, '
             + 'gráficos y comparativas. Ya tienes categorías creadas para empezar.',
        accion: el('div', { class: 'fila', style: { justifyContent: 'center' } },
          el('button', {
            type: 'button', class: 'btn btn-principal',
            onClick: async () => { if (await formularioMovimiento(null)) irA('panel'); },
          }, icono('mas'), 'Registrar el primero'),
          el('button', {
            type: 'button', class: 'btn', onClick: () => irA('categorias'),
          }, 'Revisar categorías')),
      })));
}
