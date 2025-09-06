// src/main/config/paths.js
const { app } = require('electron');
const path = require('path');

// Obtém o caminho uma vez e exporta
const userDataPath = app.getPath('userData');

// Exporta todos os caminhos derivados que a aplicação precisa
module.exports = {
  userDataPath,
  envPath: path.join(userDataPath, '.env'),
  sessionPath: path.join(userDataPath, 'wwebjs_auth'),
  logPath: path.join(userDataPath, 'error.log'),
};