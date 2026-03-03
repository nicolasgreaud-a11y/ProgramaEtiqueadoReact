export function sanitizeBaseName(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  const raw = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
}

export function getExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) {
    return "jpg";
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
