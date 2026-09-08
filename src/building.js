// Geometria do prédio inicial.
//
// Princípio: as paredes visíveis são construídas a partir dos MESMOS sólidos
// que a física usa (`planoDoPredio()`), e não de uma segunda descrição feita à
// mão. É o que impede a classe de defeito mais chata de interior — parede que
// se vê mas não colide, ou colide mas não se vê.
//
// Portas são a exceção: elas são vãos na física (o jogador atravessa) e folhas
// móveis na geometria.

import * as THREE from 'three';
import { planoDoPredio } from './interior.js';
import { AP, DOORS, WINDOWS, STAIRS, ROOMS, UNITS } from './data/apartment.js';

// Materiais compartilhados: um por acabamento, reaproveitados por todas as
// peças. Menos trocas de material = menos draw calls.
function criarMateriais() {
  return {
    reboco: new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 0.92, metalness: 0 }),
    rebocoExterno: new THREE.MeshStandardMaterial({ color: 0xb9ae9c, roughness: 0.95, metalness: 0 }),
    concreto: new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.88, metalness: 0 }),
    madeira: new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.7, metalness: 0 }),
    pisoMadeira: new THREE.MeshStandardMaterial({ color: 0x9c6b41, roughness: 0.6, metalness: 0.02 }),
    pisoFrio: new THREE.MeshStandardMaterial({ color: 0xbfc0bd, roughness: 0.45, metalness: 0.02 }),
    forro: new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.95, metalness: 0 }),
    vidro: new THREE.MeshStandardMaterial({
      color: 0x9fc6d8, roughness: 0.12, metalness: 0.1,
      transparent: true, opacity: 0.42,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8e9298, roughness: 0.4, metalness: 0.8 }),
  };
}

function caixa(aabb, material, nome) {
  const w = aabb.maxX - aabb.minX;
  const h = aabb.maxY - aabb.minY;
  const d = aabb.maxZ - aabb.minZ;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(aabb.minX + w / 2, aabb.minY + h / 2, aabb.minZ + d / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = nome || aabb.tag || 'peca';
  return m;
}

// A fachada é o que se vê de fora; o resto é acabamento interno.
function materialDaParede(tag, mats) {
  if (tag.startsWith('fachada')) return mats.rebocoExterno;
  if (tag === 'cobertura') return mats.concreto;
  return mats.reboco;
}

/**
 * Monta o prédio inteiro em coordenadas locais e devolve o grupo já
 * transladado pra origem no mundo.
 *
 * @returns {{ group, doors: Map, materials }}
 */
export function buildBuilding(origin = { x: 0, z: 0 }) {
  const mats = criarMateriais();
  const group = new THREE.Group();
  group.name = 'predio_inicial';
  const plano = planoDoPredio();

  // --- Paredes, fachada e cobertura ---------------------------------------
  for (const s of plano.solids) {
    group.add(caixa(s, materialDaParede(s.tag, mats)));
  }

  // --- Lajes de piso -------------------------------------------------------
  // Cada piso vira uma laje com espessura pra baixo; a face de baixo é o forro
  // do pavimento anterior.
  for (const f of plano.floors) {
    const ehApartamento = f.tag === 'andar';
    const laje = caixa({
      minX: f.minX, maxX: f.maxX,
      minZ: f.minZ, maxZ: f.maxZ,
      minY: f.y - AP.SLAB, maxY: f.y,
    }, ehApartamento ? mats.pisoMadeira : mats.pisoFrio, `piso_${f.tag}`);
    laje.castShadow = false;   // laje não projeta sombra útil, só custa
    group.add(laje);

    // Forro do pavimento de baixo, quando há um.
    if (f.y > 0) {
      const forro = caixa({
        minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ,
        minY: f.y - AP.SLAB - 0.04, maxY: f.y - AP.SLAB,
      }, mats.forro, `forro_${f.tag}`);
      forro.castShadow = false;
      group.add(forro);
    }
  }

  // Forro do último pavimento (embaixo da cobertura).
  group.add((() => {
    const m = caixa({
      minX: AP.SHELL, maxX: AP.W - AP.SHELL, minZ: AP.SHELL, maxZ: AP.D - AP.SHELL,
      minY: AP.ROOF_Y - 0.04, maxY: AP.ROOF_Y,
    }, mats.forro, 'forro_cobertura');
    m.castShadow = false;
    return m;
  })());

  // --- Degraus -------------------------------------------------------------
  // A física usa a rampa contínua; os degraus são só o que se vê. Manter os
  // dois separados evita o jogador tropeçar em cada degrau.
  const passo = (STAIRS.z1 - STAIRS.z0) / STAIRS.steps;
  const alturaDegrau = (STAIRS.yHigh - STAIRS.yLow) / STAIRS.steps;
  for (let i = 0; i < STAIRS.steps; i++) {
    const z0 = STAIRS.z0 + i * passo;
    // (i + 0.5) e não (i + 1): assim o topo do degrau coincide com a rampa da
    // física no MEIO do degrau. Com (i+1) o personagem andava até 20 cm acima
    // do piso visível; assim o erro cai pra ±10 cm e some dos dois lados.
    const topo = STAIRS.yLow + (i + 0.5) * alturaDegrau;
    const d = caixa({
      minX: STAIRS.x0, maxX: STAIRS.x1,
      minZ: z0, maxZ: z0 + passo,
      minY: Math.max(0, topo - alturaDegrau - 0.02), maxY: topo,
    }, mats.concreto, `degrau_${i}`);
    d.castShadow = false;
    group.add(d);
  }

  // --- Janelas -------------------------------------------------------------
  // Ainda NÃO são vãos abertos: a parede continua inteira, e a colisão trata
  // janela como parede — o que está correto. O que muda aqui é que o painel é
  // desenhado nas DUAS faces do bloco, com a moldura por fora. Sem a face
  // externa o prédio virava uma caixa lisa vista da rua.
  for (const w of WINDOWS) {
    const y = w.level * AP.FLOOR_H + w.sill;
    const esp = 0.05;
    const faces = {
      north: p => ({ minX: w.at - w.w / 2, maxX: w.at + w.w / 2, minZ: p ? AP.D - AP.SHELL - esp : AP.D - esp, maxZ: p ? AP.D - AP.SHELL + esp : AP.D + esp, minY: y, maxY: y + w.h }),
      south: p => ({ minX: w.at - w.w / 2, maxX: w.at + w.w / 2, minZ: p ? AP.SHELL - esp : -esp, maxZ: p ? AP.SHELL + esp : esp, minY: y, maxY: y + w.h }),
      west:  p => ({ minX: p ? AP.SHELL - esp : -esp, maxX: p ? AP.SHELL + esp : esp, minZ: w.at - w.w / 2, maxZ: w.at + w.w / 2, minY: y, maxY: y + w.h }),
      east:  p => ({ minX: p ? AP.W - AP.SHELL - esp : AP.W - esp, maxX: p ? AP.W - AP.SHELL + esp : AP.W + esp, minZ: w.at - w.w / 2, maxZ: w.at + w.w / 2, minY: y, maxY: y + w.h }),
    };
    for (const dentro of [true, false]) {
      const vidro = caixa(faces[w.face](dentro), mats.vidro, `janela_${w.face}_${w.at}_${dentro ? 'int' : 'ext'}`);
      vidro.castShadow = false;
      group.add(vidro);
    }
    // Moldura externa: é ela que faz a janela ser lida de longe.
    const fora = faces[w.face](false);
    const m = 0.09;
    const moldura = caixa({
      minX: fora.minX - (w.face === 'north' || w.face === 'south' ? m : 0),
      maxX: fora.maxX + (w.face === 'north' || w.face === 'south' ? m : 0),
      minZ: fora.minZ - (w.face === 'east' || w.face === 'west' ? m : 0),
      maxZ: fora.maxZ + (w.face === 'east' || w.face === 'west' ? m : 0),
      minY: fora.minY - m, maxY: fora.maxY + m,
    }, mats.concreto, `moldura_${w.face}_${w.at}`);
    moldura.castShadow = false;
    group.add(moldura);
    moldura.renderOrder = -1;
  }

  // --- Entrada ------------------------------------------------------------
  // Sem isto o térreo é uma parede lisa e o jogador não acha a porta vindo da
  // rua. Batente + marquise + degrau: o mínimo pra a entrada ser lida de longe.
  {
    const e = DOORS.find(d => d.id === 'entrada');
    const alturaVao = 2.3;
    const jamba = 0.18;
    for (const lado of [-1, 1]) {
      group.add(caixa({
        minX: e.x + lado * (e.w / 2) - (lado < 0 ? jamba : 0), maxX: e.x + lado * (e.w / 2) + (lado > 0 ? jamba : 0),
        minZ: -0.12, maxZ: AP.SHELL, minY: 0, maxY: alturaVao + jamba,
      }, mats.concreto, 'batente_entrada'));
    }
    group.add(caixa({
      minX: e.x - e.w / 2 - jamba, maxX: e.x + e.w / 2 + jamba,
      minZ: -0.12, maxZ: AP.SHELL, minY: alturaVao, maxY: alturaVao + jamba,
    }, mats.concreto, 'verga_entrada'));
    // Marquise
    group.add(caixa({
      minX: e.x - e.w / 2 - 0.75, maxX: e.x + e.w / 2 + 0.75,
      minZ: -1.05, maxZ: 0.02, minY: alturaVao + jamba, maxY: alturaVao + jamba + 0.16,
    }, mats.concreto, 'marquise'));
    // Degrau da soleira
    const soleira = caixa({
      minX: e.x - e.w / 2 - 0.35, maxX: e.x + e.w / 2 + 0.35,
      minZ: -0.55, maxZ: 0.0, minY: -0.14, maxY: 0.02,
    }, mats.concreto, 'soleira_entrada');
    soleira.castShadow = false;
    group.add(soleira);
  }

  // --- Portas --------------------------------------------------------------
  // Cada folha gira em torno de uma dobradiça própria. Um Group pivô resolve
  // a rotação sem matemática de offset espalhada pelo resto do código.
  const doors = new Map();
  for (const d of DOORS) {
    const yBase = d.level * AP.FLOOR_H;
    const espessura = 0.06;
    const altura = d.id === 'entrada' ? 2.3 : AP.DOOR_H;
    const folha = new THREE.Mesh(
      new THREE.BoxGeometry(d.w - 0.04, altura, espessura),
      d.locked ? mats.madeira : mats.madeira.clone(),
    );
    if (!d.locked) folha.material.color.setHex(0x9c6737);
    folha.castShadow = true;
    folha.receiveShadow = true;
    // A folha nasce deslocada meia largura, pra o pivô ficar na dobradiça.
    folha.position.set((d.w - 0.04) / 2, altura / 2, 0);

    const macaneta = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mats.metal);
    macaneta.position.set(d.w - 0.2, altura / 2, espessura);

    const pivo = new THREE.Group();
    pivo.add(folha);
    pivo.add(macaneta);

    // Posiciona o pivô na borda do vão. `axis` diz em que eixo o vão se abre.
    if (d.axis === 'x') {
      pivo.position.set(d.x - d.w / 2, yBase, d.z);
    } else {
      // -PI/2 e não +PI/2: com a rotação invertida a folha ficava do lado
      // oposto da dobradiça e atravessava a fachada, aparecendo pra fora do
      // prédio como uma lasca de madeira na parede da rua.
      pivo.position.set(d.x, yBase, d.z - d.w / 2);
      pivo.rotation.y = -Math.PI / 2;
    }
    pivo.name = `porta_${d.id}`;
    group.add(pivo);

    doors.set(d.id, {
      def: d, pivot: pivo, aberta: false, angulo: 0,
      alvo: 0, level: d.level,
      // Ponto de interação, no meio do vão e um passo pra dentro.
      ponto: { x: d.x, y: yBase, z: d.z },
    });
  }

  group.position.set(origin.x, 0, origin.z);
  return { group, doors, materials: mats };
}

/**
 * Anima as folhas. Portas trancadas chacoalham de leve em vez de abrir — é o
 * retorno que diz "essa não é a sua porta" sem precisar de texto.
 */
export function updateDoors(doors, dt) {
  for (const p of doors.values()) {
    const destino = p.alvo;
    const diff = destino - p.angulo;
    if (Math.abs(diff) < 0.002) { p.angulo = destino; }
    else p.angulo += diff * Math.min(1, dt * 9);
    p.pivot.rotation.y = (p.def.axis === 'z' ? -Math.PI / 2 : 0) + p.angulo;
  }
}

export function abrirPorta(porta) {
  if (porta.def.locked) return false;
  porta.aberta = !porta.aberta;
  porta.alvo = porta.aberta ? -Math.PI * 0.52 : 0;
  return true;
}

// Cômodo em que um ponto local está — usado pra nomear onde o jogador se
// encontra sem espalhar retângulos pelo código do jogo.
export function comodoEm(lx, lz, level) {
  if (level !== 1) return null;
  const dentro = r => lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1;
  for (const [chave, r] of Object.entries(ROOMS)) if (dentro(r)) return r.name;
  if (lz > UNITS[0].z1) return 'Corredor';
  return null;
}
