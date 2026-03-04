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
      .filter((file) => isImageFile(file))
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

  async function importDataset(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) {
      throw new Error("No se han recibido archivos para importar.");
    }

    const indexedFiles = files
      .map((file) => ({
        file,
        path: normalizePath(file.webkitRelativePath || file.name)
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const rootPrefix = detectDatasetRoot(indexedFiles.map((item) => item.path));
    const entriesByPath = new Map(indexedFiles.map((item) => [item.path, item.file]));

    const annotationsFile =
      entriesByPath.get(joinPath(rootPrefix, "annotations.json")) ||
      findFileBySuffix(indexedFiles, "/annotations.json");
    const detectionYamlFile =
      entriesByPath.get(joinPath(rootPrefix, "dataset-detection.yaml")) ||
      findFileBySuffix(indexedFiles, "/dataset-detection.yaml") ||
      findFileBySuffix(indexedFiles, "/dataset-segmentation.yaml") ||
      findFileBySuffix(indexedFiles, "/data.yaml");
    const configFile =
      entriesByPath.get(joinPath(rootPrefix, ".config")) ||
      findFileBySuffix(indexedFiles, "/.config");

    const annotationsMeta = annotationsFile ? safeParseJson(await annotationsFile.text()) : null;
    const summaryByOutputImage = new Map(
      (annotationsMeta?.summary ?? []).map((item) => [item.outputImage, item.image])
    );

    let classNames =
      annotationsMeta?.classes
        ?.map((item) => (typeof item === "string" ? item : item?.name))
        .filter(Boolean) ?? [];
    if (!classNames.length && detectionYamlFile) {
      const parsed = parseClassNamesFromYaml(await detectionYamlFile.text());
      classNames = parsed;
    }

    const datasetImages = indexedFiles.map((item) => parseDatasetImageEntry(item)).filter(Boolean);

    if (!datasetImages.length) {
      const sample = indexedFiles
        .slice(0, 6)
        .map((item) => item.path)
        .join(" | ");
      throw new Error(
        `No se encontraron imagenes importables. Selecciona la carpeta raiz del export. Muestra de rutas leidas: ${sample}`
      );
    }

    const parsedItems = [];
    let highestClassIndex = -1;

    for (const imgItem of datasetImages) {
      const imageUrl = URL.createObjectURL(imgItem.file);
      const dims = await readImageDimensions(imageUrl);
      URL.revokeObjectURL(imageUrl);

      const detectionContent = await getFirstExistingText(entriesByPath, [
        joinPath(rootPrefix, `labels/detection/${imgItem.split}/${imgItem.baseName}.txt`),
        joinPath(rootPrefix, `labels/detection/${imgItem.baseName}.txt`),
        joinPath(rootPrefix, `labels/${imgItem.split}/${imgItem.baseName}.txt`),
        joinPath(rootPrefix, `labels/${imgItem.baseName}.txt`)
      ]);
      const segmentationContent = await getFirstExistingText(entriesByPath, [
        joinPath(rootPrefix, `labels/segmentation/${imgItem.split}/${imgItem.baseName}.txt`),
        joinPath(rootPrefix, `labels/segmentation/${imgItem.baseName}.txt`)
      ]);

      const rawBoxes = parseDetectionLabels(detectionContent, dims.width, dims.height);
      const rawMasks = parseSegmentationLabels(segmentationContent, dims.width, dims.height);

      highestClassIndex = Math.max(
        highestClassIndex,
        ...rawBoxes.map((item) => item.classIndex),
        ...rawMasks.map((item) => item.classIndex)
      );

      parsedItems.push({
        imgItem,
        dims,
        rawBoxes,
        rawMasks
      });
    }

    while (classNames.length <= highestClassIndex) {
      classNames.push(`clase_${classNames.length}`);
    }
    if (!classNames.length) {
      classNames = ["objeto"];
    }

    const nextClasses = classNames.map((name, index) => ({
      id: createId("class"),
      name,
      color: getColorForIndex(index)
    }));
    const classIdByIndex = nextClasses.reduce((acc, item, index) => {
      acc[index] = item.id;
      return acc;
    }, {});

    revokeImageUrls(images);

    const nextImages = [];
    const nextAnnotationsByImage = {};

    for (const parsed of parsedItems) {
      const imageId = createId("img");
      const outputFileName = parsed.imgItem.fileName;
      const sourceName = summaryByOutputImage.get(outputFileName) ?? outputFileName;
      const persistentUrl = URL.createObjectURL(parsed.imgItem.file);

      nextImages.push({
        id: imageId,
        file: parsed.imgItem.file,
        url: persistentUrl,
        width: parsed.dims.width,
        height: parsed.dims.height,
        name: sourceName,
        outputName: outputFileName,
        split: parsed.imgItem.split
      });

      nextAnnotationsByImage[imageId] = {
        boxes: parsed.rawBoxes
          .map((item) => ({
            id: createId("box"),
            classId: classIdByIndex[item.classIndex] ?? nextClasses[0].id,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height
          }))
          .filter((item) => item.width >= 1 && item.height >= 1),
        masks: parsed.rawMasks
          .map((item) => ({
            id: createId("mask"),
            classId: classIdByIndex[item.classIndex] ?? nextClasses[0].id,
            points: item.points
          }))
          .filter((item) => item.points.length >= 3)
      };
    }

    const importedProjectName =
      annotationsMeta?.projectName ||
      extractRootFolderName(rootPrefix) ||
      projectName ||
      "dataset-yolo";

    const importedConfig = configFile ? safeParseJson(await configFile.text()) : null;

    const firstImageId = nextImages[0]?.id ?? null;
    let nextSelectedImageId = firstImageId;

    if (importedConfig?.currentImageName) {
      const byName = nextImages.find(
        (img) => img.name === importedConfig.currentImageName || img.outputName === importedConfig.currentImageName
      );
      if (byName) {
        nextSelectedImageId = byName.id;
      }
    } else if (importedConfig?.currentImageIndex) {
      const idx = Math.max(0, Number(importedConfig.currentImageIndex) - 1);
      nextSelectedImageId = nextImages[idx]?.id ?? firstImageId;
    }

    setProjectName(importedProjectName);
    setClasses(nextClasses);
    setSelectedClassId(nextClasses[0]?.id ?? null);
    setImages(nextImages);
    setSelectedImageId(nextSelectedImageId);
    setAnnotationsByImage(nextAnnotationsByImage);

    return {
      images: nextImages.length,
      classes: nextClasses.length,
      masks: Object.values(nextAnnotationsByImage).reduce((acc, item) => acc + item.masks.length, 0)
    };
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
    importDataset,
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

function isImageFile(file) {
  if (!file) {
    return false;
  }

  if (file.type && file.type.startsWith("image/")) {
    return true;
  }

  const name = (file.name || "").toLowerCase();
  return /\.(png|jpe?g|webp|bmp|gif|tiff?|heic|heif)$/i.test(name);
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function detectDatasetRoot(paths) {
  const matches = paths
    .map((path) => {
      const hit = path.match(/^(.*?)(?:images\/(?:train|val)\/|images\/)/i);
      return hit ? hit[1] : null;
    })
    .filter(Boolean);

  if (!matches.length) {
    return "";
  }

  return matches.sort((a, b) => a.length - b.length)[0];
}

function joinPath(prefix, relativePath) {
  if (!prefix) {
    return normalizePath(relativePath);
  }
  return normalizePath(`${prefix}${relativePath}`);
}

function findFileBySuffix(indexedFiles, suffix) {
  const normalizedSuffix = normalizePath(suffix).toLowerCase();
  const hit = indexedFiles.find((item) => item.path.toLowerCase().endsWith(normalizedSuffix));
  return hit?.file ?? null;
}

function parseDatasetImageEntry(item) {
  if (!isImageFile(item.file)) {
    return null;
  }

  const splitMatch = item.path.match(/(^|\/)images\/(train|val)\/([^/]+)$/i);
  if (splitMatch) {
    const split = splitMatch[2].toLowerCase();
    const fileName = splitMatch[3];
    const baseName = removeExtension(fileName);
    return {
      file: item.file,
      split,
      fileName,
      baseName,
      path: item.path
    };
  }

  const noSplitMatch = item.path.match(/(^|\/)images\/([^/]+)$/i);
  if (noSplitMatch) {
    const fileName = noSplitMatch[2];
    const baseName = removeExtension(fileName);
    return {
      file: item.file,
      split: "train",
      fileName,
      baseName,
      path: item.path
    };
  }

  return null;
}

async function getFirstExistingText(entriesByPath, candidates) {
  for (const path of candidates) {
    const file = entriesByPath.get(path);
    if (file) {
      return file.text();
    }
  }
  return "";
}

function parseDetectionLabels(content, imageWidth, imageHeight) {
  if (!content.trim()) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/).map((item) => Number(item));
      if (parts.length < 5 || parts.some((value) => Number.isNaN(value))) {
        return null;
      }

      const classIndex = Math.max(0, Math.floor(parts[0]));
      const cx = parts[1] * imageWidth;
      const cy = parts[2] * imageHeight;
      const width = parts[3] * imageWidth;
      const height = parts[4] * imageHeight;

      return {
        classIndex,
        x: clamp(cx - width / 2, 0, imageWidth),
        y: clamp(cy - height / 2, 0, imageHeight),
        width: clamp(width, 0, imageWidth),
        height: clamp(height, 0, imageHeight)
      };
    })
    .filter(Boolean);
}

function parseSegmentationLabels(content, imageWidth, imageHeight) {
  if (!content.trim()) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/).map((item) => Number(item));
      if (parts.length < 7 || parts.some((value) => Number.isNaN(value))) {
        return null;
      }

      const classIndex = Math.max(0, Math.floor(parts[0]));
      const coords = parts.slice(1);
      const points = [];
      for (let i = 0; i < coords.length - 1; i += 2) {
        points.push({
          x: clamp(coords[i] * imageWidth, 0, imageWidth),
          y: clamp(coords[i + 1] * imageHeight, 0, imageHeight)
        });
      }

      return points.length >= 3
        ? {
            classIndex,
            points
          }
        : null;
    })
    .filter(Boolean);
}

function parseClassNamesFromYaml(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const namesLineIndex = lines.findIndex((line) => line.startsWith("names:"));
  if (namesLineIndex < 0) {
    return [];
  }

  const inlineRaw = lines[namesLineIndex].slice("names:".length).trim();
  if (inlineRaw.startsWith("[") && inlineRaw.endsWith("]")) {
    return inlineRaw
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^['\"]|['\"]$/g, ""))
      .filter(Boolean);
  }

  const numericMap = [];
  for (let i = namesLineIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || /^[a-zA-Z_][\w-]*:/.test(line)) {
      break;
    }
    const match = line.match(/^(\d+)\s*:\s*(.+)$/);
    if (!match) {
      continue;
    }
    const index = Number(match[1]);
    const label = match[2].trim().replace(/^['\"]|['\"]$/g, "");
    numericMap[index] = label;
  }

  return numericMap.filter(Boolean);
}

function removeExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
}

function safeParseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function extractRootFolderName(rootPrefix) {
  if (!rootPrefix) {
    return "";
  }

  const clean = rootPrefix.replace(/\/$/, "");
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function revokeImageUrls(imageList) {
  imageList.forEach((img) => {
    if (img.url) {
      URL.revokeObjectURL(img.url);
    }
  });
}
