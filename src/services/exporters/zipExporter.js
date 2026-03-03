import JSZip from "jszip";
import { buildExportManifest } from "./yoloExporter";

export async function exportDatasetZip({
  projectName,
  images,
  classes,
  annotationsByImage,
  classIndexById,
  selectedImageId,
  progress
}) {
  if (!images.length) {
    throw new Error("No hay imagenes cargadas.");
  }

  if (!classes.length) {
    throw new Error("Agrega al menos una clase antes de exportar.");
  }

  const safeProjectName = projectName.trim() || "dataset-yolo";
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
    [
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

  for (const item of manifest.items) {
    const imageBytes = await item.image.file.arrayBuffer();
    root.file(`images/${item.split}/${item.fileName}`, imageBytes);
    root.file(`labels/detection/${item.split}/${item.txtName}`, item.detectionLines.join("\n"));
    root.file(`labels/segmentation/${item.split}/${item.txtName}`, item.segmentationLines.join("\n"));

    summary.push({
      image: item.image.name,
      split: item.split,
      outputImage: item.fileName,
      boxes: item.annotation.boxes.length,
      masks: item.annotation.masks.length
    });
  }

  root.file(
    "annotations.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        projectName: safeProjectName,
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

  return zip.generateAsync({ type: "blob" });
}
