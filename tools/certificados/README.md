# Certificados con QR de verificación

Cada certificado lleva un folio aleatorio (por ejemplo `GB-VTGC-SMYP`) y un código QR que abre
`/verificar?folio=...` en el sitio. Esa página confirma si el certificado es válido y muestra la
imagen y el PDF.

Esta carpeta **no se publica** en el sitio (está en `.vercelignore`).

## Requisitos

- Node.js 18 o superior
- Microsoft Edge o Google Chrome instalado (se usa para crear el PDF y la imagen)

La primera vez, instale las dependencias:

```
cd tools/certificados
npm install
```

## Emitir certificados

1. Agregue a los participantes en `registro.json` (sin folio, se asigna solo):

   ```json
   {
     "nombre": "Nombre Completo del Participante",
     "programa": "Auditor Interno ISO 9001:2015",
     "horas": 24,
     "ciudad": "Tijuana, Baja California",
     "fecha": "2026-10-30",
     "estado": "vigente"
   }
   ```

2. Ejecute:

   ```
   npm run generar
   ```

3. Se crean en `certificados/` del sitio tres archivos por folio:
   - `GB-XXXX-XXXX.pdf`: para imprimir o enviar al participante
   - `GB-XXXX-XXXX.png`: imagen que muestra la página de verificación
   - `GB-XXXX-XXXX.json`: datos que consulta la página de verificación

4. Haga commit y push para publicarlos.

## Revocar un certificado

Cambie `"estado": "vigente"` por `"estado": "revocado"` en `registro.json`, ejecute
`npm run generar` y publique. La página de verificación mostrará que el certificado ya no es válido.

## Configuración

`config.json` define la dirección de verificación que va dentro del QR y los datos de la firma.
Si el dominio del sitio cambia, actualice `urlVerificacion` y vuelva a generar todos los certificados.

## Diseño

El diseño está en `plantilla.html` (tamaño carta horizontal). Los valores entre `{{ }}` se
reemplazan con los datos de cada participante.
