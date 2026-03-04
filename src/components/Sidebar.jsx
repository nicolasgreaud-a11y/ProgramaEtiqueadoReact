import { useMemo, useState } from "react";

export default function Sidebar({
  classes,
  selectedClassId,
  setSelectedClassId,
  addClass,
  removeClass,
  images,
  selectedImageId,
  setSelectedImageId,
  removeImage,
  currentImageId,
  selectedAnnotations,
  deleteAnnotation
}) {
  const [newClassName, setNewClassName] = useState("");

  const classById = useMemo(() => {
    return classes.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [classes]);

  function handleAddClass(event) {
    event.preventDefault();
    addClass(newClassName);
    setNewClassName("");
  }

  return (
    <aside className="sidebar">
      <section className="panel">
        <h2>Clases</h2>
        <form className="row" onSubmit={handleAddClass}>
          <input
            className="input"
            value={newClassName}
            onChange={(event) => setNewClassName(event.target.value)}
            placeholder="Ej: grieta, buque, corrosion"
          />
          <button className="btn" type="submit">
            +
          </button>
        </form>
        <div className="list">
          {classes.map((item) => (
            <div key={item.id} className={selectedClassId === item.id ? "list-item active" : "list-item"}>
              <button type="button" className="class-btn" onClick={() => setSelectedClassId(item.id)}>
                <span className="dot" style={{ background: item.color }} />
                <span>{item.name}</span>
              </button>
              {classes.length > 1 && (
                <button className="btn btn-sm" type="button" onClick={() => removeClass(item.id)}>
                  x
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Imagenes</h2>
        <div className="list list-images">
          {images.map((img) => (
            <div key={img.id} className={selectedImageId === img.id ? "list-item active" : "list-item"}>
              <button type="button" className="class-btn" onClick={() => setSelectedImageId(img.id)}>
                <span>{img.name}</span>
              </button>
              <button className="btn btn-sm" type="button" onClick={() => removeImage(img.id)}>
                x
              </button>
            </div>
          ))}
          {!images.length && <p className="muted">No hay imagenes cargadas.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Anotaciones imagen</h2>
        <div className="list list-annotations">
          {selectedAnnotations.boxes.map((box) => (
            <div key={box.id} className="list-item">
              <span>
                Caja: {classById[box.classId]?.name ?? "clase"}
              </span>
              <button className="btn btn-sm" type="button" onClick={() => deleteAnnotation(currentImageId, box.id, "box")}>
                x
              </button>
            </div>
          ))}
          {selectedAnnotations.masks.map((mask) => (
            <div key={mask.id} className="list-item">
              <span>
                Mascara: {classById[mask.classId]?.name ?? "clase"}
              </span>
              <button className="btn btn-sm" type="button" onClick={() => deleteAnnotation(currentImageId, mask.id, "mask")}>
                x
              </button>
            </div>
          ))}
          {!selectedAnnotations.boxes.length && !selectedAnnotations.masks.length && (
            <p className="muted">Sin anotaciones.</p>
          )}
        </div>
      </section>
    </aside>
  );
}
