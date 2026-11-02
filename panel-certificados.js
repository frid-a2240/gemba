'use strict';

// Página de Certificados: verificación pública y panel del administrador.
// Todo dato que viene del servidor se inserta como texto (textContent), nunca como HTML.
//
// La sesión vive solo en memoria (variable `token`): no se guarda en cookies ni
// en el almacenamiento del navegador. Al salir de la página, recargar, volver
// atrás o cerrar la pestaña, la sesión se pierde y hay que iniciar sesión de nuevo.

const $ = id => document.getElementById(id);

const INACTIVIDAD_MS = 15 * 60 * 1000;
let token = null;
let firma = null;

async function peticion(ruta, opciones = {}) {
  const headers = {};
  if (opciones.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(ruta, {
    ...opciones,
    headers,
    credentials: 'omit',
    cache: 'no-store',
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  if (!r.ok) {
    const datos = await r.json().catch(() => ({}));
    throw Object.assign(new Error(datos.error || 'Ocurrió un error. Intente de nuevo.'), { estado: r.status });
  }
  return r;
}

const api = async (ruta, opciones) => (await peticion(ruta, opciones)).json();

const urlVerificacion = folio => `${location.origin}/verificar?folio=${folio}`;

function mensaje(el, texto, tipo = 'error') {
  el.textContent = texto;
  el.className = `form-msg ${texto ? `form-msg-${tipo}` : ''}`;
}

// ─── Verificación pública por folio ──────────────────────────────
$('form-verificar').addEventListener('submit', e => {
  const input = $('v-folio');
  input.value = input.value.trim().toUpperCase();
  if (!input.checkValidity()) { e.preventDefault(); input.reportValidity(); }
});

// ─── Sesión ──────────────────────────────────────────────────────
async function iniciar() {
  let configurado = false;
  try { ({ configurado } = await api('/api/session')); } catch { /* sin servidor: solo vista pública */ }

  if (!configurado) {
    $('login-ayuda').textContent = 'El acceso administrativo aún no está disponible.';
    [...$('form-login').elements].forEach(el => { el.disabled = true; });
  }
}

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = $('login-msg');
  if (!form.reportValidity()) return;
  const boton = form.querySelector('button');
  boton.disabled = true;
  mensaje(msg, '');
  try {
    ({ token } = await api('/api/login', { method: 'POST', body: { usuario: form.usuario.value, contrasena: form.contrasena.value } }));
    form.reset();
    firma = await peticion('/api/firma').then(r => r.blob()).then(createImageBitmap).catch(() => null);
    mostrarPanel();
  } catch (err) {
    mensaje(msg, err.message);
  } finally {
    boton.disabled = false;
  }
});

// Borra la sesión y todo dato del panel de la memoria y la pantalla
function cerrarSesion(aviso = '') {
  token = null;
  firma = null;
  ultimo = null;
  clearTimeout(temporizador);
  $('lista').replaceChildren();
  $('r-img').removeAttribute('src');
  $('resultado-emision').hidden = true;
  $('form-emitir').reset();
  mensaje($('emitir-msg'), '');
  $('panel').hidden = true;
  $('vista-publica').hidden = false;
  mensaje($('login-msg'), aviso, 'info');
}

$('btn-salir').addEventListener('click', () => cerrarSesion('Sesión cerrada.'));

// Al salir de la página (otra sección, atrás, recargar, cerrar) la sesión se borra
window.addEventListener('pagehide', () => cerrarSesion());
// Si el navegador restaura la página desde su caché al volver atrás, se muestra sin sesión
window.addEventListener('pageshow', e => { if (e.persisted) cerrarSesion(); });

// Cierre automático por inactividad
let temporizador;
function reiniciarInactividad() {
  if (!token) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => cerrarSesion('Su sesión se cerró por inactividad.'), INACTIVIDAD_MS);
}
['pointerdown', 'keydown', 'input', 'scroll'].forEach(ev =>
  window.addEventListener(ev, reiniciarInactividad, { passive: true }));

function mostrarPanel() {
  $('vista-publica').hidden = true;
  $('panel').hidden = false;
  if (!$('e-fecha').value) $('e-fecha').value = new Date().toLocaleDateString('en-CA');
  reiniciarInactividad();
  cargarLista();
  $('e-curso').focus();
}

function sesionExpirada(err) {
  if (err.estado !== 401) return false;
  cerrarSesion('Su sesión expiró. Inicie sesión nuevamente.');
  return true;
}

// ─── Emisión ─────────────────────────────────────────────────────
// Dibuja el certificado, lo guarda en el servidor y devuelve su JPEG
async function generarImagen(cert) {
  const canvas = await window.GenbaCert.dibujar(cert, urlVerificacion(cert.folio), firma);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  await api('/api/certificados', { method: 'PUT', body: { folio: cert.folio, imagen: dataUrl } });
  return dataUrl;
}

let ultimo = null;

$('form-emitir').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = $('emitir-msg');
  if (!form.reportValidity()) return;
  const boton = $('btn-emitir');
  boton.disabled = true;
  boton.textContent = 'Generando…';
  mensaje(msg, '');
  try {
    const cert = await api('/api/certificados', {
      method: 'POST',
      body: { curso: form.curso.value, nombre: form.nombre.value, fecha: form.fecha.value },
    });
    const dataUrl = await generarImagen(cert);
    ultimo = { cert, bytes: window.GenbaCert.bytesDeDataUrl(dataUrl) };

    $('r-folio').textContent = cert.folio;
    $('r-img').src = dataUrl;
    $('r-ver').href = `/verificar?folio=${cert.folio}`;
    $('resultado-emision').hidden = false;
    mensaje(msg, `Certificado ${cert.folio} generado correctamente.`, 'ok');
    form.nombre.value = '';
    cargarLista();
  } catch (err) {
    if (!sesionExpirada(err)) mensaje(msg, err.message);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Generar certificado';
  }
});

$('r-pdf').addEventListener('click', () => {
  if (ultimo) window.GenbaCert.descargarPdf(ultimo.bytes, ultimo.cert.folio, ultimo.cert.nombre);
});

// ─── Lista y búsqueda ────────────────────────────────────────────
const ETIQUETA = { vigente: 'Vigente', revocado: 'Revocado', pendiente: 'Sin imagen' };

async function descargarDeLista(cert, boton) {
  boton.disabled = true;
  try {
    let bytes;
    if (cert.estado === 'pendiente') {
      bytes = window.GenbaCert.bytesDeDataUrl(await generarImagen(cert)); // registro sin imagen: se genera ahora
    } else {
      const r = await peticion(`/api/certificado-imagen?folio=${cert.folio}`);
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    window.GenbaCert.descargarPdf(bytes, cert.folio, cert.nombre);
    if (cert.estado === 'pendiente') cargarLista();
  } catch (err) {
    if (!sesionExpirada(err)) alert(err.message);
  } finally {
    boton.disabled = false;
  }
}

async function cambiarEstado(cert, estado) {
  const accion = estado === 'revocado' ? 'revocar' : 'reactivar';
  if (!confirm(`¿Desea ${accion} el certificado ${cert.folio} de ${cert.nombre}?`)) return;
  try {
    await api('/api/certificados', { method: 'PATCH', body: { folio: cert.folio, estado } });
    cargarLista();
  } catch (err) {
    if (!sesionExpirada(err)) alert(err.message);
  }
}

function fila(cert) {
  const tr = document.createElement('tr');
  const celda = (texto, etiqueta) => {
    const td = document.createElement('td');
    td.textContent = texto;
    td.dataset.label = etiqueta;
    tr.append(td);
    return td;
  };
  celda(cert.folio, 'Folio').className = 'mono';
  celda(cert.nombre, 'Nombre');
  celda(cert.curso, 'Curso');
  celda(window.GenbaCert.fechaLarga(cert.fecha), 'Fecha');
  const estado = celda('', 'Estado');
  const badge = document.createElement('span');
  badge.className = `badge-estado badge-${cert.estado}`;
  badge.textContent = ETIQUETA[cert.estado] || cert.estado;
  estado.append(badge);

  const acciones = document.createElement('td');
  acciones.className = 'acciones';
  const btn = (texto, fn, clase = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn-mini ${clase}`;
    b.textContent = texto;
    b.addEventListener('click', () => fn(b));
    acciones.append(b);
  };
  btn('PDF', b => descargarDeLista(cert, b));
  if (cert.estado === 'vigente') btn('Revocar', () => cambiarEstado(cert, 'revocado'), 'btn-mini-danger');
  if (cert.estado === 'revocado') btn('Reactivar', () => cambiarEstado(cert, 'vigente'));
  tr.append(acciones);
  return tr;
}

let consulta = 0;
async function cargarLista() {
  const id = ++consulta;
  const q = $('buscar').value.trim();
  try {
    const { certificados } = await api(`/api/certificados?lista=1&q=${encodeURIComponent(q)}`);
    if (id !== consulta) return; // llegó una búsqueda más reciente
    $('lista').replaceChildren(...certificados.map(fila));
    $('lista-vacia').hidden = certificados.length > 0;
  } catch (err) {
    sesionExpirada(err);
  }
}

let espera;
$('buscar').addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(cargarLista, 250);
});

iniciar();
