// =======================================================
// 1. IMPORTS E DEFINIÇÕES GLOBAIS
// =======================================================
const { app, Tray, Menu, BrowserWindow, dialog } = require('electron');
app.disableHardwareAcceleration();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const qrcode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const Firebird = require('node-firebird');

// Variáveis globais que serão definidas depois
let dbOptions;
let MIN_SEND_DELAY_MS;
let MAX_SEND_DELAY_MS;
let tray = null;
let client;
let isWhatsAppReady = false;

// =======================================================
// 2. FUNÇÕES AUXILIARES E DE LÓGICA DE NEGÓCIO
// =======================================================
// função para obter um tempo de pausa aleatório dentro do intervalo
function getRandomDelay() {
  // Garante que o mínimo não seja maior que o máximo, caso o .env seja configurado errado
  const min = Math.min(MIN_SEND_DELAY_MS, MAX_SEND_DELAY_MS);
  const max = Math.max(MIN_SEND_DELAY_MS, MAX_SEND_DELAY_MS);
  // Calcula um número aleatório entre min e max (inclusivo)
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//função para tornar os textos únicos
function generateInvisibleSuffix(length = 6) {
  const invisibleChars = [
    '\u200B', // Zero Width Space
    '\u200C', // Zero Width Non-Joiner
    '\u200D', // Zero Width Joiner
    '\u2060', // Word Joiner
    '\uFEFF', // Zero Width No-Break Space
  ];
  let result = '';
  for (let i = 0; i < length; i++) {
    result += invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
  }
  return result;
}

//função para tornar os arquivos unicos
async function createUniqueFileCopy(originalPath) {
  if (!fs.existsSync(originalPath)) {
    throw new Error(`Arquivo anexo original não encontrado: ${originalPath}`);
  }

  // 1. Gera um nome de arquivo temporário único
  const tempDir = os.tmpdir();
  const extension = path.extname(originalPath);
  const tempFileName = `${path.basename(
    originalPath,
    extension
  )}-${crypto.randomUUID()}${extension}`;
  const tempFilePath = path.join(tempDir, tempFileName);

  // 2. Copia o arquivo original para o local temporário
  await fs.promises.copyFile(originalPath, tempFilePath);

  // 3. Adiciona um "carimbo" único (UUID) no final do arquivo para alterar seu hash
  const uniqueStamp = crypto.randomUUID();
  await fs.promises.appendFile(tempFilePath, `\n<!-- ${uniqueStamp} -->`); // Adiciona de forma segura para a maioria dos tipos

  return tempFilePath;
}

// =======================================================
// 2. FUNÇÕES AUXILIARES DE BANCO DE DADOS
// =======================================================
async function atualizarStatusTarefa(id, status, observacao = '') {
  const sql = `UPDATE WHATS_ENVIADO SET SITUACAO_TAREFA = ?, OBSERVACAO = ? WHERE ID = ?`;
  const db = await new Promise((res, rej) =>
    Firebird.attach(dbOptions, (e, d) => (e ? rej(e) : res(d)))
  );
  await new Promise((res, rej) =>
    db.query(sql, [status, observacao.substring(0, 99), id], (e) =>
      e ? rej(e) : res()
    )
  );
  db.detach();
  console.log(`🔷 Status da Tarefa ${id} atualizado para: ${status}`);
}

async function registrarMensagemEnviada(idEnvio, msgId, tipo, conteudo) {
  const sql = `INSERT INTO WHATS_MENSAGENS (ID_ENVIO, ID_MSG_WHATSAPP, TIPO_MSG, CONTEUDO) VALUES (?, ?, ?, ?)`;
  const db = await new Promise((res, rej) =>
    Firebird.attach(dbOptions, (e, d) => (e ? rej(e) : res(d)))
  );
  await new Promise((res, rej) =>
    db.query(sql, [idEnvio, msgId, tipo, conteudo], (e) => (e ? rej(e) : res()))
  );
  db.detach();
  console.log(`💾 Mensagem registrada: ${msgId} (Tipo: ${tipo})`);
}

async function atualizarStatusAck(msgSerializedId, status) {
  const sql = `UPDATE WHATS_MENSAGENS SET STATUS_ACK = ? WHERE ID_MSG_WHATSAPP = ?`;
  const db = await new Promise((res, rej) =>
    Firebird.attach(dbOptions, (e, d) => (e ? rej(e) : res(d)))
  );
  await new Promise((res, rej) =>
    db.query(sql, [status, msgSerializedId], (e) => (e ? rej(e) : res()))
  );
  db.detach();
}

// =======================================================
// 3. FUNÇÕES PRINCIPAIS DA APLICAÇÃO
// =======================================================

function sendMessageAndCapture(chatId, content) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeListener('message_create', listener);
      reject(
        new Error('Timeout: Evento message_create não foi capturado a tempo.')
      );
    }, 15000);

    const listener = (msg) => {
      // Adicionando logs para depuração
      console.log(
        `[DEBUG] message_create recebido: De: ${msg.fromMe}, Para: ${msg.to}`
      );
      console.log(`[DEBUG] Comparando com: fromMe: true, Para: ${chatId}`);

      // Condição simplificada e mais robusta
      if (msg.fromMe && msg.to === chatId) {
        console.log(
          `[DEBUG] Mensagem correspondente encontrada! ID: ${msg.id._serialized}`
        );
        clearTimeout(timeout);
        client.removeListener('message_create', listener);
        resolve(msg);
      }
    };

    client.on('message_create', listener);

    // Agora, apenas disparamos o envio, sem o .then() para a flag
    client.sendMessage(chatId, content).catch((err) => {
      // Se o envio inicial falhar, limpamos e rejeitamos
      clearTimeout(timeout);
      client.removeListener('message_create', listener);
      reject(err);
    });
  });
}

async function processarFilaDoBanco() {
  if (!isWhatsAppReady) return;

  const sqlSelectTarefas = `SELECT ID, WHATS, TEXTO, ARQUIVO, ORDEM_ENVIO, ASSUNTO FROM WHATS_ENVIADO WHERE SITUACAO_TAREFA = 'AGUARDANDO' ORDER BY ID`;
  let db;

  try {
    db = await new Promise((res, rej) =>
      Firebird.attach(dbOptions, (e, d) => (e ? rej(e) : res(d)))
    );
    const rows = await new Promise((res, rej) =>
      db.query(sqlSelectTarefas, (e, r) => (e ? rej(e) : res(r)))
    );
    if (rows.length === 0) return;

    console.log(
      `📨 Encontradas ${rows.length} tarefas pendentes. Processando uma a uma...`
    );

    for (const row of rows) {
      const { ID, WHATS, TEXTO, ARQUIVO, ORDEM_ENVIO, ASSUNTO } = row;
      await atualizarStatusTarefa(ID, 'PROCESSANDO');
      const sqlSelectMensagens = `SELECT TIPO_MSG, CONTEUDO FROM WHATS_MENSAGENS WHERE ID_ENVIO = ?`;
      const mensagensJaEnviadas = await new Promise((res, rej) =>
        db.query(sqlSelectMensagens, [ID], (e, r) => (e ? rej(e) : res(r)))
      );
      let numeroLimpo = (WHATS || '').toString().trim().replace(/\D/g, '');

      // Garante que o número tem o prefixo do país
      if (numeroLimpo && !numeroLimpo.startsWith('55')) {
        numeroLimpo = '55' + numeroLimpo;
      }

      // Um número brasileiro completo com nono dígito tem 13 caracteres (55 + DDD + 9 + 8 dígitos).
      // Um número sem o nono dígito tem 12 caracteres (55 + DDD + 8 dígitos).
      if (numeroLimpo.length === 13) {
        // Se o número tem 13 caracteres, removemos o nono dígito, que é o terceiro após o DDD
        const ddd = numeroLimpo.substring(2, 4); // Pega '51'
        const numeroSemNonoDigito = numeroLimpo.substring(5); // Pega '82576987'

        numeroLimpo = `55${ddd}${numeroSemNonoDigito}`; // Junta tudo: '555182576987'
        console.log(
          `[INFO] Nono dígito removido para normalização: ${WHATS} -> ${numeroLimpo}`
        );
      }

      // A validação final agora deve checar por 12 caracteres.
      if (!numeroLimpo || numeroLimpo.length !== 12) {
        await atualizarStatusTarefa(
          ID,
          'ERRO',
          `Numero invalido ou fora do padrao: ${numeroLimpo}`
        );
        continue;
      }
      const chatId = numeroLimpo + '@c.us';
      const assuntoLimpo = (ASSUNTO || '').toString('utf-8').trim();
      const textoLimpo = (TEXTO || '').toString('utf-8').trim();
      let textoParaEnviar =
        assuntoLimpo && textoLimpo
          ? `*${assuntoLimpo}*\n\n${textoLimpo}`
          : assuntoLimpo || textoLimpo;
      const listaDeArquivos = (ARQUIVO || '')
        .toString('utf-8')
        .trim()
        .split(',')
        .map((p) => p.trim().replace(/^"|"$/g, ''))
        .filter((p) => p);
      let erros = [];
      let sucessos = 0;

      const enviarTexto = async () => {
        if (!textoParaEnviar) return;
        const jaEnviouTexto = mensagensJaEnviadas.some(
          (m) => m.TIPO_MSG === 'TEXTO'
        );
        if (jaEnviouTexto) {
          sucessos++;
          return;
        }

        try {
          const textoFinalUnico = textoParaEnviar + generateInvisibleSuffix();

          const msg = await sendMessageAndCapture(chatId, textoFinalUnico);
          await registrarMensagemEnviada(
            ID,
            msg.id._serialized,
            'TEXTO',
            textoParaEnviar
          );
          sucessos++;
          const delay = getRandomDelay();
          console.log(
            `📤 Texto enviado (ID: ${ID}). Pausando por ${(
              delay / 1000
            ).toFixed(1)}s...`
          );
          await pause(delay);
        } catch (err) {
          erros.push(`Texto: ${err.message}`);
        }
      };

      const enviarArquivos = async () => {
        if (listaDeArquivos.length === 0) return;
        for (const arquivoPath of listaDeArquivos) {
          const jaEnviouArquivo = mensagensJaEnviadas.some(
            (m) => m.TIPO_MSG === 'ARQUIVO' && m.CONTEUDO === arquivoPath
          );
          if (jaEnviouArquivo) {
            console.log(
              `[INFO] Arquivo ${path.basename(
                arquivoPath
              )} para Tarefa ID ${ID} já foi enviado. Pulando.`
            );
            sucessos++;
            continue;
          }
          if (!fs.existsSync(arquivoPath)) {
            erros.push(`Arquivo nao encontrado: ${arquivoPath}`);
            continue;
          }

          let tempFilePath = null;
          try {
            tempFilePath = await createUniqueFileCopy(arquivoPath);

            const media = MessageMedia.fromFilePath(tempFilePath);
            const msg = await sendMessageAndCapture(chatId, media);
            await registrarMensagemEnviada(
              ID,
              msg.id._serialized,
              'ARQUIVO',
              arquivoPath
            );
            sucessos++;
            const delay = getRandomDelay();
            console.log(
              `📤 Arquivo ${path.basename(
                arquivoPath
              )} enviado (ID: ${ID}). Pausando por ${(delay / 1000).toFixed(
                1
              )}s...`
            );
            await pause(delay);
          } catch (err) {
            erros.push(`Arquivo ${path.basename(arquivoPath)}: ${err.message}`);
          } finally {
            if (tempFilePath && fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
              console.log(
                `🧹 Arquivo temporário ${path.basename(tempFilePath)} excluído.`
              );
            }
          }
        }
      };

      if (ORDEM_ENVIO === 1) {
        await enviarArquivos();
        await enviarTexto();
      } else {
        await enviarTexto();
        await enviarArquivos();
      }
      const totalOperacoes = (textoParaEnviar ? 1 : 0) + listaDeArquivos.length;
      if (erros.length === 0 && totalOperacoes > 0) {
        await atualizarStatusTarefa(ID, 'CONCLUIDO');
      } else if (sucessos > 0) {
        await atualizarStatusTarefa(ID, 'ERRO_PARCIAL', erros.join('; '));
      } else {
        await atualizarStatusTarefa(ID, 'ERRO', erros.join('; '));
      }
    }
  } catch (err) {
    console.error('❌ Erro fatal ao processar a fila do banco de dados:', err);
  } finally {
    if (db) db.detach();
  }
}

function setupAckHandler(client) {
  client.on('message_ack', async (msg) => {
    if (!msg.id || !msg.id._serialized) return;

    let status;
    switch (msg.ack) {
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
      await atualizarStatusAck(msg.id._serialized, status);
      console.log(`📌 ACK atualizado: ${msg.id._serialized} → ${status}`);
    } catch (err) {
      console.error(`❌ Erro ao atualizar ACK no banco:`, err.message);
    }
  });
}

// --- FUNÇÃO startWhatsApp ---
function startWhatsApp(customChromePath = null) {
  let browserPath;

  if (customChromePath) {
    // 1. Prioridade máxima: o caminho definido no .env
    console.log(
      `🔵 Usando caminho do Chrome definido no .env: ${customChromePath}`
    );
    browserPath = customChromePath;
  } else if (app.isPackaged) {
    // 2. Se estiver empacotado e sem .env, usa o Chromium interno
    console.log('📦 App está empacotado. Usando Chromium interno.');
    browserPath = path.join(
      process.resourcesPath,
      'puppeteer/chrome-win/chrome.exe'
    );
  } else {
    // 3. Em modo de desenvolvimento, deixa o Puppeteer decidir
    console.log(
      '🔧 Modo de desenvolvimento. Puppeteer irá gerenciar o navegador.'
    );
    browserPath = undefined;
  }

  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'meu-app' }),
    puppeteer: {
      executablePath: browserPath,
      headless: app.isPackaged, // Fica visível em dev, oculto em produção
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-extensions',
        '--disable-gpu',
      ],
    },
  });

  // O resto da sua função (client.on, etc) continua aqui...
  client.on('qr', async (qr) => {
    isWhatsAppReady = false;
    const qrDataUrl = await qrcode.toDataURL(qr);
    if (mainWindow) {
      mainWindow.webContents.send('qr', qrDataUrl);
      mainWindow.show();
    }
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp pronto');
    tray.setToolTip('WhatsApp Web: conectado');
    isWhatsAppReady = true;
    console.log('🚀 Iniciando verificação periódica do banco de dados...');
    processarFilaDoBanco();
    setInterval(processarFilaDoBanco, 30000);
  });

  client.on('authenticated', () => {
    console.log('🔐 Autenticado com sucesso');
    if (mainWindow) mainWindow.hide();
  });

  client.on('auth_failure', (msg) => {
    isWhatsAppReady = false;
    console.error('❌ Falha na autenticação', msg);
  });

  client.on('disconnected', () => {
    isWhatsAppReady = false;
    console.log('🔁 Desconectado, reconectando...');
    client
      .destroy()
      .catch((err) => console.error('Erro ao destruir cliente:', err));
    setTimeout(() => startWhatsApp(customChromePath), 10000); // Passa o caminho novamente na reconexão
  });

  // Listener genérico de mensagens recebidas
  client.on('message', (msg) => {
    console.log(`📥 ${msg.from}: ${msg.body}`);
  });

  // Anexa o handler de ACK
  setupAckHandler(client);

  console.log('▶️  Iniciando a inicialização do cliente WhatsApp...');
  client.initialize().catch((err) => {
    console.error('FALHA FATAL NA INICIALIZAÇÃO DO CLIENTE:', err);
    dialog.showErrorBox(
      'Erro Crítico',
      'Não foi possível iniciar o WhatsApp...\nVerifique se o caminho do Chrome no arquivo .env está correto ou remova-o para usar a versão interna.\n\n' +
        err.message
    );
    app.quit();
  });
}

let mainWindow;

function createTray() {
  const iconName = 'trayIcon.png';
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', iconName)
    : path.join(__dirname, 'assets', iconName);
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir console',
      click: () => {
        if (mainWindow) mainWindow.show();
      },
    },
    {
      label: 'Sair',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

// =======================================================
// 4. PONTO DE ENTRADA DO ELECTRON
// =======================================================
app.whenReady().then(() => {
  // ETAPA 1: Verificar e configurar o .env.
  const envPath = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), '.env')
    : path.join(__dirname, '.env');

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
      fs.writeFileSync(envPath, envTemplate);
      dialog.showErrorBox(
        'Configuração Necessária',
        `O arquivo de configuração (.env) foi criado em:\n\n${envPath}\n\nPor favor, edite-o com os dados do seu banco e reinicie o programa.`
      );
    } catch (err) {
      dialog.showErrorBox(
        'Erro Crítico',
        `Não foi possível criar o arquivo .env: ${err.message}`
      );
    }
    return app.quit();
  }

  // ETAPA 2: Se o .env existe, carregar as variáveis e definir as configurações.
  require('dotenv').config({ path: envPath });

  const customChromePath = process.env.CHROME_EXEC_PATH || null;
  const rawDbPath = process.env.DB_PATH || '';
  const correctedDbPath = rawDbPath.replace(/\\/g, '/');

  dbOptions = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: correctedDbPath,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
  };

  MIN_SEND_DELAY_MS = parseInt(process.env.MIN_SEND_DELAY_MS, 10) || 2000;
  MAX_SEND_DELAY_MS = parseInt(process.env.MAX_SEND_DELAY_MS, 10) || 5000;

  mainWindow = new BrowserWindow({
    width: 650,
    height: 650,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('qr.html');
  createTray();
  startWhatsApp(customChromePath);

  // Iniciar a API Express
  const api = express();
  api.use(express.json());

  api.post('/send', async (req, res) => {
    if (!isWhatsAppReady)
      return res.status(503).json({ error: 'WhatsApp não está pronto.' });

    const { number, text } = req.body;
    const chatId = number.includes('@c.us') ? number : number + '@c.us';
    try {
      const msg = await client.sendMessage(chatId, text);
      res.json({ id: msg.id._serialized });
    } catch (err) {
      res.status(500).json({ error: err.toString() });
    }
  });

  api.post('/send-file', async (req, res) => {
    if (!isWhatsAppReady)
      return res.status(503).json({ error: 'WhatsApp não está pronto.' });
    const { number, filePath, fileName, caption } = req.body;
    const chatId = number.includes('@c.us') ? number : number + '@c.us';
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }
      const media = MessageMedia.fromFilePath(filePath);
      await client.sendMessage(chatId, media, { caption: caption || fileName });
      res.json({ status: 'enviado', file: fileName });
    } catch (err) {
      res.status(500).json({ error: err.toString() });
    }
  });

  api.listen(3001, () =>
    console.log('🌐 API rodando em http://localhost:3001')
  );
});

app.on('window-all-closed', (ev) => ev.preventDefault());
