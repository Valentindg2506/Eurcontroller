/**
 * Gráficos propios: reparto en barras ordenadas, barras agrupadas y área acumulada.
 *
 * Se dibujan a mano para que la app siga funcionando sin conexión y sin
 * depender de ninguna CDN. Cada gráfico se mide en píxeles reales (nada de
 * `preserveAspectRatio` deformando el texto) y se redibuja al cambiar el
 * tamaño del contenedor o el tema.
 */

import { svg, el, vaciar } from './ui.js';
import { color, dinero, dineroCorto, porcentaje, mesCorto, fechaLarga } from './core.js';

const CSS = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();


/* --- Sugerencia flotante compartida ---------------------------------------- */

let sugerencia = null;

function nodoSugerencia() {
  if (!sugerencia) {
    sugerencia = el('div', { class: 'sugerencia', role: 'tooltip' });
    document.body.append(sugerencia);
  }
  return sugerencia;
}

function mostrarSugerencia(evento, contenido) {
  const nodo = vaciar(nodoSugerencia());
  nodo.append(...(Array.isArray(contenido) ? contenido : [contenido]));
  nodo.classList.add('visible');

  const caja = nodo.getBoundingClientRect();
  const x = Math.min(Math.max(8, evento.clientX + 14), window.innerWidth - caja.width - 8);
  const y = evento.clientY - caja.height - 12 < 8 ? evento.clientY + 18 : evento.clientY - caja.height - 12;
  nodo.style.left = `${x}px`;
  nodo.style.top = `${y}px`;
}

function ocultarSugerencia() {
  if (sugerencia) sugerencia.classList.remove('visible');
}

const filaSugerencia = (hex, etiqueta, valor) =>
  el('div', { class: 'sug-fila' },
    hex ? el('span', { class: 'sug-marca', style: { '--c': hex } }) : null,
    el('span', null, `${etiqueta}: `),
    el('strong', { style: { display: 'inline' } }, valor));


/* --- Andamiaje -------------------------------------------------------------- */

/**
 * Monta un gráfico dentro de un contenedor y lo redibuja cuando cambia su
 * ancho o el tema. Devuelve una función para desmontarlo.
 */
export function montar(contenedor, dibujar) {
  let anchoPrevio = 0;

  const render = () => {
    const ancho = contenedor.clientWidth;
    if (ancho < 40) return;
    anchoPrevio = ancho;
    vaciar(contenedor).append(dibujar(ancho));
  };

  const observador = new ResizeObserver(() => {
    if (Math.abs(contenedor.clientWidth - anchoPrevio) > 2) render();
  });
  observador.observe(contenedor);
  document.addEventListener('tema:cambio', render);

  render();

  return () => {
    observador.disconnect();
    document.removeEventListener('tema:cambio', render);
  };
}

/** Tabla equivalente solo para lectores de pantalla. */
function tablaAccesible(titulo, cabeceras, filas) {
  return el('table', { class: 'solo-lectores' },
    el('caption', null, titulo),
    el('thead', null, el('tr', null, ...cabeceras.map((c) => el('th', null, c)))),
    el('tbody', null, ...filas.map((fila) => el('tr', null, ...fila.map((celda) => el('td', null, celda))))));
}

/** Escala «bonita»: redondea el máximo a 1, 2, 2.5 o 5 × 10ⁿ. */
function escalaBonita(maximo, divisiones = 4) {
  if (maximo <= 0) return { max: 10, paso: 2.5 };
  const bruto = maximo / divisiones;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const normalizado = bruto / magnitud;
  const paso = (normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 2.5 ? 2.5 : normalizado <= 5 ? 5 : 10) * magnitud;
  return { max: paso * divisiones, paso };
}

/** Rectángulo con las esquinas superiores redondeadas, anclado a la base. */
function barraRedondeada(x, y, ancho, alto, radio = 4) {
  if (alto <= 0.5) return `M${x},${y + alto} L${x + ancho},${y + alto}`;
  const r = Math.min(radio, alto, ancho / 2);
  return `M${x},${y + alto} L${x},${y + r} Q${x},${y} ${x + r},${y}`
       + ` L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r}`
       + ` L${x + ancho},${y + alto} Z`;
}


/* --- Reparto por categoría: barras ordenadas -------------------------------- */

/**
 * Reparto del gasto por categoría, en barras ordenadas de mayor a menor.
 *
 * Aquí había un donut, y se cambió de forma a conciencia. En un donut los
 * segmentos se ordenan por importe, así que dos colores cualesquiera de la
 * paleta pueden acabar contiguos; con ocho tonos no existe ninguna paleta que
 * supere el umbral de distinción para *todas* las parejas posibles (naranja y
 * rojo se quedan en ΔE 7,1 a simple vista). Eso obligaría a distinguir colores
 * para leer el gráfico.
 *
 * Con barras, cada una lleva su nombre y su importe en la misma fila: el color
 * acompaña, pero no hace falta para leer nada. Además compara magnitudes mejor,
 * que es justo lo que se pregunta uno aquí.
 *
 * @param {{nombre: string, total: number, color: string}[]} datos ordenados desc
 */
export function barrasRango(datos, { total } = {}) {
  const suma = datos.reduce((acumulado, d) => acumulado + d.total, 0);
  const maximo = Math.max(...datos.map((d) => d.total), 0);

  if (!datos.length || suma <= 0) {
    return el('p', { class: 'silenciado pequeno centrado', style: { padding: '24px 0' } },
      'Todavía no hay gastos este mes.');
  }

  const contenedor = el('div', {
    class: 'rangos',
    role: 'list',
    'aria-label': `Reparto por categoría. Total ${dinero(total ?? suma)}.`,
  });

  for (const dato of datos) {
    const hex = color(dato.color);
    const parte = dato.total / suma;

    const fila = el('div', { class: 'rango', role: 'listitem' },
      el('div', { class: 'rango-cab' },
        el('span', { class: 'rango-nombre' }, dato.nombre),
        el('span', { class: 'rango-valor num' }, dinero(dato.total))),
      el('div', { class: 'rango-pista' },
        el('div', {
          class: 'rango-barra',
          style: { width: `${Math.max(1.5, (dato.total / maximo) * 100)}%`, '--c': hex },
        }),
        el('span', { class: 'rango-pct num' }, porcentaje(parte, parte < 0.1 ? 1 : 0))));

    const detalle = (evento) => mostrarSugerencia(evento, [
      el('strong', null, dato.nombre),
      filaSugerencia(hex, 'Importe', dinero(dato.total)),
      filaSugerencia(null, 'Peso sobre el gasto', porcentaje(parte, 1)),
    ]);
    fila.addEventListener('pointermove', detalle);
    fila.addEventListener('pointerleave', ocultarSugerencia);

    contenedor.append(fila);
  }

  return contenedor;
}


/* --- Barras agrupadas: ingresos vs gastos ---------------------------------- */

/**
 * Dos series por periodo. Comparten un único eje: nunca hay doble escala.
 *
 * @param {{periodo: string, ingresos: number, gastos: number}[]} serie
 */
export function barrasComparativas(serie, ancho, { alto = 260, resaltar = null } = {}) {
  const margen = { arriba: 14, derecha: 6, abajo: 28, izquierda: 52 };
  const anchoTrazado = Math.max(60, ancho - margen.izquierda - margen.derecha);
  const altoTrazado = alto - margen.arriba - margen.abajo;

  const maximo = Math.max(...serie.flatMap((d) => [d.ingresos, d.gastos]), 0);
  const { max, paso } = escalaBonita(maximo);
  const y = (valor) => margen.arriba + altoTrazado - (valor / max) * altoTrazado;

  const colorIngreso = CSS('--ingreso');
  const colorGasto = CSS('--gasto');

  const svgNodo = svg('svg', {
    class: 'grafico', width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`,
    role: 'img', 'aria-label': 'Ingresos y gastos de los últimos doce meses',
  });

  // Rejilla y eje de valores
  for (let valor = 0; valor <= max + 0.001; valor += paso) {
    svgNodo.append(
      svg('line', {
        class: 'rejilla-linea',
        x1: margen.izquierda, x2: margen.izquierda + anchoTrazado, y1: y(valor), y2: y(valor),
      }),
      svg('text', {
        x: margen.izquierda - 8, y: y(valor) + 4, 'text-anchor': 'end', fill: CSS('--texto-3'),
      }, dineroCorto(valor)));
  }

  const anchoBanda = anchoTrazado / serie.length;
  const anchoGrupo = Math.min(anchoBanda * 0.66, 40);
  const anchoBarra = (anchoGrupo - 2) / 2;   // 2 px de separación entre barras contiguas

  serie.forEach((dato, indice) => {
    const centro = margen.izquierda + anchoBanda * (indice + 0.5);
    const esActual = dato.periodo === resaltar;

    const dibujarBarra = (valor, hex, etiqueta, desplazamiento) => {
      const altura = (valor / max) * altoTrazado;
      const x = centro - anchoGrupo / 2 + desplazamiento;

      const camino = svg('path', {
        class: 'marca',
        d: barraRedondeada(x, y(valor), anchoBarra, altura, 4),
        fill: hex,
        opacity: esActual || !resaltar ? 1 : 0.72,
      });

      const detalle = (evento) => mostrarSugerencia(evento, [
        el('strong', null, `${mesCorto(dato.periodo)} ${dato.periodo.slice(0, 4)}`),
        filaSugerencia(colorIngreso, 'Ingresos', dinero(dato.ingresos)),
        filaSugerencia(colorGasto, 'Gastos', dinero(dato.gastos)),
        filaSugerencia(null, 'Saldo', dinero(dato.ingresos - dato.gastos)),
      ]);

      camino.addEventListener('pointermove', detalle);
      camino.addEventListener('pointerleave', ocultarSugerencia);
      svgNodo.append(camino);
    };

    dibujarBarra(dato.ingresos, colorIngreso, 'Ingresos', 0);
    dibujarBarra(dato.gastos, colorGasto, 'Gastos', anchoBarra + 2);

    // Con poco ancho, una etiqueta de mes sí y otra no.
    const salto = anchoBanda < 34 ? 2 : 1;
    if (indice % salto === 0 || esActual) {
      svgNodo.append(svg('text', {
        x: centro, y: alto - 9, 'text-anchor': 'middle',
        fill: esActual ? CSS('--texto') : CSS('--texto-3'),
        'font-weight': esActual ? 650 : 400,
      }, mesCorto(dato.periodo)));
    }
  });

  svgNodo.append(svg('line', {
    class: 'eje-linea',
    x1: margen.izquierda, x2: margen.izquierda + anchoTrazado,
    y1: y(0), y2: y(0),
  }));

  const envoltorio = el('div', null, svgNodo,
    tablaAccesible('Ingresos y gastos por mes', ['Mes', 'Ingresos', 'Gastos'],
      serie.map((d) => [`${mesCorto(d.periodo)} ${d.periodo.slice(0, 4)}`, dinero(d.ingresos), dinero(d.gastos)])));

  return envoltorio;
}


/* --- Área acumulada del mes ------------------------------------------------- */

/**
 * Gasto acumulado día a día. Una sola serie: sin leyenda, el título la nombra.
 * `referencia` dibuja una línea discontinua (por ejemplo, el presupuesto).
 *
 * @param {{fecha: string, dia: number, acumulado: number}[]} serie
 */
export function areaAcumulada(serie, ancho, { alto = 240, referencia = null, hastaDia = null } = {}) {
  const margen = { arriba: 16, derecha: 10, abajo: 26, izquierda: 52 };
  const anchoTrazado = Math.max(60, ancho - margen.izquierda - margen.derecha);
  const altoTrazado = alto - margen.arriba - margen.abajo;

  // En el mes en curso la línea se detiene hoy: proyectar a cero el resto del
  // mes daría a entender que el gasto se ha frenado.
  const visible = hastaDia ? serie.filter((d) => d.dia <= hastaDia) : serie;
  const maximo = Math.max(...visible.map((d) => d.acumulado), referencia?.valor || 0, 0);
  const { max, paso } = escalaBonita(maximo);

  const x = (dia) => margen.izquierda + ((dia - 1) / Math.max(1, serie.length - 1)) * anchoTrazado;
  const y = (valor) => margen.arriba + altoTrazado - (valor / max) * altoTrazado;

  const colorLinea = CSS('--gasto');
  const idDegradado = `deg-area-${Math.random().toString(36).slice(2, 8)}`;

  const svgNodo = svg('svg', {
    class: 'grafico', width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`,
    role: 'img', 'aria-label': 'Gasto acumulado a lo largo del mes',
  });

  svgNodo.append(svg('defs', {},
    svg('linearGradient', { id: idDegradado, x1: 0, y1: 0, x2: 0, y2: 1 },
      svg('stop', { offset: '0%', 'stop-color': colorLinea, 'stop-opacity': 0.22 }),
      svg('stop', { offset: '100%', 'stop-color': colorLinea, 'stop-opacity': 0.02 }))));

  for (let valor = 0; valor <= max + 0.001; valor += paso) {
    svgNodo.append(
      svg('line', {
        class: 'rejilla-linea',
        x1: margen.izquierda, x2: margen.izquierda + anchoTrazado, y1: y(valor), y2: y(valor),
      }),
      svg('text', {
        x: margen.izquierda - 8, y: y(valor) + 4, 'text-anchor': 'end', fill: CSS('--texto-3'),
      }, dineroCorto(valor)));
  }

  if (referencia && referencia.valor > 0) {
    svgNodo.append(
      svg('line', {
        x1: margen.izquierda, x2: margen.izquierda + anchoTrazado,
        y1: y(referencia.valor), y2: y(referencia.valor),
        stroke: CSS('--texto-3'), 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
      }),
      svg('text', {
        x: margen.izquierda + anchoTrazado, y: y(referencia.valor) - 6,
        'text-anchor': 'end', fill: CSS('--texto-2'), 'font-weight': 600,
      }, referencia.etiqueta));
  }

  if (visible.length > 1) {
    const puntos = visible.map((d) => `${x(d.dia)},${y(d.acumulado)}`).join(' L');
    svgNodo.append(
      svg('path', {
        d: `M${margen.izquierda},${y(0)} L${puntos} L${x(visible.at(-1).dia)},${y(0)} Z`,
        fill: `url(#${idDegradado})`,
      }),
      svg('path', {
        d: `M${puntos}`,
        fill: 'none', stroke: colorLinea, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));

    // Punto final destacado, con anillo del color de la superficie.
    const ultimo = visible.at(-1);
    svgNodo.append(svg('circle', {
      cx: x(ultimo.dia), cy: y(ultimo.acumulado), r: 4.5,
      fill: colorLinea, stroke: CSS('--superficie'), 'stroke-width': 2,
    }));
  }

  // Etiquetas del eje de días
  const saltoDias = serie.length > 20 && anchoTrazado < 420 ? 7 : 5;
  for (const dato of serie) {
    if (dato.dia === 1 || dato.dia % saltoDias === 0) {
      svgNodo.append(svg('text', {
        x: x(dato.dia), y: alto - 8, 'text-anchor': 'middle', fill: CSS('--texto-3'),
      }, dato.dia));
    }
  }

  svgNodo.append(svg('line', {
    class: 'eje-linea', x1: margen.izquierda, x2: margen.izquierda + anchoTrazado, y1: y(0), y2: y(0),
  }));

  // Retícula de seguimiento: el área activa cubre todo el trazado, no solo la línea.
  const guia = svg('line', {
    stroke: CSS('--borde-fuerte'), 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
  });
  const marcador = svg('circle', {
    r: 5, fill: colorLinea, stroke: CSS('--superficie'), 'stroke-width': 2, opacity: 0,
  });
  const zona = svg('rect', {
    x: margen.izquierda, y: margen.arriba, width: anchoTrazado, height: altoTrazado,
    fill: 'transparent', style: 'cursor:crosshair',
  });

  zona.addEventListener('pointermove', (evento) => {
    const caja = svgNodo.getBoundingClientRect();
    const posicion = ((evento.clientX - caja.left - margen.izquierda) / anchoTrazado) * (serie.length - 1) + 1;
    const dato = visible[Math.max(0, Math.min(visible.length - 1, Math.round(posicion) - 1))];
    if (!dato) return;

    guia.setAttribute('x1', x(dato.dia));
    guia.setAttribute('x2', x(dato.dia));
    guia.setAttribute('y1', margen.arriba);
    guia.setAttribute('y2', margen.arriba + altoTrazado);
    guia.setAttribute('opacity', 1);
    marcador.setAttribute('cx', x(dato.dia));
    marcador.setAttribute('cy', y(dato.acumulado));
    marcador.setAttribute('opacity', 1);

    mostrarSugerencia(evento, [
      el('strong', null, fechaLarga(dato.fecha)),
      filaSugerencia(colorLinea, 'Acumulado', dinero(dato.acumulado)),
      filaSugerencia(null, 'Ese día', dinero(dato.gastos)),
    ]);
  });

  zona.addEventListener('pointerleave', () => {
    guia.setAttribute('opacity', 0);
    marcador.setAttribute('opacity', 0);
    ocultarSugerencia();
  });

  svgNodo.append(guia, marcador, zona);

  return el('div', null, svgNodo,
    tablaAccesible('Gasto acumulado por día', ['Día', 'Gasto del día', 'Acumulado'],
      visible.map((d) => [String(d.dia), dinero(d.gastos), dinero(d.acumulado)])));
}


/* --- Leyenda ---------------------------------------------------------------- */

/** Leyenda obligatoria en cuanto hay dos o más series. */
export function leyenda(series) {
  return el('div', { class: 'leyenda' },
    ...series.map((s) =>
      el('span', { class: 'leyenda-item' },
        el('span', { class: 'leyenda-marca', style: { '--c': s.color } }),
        s.nombre)));
}

/** Barra de progreso reutilizable (presupuestos, objetivos). */
export function barraProgreso(fraccion, colorBarra, { alta = false, excedido = false } = {}) {
  return el('div', { class: `barra ${alta ? 'alta' : ''}`.trim() },
    el('div', {
      class: `barra-relleno ${excedido ? 'excedido' : ''}`.trim(),
      style: { width: `${Math.min(100, Math.max(0, fraccion * 100))}%`, '--c': colorBarra },
    }));
}
