// Sesión del administrador: token firmado con HMAC-SHA256 que la página guarda
// solo en memoria y envía en la cabecera Authorization. No se usa cookie: al
// salir, recargar o cerrar la página, la sesión desaparece.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const DURACION_S = 60 * 60; // validez máxima: 1 hora

const secreto = () => process.env.SESSION_SECRET || '';

export const authConfigurada = () =>
  Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD && secreto().length >= 32);

const firmar = valor => createHmac('sha256', secreto()).update(`admin.${valor}`).digest('base64url');

// Comparación en tiempo constante (evita deducir la contraseña midiendo tiempos)
export function iguales(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function credencialesValidas(usuario, contrasena) {
  const okUsuario = iguales(usuario, process.env.ADMIN_USER);
  const okContrasena = iguales(contrasena, process.env.ADMIN_PASSWORD);
  return okUsuario && okContrasena;
}

export function crearToken() {
  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  return `${exp}.${firmar(exp)}`;
}

export function esAdmin(req) {
  if (!authConfigurada()) return false;
  const m = /^Bearer (\d+)\.([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const [, exp, firma] = m;
  if (Number(exp) < Date.now() / 1000) return false;
  const esperada = Buffer.from(firmar(exp));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

// Las peticiones que modifican datos deben venir de este mismo sitio
export function mismoOrigen(req) {
  const origen = req.headers.origin;
  if (!origen) return true;
  try { return new URL(origen).host === req.headers.host; } catch { return false; }
}

export function ipCliente(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
}
