// POST /api/login  { usuario, contrasena }
import { authConfigurada, credencialesValidas, crearToken, mismoOrigen, ipCliente } from './_lib/auth.js';
import { bdConfigurada, redis } from './_lib/redis.js';
import { json, error, leerCuerpo, metodoNoPermitido } from './_lib/respuesta.js';

const INTENTOS_MAX = 5;
const BLOQUEO_S = 15 * 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return metodoNoPermitido(res, ['POST']);
  if (!mismoOrigen(req)) return error(res, 403, 'Origen no permitido.');
  if (!authConfigurada() || !bdConfigurada()) return error(res, 503, 'El acceso administrativo aún no está configurado.');

  // Límite de intentos por IP para impedir ataques de fuerza bruta
  const clave = `intentos:${ipCliente(req)}`;
  const intentos = await redis('INCR', clave);
  if (intentos === 1) await redis('EXPIRE', clave, BLOQUEO_S);
  if (intentos > INTENTOS_MAX) {
    return error(res, 429, 'Demasiados intentos. Espere 15 minutos e intente de nuevo.');
  }

  let cuerpo;
  try { cuerpo = await leerCuerpo(req, 2000); } catch { return error(res, 400, 'Solicitud no válida.'); }
  const usuario = String(cuerpo.usuario || '').slice(0, 100);
  const contrasena = String(cuerpo.contrasena || '').slice(0, 200);

  if (!credencialesValidas(usuario, contrasena)) {
    return error(res, 401, 'Usuario o contraseña incorrectos.');
  }

  await redis('DEL', clave);
  return json(res, 200, { token: crearToken() });
}
