/**
 * Objetivos de ahorro y sus aportaciones.
 * El acumulado lo calcula siempre el servidor sumando las aportaciones.
 */

import {
  el, icono, vaciar, campo, campoImporte, paletaColores, modal, confirmar,
  avisoExito, esqueletoLista, menu,
} from '../ui.js';
import {
  obtener, enviar, modificar, borrar, dinero, porcentaje, fechaLarga, fechaCorta,
  hoyISO, color, PALETA,
} from '../core.js';
import { barraProgreso } from '../charts.js';
import { tarjeta, estadoVacio, protegido } from './comunes.js';

export const meta = { titulo: 'Ahorro', subtitulo: 'Objetivos y aportaciones' };

/** Días que faltan hasta la fecha límite (negativo si ya pasó). */
function diasHasta(iso) {
  if (!iso) return null;
  return Math.round((new Date(`${iso}T12:00:00`) - new Date(`${hoyISO()}T12:00:00`)) / 86400000);
}

export async function montarVista(contenedor, { acciones, recargar }) {
  vaciar(acciones).append(el('button', {
    type: 'button', class: 'btn btn-principal btn-sm',
    onClick: async () => { if (await formulario()) recargar(); },
  }, icono('mas'), 'Nuevo objetivo'));

  contenedor.replaceChildren(el('div', { class: 'tarjeta' }, esqueletoLista(3)));

  await protegido(contenedor, async () => {
    const { items } = await obtener('objetivos.php');
    contenedor.replaceChildren(construir(items, recargar));
  });
}

function construir(objetivos, recargar) {
  if (!objetivos.length) {
    return tarjeta({
      cuerpo: estadoVacio({
        icono: 'hucha',
        titulo: 'Aún no tienes objetivos',
        texto: 'Ponle nombre y cifra a eso que quieres conseguir: un viaje, un colchón '
             + 'de seguridad, un coche. Verás el progreso cada vez que aportes.',
        accion: el('button', {
          type: 'button', class: 'btn btn-principal',
          onClick: async () => { if (await formulario()) recargar(); },
        }, icono('mas'), 'Crear objetivo'),
      }),
    });
  }

  const activos = objetivos.filter((o) => o.estado === 'activo');
  const cerrados = objetivos.filter((o) => o.estado !== 'activo');

  const totalAhorrado = activos.reduce((suma, o) => suma + o.acumulado, 0);
  const totalMetas = activos.reduce((suma, o) => suma + o.monto_objetivo, 0);

  return el('div', { class: 'pila' },
    activos.length
      ? el('div', { class: 'rejilla rejilla-kpi' },
          el('article', { class: 'kpi', style: { '--c': 'var(--marca)' } },
            el('div', { class: 'kpi-cab' },
              el('span', { class: 'kpi-etiqueta' }, 'Ahorrado'),
              el('span', { class: 'kpi-icono' }, icono('hucha'))),
            el('span', { class: 'kpi-valor' }, dinero(totalAhorrado)),
            el('div', { class: 'kpi-pie' }, `De ${dinero(totalMetas)} en objetivos activos`)),

          el('article', { class: 'kpi', style: { '--c': 'var(--ingreso)' } },
            el('div', { class: 'kpi-cab' },
              el('span', { class: 'kpi-etiqueta' }, 'Progreso global'),
              el('span', { class: 'kpi-icono' }, icono('diana'))),
            el('span', { class: 'kpi-valor' }, porcentaje(totalMetas > 0 ? totalAhorrado / totalMetas : 0)),
            el('div', { class: 'kpi-pie' }, `${activos.length} objetivo${activos.length > 1 ? 's' : ''} en marcha`)),

          el('article', { class: 'kpi', style: { '--c': 'var(--aviso)' } },
            el('div', { class: 'kpi-cab' },
              el('span', { class: 'kpi-etiqueta' }, 'Te falta'),
              el('span', { class: 'kpi-icono' }, icono('bandera'))),
            el('span', { class: 'kpi-valor' }, dinero(Math.max(0, totalMetas - totalAhorrado))),
            el('div', { class: 'kpi-pie' }, 'Para completarlos todos')))
      : null,

    ...activos.map((o) => tarjetaObjetivo(o, recargar)),

    cerrados.length
      ? tarjeta({
          titulo: 'Completados y cancelados',
          sinRelleno: true,
          cuerpo: el('ul', { class: 'lista' }, ...cerrados.map((o) =>
            el('li', null,
              el('span', { class: 'icono-cat', style: { '--c': color(o.color) } },
                icono(o.estado === 'completado' ? 'check-circulo' : 'cerrado')),
              el('div', { class: 'lista-info' },
                el('strong', null, o.nombre),
                el('small', null, `${dinero(o.acumulado)} de ${dinero(o.monto_objetivo)}`)),
              el('span', { class: `chip ${o.estado === 'completado' ? 'chip-ingreso' : ''}` },
                o.estado === 'completado' ? 'Completado' : 'Cancelado'),
              menuObjetivo(o, recargar)))),
        })
      : null);
}

function tarjetaObjetivo(objetivo, recargar) {
  const dias = diasHasta(objetivo.fecha_limite);
  const vencido = dias !== null && dias < 0;

  // Con fecha límite, lo accionable es cuánto habría que apartar al mes.
  const meses = dias !== null && dias > 0 ? Math.max(1, Math.ceil(dias / 30)) : null;
  const ritmo = meses ? objetivo.restante / meses : null;

  return tarjeta({
    titulo: objetivo.nombre,
    subtitulo: objetivo.fecha_limite
      ? (vencido
          ? `La fecha límite (${fechaCorta(objetivo.fecha_limite)}) ya pasó`
          : `Quedan ${dias} día${dias === 1 ? '' : 's'} · hasta el ${fechaLarga(objetivo.fecha_limite)}`)
      : 'Sin fecha límite',
    acciones: el('div', { class: 'fila', style: { gap: '6px' } },
      el('button', {
        type: 'button', class: 'btn btn-principal btn-sm',
        onClick: async () => { if (await formularioAportacion(objetivo)) recargar(); },
      }, icono('mas'), 'Aportar'),
      menuObjetivo(objetivo, recargar)),

    cuerpo: el('div', { class: 'pila-sm' },
      el('div', { class: 'fila', style: { alignItems: 'baseline' } },
        el('span', { class: 'kpi-valor', style: { color: color(objetivo.color) } },
          dinero(objetivo.acumulado)),
        el('span', { class: 'silenciado' }, `de ${dinero(objetivo.monto_objetivo)}`),
        el('span', { class: 'fila-fin negrita num' }, porcentaje(objetivo.progreso, 1))),

      barraProgreso(objetivo.progreso, color(objetivo.color), { alta: true }),

      el('div', { class: 'fila pequeno tenue' },
        el('span', null, objetivo.restante > 0
          ? `Te faltan ${dinero(objetivo.restante)}`
          : '¡Objetivo alcanzado!'),
        ritmo && objetivo.restante > 0
          ? el('span', { class: 'fila-fin' }, `Necesitas ~${dinero(ritmo)} al mes`)
          : null),

      objetivo.n_aportaciones
        ? el('button', {
            type: 'button', class: 'btn-enlace pequeno', style: { alignSelf: 'flex-start' },
            onClick: () => verAportaciones(objetivo, recargar),
          }, objetivo.n_aportaciones === 1
              ? 'Ver la aportación'
              : `Ver las ${objetivo.n_aportaciones} aportaciones`)
        : null),
  });
}

function menuObjetivo(objetivo, recargar) {
  const boton = el('button', {
    type: 'button', class: 'btn btn-fantasma btn-icono btn-sm', 'aria-label': `Acciones de ${objetivo.nombre}`,
    onClick: () => menu(boton, [
      {
        texto: 'Editar', icono: 'lapiz',
        alPulsar: async () => { if (await formulario(objetivo)) recargar(); },
      },
      objetivo.n_aportaciones
        ? { texto: 'Ver aportaciones', icono: 'lista', alPulsar: () => verAportaciones(objetivo, recargar) }
        : null,
      objetivo.estado === 'activo'
        ? {
            texto: 'Marcar como completado', icono: 'check-circulo',
            alPulsar: async () => {
              await modificar(`objetivos.php?id=${objetivo.id}`, { ...objetivo, estado: 'completado' });
              avisoExito('Objetivo completado');
              recargar();
            },
          }
        : {
            texto: 'Reactivar', icono: 'deshacer',
            alPulsar: async () => {
              await modificar(`objetivos.php?id=${objetivo.id}`, { ...objetivo, estado: 'activo' });
              avisoExito('Objetivo reactivado');
              recargar();
            },
          },
      'separador',
      {
        texto: 'Eliminar', icono: 'papelera', peligro: true,
        alPulsar: async () => {
          const confirmado = await confirmar({
            titulo: `Eliminar «${objetivo.nombre}»`,
            mensaje: (objetivo.n_aportaciones === 1
              ? 'Se borrará también su aportación. '
              : `Se borrarán también sus ${objetivo.n_aportaciones} aportaciones. `)
              + 'Esta acción no se puede deshacer.',
          });
          if (!confirmado) return;

          await borrar(`objetivos.php?id=${objetivo.id}`);
          avisoExito('Objetivo eliminado');
          recargar();
        },
      },
    ].filter(Boolean)),
  }, icono('mas-opciones'));

  return boton;
}

async function formulario(objetivo = null) {
  const edicion = Boolean(objetivo);
  let colorElegido = objetivo?.color || PALETA[6];

  const contenido = el('div', { class: 'pila' },
    campo('Nombre', el('input', {
      type: 'text', name: 'nombre', required: true, maxlength: 120,
      value: objetivo?.nombre || '', placeholder: 'p. ej. Viaje a Japón',
    })),

    el('div', { class: 'rejilla rejilla-form' },
      campoImporte('Quiero ahorrar', {
        name: 'monto_objetivo', required: true,
        value: objetivo ? String(objetivo.monto_objetivo) : '', placeholder: '0,00',
      }),
      campo('Fecha límite', el('input', {
        type: 'date', name: 'fecha_limite', value: objetivo?.fecha_limite || '',
      }), 'Opcional')),

    campo('Color', paletaColores(PALETA, colorElegido, (hex) => { colorElegido = hex; })));

  return modal({
    titulo: edicion ? 'Editar objetivo' : 'Nuevo objetivo de ahorro',
    contenido,
    textoAceptar: edicion ? 'Guardar cambios' : 'Crear objetivo',
    alAceptar: async () => {
      const datos = new FormData(contenido.closest('form'));
      const cuerpo = {
        nombre: datos.get('nombre'),
        monto_objetivo: Number(String(datos.get('monto_objetivo')).replace(',', '.')),
        fecha_limite: datos.get('fecha_limite') || null,
        color: colorElegido,
      };

      if (edicion) {
        await modificar(`objetivos.php?id=${objetivo.id}`, { ...cuerpo, estado: objetivo.estado });
        avisoExito('Objetivo actualizado');
      } else {
        await enviar('objetivos.php', cuerpo);
        avisoExito('Objetivo creado');
      }
      return true;
    },
  });
}

async function formularioAportacion(objetivo) {
  const contenido = el('div', { class: 'pila' },
    el('div', { class: 'fila' },
      el('span', { class: 'icono-cat', style: { '--c': color(objetivo.color) } }, icono('hucha')),
      el('div', null,
        el('strong', null, objetivo.nombre),
        el('div', { class: 'diminuto tenue' },
          `Llevas ${dinero(objetivo.acumulado)} · te faltan ${dinero(objetivo.restante)}`))),

    campoImporte('Cuánto aportas', { name: 'importe', required: true, placeholder: '0,00' }),

    el('div', { class: 'rejilla rejilla-form' },
      campo('Fecha', el('input', { type: 'date', name: 'fecha', required: true, value: hoyISO() })),
      campo('Nota', el('input', {
        type: 'text', name: 'nota', maxlength: 160, placeholder: 'Opcional',
      }))));

  return modal({
    titulo: 'Nueva aportación',
    contenido,
    textoAceptar: 'Aportar',
    alAceptar: async () => {
      const datos = new FormData(contenido.closest('form'));
      const respuesta = await enviar(`objetivos.php?accion=aportacion&id=${objetivo.id}`, {
        importe: Number(String(datos.get('importe')).replace(',', '.')),
        fecha: datos.get('fecha'),
        nota: datos.get('nota') || null,
      });

      avisoExito(respuesta.completado
        ? `¡Objetivo «${objetivo.nombre}» completado!`
        : `Aportación registrada · llevas ${dinero(respuesta.acumulado)}`);
      return true;
    },
  });
}

async function verAportaciones(objetivo, recargar) {
  const { items } = await obtener(`objetivos.php?accion=aportaciones&id=${objetivo.id}`);

  const lista = el('ul', { class: 'lista' });

  const pintar = () => {
    lista.replaceChildren(...items.map((a) =>
      el('li', { style: { paddingInline: '0' } },
        el('div', { class: 'lista-info' },
          el('strong', null, dinero(a.importe)),
          el('small', null, fechaLarga(a.fecha), a.nota ? ` · ${a.nota}` : '')),
        el('button', {
          type: 'button', class: 'btn btn-fantasma btn-icono btn-sm',
          'aria-label': 'Eliminar aportación',
          onClick: async () => {
            await borrar(`objetivos.php?accion=aportacion&id=${a.id}`);
            items.splice(items.indexOf(a), 1);
            avisoExito('Aportación eliminada');
            pintar();
            recargar();
          },
        }, icono('papelera')))));
  };
  pintar();

  await modal({
    titulo: `Aportaciones a «${objetivo.nombre}»`,
    contenido: items.length ? lista : el('p', { class: 'silenciado' }, 'Todavía no hay aportaciones.'),
    sinPie: true,
  });
}
