import { useRef } from "react";

export default function Toolbar({
  projectName,
  setProjectName,
  tool,
  setTool,
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
        <button className="btn" type="button" onClick={() => fileInputRef.current?.click()}>
          Cargar imagenes
        </button>
        <button className="btn" type="button" onClick={() => folderInputRef.current?.click()}>
          Cargar carpeta
        </button>
        <button className="btn" type="button" onClick={() => importInputRef.current?.click()}>
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
