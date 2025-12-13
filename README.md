# 📲 SAPP Sender Firebird

> **Serviço de envio de mensagens WhatsApp a partir de uma fila em banco Firebird** , com processamento assíncrono, controle de status e foco em integração com sistemas legados.

Este projeto foi desenvolvido para resolver um problema comum em ERPs e sistemas corporativos:  **enviar mensagens de WhatsApp de forma confiável, desacoplada e rastreável** , utilizando uma base Firebird como fila de mensagens.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green) ![Firebird](https://img.shields.io/badge/Firebird-2.5%2B-red) ![Backend](https://img.shields.io/badge/Backend-Service-blue) ![ERP](https://img.shields.io/badge/ERP-Integration-purple) ![License](https://img.shields.io/badge/License-MIT-blue) ![Architecture](https://img.shields.io/badge/Architecture-Queue--Based-orange) ![Async](https://img.shields.io/badge/Processing-Asynchronous-success) ![Legacy](https://img.shields.io/badge/Legacy%20Systems-Compatible-lightgrey)

**🔎 Palavras-chave**

Node.js · Firebird · Backend · Integração ERP · WhatsApp API · Processamento Assíncrono · Fila de Mensagens · Sistemas Legados · SQL · Automação · Serviços Backend · Enterprise Software

📍 **Tags do repositório**

nodejs firebird backend erp whatsapp integration queue asynchronous legacy-systems sql automation

---

## 🎯 Objetivo do Projeto

Permitir que qualquer sistema (ERP, backend, serviço externo) **registre mensagens no banco Firebird** e deixe que um serviço Node.js seja responsável por:

* Buscar mensagens pendentes
* Enviar via WhatsApp
* Atualizar status, tentativas e erros
* Evitar bloqueios e duplicidade

O foco é  **robustez, simplicidade e integração com sistemas legados** .

---

## 📌 Escopo do Projeto

Este projeto **não tem como objetivo substituir plataformas completas de atendimento**, mas sim:

- Servir como **serviço backend de envio**
- Integrar sistemas legados ao WhatsApp
- Garantir confiabilidade e rastreabilidade

---

## 🧠 Principais Diferenciais

* ✅ Integração direta com **Firebird** (sem necessidade de brokers externos)
* ✅ Processamento **assíncrono** em fila
* ✅ Controle de status e tentativas de envio
* ✅ Evita bloqueio do sistema principal
* ✅ Ideal para ERPs, sistemas logísticos e financeiros
* ✅ Código organizado e fácil de manter

---

## 🏗️ Arquitetura Geral

```
Sistema Externo
     │
     │ INSERT mensagem
     ▼
Banco Firebird (Fila)
     │
     │ Leitura periódica
     ▼
Node.js (sapp-sender)
     │
     │ Envio WhatsApp
     ▼
Atualização de Status no Banco
```

O banco Firebird atua como  **fila persistente** , garantindo que nenhuma mensagem seja perdida.

---

## ⚙️ Tecnologias Utilizadas

* **Node.js**
* **Firebird SQL**
* **dotenv** (configurações de ambiente)
* **WhatsApp API / biblioteca de envio**

---

## 📦 Requisitos

* Node.js 18+
* Firebird 2.5 ou superior
* Banco de dados com tabela de fila configurada
* Conexão válida com serviço de WhatsApp

---

## 🚀 Instalação

Clone o repositório:

```bash
git clone https://github.com/CatiusciScheffer/sapp-sender-firebird.git
cd sapp-sender-firebird
```

Instale as dependências:

```bash
npm install
```

---

## 🔐 Configuração (.env)

Crie um arquivo `.env` na raiz do projeto:

```env
# Banco Firebird
DB_HOST=localhost
DB_PORT=3050
DB_DATABASE=/caminho/banco.fdb
DB_USER=SYSDBA
DB_PASSWORD=masterkey

# Configurações do serviço
INTERVAL_MS=5000
MAX_TENTATIVAS=3

# WhatsApp
WHATSAPP_SESSION=sapp-session
```

---

## ✨Funcionalidades Principais

- **📩 Fila Assíncrona**: Tarefas são lidas da tabela `WHATS_ENVIADO` e processadas em segundo plano.
- **📊 Rastreamento de Mensagens**: Cada mensagem é registrada na tabela `WHATS_MENSAGENS`, com status de envio, entrega e visualização atualizados em tempo real.
- **🔁 Idempotência Garantida**: Reinicializações não resultam em reenvios duplicados.
- **🛡️ Técnicas Anti-Bloqueio**: Pausas aleatórias, textos únicos e arquivos com hash alterado reduzem o risco de bloqueios pelo WhatsApp.
- **🔐 Configuração via `.env`**: Torna o sistema portátil e seguro.

---

## ▶️ Execução

Para iniciar o serviço:

```bash
node index.js
```

O serviço irá:

1. Conectar ao Firebird
2. Buscar mensagens pendentes
3. Enviar via WhatsApp
4. Atualizar status e tentativas
5. Repetir o ciclo conforme o intervalo configurado

---

## 📊 Controle de Status (Exemplo)

Estados comuns da mensagem:

* `P` – Pendente
* `E` – Enviada
* `F` – Falha

Campos típicos controlados:

* Status
* Data/Hora de envio
* Quantidade de tentativas
* Mensagem de erro (quando houver)

---

## 🧪 Casos de Uso

* 📦 ERPs que precisam notificar clientes
* 🚚 Sistemas de logística e transporte
* 💰 Cobrança e notificações financeiras
* 📢 Alertas automáticos e transacionais

---

## 🛠️ Boas Práticas Aplicadas

* Separação de responsabilidades
* Configuração por variáveis de ambiente
* Código legível e organizado
* Tratamento de erros e falhas
* Evita processamento síncrono no sistema principal

---

## 🤝 Contribuições

Contribuições são bem-vindas!

1. Fork o projeto
2. Crie uma branch (`feature/minha-feature`)
3. Commit com mensagem clara
4. Abra um Pull Request

---

## 👩‍💻 Autora

**Catiusci Scheffer**
🎓 Cientista da Computação
💼 Desenvolvedora de Sistemas

* GitHub: [https://github.com/CatiusciScheffer](https://github.com/CatiusciScheffer)
* LinkedIn: [Catiusci Pagnonceli Chaves Scheffer | LinkedIn](https://www.linkedin.com/in/catiuscipagnonceli-cienciasdacomputacao/)
* Email: [cpcscheffer@outlook.com]()

---

## 📄 Licença

Este projeto está sob a licença MIT.
Sinta-se livre para usar, modificar e distribuir.

---

⭐ Se este projeto te ajudou ou chamou atenção, deixe uma estrela no repositório!
