'use strict';

// Dibuja el certificado (carta horizontal) en un <canvas> y genera su PDF.
// Reproduce el diseño de tools/certificados/plantilla.html.
window.GenbaCert = (function () {
  const W = 1056, H = 816;     // 11 × 8.5 in a 96 px/in
  const ESCALA = 2;            // 2112 × 1632 px (≈192 dpi)
  const NAVY = '#0B1F3A', PLATA = '#A7A9AC', GRIS = '#6B6D70', TEXTO = '#3F4A5A';
  const CIUDAD = 'Tijuana, Baja California';
  const FIRMANTE = { nombre: 'Ing. Roberto Silva', cargo: 'DIRECTOR' };

  const cargarImagen = src => new Promise((ok, falla) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falla(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });

  let recursos;
  async function cargarRecursos() {
    if (recursos) return recursos;
    await Promise.all([
      document.fonts.load('600 40px Cinzel'),
      document.fonts.load('400 13px Montserrat'),
      document.fonts.load('600 11px Montserrat'),
      document.fonts.load('700 22px Montserrat'),
    ]);
    const [logoG, wordmark] = await Promise.all([
      cargarImagen('/assets/logo-g.png'),
      cargarImagen('/assets/logo-wordmark.png'),
    ]);
    recursos = { logoG, wordmark };
    return recursos;
  }

  const fechaLarga = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d))
      .toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  };

  // Ancho de un texto con espaciado entre letras
  function anchoEspaciado(ctx, texto, esp) {
    const letras = [...texto];
    return letras.reduce((s, c) => s + ctx.measureText(c).width, 0) + esp * (letras.length - 1);
  }

  // Escribe un texto centrado en x con espaciado entre letras
  function textoEspaciado(ctx, texto, x, y, esp) {
    let cx = x - anchoEspaciado(ctx, texto, esp) / 2;
    ctx.textAlign = 'left';
    for (const c of texto) {
      ctx.fillText(c, cx, y);
      cx += ctx.measureText(c).width + esp;
    }
  }

  // Reduce el tamaño de letra hasta que el texto quepa en maxAncho
  function ajustar(ctx, texto, fuente, tamano, minimo, maxAncho, espEm = 0) {
    let t = tamano;
    for (; t > minimo; t--) {
      ctx.font = fuente(t);
      if (anchoEspaciado(ctx, texto, espEm * t) <= maxAncho) break;
    }
    ctx.font = fuente(t);
    return t;
  }

  // Divide un texto en renglones que quepan en maxAncho
  function renglones(ctx, texto, maxAncho) {
    const palabras = texto.split(' ');
    const lineas = [];
    let actual = '';
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (actual && ctx.measureText(prueba).width > maxAncho) { lineas.push(actual); actual = p; }
      else actual = prueba;
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  // QR con corrección de errores alta (H, 30 %): permite cubrir el centro con el
  // logotipo y que el código se siga leyendo.
  function dibujarQR(ctx, texto, x, y, lado, logo) {
    const qr = window.qrcode(0, 'H');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const celda = lado / n;
    ctx.fillStyle = NAVY;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(x + c * celda, y + r * celda, celda + 0.3, celda + 0.3);
      }
    }
    if (!logo) return;

    // Recuadro blanco al centro (≈24 % del lado) con el logotipo
    const caja = lado * 0.24;
    const bx = x + (lado - caja) / 2, by = y + (lado - caja) / 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(bx, by, caja, caja, caja * 0.18);
    ctx.fill();
    const alto = caja * 0.8, ancho = alto * logo.width / logo.height;
    ctx.drawImage(logo, bx + (caja - ancho) / 2, by + (caja - alto) / 2, ancho, alto);
  }

  // cert: { folio, nombre, curso, fecha }   urlVerificacion: dirección del QR
  // firma: imagen de la firma (la entrega el servidor solo con sesión) o null
  async function dibujar(cert, urlVerificacion, firma) {
    const { logoG, wordmark } = await cargarRecursos();
    const canvas = document.createElement('canvas');
    canvas.width = W * ESCALA;
    canvas.height = H * ESCALA;
    const ctx = canvas.getContext('2d');
    ctx.scale(ESCALA, ESCALA);
    ctx.textBaseline = 'alphabetic';

    // Fondo y marco
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 3;
    ctx.strokeRect(28.5, 28.5, W - 57, H - 57);
    ctx.strokeStyle = PLATA;
    ctx.lineWidth = 1;
    ctx.strokeRect(37.5, 37.5, W - 75, H - 75);

    // Marca de agua
    ctx.globalAlpha = 0.045;
    const wmAlto = 424, wmAncho = wmAlto * logoG.width / logoG.height;
    ctx.drawImage(logoG, W - 86 - wmAncho, (H - wmAlto) / 2, wmAncho, wmAlto);
    ctx.globalAlpha = 1;

    // Esquinas diagonales
    const esquina = (pts, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
    };
    esquina([[0, 0], [170, 0], [0, 170]], NAVY);
    esquina([[180, 0], [184, 0], [0, 184], [0, 180]], PLATA);
    esquina([[W, H], [W - 170, H], [W, H - 170]], NAVY);
    esquina([[W - 180, H], [W - 184, H], [W, H - 184], [W, H - 180]], PLATA);

    const cx = W / 2;

    // Logotipo y lema debajo
    const gAlto = 88, gAncho = gAlto * logoG.width / logoG.height;
    ctx.drawImage(logoG, (W - gAncho) / 2, 40, gAncho, gAlto);
    const wmkAlto = 46, wmkAncho = wmkAlto * wordmark.width / wordmark.height;
    ctx.drawImage(wordmark, (W - wmkAncho) / 2, 134, wmkAncho, wmkAlto);
    ctx.fillStyle = GRIS;
    ctx.font = '600 10px Cinzel';
    textoEspaciado(ctx, 'Excelencia Operacional. Integridad. Desarrollo.', cx, 202, 1.1);

    // Título
    ctx.fillStyle = NAVY;
    ctx.font = '600 40px Cinzel';
    textoEspaciado(ctx, 'CERTIFICADO', cx, 280, 40 * 0.22);
    ctx.font = '600 15px Cinzel';
    textoEspaciado(ctx, 'DE CUMPLIMIENTO', cx, 308, 15 * 0.3);

    ctx.fillStyle = GRIS;
    ctx.font = '600 11px Montserrat';
    textoEspaciado(ctx, 'SE OTORGA EL PRESENTE A', cx, 350, 11 * 0.32);

    // Nombre (se reduce si es muy largo)
    ctx.fillStyle = NAVY;
    const tNombre = ajustar(ctx, cert.nombre, t => `600 ${t}px Cinzel`, 34, 20, 820, 0.04);
    textoEspaciado(ctx, cert.nombre, cx, 404, tNombre * 0.04);
    const anchoLinea = Math.max(614, anchoEspaciado(ctx, cert.nombre, tNombre * 0.04) + 77);
    ctx.strokeStyle = PLATA;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - anchoLinea / 2, 421);
    ctx.lineTo(cx + anchoLinea / 2, 421);
    ctx.stroke();

    ctx.fillStyle = TEXTO;
    ctx.font = '400 13px Montserrat';
    ctx.textAlign = 'center';
    ctx.fillText('por haber acreditado satisfactoriamente el curso', cx, 454);

    // Curso (se reduce y, si hace falta, ocupa dos renglones)
    ctx.fillStyle = NAVY;
    let tCurso = ajustar(ctx, cert.curso, t => `700 ${t}px Montserrat`, 22, 16, 820);
    let lineasCurso = renglones(ctx, cert.curso, 820);
    if (lineasCurso.length > 2) { tCurso = 14; ctx.font = '700 14px Montserrat'; lineasCurso = renglones(ctx, cert.curso, 820).slice(0, 2); }
    ctx.textAlign = 'center';
    lineasCurso.forEach((l, i) => ctx.fillText(l, cx, 490 + i * (tCurso + 6)));
    const extra = (lineasCurso.length - 1) * (tCurso + 6);

    ctx.fillStyle = TEXTO;
    ctx.font = '400 12.5px Montserrat';
    ctx.fillText(`${CIUDAD}, a ${fechaLarga(cert.fecha)}`, cx, 518 + extra);

    // Firma, al centro debajo de la fecha
    const lineaFirma = 646 + extra;
    if (firma) {
      const fAlto = 86, fAncho = fAlto * firma.width / firma.height;
      // El trazo cruza ligeramente la línea, sin tocar el nombre
      ctx.drawImage(firma, cx - fAncho / 2, lineaFirma - fAlto + 6, fAncho, fAlto);
    }
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 125, lineaFirma);
    ctx.lineTo(cx + 125, lineaFirma);
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.font = '700 13px Montserrat';
    ctx.textAlign = 'center';
    ctx.fillText(FIRMANTE.nombre, cx, lineaFirma + 20);
    ctx.fillStyle = GRIS;
    ctx.font = '400 10.5px Montserrat';
    textoEspaciado(ctx, FIRMANTE.cargo, cx, lineaFirma + 38, 10.5 * 0.2);

    // Código QR con el logotipo al centro, y el folio debajo
    // Ubicado fuera de la franja diagonal de la esquina inferior derecha
    const qrLado = 132, qrX = 900 - qrLado, qrY = 596;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qrX, qrY, qrLado, qrLado);
    dibujarQR(ctx, urlVerificacion, qrX + 5, qrY + 5, qrLado - 10, logoG);
    ctx.fillStyle = GRIS;
    ctx.font = '600 9px Montserrat';
    textoEspaciado(ctx, `FOLIO: ${cert.folio}`, qrX + qrLado / 2, qrY + qrLado + 16, 9 * 0.15);

    return canvas;
  }

  // PDF de una página (carta horizontal) que contiene la imagen JPEG del certificado
  function pdfDesdeJpeg(jpeg, anchoPx, altoPx, titulo) {
    const enc = new TextEncoder();
    const partes = [];
    const offsets = [];
    let largo = 0;
    const agregar = d => { const b = typeof d === 'string' ? enc.encode(d) : d; partes.push(b); largo += b.length; };
    const objeto = (n, cuerpo, flujo) => {
      offsets[n] = largo;
      agregar(`${n} 0 obj\n${cuerpo}\n`);
      if (flujo) { agregar('stream\n'); agregar(flujo); agregar('\nendstream\n'); }
      agregar('endobj\n');
    };
    const tituloPdf = titulo.replace(/[\\()]/g, '').replace(/[^\x20-\x7E]/g, '');
    const contenido = enc.encode('q 792 0 0 612 0 0 cm /Im0 Do Q');

    agregar('%PDF-1.4\n');
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objeto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objeto(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    objeto(4, `<< /Type /XObject /Subtype /Image /Width ${anchoPx} /Height ${altoPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
    objeto(5, `<< /Length ${contenido.length} >>`, contenido);
    objeto(6, `<< /Title (${tituloPdf}) /Producer (GENBA Institution) >>`);

    const inicioXref = largo;
    agregar(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
    agregar(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
    return new Blob(partes, { type: 'application/pdf' });
  }

  function descargar(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Convierte un data URL JPEG en bytes
  const bytesDeDataUrl = dataUrl => Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));

  async function descargarPdf(jpegBytes, folio, nombre) {
    descargar(pdfDesdeJpeg(jpegBytes, W * ESCALA, H * ESCALA, `Certificado ${folio}`),
      `Certificado ${folio} - ${nombre}.pdf`.replace(/[\\/:*?"<>|]/g, ''));
  }

  return { dibujar, descargarPdf, bytesDeDataUrl, fechaLarga };
})();
