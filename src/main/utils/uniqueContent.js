const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

function makeUniqueText(originalText, length = 6) {
  if (!originalText) {
    return '';
  }

  const invisibleChars = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];

  const generateSuffix = () => {
    let suffix = '';
    for (let i = 0; i < length; i++) {
      suffix +=
        invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
    }
    return suffix;
  };

  const urlRegex = /(https?:\/\/|www\.)/g;
  const match = urlRegex.exec(originalText);

  // Cenário 1: Não há links no texto.
  if (!match) {
    return originalText + generateSuffix();
  }

  // Se um link foi encontrado, verificamos o número de palavras.
  const words = originalText.trim().split(/\s+/);

  // Cenário 2: O texto contém um link e também outras palavras.
  // A estratégia mais segura é inserir após a primeira palavra.
  if (words.length > 1) {
    words[0] = words[0] + generateSuffix();
    return words.join(' ');
  }

  // Cenário 3: O texto é APENAS o link.
  // A melhor estratégia é inserir os caracteres logo após 'https://' ou 'www.'
  if (words.length === 1) {
    const prefix = match[0]; // Será 'https://' ou 'www.'
    const restOfLink = originalText.substring(prefix.length);
    return prefix + generateSuffix() + restOfLink;
  }

  // Fallback para qualquer caso não previsto (embora improvável)
  return originalText + generateSuffix();
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

module.exports = {
  makeUniqueText,
  createUniqueFileCopy
};
