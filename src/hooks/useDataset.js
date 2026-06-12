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
  const [nasBasePath, setNasBasePath] = useState("");
  const [nasBaseFolderName, setNasBaseFolderName] = useState("");
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
  const [pendingNasImport, setPendingNasImport] = useState(null);

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
    setPendingNasImport(null);
    setSelectedDirectoryPath("");
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
        const sourcePath = getSourcePath(file);
        const relativeInfo = getRelativePathInfo(file);
        return {
          id: createId("img"),
          file,
          url,
          width: dims.width,
          height: dims.height,
          name: file.webkitRelativePath || file.name,
          sourcePath,
          relativePath: relativeInfo.relativePath,
          baseFolderName: relativeInfo.baseFolderName
        };
      })
    );

    const folderBaseName = nextImages.find((img) => img.baseFolderName)?.baseFolderName || "";
    if (folderBaseName) {
      setNasBaseFolderName(folderBaseName);
    }

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

  async function addImagePaths(filePaths) {
    setPendingNasImport(null);
    setSelectedDirectoryPath("");
    const paths = Array.from(filePaths ?? [])
      .map((item) => normalizeCandidatePath(item))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    if (!paths.length) {
      return;
    }

    const existingPaths = new Set(images.map((img) => img.sourcePath).filter(Boolean));
    const uniquePaths = paths.filter((filePath) => !existingPaths.has(filePath));
    if (!uniquePaths.length) {
      return;
    }

    const nextImages = await Promise.all(
      uniquePaths.map(async (filePath) => {
        const bytes = await window.desktopApp.readFileFromPath(filePath);
        const fileName = extractFileNameFromPath(filePath);
        const file = new File([bytes], fileName, { type: getMimeTypeFromName(fileName) });
        const url = URL.createObjectURL(file);
        const dims = await readImageDimensions(url);

        return {
          id: createId("img"),
          file,
          url,
          width: dims.width,
          height: dims.height,
          name: fileName,
          sourcePath: filePath,
          relativePath: "",
          baseFolderName: ""
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

  async function addImageDirectory(directorySelection) {
    setPendingNasImport(null);
    const directoryPath = normalizeCandidatePath(directorySelection?.directoryPath);
    const fileEntries = Array.from(directorySelection?.files ?? [])
      .filter((entry) => isImagePathOrEntry(entry))
      .sort((a, b) => String(a.relativePath || "").localeCompare(String(b.relativePath || "")));

    if (!directoryPath || !fileEntries.length) {
      return;
    }

    const existingPaths = new Set(images.map((img) => img.sourcePath).filter(Boolean));
    const uniqueEntries = fileEntries.filter((entry) => !existingPaths.has(normalizeCandidatePath(entry.path)));
    if (!uniqueEntries.length) {
      setSelectedDirectoryPath(directoryPath);
      return;
    }

    const baseFolderName = extractFileNameFromPath(directoryPath);
    const nextImages = await Promise.all(
      uniqueEntries.map(async (entry) => {
        const sourcePath = normalizeCandidatePath(entry.path);
        const relativePath = normalizePath(entry.relativePath || entry.name || extractFileNameFromPath(sourcePath));
        const file = await createFileFromDesktopEntry(sourcePath, entry.name || extractFileNameFromPath(sourcePath));
        const url = URL.createObjectURL(file);
        const dims = await readImageDimensions(url);

        return {
          id: createId("img"),
          file,
          url,
          width: dims.width,
          height: dims.height,
          name: relativePath,
          sourcePath,
          relativePath,
          baseFolderName
        };
      })
    );

    setSelectedDirectoryPath(directoryPath);
    setNasBaseFolderName(baseFolderName);
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
    const nasImagesFile =
      entriesByPath.get(joinPath(rootPrefix, "datos/imagenes.json")) ||
      findFileBySuffix(indexedFiles, "/datos/imagenes.json");

    const annotationsMeta = annotationsFile ? safeParseJson(await annotationsFile.text()) : null;
    const nasImagesMeta = nasImagesFile ? safeParseJson(await nasImagesFile.text()) : null;
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
    const nasReferencedImages = normalizeNasReferencedImages(nasImagesMeta);

    if (!datasetImages.length && !nasReferencedImages.length) {
      const sample = indexedFiles
        .slice(0, 6)
        .map((item) => item.path)
        .join(" | ");
      throw new Error(
        `No se encontraron imagenes importables. Selecciona la carpeta raiz del export. Muestra de rutas leidas: ${sample}`
      );
    }

    const canAutoOpenNasReferences =
      Boolean(window.desktopApp?.readFileFromPath) &&
      nasReferencedImages.length > 0 &&
      nasReferencedImages.every((item) => isAbsoluteFilePath(item.sourcePath));

    if (!datasetImages.length && nasReferencedImages.length && !canAutoOpenNasReferences) {
      const importedProjectName =
        annotationsMeta?.projectName ||
        extractRootFolderName(rootPrefix) ||
        projectName ||
        "dataset-yolo";

      const nextClasses = buildImportedClasses(classNames);
      const pendingItems = [];
      const baseFolderName = nasImagesMeta?.baseFolderName || "";

      for (const ref of nasReferencedImages) {
        const storedReferencePath = ref.relativePath || ref.sourcePath;
        const relativePath = buildPortableRelativePath(ref, baseFolderName);
        const labelBaseName = buildNasLabelStem(storedReferencePath);
        const split = detectNasSplit(entriesByPath, rootPrefix, labelBaseName);
        const detectionContent = await getFirstExistingText(entriesByPath, [
          joinPath(rootPrefix, `labels/detection/${split}/${labelBaseName}.txt`),
          joinPath(rootPrefix, `labels/detection/${labelBaseName}.txt`),
          joinPath(rootPrefix, `labels/${split}/${labelBaseName}.txt`),
          joinPath(rootPrefix, `labels/${labelBaseName}.txt`)
        ]);
        const segmentationContent = await getFirstExistingText(entriesByPath, [
          joinPath(rootPrefix, `labels/segmentation/${split}/${labelBaseName}.txt`),
          joinPath(rootPrefix, `labels/segmentation/${labelBaseName}.txt`)
        ]);

        pendingItems.push({
          relativePath: normalizePath(relativePath),
          imageName: ref.sourceImageName || extractFileNameFromPath(storedReferencePath),
          split,
          detectionContent,
          segmentationContent
        });
      }

      revokeImageUrls(images);
      setProjectName(importedProjectName);
      setClasses(nextClasses);
      setSelectedClassId(nextClasses[0]?.id ?? null);
      setImages([]);
      setSelectedImageId(null);
      setAnnotationsByImage({});
      setNasBaseFolderName(nasImagesMeta?.baseFolderName || "");
      setSelectedDirectoryPath("");
      setPendingNasImport({
        projectName: importedProjectName,
        classes: nextClasses,
        items: pendingItems
      });

      return {
        images: pendingItems.length,
        classes: nextClasses.length,
        masks: 0,
        needsBaseFolder: true,
        baseFolderName: nasImagesMeta?.baseFolderName || ""
      };
    }

    const parsedItems = [];
    let highestClassIndex = -1;

    const importItems = datasetImages.length
      ? await buildEmbeddedImportItems(datasetImages, entriesByPath, rootPrefix)
      : await buildNasImportItems(nasReferencedImages, entriesByPath, rootPrefix);

    for (const importItem of importItems) {
      const detectionContent = await getFirstExistingText(entriesByPath, [
        joinPath(rootPrefix, `labels/detection/${importItem.split}/${importItem.baseName}.txt`),
        joinPath(rootPrefix, `labels/detection/${importItem.baseName}.txt`),
        joinPath(rootPrefix, `labels/${importItem.split}/${importItem.baseName}.txt`),
        joinPath(rootPrefix, `labels/${importItem.baseName}.txt`)
      ]);
      const segmentationContent = await getFirstExistingText(entriesByPath, [
        joinPath(rootPrefix, `labels/segmentation/${importItem.split}/${importItem.baseName}.txt`),
        joinPath(rootPrefix, `labels/segmentation/${importItem.baseName}.txt`)
      ]);

      const rawBoxes = parseDetectionLabels(detectionContent, importItem.dims.width, importItem.dims.height);
      const rawMasks = parseSegmentationLabels(segmentationContent, importItem.dims.width, importItem.dims.height);

      highestClassIndex = Math.max(
        highestClassIndex,
        ...rawBoxes.map((item) => item.classIndex),
        ...rawMasks.map((item) => item.classIndex)
      );

      parsedItems.push({
        imgItem: importItem,
        dims: importItem.dims,
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
        sourcePath: parsed.imgItem.sourcePath || "",
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
    setSelectedDirectoryPath("");
    setPendingNasImport(null);

    return {
      images: nextImages.length,
      classes: nextClasses.length,
      masks: Object.values(nextAnnotationsByImage).reduce((acc, item) => acc + item.masks.length, 0)
    };
  }

  async function linkNasBaseFolder(fileList) {
    if (!pendingNasImport) {
      return fileList?.files ? addImageDirectory(fileList) : addImages(fileList);
    }

    const fileByRelativePath = new Map();
    let baseFolderName = "";
    let directoryPath = "";

    if (fileList?.files) {
      directoryPath = normalizeCandidatePath(fileList.directoryPath);
      baseFolderName = extractFileNameFromPath(directoryPath);

      for (const entry of fileList.files) {
        const relativePath = normalizePath(entry?.relativePath || entry?.name || "");
        if (!relativePath || !isImagePathOrEntry(entry)) {
          continue;
        }

        fileByRelativePath.set(relativePath, {
          mode: "desktop",
          sourcePath: normalizeCandidatePath(entry.path),
          fileName: entry.name || extractFileNameFromPath(entry.path)
        });
      }
    } else {
      const folderFiles = Array.from(fileList ?? []).filter((file) => isImageFile(file));
      if (!folderFiles.length) {
        throw new Error("Selecciona la carpeta base completa donde estan las imagenes de la NAS.");
      }

      for (const file of folderFiles) {
        const relativeInfo = getRelativePathInfo(file);
        if (!relativeInfo.relativePath) {
          continue;
        }
        baseFolderName = baseFolderName || relativeInfo.baseFolderName;
        fileByRelativePath.set(normalizePath(relativeInfo.relativePath), {
          mode: "browser",
          file
        });
      }
    }

    if (!fileByRelativePath.size) {
      throw new Error("Selecciona la carpeta base completa donde estan las imagenes de la NAS.");
    }

    const classIdByIndex = pendingNasImport.classes.reduce((acc, item, index) => {
      acc[index] = item.id;
      return acc;
    }, {});

    const nextImages = [];
    const nextAnnotationsByImage = {};
    let missing = 0;

    for (const item of pendingNasImport.items) {
      const matchedEntry = fileByRelativePath.get(item.relativePath);
      if (!matchedEntry) {
        missing += 1;
        continue;
      }

      const file =
        matchedEntry.mode === "desktop"
          ? await createFileFromDesktopEntry(matchedEntry.sourcePath, matchedEntry.fileName)
          : matchedEntry.file;
      const url = URL.createObjectURL(file);
      const dims = await readImageDimensions(url);
      const imageId = createId("img");
      const rawBoxes = parseDetectionLabels(item.detectionContent, dims.width, dims.height);
      const rawMasks = parseSegmentationLabels(item.segmentationContent, dims.width, dims.height);

      nextImages.push({
        id: imageId,
        file,
        url,
        width: dims.width,
        height: dims.height,
        name: item.relativePath,
        sourcePath: matchedEntry.mode === "desktop" ? matchedEntry.sourcePath : "",
        relativePath: item.relativePath,
        baseFolderName
      });

      nextAnnotationsByImage[imageId] = {
        boxes: rawBoxes
          .map((box) => ({
            id: createId("box"),
            classId: classIdByIndex[box.classIndex] ?? pendingNasImport.classes[0]?.id ?? null,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          }))
          .filter((box) => box.classId && box.width >= 1 && box.height >= 1),
        masks: rawMasks
          .map((mask) => ({
            id: createId("mask"),
            classId: classIdByIndex[mask.classIndex] ?? pendingNasImport.classes[0]?.id ?? null,
            points: mask.points
          }))
          .filter((mask) => mask.classId && mask.points.length >= 3)
      };
    }

    if (!nextImages.length) {
      throw new Error("No se encontro ninguna imagen que coincida con las rutas relativas guardadas en el dataset NAS.");
    }

    revokeImageUrls(images);
    setImages(nextImages);
    setSelectedImageId(nextImages[0]?.id ?? null);
    setAnnotationsByImage(nextAnnotationsByImage);
    setNasBaseFolderName(baseFolderName);
    setSelectedDirectoryPath(directoryPath);
    setPendingNasImport(null);

    return {
      linked: nextImages.length,
      missing,
      message:
        missing > 0
          ? `Carpeta base vinculada: ${nextImages.length} imagenes encontradas, ${missing} no aparecieron en la base seleccionada.`
          : `Carpeta base vinculada: ${nextImages.length} imagenes encontradas.`
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
    nasBasePath,
    setNasBasePath,
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
    addImageDirectory,
    addImagePaths,
    linkNasBaseFolder,
    importDataset,
    removeImage,
    annotationsByImage,
    selectedAnnotations,
    addBox,
    addMask,
    deleteAnnotation,
    classIndexById,
    progress,
    hasPendingNasImport: Boolean(pendingNasImport),
    nasBaseFolderName,
    selectedDirectoryPath
  };
}

function buildImportedClasses(classNames) {
  return classNames.map((name, index) => ({
    id: createId("class"),
    name,
    color: getColorForIndex(index)
  }));
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

function getSourcePath(file) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const directPath = normalizeCandidatePath(file?.path);
    if (isAbsoluteFilePath(directPath)) {
      return directPath;
    }

    const desktopBridgePath = normalizeCandidatePath(window.desktopApp?.getPathForFile?.(file));
    if (isAbsoluteFilePath(desktopBridgePath)) {
      return desktopBridgePath;
    }

    return normalizeCandidatePath(file.webkitRelativePath) || file.name || "";
  } catch (error) {
    return normalizeCandidatePath(file?.path) || normalizeCandidatePath(file?.webkitRelativePath) || file?.name || "";
  }
}

function getRelativePathInfo(file) {
  const normalized = normalizeCandidatePath(file?.webkitRelativePath);
  if (!normalized || !normalized.includes("/")) {
    return { baseFolderName: "", relativePath: "" };
  }

  const parts = normalized.split("/").filter(Boolean);
  return {
    baseFolderName: parts[0] || "",
    relativePath: parts.slice(1).join("/")
  };
}

function normalizeCandidatePath(value) {
  return String(value || "").trim().replaceAll("\\", "/");
}

function isAbsoluteFilePath(filePath) {
  const normalized = String(filePath || "").trim().replaceAll("\\", "/");
  return /^\/.+/.test(normalized) || /^[a-zA-Z]:\/.+/.test(normalized);
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

function isImagePathOrEntry(file) {
  if (!file) {
    return false;
  }

  if (isImageFile(file)) {
    return true;
  }

  return /\.(png|jpe?g|webp|bmp|gif|tiff?|heic|heif)$/i.test(String(file.name || file.path || ""));
}

async function buildEmbeddedImportItems(datasetImages, entriesByPath, rootPrefix) {
  const items = [];

  for (const imgItem of datasetImages) {
    const imageUrl = URL.createObjectURL(imgItem.file);
    const dims = await readImageDimensions(imageUrl);
    URL.revokeObjectURL(imageUrl);

    items.push({
      ...imgItem,
      dims
    });
  }

  return items;
}

async function buildNasImportItems(nasReferencedImages, entriesByPath, rootPrefix) {
  if (!window.desktopApp?.readFileFromPath) {
    throw new Error("Los ZIP NAS sin imagenes solo se pueden importar desde la app de escritorio.");
  }

  const missingPaths = [];
  const items = [];

  for (const item of nasReferencedImages) {
    try {
      const bytes = await window.desktopApp.readFileFromPath(item.sourcePath);
      const file = new File([bytes], item.sourceImageName || extractFileNameFromPath(item.sourcePath), {
        type: getMimeTypeFromName(item.sourceImageName || item.sourcePath)
      });
      const baseName = buildNasLabelStem(item.sourcePath);
      const split = detectNasSplit(entriesByPath, rootPrefix, baseName);

      items.push({
        file,
        split,
        fileName: item.sourceImageName || extractFileNameFromPath(item.sourcePath),
        baseName,
        path: joinPath(rootPrefix, `images/${split}/${item.sourceImageName || extractFileNameFromPath(item.sourcePath)}`),
        sourcePath: item.sourcePath,
        dims: await readImageDimensionsFromFile(file)
      });
    } catch {
      missingPaths.push(item.sourcePath);
    }
  }

  if (missingPaths.length) {
    throw new Error(
      `No se pudieron abrir ${missingPaths.length} imagenes referenciadas desde la NAS o el equipo local. Rutas de ejemplo: ${missingPaths
        .slice(0, 3)
        .join(" | ")}`
    );
  }

  return items;
}

function normalizeNasReferencedImages(nasImagesMeta) {
  return Array.isArray(nasImagesMeta?.items)
    ? nasImagesMeta.items
        .map((item) => {
          const pathValue = item?.sourcePath || item?.path || "";
          return {
            sourcePath: pathValue,
            sourceImageName: item?.sourceImageName || item?.imageName || "",
            relativePath: item?.relativePath || item?.path || ""
          };
        })
        .filter((item) => item.sourcePath || item.relativePath)
    : [];
}

async function createFileFromDesktopEntry(sourcePath, fileName) {
  const bytes = await window.desktopApp.readFileFromPath(sourcePath);
  return new File([bytes], fileName, { type: getMimeTypeFromName(fileName) });
}

function buildPortableRelativePath(ref, baseFolderName) {
  const explicitRelativePath = normalizeCandidatePath(ref?.relativePath);
  if (explicitRelativePath && !isAbsoluteFilePath(explicitRelativePath)) {
    return explicitRelativePath;
  }

  const sourcePath = normalizeCandidatePath(ref?.sourcePath);
  if (!sourcePath) {
    return explicitRelativePath;
  }

  const cleanBaseFolderName = normalizeCandidatePath(baseFolderName).replace(/^\/+|\/+$/g, "");
  if (!cleanBaseFolderName) {
    return sourcePath;
  }

  const marker = `/${cleanBaseFolderName}/`;
  const lowerSourcePath = sourcePath.toLowerCase();
  const lowerMarker = marker.toLowerCase();
  const markerIndex = lowerSourcePath.lastIndexOf(lowerMarker);

  if (markerIndex >= 0) {
    return sourcePath.slice(markerIndex + marker.length);
  }

  return sourcePath;
}

function extractFileNameFromPath(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "imagen";
}

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

function buildNasLabelStem(sourcePath) {
  return (
    String(sourcePath || "")
      .normalize("NFKD")
      .replaceAll("\\", "/")
      .toLowerCase()
      .replace(/[^a-z0-9/_-]+/g, "_")
      .replace(/\//g, "__")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/^_+|_+$/g, "") || "imagen"
  );
}

function detectNasSplit(entriesByPath, rootPrefix, labelBaseName) {
  const trainPath = joinPath(rootPrefix, `labels/detection/train/${labelBaseName}.txt`);
  const valPath = joinPath(rootPrefix, `labels/detection/val/${labelBaseName}.txt`);
  return entriesByPath.get(valPath) && !entriesByPath.get(trainPath) ? "val" : "train";
}

async function readImageDimensionsFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    return await readImageDimensions(url);
  } finally {
    URL.revokeObjectURL(url);
  }
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
