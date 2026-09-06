// Configuração e conteúdo do mundo. Layout da cidade é gerado uma única vez
// (no load do módulo) e compartilhado por todos os sistemas — por isso não
// precisa de seed determinística: é um singleton de módulo ES.
import { SCENE } from './data/scene.js';

export const CONFIG = {
  GRID_SIZE: 5,
  BLOCK_SIZE: 40,
  ROAD_WIDTH: 10,
  DAY_LENGTH_SECONDS: 480, // duração de um ciclo dia/noite completo
  PLAYER_SPEED_WALK: 3.2,
  PLAYER_SPEED_RUN: 6.5,
  PLAYER_SPEED_CROUCH: 1.8,
  PLAYER_RADIUS: 0.45,
  INTERACT_RADIUS: 3.2,
  PHOTO_RADIUS: 3.5,
  GRAVITY: 18,
  JUMP_SPEED: 6.5,
  PUNCH_RANGE: 1.8,
  PUNCH_DAMAGE: 12,
  PUNCH_COMBO_WINDOW: 0.4,
  PUNCH_COMBO_DAMAGE: 18,
  PLAYER_MAX_STAMINA: 100,
  PUNCH_STAMINA_COST: 15,
  DODGE_STAMINA_COST: 30,
  STAMINA_REGEN_RATE: 25,
  DUMMY_MAX_HP: 100,
  DUMMY_RESPAWN_DELAY: 1.4,
  PLAYER_MAX_HP: 100,
  DUMMY_COUNTER_CHANCE: 0.3,
  DUMMY_COUNTER_DAMAGE: 8,
  COUNTER_TELEGRAPH_DURATION: 0.8,
  PLAYER_KO_RECOVER_DELAY: 2,
};
CONFIG.CELL = CONFIG.BLOCK_SIZE + CONFIG.ROAD_WIDTH;
CONFIG.WORLD_HALF = (CONFIG.GRID_SIZE * CONFIG.CELL) / 2;

export function blockCenter(ix, iz) {
  const half = (CONFIG.GRID_SIZE - 1) / 2;
  return {
    x: (ix - half) * CONFIG.CELL,
    z: (iz - half) * CONFIG.CELL,
  };
}

const PLAZA = { ix: 2, iz: 2 };
const PARKS = [
  { ix: 1, iz: 3 },
  { ix: 3, iz: 1 },
];

const LANDMARK_SPECS = {
  home_operario: { w: 10, d: 9, h: 4.5, color: 0xc9a876, roofColor: 0x7a4a34, label: 'CASA' },
  home_nobre: { w: 16, d: 13, h: 6.5, color: 0xf3ead9, roofColor: 0x5a4636, label: 'CASA' },
  job_mercado: { w: 18, d: 12, h: 5, color: 0xd97b4a, roofColor: 0xb03a3a, label: 'MERCADO' },
  school: { w: 26, d: 18, h: 9, color: 0xdfe6ee, roofColor: 0x3a5a7a, label: 'ESCOLA' },
};
export { LANDMARK_SPECS };

const LANDMARK_TYPE_TO_KIND = {
  landmark_home_operario: 'home_operario',
  landmark_home_nobre: 'home_nobre',
  landmark_job_mercado: 'job_mercado',
  landmark_school: 'school',
};

// Cada marco/prédio customizado da cena "reserva" o quarteirão mais perto da
// posição escolhida, pra geração procedural não colocar um prédio aleatório
// em cima — sem isso, mover um marco no editor deixaria dois prédios
// sobrepostos no mesmo lugar.
function blockIndexFromPos(x, z) {
  const half = (CONFIG.GRID_SIZE - 1) / 2;
  const clamp = v => Math.min(CONFIG.GRID_SIZE - 1, Math.max(0, Math.round(v)));
  return { ix: clamp(x / CONFIG.CELL + half), iz: clamp(z / CONFIG.CELL + half) };
}

const sceneLandmarks = {}; // kind -> {cx,cz,ix,iz}
const sceneBuildings = []; // prédios customizados: {cx,cz,w,d,h,color,ix,iz}
for (const item of SCENE.items) {
  const kind = LANDMARK_TYPE_TO_KIND[item.typeId];
  const [x, , z] = item.position;
  if (kind) {
    sceneLandmarks[kind] = { cx: x, cz: z, ...blockIndexFromPos(x, z) };
  } else if (item.typeId === 'building') {
    sceneBuildings.push({
      cx: x, cz: z, ...blockIndexFromPos(x, z),
      w: item.props?.w ?? 6, d: item.props?.d ?? 6, h: item.props?.h ?? 8,
      color: item.props?.color ?? '#b9c4cc',
    });
  }
}

function isSpecial(ix, iz) {
  if (ix === PLAZA.ix && iz === PLAZA.iz) return 'plaza';
  for (const p of PARKS) if (p.ix === ix && p.iz === iz) return 'park';
  for (const kind of Object.keys(sceneLandmarks)) {
    if (sceneLandmarks[kind].ix === ix && sceneLandmarks[kind].iz === iz) return kind;
  }
  if (sceneBuildings.some(b => b.ix === ix && b.iz === iz)) return 'custom';
  return null;
}

const BUILDING_COLORS = [0xb9c4cc, 0xc9b6a3, 0x9fb3c8, 0xd9cba8, 0xa8a8a8, 0x8fa998, 0xc7a9a0];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function generateCity() {
  const blocks = [];
  const buildings = []; // AABBs planos {minX,maxX,minZ,maxZ,h,colorIdx,seed}

  for (let ix = 0; ix < CONFIG.GRID_SIZE; ix++) {
    for (let iz = 0; iz < CONFIG.GRID_SIZE; iz++) {
      const { x: cx, z: cz } = blockCenter(ix, iz);
      const special = isSpecial(ix, iz);
      const block = { ix, iz, cx, cz, type: special || 'urban', lots: [] };

      if (special && LANDMARK_SPECS[special]) {
        const spec = LANDMARK_SPECS[special];
        const pos = sceneLandmarks[special];
        const b = {
          minX: pos.cx - spec.w / 2, maxX: pos.cx + spec.w / 2,
          minZ: pos.cz - spec.d / 2, maxZ: pos.cz + spec.d / 2,
          h: spec.h, cx: pos.cx, cz: pos.cz, w: spec.w, d: spec.d, kind: special,
        };
        buildings.push(b);
        block.lots.push(b);
      } else if (special === 'custom') {
        const cb = sceneBuildings.find(b => b.ix === ix && b.iz === iz);
        const b = {
          minX: cb.cx - cb.w / 2, maxX: cb.cx + cb.w / 2,
          minZ: cb.cz - cb.d / 2, maxZ: cb.cz + cb.d / 2,
          h: cb.h, cx: cb.cx, cz: cb.cz, w: cb.w, d: cb.d, custom: true, color: cb.color,
        };
        buildings.push(b);
        block.lots.push(b);
      } else if (!special) {
        const half = CONFIG.BLOCK_SIZE / 2;
        const margin = 3;
        const usable = half - margin;
        const splitAxis = Math.random() < 0.55 ? null : (Math.random() < 0.5 ? 'x' : 'z');

        const makeBuilding = (bx, bz, w, d) => {
          const h = rand(7, 38);
          const colorIdx = Math.floor(Math.random() * BUILDING_COLORS.length);
          const winSeed = Math.floor(Math.random() * 10000);
          const b = {
            minX: bx - w / 2, maxX: bx + w / 2,
            minZ: bz - d / 2, maxZ: bz + d / 2,
            h, colorIdx, winSeed,
            cx: bx, cz: bz, w, d,
          };
          buildings.push(b);
          block.lots.push(b);
        };

        if (!splitAxis) {
          const w = rand(usable * 1.1, usable * 1.8);
          const d = rand(usable * 1.1, usable * 1.8);
          makeBuilding(cx + rand(-2, 2), cz + rand(-2, 2), w, d);
        } else if (splitAxis === 'x') {
          const w = usable * 0.85;
          const d = usable * 1.7;
          makeBuilding(cx - usable * 0.5, cz, w, d);
          makeBuilding(cx + usable * 0.5, cz, w, d);
        } else {
          const w = usable * 1.7;
          const d = usable * 0.85;
          makeBuilding(cx, cz - usable * 0.5, w, d);
          makeBuilding(cx, cz + usable * 0.5, w, d);
        }
      }

      blocks.push(block);
    }
  }

  return { blocks, buildings, plazaCenter: blockCenter(PLAZA.ix, PLAZA.iz), parkCenters: PARKS.map(p => blockCenter(p.ix, p.iz)) };
}

export const CITY = generateCity();
export const BUILDING_COLOR_PALETTE = BUILDING_COLORS;

// Boneco de treino de combate: fica num canto livre da praça central,
// longe o bastante da fonte (raio 4.4) pra não sobrepor.
export const DUMMY_POS = { x: CITY.plazaCenter.x + 9, z: CITY.plazaCenter.z + 9 };

export function landmarkCenter(kind) {
  const b = CITY.buildings.find(b => b.kind === kind);
  return b ? { x: b.cx, z: b.cz } : { x: 0, z: 0 };
}

// ---------------------------------------------------------------------------
// NPCs — posicionados em áreas garantidamente livres (praça / parques)
// ---------------------------------------------------------------------------
const plaza = CITY.plazaCenter;
const [parkA, parkB] = CITY.parkCenters;
// Ponto na frente do prédio (fora da caixa de colisão) e um ponto ao lado,
// pra garantir que marcadores/NPCs de um mesmo marco não fiquem dentro da
// construção nem colados um no outro.
function frontOf(center, kind, margin = 3) {
  const spec = LANDMARK_SPECS[kind];
  return { x: center.x, z: center.z + spec.d / 2 + margin };
}
function sideOf(center, kind, margin = 3) {
  const spec = LANDMARK_SPECS[kind];
  return { x: center.x + spec.w / 2 + margin, z: center.z };
}

const sceneNpcHomes = {};
for (const item of SCENE.items) {
  if (item.typeId === 'npc' && item.props?.npcId) {
    const [x, , z] = item.position;
    sceneNpcHomes[item.props.npcId] = { x, z };
  }
}
// Posição vem da cena do editor quando existir; o valor calculado é só um
// fallback de segurança caso um NPC fique de fora da cena por engano.
function npcHome(id, fallback) {
  return sceneNpcHomes[id] ?? fallback;
}

const homeOperario = landmarkCenter('home_operario');
const homeNobre = landmarkCenter('home_nobre');
const jobMercado = landmarkCenter('job_mercado');
const schoolCenter = landmarkCenter('school');

export const NPC_DEFS = [
  {
    id: 'almeida',
    name: 'Sr. Almeida',
    color: 0x6b4f3a,
    home: npcHome('almeida', { x: plaza.x - 6, z: plaza.z + 5 }),
    wanderRadius: 4,
    speed: 0,
    prop: 'cart',
  },
  {
    id: 'marina',
    name: 'Marina',
    color: 0x8a4b6b,
    home: npcHome('marina', { x: parkA.x + 3, z: parkA.z - 4 }),
    wanderRadius: 8,
    speed: 1.1,
    prop: null,
  },
  {
    id: 'diego',
    name: 'Diego',
    color: 0x3a4a6b,
    home: npcHome('diego', { x: plaza.x + 8, z: plaza.z - 7 }),
    wanderRadius: 0,
    speed: 0,
    prop: 'phone',
  },
  {
    id: 'busker',
    name: 'Yara, a Musicista',
    color: 0x2f6b4f,
    home: npcHome('busker', { x: plaza.x, z: plaza.z + 10 }),
    wanderRadius: 0,
    speed: 0,
    prop: 'guitar',
  },
  {
    id: 'runner',
    name: 'Caio',
    color: 0x6b2f3a,
    home: npcHome('runner', { x: parkB.x - 5, z: parkB.z + 6 }),
    wanderRadius: 10,
    speed: 2.6,
    prop: null,
  },
  {
    id: 'mae_operaria',
    name: 'Dona Rosa',
    color: 0x8a5a3a,
    home: npcHome('mae_operaria', frontOf(homeOperario, 'home_operario', 3)),
    wanderRadius: 2,
    speed: 0,
    prop: null,
  },
  {
    id: 'seu_ivo',
    name: 'Seu Ivo',
    color: 0x4a6b3a,
    home: npcHome('seu_ivo', frontOf(jobMercado, 'job_mercado', 3)),
    wanderRadius: 1.5,
    speed: 0.4,
    prop: 'cart',
  },
  {
    id: 'mae_nobre',
    name: 'Dona Beatriz',
    color: 0x6b3a5a,
    home: npcHome('mae_nobre', frontOf(homeNobre, 'home_nobre', 3)),
    wanderRadius: 2,
    speed: 0,
    prop: null,
  },
  {
    id: 'professora',
    name: 'Professora Elaine',
    color: 0x3a5a6b,
    home: npcHome('professora', frontOf(schoolCenter, 'school', 3)),
    wanderRadius: 1.5,
    speed: 0.3,
    prop: null,
  },
];

// ---------------------------------------------------------------------------
// Casa / Origem / Rotina — o núcleo do "life sim". Cada origem determina
// onde o personagem mora, quanto dinheiro tem no início e qual compromisso
// fixo (emprego ou escola) precisa cumprir todo dia.
// ---------------------------------------------------------------------------
export const HOMES = {
  home_operario: { kind: 'home_operario', sleepSpot: sideOf(homeOperario, 'home_operario', 3) },
  home_nobre: { kind: 'home_nobre', sleepSpot: sideOf(homeNobre, 'home_nobre', 3) },
};

export const OBLIGATIONS = {
  job_mercado: {
    id: 'job_mercado',
    type: 'job',
    label: 'Turno no Mercado',
    location: frontOf(jobMercado, 'job_mercado', 3),
    npc: 'seu_ivo',
    startHour: 8,
    endHour: 14,
    payPerDay: 40,
    missPenaltyMoney: 10,
    maxMisses: 3,
    warningMessage: 'Seu Ivo cruzou os braços. "Já é a segunda falta. Mais uma e eu vou ter que te dispensar."',
    endMessage: 'Seu Ivo balançou a cabeça. "Sinto muito, mas não posso mais contar com você. Vamos ter que nos despedir."',
  },
  school: {
    id: 'school',
    type: 'school',
    label: 'Aula na Escola',
    location: frontOf(schoolCenter, 'school', 3),
    npc: 'professora',
    startHour: 8,
    endHour: 14,
    payPerDay: 0,
    missPenaltyMoney: 0,
    maxMisses: 3,
    warningMessage: 'A Professora Elaine suspirou. "Mais uma falta e eu vou ter que chamar seus pais."',
    endMessage: 'A Professora Elaine anotou algo com pesar. "Seu desempenho caiu demais. Precisamos conversar sério sobre isso."',
  },
};

export const ORIGINS = {
  operario: {
    id: 'operario',
    label: 'Bairro Operário',
    shortDesc: 'Você cresceu apertado, mas cercado de gente que se ajuda. Hoje começa seu primeiro turno no mercado do bairro.',
    startMoney: 60,
    home: 'home_operario',
    obligation: 'job_mercado',
    familyNpc: 'mae_operaria',
  },
  nobre: {
    id: 'nobre',
    label: 'Bairro Nobre',
    shortDesc: 'Você nunca precisou se preocupar com dinheiro, mas a cobrança em casa é constante. Hoje é seu primeiro dia numa nova escola.',
    startMoney: 250,
    home: 'home_nobre',
    obligation: 'school',
    familyNpc: 'mae_nobre',
  },
};

// ---------------------------------------------------------------------------
// Item de missão: o livro perdido de Marina
// ---------------------------------------------------------------------------
export const ITEM_PROPS = [
  {
    id: 'livro_marina',
    type: 'book',
    position: { x: parkA.x - 6, z: parkA.z + 5 },
    questId: 'livro_esquecido',
  },
];

// ---------------------------------------------------------------------------
// Fragmentos de memória (colecionáveis fotografáveis)
// ---------------------------------------------------------------------------
const sceneFragments = SCENE.items
  .filter(item => item.typeId === 'fragment')
  .map((item, i) => {
    const [x, , z] = item.position;
    return { id: `frag_${i + 1}`, position: { x, z }, note: item.props?.note || '' };
  });
// Fallback de segurança — só usado se a cena não tiver nenhum fragmento.
export const FRAGMENT_SPOTS = sceneFragments.length > 0 ? sceneFragments : [
  { id: 'frag_1', position: { x: plaza.x + 3, z: plaza.z + 3 }, note: 'A luz da fonte da praça ao entardecer.' },
  { id: 'frag_2', position: { x: parkA.x, z: parkA.z - 8 }, note: 'Uma árvore solitária no meio do concreto.' },
  { id: 'frag_3', position: { x: parkB.x + 4, z: parkB.z - 3 }, note: 'Risos distantes num banco de parque.' },
  { id: 'frag_4', position: { x: plaza.x - 10, z: plaza.z - 12 }, note: 'Um reflexo de neon numa poça d\'água.' },
  { id: 'frag_5', position: { x: parkB.x - 6, z: parkB.z + 8 }, note: 'O silêncio raro entre duas buzinas.' },
];

// ---------------------------------------------------------------------------
// Itens de inventário — o que um "giveItem" de diálogo entrega, e o que um
// item largado pelo mundo (WORLD_ITEM_SPOTS) vira ao ser pego. `effect` é
// aplicado só quando o jogador usa o item de verdade, pelo diário.
// ---------------------------------------------------------------------------
export const ITEM_CATEGORIES = {
  consumivel: { id: 'consumivel', label: 'Consumíveis', icon: '🍽' },
};

// `weight`/`value` são só de exibição (colunas da tabela, estilo SkyUI) —
// não existe limite de peso pra carregar nem loja pra vender itens.
export const ITEM_DEFS = {
  coffee: { id: 'coffee', name: 'Café', icon: '☕', glyph: 'local_cafe', category: 'consumivel', weight: 0.2, value: 5, description: 'Recupera um pouco de energia.', effect: { type: 'restoreEnergy', amount: 25 } },
  snack: { id: 'snack', name: 'Lanche', icon: '🥪', glyph: 'bakery_dining', category: 'consumivel', weight: 0.3, value: 8, description: 'Mata a fome rapidamente.', effect: { type: 'restoreHunger', amount: 60 } },
  homeMeal: { id: 'homeMeal', name: 'Comida Caseira', icon: '🍲', glyph: 'lunch_dining', category: 'consumivel', weight: 0.5, value: 12, description: 'Uma refeição completa.', effect: { type: 'restoreHunger', amount: 100 } },
};

export const WORLD_ITEM_SPOTS = [
  { id: 'worlditem_1', itemId: 'snack', position: { x: parkA.x - 10, z: parkA.z + 10 } },
  { id: 'worlditem_2', itemId: 'coffee', position: { x: parkB.x + 10, z: parkB.z - 10 } },
];

// ---------------------------------------------------------------------------
// Missões
// ---------------------------------------------------------------------------
export const QUESTS = {
  boas_vindas: {
    id: 'boas_vindas',
    title: 'Boas-vindas à Cidade',
    description: 'Converse com o Sr. Almeida na praça central para conhecer um pouco da cidade.',
    objectives: [{ id: 'talk_almeida', text: 'Falar com Sr. Almeida', done: false }],
    reward: 'Você aprende a observar a cidade com outros olhos.',
    autoStart: true,
  },
  ecos_perdidos: {
    id: 'ecos_perdidos',
    title: 'Ecos Perdidos',
    description: 'Encontre e fotografe 5 fragmentos de memória espalhados pela cidade.',
    objectives: [{ id: 'frags', text: 'Fotografar fragmentos (0/5)', done: false, count: 0, target: 5 }],
    reward: 'Um álbum silencioso de instantes que quase ninguém nota.',
    autoStart: true,
  },
  livro_esquecido: {
    id: 'livro_esquecido',
    title: 'O Livro Esquecido',
    description: 'Marina perdeu seu livro em algum lugar do parque. Encontre-o e devolva a ela.',
    objectives: [
      { id: 'find_book', text: 'Encontrar o livro de Marina', done: false },
      { id: 'return_book', text: 'Devolver o livro para Marina', done: false },
    ],
    reward: 'A gratidão sincera de alguém que você mal conhece.',
  },
  desconectar: {
    id: 'desconectar',
    title: 'Desconectar',
    description: 'Diego nunca larga o celular. Talvez, com o tempo, isso mude.',
    objectives: [{ id: 'talk_diego_night', text: 'Falar com Diego durante a noite', done: false }],
    reward: 'Uma conversa breve, mas real.',
    autoStart: true,
  },
};

