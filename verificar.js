'use strict';

// Verificación de certificados: lee el folio de la URL (?folio=GB-XXXX-XXXX)
// y consulta /certificados/<folio>.json. Todo el contenido se inserta como
// texto (nunca como HTML) para evitar inyección de código.

const FOLIO = /^GB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const $ = id => document.getElementById(id);

const folio = (new URLSearchParams(location.search).get('folio') || '').trim().toUpperCase();
if (folio) $('folio').value = folio;

function estado(tipo, titulo, texto) {
  const box = $('estado');
  box.className = `status status-${tipo}`;
  $('estado-titulo').textContent = titulo;
  $('estado-texto').textContent = texto;
  box.hidden = false;
}

function mostrar(cert) {
  const revocado = cert.estado !== 'vigente';

  if (revocado) {
    estado('error', 'Certificado revocado',
      'Este certificado fue emitido por GENBA Institution, pero ya no es válido. Para mayor información, comuníquese con nosotros.');
  } else {
    estado('ok', 'Certificado válido',
      cert.ejemplo
        ? 'Certificado de demostración emitido por GENBA Institution.'
        : 'Este certificado fue emitido por GENBA Institution y se encuentra vigente.');
  }

  $('d-nombre').textContent = cert.nombre;
  $('d-programa').textContent = cert.programa;
  $('d-horas').textContent = `${cert.horas} horas`;
  $('d-lugar').textContent = `${cert.ciudad} · ${cert.fecha}`;
  $('d-folio').textContent = cert.folio;
  $('d-emisor').textContent = cert.emisor;

  const img = $('cert-img');
  const pdf = $('d-pdf');
  if (revocado) {
    img.closest('figure').hidden = true;
    pdf.hidden = true;
  } else {
    img.src = `/certificados/${cert.folio}.png`;
    $('cert-link').href = img.src;
    img.alt = `Certificado de ${cert.nombre}: ${cert.programa}`;
    pdf.href = `/certificados/${cert.folio}.pdf`;
  }
  $('resultado').hidden = false;
  document.title = `Certificado ${cert.folio} — GENBA Institution`;
}

function noEncontrado() {
  estado('error', 'Certificado no encontrado',
    'No existe un certificado con este folio. Verifique que lo haya capturado correctamente o comuníquese con nosotros.');
}

if (folio) {
  if (!FOLIO.test(folio)) {
    noEncontrado();
  } else {
    fetch(`/certificados/${folio}.json`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(cert => (cert && cert.folio === folio ? mostrar(cert) : noEncontrado()))
      .catch(() => estado('error', 'No fue posible verificar',
        'Ocurrió un problema de conexión. Intente nuevamente en unos momentos.'));
  }
}
