const path = require('path');
const fs = require('fs');
const { getRandomDelay, pause } = require('./utils/helpers');
const { makeUniqueText, createUniqueFileCopy } = require('./utils/uniqueContent');


const dependencies = {
  db: null,
  wa: null
};

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

    const client = dependencies.wa.getClient(); 

    for (const task of tasks) {
      const { ID, WHATS, TEXTO, ARQUIVO, ORDEM_ENVIO, ASSUNTO } = task;
      await dependencies.db.updateTaskStatus(ID, 'PROCESSANDO');

      const mensagensJaEnviadas = await dependencies.db.fetchSentMessagesForTask(ID);

      let numeroLimpo = (WHATS || '').toString().trim().replace(/\D/g, '');
      if (numeroLimpo && !numeroLimpo.startsWith('55'))
        numeroLimpo = '55' + numeroLimpo;
      if (numeroLimpo.length === 13) {
        const ddd = numeroLimpo.substring(2, 4);
        const numeroSemNonoDigito = numeroLimpo.substring(5);
        numeroLimpo = `55${ddd}${numeroSemNonoDigito}`;
        console.log(
          `[INFO] Nono dígito removido para normalização: ${WHATS} -> ${numeroLimpo}`
        );
      }

      if (!numeroLimpo || numeroLimpo.length !== 12) {
        await dependencies.db.updateTaskStatus(
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
          const textoFinalUnico = makeUniqueText(textoParaEnviar);
          const msg = await dependencies.wa.sendMessageAndCapture(chatId, textoFinalUnico);
          await dependencies.db.registerSentMessage(
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
            const media = dependencies.wa.MessageMedia.fromFilePath(tempFilePath);
            const msg = await dependencies.wa.sendMessageAndCapture(chatId, media);
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
        await enviarTexto();
      } else {
        await enviarTexto();
        await enviarArquivos();
      }

      const totalOperacoes = (textoParaEnviar ? 1 : 0) + listaDeArquivos.length;
      if (erros.length === 0 && totalOperacoes > 0) {
        await dependencies.db.updateTaskStatus(ID, 'CONCLUIDO');
      } else if (sucessos > 0) {
        await dependencies.db.updateTaskStatus(ID, 'ERRO_PARCIAL', erros.join('; '));
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
  // Roda uma vez imediatamente, depois a cada 30 segundos
  processQueue();
  setInterval(processQueue, 30000);
}

module.exports = { initQueueProcessor, startQueueProcessing };
