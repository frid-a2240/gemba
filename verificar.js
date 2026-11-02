'use strict';

// Verificación de certificados: lee el folio de la URL (?folio=GB-XXXX-XXXX)
// y consulta la API (certificados emitidos desde el panel). Si no existe ahí,
// busca en /certificados/<folio>.json (certificados generados con tools/).
// Todo el contenido se inserta como texto (nunca como HTML).

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
  img.src = cert.imagen;
  img.alt = `Certificado de ${cert.nombre}: ${cert.curso}`;
  $('cert-link').href = img.src;
  $('resultado').hidden = false;
  document.title = `Certificado ${cert.folio} — GENBA Institution`;
}

async function buscar(folio) {
  const api = await fetch(`/api/certificados?folio=${folio}`, { cache: 'no-store' }).catch(() => null);
  if (api && api.ok) {
    const cert = await api.json();
    return { ...cert, imagen: `/api/certificado-imagen?folio=${folio}` };
  }
  if (api && api.status !== 404 && api.status !== 503) throw new Error('API');

  const estatico = await fetch(`/certificados/${folio}.json`, { cache: 'no-store' });
  if (!estatico.ok) return null;
  const cert = await estatico.json();
  return { ...cert, curso: cert.programa, imagen: `/certificados/${folio}.png` };
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
    buscar(folio)
      .then(cert => (cert && cert.folio === folio ? mostrar(cert) : noEncontrado()))
      .catch(() => estado('error', 'No fue posible verificar',
        'Ocurrió un problema de conexión. Intente nuevamente en unos momentos.'));
  }
}
