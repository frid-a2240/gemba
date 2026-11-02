// GET /api/firma  →  imagen PNG de la firma (solo administrador)
// La firma vive en la variable secreta FIRMA_PNG_BASE64 de Vercel: nunca en
// el repositorio ni en los archivos públicos del sitio.
import { esAdmin } from './_lib/auth.js';
import { error, metodoNoPermitido } from './_lib/respuesta.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return metodoNoPermitido(res, ['GET']);
  if (!esAdmin(req)) return error(res, 401, 'No autorizado.');

  const b64 = process.env.FIRMA_PNG_BASE64;
  if (!b64) return error(res, 404, 'Firma no configurada.');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(Buffer.from(b64, 'base64'));
}
