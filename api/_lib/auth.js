// Sesión del administrador: cookie HttpOnly firmada con HMAC-SHA256.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const COOKIE = 'genba_admin';
const DURACION_S = 8 * 60 * 60; // 8 horas

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

function atributos(maxAge) {
  const seguro = process.env.VERCEL ? '; Secure' : '';
  return `Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${seguro}`;
}

export function crearSesion(res) {
  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${firmar(exp)}; ${atributos(DURACION_S)}`);
}

export function cerrarSesion(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; ${atributos(0)}`);
}

export function esAdmin(req) {
  if (!authConfigurada()) return false;
  const cookie = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  const [exp, firma] = cookie.slice(COOKIE.length + 1).split('.');
  if (!exp || !firma || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  const esperada = Buffer.from(firmar(exp));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

// Las peticiones que modifican datos deben venir de este mismo sitio
export function mismoOrigen(req) {
  const origen = req.headers.origin;
  if (!origen) return true; // navegadores sin Origin en GET; SameSite=Strict protege la cookie
  try { return new URL(origen).host === req.headers.host; } catch { return false; }
}

export function ipCliente(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
}
