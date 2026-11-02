// GET /api/certificado-imagen?folio=GB-XXXX-XXXX  →  JPEG del certificado vigente
import { esAdmin } from './_lib/auth.js';
import { bdConfigurada, pipeline } from './_lib/redis.js';
import { error, metodoNoPermitido } from './_lib/respuesta.js';
import { FOLIO, claveCert, claveImagen } from './_lib/certificados.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return metodoNoPermitido(res, ['GET']);
  if (!bdConfigurada()) return error(res, 503, 'Servicio no configurado.');

  const folio = String(new URL(req.url, 'http://localhost').searchParams.get('folio') || '').toUpperCase();
  if (!FOLIO.test(folio)) return error(res, 404, 'No encontrado.');

  try {
    const [crudo, imagen] = await pipeline([['GET', claveCert(folio)], ['GET', claveImagen(folio)]]);
    const cert = crudo && JSON.parse(crudo);
    if (!cert || !imagen) return error(res, 404, 'No encontrado.');
    if (cert.estado !== 'vigente' && !esAdmin(req)) return error(res, 404, 'No encontrado.');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(Buffer.from(imagen, 'base64'));
  } catch (e) {
    console.error(e);
    return error(res, 500, 'Error al obtener la imagen.');
  }
}
