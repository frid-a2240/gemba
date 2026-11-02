// GET /api/session  →  { admin: true|false, configurado: true|false }
import { esAdmin, authConfigurada } from './_lib/auth.js';
import { bdConfigurada } from './_lib/redis.js';
import { json, metodoNoPermitido } from './_lib/respuesta.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return metodoNoPermitido(res, ['GET']);
  return json(res, 200, { admin: esAdmin(req), configurado: authConfigurada() && bdConfigurada() });
}
