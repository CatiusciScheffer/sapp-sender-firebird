const path = require('path');
const fs = require('fs');
const { getRandomDelay, pause } = require('./utils/helpers');
const {
  makeUniqueText,
  createUniqueFileCopy,
} = require('./utils/uniqueContent');
const {
  normalizePhoneNumber,
  formatWhatsAppMessage,
  formatLinks,
} = require('./utils/formatter');
const dependencies = { db: null, wa: null };
const { replaceShortcodesWithEmojis } = require('./utils/emojiProcessor');
let isProcessingQueue = false;

function initQueueProcessor(databaseModule, whatsappModule) {
  dependencies.db = databaseModule;
  dependencies.wa = whatsappModule;
}

async function processQueue() {
  if (isProcessingQueue) return;
  if (!dependencies.wa || !dependencies.wa.isReady()) return;

  isProcessingQueue = true; // Ativa a trava

  try {
    const tasks = await dependencies.db.fetchPendingTasks();
    if (tasks.length === 0) {
      return;
    }

    console.log(
      `📨 Encontradas ${tasks.length} tarefas pendentes. Processando uma a uma...`
    );

    for (const task of tasks) {
      const { ID, WHATS, TEXTO, ARQUIVO, ORDEM_ENVIO, ASSUNTO } = task;
      await dependencies.db.updateTaskStatus(ID, 'PROCESSANDO');

      const mensagensJaEnviadas =
        await dependencies.db.fetchSentMessagesForTask(ID);

      const phoneResult = normalizePhoneNumber(WHATS);

      if (!phoneResult.isValid) {
        await dependencies.db.updateTaskStatus(ID, 'ERRO', phoneResult.error);
        continue;
      }

      const chatId = phoneResult.number + '@c.us';

      // --- NOVA LÓGICA DE SEPARAÇÃO DE TEXTO E LINK ---
      const assuntoFormatado = formatWhatsAppMessage(
        (task.ASSUNTO || '').toString('utf-8')
      ).trim();
      const textoFormatado = formatWhatsAppMessage(
        (task.TEXTO || '').toString('utf-8')
      ).trim();

      // Expressão regular para encontrar e EXTRAIR o primeiro link
      const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/;
      const linkMatch = textoFormatado.match(urlRegex);

      let linkParaEnviar = null;
      let textoPrincipal = textoFormatado;

      if (linkMatch) {
        linkParaEnviar = linkMatch[0];
        // Remove o link do texto principal para enviá-lo separadamente
        textoPrincipal = textoFormatado.replace(linkParaEnviar, '').trim();
      }

      // Compõe a mensagem principal (agora sem o link)
      let textoParaEnviar =
        assuntoFormatado && textoPrincipal
          ? `*${assuntoFormatado}*\n\n${textoPrincipal}`
          : assuntoFormatado || textoPrincipal;

      const textoComEmojis = replaceShortcodesWithEmojis(textoParaEnviar);

      const listaDeArquivos = (ARQUIVO || '')
        .toString('utf-8')
        .trim()
        .split(',')
        .map((p) => p.trim().replace(/^"|"$/g, ''))
        .filter((p) => p);

      let erros = [];
      let sucessos = 0;

      // Guarda o texto original completo para a verificação de "já enviado"
      const conteudoOriginalCompleto = (
        (task.ASSUNTO || '') + (task.TEXTO || '')
      ).toString('utf-8');

      // --- NOVAS FUNÇÕES DE ENVIO SEPARADAS ---

      const enviarTextoPrincipal = async () => {
        if (!textoComEmojis.trim()) return; // Não envia se o texto principal ficou vazio

        // Verifica se o texto JÁ foi enviado
        const jaEnviou = mensagensJaEnviadas.some(
          (m) =>
            m.TIPO_MSG === 'TEXTO' &&
            m.CONTEUDO.toString('utf-8') === conteudoOriginalCompleto
        );
        if (jaEnviou) {
          sucessos++;
          return;
        }

        try {
          const textoFinalUnico = makeUniqueText(textoComEmojis);
          const msg = await dependencies.wa.sendMessageSafe(
            chatId,
            textoFinalUnico
          );
          await dependencies.db.registerSentMessage(
            ID,
            msg.id._serialized,
            'TEXTO',
            conteudoOriginalCompleto
          );
          sucessos++;
          const delay = getRandomDelay();
          console.log(
            `📤 Texto principal enviado (ID: ${ID}). Pausando por ${(
              delay / 1000
            ).toFixed(1)}s...`
          );
          await pause(delay);
        } catch (err) {
          erros.push(`Texto principal: ${err.message}`);
        }        
      };

      const enviarLinkSeparado = async () => {
        if (!linkParaEnviar) return;

        // A lógica de "já enviado" para o link pode ser mais simples
        // ou podemos assumir que se o texto foi enviado, o link também foi.

        try {
          // O link é enviado "puro", sem caracteres invisíveis para garantir o preview
          const msg = await dependencies.wa.sendMessageSafe(
            chatId,
            linkParaEnviar
          );
          await dependencies.db.registerSentMessage(
            ID,
            msg.id._serialized,
            'LINK',
            linkParaEnviar
          );
          sucessos++;
          const delay = getRandomDelay();
          console.log(
            `📤 Link enviado (ID: ${ID}). Pausando por ${(delay / 1000).toFixed(
              1
            )}s...`
          );
          await pause(delay);
        } catch (err) {
          erros.push(`Link: ${err.message}`);
        }
      };

      const enviarArquivos = async () => {
        if (listaDeArquivos.length === 0) return;
        for (const arquivoPath of listaDeArquivos) {
          const jaEnviouArquivo = mensagensJaEnviadas.some(
            (m) =>
              m.TIPO_MSG === 'ARQUIVO' &&
              m.CONTEUDO.toString('utf-8') === arquivoPath
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
            const media =
              dependencies.wa.MessageMedia.fromFilePath(tempFilePath);
            const msg = await dependencies.wa.sendMessageSafe(
              chatId,
              media
            );
            await dependencies.db.registerSentMessage(
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
            }
          }
        }
      };

      if (ORDEM_ENVIO === 1) {
        await enviarArquivos();
        await enviarTextoPrincipal();
        await enviarLinkSeparado();
      } else {
        await enviarTextoPrincipal();
        await enviarLinkSeparado();
        await enviarArquivos();
      }

      const totalOperacoes = (textoParaEnviar ? 1 : 0) + listaDeArquivos.length;
      if (erros.length === 0 && totalOperacoes > 0) {
        await dependencies.db.updateTaskStatus(ID, 'CONCLUIDO');
      } else if (sucessos > 0) {
        await dependencies.db.updateTaskStatus(
          ID,
          'ERRO_PARCIAL',
          erros.join('; ')
        );
      } else {
        await dependencies.db.updateTaskStatus(ID, 'ERRO', erros.join('; '));
      }
    }
    console.log(
      '✅ Processamento da fila concluído. Próxima verificação em 30s.'
    );
  } catch (err) {
    console.error(`❌ Erro fatal ao processar a TAREFA:`, err);
  } finally {
    isProcessingQueue = false; // Libera a trava no final
  }
}

function startQueueProcessing() {
  console.log('🚀 Iniciando verificação periódica da fila...');
  processQueue();
  setInterval(processQueue, 30000);
}

module.exports = { initQueueProcessor, startQueueProcessing };
