// Câmera orbital do editor de mapa, como a de jogos de construção: ela olha
// sempre pra um ponto no chão (o alvo) e gira em volta dele. Andar pelo mapa
// move o alvo; a roda do mouse muda a distância; o botão direito gira e
// inclina.
//
// Convenções:
//   yaw      — giro em volta do alvo; com 0 a câmera fica do lado +z, olhando pra −z;
//   pitch    — inclinação acima do horizonte (0 = de lado, π/2 = de cima);
//   distancia — do alvo até a câmera, em metros.
// Sem three.js: roda nos testes em Node.

export const LIMITES_ORBITA = {
  DIST_MIN: 3,
  DIST_MAX: 150,
  PITCH_MIN: 0.15,     // quase rente ao chão, sem atravessar
  PITCH_MAX: 1.55,     // quase vertical: a vista de cima
};

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/** Posição [x, y, z] da câmera. */
export function posicaoDaCamera({ alvo, yaw, pitch, distancia }) {
  const horizontal = distancia * Math.cos(pitch);
  return [
    alvo[0] + horizontal * Math.sin(yaw),
    alvo[1] + distancia * Math.sin(pitch),
    alvo[2] + horizontal * Math.cos(yaw),
  ];
}

/**
 * Direções no chão pra andar com o teclado, como pares [x, z]:
 * `frente` aponta da câmera pro alvo; `direita` é a direita da tela.
 */
export function direcoesNoChao(yaw) {
  return {
    frente: [-Math.sin(yaw), -Math.cos(yaw)],
    direita: [Math.cos(yaw), -Math.sin(yaw)],
  };
}

/** Distância depois de `passos` da roda (positivo afasta, negativo aproxima). */
export function aplicarZoom(distancia, passos, fator = 1.12) {
  return clamp(distancia * fator ** passos, LIMITES_ORBITA.DIST_MIN, LIMITES_ORBITA.DIST_MAX);
}

export function limitarInclinacao(pitch) {
  return clamp(pitch, LIMITES_ORBITA.PITCH_MIN, LIMITES_ORBITA.PITCH_MAX);
}
