// Genera los certificados de registro.json:
//   - asigna un folio aleatorio a los registros nuevos
//   - crea el QR que apunta a la página de verificación
//   - produce PDF (impresión) e imagen PNG (verificación en línea)
//   - escribe los datos que consulta /verificar
//
// Uso:  cd tools/certificados && npm install && npm run generar
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import QRCode from 'qrcode';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..');
const outDir = join(site, 'certificados');
const tmpDir = join(here, '.tmp');

const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
const registroPath = join(here, 'registro.json');
const registro = JSON.parse(readFileSync(registroPath, 'utf8'));

if (config.urlVerificacion.includes('CAMBIAR')) {
  console.error('Configure "urlVerificacion" en config.json con el dominio real del sitio.');
  process.exit(1);
}

// ─── Folio aleatorio (no se puede adivinar ni enumerar) ──────────
// Alfabeto sin caracteres ambiguos (sin I, L, O, U)
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const bloque = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
const usados = new Set(registro.map(r => r.folio).filter(Boolean));
const nuevoFolio = () => {
  let f;
  do { f = `GB-${bloque()}-${bloque()}`; } while (usados.has(f));
  usados.add(f);
  return f;
};

// ─── Utilidades ──────────────────────────────────────────────────
const escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataUri = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`;
const fechaLarga = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  const mes = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-MX', { month: 'long', timeZone: 'UTC' });
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} de ${y}`;
};

function buscarNavegador() {
  const candidatos = [
    process.env.NAVEGADOR,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
  const nav = candidatos.find(p => existsSync(p));
  if (!nav) {
    console.error('No se encontró Edge ni Chrome. Indique la ruta con la variable NAVEGADOR.');
    process.exit(1);
  }
  return nav;
}

// ─── Recursos que se incrustan en cada certificado ───────────────
const plantilla = readFileSync(join(here, 'plantilla.html'), 'utf8');
const recursos = {
  fontCinzel: dataUri(join(site, 'assets/fonts/cinzel-600-latin.woff2'), 'font/woff2'),
  fontMontserrat: dataUri(join(site, 'assets/fonts/montserrat-latin.woff2'), 'font/woff2'),
  logoG: dataUri(join(here, 'assets/logo-g.png'), 'image/png'),
  logoWordmark: dataUri(join(here, 'assets/logo-wordmark.png'), 'image/png'),
};

const navegador = buscarNavegador();
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

for (const cert of registro) {
  if (!cert.folio) cert.folio = nuevoFolio();
  const { folio } = cert;
  const url = `${config.urlVerificacion}?folio=${folio}`;

  const qr = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#0B1F3A', light: '#FFFFFF' },
  });

  const valores = {
    ...recursos,
    qr,
    folio: escapar(folio),
    nombre: escapar(cert.nombre),
    programa: escapar(cert.programa),
    horas: escapar(cert.horas),
    ciudad: escapar(cert.ciudad),
    fecha: escapar(fechaLarga(cert.fecha)),
    firmaNombre: escapar(config.firmaNombre),
    firmaCargo: escapar(config.firmaCargo),
  };
  const html = plantilla.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in valores)) throw new Error(`Falta el valor "${k}" para la plantilla`);
    return valores[k];
  });

  const htmlPath = join(tmpDir, `${folio}.html`);
  writeFileSync(htmlPath, html);
  const htmlUrl = pathToFileURL(htmlPath).href;
  const perfil = join(tmpDir, 'perfil');
  const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${perfil}`, '--virtual-time-budget=3000'];

  execFileSync(navegador, [...base, '--no-pdf-header-footer', `--print-to-pdf=${join(outDir, `${folio}.pdf`)}`, htmlUrl], { stdio: 'ignore' });
  // 11 × 8.5 in a 96 px/in, al doble de densidad → 2112 × 1632 px
  execFileSync(navegador, [...base, '--window-size=1056,816', '--force-device-scale-factor=2', `--screenshot=${join(outDir, `${folio}.png`)}`, htmlUrl], { stdio: 'ignore' });

  // Datos públicos que muestra la página de verificación
  writeFileSync(join(outDir, `${folio}.json`), JSON.stringify({
    folio,
    nombre: cert.nombre,
    programa: cert.programa,
    horas: cert.horas,
    ciudad: cert.ciudad,
    fecha: fechaLarga(cert.fecha),
    estado: cert.estado || 'vigente',
    emisor: config.emisor,
    ejemplo: Boolean(cert.ejemplo),
  }, null, 2) + '\n');

  console.log(`✓ ${folio}  ${cert.nombre}  →  ${url}`);
}

writeFileSync(registroPath, JSON.stringify(registro, null, 2) + '\n');
rmSync(tmpDir, { recursive: true, force: true });
