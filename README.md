# Monitor WhatsApp

## 📦 Visão Geral

**Monitor WhatsApp** é um gateway de mensagens via WhatsApp construído para operar como um serviço backend robusto, assíncrono e confiável. Ele transforma um banco de dados Firebird em uma fila de envio de mensagens, permitindo que sistemas externos deleguem o envio com rastreamento completo e segurança contra falhas e duplicações.

## 🚀 Funcionalidades Principais

- **📩 Fila Assíncrona**: Tarefas são lidas da tabela `WHATS_ENVIADO` e processadas em segundo plano.
- **📊 Rastreamento de Mensagens**: Cada mensagem é registrada na tabela `WHATS_MENSAGENS`, com status de envio, entrega e visualização atualizados em tempo real.
- **🔁 Idempotência Garantida**: Reinicializações não resultam em reenvios duplicados.
- **🛡️ Técnicas Anti-Bloqueio**: Pausas aleatórias, textos únicos e arquivos com hash alterado reduzem o risco de bloqueios pelo WhatsApp.
- **🔐 Configuração via `.env`**: Torna o sistema portátil e seguro.

## ⚙️ Ciclo de Vida do Envio

1. **Criação da Tarefa**: Um sistema externo insere uma entrada em `WHATS_ENVIADO` com `SITUACAO_TAREFA = 'AGUARDANDO'`.
2. **Processamento**: A tarefa é marcada como `'PROCESSANDO'` evitando execução duplicada.
3. **Envio**: A função `sendMessageAndCapture` envia a mensagem e aguarda confirmação do evento `message_create` com timeout de 15s.
4. **Registro do Envio**: A mensagem enviada é registrada em `WHATS_MENSAGENS` com seu ID único.
5. **Confirmação de Entrega**: Eventos `message_ack` atualizam o status da mensagem para `ENTREGUE` ou `VISUALIZADO`.
6. **Finalização**: Tarefa é marcada como `CONCLUIDO`, `ERRO_PARCIAL` ou `ERRO`.

## 🧠 Arquitetura Interna

### Funções Principais

- `atualizarStatusTarefa(id, status, observacao)`Atualiza o status geral da tarefa no banco de dados.
- `registrarMensagemEnviada(idEnvio, msgId, tipo, conteudo)`Registra cada mensagem individual enviada para rastreamento.
- `updateAckStatus(msgSerializedId, status)`
  Atualiza o status da mensagem com base nos eventos de ACK recebidos do WhatsApp.

## 💡 Recursos Avançados

- **Idempotência**: Verificação prévia se a mensagem já foi enviada evita duplicações.
- **Texto Invisível**: Adiciona caracteres invisíveis para tornar textos "únicos".
- **Anexos Únicos**: Arquivos temporários com UUID modificam o hash do conteúdo.
- **Gerenciamento de Erros e Reconexão**:
  - `try...catch...finally` remove arquivos temporários mesmo com erro.
  - `setTimeout` previne travamentos em espera de eventos.
  - Reconexão automática ao detectar desconexão do cliente.

## 📁 Requisitos

- Node.js
- Banco Firebird configurado
- Arquivo `.env` com dados de conexão e parâmetros de envio

## 📌 Exemplo de `.env`

```env
DB_HOST=localhost
DB_PORT=3050
DB_USER=sysdba
DB_PASS=masterkey
PAUSA_MIN=1000
PAUSA_MAX=3000
```
