/**
 * Normaliza um número de telefone brasileiro para o formato esperado pelo WhatsApp.
 * - Remove caracteres não numéricos.
 * - Garante o prefixo de país '55'.
 * - Remove o nono dígito de celulares para padronizar.
 * @param {string} originalNumber - O número de telefone original (ex: '51 9 8888-8888').
 * @returns {{isValid: boolean, number: string, error: string|null}} 
 *          Um objeto contendo o resultado da normalização.
 */

function normalizePhoneNumber(originalNumber) {
  if (!originalNumber || typeof originalNumber !== 'string') {
    return { isValid: false, number: '', error: 'Número original é nulo ou inválido.' };
  }

  let numeroLimpo = originalNumber.toString().trim().replace(/\D/g, '');

  // Garante que o número tem o prefixo do país
  if (numeroLimpo && !numeroLimpo.startsWith('55')) {
    numeroLimpo = '55' + numeroLimpo;
  }

  // Remove o nono dígito se presente (número com 13 caracteres: 55 + 9 + 8 dígitos)
  if (numeroLimpo.length === 13) {
    const ddd = numeroLimpo.substring(2, 4);
    const numeroSemNonoDigito = numeroLimpo.substring(5);
    numeroLimpo = `55${ddd}${numeroSemNonoDigito}`;
    console.log(`[INFO] Nono dígito removido para normalização: ${originalNumber} -> ${numeroLimpo}`);
  }

  // A validação final agora checa por exatamente 12 caracteres (55 + 8 dígitos)
  if (numeroLimpo.length !== 12) {
    return { 
      isValid: false, 
      number: numeroLimpo, 
      error: `Número inválido ou fora do padrão após normalização: ${numeroLimpo}` 
    };
  }

  return { isValid: true, number: numeroLimpo, error: null };
}

/**
 * Formata o texto vindo do banco de dados para ser compatível com o WhatsApp.
 * - Substitui o caractere customizado de quebra de linha (¶) por '\n'.
 * - Reforça quebras de linha duplas para evitar que o WhatsApp as junte.
 * @param {string} rawText - O texto bruto vindo do banco de dados.
 * @returns {string} O texto formatado pronto para envio.
 */
function formatWhatsAppMessage(rawText) {
  if (!rawText) {
    return '';
  }

  // Caractere invisível que usaremos para "ancorar" as quebras de linha duplas.
  const zeroWidthSpace = '\u200B';
  
  // Converte o buffer/dado do banco para uma string. 'latin1' é seguro.
  const textAsString = rawText.toString('latin1'); 

  // Executa as substituições em cadeia.
  // 1. **A PARTE MAIS IMPORTANTE:** Substitui todos os '¶' por '\n'.
  return textAsString
    .replace(/¶/g, '\n')
    // 2. (Opcional, mas recomendado) Mantém a regra para quebras de linha padrão como segurança.
    .replace(/\r\n?/g, '\n')
    // 3. (Opcional, mas recomendado) Reforça as quebras de parágrafo.
    .replace(/(\n){2,}/g, `\n${zeroWidthSpace}\n`);
}

module.exports = {
  normalizePhoneNumber,
  formatWhatsAppMessage 
};