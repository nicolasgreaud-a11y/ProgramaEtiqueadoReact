import { formatFloat, normalizeBox, normalizePoint } from "../../utils/geometry";
import { getExtension, sanitizeBaseName } from "../../utils/file";

export function buildExportManifest({ images, classes, annotationsByImage, classIndexById, splitRatio = 0.8 }) {
  const items = images.map((image, index) => {
    const annotation = annotationsByImage[image.id] ?? { boxes: [], masks: [] };
    const split = index < Math.max(1, Math.floor(images.length * splitRatio)) ? "train" : "val";
    const extension = getExtension(image.name);
    const baseName = `${String(index + 1).padStart(5, "0")}_${sanitizeBaseName(image.name)}`;
    const fileName = `${baseName}.${extension}`;

    const detectionLines = annotation.boxes
      .map((box) => {
        const classIndex = classIndexById[box.classId];
        if (classIndex === undefined) return null;
        const normalized = normalizeBox(box, image.width, image.height);
        return `${classIndex} ${formatFloat(normalized.cx)} ${formatFloat(normalized.cy)} ${formatFloat(normalized.w)} ${formatFloat(normalized.h)}`;
      })
      .filter(Boolean);

    const segmentationLines = annotation.masks
      .map((mask) => {
        const classIndex = classIndexById[mask.classId];
        if (classIndex === undefined || !mask.points?.length) return null;
        const points = mask.points
          .map((pt) => normalizePoint(pt, image.width, image.height))
          .flatMap((pt) => [formatFloat(pt.x), formatFloat(pt.y)]);
        return `${classIndex} ${points.join(" ")}`;
      })
      .filter(Boolean);

    return {
      image,
      split,
      fileName,
      txtName: `${baseName}.txt`,
      detectionLines,
      segmentationLines,
      annotation
    };
  });

  const classNames = classes.map((item) => item.name);
  return {
    items,
    classNames,
    detectionYaml: buildYaml("labels/detection", classNames),
    segmentationYaml: buildYaml("labels/segmentation", classNames)
  };
}

function buildYaml(labelRoot, classNames) {
  return [
    "path: .",
    "train: images/train",
    "val: images/val",
    `labels: ${labelRoot}`,
    `nc: ${classNames.length}`,
    `names: [${classNames.map((name) => `'${name.replace(/'/g, "")}'`).join(", ")}]`
  ].join("\n");
}
