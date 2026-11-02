// Sesión de administradores: token firmado con HMAC-SHA256 que la página guarda
// solo en memoria y envía en la cabecera Authorization. No se usa cookie: al
// salir, recargar o cerrar la página, la sesión desaparece.
//
// Administradores en variables de entorno (hasta 10):
//   ADMIN_USER   / ADMIN_PASSWORD      → administrador 1
//   ADMIN_USER_2 / ADMIN_PASSWORD_2    → administrador 2
//   ADMIN_USER_3 / ADMIN_PASSWORD_3    → ...
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const DURACION_S = 60 * 60; // validez máxima: 1 hora
const MAX_ADMINS = 10;

const secreto = () => process.env.SESSION_SECRET || '';

// Valor de una variable de entorno sin espacios ni comillas pegadas por error
const variable = nombre => String(process.env[nombre] || '').trim().replace(/^(["'])(.*)\1$/, '$2');

function administradores() {
  const lista = [];
  for (let i = 1; i <= MAX_ADMINS; i++) {
    const sufijo = i === 1 ? '' : `_${i}`;
    const usuario = variable(`ADMIN_USER${sufijo}`).toLowerCase();
    const contrasena = variable(`ADMIN_PASSWORD${sufijo}`);
    if (usuario && contrasena) lista.push({ usuario, contrasena });
  }
  return lista;
}

export const authConfigurada = () => administradores().length > 0 && secreto().length >= 32;

const firmar = valor => createHmac('sha256', secreto()).update(`admin.${valor}`).digest('base64url');

// Comparación en tiempo constante (evita deducir la contraseña midiendo tiempos)
export function iguales(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// Devuelve el usuario si las credenciales son válidas; si no, null.
// El usuario no distingue mayúsculas; la contraseña sí.
export function credencialesValidas(usuario, contrasena) {
  const u = String(usuario).trim().toLowerCase();
  let valido = null;
  // Se revisan todos sin salir antes, para no revelar información por el tiempo de respuesta
  for (const admin of administradores()) {
    const ok = iguales(u, admin.usuario) & iguales(contrasena, admin.contrasena);
    if (ok && !valido) valido = admin.usuario;
  }
  return valido;
}

export function crearToken(usuario) {
  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  const u = Buffer.from(usuario).toString('base64url');
  return `${exp}.${u}.${firmar(`${exp}.${u}`)}`;
}

// Devuelve el usuario de una sesión válida; si no, null.
export function esAdmin(req) {
  if (!authConfigurada()) return null;
  const m = /^Bearer (\d+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const [, exp, u, firma] = m;
  if (Number(exp) < Date.now() / 1000) return null;
  const esperada = Buffer.from(firmar(`${exp}.${u}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  // Si el administrador fue eliminado de Vercel, su sesión deja de valer
  const usuario = Buffer.from(u, 'base64url').toString();
  return administradores().some(a => a.usuario === usuario) ? usuario : null;
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
