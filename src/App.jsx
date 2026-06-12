import { useEffect, useState } from "react";
import ImageCanvas from "./components/ImageCanvas";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import { useDataset } from "./hooks/useDataset";
import { getImplementationById, IMPLEMENTATIONS } from "./services/implementations";

export default function App() {
  const dataset = useDataset();
  const [tool, setTool] = useState("box");
  const [implementationId, setImplementationId] = useState("local");
  const [exportMode, setExportMode] = useState("normal");
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [theme, setTheme] = useState(() => window.localStorage.getItem("theme") || "dark");
  const implementation = getImplementationById(implementationId);

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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  async function handleExport() {
    try {
      setIsExporting(true);
      setStatus("");
      const result = await implementation.exportDataset(dataset, { exportMode });
      setStatus(result?.message || "Operacion completada.");
    } catch (error) {
      setStatus(error?.message || "No se pudo exportar el dataset.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImportDataset(fileList) {
    try {
      const result = await implementation.importDataset(dataset, fileList);
      setStatus(
        result?.needsBaseFolder
          ? `Dataset NAS importado. Ahora carga la carpeta base ${result.baseFolderName ? `(${result.baseFolderName})` : ""} para volver a vincular las imagenes.`
          : `Dataset importado: ${result.images} imagenes, ${result.classes} clases, ${result.masks} mascaras recuperadas.`
      );
    } catch (error) {
      setStatus(error?.message || "No se pudo importar el dataset.");
    }
  }

  return (
    <div className="app-shell">
      <Toolbar
        theme={theme}
        setTheme={setTheme}
        projectName={dataset.projectName}
        setProjectName={dataset.setProjectName}
        selectedDirectoryPath={dataset.selectedDirectoryPath}
        nasBasePath={dataset.nasBasePath}
        setNasBasePath={dataset.setNasBasePath}
        tool={tool}
        setTool={setTool}
        exportMode={exportMode}
        setExportMode={setExportMode}
        implementationId={implementationId}
        implementationOptions={IMPLEMENTATIONS}
        onChangeImplementation={(nextId) => {
          setImplementationId(nextId);
          const next = getImplementationById(nextId);
          setStatus(`Implementacion activa: ${next.label}. ${next.description}`);
        }}
        onUploadImages={(fileList) =>
          implementation
            .uploadImages(dataset, fileList)
            .then((result) => {
              if (result?.message) {
                setStatus(result.message);
              }
            })
            .catch((error) => {
              setStatus(error?.message || "No se pudieron cargar imagenes.");
            })
        }
        onUploadSubfolder={(fileList) =>
          implementation
            .uploadSubfolder(dataset, fileList)
            .then((result) => {
              if (result?.message) {
                setStatus(result.message);
              }
            })
            .catch((error) => {
              setStatus(error?.message || "No se pudo cargar la carpeta seleccionada.");
            })
        }
        onUploadFolder={(fileList) =>
          implementation
            .uploadFolder(dataset, fileList)
            .then((result) => {
              if (result?.message) {
                setStatus(result.message);
              }
            })
            .catch((error) => {
              setStatus(error?.message || "No se pudo cargar la carpeta.");
            })
        }
        onImportDataset={handleImportDataset}
        onExport={handleExport}
        isExporting={isExporting}
        progress={dataset.progress}
      />

      <div className="workspace">
        <Sidebar
          nasBasePath={dataset.nasBasePath}
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
