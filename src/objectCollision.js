// Colisão dos objetos do catálogo colocados na cena (móveis, veículos,
// árvores, pedras...).
//
// Regra automática (decisão de 13/09/2026):
//   - a pegada é medida só na FAIXA DO CORPO, de 0,1 m a 1,7 m acima da base
//     do objeto — árvore bloqueia pelo tronco, não pela copa;
//   - objeto com menos de 0,7 m de altura não bloqueia — grama, flores,
//     tapete e itens de bolso ficam atravessáveis;
//   - `colisao: true | false` no modelo força a decisão (vem do índice do
//     pacote, ver tools/gerar-indices-props.mjs).
// O colisor é um retângulo que gira junto com o objeto: uma caixa alinhada ao
// mapa faria um carro a 45° bloquear um quadrado bem maior que ele.
//
// Sem three.js: o World percorre os vértices e aplica o resultado.

export const FAIXA = { MIN: 0.1, MAX: 1.7, ALTURA_MINIMA: 0.7 };

/**
 * Pegada de um modelo no referencial dele (sem giro, base em y = 0).
 *
 * Medida por TRIÂNGULOS, não por vértices: o tronco de uma árvore costuma ser
 * um cilindro com vértices só no chão e no começo da copa, nenhum dentro da
 * faixa, e mesmo assim ocupa a faixa inteira. Por isso entram os vértices que
 * caem na faixa e os pontos onde cada aresta cruza y = MIN e y = MAX — o
 * recorte exato da malha pela faixa.
 *
 * @param {(cb: (ax: number, ay: number, az: number, bx: number, by: number, bz: number,
 *   cx: number, cy: number, cz: number) => void) => void} percorrer
 *   chama `cb` pra cada triângulo, já com a escala do objeto aplicada;
 * @param {{ colisao?: boolean }} [opcoes]
 * @returns {{ x0: number, x1: number, z0: number, z1: number, altura: number } | null}
 */
export function pegadaNaFaixa(percorrer, { colisao } = {}) {
  if (colisao === false) return null;
  let altura = -Infinity;
  const faixa = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const total = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const incluir = (r, x, z) => {
    if (x < r.x0) r.x0 = x;
    if (x > r.x1) r.x1 = x;
    if (z < r.z0) r.z0 = z;
    if (z > r.z1) r.z1 = z;
  };
  const cruzar = (h, x1, y1, z1, x2, y2, z2) => {
    if ((y1 - h) * (y2 - h) < 0) {
      const t = (h - y1) / (y2 - y1);
      incluir(faixa, x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
    }
  };
  const aresta = (x1, y1, z1, x2, y2, z2) => {
    if (y1 >= FAIXA.MIN && y1 <= FAIXA.MAX) incluir(faixa, x1, z1);
    cruzar(FAIXA.MIN, x1, y1, z1, x2, y2, z2);
    cruzar(FAIXA.MAX, x1, y1, z1, x2, y2, z2);
  };
  percorrer((ax, ay, az, bx, by, bz, cx, cy, cz) => {
    altura = Math.max(altura, ay, by, cy);
    incluir(total, ax, az);
    incluir(total, bx, bz);
    incluir(total, cx, cz);
    aresta(ax, ay, az, bx, by, bz);
    aresta(bx, by, bz, cx, cy, cz);
    aresta(cx, cy, cz, ax, ay, az);
  });
  if (altura === -Infinity) return null;

  const temFaixa = faixa.x0 <= faixa.x1;
  if (colisao === true) {
    // Forçado: usa a faixa se houver, senão a pegada inteira.
    return { ...(temFaixa ? faixa : total), altura };
  }
  if (!temFaixa || altura < FAIXA.ALTURA_MINIMA) return null;
  return { ...faixa, altura };
}

/**
 * Colisor de uma cópia colocada no mundo.
 * Giro como o rotation.y do three.js: local → mundo é
 *   x = lx·cos + lz·sen,  z = −lx·sen + lz·cos.
 */
export function colisorDoObjeto(pegada, { x, y, z, rotY = 0 }) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const lx = (pegada.x0 + pegada.x1) / 2;
  const lz = (pegada.z0 + pegada.z1) / 2;
  return {
    cx: x + lx * cos + lz * sin,
    cz: z - lx * sin + lz * cos,
    hx: (pegada.x1 - pegada.x0) / 2,
    hz: (pegada.z1 - pegada.z0) / 2,
    cos,
    sin,
    yMin: y + FAIXA.MIN,
    yMax: y + pegada.altura,
  };
}

/**
 * Empurra um corpo (círculo no plano, de `pos.y` até `pos.y + altura`) pra
 * fora do colisor. Muda `pos` e devolve se empurrou.
 */
export function empurrarParaFora(pos, raio, altura, s) {
  if (pos.y >= s.yMax || pos.y + altura <= s.yMin) return false;

  // Pro referencial do objeto (desfaz o giro).
  const dx = pos.x - s.cx;
  const dz = pos.z - s.cz;
  const lx = dx * s.cos - dz * s.sin;
  const lz = dx * s.sin + dz * s.cos;

  const px = Math.min(Math.max(lx, -s.hx), s.hx);
  const pz = Math.min(Math.max(lz, -s.hz), s.hz);
  const ex = lx - px;
  const ez = lz - pz;
  const d2 = ex * ex + ez * ez;
  if (d2 >= raio * raio) return false;

  let nx;
  let nz;
  let entrada;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    nx = ex / d;
    nz = ez / d;
    entrada = raio - d;
  } else {
    // Centro dentro do retângulo: sai pelo lado mais próximo.
    const folgaX = s.hx - Math.abs(lx);
    const folgaZ = s.hz - Math.abs(lz);
    if (folgaX < folgaZ) {
      nx = Math.sign(lx) || 1;
      nz = 0;
      entrada = folgaX + raio;
    } else {
      nx = 0;
      nz = Math.sign(lz) || 1;
      entrada = folgaZ + raio;
    }
  }

  // De volta pro mundo.
  pos.x += (nx * s.cos + nz * s.sin) * entrada;
  pos.z += (-nx * s.sin + nz * s.cos) * entrada;
  return true;
}
