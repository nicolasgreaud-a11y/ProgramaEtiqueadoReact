# Programa de Etiquetado para IA (React)

Aplicacion React para crear datasets de entrenamiento con:
- Cajas (bounding boxes)
- Mascaras poligonales (segmentacion)
- Exportacion a `.zip` para pipelines YOLO

## Que exporta

Al exportar se genera:
- `images/train` y `images/val`
- `labels/detection/train` y `labels/detection/val` (formato YOLO deteccion)
- `labels/segmentation/train` y `labels/segmentation/val` (formato YOLO segmentacion)
- `dataset-detection.yaml`
- `dataset-segmentation.yaml`
- `annotations.json` (resumen del proyecto)
- `.config` (progreso: imagen actual y porcentaje analizado)

## Instalacion

```bash
npm install
npm run dev
```

## Modo escritorio (Electron)

Ejecutar app de escritorio en desarrollo:

```bash
npm run desktop:dev
```

Generar instaladores:

```bash
npm run desktop:build
```

Build por sistema operativo:

```bash
npm run desktop:build:mac
npm run desktop:build:win
npm run desktop:build:linux
```

Los instaladores se generan en la carpeta `release/`.
Por plataforma:
- macOS: `release/mac`
- Windows NSIS: `release/win`
- Windows MSI: `release/win-msi`
- Linux: `release/linux`

## Evitar alertas de antivirus en Windows (recomendado)

Para que salte mucho menos el antivirus/SmartScreen, distribuye instalador firmado.

### Opcion recomendada: build firmado en GitHub Actions (Windows)

Ya esta incluido el workflow:
- `.github/workflows/windows-signed-build.yml`

Configura estos secretos en GitHub (`Settings > Secrets and variables > Actions`):
- `CSC_LINK_B64`: certificado de firma (`.p12`/`.pfx`) en Base64.
- `CSC_KEY_PASSWORD`: password del certificado.

Comando para generar `CSC_LINK_B64` desde tu archivo local:

```bash
base64 -i certificado.p12 | pbcopy
```

Luego:
1. Sube el valor al secreto `CSC_LINK_B64`.
2. Lanza el workflow manualmente (`Actions > Windows Signed Build > Run workflow`) o crea tag `v1.0.0`.
3. Descarga el artefacto `windows-signed-installer` y comparte el `Setup.exe`.

Sin certificado de firma, los avisos de antivirus no se pueden evitar de forma consistente.

## Uso rapido

1. Carga imagenes o carpetas completas.
2. Crea tus clases (ej: grieta, buque, corrosion).
3. Selecciona una clase y herramienta:
   - `Caja`: click y arrastre.
   - `Mascara`: clics para puntos, luego `Cerrar mascara` o tecla `Enter`.
4. Exporta con `Exportar ZIP`.

## Estructura del proyecto

- `src/components`: UI modular (toolbar, canvas, sidebar)
- `src/hooks`: estado de dataset y anotaciones
- `src/services/exporters`: generacion de manifest YOLO + zip
- `src/utils`: utilidades de geometria, color y descarga
