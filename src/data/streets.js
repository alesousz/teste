// Traçado das ruas: calçadas, meio-fio, sinalização horizontal e piso tátil,
// derivados do grid da cidade (CONFIG + CITY).
//
// Dado PURO — sem three.js e sem aleatoriedade — pra que o teste confira o
// traçado inteiro e o render só desenhe retângulos. Tudo em coordenadas de
// mundo, no plano x/z.
//
// O perfil segue uma rua local brasileira de mão dupla: os 10 m entre
// quarteirões viram 2 m de calçada de cada lado e 6 m de pista, com linha
// amarela tracejada no eixo, faixa de pedestre zebrada e linha de retenção em
// cada chegada de cruzamento, do lado direito de quem chega. Calçada e
// meio-fio são só visuais (decisão de 13/09/2026): o piso do jogador continua
// em y = 0 na cidade inteira.
//
// Convenção interna: cada via tem um `eixo` ('z' = corre ao longo de z, na
// posição x = r; 'x' = corre ao longo de x, em z = r). `s` é a coordenada ao
// longo da via e `t` a coordenada atravessada.

import { CONFIG, CITY } from '../data.js';

export const PERFIL = {
  CALCADA: 2.0,             // largura de cada calçada
  MEIO_FIO: 0.15,           // faixa de concreto na borda da calçada
  TATIL: 0.25,              // largura da linha de piso tátil direcional
  ALERTA: 0.5,              // profundidade do piso de alerta na chegada da faixa
  FOLGA_TATIL: 0.8,         // o direcional para antes da borda da calçada
  INICIO_FAIXA: 3.7,        // do eixo da via transversal até a faixa de pedestre
  COMPRIMENTO_FAIXA: 3.0,   // comprimento das barras, ao longo da via
  BARRA: 0.4,
  VAO_BARRA: 0.35,
  MARGEM_BARRAS: 0.1,       // folga entre a última barra e o meio-fio
  VAO_RETENCAO: 1.0,        // entre a faixa de pedestre e a linha de retenção
  RETENCAO: 0.4,
  FOLGA_EIXO: 1.0,          // entre a retenção e o primeiro traço do eixo
  TRACO: 3.0,
  VAO_TRACO: 3.0,
  LINHA: 0.12,
};

const EPS = 1e-6;
const MEIA_RUA = CONFIG.ROAD_WIDTH / 2;
export const MEIA_PISTA = MEIA_RUA - PERFIL.CALCADA;

/** Posição do eixo de cada rua (as mesmas nos dois sentidos do grid). */
export const EIXOS = Array.from({ length: CONFIG.GRID_SIZE + 1 }, (_, k) => (k - CONFIG.GRID_SIZE / 2) * CONFIG.CELL);

/** Até onde as ruas vão: a borda externa das ruas do perímetro. */
export const LIMITE = CONFIG.WORLD_HALF + MEIA_RUA;

function ret(x0, x1, z0, z1, extra = {}) {
  return { x0, x1, z0, z1, ...extra };
}

function naVia(eixo, s0, s1, t0, t1, extra = {}) {
  return eixo === 'z' ? ret(t0, t1, s0, s1, extra) : ret(s0, s1, t0, t1, extra);
}

// Face vertical correndo ao longo da via, na coordenada atravessada `t`.
function faceAoLongo(eixo, s0, s1, t, n) {
  return eixo === 'z'
    ? { x0: t, x1: t, z0: s0, z1: s1, nx: n, nz: 0 }
    : { x0: s0, x1: s1, z0: t, z1: t, nx: 0, nz: n };
}

// Face vertical atravessando a via, na coordenada `s`.
function faceAtravessada(eixo, t0, t1, s, n) {
  return eixo === 'z'
    ? { x0: t0, x1: t1, z0: s, z1: s, nx: 0, nz: n }
    : { x0: s, x1: s, z0: t0, z1: t1, nx: n, nz: 0 };
}

function gerarRuas() {
  const MF = PERFIL.MEIO_FIO;
  const B = CONFIG.BLOCK_SIZE / 2;
  const N = EIXOS.length - 1;

  const pracas = CITY.blocks
    .filter(b => b.type === 'plaza')
    .map(b => ret(b.cx - B, b.cx + B, b.cz - B, b.cz + B));
  // Calçada "da praça": cabe inteira no quarteirão da praça alargado de uma calçada.
  const colaNaPraca = r => pracas.some(p =>
    r.x0 >= p.x0 - PERFIL.CALCADA - EPS && r.x1 <= p.x1 + PERFIL.CALCADA + EPS
    && r.z0 >= p.z0 - PERFIL.CALCADA - EPS && r.z1 <= p.z1 + PERFIL.CALCADA + EPS);

  const calcadas = [];
  const meioFio = [];
  const faces = [];
  const tatilDirecional = [];
  const tatilAlerta = [];
  const faixasPedestre = [];
  const retencao = [];
  const eixoAmarelo = [];

  for (const eixo of ['z', 'x']) {
    for (const r of EIXOS) {
      // --- Calçadas e meio-fio ---------------------------------------------
      // As vias ao longo de z levam as esquinas; as vias ao longo de x só
      // preenchem a borda de cada quarteirão, entre duas esquinas. Assim
      // nenhuma calçada se sobrepõe a outra.
      const trechos = [];
      if (eixo === 'z') {
        const cortes = [-LIMITE, ...EIXOS.flatMap(e => [e - MEIA_PISTA, e + MEIA_PISTA]), LIMITE];
        for (let i = 0; i < cortes.length; i += 2) {
          trechos.push({ s0: cortes[i], s1: cortes[i + 1], bordaIni: i > 0, bordaFim: i + 2 < cortes.length });
        }
      } else {
        for (let k = 0; k < N; k++) {
          trechos.push({ s0: EIXOS[k] + MEIA_RUA, s1: EIXOS[k + 1] - MEIA_RUA, bordaIni: false, bordaFim: false });
        }
      }

      for (const { s0, s1, bordaIni, bordaFim } of trechos) {
        for (const lado of [-1, 1]) {
          const t0 = lado < 0 ? r - MEIA_RUA : r + MEIA_PISTA;
          const t1 = lado < 0 ? r - MEIA_PISTA : r + MEIA_RUA;
          const tBorda = lado < 0 ? t1 : t0;          // lado que encosta na pista
          const tc0 = lado < 0 ? t0 : t0 + MF;         // corpo sem o meio-fio lateral
          const tc1 = lado < 0 ? t1 - MF : t1;
          const sc0 = bordaIni ? s0 + MF : s0;
          const sc1 = bordaFim ? s1 - MF : s1;
          const piso = colaNaPraca(naVia(eixo, s0, s1, t0, t1)) ? 'pedra' : 'concreto';

          calcadas.push(naVia(eixo, sc0, sc1, tc0, tc1, { piso }));
          meioFio.push(naVia(eixo, s0, s1, lado < 0 ? t1 - MF : t0, lado < 0 ? t1 : t0 + MF));
          faces.push(faceAoLongo(eixo, s0, s1, tBorda, -lado));
          if (bordaIni) {
            meioFio.push(naVia(eixo, s0, s0 + MF, tc0, tc1));
            faces.push(faceAtravessada(eixo, t0, t1, s0, -1));
          }
          if (bordaFim) {
            meioFio.push(naVia(eixo, s1 - MF, s1, tc0, tc1));
            faces.push(faceAtravessada(eixo, t0, t1, s1, 1));
          }

          // Piso tátil direcional no meio da calçada de concreto. Nas vias ao
          // longo de x ele avança até encostar na linha da calçada da esquina.
          if (piso === 'concreto') {
            const tm = (t0 + t1) / 2;
            const meio = PERFIL.TATIL / 2;
            const avanco = PERFIL.CALCADA / 2 - meio;
            const a = eixo === 'z' ? s0 + PERFIL.FOLGA_TATIL : s0 - avanco;
            const b = eixo === 'z' ? s1 - PERFIL.FOLGA_TATIL : s1 + avanco;
            if (b - a > 1) tatilDirecional.push(naVia(eixo, a, b, tm - meio, tm + meio, { aoLongo: eixo }));
          }
        }
      }

      // --- Chegadas de cruzamento -------------------------------------------
      for (let k = 0; k <= N; k++) {
        const rk = EIXOS[k];
        for (const d of [-1, 1]) {
          if ((d > 0 && k === N) || (d < 0 && k === 0)) continue;

          const f0 = rk + d * PERFIL.INICIO_FAIXA;
          const f1 = rk + d * (PERFIL.INICIO_FAIXA + PERFIL.COMPRIMENTO_FAIXA);
          const sa = Math.min(f0, f1);
          const sb = Math.max(f0, f1);

          const util = 2 * MEIA_PISTA - 2 * PERFIL.MARGEM_BARRAS;
          const n = Math.floor((util + PERFIL.VAO_BARRA) / (PERFIL.BARRA + PERFIL.VAO_BARRA));
          const total = n * PERFIL.BARRA + (n - 1) * PERFIL.VAO_BARRA;
          const barras = [];
          for (let i = 0; i < n; i++) {
            const t = r - total / 2 + i * (PERFIL.BARRA + PERFIL.VAO_BARRA);
            barras.push(naVia(eixo, sa, sb, t, t + PERFIL.BARRA));
          }
          faixasPedestre.push({
            eixo, r, cruzamento: rk, sentido: d,
            area: naVia(eixo, sa, sb, r - MEIA_PISTA, r + MEIA_PISTA),
            barras,
          });

          // Piso de alerta onde a faixa encosta na calçada, dos dois lados.
          for (const lado of [-1, 1]) {
            const tIn = r + lado * (MEIA_PISTA + MF);
            const tOut = tIn + lado * PERFIL.ALERTA;
            const alerta = naVia(eixo, sa, sb, Math.min(tIn, tOut), Math.max(tIn, tOut));
            if (!colaNaPraca(alerta)) tatilAlerta.push(alerta);
          }

          // Retenção na faixa de quem chega ao cruzamento. Mão direita: quem
          // anda em -z tem a direita em +x; quem anda em -x tem a direita em -z.
          const r0 = rk + d * (PERFIL.INICIO_FAIXA + PERFIL.COMPRIMENTO_FAIXA + PERFIL.VAO_RETENCAO);
          const r1 = r0 + d * PERFIL.RETENCAO;
          const ladoFaixa = eixo === 'z' ? d : -d;
          const tA = r + ladoFaixa * 0.08;
          const tB = r + ladoFaixa * (MEIA_PISTA - 0.1);
          retencao.push(naVia(eixo, Math.min(r0, r1), Math.max(r0, r1), Math.min(tA, tB), Math.max(tA, tB),
            { eixo, r, cruzamento: rk, sentido: d }));
        }
      }

      // --- Eixo amarelo tracejado entre dois cruzamentos ---------------------
      const recuo = PERFIL.INICIO_FAIXA + PERFIL.COMPRIMENTO_FAIXA + PERFIL.VAO_RETENCAO + PERFIL.RETENCAO + PERFIL.FOLGA_EIXO;
      for (let k = 0; k < N; k++) {
        const ini = EIXOS[k] + recuo;
        const fim = EIXOS[k + 1] - recuo;
        for (let s = ini; s < fim - EPS; s += PERFIL.TRACO + PERFIL.VAO_TRACO) {
          const e = Math.min(s + PERFIL.TRACO, fim);
          if (e - s > 0.5) eixoAmarelo.push(naVia(eixo, s, e, r - PERFIL.LINHA / 2, r + PERFIL.LINHA / 2));
        }
      }
    }
  }

  return { pracas, calcadas, meioFio, faces, tatilDirecional, tatilAlerta, faixasPedestre, retencao, eixoAmarelo };
}

export const RUAS = gerarRuas();
