import { useEffect, useState } from "react";
import ImageCanvas from "./components/ImageCanvas";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import { useDataset } from "./hooks/useDataset";
import { exportDatasetZip } from "./services/exporters/zipExporter";
import { triggerDownload } from "./utils/file";

export default function App() {
  const dataset = useDataset();
  const [tool, setTool] = useState("box");
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== "Tab" || dataset.images.length < 2) {
        return;
      }

      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable) {
        return;
      }

      event.preventDefault();
      const currentIndex = dataset.images.findIndex((img) => img.id === dataset.selectedImageId);
      if (currentIndex < 0) {
        dataset.setSelectedImageId(dataset.images[0].id);
        return;
      }

      const step = event.shiftKey ? -1 : 1;
      const nextIndex = (currentIndex + step + dataset.images.length) % dataset.images.length;
      dataset.setSelectedImageId(dataset.images[nextIndex].id);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dataset.images, dataset.selectedImageId, dataset.setSelectedImageId]);

  async function handleExport() {
    try {
      setIsExporting(true);
      setStatus("");

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
      setStatus("ZIP exportado correctamente.");
    } catch (error) {
      setStatus(error?.message || "No se pudo exportar el dataset.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImportDataset(fileList) {
    try {
      const result = await dataset.importDataset(fileList);
      setStatus(
        `Dataset importado: ${result.images} imagenes, ${result.classes} clases, ${result.masks} mascaras recuperadas.`
      );
    } catch (error) {
      setStatus(error?.message || "No se pudo importar el dataset.");
    }
  }

  return (
    <div className="app-shell">
      <Toolbar
        projectName={dataset.projectName}
        setProjectName={dataset.setProjectName}
        tool={tool}
        setTool={setTool}
        onUploadImages={dataset.addImages}
        onUploadFolder={dataset.addImages}
        onImportDataset={handleImportDataset}
        onExport={handleExport}
        isExporting={isExporting}
        progress={dataset.progress}
      />

      <div className="workspace">
        <Sidebar
          classes={dataset.classes}
          selectedClassId={dataset.selectedClassId}
          setSelectedClassId={dataset.setSelectedClassId}
          addClass={dataset.addClass}
          removeClass={dataset.removeClass}
          images={dataset.images}
          selectedImageId={dataset.selectedImageId}
          setSelectedImageId={dataset.setSelectedImageId}
          removeImage={dataset.removeImage}
          currentImageId={dataset.selectedImageId}
          selectedAnnotations={dataset.selectedAnnotations}
          deleteAnnotation={dataset.deleteAnnotation}
        />

        <ImageCanvas
          image={dataset.selectedImage}
          tool={tool}
          classes={dataset.classes}
          selectedClass={dataset.selectedClass}
          annotations={dataset.selectedAnnotations}
          onCreateBox={(box) => dataset.addBox(dataset.selectedImageId, { ...box, imageId: dataset.selectedImageId })}
          onCreateMask={(mask) => dataset.addMask(dataset.selectedImageId, { ...mask, imageId: dataset.selectedImageId })}
        />
      </div>

      <footer className="status-bar">
        {status ||
          `Progreso: ${dataset.progress.analyzed}/${dataset.progress.total} (${dataset.progress.percentage}%)`}
      </footer>
    </div>
  );
}
