'use strict';

// Página de Certificados: verificación pública y panel del administrador.
// Todo dato que viene del servidor se inserta como texto (textContent), nunca como HTML.

const $ = id => document.getElementById(id);

const api = async (ruta, opciones = {}) => {
  const r = await fetch(ruta, {
    credentials: 'same-origin',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Ocurrió un error. Intente de nuevo.'), { estado: r.status });
  return datos;
};

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
  let sesion = { admin: false, configurado: false };
  try { sesion = await api('/api/session'); } catch { /* sin servidor: solo vista pública */ }

  if (!sesion.configurado) {
    $('login-ayuda').textContent = 'El acceso administrativo aún no está disponible.';
    [...$('form-login').elements].forEach(el => { el.disabled = true; });
    return;
  }
  if (sesion.admin) mostrarPanel();
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
    await api('/api/login', { method: 'POST', body: { usuario: form.usuario.value, contrasena: form.contrasena.value } });
    form.reset();
    mostrarPanel();
  } catch (err) {
    mensaje(msg, err.message);
  } finally {
    boton.disabled = false;
  }
});

$('btn-salir').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

function mostrarPanel() {
  $('vista-publica').hidden = true;
  $('panel').hidden = false;
  if (!$('e-fecha').value) $('e-fecha').value = new Date().toLocaleDateString('en-CA');
  cargarLista();
  $('e-curso').focus();
}

function sesionExpirada(err) {
  if (err.estado !== 401) return false;
  alert('Su sesión expiró. Inicie sesión nuevamente.');
  location.reload();
  return true;
}

// ─── Emisión ─────────────────────────────────────────────────────
// Dibuja el certificado, lo guarda en el servidor y devuelve su JPEG
async function generarImagen(cert) {
  const canvas = await window.GenbaCert.dibujar(cert, urlVerificacion(cert.folio));
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
    const r = await fetch(`/api/certificado-imagen?folio=${cert.folio}`, { credentials: 'same-origin' });
    if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
    else bytes = window.GenbaCert.bytesDeDataUrl(await generarImagen(cert)); // registro sin imagen: se genera ahora
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
