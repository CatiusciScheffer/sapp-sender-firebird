const Firebird = require('node-firebird');
let dbOptions;

function initDatabase() {
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
}

async function updateTaskStatus(id, status, observacao = '') {
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

async function registerSentMessage(idEnvio, msgId, tipo, conteudo) {
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

async function updateAckStatus(msgSerializedId, status) {
  const sql = `UPDATE WHATS_MENSAGENS SET STATUS_ACK = ? WHERE ID_MSG_WHATSAPP = ?`;
  const db = await new Promise((res, rej) =>
    Firebird.attach(dbOptions, (e, d) => (e ? rej(e) : res(d)))
  );
  await new Promise((res, rej) =>
    db.query(sql, [status, msgSerializedId], (e) => (e ? rej(e) : res()))
  );
  db.detach();
}

async function fetchPendingTasks() {
  const sql = `SELECT ID, WHATS, TEXTO, ARQUIVO, ORDEM_ENVIO, ASSUNTO FROM WHATS_ENVIADO WHERE SITUACAO_TAREFA = 'AGUARDANDO' ORDER BY ID`;
  const db = await new Promise((res, rej) =>
    Firebird.attach(dbOptions, (e, d) => (e ? rej(e) : res(d)))
  );
  const rows = await new Promise((res, rej) =>
    db.query(sql, (e, r) => (e ? rej(e) : res(r)))
  );
  db.detach();
  return rows;
}

async function fetchSentMessagesForTask(taskId) {
  const sql = `SELECT TIPO_MSG, CONTEUDO FROM WHATS_MENSAGENS WHERE ID_ENVIO = ?`;
  const db = await new Promise((res, rej) =>
    Firebird.attach(dbOptions, (e, d) => (e ? rej(e) : res(d)))
  );
  const rows = await new Promise((res, rej) =>
    db.query(sql, [taskId], (e, r) => (e ? rej(e) : res(r)))
  );
  db.detach();
  return rows;
}

module.exports = {
  initDatabase,
  dbOptions,
  updateTaskStatus,
  registerSentMessage,
  updateAckStatus,
  fetchPendingTasks,
  fetchSentMessagesForTask,
};
