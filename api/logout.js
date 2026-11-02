// POST /api/logout
import { cerrarSesion, mismoOrigen } from './_lib/auth.js';
import { json, error, metodoNoPermitido } from './_lib/respuesta.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return metodoNoPermitido(res, ['POST']);
  if (!mismoOrigen(req)) return error(res, 403, 'Origen no permitido.');
  cerrarSesion(res);
  return json(res, 200, { ok: true });
}
