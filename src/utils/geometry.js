export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizePoint(point, width, height) {
  return {
    x: clamp(point.x / width, 0, 1),
    y: clamp(point.y / height, 0, 1)
  };
}

export function normalizeBox(box, width, height) {
  const centerX = (box.x + box.width / 2) / width;
  const centerY = (box.y + box.height / 2) / height;
  return {
    cx: clamp(centerX, 0, 1),
    cy: clamp(centerY, 0, 1),
    w: clamp(box.width / width, 0, 1),
    h: clamp(box.height / height, 0, 1)
  };
}

export function formatFloat(num) {
  return Number(num).toFixed(6);
}
