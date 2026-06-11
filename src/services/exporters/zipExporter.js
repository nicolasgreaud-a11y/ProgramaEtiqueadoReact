import JSZip from "jszip";
import { buildExportManifest } from "./yoloExporter";

export async function exportDatasetZip({
  projectName,
  images,
  classes,
  annotationsByImage,
  classIndexById,
  selectedImageId,
  progress,
  exportMode = "normal",
  nasBasePath = ""
}) {
  if (!images.length) {
    throw new Error("No hay imagenes cargadas.");
  }

  if (!classes.length) {
    throw new Error("Agrega al menos una clase antes de exportar.");
  }

  const safeProjectName = projectName.trim() || "dataset-yolo";
  const isNasExport = exportMode === "nas";

  if (isNasExport) {
    const imagesWithoutReference = images.filter(
      (image) => !isAbsoluteFilePath(image.sourcePath) && !(image.baseFolderName && image.relativePath)
    );
    if (imagesWithoutReference.length) {
      throw new Error(
        "No se puede exportar en modo NAS sin una carpeta base valida. Carga las imagenes desde una carpeta base de la NAS o desde el escritorio y exporta de nuevo."
      );
    }
  }

  const manifest = buildExportManifest({ images, classes, annotationsByImage, classIndexById });
  const zip = new JSZip();
  const root = zip.folder(safeProjectName);

  if (!root) {
    throw new Error("No se pudo inicializar el ZIP.");
  }

  root.file("dataset-detection.yaml", manifest.detectionYaml);
  root.file("dataset-segmentation.yaml", manifest.segmentationYaml);
  root.file(
    "README.txt",
    isNasExport
      ? [
          "Export NAS generado por Programa de Etiquetado IA",
          "",
          "Incluye:",
          "- labels/detection/train, labels/detection/val",
          "- labels/segmentation/train, labels/segmentation/val",
          "- annotations.json con clases y resumen",
          "- datos/imagenes.json con la relacion path -> nombre de imagen",
          "",
          "No incluye archivos de imagen dentro del ZIP."
        ].join("\n")
      : [
          "Export generado por Programa de Etiquetado IA",
          "",
          "Estructura:",
          "- images/train, images/val",
          "- labels/detection/train, labels/detection/val",
          "- labels/segmentation/train, labels/segmentation/val",
          "",
          "Compatible con pipelines YOLO de deteccion y segmentacion."
        ].join("\n")
  );

  const summary = [];
  const imageRefs = [];

  for (const item of manifest.items) {
    const sourcePath = buildNasReferencePath(item.image, nasBasePath);
    const sourceImageName = extractFileName(sourcePath);
    const labelStem = isNasExport ? buildNasLabelStem(sourcePath) : removeExtension(item.txtName);
    const labelFile = `${labelStem}.txt`;

    if (!isNasExport) {
      const imageBytes = await item.image.file.arrayBuffer();
      root.file(`images/${item.split}/${item.fileName}`, imageBytes);
    }
    root.file(`labels/detection/${item.split}/${labelFile}`, item.detectionLines.join("\n"));
    root.file(`labels/segmentation/${item.split}/${labelFile}`, item.segmentationLines.join("\n"));

    summary.push(
      isNasExport
        ? {
            sourcePath,
            sourceImageName,
            split: item.split,
            labelFile,
            boxes: item.annotation.boxes.length,
            masks: item.annotation.masks.length
          }
        : {
            image: item.image.name,
            sourcePath: item.image.name,
            split: item.split,
            outputImage: item.fileName,
            boxes: item.annotation.boxes.length,
            masks: item.annotation.masks.length
          }
    );

    if (isNasExport) {
      imageRefs.push({
        path: sourcePath,
        imageName: sourceImageName
      });
    }
  }

  root.file(
    "annotations.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectName: safeProjectName,
        exportMode,
        classes: classes.map((item, index) => ({ index, name: item.name, color: item.color })),
        summary
      },
      null,
      2
    )
  );

  const currentIndex = Math.max(
    0,
    images.findIndex((img) => img.id === selectedImageId)
  );
  const currentImage = images[currentIndex] ?? null;
  root.file(
    ".config",
    JSON.stringify(
      {
        projectName: safeProjectName,
        savedAt: new Date().toISOString(),
        exportMode,
        currentImageIndex: currentImage ? currentIndex + 1 : 0,
        currentImageName: currentImage?.name ?? null,
        progress: {
          analyzed: progress?.analyzed ?? 0,
          total: progress?.total ?? images.length,
          percentage: progress?.percentage ?? 0
        }
      },
      null,
      2
    )
  );

  if (isNasExport) {
    root.file(
      "datos/imagenes.json",
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          projectName: safeProjectName,
          baseFolderName: images.find((image) => image.baseFolderName)?.baseFolderName || "",
          exportMode,
          includesImages: false,
          items: imageRefs
        },
        null,
        2
      )
    );
  }

  return zip.generateAsync({ type: "blob" });
}

function extractFileName(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "imagen";
}

function removeExtension(fileName) {
  const dotIndex = String(fileName || "").lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
}

function buildNasLabelStem(sourcePath) {
  const normalized = String(sourcePath || "")
    .normalize("NFKD")
    .replaceAll("\\", "/")
    .toLowerCase();

  return (
    normalized
      .replace(/[^a-z0-9/_-]+/g, "_")
      .replace(/\//g, "__")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/^_+|_+$/g, "") || "imagen"
  );
}

function isAbsoluteFilePath(filePath) {
  const normalized = String(filePath || "").trim().replaceAll("\\", "/");
  return /^\/.+/.test(normalized) || /^[a-zA-Z]:\/.+/.test(normalized);
}

function buildNasReferencePath(image, nasBasePath) {
  const cleanBase = String(nasBasePath || "").trim().replaceAll("\\", "/").replace(/\/+$/, "");
  const cleanRelative = String(image?.relativePath || "").trim().replaceAll("\\", "/").replace(/^\/+/, "");

  if (cleanBase && cleanRelative) {
    return `${cleanBase}/${cleanRelative}`;
  }

  return image?.relativePath || image?.sourcePath || image?.name || "";
}
