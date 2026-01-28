const { Client, LocalAuth } = require('whatsapp-web.js');
const findChrome = require('chrome-finder');
const qrcode = require('qrcode');
const { sessionPath } = require('../config/paths');
const eventManager = require('./eventManager');

let client;
let isWhatsAppReady = false;

function getClient() {
  return client;
}
function isReady() {
  return isWhatsAppReady;
}

async function sendMessageSafe(chatId, content, options = {}) {
  const msg = await client.sendMessage(chatId, content, options);

  if (!msg || !msg.id || !msg.id._serialized) {
    throw new Error('Mensagem enviada sem ID');
  }

  return msg; // 🔥 retorna imediatamente, SEM timeout
}

function startWhatsAppService(isProduction, mainWindow, tray, eventManager) {
  const customChromePath = process.env.CHROME_EXEC_PATH || null;
  const chromePath = findChrome() || customChromePath;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: {
      executablePath: chromePath,
      headless: isProduction,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-extensions',
        '--disable-gpu',
      ],
    },
  });

  client.on('qr', async (qr) => {
    isWhatsAppReady = false;

    if (tray) tray.setToolTip('...');
    const qrDataUrl = await qrcode.toDataURL(qr);

    if (mainWindow) {
      mainWindow.webContents.send('qr', qrDataUrl);
      mainWindow.show();
    }
  });

  client.on('message_ack', (msg, ack) => {
    if (!msg?.id?._serialized) return;

    eventManager.emit('whatsapp-ack', {
      msgId: msg.id._serialized,
      ack,
    });
  });

  // Mantido para versões antigas
  client.on('ready', () => {
    console.log('✅ WhatsApp pronto (evento "ready")');
    if (!isWhatsAppReady) {
      isWhatsAppReady = true;
      if (tray) tray.setToolTip('Monitor WhatsApp - Conectado');
      eventManager.emit('whatsapp-ready');
    }
  });

  // Para versões novas
  client.on('authenticated', () => {
    console.log('🔐 Autenticado com sucesso');

    // Se após 3 segundos o 'ready' não disparou, considere pronto aqui
    setTimeout(() => {
      if (!isWhatsAppReady) {
        console.log(
          '⚠️  Evento "ready" não disparou. Considerando pronto após autenticação.',
        );
        isWhatsAppReady = true;
        if (tray) tray.setToolTip('Monitor WhatsApp - Conectado');
        eventManager.emit('whatsapp-ready');
      }
    }, 3000);
  });

  client.on('authenticated', () => {
    console.log('🔐 Autenticado com sucesso');

    if (tray) tray.setToolTip('Monitor WhatsApp - Autenticado, conectando...'); // <-- ToolTip

    if (mainWindow) mainWindow.hide();
  });

  client.on('auth_failure', (msg) => {
    isWhatsAppReady = false;
    console.error('❌ Falha na autenticação', msg);
    if (tray) tray.setToolTip('Monitor WhatsApp - Falha na autenticação!'); // <-- ToolTip
  });

  client.on('disconnected', () => {
    isWhatsAppReady = false;

    if (tray) tray.setToolTip('Monitor WhatsApp - Falha na autenticação!'); // <-- ToolTip

    console.log('🔁 Desconectado, reconectando...');

    client
      .destroy()
      .catch((err) => console.error('Erro ao destruir cliente:', err));
    setTimeout(
      () => startWhatsAppService(isProduction, mainWindow, tray),
      10000,
    );
  });

  // Listener genérico de mensagens recebidas
  client.on('message', (msg) => {
    console.log(`📥 ${msg.from}: ${msg.body}`);
  });

  console.log('▶️  Iniciando a inicialização do cliente WhatsApp...');
  const { dialog, app } = require('electron');
  client.initialize().catch((err) => {
    console.error('FALHA FATAL NA INICIALIZAÇÃO DO CLIENTE:', err);
    dialog.showErrorBox(
      'Erro Crítico',
      'Não foi possível iniciar o WhatsApp...\n' + err.message,
    );
    app.quit();
  });
}

module.exports = {
  startWhatsAppService,
  getClient,
  isReady,
  sendMessageSafe,
  MessageMedia: require('whatsapp-web.js').MessageMedia, // Re-exporta MessageMedia
};
