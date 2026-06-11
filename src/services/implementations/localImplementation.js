import { exportDatasetZip } from "../exporters/zipExporter";
import { triggerDownload } from "../../utils/file";

export const localImplementation = {
  id: "local",
  label: "Local",
  description: "Implementacion actual en local",
  async uploadImages(dataset, fileList) {
    if (window.desktopApp?.isDesktop && Array.isArray(fileList)) {
      await dataset.addImagePaths(fileList);
      return;
    }
    await dataset.addImages(fileList);
  },
  async uploadFolder(dataset, fileList) {
    if (window.desktopApp?.isDesktop && Array.isArray(fileList)) {
      await dataset.addImagePaths(fileList);
      return;
    }
    if (dataset.hasPendingNasImport) {
      return dataset.linkNasBaseFolder(fileList);
    }
    await dataset.addImages(fileList);
  },
  async importDataset(dataset, fileList) {
    if (window.desktopApp?.isDesktop && fileList && !Array.isArray(fileList) && fileList.files) {
      const files = [];
      for (const fileInfo of fileList.files) {
        const bytes = await window.desktopApp.readFileFromPath(fileInfo.path);
        const file = new File([bytes], fileInfo.name, { type: getMimeTypeFromName(fileInfo.name) });
        Object.defineProperty(file, "webkitRelativePath", {
          value: fileInfo.relativePath,
          writable: false,
          configurable: true
        });
        files.push(file);
      }
      return dataset.importDataset(files);
    }
    return dataset.importDataset(fileList);
  },
  async exportDataset(dataset, options = {}) {
    const blob = await exportDatasetZip({
      projectName: dataset.projectName,
      images: dataset.images,
      classes: dataset.classes,
      annotationsByImage: dataset.annotationsByImage,
      classIndexById: dataset.classIndexById,
      selectedImageId: dataset.selectedImageId,
      progress: dataset.progress,
      exportMode: options.exportMode,
      nasBasePath: dataset.nasBasePath
    });

    const fileName = `${dataset.projectName || "dataset-yolo"}.zip`;

    if (window.desktopApp?.isDesktop && window.desktopApp?.saveExportZip) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const result = await window.desktopApp.saveExportZip({
        suggestedName: fileName,
        bytes: Array.from(bytes)
      });

      if (result?.canceled) {
        return { message: "Exportacion cancelada." };
      }

      return {
        message:
          options.exportMode === "nas"
            ? `ZIP NAS exportado correctamente en ${result?.filePath || "el archivo seleccionado"}.`
            : `ZIP exportado correctamente en ${result?.filePath || "el archivo seleccionado"}.`
      };
    }

    triggerDownload(blob, fileName);
    return {
      message:
        options.exportMode === "nas"
          ? "ZIP NAS exportado correctamente sin incluir imagenes."
          : "ZIP exportado correctamente."
    };
  }
};

function getMimeTypeFromName(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "application/octet-stream";
}
