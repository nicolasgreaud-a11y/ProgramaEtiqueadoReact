import { useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "../utils/geometry";

export default function ImageCanvas({
  image,
  tool,
  classes,
  selectedClass,
  annotations,
  onCreateBox,
  onCreateMask
}) {
  const imgRef = useRef(null);
  const [draftBox, setDraftBox] = useState(null);
  const [maskDraft, setMaskDraft] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const classById = useMemo(() => {
    return classes.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [classes]);

  useEffect(() => {
    setDraftBox(null);
    setMaskDraft([]);
    setIsDragging(false);
  }, [image?.id, tool]);

  useEffect(() => {
    function onKeyDown(event) {
      if (tool !== "mask") return;
      if (event.key === "Enter") {
        finalizeMask();
      }
      if (event.key === "Escape") {
        setMaskDraft([]);
      }
      if ((event.key === "Backspace" || event.key.toLowerCase() === "z") && maskDraft.length) {
        event.preventDefault();
        setMaskDraft((prev) => prev.slice(0, prev.length - 1));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool, maskDraft, selectedClass]);

  if (!image) {
    return (
      <main className="canvas-empty">
        <p>Carga imagenes para empezar a etiquetar.</p>
      </main>
    );
  }

  function toImageCoords(event) {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((event.clientX - rect.left) / rect.width) * image.width;
    const y = ((event.clientY - rect.top) / rect.height) * image.height;
    return {
      x: clamp(x, 0, image.width),
      y: clamp(y, 0, image.height)
    };
  }

  function handlePointerDown(event) {
    if (!selectedClass) return;
    const point = toImageCoords(event);
    if (!point) return;

    if (tool === "box") {
      setIsDragging(true);
      setDraftBox({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        classId: selectedClass.id
      });
      return;
    }

    if (tool === "mask") {
      setMaskDraft((prev) => [...prev, point]);
    }
  }

  function handlePointerMove(event) {
    if (tool !== "box" || !isDragging || !draftBox) return;
    const point = toImageCoords(event);
    if (!point) return;

    setDraftBox((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        width: point.x - prev.x,
        height: point.y - prev.y
      };
    });
  }

  function handlePointerUp() {
    if (tool !== "box" || !draftBox) return;
    setIsDragging(false);

    const clean = normalizeBoxDraft(draftBox);
    setDraftBox(null);

    if (!clean || !selectedClass) return;

    onCreateBox({
      ...clean,
      classId: selectedClass.id
    });
  }

  function finalizeMask() {
    if (tool !== "mask" || maskDraft.length < 3 || !selectedClass) return;

    onCreateMask({
      points: maskDraft,
      classId: selectedClass.id
    });
    setMaskDraft([]);
  }

  const draftPolyline = maskDraft.map((pt) => `${pt.x},${pt.y}`).join(" ");

  return (
    <main className="canvas-main">
      <div className="canvas-wrapper" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
        <img ref={imgRef} src={image.url} alt={image.name} className="canvas-image" draggable={false} />
        <svg
          className="canvas-overlay"
          viewBox={`0 0 ${image.width} ${image.height}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={finalizeMask}
        >
          {annotations.boxes.map((box) => {
            const classItem = classById[box.classId];
            return (
              <g key={box.id}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="transparent"
                  stroke={classItem?.color ?? "#ff0000"}
                  strokeWidth="2"
                />
                <text x={box.x + 4} y={Math.max(14, box.y - 4)} fill={classItem?.color ?? "#ff0000"} fontSize="14">
                  {classItem?.name ?? "clase"}
                </text>
              </g>
            );
          })}

          {annotations.masks.map((mask) => {
            const classItem = classById[mask.classId];
            return (
              <g key={mask.id}>
                <polygon
                  points={mask.points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
                  fill={`${classItem?.color ?? "#00ff00"}44`}
                  stroke={classItem?.color ?? "#00ff00"}
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {draftBox && (
            <rect
              x={normalizeBoxDraft(draftBox)?.x ?? draftBox.x}
              y={normalizeBoxDraft(draftBox)?.y ?? draftBox.y}
              width={normalizeBoxDraft(draftBox)?.width ?? 0}
              height={normalizeBoxDraft(draftBox)?.height ?? 0}
              fill="transparent"
              stroke={selectedClass?.color ?? "#ffffff"}
              strokeDasharray="4 3"
              strokeWidth="2"
            />
          )}

          {maskDraft.length > 0 && (
            <>
              <polyline points={draftPolyline} fill="none" stroke={selectedClass?.color ?? "#ffffff"} strokeWidth="2" />
              {maskDraft.map((pt, index) => (
                <circle key={index} cx={pt.x} cy={pt.y} r="3" fill={selectedClass?.color ?? "#ffffff"} />
              ))}
            </>
          )}
        </svg>
      </div>

      {tool === "mask" && (
        <div className="mask-actions">
          <button className="btn" type="button" onClick={() => setMaskDraft([])}>
            Cancelar mascara
          </button>
          <button className="btn primary" type="button" onClick={finalizeMask} disabled={maskDraft.length < 3}>
            Cerrar mascara
          </button>
        </div>
      )}
    </main>
  );
}

function normalizeBoxDraft(draft) {
  const x = Math.min(draft.x, draft.x + draft.width);
  const y = Math.min(draft.y, draft.y + draft.height);
  const width = Math.abs(draft.width);
  const height = Math.abs(draft.height);

  if (width < 3 || height < 3) {
    return null;
  }

  return { x, y, width, height };
}
