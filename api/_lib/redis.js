// Cliente mínimo para Upstash Redis (API REST). Sin dependencias externas.
// Variables que crea la integración de Vercel: KV_REST_API_URL / KV_REST_API_TOKEN
// (o UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).

const URL_BD = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const bdConfigurada = () => Boolean(URL_BD && TOKEN);

async function llamar(ruta, cuerpo) {
  const r = await fetch(`${URL_BD}${ruta}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`Base de datos: HTTP ${r.status}`);
  return r.json();
}

// Un comando: redis('GET', 'clave')
export async function redis(...comando) {
  const { result, error } = await llamar('/', comando);
  if (error) throw new Error(`Base de datos: ${error}`);
  return result;
}

// Varios comandos en una sola petición: pipeline([['GET','a'], ['GET','b']])
export async function pipeline(comandos) {
  const respuestas = await llamar('/pipeline', comandos);
  return respuestas.map(({ result, error }) => {
    if (error) throw new Error(`Base de datos: ${error}`);
    return result;
  });
}
