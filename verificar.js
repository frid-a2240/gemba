'use strict';

// Verificación de certificados: lee el folio de la URL (?folio=GB-XXXX-XXXX)
// y consulta /certificados/<folio>.json. Todo el contenido se inserta como
// texto (nunca como HTML) para evitar inyección de código.

const FOLIO = /^GB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const $ = id => document.getElementById(id);

const folio = (new URLSearchParams(location.search).get('folio') || '').trim().toUpperCase();

function estado(tipo, titulo, texto) {
  const box = $('estado');
  box.className = `status status-${tipo}`;
  $('estado-titulo').textContent = titulo;
  $('estado-texto').textContent = texto;
  box.hidden = false;
}

function mostrar(cert) {
  if (cert.estado !== 'vigente') {
    estado('error', 'Certificado revocado',
      'Este certificado fue emitido por GENBA Institution, pero ya no es válido. Para mayor información, comuníquese con nosotros.');
    return;
  }

  estado('ok', 'Certificado válido',
    cert.ejemplo
      ? 'Certificado de demostración emitido por GENBA Institution.'
      : 'Este certificado fue emitido por GENBA Institution y se encuentra vigente.');

  const img = $('cert-img');
  img.src = `/certificados/${cert.folio}.png`;
  img.alt = `Certificado de ${cert.nombre}: ${cert.programa}`;
  $('cert-link').href = img.src;
  $('resultado').hidden = false;
  document.title = `Certificado ${cert.folio} — GENBA Institution`;
}

function noEncontrado() {
  estado('error', 'Certificado no encontrado',
    'No existe un certificado con este folio. Para mayor información, comuníquese con nosotros.');
}

if (folio) {
  $('sin-folio').hidden = true;
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
