// Reglas compartidas de certificados: folios, validación y almacenamiento.
import { randomInt } from 'node:crypto';

// Alfabeto sin caracteres ambiguos (sin I, L, O, U)
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const FOLIO = /^GB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const bloque = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
export const nuevoFolio = () => `GB-${bloque()}-${bloque()}`;

export const claveCert = folio => `cert:${folio}`;
export const claveImagen = folio => `certimg:${folio}`;
export const INDICE = 'certs';

export const ESTADOS = ['pendiente', 'vigente', 'revocado'];

// Texto limpio: sin caracteres de control, espacios normalizados, longitud acotada
export function limpiar(valor, max) {
  return String(valor ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function fechaValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

export function validarDatos(cuerpo) {
  const curso = limpiar(cuerpo.curso, 150);
  const nombre = limpiar(cuerpo.nombre, 120);
  const fecha = String(cuerpo.fecha || '');
  if (curso.length < 3) return { error: 'Escriba el nombre del curso.' };
  if (nombre.length < 5) return { error: 'Escriba el nombre completo de quien acreditó.' };
  if (!fechaValida(fecha)) return { error: 'La fecha no es válida.' };
  return { datos: { curso, nombre, fecha } };
}

// Datos que se muestran al público (nunca campos internos)
export const publico = c => ({ folio: c.folio, nombre: c.nombre, curso: c.curso, fecha: c.fecha, estado: c.estado });
