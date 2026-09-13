// Chão da cidade: asfalto, calçadas, meio-fio, sinalização horizontal, piso
// tátil e o calçamento de pedra portuguesa da praça — desenhados a partir do
// traçado de data/streets.js.
//
// Texturas geradas em canvas com semente fixa (o chão sai igual em toda
// carga) e UV em metros do mundo: a textura continua de uma calçada pra
// outra sem emenda, e cada material diz quantos metros uma repetição cobre.

import * as THREE from 'three';
import { RUAS } from './data/streets.js';

// Alturas visuais. O jogador anda em y = 0: são só alguns milímetros pra
// cada camada aparecer por cima da de baixo.
const Y = {
  PINTURA: 0.004,
  PRACA: 0.02,     // mesma altura do terreno dos quarteirões
  CALCADA: 0.03,
  TATIL: 0.033,
};

// Metros por repetição de textura.
const TILE = {
  asfalto: 6,
  calcada: 2,
  pedra: 3.2,
  meioFio: 1,
  tatil: 0.25,
};

// --- Canvas -------------------------------------------------------------------

function gerador(semente) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function porPixel(lado, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(lado, lado);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * lado + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, ctx };
}

// Desenha repetindo nas bordas, pra mancha que cruza a borda continuar do
// outro lado e a textura emendar.
function repetindo(lado, desenhar) {
  for (const dx of [-lado, 0]) for (const dy of [-lado, 0]) desenhar(dx, dy);
}

function textura(canvas, ehCor) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (ehCor) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// --- Superfícies ----------------------------------------------------------------

function asfalto() {
  const L = 512;
  const rnd = gerador(11);
  const cor = porPixel(L, () => {
    const v = 50 + rnd() * 16 + (rnd() < 0.05 ? 22 : 0);   // pedrisco claro
    return [v, v + 1, v + 4];
  });
  // Remendos e manchas de óleo, bem sutis.
  for (let i = 0; i < 7; i++) {
    const x = rnd() * L, y = rnd() * L, w = 50 + rnd() * 140, h = 40 + rnd() * 100;
    const a = 0.06 + rnd() * 0.08;
    repetindo(L, (dx, dy) => {
      cor.ctx.fillStyle = `rgba(18,18,20,${a})`;
      cor.ctx.fillRect(x + dx + L, y + dy + L, w, h);
    });
  }
  for (let i = 0; i < 5; i++) {
    const x = rnd() * L, y = rnd() * L, raio = 12 + rnd() * 30;
    repetindo(L, (dx, dy) => {
      const g = cor.ctx.createRadialGradient(x + dx + L, y + dy + L, 0, x + dx + L, y + dy + L, raio);
      g.addColorStop(0, 'rgba(10,10,12,0.28)');
      g.addColorStop(1, 'rgba(10,10,12,0)');
      cor.ctx.fillStyle = g;
      cor.ctx.fillRect(x + dx + L - raio, y + dy + L - raio, raio * 2, raio * 2);
    });
  }
  const rug = porPixel(256, () => {
    const v = 205 + rnd() * 40;
    return [v, v, v];
  });
  return { cor: cor.c, rug: rug.c };
}

function concretoCalcada() {
  const L = 512;                      // 2 m: quatro placas de 1 m
  const rnd = gerador(23);
  const tons = [0, 1, 2, 3].map(() => (rnd() - 0.5) * 16);
  const cor = porPixel(L, (x, y) => {
    const placa = (x < L / 2 ? 0 : 1) + (y < L / 2 ? 0 : 2);
    const v = 172 + tons[placa] + (rnd() - 0.5) * 18;
    return [v, v - 4, v - 11];
  });
  for (let i = 0; i < 6; i++) {
    const x = rnd() * L, y = rnd() * L, raio = 20 + rnd() * 50;
    repetindo(L, (dx, dy) => {
      const g = cor.ctx.createRadialGradient(x + dx + L, y + dy + L, 0, x + dx + L, y + dy + L, raio);
      g.addColorStop(0, 'rgba(70,64,55,0.16)');
      g.addColorStop(1, 'rgba(70,64,55,0)');
      cor.ctx.fillStyle = g;
      cor.ctx.fillRect(x + dx + L - raio, y + dy + L - raio, raio * 2, raio * 2);
    });
  }
  // Juntas de dilatação entre as placas.
  cor.ctx.fillStyle = 'rgba(58,54,48,0.6)';
  for (const p of [0, L / 2]) {
    cor.ctx.fillRect(p, 0, 2, L);
    cor.ctx.fillRect(0, p, L, 2);
  }
  cor.ctx.fillRect(L - 1, 0, 1, L);
  cor.ctx.fillRect(0, L - 1, L, 1);

  const rug = porPixel(256, (x, y) => {
    const junta = x % 128 < 1 || y % 128 < 1;
    const v = junta ? 245 : 200 + rnd() * 40;
    return [v, v, v];
  });
  return { cor: cor.c, rug: rug.c };
}

// Pedra portuguesa em ondas preta e branca, o desenho do calçadão de
// Copacabana: pedrinhas de ~5 cm assentadas com rejunte, faixas onduladas.
function pedraPortuguesa() {
  const L = 512;                      // 3,2 m
  const C = 8;                        // pedra de 5 cm
  const n = L / C;
  const rnd = gerador(37);
  const tom = Array.from({ length: n * n }, () => rnd());
  const cor = porPixel(L, (x, y) => {
    const cx = Math.floor(x / C), cy = Math.floor(y / C);
    const bx = x % C, by = y % C;
    const t = tom[cy * n + cx];
    // Rejunte com quinas quebradas, pra pedra não parecer ladrilho.
    if (bx === 0 || by === 0 || (bx < 2 && by < 2) || (t > 0.8 && bx === C - 1 && by > 4)) return [128, 121, 110];
    const u = (cx + 0.5) / n, v = (cy + 0.5) / n;
    const onda = v + 0.1 * Math.sin(2 * Math.PI * u);
    const preta = ((onda * 2) % 1 + 1) % 1 < 0.5;
    const b = (preta ? 46 + t * 24 : 224 - t * 30) + (rnd() - 0.5) * 12;
    return preta ? [b, b, b + 3] : [b, b - 4, b - 12];
  });
  const rug = porPixel(L, (x, y) => {
    const rejunte = x % C === 0 || y % C === 0;
    const v = rejunte ? 235 : 150 + rnd() * 50;    // pedra gasta de pisada é mais lisa
    return [v, v, v];
  });
  return { cor: cor.c, rug: rug.c };
}

function concretoMeioFio() {
  const rnd = gerador(41);
  const cor = porPixel(256, () => {
    const v = 188 + (rnd() - 0.5) * 22;
    return [v, v - 3, v - 9];
  });
  const rug = porPixel(128, () => {
    const v = 200 + rnd() * 45;
    return [v, v, v];
  });
  return { cor: cor.c, rug: rug.c };
}

// Piso tátil de concreto amarelo. Direcional: barras ao longo da direção de
// caminhada (eixo u). Alerta: pastilhas em grade.
function tatil(alerta) {
  const L = 128;                      // 25 cm
  const rnd = gerador(alerta ? 53 : 47);
  const cor = porPixel(L, (x, y) => {
    let luz = 0;
    if (alerta) {
      const px = (x % 32) - 16, py = (y % 32) - 16;
      const d = Math.hypot(px, py);
      if (d < 9) luz = (-px - py) / 9 * 26;           // pastilha iluminada de cima à esquerda
    } else {
      const py = (y % 32) - 16;
      if (Math.abs(py) < 7) luz = -py / 7 * 24;
    }
    const v = (rnd() - 0.5) * 14 + luz;
    return [206 + v, 160 + v, 48 + v * 0.5];
  });
  const rug = porPixel(64, () => {
    const v = 190 + rnd() * 50;
    return [v, v, v];
  });
  return { cor: cor.c, rug: rug.c };
}

function materialTexturizado(fonte, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: textura(fonte.cor, true),
    roughnessMap: textura(fonte.rug, false),
    roughness: 1,
    metalness: 0,
    ...extra,
  });
}

// Pintura e piso tátil ficam a milímetros da superfície de baixo: o offset
// de polígono evita que briguem pela profundidade de longe.
const SOBREPOR = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

let materiais = null;
function materiaisDaRua() {
  if (materiais) return materiais;
  materiais = {
    calcada: materialTexturizado(concretoCalcada()),
    pedra: materialTexturizado(pedraPortuguesa()),
    meioFio: materialTexturizado(concretoMeioFio()),
    tatilDirecional: materialTexturizado(tatil(false), SOBREPOR),
    tatilAlerta: materialTexturizado(tatil(true), SOBREPOR),
    tintaBranca: new THREE.MeshStandardMaterial({ color: 0xe4e1d8, roughness: 0.72, metalness: 0, ...SOBREPOR }),
    tintaAmarela: new THREE.MeshStandardMaterial({ color: 0xe0ae36, roughness: 0.7, metalness: 0, ...SOBREPOR }),
  };
  return materiais;
}

// --- Geometria ------------------------------------------------------------------

function geometria(pos, nor, uv, idx) {
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Retângulos horizontais viradas pra cima, numa geometria só. `girado(r)`
// troca os eixos da UV (piso direcional correndo ao longo de z).
function planos(rets, y, tile, girado = () => false) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const r of rets) {
    const i = pos.length / 3;
    const g = girado(r);
    for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) {
      pos.push(x, y, z);
      nor.push(0, 1, 0);
      uv.push((g ? z : x) / tile, (g ? x : z) / tile);
    }
    idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  }
  return geometria(pos, nor, uv, idx);
}

// Faces verticais (a borda do meio-fio que dá pra pista).
function paredes(faces, y0, y1, tile) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const f of faces) {
    const i = pos.length / 3;
    const comp = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
    const cantos = [[f.x0, y0, f.z0, 0], [f.x1, y0, f.z1, comp], [f.x1, y1, f.z1, comp], [f.x0, y1, f.z0, 0]];
    for (const [x, y, z, s] of cantos) {
      pos.push(x, y, z);
      nor.push(f.nx, 0, f.nz);
      uv.push(s / tile, y / tile);
    }
    // Ordem dos vértices conforme o lado pra onde a face aponta.
    const ex = f.x1 - f.x0, ez = f.z1 - f.z0;
    const normalDaOrdem = { x: -ez * (y1 - y0), z: ex * (y1 - y0) };   // (a1-a0) × (a3-a0) no plano
    if (normalDaOrdem.x * f.nx + normalDaOrdem.z * f.nz >= 0) idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    else idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  }
  return geometria(pos, nor, uv, idx);
}

// --- API ------------------------------------------------------------------------

/** Plano de asfalto sob a cidade inteira. */
export function criarAsfalto(tamanho) {
  const fonte = asfalto();
  const mapa = textura(fonte.cor, true);
  const rug = textura(fonte.rug, false);
  const repeticoes = tamanho / TILE.asfalto;
  mapa.repeat.set(repeticoes, repeticoes);
  rug.repeat.set(repeticoes, repeticoes);
  const chao = new THREE.Mesh(
    new THREE.PlaneGeometry(tamanho, tamanho),
    new THREE.MeshStandardMaterial({ map: mapa, roughnessMap: rug, roughness: 1, metalness: 0 }),
  );
  chao.name = 'asfalto';
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  return chao;
}

/** Calçadas, meio-fio, praça, piso tátil e pintura, num grupo só. */
export function criarChaoDaRua() {
  const M = materiaisDaRua();
  const grupo = new THREE.Group();
  grupo.name = 'chao-da-rua';
  const pôr = (geo, mat, nome) => {
    if (!geo) return;
    const malha = new THREE.Mesh(geo, mat);
    malha.name = nome;
    malha.receiveShadow = true;
    grupo.add(malha);
  };

  pôr(planos(RUAS.calcadas.filter(c => c.piso === 'concreto'), Y.CALCADA, TILE.calcada), M.calcada, 'calcadas');
  pôr(planos(RUAS.calcadas.filter(c => c.piso === 'pedra'), Y.CALCADA, TILE.pedra), M.pedra, 'calcadas-pedra');
  pôr(planos(RUAS.pracas, Y.PRACA, TILE.pedra), M.pedra, 'praca');
  pôr(planos(RUAS.meioFio, Y.CALCADA, TILE.meioFio), M.meioFio, 'meio-fio');
  pôr(paredes(RUAS.faces, 0, Y.CALCADA, TILE.meioFio), M.meioFio, 'meio-fio-faces');
  pôr(planos(RUAS.tatilDirecional, Y.TATIL, TILE.tatil, r => r.aoLongo === 'z'), M.tatilDirecional, 'piso-tatil');
  pôr(planos(RUAS.tatilAlerta, Y.TATIL, TILE.tatil), M.tatilAlerta, 'piso-alerta');
  pôr(planos([...RUAS.faixasPedestre.flatMap(f => f.barras), ...RUAS.retencao], Y.PINTURA, 1), M.tintaBranca, 'faixas');
  pôr(planos(RUAS.eixoAmarelo, Y.PINTURA, 1), M.tintaAmarela, 'eixo');
  return grupo;
}
