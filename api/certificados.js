// /api/certificados
//   GET    ?folio=GB-XXXX-XXXX     público: datos de un certificado
//   GET    ?lista=1&q=texto        admin: certificados emitidos (búsqueda)
//   POST   { curso, nombre, fecha } admin: registra un certificado y asigna folio
//   PUT    { folio, imagen }        admin: guarda la imagen generada del certificado
//   PATCH  { folio, estado }        admin: revoca o reactiva
import { esAdmin, mismoOrigen } from './_lib/auth.js';
import { bdConfigurada, redis, pipeline } from './_lib/redis.js';
import { json, error, leerCuerpo, metodoNoPermitido } from './_lib/respuesta.js';
import { FOLIO, nuevoFolio, claveCert, claveImagen, INDICE, validarDatos, publico } from './_lib/certificados.js';

const IMAGEN_MAX_BYTES = 700_000;

const sinAcentos = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function leerCert(folio) {
  const crudo = await redis('GET', claveCert(folio));
  return crudo ? JSON.parse(crudo) : null;
}

async function obtener(req, res, params) {
  const admin = esAdmin(req);

  if (params.get('lista')) {
    if (!admin) return error(res, 401, 'No autorizado.');
    const folios = await redis('ZREVRANGE', INDICE, 0, 499);
    if (!folios.length) return json(res, 200, { certificados: [] });
    const crudos = await redis('MGET', ...folios.map(claveCert));
    const q = sinAcentos(String(params.get('q') || '').slice(0, 100).trim());
    const lista = crudos.filter(Boolean).map(c => JSON.parse(c))
      .filter(c => !q || sinAcentos(`${c.folio} ${c.nombre} ${c.curso}`).includes(q))
      .slice(0, 100);
    return json(res, 200, { certificados: lista });
  }

  const folio = String(params.get('folio') || '').trim().toUpperCase();
  if (!FOLIO.test(folio)) return error(res, 404, 'Certificado no encontrado.');
  const cert = await leerCert(folio);
  if (!cert || (cert.estado === 'pendiente' && !admin)) return error(res, 404, 'Certificado no encontrado.');
  return json(res, 200, admin ? cert : publico(cert));
}

async function crear(req, res) {
  const { datos, error: msg } = validarDatos(await leerCuerpo(req, 5000));
  if (msg) return error(res, 400, msg);

  // Folio único: SET ... NX solo escribe si la clave no existe
  for (let i = 0; i < 5; i++) {
    const folio = nuevoFolio();
    const cert = { folio, ...datos, estado: 'pendiente', creado: new Date().toISOString() };
    const ok = await redis('SET', claveCert(folio), JSON.stringify(cert), 'NX');
    if (ok === 'OK') {
      await redis('ZADD', INDICE, Date.now(), folio);
      return json(res, 201, cert);
    }
  }
  return error(res, 500, 'No fue posible generar un folio. Intente de nuevo.');
}

async function guardarImagen(req, res) {
  const cuerpo = await leerCuerpo(req, 1_200_000);
  const folio = String(cuerpo.folio || '').toUpperCase();
  if (!FOLIO.test(folio)) return error(res, 400, 'Folio no válido.');

  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(cuerpo.imagen || ''));
  if (!m) return error(res, 400, 'La imagen debe ser JPEG.');
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > IMAGEN_MAX_BYTES) return error(res, 413, 'La imagen es demasiado grande.');
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return error(res, 400, 'La imagen no es un JPEG válido.');

  const cert = await leerCert(folio);
  if (!cert) return error(res, 404, 'Certificado no encontrado.');
  if (cert.estado === 'pendiente') cert.estado = 'vigente';
  await pipeline([
    ['SET', claveImagen(folio), m[1]],
    ['SET', claveCert(folio), JSON.stringify(cert)],
  ]);
  return json(res, 200, cert);
}

async function cambiarEstado(req, res) {
  const cuerpo = await leerCuerpo(req, 2000);
  const folio = String(cuerpo.folio || '').toUpperCase();
  const estado = String(cuerpo.estado || '');
  if (!FOLIO.test(folio)) return error(res, 400, 'Folio no válido.');
  if (!['vigente', 'revocado'].includes(estado)) return error(res, 400, 'Estado no válido.');

  const cert = await leerCert(folio);
  if (!cert) return error(res, 404, 'Certificado no encontrado.');
  if (cert.estado === 'pendiente') return error(res, 409, 'El certificado aún no tiene imagen generada.');
  cert.estado = estado;
  await redis('SET', claveCert(folio), JSON.stringify(cert));
  return json(res, 200, cert);
}

export default async function handler(req, res) {
  if (!bdConfigurada()) return error(res, 503, 'El servicio de certificados aún no está configurado.');
  const params = new URL(req.url, 'http://localhost').searchParams;

  try {
    if (req.method === 'GET') return await obtener(req, res, params);
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return metodoNoPermitido(res, ['GET', 'POST', 'PUT', 'PATCH']);

    if (!mismoOrigen(req)) return error(res, 403, 'Origen no permitido.');
    if (!esAdmin(req)) return error(res, 401, 'Su sesión expiró. Inicie sesión nuevamente.');
    if (req.method === 'POST') return await crear(req, res);
    if (req.method === 'PUT') return await guardarImagen(req, res);
    return await cambiarEstado(req, res);
  } catch (e) {
    console.error(e);
    return error(res, 500, 'Ocurrió un error. Intente de nuevo.');
  }
}
