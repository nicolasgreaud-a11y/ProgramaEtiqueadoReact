const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, shell, dialog } = require('electron');
const { ipcMain } = require('electron');

const isDev = !app.isPackaged;

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f4f5f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5180');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('save-export-zip', async (_event, payload) => {
    const defaultPath = path.join(app.getPath('downloads'), payload?.suggestedName || 'dataset-yolo.zip');
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.writeFile(result.filePath, Buffer.from(payload?.bytes ?? []));
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('pick-image-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'heic', 'heif'] }]
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('pick-image-folder-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'multiSelections']
    });

    if (result.canceled) {
      return [];
    }

    const allFiles = [];
    for (const folderPath of result.filePaths) {
      const folderFiles = await collectImageFiles(folderPath);
      allFiles.push(...folderFiles);
    }

    return allFiles;
  });

  ipcMain.handle('pick-dataset-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths.length) {
      return null;
    }

    const folderPath = result.filePaths[0];
    const files = await collectAllFiles(folderPath);
    return {
      folderPath,
      files
    };
  });

  ipcMain.handle('read-file-from-path', async (_event, filePath) => {
    const resolvedPath = await resolveReadableFilePath(filePath);
    const buffer = await fs.readFile(resolvedPath);
    return Uint8Array.from(buffer);
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

async function resolveReadableFilePath(filePath) {
  const normalizedInput = String(filePath || "").trim();
  if (!normalizedInput) {
    throw new Error("Ruta de imagen vacia.");
  }

  if (await fileExists(normalizedInput)) {
    return normalizedInput;
  }

  const normalizedForCurrentOs = normalizedInput.replaceAll("\\", path.sep).replaceAll("/", path.sep);
  if (await fileExists(normalizedForCurrentOs)) {
    return normalizedForCurrentOs;
  }

  const baseName = path.basename(normalizedForCurrentOs);
  const homeDir = app.getPath('home');
  const candidateRoots = [
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'Downloads'),
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Pictures'),
    homeDir
  ];

  for (const root of candidateRoots) {
    const found = await findFileByName(root, baseName, 4);
    if (found) {
      return found;
    }
  }

  throw new Error(`No se encontro la imagen referenciada: ${normalizedInput}`);
}

async function fileExists(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function findFileByName(rootDir, targetName, maxDepth) {
  if (maxDepth < 0) {
    return null;
  }

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(rootDir, entry.name);
      if (entry.isFile() && entry.name === targetName) {
        return entryPath;
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const entryPath = path.join(rootDir, entry.name);
      const found = await findFileByName(entryPath, targetName, maxDepth - 1);
      if (found) {
        return found;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function collectImageFiles(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length) {
    const currentDir = stack.pop();
    let entries = [];

    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile() && /\.(png|jpe?g|webp|bmp|gif|tiff?|heic|heif)$/i.test(entry.name)) {
        results.push(entryPath);
      }
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

async function collectAllFiles(rootDir, currentDir = rootDir) {
  const results = [];
  let entries = [];

  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectAllFiles(rootDir, entryPath);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      const relativePath = path.relative(rootDir, entryPath);
      results.push({
        name: entry.name,
        path: entryPath,
        relativePath: relativePath.replaceAll('\\', '/')
      });
    }
  }

  return results;
}
