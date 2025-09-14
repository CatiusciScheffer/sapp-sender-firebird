const { app, Tray, Menu, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { MessageMedia } = require('whatsapp-web.js');
const { envPath, userDataPath } = require('./config/paths');
const db = require('./core/database');
const wa = require('./core/whatsapp');
const queue = require('./queueProcessor');
const eventManager = require('./core/eventManager');
const { initHelpers } = require('./utils/helpers');
const { initializeEmojiMap } = require('./utils/emojiProcessor');

let mainWindow;
let tray = null;

function createTray() {
  // Isso impede a criação de múltiplos ícones.
  if (tray) {
    return;
  }

  const iconName = 'trayIcon.png';

  console.log(`[DEBUG] Procurando icon em: ${iconName}`);

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', iconName)
    : path.join(app.getAppPath(), 'assets', iconName);

  // A variável global 'tray' é inicializada aqui.
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir QR Code / Status', // Nome mais descritivo
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      },
    },
    {
      label: 'Sair',
      click: () => {
        // Adiciona uma pequena lógica de confirmação para ser mais seguro
        dialog
          .showMessageBox({
            type: 'question',
            buttons: ['Sim', 'Não'],
            defaultId: 1,
            title: 'Confirmar Saída',
            message: 'Você tem certeza que deseja fechar o Monitor WhatsApp?',
          })
          .then((response) => {
            if (response.response === 0) {
              // 'Sim' é o primeiro botão
              app.quit();
            }
          });
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Monitor WhatsApp - Inicializando...');
}

function setupGlobalAckHandler() {
  eventManager.on('whatsapp-ack', async (data) => {
    const { msgId, ack } = data;
    let status;
    switch (ack) {
      case 1:
        status = 'ENVIADO_SERVIDOR';
        break;
      case 2:
        status = 'ENTREGUE';
        break;
      case 3:
        status = 'VISUALIZADO';
        break;
      case -1:
        status = 'FALHA_ENVIO';
        break;
      default:
        return;
    }

    try {
      // Agora ele chama db.updateAckStatus com segurança
      await db.updateAckStatus(msgId, status);
      console.log(`📌 ACK atualizado: ${msgId} → ${status}`);
    } catch (err) {
      console.error(`❌ Erro ao atualizar ACK no banco:`, err.message);
    }
  });
}

function initApp() {
  app.disableHardwareAcceleration();

  //------------------------------------------------------
  process.on('uncaughtException', (error) => {
    console.error('--- EXCEÇÃO NÃO TRATADA ---');
    console.error('Ocorreu um erro fatal que não foi capturado.');
    console.error('Nome do Erro:', error.name);
    console.error('Mensagem:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('-----------------------------');

    // Define o caminho para o arquivo de log na pasta de dados do usuário.
    // É seguro chamar getPath aqui porque a exceção provavelmente ocorrerá após o 'ready'.
    const logPath = path.join(app.getPath('userData'), 'error.log');
    const errorDetails = `
    =========================================================
    Data: ${new Date().toISOString()}
    Erro: ${error.name}
    Mensagem: ${error.message}
    Stack Trace:
    ${error.stack}
    =========================================================
    \n
    `;

    // Tenta salvar o erro em um arquivo de log
    try {
      fs.appendFileSync(logPath, errorDetails);
      // Mostra uma mensagem amigável para o usuário ANTES de fechar.
      dialog.showErrorBox(
        'Erro Inesperado',
        `Ocorreu um erro inesperado e a aplicação precisa ser fechada.\n\nUm relatório do erro foi salvo em:\n${logPath}`
      );
    } catch (logError) {
      // Se até a escrita do log falhar, mostra um erro mais simples.
      console.error('Falha ao escrever no arquivo de log:', logError);
      dialog.showErrorBox(
        'Erro Crítico Duplo',
        `Ocorreu um erro inesperado e não foi possível salvar o relatório de erro.\n\nErro Original: ${error.message}`
      );
    }

    // Encerra a aplicação de forma segura
    app.quit();
  });

  //------------------------------------------------------

  app.whenReady().then(() => {
    const userDataPath = app.getPath('userData');
    const envPath = path.join(userDataPath, '.env');

    // se o .env não existir cria um pré-preenchido
    if (!fs.existsSync(envPath)) {
      const envTemplate = `# Configurações do Banco de Dados Firebird
        # Por favor, preencha as informações abaixo e reinicie a aplicação.
        DB_HOST=127.0.0.1
        DB_PORT=3050
        DB_PATH=C:\\caminho\\para\\seu\\banco.fdb
        DB_USER=
        DB_PASSWORD=

        # Pausa em milissegundos entre envios
        MIN_SEND_DELAY_MS=2000
        MAX_SEND_DELAY_MS=5000

        # (OPCIONAL) Caminho para o executável do Chrome, caso o padrão falhe.
        # Use barras duplas no Windows (ex: C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe)
        # Deixe em branco para usar o navegador interno do aplicativo.
        CHROME_EXEC_PATH=
        `;
      try {
        // Garante que o diretório de dados do usuário existe
        if (!fs.existsSync(userDataPath)) {
          fs.mkdirSync(userDataPath, { recursive: true });
        }
        fs.writeFileSync(envPath, envTemplate);
        dialog.showErrorBox(
          'Configuração Necessária',
          `O arquivo de configuração (.env) foi criado em:\n\n${envPath}\n\nPor favor, edite-o e reinicie o programa.`
        );
      } catch (err) {
        dialog.showErrorBox(
          'Erro Crítico',
          `Não foi possível criar o arquivo .env: ${err.message}`
        );
      }
      return app.quit();
    }

    // se o .env existe, carregar as variáveis e definir as configurações.
    require('dotenv').config({ path: envPath });

    db.initDatabase();
    initHelpers();
    initializeEmojiMap();
    queue.initQueueProcessor(db, wa);
    setupGlobalAckHandler();

    const isProduction = app.isPackaged;

    mainWindow = new BrowserWindow({
      width: 350,
      height: 650,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    mainWindow.loadFile(path.join(app.getAppPath(), 'qr.html'));

    eventManager.on('whatsapp-ready', () => {
      console.log('🚀 Evento "whatsapp-ready" recebido. Iniciando a fila...');
      queue.startQueueProcessing();
    });

    createTray();
    wa.startWhatsAppService(isProduction, mainWindow, tray, eventManager);

    // Iniciar a API Express
    const api = express();
    api.use(express.json());

    api.post('/send', async (req, res) => {
      if (!wa.isReady())
        return res.status(503).json({ error: 'WhatsApp não está pronto.' });

      const { number, text } = req.body;
      const chatId = number.includes('@c.us') ? number : number + '@c.us';
      try {
        // Use o getter importado do módulo wa
        const client = wa.getClient();
        const msg = await client.sendMessage(chatId, text); // sendMessage direto é ok para a API
        res.json({ id: msg.id._serialized });
      } catch (err) {
        res.status(500).json({ error: err.toString() });
      }
    });

    api.post('/send-file', async (req, res) => {
      if (!wa.isReady())
        return res.status(503).json({ error: 'WhatsApp não está pronto.' });

      const { number, filePath, fileName, caption } = req.body;
      const chatId = number.includes('@c.us') ? number : number + '@c.us';

      try {
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'Arquivo não encontrado' });
        }

        const media = MessageMedia.fromFilePath(filePath);
        const client = wa.getClient();

        await client.sendMessage(chatId, media, {
          caption: caption || fileName,
        });

        res.json({ status: 'enviado', file: fileName });
      } catch (err) {
        res.status(500).json({ error: err.toString() });
      }
    });

    api
      .listen(3001, () =>
        console.log('🌐 API rodando em http://localhost:3001')
      )
      .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          dialog.showErrorBox(
            'Erro Crítico',
            'A porta 3001 já está em uso por outra aplicação.'
          );
          app.quit();
        }
      });
  });

  app.on('window-all-closed', (ev) => ev.preventDefault());
}

module.exports = { initApp };
