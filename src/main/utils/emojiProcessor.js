const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Mapa que será preenchido com os dados do JSON
let shortcodeToEmojiMap = new Map();

/**
 * Carrega e processa o arquivo emoji.json, criando os mapas necessários.
 * Esta função deve ser chamada uma única vez na inicialização da aplicação.
 */
function initializeEmojiMap() {
  console.log('🔄 Inicializando mapa de emojis...');
  try {
    
    const jsonPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'emoji.json')
      : path.join(app.getAppPath(), 'assets', 'emoji.json');

    console.log(`[DEBUG] Procurando emoji.json em: ${jsonPath}`);

    if (!fs.existsSync(jsonPath)) {
      console.error(
        '❌ Arquivo emoji.json não encontrado. A substituição de emojis estará desativada.'
      );
      return;
    }

    const emojiData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    for (const emojiInfo of emojiData) {
      // O emoji.json tem um array de 'aliases' (shortcodes) para cada emoji
      if (emojiInfo.aliases && emojiInfo.emoji) {
        for (const alias of emojiInfo.aliases) {
          const shortcode = `:${alias}:`;
          shortcodeToEmojiMap.set(shortcode, emojiInfo.emoji);
        }
      }
    }
    console.log(
      `✅ Mapa de emojis inicializado com ${shortcodeToEmojiMap.size} shortcodes.`
    );
  } catch (error) {
    console.error('❌ Erro ao inicializar o mapa de emojis:', error);
  }
}

/**
 * Substitui os shortcodes de emoji (ex: :smile:) em uma string pelo emoji real.
 * @param {string} text O texto contendo os shortcodes.
 * @returns {string} O texto com os emojis substituídos.
 */
function replaceShortcodesWithEmojis(text) {
  if (!text || shortcodeToEmojiMap.size === 0) {
    return text;
  }

  // Usa uma expressão regular para encontrar todos os padrões :shortcode:
  // A flag 'g' garante que todas as ocorrências sejam substituídas.
  const shortcodeRegex = /:([a-zA-Z0-9_+-]+):/g;

  return text.replace(shortcodeRegex, (match, shortcodeName) => {
    // 'match' é o texto completo encontrado (ex: ':smile:')
    // 'shortcodeName' é apenas o nome dentro dos dois pontos (ex: 'smile')

    // O shortcode no mapa já inclui os dois pontos
    return shortcodeToEmojiMap.get(match) || match;
  });
}

module.exports = {
  initializeEmojiMap,
  replaceShortcodesWithEmojis,
};
