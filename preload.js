// para enviar QR do backend para frontend se quiser mostrar QR
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  onQR: callback => ipcRenderer.on('qr', (e, qr) => callback(qr))
});
