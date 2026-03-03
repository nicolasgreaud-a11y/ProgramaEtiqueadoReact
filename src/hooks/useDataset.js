import { useMemo, useState } from "react";
import { getColorForIndex } from "../utils/colors";

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useDataset() {
  const initialClass = { id: createId("class"), name: "objeto", color: getColorForIndex(0) };
  const [projectName, setProjectName] = useState("dataset-yolo");
  const [classes, setClasses] = useState([initialClass]);
  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState(initialClass.id);
  const [annotationsByImage, setAnnotationsByImage] = useState({});

  const selectedImage = useMemo(
    () => images.find((img) => img.id === selectedImageId) ?? null,
    [images, selectedImageId]
  );

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) ?? classes[0] ?? null,
    [classes, selectedClassId]
  );

  const progress = useMemo(() => {
    const total = images.length;
    if (!total) {
      return {
        currentIndex: 0,
        total: 0,
        analyzed: 0,
        percentage: 0
      };
    }

    const analyzed = images.reduce((acc, image) => {
      const ann = annotationsByImage[image.id] ?? { boxes: [], masks: [] };
      return hasImageAnnotations(ann) ? acc + 1 : acc;
    }, 0);
    const currentIndex = Math.max(
      0,
      images.findIndex((img) => img.id === selectedImageId)
    );

    return {
      currentIndex: currentIndex + 1,
      total,
      analyzed,
      percentage: Math.round((analyzed / total) * 100)
    };
  }, [images, annotationsByImage, selectedImageId]);

  function addClass(name) {
    const cleanName = name.trim();
    if (!cleanName) {
      return;
    }

    const id = createId("class");
    const color = getColorForIndex(classes.length);
    const nextClass = { id, name: cleanName, color };

    setClasses((prev) => [...prev, nextClass]);
    setSelectedClassId(id);
  }

  function removeClass(classId) {
    let nextSelectedClassId = null;
    setClasses((prev) => {
      const next = prev.filter((item) => item.id !== classId);
      nextSelectedClassId = next[0]?.id ?? null;
      return next;
    });

    setAnnotationsByImage((prev) => {
      const next = {};
      for (const [imageId, annotations] of Object.entries(prev)) {
        next[imageId] = {
          boxes: annotations.boxes.filter((item) => item.classId !== classId),
          masks: annotations.masks.filter((item) => item.classId !== classId)
        };
      }
      return next;
    });

    if (selectedClassId === classId) {
      setSelectedClassId(nextSelectedClassId);
    }
  }

  async function addImages(fileList) {
    const files = Array.from(fileList ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .sort((a, b) => {
        const aPath = a.webkitRelativePath || a.name;
        const bPath = b.webkitRelativePath || b.name;
        return aPath.localeCompare(bPath);
      });
    if (!files.length) {
      return;
    }

    const existingKeys = new Set(images.map((img) => getFileKey(img.file)));
    const uniqueFiles = files.filter((file) => !existingKeys.has(getFileKey(file)));
    if (!uniqueFiles.length) {
      return;
    }

    const nextImages = await Promise.all(
      uniqueFiles.map(async (file) => {
        const url = URL.createObjectURL(file);
        const dims = await readImageDimensions(url);
        return {
          id: createId("img"),
          file,
          url,
          width: dims.width,
          height: dims.height,
          name: file.webkitRelativePath || file.name
        };
      })
    );

    setImages((prev) => {
      const updated = [...prev, ...nextImages];
      if (!selectedImageId && updated[0]) {
        setSelectedImageId(updated[0].id);
      }
      return updated;
    });

    setAnnotationsByImage((prev) => {
      const next = { ...prev };
      nextImages.forEach((img) => {
        next[img.id] = { boxes: [], masks: [] };
      });
      return next;
    });
  }

  function removeImage(imageId) {
    setImages((prev) => {
      const current = prev.find((img) => img.id === imageId);
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      const next = prev.filter((img) => img.id !== imageId);
      if (selectedImageId === imageId) {
        setSelectedImageId(next[0]?.id ?? null);
      }
      return next;
    });

    setAnnotationsByImage((prev) => {
      const next = { ...prev };
      delete next[imageId];
      return next;
    });
  }

  function addBox(imageId, box) {
    if (!imageId) return;
    setAnnotationsByImage((prev) => {
      const current = prev[imageId] ?? { boxes: [], masks: [] };
      return {
        ...prev,
        [imageId]: {
          ...current,
          boxes: [...current.boxes, { ...box, id: createId("box") }]
        }
      };
    });
  }

  function addMask(imageId, mask) {
    if (!imageId) return;
    setAnnotationsByImage((prev) => {
      const current = prev[imageId] ?? { boxes: [], masks: [] };
      const maskId = createId("mask");
      const nextMask = { ...mask, id: maskId };
      const autoBox = createBoxFromPoints(mask.points);
      const nextBoxes = autoBox
        ? [...current.boxes, { ...autoBox, classId: mask.classId, id: createId("box"), sourceMaskId: maskId }]
        : current.boxes;

      return {
        ...prev,
        [imageId]: {
          boxes: nextBoxes,
          masks: [...current.masks, nextMask]
        }
      };
    });
  }

  function deleteAnnotation(imageId, annotationId, type) {
    setAnnotationsByImage((prev) => {
      const current = prev[imageId] ?? { boxes: [], masks: [] };
      return {
        ...prev,
        [imageId]: {
          boxes:
            type === "box"
              ? current.boxes.filter((item) => item.id !== annotationId)
              : current.boxes.filter((item) => item.sourceMaskId !== annotationId),
          masks: type === "mask" ? current.masks.filter((item) => item.id !== annotationId) : current.masks
        }
      };
    });
  }

  const selectedAnnotations = selectedImageId
    ? annotationsByImage[selectedImageId] ?? { boxes: [], masks: [] }
    : { boxes: [], masks: [] };

  const classIndexById = useMemo(() => {
    return classes.reduce((acc, item, index) => {
      acc[item.id] = index;
      return acc;
    }, {});
  }, [classes]);

  return {
    projectName,
    setProjectName,
    classes,
    selectedClass,
    selectedClassId: selectedClass?.id ?? null,
    setSelectedClassId,
    addClass,
    removeClass,
    images,
    selectedImage,
    selectedImageId,
    setSelectedImageId,
    addImages,
    removeImage,
    annotationsByImage,
    selectedAnnotations,
    addBox,
    addMask,
    deleteAnnotation,
    classIndexById,
    progress
  };
}

function readImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = url;
  });
}

function createBoxFromPoints(points) {
  if (!points || points.length < 3) {
    return null;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  if (width < 3 || height < 3) {
    return null;
  }

  return { x: minX, y: minY, width, height };
}

function hasImageAnnotations(annotation) {
  return annotation.boxes.length > 0 || annotation.masks.length > 0;
}

function getFileKey(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}
