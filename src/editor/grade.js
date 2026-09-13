// Grid e giro do editor de mapa: pra onde uma posição ou um ângulo "pula".
//
// Sem three.js: roda nos testes em Node.

/** Passos de grid oferecidos na barra, em metros. */
export const PASSOS_DE_GRADE = [0.25, 0.5, 1, 2];

/** Passos de giro oferecidos na barra, em graus. */
export const PASSOS_DE_GIRO = [90, 45, 15];

const DOIS_PI = Math.PI * 2;

// Arredonda o ruído de ponto flutuante (0,1 + 0,2) e evita o −0.
const limpo = v => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);

/** Valor mais próximo múltiplo do passo. */
export function ajustar(v, passo) {
  return limpo(Math.round(v / passo) * passo);
}

/** Ponto [x, y, z] com x e z no grid; a altura não muda. */
export function ajustarPonto([x, y, z], passo) {
  return [ajustar(x, passo), y, ajustar(z, passo)];
}

/**
 * Ângulo em [0, 2π). Sem arredondar casas (isso distorceria o ângulo): só a
 * volta completa e o quase-zero viram 0.
 */
export function normalizarAngulo(a) {
  const r = ((a % DOIS_PI) + DOIS_PI) % DOIS_PI;
  return r < 1e-9 || r > DOIS_PI - 1e-9 ? 0 : r;
}

/**
 * Gira um passo de `graus` no `sentido` (+1 ou −1), terminando num múltiplo
 * do passo — uma peça a 10° girada de 45° vai pra 45°, não pra 55°.
 */
export function girarPasso(rotY, graus, sentido = 1) {
  const passo = (graus * Math.PI) / 180;
  const atual = Math.round(normalizarAngulo(rotY) / passo);
  return normalizarAngulo((atual + sentido) * passo);
}

/** Centro das posições (média), pra copiar e mover um grupo junto. */
export function centroide(posicoes) {
  const soma = [0, 0, 0];
  for (const p of posicoes) for (let k = 0; k < 3; k++) soma[k] += p[k];
  return soma.map(s => limpo(s / Math.max(1, posicoes.length)));
}

/** Soma um deslocamento a uma posição. */
export function deslocar(posicao, [dx, dy, dz]) {
  return [limpo(posicao[0] + dx), limpo(posicao[1] + dy), limpo(posicao[2] + dz)];
}
