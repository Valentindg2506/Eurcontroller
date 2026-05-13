const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const resp = await fetch(`${API_BASE}/${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!resp.ok) {
    let msg = 'Error de red';
    try { const data = await resp.json(); msg = data.error || msg; } catch {}
    throw new Error(msg);
  }
  return resp.json();
}

let usuarioActual = null;
let categorias = [];
let transacciones = [];
let objetivos = [];

const COLA_KEY = 'cola_transacciones_offline';

function cargarColaOffline() {
  try {
    const raw = localStorage.getItem(COLA_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarColaOffline(cola) {
  localStorage.setItem(COLA_KEY, JSON.stringify(cola));
}

async function sincronizarColaOffline() {
  if (!navigator.onLine) return;
  let cola = cargarColaOffline();
  if (!cola.length) return;

  const pendientes = [...cola];
  for (const t of pendientes) {
    try {
      await apiFetch('transacciones.php', {
        method: 'POST',
        body: JSON.stringify({ ...t, creado_offline: 1 }),
      });
      cola = cola.filter(x => x._idLocal !== t._idLocal);
      guardarColaOffline(cola);
    } catch (e) {
      console.warn('Fallo al sincronizar una transacción offline', e);
      break;
    }
  }

  if (!cola.length) {
    console.info('Cola offline sincronizada');
  }
}

window.addEventListener('online', () => {
  sincronizarColaOffline().then(cargarTransacciones);
});

function mostrarMensaje(msg, tipo = 'info') {
  const cont = document.getElementById('toast-container');
  if (!cont) {
    alert(msg);
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast ' + (tipo === 'error' ? 'toast-error' : 'toast-info');
  toast.textContent = msg;
  cont.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentElement === cont) cont.removeChild(toast);
    }, 250);
  }, 3200);
}

function actualizarUserInfo() {
  const cont = document.getElementById('user-info');
  if (!usuarioActual) {
    cont.innerHTML = '';
    return;
  }
  cont.innerHTML = `Hola, ${usuarioActual.nombre} · <button id="btn-logout" type="button" class="link-button">Salir</button>`;
  document.getElementById('btn-logout').onclick = async () => {
    try {
      await apiFetch('auth.php?accion=logout', { method: 'POST' });
    } catch {}
    usuarioActual = null;
    document.getElementById('app-view').classList.add('hidden');
    document.getElementById('auth-view').classList.remove('hidden');
    actualizarUserInfo();
  };
}

function cambiarTab(nombre) {
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === nombre);
  });
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.id === `tab-${nombre}`);
  });
}

function renderCategorias() {
  const select = document.getElementById('select-categoria');
  const lista = document.getElementById('lista-categorias');
  select.innerHTML = '';
  lista.innerHTML = '';

  categorias.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.nombre} (${cat.tipo})`;
    select.appendChild(opt);

    const li = document.createElement('li');
    li.textContent = `${cat.nombre} · ${cat.tipo}${cat.es_recurrente ? ' · recurrente' : ''}`;
    lista.appendChild(li);
  });
}

function renderTransacciones() {
  const tbody = document.querySelector('#tabla-transacciones tbody');
  tbody.innerHTML = '';

  const termino = (document.getElementById('filtro-busqueda')?.value || '').toLowerCase();

  transacciones.forEach(t => {
    const texto = `${t.fecha} ${t.tipo} ${t.categoria_nombre} ${t.descripcion || ''}`.toLowerCase();
    if (termino && !texto.includes(termino)) return;
    const tr = document.createElement('tr');
    const tdFecha = document.createElement('td');
    tdFecha.textContent = t.fecha;
    const tdTipo = document.createElement('td');
    tdTipo.textContent = t.tipo === 'gasto' ? 'Gasto' : 'Ingreso';
    tdTipo.className = t.tipo === 'gasto' ? 'badge-tipo-gasto' : 'badge-tipo-ingreso';
    const tdCat = document.createElement('td');
    tdCat.textContent = t.categoria_nombre;
    const tdDesc = document.createElement('td');
    tdDesc.textContent = t.descripcion || '';
    const tdImp = document.createElement('td');
    tdImp.textContent = Number(t.importe).toFixed(2);
    const tdAcc = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Eliminar';
    btn.onclick = () => eliminarTransaccion(t.id);
    tdAcc.appendChild(btn);

    tr.append(tdFecha, tdTipo, tdCat, tdDesc, tdImp, tdAcc);
    tbody.appendChild(tr);
  });

  renderResumen();
}

function renderResumen() {
  const cont = document.getElementById('resumen-cards');
  if (!cont) return;
  let totalGastos = 0;
  let totalIngresos = 0;
  transacciones.forEach(t => {
    if (t.tipo === 'gasto') totalGastos += Number(t.importe);
    else totalIngresos += Number(t.importe);
  });
  const saldo = totalIngresos - totalGastos;

  cont.innerHTML = '';
  const items = [
    { label: 'Ingresos', valor: totalIngresos, clase: 'resumen-ingreso', detalle: '' },
    { label: 'Gastos', valor: totalGastos, clase: 'resumen-gasto', detalle: '' },
    { label: 'Saldo', valor: saldo, clase: saldo >= 0 ? 'resumen-ingreso' : 'resumen-gasto', detalle: '' },
  ];

  items.forEach(it => {
    const div = document.createElement('div');
    div.className = `card resumen-card ${it.clase}`;
    div.innerHTML = `<span class="resumen-label">${it.label}</span>
      <span class="resumen-valor">${it.valor.toFixed(2)}</span>`;
    cont.appendChild(div);
  });
}

function renderObjetivos() {
  const lista = document.getElementById('lista-objetivos');
  lista.innerHTML = '';

  objetivos.forEach(o => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.innerHTML = `<strong>${o.nombre}</strong><br><small>${o.monto_objetivo.toFixed(2)} · límite: ${o.fecha_limite || '-'} </small>`;

    const right = document.createElement('div');
    const spanEstado = document.createElement('span');
    spanEstado.textContent = o.estado;
    spanEstado.className = `estado-objetivo ${o.estado}`;

    const sel = document.createElement('select');
    ['activo','completado','cancelado'].forEach(est => {
      const op = document.createElement('option');
      op.value = est;
      op.textContent = est;
      if (o.estado === est) op.selected = true;
      sel.appendChild(op);
    });
    sel.onchange = () => actualizarEstadoObjetivo(o.id, sel.value);

    right.append(spanEstado, sel);
    li.append(left, right);
    lista.appendChild(li);
  });
}

async function cargarUsuario() {
  try {
    const data = await apiFetch('auth.php?accion=yo');
    if (data.autenticado) {
      usuarioActual = data.usuario;
      document.getElementById('auth-view').classList.add('hidden');
      document.getElementById('app-view').classList.remove('hidden');
      actualizarUserInfo();
      await Promise.all([cargarCategorias(), cargarTransacciones(), cargarObjetivos()]);
      await sincronizarColaOffline();
      await cargarTransacciones();
    }
  } catch (e) {
    console.warn(e);
  }
}

async function cargarCategorias() {
  const data = await apiFetch('categorias.php');
  categorias = data.items || [];
  renderCategorias();
}

async function cargarTransacciones() {
  const tbody = document.querySelector('#tabla-transacciones tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  }
  const params = new URLSearchParams();
  const desde = document.getElementById('filtro-desde').value;
  const hasta = document.getElementById('filtro-hasta').value;
  const tipo = document.getElementById('filtro-tipo').value;
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if (tipo) params.set('tipo', tipo);

  const data = await apiFetch('transacciones.php' + (params.toString() ? `?${params}` : ''));
  transacciones = data.items || [];
  renderTransacciones();
}

async function cargarObjetivos() {
  const data = await apiFetch('objetivos.php');
  objetivos = (data.items || []).map(o => ({
    ...o,
    monto_objetivo: Number(o.monto_objetivo),
  }));
  renderObjetivos();
}

async function eliminarTransaccion(id) {
  if (!confirm('¿Eliminar esta transacción?')) return;
  await apiFetch(`transacciones.php?id=${id}`, { method: 'DELETE' });
  await cargarTransacciones();
}

async function actualizarEstadoObjetivo(id, estado) {
  await apiFetch(`objetivos.php?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify({ estado }),
  });
  await cargarObjetivos();
}

function configurarFormularios() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  document.getElementById('show-register').onclick = () => {
    document.getElementById('register-card').classList.remove('hidden');
    document.getElementById('login-form').parentElement.classList.add('hidden');
  };
  document.getElementById('show-login').onclick = () => {
    document.getElementById('register-card').classList.add('hidden');
    document.getElementById('login-form').parentElement.classList.remove('hidden');
  };

  loginForm.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    try {
      const data = await apiFetch('auth.php?accion=login', {
        method: 'POST',
        body: JSON.stringify({
          email: fd.get('email'),
          password: fd.get('password'),
        }),
      });
      usuarioActual = data.usuario;
      document.getElementById('auth-view').classList.add('hidden');
      document.getElementById('app-view').classList.remove('hidden');
      actualizarUserInfo();
      await Promise.all([cargarCategorias(), cargarTransacciones(), cargarObjetivos()]);
      await sincronizarColaOffline();
      await cargarTransacciones();
    } catch (e) {
      mostrarMensaje(e.message, 'error');
    }
  };

  registerForm.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(registerForm);
    try {
      const data = await apiFetch('auth.php?accion=registro', {
        method: 'POST',
        body: JSON.stringify({
          nombre: fd.get('nombre'),
          email: fd.get('email'),
          password: fd.get('password'),
        }),
      });
      usuarioActual = data.usuario;
      document.getElementById('auth-view').classList.add('hidden');
      document.getElementById('app-view').classList.remove('hidden');
      actualizarUserInfo();
      await Promise.all([cargarCategorias(), cargarTransacciones(), cargarObjetivos()]);
    } catch (e) {
      mostrarMensaje(e.message, 'error');
    }
  };

  document.getElementById('form-categoria').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await apiFetch('categorias.php', {
        method: 'POST',
        body: JSON.stringify({
          nombre: fd.get('nombre'),
          tipo: fd.get('tipo'),
          es_recurrente: fd.get('es_recurrente') === 'on',
        }),
      });
      e.target.reset();
      await cargarCategorias();
    } catch (err) {
      mostrarMensaje(err.message, 'error');
    }
  };

  document.getElementById('form-objetivo').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await apiFetch('objetivos.php', {
        method: 'POST',
        body: JSON.stringify({
          nombre: fd.get('nombre'),
          monto_objetivo: parseFloat(fd.get('monto_objetivo') || '0'),
          fecha_limite: fd.get('fecha_limite') || null,
        }),
      });
      e.target.reset();
      await cargarObjetivos();
    } catch (err) {
      mostrarMensaje(err.message, 'error');
    }
  };

  document.getElementById('form-transaccion').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      tipo: fd.get('tipo'),
      categoria_id: parseInt(fd.get('categoria_id') || '0', 10),
      fecha: fd.get('fecha'),
      importe: parseFloat(fd.get('importe') || '0'),
      descripcion: fd.get('descripcion') || null,
      metodo_pago: fd.get('metodo_pago') || null,
    };

    if (!navigator.onLine) {
      const cola = cargarColaOffline();
      cola.push({ ...payload, _idLocal: Date.now() });
      guardarColaOffline(cola);
      mostrarMensaje('Transacción guardada offline. Se sincronizará cuando haya conexión.');
      transacciones.unshift({ ...payload, id: `local-${Date.now()}`, categoria_nombre: categorias.find(c => c.id == payload.categoria_id)?.nombre || '', creado_offline: 1 });
      renderTransacciones();
      e.target.reset();
      return;
    }

    try {
      await apiFetch('transacciones.php', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      e.target.reset();
      await cargarTransacciones();
    } catch (err) {
      const cola = cargarColaOffline();
      cola.push({ ...payload, _idLocal: Date.now() });
      guardarColaOffline(cola);
      mostrarMensaje('No se pudo contactar con el servidor. Transacción guardada offline.');
    }
  };

  document.getElementById('btn-filtrar').onclick = () => {
    cargarTransacciones().catch(e => mostrarMensaje(e.message, 'error'));
  };

  const inputBusqueda = document.getElementById('filtro-busqueda');
  if (inputBusqueda) {
    inputBusqueda.addEventListener('input', () => {
      renderTransacciones();
    });
  }

  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.onclick = () => cambiarTab(btn.dataset.tab);
  });
}

function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('../service-worker.js').catch(err => {
        console.warn('SW registration failed', err);
      });
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  configurarFormularios();
  registrarServiceWorker();

  const fechaInput = document.querySelector("#form-transaccion input[name='fecha']");
  if (fechaInput && !fechaInput.value) {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    fechaInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const banner = document.getElementById('cookies-banner');
  const btnCookies = document.getElementById('btn-aceptar-cookies');
  if (banner && btnCookies) {
    const aceptadas = localStorage.getItem('cookies_aceptadas');
    if (aceptadas !== '1') {
      banner.classList.remove('hidden');
    }
    btnCookies.addEventListener('click', () => {
      localStorage.setItem('cookies_aceptadas', '1');
      banner.classList.add('hidden');
    });
  }

  cargarUsuario();
});
