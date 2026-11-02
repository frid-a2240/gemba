// GET /api/session  →  { configurado: true|false }
// La sesión no se guarda en el navegador: cada visita a la página empieza sin sesión.
import { authConfigurada } from './_lib/auth.js';
import { bdConfigurada } from './_lib/redis.js';
import { json, metodoNoPermitido } from './_lib/respuesta.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return metodoNoPermitido(res, ['GET']);
  return json(res, 200, { configurado: authConfigurada() && bdConfigurada() });
}
