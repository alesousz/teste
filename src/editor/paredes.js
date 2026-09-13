// Modos de parede do editor, como nos jogos de construção: paredes inteiras,
// cortadas (as do lado da câmera abaixam, pra ver dentro dos cômodos) ou
// baixas (todas abaixam). Só visual no editor — nada disso vai pra cena
// exportada — e só vale pras paredes do andar em que se está trabalhando.
//
// Sem three.js: roda nos testes em Node.

export const MODOS_PAREDE = ['inteiras', 'cortadas', 'baixas'];

/** Fração da altura com que uma parede rebaixada aparece. */
export const ESCALA_PAREDE_BAIXA = 0.12;

// Uma parede no modo cortado só abaixa se estiver pelo menos isto do lado da
// câmera: a parede que passa pelo alvo (o meio do cômodo) continua de pé.
const FOLGA_DO_CORTE = 0.5;

/** A peça é parede? (paredes do Building Kit: Wall, Wall_Corner, Wall_Doorway...) */
export function ehParede(typeId) {
  return /^wall/i.test(typeId);
}

/**
 * A parede deve aparecer rebaixada?
 *   posicao       — [x, y, z] da parede;
 *   andarDaParede — andar a que ela pertence; andarAtual — andar de trabalho;
 *   camera, alvo  — [x, y, z] da câmera e do ponto que ela olha.
 */
export function paredeRebaixada(modo, { posicao, andarDaParede, andarAtual, camera, alvo }) {
  if (modo === 'inteiras' || andarDaParede !== andarAtual) return false;
  if (modo === 'baixas') return true;
  // Cortadas: abaixa o que está do lado da câmera em relação ao alvo.
  const fx = camera[0] - alvo[0];
  const fz = camera[2] - alvo[2];
  const comprimento = Math.hypot(fx, fz);
  if (comprimento < 1e-6) return false;   // câmera bem em cima: nada fica "na frente"
  const ladoDaCamera = ((posicao[0] - alvo[0]) * fx + (posicao[2] - alvo[2]) * fz) / comprimento;
  return ladoDaCamera > FOLGA_DO_CORTE;
}
