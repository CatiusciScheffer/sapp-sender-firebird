let MIN_SEND_DELAY_MS;
let MAX_SEND_DELAY_MS;

function initHelpers() {
  MIN_SEND_DELAY_MS = parseInt(process.env.MIN_SEND_DELAY_MS, 10) || 2000;
  MAX_SEND_DELAY_MS = parseInt(process.env.MAX_SEND_DELAY_MS, 10) || 5000;
}

function getRandomDelay() {
  // Garante que o mínimo não seja maior que o máximo, caso o .env seja configurado errado
  const min = Math.min(MIN_SEND_DELAY_MS, MAX_SEND_DELAY_MS);
  const max = Math.max(MIN_SEND_DELAY_MS, MAX_SEND_DELAY_MS);
  // Calcula um número aleatório entre min e max (inclusivo)
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  initHelpers,
  getRandomDelay,
  pause
}
