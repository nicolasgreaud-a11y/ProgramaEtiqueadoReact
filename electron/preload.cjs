const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  isDesktop: true,
  pickImageFiles() {
    return ipcRenderer.invoke('pick-image-files');
  },
  pickImageFolderFiles() {
    return ipcRenderer.invoke('pick-image-folder-files');
  },
  pickDatasetFolder() {
    return ipcRenderer.invoke('pick-dataset-folder');
  },
  saveExportZip(payload) {
    return ipcRenderer.invoke('save-export-zip', payload);
  },
  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch (error) {
      return '';
    }
  },
  readFileFromPath(filePath) {
    return ipcRenderer.invoke('read-file-from-path', filePath);
  }
});
