// Física e volumetria do prédio inicial.
//
// O jogo nasceu com colisão 2D: o jogador era um círculo empurrado pra fora de
// AABBs planas, e `position.y <= 0` era o único chão que existia. Interior com
// dois pavimentos e escada não cabe nesse modelo, então este módulo acrescenta
// o eixo que faltava, sem tocar em como a cidade lá fora funciona:
//
//   solids  — caixas 3D (paredes, laje, móveis). Bloqueiam só na faixa de
//             altura que o corpo do jogador ocupa.
//   floors  — retângulos horizontais que sustentam o jogador.
//   ramps   — retângulos cuja altura varia linearmente num eixo: a escada.
//
// A cidade continua usando `World.resolveCollision`; este módulo é consultado
// em cima disso. Tudo aqui já sai em COORDENADAS DE MUNDO (a origem é somada
// na construção), pra o loop do jogo não pagar conversão por quadro.
//
// Sem three.js de propósito: é geometria analítica, e roda no Node nos testes.

import {
  AP, LOBBY, STAIRWELL, STAIR_BASE, STAIRS, LANDING, CORRIDOR,
  UNITS, ROOMS, DOORS, SPAWN,
} from './data/apartment.js';

// Altura do corpo usada na colisão. Menor que o modelo visual de propósito:
// o que importa é não atravessar parede nem bater a cabeça na laje.
export const BODY_HEIGHT = 1.7;
// Quanto o jogador "sobe" sozinho ao andar: cobre a junta entre a rampa da
// escada e o patamar, e o degrau da soleira das portas.
export const STEP_UP = 0.6;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ---------------------------------------------------------------------------
// Geração de paredes a partir da planta
// ---------------------------------------------------------------------------

/**
 * Uma parede reta, com vãos. `along` é o eixo em que ela se estende; `at` é a
 * posição no outro eixo (linha de centro); `gaps` são intervalos vazados,
 * medidos no mesmo eixo de `along`.
 */
function wall({ along, from, to, at, thick, y0, y1, gaps = [], tag = 'parede' }) {
  const meio = thick / 2;
  // Ordena e mescla os vãos, depois emite os pedaços cheios entre eles.
  const vaos = gaps
    .map(g => ({ from: Math.max(from, g.from), to: Math.min(to, g.to) }))
    .filter(g => g.to > g.from)
    .sort((a, b) => a.from - b.from);

  const pedacos = [];
  let cursor = from;
  for (const g of vaos) {
    if (g.from > cursor) pedacos.push([cursor, g.from]);
    cursor = Math.max(cursor, g.to);
  }
  if (cursor < to) pedacos.push([cursor, to]);

  return pedacos.map(([a, b]) => (along === 'x'
    ? { minX: a, maxX: b, minY: y0, maxY: y1, minZ: at - meio, maxZ: at + meio, tag }
    : { minX: at - meio, maxX: at + meio, minY: y0, maxY: y1, minZ: a, maxZ: b, tag }));
}

// Vão de uma porta no eixo em que ela se abre, com folga pra soleira.
function vaoDaPorta(d) {
  const centro = d.axis === 'x' ? d.x : d.z;
  return { from: centro - d.w / 2, to: centro + d.w / 2 };
}

function porta(id) {
  const d = DOORS.find(p => p.id === id);
  if (!d) throw new Error(`porta desconhecida na planta: ${id}`);
  return d;
}

/**
 * Monta paredes, pisos e rampas do prédio em coordenadas LOCAIS.
 * Exportado separado da classe pra poder ser inspecionado nos testes.
 */
export function planoDoPredio() {
  const { W, D, SHELL, WALL, FLOOR_H, ROOF_Y, DOOR_H } = AP;
  const S = SHELL;
  const solids = [];
  const floors = [];

  const nivel = i => ({ y0: i * FLOOR_H, y1: (i + 1) * FLOOR_H });

  // --- Fachada -------------------------------------------------------------
  // Construída por pavimento: só assim o vão da porta da rua pode existir no
  // térreo sem abrir um buraco no andar de cima.
  for (const i of [0, 1]) {
    const { y0, y1 } = nivel(i);
    const vaoEntrada = i === 0 ? [vaoDaPorta(porta('entrada'))] : [];
    solids.push(
      ...wall({ along: 'x', from: 0, to: W, at: S / 2, thick: S, y0, y1, gaps: vaoEntrada, tag: 'fachada_sul' }),
      ...wall({ along: 'x', from: 0, to: W, at: D - S / 2, thick: S, y0, y1, tag: 'fachada_norte' }),
      // As laterais começam DEPOIS da espessura das outras duas: sobrepor os
      // cantos duplicava faces coplanares e produzia z-fighting visível como
      // uma fresta vertical na quina do prédio.
      ...wall({ along: 'z', from: S, to: D - S, at: S / 2, thick: S, y0, y1, tag: 'fachada_oeste' }),
      ...wall({ along: 'z', from: S, to: D - S, at: W - S / 2, thick: S, y0, y1, tag: 'fachada_leste' }),
    );
  }

  // Laje de cobertura: fecha o prédio por cima, pra um pulo não sair pelo teto.
  solids.push({ minX: 0, maxX: W, minY: ROOF_Y, maxY: ROOF_Y + 0.35, minZ: 0, maxZ: D, tag: 'cobertura' });

  // --- Parede saguão × caixa de escada -------------------------------------
  // Sobe os dois pavimentos, com um vão em cada: no térreo dá na base da
  // escada, no andar de cima liga o corredor ao patamar.
  const eixoEscada = (LOBBY.x1 + STAIRWELL.x0) / 2;   // 11.5
  const espEscada = STAIRWELL.x0 - LOBBY.x1;          // 0.5
  for (const [i, idPorta] of [[0, 'saguao_escada'], [1, 'corredor_patamar']]) {
    const { y0, y1 } = nivel(i);
    solids.push(...wall({
      // S a D-S, não 0 a D: uma parede interna que vai até a borda atravessa a
      // fachada, e as faces coplanares brigam por profundidade — aparecia como
      // uma lasca escura no meio da parede vista da rua.
      along: 'z', from: S, to: D - S, at: eixoEscada, thick: espEscada, y0, y1,
      gaps: [vaoDaPorta(porta(idPorta))], tag: 'parede_escada',
    }));
  }

  // --- Andar dos apartamentos ---------------------------------------------
  const { y0: y1a, y1: y1b } = nivel(1);
  const zCorredor = (UNITS[0].z1 + CORRIDOR.z0) / 2;   // 8.275
  const espCorredor = CORRIDOR.z0 - UNITS[0].z1;       // 0.25

  solids.push(...wall({
    along: 'x', from: S, to: LOBBY.x1, at: zCorredor, thick: espCorredor, y0: y1a, y1: y1b,
    gaps: ['ap201', 'ap202', 'ap203'].map(id => vaoDaPorta(porta(id))),
    tag: 'parede_corredor',
  }));

  // Paredes entre unidades.
  for (let i = 0; i < UNITS.length - 1; i++) {
    const a = UNITS[i], b = UNITS[i + 1];
    solids.push(...wall({
      along: 'z', from: S, to: zCorredor, at: (a.x1 + b.x0) / 2, thick: b.x0 - a.x1,
      y0: y1a, y1: y1b, tag: `parede_${a.id}_${b.id}`,
    }));
  }

  // --- Divisórias internas do apartamento 201 ------------------------------
  const zInterna = (ROOMS.quarto.z1 + ROOMS.sala.z0) / 2;   // 3.625
  solids.push(...wall({
    along: 'x', from: S, to: UNITS[0].x1, at: zInterna, thick: ROOMS.sala.z0 - ROOMS.quarto.z1,
    y0: y1a, y1: y1b,
    gaps: ['quarto', 'banheiro'].map(id => vaoDaPorta(porta(id))),
    tag: 'parede_quarto_sala',
  }));
  solids.push(...wall({
    along: 'z', from: S, to: zInterna, at: (ROOMS.quarto.x1 + ROOMS.banheiro.x0) / 2,
    thick: ROOMS.banheiro.x0 - ROOMS.quarto.x1, y0: y1a, y1: y1b,
    tag: 'parede_quarto_banheiro',
  }));

  // --- Pisos ---------------------------------------------------------------
  // Térreo: uma laje só, contínua com a calçada lá fora (ambas em y = 0).
  floors.push({ minX: S, maxX: W - S, minZ: S, maxZ: D - S, y: 0, tag: 'terreo' });

  // Andar de cima: unidades + corredor, e o patamar do outro lado do vão.
  // O retângulo entre os dois (a caixa de escada) fica SEM piso de propósito —
  // é o vão de altura dupla que dá pé-direito ao lance.
  floors.push({ minX: S, maxX: LOBBY.x1, minZ: S, maxZ: D - S, y: AP.FLOOR_H, tag: 'andar' });
  // Começa em LOBBY.x1, não em LANDING.x0: a faixa da parede é a SOLEIRA da
  // porta do patamar, e sem piso ali a laje fica com um buraco de meio metro
  // exatamente no vão por onde o jogador passa.
  floors.push({ minX: LOBBY.x1, maxX: LANDING.x1, minZ: LANDING.z0, maxZ: LANDING.z1, y: AP.FLOOR_H, tag: 'patamar' });

  // --- Rampa da escada -----------------------------------------------------
  const ramps = [{
    minX: STAIRS.x0, maxX: STAIRS.x1, minZ: STAIRS.z0, maxZ: STAIRS.z1,
    yLow: STAIRS.yLow, yHigh: STAIRS.yHigh, axis: STAIRS.axis, tag: 'escada',
  }];

  return { solids, floors, ramps, bounds: { minX: 0, maxX: W, minZ: 0, maxZ: D } };
}

// ---------------------------------------------------------------------------
// A instância que o jogo consulta, já em coordenadas de mundo
// ---------------------------------------------------------------------------
export class Interior {
  constructor(origin = { x: 0, z: 0 }) {
    this.origin = origin;
    const plano = planoDoPredio();

    const desloca = r => ({
      ...r,
      minX: r.minX + origin.x, maxX: r.maxX + origin.x,
      minZ: r.minZ + origin.z, maxZ: r.maxZ + origin.z,
    });

    this.solids = plano.solids.map(desloca);
    this.floors = plano.floors.map(desloca);
    this.ramps = plano.ramps.map(desloca);
    this.bounds = desloca(plano.bounds);
    this.roofY = AP.ROOF_Y;

    // Ponto de nascimento do jogador, já no mundo.
    this.spawn = {
      x: SPAWN.x + origin.x,
      y: SPAWN.level * AP.FLOOR_H,
      z: SPAWN.z + origin.z,
      facing: SPAWN.facing,
    };
  }

  /** Móveis e outros obstáculos criados fora daqui entram por este caminho. */
  addSolids(lista) {
    for (const s of lista) {
      this.solids.push({
        ...s,
        minX: s.minX + this.origin.x, maxX: s.maxX + this.origin.x,
        minZ: s.minZ + this.origin.z, maxZ: s.maxZ + this.origin.z,
      });
    }
  }

  /** O ponto está na pegada do prédio? Usado pra decidir distância de câmera. */
  containsXZ(x, z) {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  static _dentro(r, x, z) {
    return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  }

  static _alturaDaRampa(r, x, z) {
    const t = r.axis === 'z'
      ? (z - r.minZ) / (r.maxZ - r.minZ)
      : (x - r.minX) / (r.maxX - r.minX);
    return r.yLow + clamp(t, 0, 1) * (r.yHigh - r.yLow);
  }

  /**
   * Altura do chão sob o ponto, considerando só o que está ao alcance do
   * passo. `feetY` é onde os pés estão agora: uma laje acima disso não
   * sustenta ninguém, e é isso que impede o jogador do térreo de ser
   * "puxado" pro andar de cima.
   */
  supportAt(x, z, feetY, tol = STEP_UP) {
    let melhor = this.containsXZ(x, z) ? -Infinity : 0;
    const limite = feetY + tol;

    for (const f of this.floors) {
      if (Interior._dentro(f, x, z) && f.y <= limite && f.y > melhor) melhor = f.y;
    }
    for (const r of this.ramps) {
      if (!Interior._dentro(r, x, z)) continue;
      const y = Interior._alturaDaRampa(r, x, z);
      if (y <= limite && y > melhor) melhor = y;
    }
    // Dentro do prédio mas sem piso ao alcance: está caindo pelo vão da
    // escada. O térreo continua sendo o fundo.
    return melhor === -Infinity ? 0 : melhor;
  }

  /** Altura do obstáculo mais baixo acima da cabeça, ou Infinity. */
  ceilingAt(x, z, feetY) {
    let menor = Infinity;
    const piso = feetY + 0.5;
    for (const f of this.floors) {
      if (Interior._dentro(f, x, z) && f.y > piso && f.y < menor) menor = f.y;
    }
    for (const s of this.solids) {
      if (s.tag !== 'cobertura') continue;
      if (Interior._dentro(s, x, z) && s.minY > piso && s.minY < menor) menor = s.minY;
    }
    return menor;
  }

  /**
   * Empurra o jogador pra fora das caixas que o corpo dele realmente cruza.
   * A checagem vertical é o que permite passar por baixo da laje do andar de
   * cima sem ser barrado por ela.
   */
  resolve(pos, radius, height = BODY_HEIGHT) {
    const pesY = pos.y;
    const topo = pos.y + height;
    for (const s of this.solids) {
      if (topo <= s.minY || pesY >= s.maxY) continue;
      const cx = clamp(pos.x, s.minX, s.maxX);
      const cz = clamp(pos.z, s.minZ, s.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        // Centro exatamente dentro da caixa: empurra pela face mais próxima.
        const paraOeste = pos.x - s.minX, paraLeste = s.maxX - pos.x;
        const paraSul = pos.z - s.minZ, paraNorte = s.maxZ - pos.z;
        const m = Math.min(paraOeste, paraLeste, paraSul, paraNorte);
        if (m === paraOeste) pos.x = s.minX - radius;
        else if (m === paraLeste) pos.x = s.maxX + radius;
        else if (m === paraSul) pos.z = s.minZ - radius;
        else pos.z = s.maxZ + radius;
      } else {
        const sobra = radius - d;
        pos.x += (dx / d) * sobra;
        pos.z += (dz / d) * sobra;
      }
    }
    return pos;
  }

  /**
   * Distância até o ponto em que o raio cruza a fronteira da pegada do prédio.
   *
   * Sem isto, um jogador parado na rua bem em frente à porta tem a câmera
   * entrando pelo vão e ficando presa embaixo da laje — o raycast contra
   * sólidos não pega esse caso porque a porta é, corretamente, um buraco.
   * Aqui a pegada é tratada como fronteira: dentro e fora não se misturam.
   */
  boundaryDistance(origin, dir, maxDist) {
    const dentroAgora = this.containsXZ(origin.x, origin.z);
    const b = this.bounds;
    let t0 = 0, t1 = maxDist;
    for (const [o, d, lo, hi] of [[origin.x, dir.x, b.minX, b.maxX], [origin.z, dir.z, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-8) {
        if (o < lo || o > hi) { if (!dentroAgora) return maxDist; }
        continue;
      }
      let a = (lo - o) / d, c = (hi - o) / d;
      if (a > c) { const tmp = a; a = c; c = tmp; }
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
    }
    if (t0 > t1) return maxDist;            // o raio nem passa pela pegada
    // Fora: para na entrada. Dentro: para na saída.
    const cruzamento = dentroAgora ? t1 : t0;
    return cruzamento > 0 && cruzamento < maxDist ? cruzamento : maxDist;
  }

  /** Distância até o primeiro sólido no caminho — a câmera usa pra não vazar. */
  raycast(origin, dir, maxDist) {
    let mais = maxDist;
    for (const s of this.solids) {
      const t = raioContraCaixa(origin, dir, s);
      if (t !== null && t < mais) mais = t;
    }
    return mais;
  }
}

// Slab method, sem depender do three.js (este módulo roda no Node).
function raioContraCaixa(o, d, b) {
  let tmin = 0, tmax = Infinity;
  const eixos = [
    [o.x, d.x, b.minX, b.maxX],
    [o.y, d.y, b.minY, b.maxY],
    [o.z, d.z, b.minZ, b.maxZ],
  ];
  for (const [oi, di, lo, hi] of eixos) {
    if (Math.abs(di) < 1e-8) {
      if (oi < lo || oi > hi) return null;
      continue;
    }
    let t1 = (lo - oi) / di;
    let t2 = (hi - oi) / di;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}
