// Texturas procedurais para os materiais do prédio.
//
// Geradas em canvas, sem nenhum arquivo externo — o projeto não tem pipeline
// de assets e o princípio é não depender de CDN. Cada superfície devolve um
// mapa de cor e um mapa de rugosidade: é a rugosidade variando que faz uma
// parede rebocada parar de parecer plástico sob iluminação por imagem.
//
// Tamanhos pequenos de propósito (256 px, repetidos): a variação que importa
// aqui é de alta frequência, e textura grande só gastaria memória de vídeo.

import * as THREE from 'three';

const LADO = 256;

function novaTela() {
  const c = document.createElement('canvas');
  c.width = c.height = LADO;
  return { c, ctx: c.getContext('2d') };
}

function comoTextura(canvas, repeticoes, ehCor) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeticoes, repeticoes);
  // Mapa de cor é sRGB; mapas de dado (rugosidade) são lineares. Trocar isso
  // deixa a rugosidade errada de um jeito difícil de perceber e fácil de
  // propagar.
  if (ehCor) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function ruido(ctx, quantidade, alpha, escala = 1) {
  for (let i = 0; i < quantidade; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    const s = 1 + Math.random() * escala;
    ctx.fillRect(Math.random() * LADO, Math.random() * LADO, s, s);
  }
}

// --- Reboco -----------------------------------------------------------------
function reboco(corBase) {
  const cor = novaTela();
  cor.ctx.fillStyle = corBase;
  cor.ctx.fillRect(0, 0, LADO, LADO);
  ruido(cor.ctx, 5000, 0.045, 2.5);

  const rug = novaTela();
  rug.ctx.fillStyle = '#d0d0d0';        // bem fosco
  rug.ctx.fillRect(0, 0, LADO, LADO);
  ruido(rug.ctx, 4000, 0.12, 3);
  return { cor: cor.c, rug: rug.c };
}

// --- Assoalho de tábuas -----------------------------------------------------
function assoalho() {
  const cor = novaTela();
  const { ctx } = cor;
  ctx.fillStyle = '#8a5a33';
  ctx.fillRect(0, 0, LADO, LADO);
  const tabua = LADO / 4;
  for (let i = 0; i < 4; i++) {
    const tom = 118 + Math.random() * 34;
    ctx.fillStyle = `rgb(${tom}, ${Math.floor(tom * 0.62)}, ${Math.floor(tom * 0.38)})`;
    ctx.fillRect(0, i * tabua, LADO, tabua - 1);
    // Veios
    for (let v = 0; v < 26; v++) {
      ctx.strokeStyle = `rgba(60,34,16,${0.05 + Math.random() * 0.09})`;
      ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath();
      const y = i * tabua + Math.random() * tabua;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(LADO / 3, y + (Math.random() - 0.5) * 5, (LADO * 2) / 3, y + (Math.random() - 0.5) * 5, LADO, y);
      ctx.stroke();
    }
    // Fresta entre tábuas
    ctx.fillStyle = 'rgba(30,16,8,0.55)';
    ctx.fillRect(0, i * tabua + tabua - 1.5, LADO, 1.5);
  }

  const rug = novaTela();
  rug.ctx.fillStyle = '#6e6e6e';        // verniz: bem menos fosco que reboco
  rug.ctx.fillRect(0, 0, LADO, LADO);
  for (let i = 0; i < 4; i++) {
    rug.ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.1})`;
    rug.ctx.fillRect(0, i * (LADO / 4), LADO, LADO / 4 - 1);
  }
  ruido(rug.ctx, 2500, 0.1, 2);
  return { cor: cor.c, rug: rug.c };
}

// --- Piso frio (ladrilho) ---------------------------------------------------
function ladrilho(corBase, corRejunte) {
  const cor = novaTela();
  const { ctx } = cor;
  ctx.fillStyle = corRejunte;
  ctx.fillRect(0, 0, LADO, LADO);
  const n = 2;
  const p = LADO / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = corBase;
      ctx.fillRect(i * p + 2, j * p + 2, p - 4, p - 4);
    }
  }
  ruido(ctx, 2200, 0.05, 2);

  const rug = novaTela();
  rug.ctx.fillStyle = '#565656';        // cerâmica reflete bastante
  rug.ctx.fillRect(0, 0, LADO, LADO);
  rug.ctx.fillStyle = '#c8c8c8';        // rejunte é fosco
  for (let i = 0; i <= n; i++) {
    rug.ctx.fillRect(i * p - 2, 0, 4, LADO);
    rug.ctx.fillRect(0, i * p - 2, LADO, 4);
  }
  return { cor: cor.c, rug: rug.c };
}

// --- Concreto ---------------------------------------------------------------
function concreto() {
  const cor = novaTela();
  cor.ctx.fillStyle = '#9a978f';
  cor.ctx.fillRect(0, 0, LADO, LADO);
  ruido(cor.ctx, 9000, 0.07, 3);
  const rug = novaTela();
  rug.ctx.fillStyle = '#c4c4c4';
  rug.ctx.fillRect(0, 0, LADO, LADO);
  ruido(rug.ctx, 6000, 0.16, 4);
  return { cor: cor.c, rug: rug.c };
}

/**
 * Monta os materiais texturizados do prédio. Uma chamada só, no boot: os
 * canvases são descartáveis, as texturas ficam.
 */
export function criarMateriaisTexturizados() {
  const fazer = (fonte, repeticoes, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({
      map: comoTextura(fonte.cor, repeticoes, true),
      roughnessMap: comoTextura(fonte.rug, repeticoes, false),
      roughness: 1, metalness: 0,
      ...extra,
    });
    return m;
  };

  // `repeat` fica em 1: quem faz a repetição é a UV da geometria, escalada
  // pelo tamanho real de cada peça (ver `caixa()` em building.js). Sem isso
  // uma parede de 16 m e outra de 1 m mostrariam o mesmo número de tijolos, em
  // escalas completamente diferentes.
  // `userData.tile` é o tamanho, em metros, que uma repetição da textura
  // representa no mundo.
  const comTile = (m, tile) => { m.userData.tile = tile; return m; };

  return {
    reboco: comTile(fazer(reboco('#d6d2c8'), 1), 2.0),
    rebocoExterno: comTile(fazer(reboco('#b9ae9c'), 1), 2.5),
    concreto: comTile(fazer(concreto(), 1), 2.0),
    pisoMadeira: comTile(fazer(assoalho(), 1), 1.6),
    pisoFrio: comTile(fazer(ladrilho('#bfc0bd', '#8e8f8c'), 1), 1.2),
    forro: comTile(fazer(reboco('#e8e6e0'), 1), 2.0),
  };
}
