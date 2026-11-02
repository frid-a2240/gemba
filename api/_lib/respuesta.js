// Respuestas JSON sin caché (los datos de la API siempre deben ser actuales)
export function json(res, estado, datos) {
  res.statusCode = estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(datos));
}

export const error = (res, estado, mensaje) => json(res, estado, { error: mensaje });

// Lee el cuerpo JSON (Vercel ya lo entrega en req.body; si no, se lee del flujo)
export async function leerCuerpo(req, limite = 2_000_000) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let datos = '';
  for await (const parte of req) {
    datos += parte;
    if (datos.length > limite) throw new Error('Cuerpo demasiado grande');
  }
  return JSON.parse(datos || '{}');
}

export function metodoNoPermitido(res, permitidos) {
  res.setHeader('Allow', permitidos.join(', '));
  return error(res, 405, 'Método no permitido.');
}
