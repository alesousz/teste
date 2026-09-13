// Pisos e escadas de kit de construção colocados pelo editor: superfícies que
// sustentam o jogador e limitam o pulo.
//
// Mesmas regras do prédio inicial (src/interior.js), pra que andar num prédio
// do kit tenha a mesma sensação:
//   - um piso sustenta quem está até PASSO abaixo do topo dele — é o que
//     impede quem está no térreo de ser "puxado" pro andar de cima;
//   - a escada é uma rampa contínua do chão até o topo;
//   - a face de baixo de um piso é teto pra quem está embaixo.
// O editor só gira em passos de 90°, então os retângulos continuam alinhados
// aos eixos do mundo.
//
// Sem three.js: o World mede a caixa do modelo e passa pra cá.

import { raioContraLimites } from './objectCollision.js';

export const PASSO = 0.6;           // igual ao STEP_UP do interior
const FOLGA_DE_CABECA = 0.5;         // igual ao interior: teto só acima disso

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/**
 * Caixa local {x0,x1,z0,z1} de um objeto girado `rotY` e colocado em (x, z)
 * → retângulo no mundo. Pra giros fora de 90° devolve a caixa que envolve.
 */
export function retanguloNoMundo(local, { x, z, rotY = 0 }) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const cantos = [[local.x0, local.z0], [local.x1, local.z0], [local.x0, local.z1], [local.x1, local.z1]]
    .map(([lx, lz]) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos]);
  return {
    minX: Math.min(...cantos.map(c => c[0])),
    maxX: Math.max(...cantos.map(c => c[0])),
    minZ: Math.min(...cantos.map(c => c[1])),
    maxZ: Math.max(...cantos.map(c => c[1])),
  };
}

/** Piso: o topo da caixa sustenta, a base é teto pra quem está embaixo. */
export function pisoDoKit(caixa, onde) {
  return {
    tipo: 'piso',
    ...retanguloNoMundo(caixa, onde),
    y: onde.y + caixa.y1,
    yBase: onde.y + caixa.y0,
  };
}

/**
 * Escada: rampa do chão (y0) ao topo (y1), subindo no sentido +z LOCAL do
 * modelo (é assim que as escadas do Building Kit da Kenney vêm). O giro
 * decide pra que lado do mundo ela sobe.
 */
export function escadaDoKit(caixa, onde) {
  const rotY = onde.rotY ?? 0;
  // `zTopo`: onde, em z local, a escada chega no alto. Algumas escadas têm
  // patamar plano depois disso (a Stairs_Sides vai de z −2 a 4 e chega no
  // topo em 2); sem ele a rampa ficaria esticada até o fim da peça.
  const fracaoRampa = caixa.zTopo === undefined
    ? 1
    : clamp((caixa.zTopo - caixa.z0) / (caixa.z1 - caixa.z0), 0.05, 1);
  // +z local no mundo: (sen, cos).
  const sobeX = Math.sin(rotY);
  const sobeZ = Math.cos(rotY);
  const aoLongoDeX = Math.abs(sobeX) > Math.abs(sobeZ);
  return {
    tipo: 'escada',
    ...retanguloNoMundo(caixa, onde),
    eixo: aoLongoDeX ? 'x' : 'z',
    sentido: Math.sign(aoLongoDeX ? sobeX : sobeZ) || 1,
    yLow: onde.y + caixa.y0,
    yHigh: onde.y + caixa.y1,
    fracaoRampa,
  };
}

const dentro = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

export function alturaDaEscada(e, x, z) {
  const [lo, hi, v] = e.eixo === 'x' ? [e.minX, e.maxX, x] : [e.minZ, e.maxZ, z];
  let t = clamp((v - lo) / (hi - lo), 0, 1);
  if (e.sentido < 0) t = 1 - t;
  t = clamp(t / (e.fracaoRampa ?? 1), 0, 1);   // depois do topo, patamar
  return e.yLow + t * (e.yHigh - e.yLow);
}

/** Maior apoio ao alcance do passo, ou -Infinity se nenhuma superfície serve. */
export function apoioEm(superficies, x, z, pesY, tol = PASSO) {
  let melhor = -Infinity;
  const limite = pesY + tol;
  for (const s of superficies) {
    if (!dentro(s, x, z)) continue;
    const y = s.tipo === 'escada' ? alturaDaEscada(s, x, z) : s.y;
    if (y <= limite && y > melhor) melhor = y;
  }
  return melhor;
}

/** Raio contra a laje de um piso — a câmera não atravessa o piso de cima. */
export function raioContraPiso(o, d, piso) {
  return raioContraLimites(
    [o.x, o.y, o.z],
    [d.x, d.y, d.z],
    [piso.minX, piso.yBase, piso.minZ],
    [piso.maxX, piso.y, piso.maxZ],
  );
}

/** Base do piso mais baixo acima da cabeça, ou Infinity. */
export function tetoEm(superficies, x, z, pesY) {
  let menor = Infinity;
  const minimo = pesY + FOLGA_DE_CABECA;
  for (const s of superficies) {
    if (s.tipo !== 'piso' || !dentro(s, x, z)) continue;
    if (s.yBase > minimo && s.yBase < menor) menor = s.yBase;
  }
  return menor;
}
