import { exportDatasetZip } from "../exporters/zipExporter";
import { triggerDownload } from "../../utils/file";

export const localImplementation = {
  id: "local",
  label: "Local",
  description: "Implementacion actual en local",
  async uploadImages(dataset, fileList) {
    await dataset.addImages(fileList);
  },
  async uploadFolder(dataset, fileList) {
    await dataset.addImages(fileList);
  },
  async importDataset(dataset, fileList) {
    return dataset.importDataset(fileList);
  },
  async exportDataset(dataset) {
    const blob = await exportDatasetZip({
      projectName: dataset.projectName,
      images: dataset.images,
      classes: dataset.classes,
      annotationsByImage: dataset.annotationsByImage,
      classIndexById: dataset.classIndexById,
      selectedImageId: dataset.selectedImageId,
      progress: dataset.progress
    });

    triggerDownload(blob, `${dataset.projectName || "dataset-yolo"}.zip`);
    return { message: "ZIP exportado correctamente." };
  }
};
