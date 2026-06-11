import { useRef } from "react";

export default function Toolbar({
  projectName,
  setProjectName,
  nasBasePath,
  setNasBasePath,
  tool,
  setTool,
  exportMode,
  setExportMode,
  implementationId,
  implementationOptions,
  onChangeImplementation,
  onUploadImages,
  onUploadFolder,
  onImportDataset,
  onExport,
  isExporting,
  progress
}) {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const importInputRef = useRef(null);

  function handleFiles(event) {
    onUploadImages(event.target.files);
    event.target.value = "";
  }

  async function handleDesktopImagePick() {
    const paths = await window.desktopApp?.pickImageFiles?.();
    if (paths?.length) {
      onUploadImages(paths);
    }
  }

  async function handleDesktopFolderPick() {
    const paths = await window.desktopApp?.pickImageFolderFiles?.();
    if (paths?.length) {
      onUploadFolder(paths);
    }
  }

  async function handleDesktopImportPick() {
    const result = await window.desktopApp?.pickDatasetFolder?.();
    if (result) {
      onImportDataset(result);
    }
  }

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <label className="field-label" htmlFor="project-name">
          Proyecto
        </label>
        <input
          id="project-name"
          className="input"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="dataset-yolo"
        />
      </div>

      <div className="toolbar-group">
        <label className="field-label" htmlFor="nas-base-path">
          Base NAS
        </label>
        <input
          id="nas-base-path"
          className="input input-wide"
          value={nasBasePath}
          onChange={(event) => setNasBasePath(event.target.value)}
          placeholder="/Volumes/NAS/proyecto o \\nas\proyecto"
        />
      </div>

      <div className="toolbar-group">
        <span className="field-label">Herramienta</span>
        <div className="tool-switch">
          <button
            className={tool === "box" ? "btn active" : "btn"}
            onClick={() => setTool("box")}
            type="button"
          >
            Caja
          </button>
          <button
            className={tool === "mask" ? "btn active" : "btn"}
            onClick={() => setTool("mask")}
            type="button"
          >
            Mascara
          </button>
        </div>
      </div>

      <div className="toolbar-group">
        <span className="field-label">Exportacion</span>
        <div className="tool-switch">
          <button
            className={exportMode === "normal" ? "btn active" : "btn"}
            onClick={() => setExportMode("normal")}
            type="button"
          >
            Normal
          </button>
          <button
            className={exportMode === "nas" ? "btn active" : "btn"}
            onClick={() => setExportMode("nas")}
            type="button"
          >
            NAS
          </button>
        </div>
      </div>

      <div className="toolbar-group">
        <label className="field-label" htmlFor="implementation-select">
          Implementacion
        </label>
        <select
          id="implementation-select"
          className="input"
          value={implementationId}
          onChange={(event) => onChangeImplementation(event.target.value)}
        >
          {implementationOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar-group toolbar-right">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFiles}
          hidden
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          webkitdirectory=""
          directory=""
          accept="image/*"
          onChange={(event) => {
            onUploadFolder(event.target.files);
            event.target.value = "";
          }}
          hidden
        />
        <input
          ref={importInputRef}
          type="file"
          multiple
          webkitdirectory=""
          directory=""
          onChange={(event) => {
            onImportDataset(event.target.files);
            event.target.value = "";
          }}
          hidden
        />
        <button
          className="btn"
          type="button"
          onClick={() =>
            window.desktopApp?.isDesktop ? handleDesktopImagePick() : fileInputRef.current?.click()
          }
        >
          Cargar imagenes
        </button>
        <button
          className="btn"
          type="button"
          onClick={() =>
            window.desktopApp?.isDesktop ? handleDesktopFolderPick() : folderInputRef.current?.click()
          }
        >
          Cargar carpeta
        </button>
        <button
          className="btn"
          type="button"
          onClick={() =>
            window.desktopApp?.isDesktop ? handleDesktopImportPick() : importInputRef.current?.click()
          }
        >
          Importar dataset
        </button>
        <button className="btn primary" type="button" onClick={onExport} disabled={isExporting}>
          {isExporting ? "Exportando..." : "Exportar ZIP"}
        </button>
      </div>

      <div className="toolbar-group progress-group">
        <span className="field-label">
          Posicion: {progress.currentIndex}/{progress.total || 0}
        </span>
        <span className="field-label">
          Analizadas: {progress.analyzed}/{progress.total || 0} ({progress.percentage}%)
        </span>
      </div>
    </header>
  );
}
