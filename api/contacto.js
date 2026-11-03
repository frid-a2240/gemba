// POST /api/contacto  { nombre, empresa, correo, telefono, servicio, mensaje, website }
// Envía la solicitud del formulario por correo mediante Resend (resend.com).
// Variables en Vercel:
//   RESEND_API_KEY      clave de la API de Resend
//   CONTACTO_DESTINO    correo que recibe las solicitudes
//   CONTACTO_REMITENTE  opcional; p. ej. "GENBA Institution <contacto@genbainstitution.com>"
//                       (requiere el dominio verificado en Resend)
import { mismoOrigen, ipCliente } from './_lib/auth.js';
import { bdConfigurada, redis } from './_lib/redis.js';
import { json, error, leerCuerpo, metodoNoPermitido } from './_lib/respuesta.js';

const ENVIOS_MAX = 5;
const VENTANA_S = 60 * 60;
const REMITENTE_PRUEBA = 'GENBA Institution <onboarding@resend.dev>';
const CORREO = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

// Una línea: sin caracteres de control ni saltos de línea
const linea = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Texto libre: conserva los saltos de línea
const texto = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n]|[\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') return metodoNoPermitido(res, ['POST']);
  if (!mismoOrigen(req)) return error(res, 403, 'Origen no permitido.');

  const clave = process.env.RESEND_API_KEY;
  const destino = (process.env.CONTACTO_DESTINO || '').trim();
  if (!clave || !CORREO.test(destino)) return error(res, 503, 'El envío directo aún no está configurado.');

  let cuerpo;
  try { cuerpo = await leerCuerpo(req, 10_000); } catch { return error(res, 400, 'Solicitud no válida.'); }

  // Campo trampa para bots: se responde como si se hubiera enviado
  if (cuerpo.website) return json(res, 200, { ok: true });

  const d = {
    nombre: linea(cuerpo.nombre, 80),
    empresa: linea(cuerpo.empresa, 100),
    correo: linea(cuerpo.correo, 120),
    telefono: linea(cuerpo.telefono, 20),
    servicio: linea(cuerpo.servicio, 100),
    mensaje: texto(cuerpo.mensaje, 2000),
  };
  if (!d.nombre || !d.empresa || !d.servicio || !d.mensaje) return error(res, 400, 'Complete todos los campos obligatorios.');
  if (!CORREO.test(d.correo)) return error(res, 400, 'El correo electrónico no es válido.');

  // Límite de envíos por IP para evitar abuso
  if (bdConfigurada()) {
    const llave = `contacto:${ipCliente(req)}`;
    const envios = await redis('INCR', llave);
    if (envios === 1) await redis('EXPIRE', llave, VENTANA_S);
    if (envios > ENVIOS_MAX) return error(res, 429, 'Ha enviado varias solicitudes. Intente de nuevo más tarde.');
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: (process.env.CONTACTO_REMITENTE || '').trim() || REMITENTE_PRUEBA,
      to: [destino],
      reply_to: d.correo,
      subject: `Solicitud de información — ${d.empresa}`,
      text: [
        'Nueva solicitud desde el formulario de genbainstitution.com',
        '',
        `Nombre: ${d.nombre}`,
        `Organización: ${d.empresa}`,
        `Correo: ${d.correo}`,
        `Teléfono: ${d.telefono || '—'}`,
        `Servicio de interés: ${d.servicio}`,
        '',
        d.mensaje,
      ].join('\n'),
    }),
  }).catch(() => null);

  if (!r || !r.ok) return error(res, 502, 'No fue posible enviar su solicitud en este momento.');
  return json(res, 200, { ok: true });
}
