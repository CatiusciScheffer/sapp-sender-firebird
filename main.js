const { app, dialog } = require('electron');
const { initApp } = require('./src/main/app');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    dialog.showErrorBox(
      'Aplicação em Execução',
      'O Monitor WhatsApp já está rodando em segundo plano. Você pode acessá-lo pelo ícone ao lado do relógio.'
    );
  });
  // Inicia a aplicação principal
  initApp();
}
