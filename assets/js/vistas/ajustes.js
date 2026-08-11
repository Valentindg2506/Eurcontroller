/**
 * Ajustes: perfil, moneda, apariencia, exportación de datos (RGPD),
 * cambio de contraseña y baja de la cuenta.
 */

import {
  el, icono, vaciar, campo, selector, segmentado, modal, avisoExito, avisoError, banda,
} from '../ui.js';
import {
  estado, modificar, borrar, aplicarTema, temaGuardado, configurarMoneda,
  BASE, fechaLarga, leerCola, sincronizarCola,
} from '../core.js';
import { tarjeta, protegido } from './comunes.js';
import {
  contenidoInstalacion, lanzarInstalacion, estadoInstalacion, alCambiarInstalacion,
} from '../instalar.js';

export const meta = { titulo: 'Ajustes', subtitulo: 'Tu cuenta y tus preferencias' };

const MONEDAS = [
  { valor: 'EUR', texto: 'Euro (€)' },
  { valor: 'USD', texto: 'Dólar estadounidense ($)' },
  { valor: 'GBP', texto: 'Libra esterlina (£)' },
  { valor: 'CHF', texto: 'Franco suizo (CHF)' },
  { valor: 'ARS', texto: 'Peso argentino ($)' },
  { valor: 'MXN', texto: 'Peso mexicano ($)' },
  { valor: 'COP', texto: 'Peso colombiano ($)' },
  { valor: 'CLP', texto: 'Peso chileno ($)' },
  { valor: 'BRL', texto: 'Real brasileño (R$)' },
];

export async function montarVista(contenedor, { acciones, alCerrarSesion, recargar }) {
  vaciar(acciones);

  await protegido(contenedor, async () => {
    contenedor.replaceChildren(el('div', { class: 'pila' },
      tarjetaPerfil(recargar),
      tarjetaInstalacion(),
      tarjetaNotificaciones(),
      tarjetaApariencia(),
      tarjetaDatos(),
      tarjetaSeguridad(alCerrarSesion)));
  });
}


/* --- Instalar como aplicación -------------------------------------------- */

function tarjetaInstalacion() {
  const cuerpo = el('div');

  const pintar = () => {
    cuerpo.replaceChildren(contenidoInstalacion(async () => {
      const aceptada = await lanzarInstalacion();
      if (aceptada) avisoExito('Eurcontroller se está instalando');
      pintar();
    }));
  };
  pintar();

  // El navegador puede ofrecer la instalación en cualquier momento, no solo
  // al cargar: la tarjeta se repinta cuando eso ocurre.
  alCambiarInstalacion(() => { if (cuerpo.isConnected) pintar(); });

  return tarjeta({
    titulo: 'Instalar en el dispositivo',
    subtitulo: estadoInstalacion().estado === 'instalada'
      ? null
      : 'Tenla a mano como una aplicación más',
    cuerpo,
  });
}


/* --- Notificaciones -------------------------------------------------------- */

function tarjetaNotificaciones() {
  const soportado = 'Notification' in window && 'serviceWorker' in navigator;
  
  if (!soportado) {
    return tarjeta({
      titulo: 'Notificaciones',
      subtitulo: 'Avisos en tu dispositivo',
      cuerpo: el('p', { class: 'pequeno silenciado' }, 'Tu navegador no soporta notificaciones.')
    });
  }

  const cuerpo = el('div', { class: 'pila-sm' });

  const pintar = () => {
    const estado = Notification.permission;
    
    if (estado === 'granted') {
      cuerpo.replaceChildren(
        el('div', { class: 'fila' },
          el('span', { class: 'chip chip-ingreso' }, icono('check-circulo'), 'Activadas'),
          el('span', { class: 'pequeno silenciado crece' }, 'Recibirás avisos de tus presupuestos y movimientos.')),
        el('button', {
          type: 'button', class: 'btn btn-sm', style: { alignSelf: 'flex-start', marginTop: '8px' },
          onClick: () => {
            navigator.serviceWorker.ready.then(reg => {
              reg.showNotification('¡Notificaciones activas!', {
                body: 'Eurcontroller te avisará de tus gastos.',
                icon: 'assets/icons/icon-192.png'
              });
            });
          }
        }, icono('notificacion'), 'Probar notificación')
      );
    } else if (estado === 'denied') {
      cuerpo.replaceChildren(
        banda('Has bloqueado las notificaciones. Debes permitirlas desde los ajustes de tu navegador.', 'aviso')
      );
    } else {
      cuerpo.replaceChildren(
        el('p', { class: 'pequeno silenciado' }, 'Activa las notificaciones para recibir alertas sobre tus gastos y presupuestos.'),
        el('button', {
          type: 'button', class: 'btn btn-principal', style: { alignSelf: 'flex-start' },
          onClick: async () => {
            const permiso = await Notification.requestPermission();
            if (permiso === 'granted') {
              avisoExito('Notificaciones activadas');
              navigator.serviceWorker.ready.then(reg => {
                reg.showNotification('¡Notificaciones activadas!', {
                  body: 'A partir de ahora recibirás avisos importantes.',
                  icon: 'assets/icons/icon-192.png'
                });
              });
            }
            pintar();
          }
        }, icono('notificacion'), 'Activar notificaciones')
      );
    }
  };

  pintar();

  return tarjeta({
    titulo: 'Notificaciones',
    subtitulo: 'Avisos en tu dispositivo',
    cuerpo,
  });
}


/* --- Perfil ----------------------------------------------------------------- */

function tarjetaPerfil(recargar) {
  const entradaNombre = el('input', {
    type: 'text', name: 'nombre', required: true, maxlength: 120, value: estado.usuario.nombre,
  });
  const selectMoneda = selector({ name: 'moneda' }, MONEDAS, estado.usuario.moneda);

  const guardar = el('button', { type: 'submit', class: 'btn btn-principal' }, 'Guardar cambios');

  const formulario = el('form', {
    onSubmit: async (evento) => {
      evento.preventDefault();
      guardar.disabled = true;
      guardar.textContent = 'Guardando…';

      try {
        const { usuario } = await modificar('cuenta.php?accion=perfil', {
          nombre: entradaNombre.value,
          moneda: selectMoneda.value,
          tema: temaGuardado(),
        });
        estado.usuario = usuario;
        configurarMoneda(usuario.moneda);
        avisoExito('Perfil actualizado');
        recargar();
      } catch (error) {
        avisoError(error.message);
      } finally {
        guardar.disabled = false;
        guardar.textContent = 'Guardar cambios';
      }
    },
  },
    el('div', { class: 'pila' },
      el('div', { class: 'rejilla rejilla-form' },
        campo('Nombre', entradaNombre),
        campo('Moneda', selectMoneda, 'Se aplica a todos los importes de la aplicación')),
      campo('Email', el('input', { type: 'email', value: estado.usuario.email, disabled: true }),
        'El email de acceso no se puede cambiar'),
      el('div', { class: 'fila' }, guardar)));

  return tarjeta({
    titulo: 'Perfil',
    subtitulo: `Cuenta creada el ${fechaLarga((estado.usuario.creado_en || '').slice(0, 10))}`,
    cuerpo: formulario,
  });
}


/* --- Apariencia -------------------------------------------------------------- */

function tarjetaApariencia() {
  return tarjeta({
    titulo: 'Apariencia',
    subtitulo: 'El tema se guarda en este dispositivo',
    cuerpo: el('div', { class: 'pila-sm' },
      segmentado([
        { valor: 'sistema', texto: 'Automático' },
        { valor: 'claro', texto: 'Claro' },
        { valor: 'oscuro', texto: 'Oscuro' },
      ], temaGuardado(), (valor) => {
        aplicarTema(valor);
        modificar('cuenta.php?accion=perfil', {
          nombre: estado.usuario.nombre,
          moneda: estado.usuario.moneda,
          tema: valor,
        }).catch(() => { /* la preferencia local ya se ha aplicado */ });
      }),
      el('p', { class: 'pequeno tenue' },
        '«Automático» sigue la preferencia de tu sistema operativo.')),
  });
}


/* --- Datos ------------------------------------------------------------------- */

function tarjetaDatos() {
  const pendientes = leerCola().length;

  const descargar = (formato) => {
    window.location.href = new URL(`api/cuenta.php?accion=exportar&formato=${formato}`, BASE).href;
  };

  return tarjeta({
    titulo: 'Tus datos',
    subtitulo: 'Puedes llevarte una copia cuando quieras',
    cuerpo: el('div', { class: 'pila-sm' },
      el('p', { class: 'pequeno silenciado' },
        'La exportación incluye movimientos, categorías, presupuestos, gastos fijos '
        + 'y objetivos. El CSV se abre directamente en Excel o LibreOffice.'),
      el('div', { class: 'fila' },
        el('button', { type: 'button', class: 'btn', onClick: () => descargar('csv') },
          icono('descarga'), 'Descargar CSV'),
        el('button', { type: 'button', class: 'btn', onClick: () => descargar('json') },
          icono('descarga'), 'Descargar JSON')),

      pendientes
        ? el('div', { class: 'pila-sm', style: { marginTop: '8px' } },
            banda(`Tienes ${pendientes} movimiento(s) guardados sin conexión pendientes de enviar.`, 'aviso'),
            el('button', {
              type: 'button', class: 'btn btn-sm', style: { alignSelf: 'flex-start' },
              onClick: async () => {
                const { enviados } = await sincronizarCola();
                avisoExito(enviados ? `${enviados} movimiento(s) sincronizados` : 'Nada que sincronizar');
                location.reload();
              },
            }, icono('sincronizar'), 'Sincronizar ahora'))
        : null),
  });
}


/* --- Seguridad y baja --------------------------------------------------------- */

function tarjetaSeguridad(alCerrarSesion) {
  return tarjeta({
    titulo: 'Seguridad',
    cuerpo: el('div', { class: 'pila-sm' },
      el('div', { class: 'fila' },
        el('div', { class: 'crece' },
          el('strong', { class: 'pequeno' }, 'Contraseña'),
          el('div', { class: 'diminuto tenue' }, 'Cámbiala si crees que alguien más la conoce')),
        el('button', {
          type: 'button', class: 'btn btn-sm', onClick: cambiarPassword,
        }, 'Cambiar contraseña')),

      el('hr', { class: 'sep' }),

      el('div', { class: 'fila' },
        el('div', { class: 'crece' },
          el('strong', { class: 'pequeno' }, 'Cerrar sesión'),
          el('div', { class: 'diminuto tenue' }, 'En este dispositivo')),
        el('button', {
          type: 'button', class: 'btn btn-sm', onClick: alCerrarSesion,
        }, icono('salir'), 'Cerrar sesión')),

      el('hr', { class: 'sep' }),

      el('div', { class: 'fila' },
        el('div', { class: 'crece' },
          el('strong', { class: 'pequeno', style: { color: 'var(--gasto)' } }, 'Eliminar la cuenta'),
          el('div', { class: 'diminuto tenue' },
            'Borra tu cuenta y todos tus datos de forma permanente')),
        el('button', {
          type: 'button', class: 'btn btn-peligro btn-sm',
          onClick: () => eliminarCuenta(alCerrarSesion),
        }, icono('papelera'), 'Eliminar cuenta'))),
  });
}

async function cambiarPassword() {
  const contenido = el('div', { class: 'pila' },
    campo('Contraseña actual', el('input', {
      type: 'password', name: 'password_actual', required: true, autocomplete: 'current-password',
    })),
    campo('Nueva contraseña', el('input', {
      type: 'password', name: 'password_nueva', required: true, minlength: 8, autocomplete: 'new-password',
    }), 'Mínimo 8 caracteres'),
    campo('Repite la nueva contraseña', el('input', {
      type: 'password', name: 'password_repetida', required: true, autocomplete: 'new-password',
    })));

  await modal({
    titulo: 'Cambiar contraseña',
    contenido,
    textoAceptar: 'Cambiar',
    alAceptar: async () => {
      const datos = new FormData(contenido.closest('form'));
      if (datos.get('password_nueva') !== datos.get('password_repetida')) {
        throw new Error('Las dos contraseñas nuevas no coinciden');
      }

      await modificar('cuenta.php?accion=password', {
        password_actual: datos.get('password_actual'),
        password_nueva: datos.get('password_nueva'),
      });
      avisoExito('Contraseña actualizada');
      return true;
    },
  });
}

async function eliminarCuenta(alCerrarSesion) {
  const contenido = el('div', { class: 'pila' },
    banda('Se borrarán definitivamente tu cuenta, tus movimientos, categorías, '
        + 'presupuestos, gastos fijos y objetivos. No hay vuelta atrás.', 'error'),
    el('p', { class: 'pequeno silenciado' },
      'Si quieres conservar una copia, cancela y descarga antes tus datos desde «Tus datos».'),
    campo('Confirma con tu contraseña', el('input', {
      type: 'password', name: 'password', required: true, autocomplete: 'current-password',
    })),
    campo('Escribe ELIMINAR para confirmar', el('input', {
      type: 'text', name: 'confirmacion', required: true, placeholder: 'ELIMINAR',
    })));

  const eliminada = await modal({
    titulo: 'Eliminar la cuenta',
    contenido,
    textoAceptar: 'Eliminar definitivamente',
    peligro: true,
    alAceptar: async () => {
      const datos = new FormData(contenido.closest('form'));
      if (datos.get('confirmacion') !== 'ELIMINAR') {
        throw new Error('Escribe ELIMINAR en mayúsculas para confirmar');
      }

      await borrar('cuenta.php?accion=eliminar', { password: datos.get('password') });
      return true;
    },
  });

  if (eliminada) {
    localStorage.clear();
    alCerrarSesion({ silencioso: true });
  }
}
