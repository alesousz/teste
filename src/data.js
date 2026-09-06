// Configuração e conteúdo do mundo. Layout da cidade é gerado uma única vez
// (no load do módulo) e compartilhado por todos os sistemas — por isso não
// precisa de seed determinística: é um singleton de módulo ES.

export const CONFIG = {
  GRID_SIZE: 5,
  BLOCK_SIZE: 40,
  ROAD_WIDTH: 10,
  DAY_LENGTH_SECONDS: 480, // duração de um ciclo dia/noite completo
  PLAYER_SPEED_WALK: 3.2,
  PLAYER_SPEED_RUN: 6.5,
  PLAYER_RADIUS: 0.45,
  INTERACT_RADIUS: 3.2,
  PHOTO_RADIUS: 3.5,
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

// Blocos fixos que viram marcos jogáveis (casa/trabalho/escola) em vez de
// prédios aleatórios — a posição de cada um é usada por várias origens.
const LANDMARK_BLOCKS = {
  home_operario: { ix: 0, iz: 2 },
  job_mercado: { ix: 1, iz: 1 },
  home_nobre: { ix: 4, iz: 2 },
  school: { ix: 3, iz: 3 },
};

const LANDMARK_SPECS = {
  home_operario: { w: 10, d: 9, h: 4.5, color: 0xc9a876, roofColor: 0x7a4a34, label: 'CASA' },
  home_nobre: { w: 16, d: 13, h: 6.5, color: 0xf3ead9, roofColor: 0x5a4636, label: 'CASA' },
  job_mercado: { w: 18, d: 12, h: 5, color: 0xd97b4a, roofColor: 0xb03a3a, label: 'MERCADO' },
  school: { w: 26, d: 18, h: 9, color: 0xdfe6ee, roofColor: 0x3a5a7a, label: 'ESCOLA' },
};
export { LANDMARK_SPECS };

function isSpecial(ix, iz) {
  if (ix === PLAZA.ix && iz === PLAZA.iz) return 'plaza';
  for (const p of PARKS) if (p.ix === ix && p.iz === iz) return 'park';
  for (const key of Object.keys(LANDMARK_BLOCKS)) {
    const b = LANDMARK_BLOCKS[key];
    if (b.ix === ix && b.iz === iz) return key;
  }
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
        const b = {
          minX: cx - spec.w / 2, maxX: cx + spec.w / 2,
          minZ: cz - spec.d / 2, maxZ: cz + spec.d / 2,
          h: spec.h, cx, cz, w: spec.w, d: spec.d, kind: special,
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

const homeOperario = landmarkCenter('home_operario');
const homeNobre = landmarkCenter('home_nobre');
const jobMercado = landmarkCenter('job_mercado');
const schoolCenter = landmarkCenter('school');

export const NPC_DEFS = [
  {
    id: 'almeida',
    name: 'Sr. Almeida',
    color: 0x6b4f3a,
    home: { x: plaza.x - 6, z: plaza.z + 5 },
    wanderRadius: 4,
    speed: 0,
    prop: 'cart',
  },
  {
    id: 'marina',
    name: 'Marina',
    color: 0x8a4b6b,
    home: { x: parkA.x + 3, z: parkA.z - 4 },
    wanderRadius: 8,
    speed: 1.1,
    prop: null,
  },
  {
    id: 'diego',
    name: 'Diego',
    color: 0x3a4a6b,
    home: { x: plaza.x + 8, z: plaza.z - 7 },
    wanderRadius: 0,
    speed: 0,
    prop: 'phone',
  },
  {
    id: 'busker',
    name: 'Yara, a Musicista',
    color: 0x2f6b4f,
    home: { x: plaza.x, z: plaza.z + 10 },
    wanderRadius: 0,
    speed: 0,
    prop: 'guitar',
  },
  {
    id: 'runner',
    name: 'Caio',
    color: 0x6b2f3a,
    home: { x: parkB.x - 5, z: parkB.z + 6 },
    wanderRadius: 10,
    speed: 2.6,
    prop: null,
  },
  {
    id: 'mae_operaria',
    name: 'Dona Rosa',
    color: 0x8a5a3a,
    home: frontOf(homeOperario, 'home_operario', 3),
    wanderRadius: 2,
    speed: 0,
    prop: null,
  },
  {
    id: 'seu_ivo',
    name: 'Seu Ivo',
    color: 0x4a6b3a,
    home: frontOf(jobMercado, 'job_mercado', 3),
    wanderRadius: 1.5,
    speed: 0.4,
    prop: 'cart',
  },
  {
    id: 'mae_nobre',
    name: 'Dona Beatriz',
    color: 0x6b3a5a,
    home: frontOf(homeNobre, 'home_nobre', 3),
    wanderRadius: 2,
    speed: 0,
    prop: null,
  },
  {
    id: 'professora',
    name: 'Professora Elaine',
    color: 0x3a5a6b,
    home: frontOf(schoolCenter, 'school', 3),
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

export function pronoun(sex, forms) {
  const key = sex === 'f' ? 'f' : sex === 'x' ? 'x' : 'm';
  return forms[key] ?? forms.m;
}

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
export const FRAGMENT_SPOTS = [
  { id: 'frag_1', position: { x: plaza.x + 3, z: plaza.z + 3 }, note: 'A luz da fonte da praça ao entardecer.' },
  { id: 'frag_2', position: { x: parkA.x, z: parkA.z - 8 }, note: 'Uma árvore solitária no meio do concreto.' },
  { id: 'frag_3', position: { x: parkB.x + 4, z: parkB.z - 3 }, note: 'Risos distantes num banco de parque.' },
  { id: 'frag_4', position: { x: plaza.x - 10, z: plaza.z - 12 }, note: 'Um reflexo de neon numa poça d\'água.' },
  { id: 'frag_5', position: { x: parkB.x - 6, z: parkB.z + 8 }, note: 'O silêncio raro entre duas buzinas.' },
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

// ---------------------------------------------------------------------------
// Diálogos — árvore simples por NPC. `effect` dispara ações no QuestSystem.
// ---------------------------------------------------------------------------
export const DIALOGUES = {
  almeida: {
    start: 'dynamic',
    nodes: {
      a1: {
        text: 'Sr. Almeida: "Ah, um rosto novo por aqui. Bem-vindo(a) à cidade, viajante. Nem tudo aqui é pressa e concreto, sabe?"',
        options: [{ label: 'O que você quer dizer?', next: 'a2' }],
      },
      a2: {
        text: 'Sr. Almeida: "Se você parar, de verdade, vai notar pequenos instantes que a maioria ignora. Alguns dizem que ficaram espalhados pela cidade, como ecos. Vale a pena procurar."',
        options: [
          { label: 'Vou procurar esses ecos.', next: 'a3', effect: { type: 'completeObjective', quest: 'boas_vindas', objective: 'talk_almeida' } },
        ],
      },
      a3: {
        text: 'Sr. Almeida: "Boa sorte. E volte para conversar quando quiser — não tenho pressa nenhuma."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      idle: {
        text: 'Sr. Almeida: "O dia está bonito, não está? Ou a noite. Tanto faz — eu gosto dos dois."',
        options: [
          { label: 'Comprar um café (R$5) — recupera energia', next: 'a_coffee', effect: { type: 'buyCoffee' }, minMoney: 5 },
          { label: '(Encerrar conversa)', next: null },
        ],
      },
      a_coffee: {
        text: 'Sr. Almeida serve um café bem quente. "Toma. Nada como um cafezinho pra encarar o resto do dia."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
  marina: {
    start: 'dynamic',
    nodes: {
      m_intro: {
        text: 'Marina: "Oh, olá! Desculpe, estou um pouco distraída — perdi meu livro em algum lugar do parque e não consigo lembrar onde."',
        options: [
          { label: 'Posso ajudar a procurar.', next: 'm_accept', effect: { type: 'startQuest', quest: 'livro_esquecido' } },
        ],
      },
      m_accept: {
        text: 'Marina: "Sério? Obrigada! Acho que deixei perto de uma árvore, lendo à sombra. Se encontrar, me avisa."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      m_wait: {
        text: 'Marina: "Ainda não encontrou meu livro? Sem pressa... mas eu sinto falta dele."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      m_return: {
        text: 'Marina: "Você encontrou! Não sabe o quanto isso significa — não é só um livro, são anotações de anos. Obrigada, de verdade."',
        options: [
          { label: 'Fico feliz em ajudar.', next: 'm_thanks', effect: { type: 'completeObjective', quest: 'livro_esquecido', objective: 'return_book' } },
        ],
      },
      m_thanks: {
        text: 'Marina: "Se um dia quiser conversar sobre livros, ou sobre nada em especial, estarei por aqui."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      m_done: {
        text: 'Marina sorri, segurando o livro perto do peito, observando o movimento da cidade ao redor.',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
  diego: {
    start: 'dynamic',
    nodes: {
      d_day: {
        text: 'Diego não levanta os olhos do celular. "Fala..." (ele nem percebe direito que você está aqui.)',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      d_night: {
        text: 'Diego, surpreendentemente, guarda o celular no bolso. "Ei. Desculpa, eu... percebi que passo o dia inteiro olhando pra tela. Nem sei mais como é ficar só olhando a rua."',
        options: [{ label: 'Às vezes só isso já basta.', next: 'd_night2', effect: { type: 'completeObjective', quest: 'desconectar', objective: 'talk_diego_night' } }],
      },
      d_night2: {
        text: 'Diego: "É. Acho que vou tentar fazer isso mais vezes." Ele guarda o celular por mais um instante, olhando as luzes da cidade.',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      d_after: {
        text: 'Diego acena, o celular ainda no bolso por enquanto. "E aí. Bela noite, né?"',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
  busker: {
    start: 'y1',
    nodes: {
      y1: {
        text: 'Yara toca um violão baixinho. "Ninguém precisa parar. Mas se parar, obrigada por ouvir."',
        options: [{ label: 'Está linda a música.', next: 'y2' }],
      },
      y2: {
        text: 'Yara: "Toco pra cidade, mesmo quando ela não escuta. Um dia ela escuta."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
  runner: {
    start: 'c1',
    nodes: {
      c1: {
        text: 'Caio, ofegante, para um instante. "Corro todo dia nesse parque. É o único momento em que meu cérebro desliga de verdade."',
        options: [{ label: 'Faz sentido.', next: 'c2' }],
      },
      c2: {
        text: 'Caio: "Tenta correr também, um dia desses. Ou só andar. A cidade fica diferente quando você se move nela por vontade própria."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
  mae_operaria: {
    start: 'dynamic',
    nodes: {
      ro_greet: {
        text: (sex) => `Dona Rosa te abraça apertado. "Bom dia, ${pronoun(sex, { m: 'meu filho', f: 'minha filha', x: 'meu bem' })}. Primeiro dia no mercado, hein? Não se atrasa, o Seu Ivo é bonzinho mas não gosta de esperar."`,
        options: [{ label: 'Pode deixar, mãe.', next: null }],
      },
      ro_ok: {
        text: 'Dona Rosa: "Tá indo bem no trabalho, viu? Fico orgulhosa."',
        options: [
          { label: 'Comer algo em casa (grátis)', next: 'ro_eat', effect: { type: 'eatHome' }, maxHunger: 90 },
          { label: '(Encerrar conversa)', next: null },
        ],
      },
      ro_worried: {
        text: 'Dona Rosa franze a testa. "Ouvi dizer que você faltou o serviço. Tá tudo bem? Sabe que a gente precisa desse dinheiro..."',
        options: [
          { label: 'Comer algo em casa (grátis)', next: 'ro_eat', effect: { type: 'eatHome' }, maxHunger: 90 },
          { label: 'Vou dar um jeito, mãe.', next: null },
        ],
      },
      ro_eat: {
        text: 'Dona Rosa serve um prato caseiro fumegante. "Come direito, viu?"',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      ro_fired: {
        text: 'Dona Rosa te olha preocupada, mas segura sua mão. "A gente dá um jeito. Sempre deu."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      ro_stranger: {
        text: 'Dona Rosa acena gentilmente, ocupada varrendo a calçada. "Oi, querido(a). Precisando de alguma coisa?"',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
  seu_ivo: {
    start: 'dynamic',
    nodes: {
      iv_intro: {
        text: 'Seu Ivo: "Então é você que a Rosa me falou. Bem-vindo(a) ao mercado. É simples: chega até às 14h, ajuda no que precisar. Combinado?"',
        options: [{ label: 'Combinado.', next: null }],
      },
      iv_ok: {
        text: 'Seu Ivo acena com a cabeça. "Bom te ver por aqui hoje."',
        options: [
          { label: 'Comprar comida (R$8)', next: 'iv_food', effect: { type: 'buyFood' }, minMoney: 8, maxHunger: 90 },
          { label: '(Encerrar conversa)', next: null },
        ],
      },
      iv_warning: {
        text: 'Seu Ivo cruzou os braços. "Já é a segunda falta. Mais uma e eu vou ter que te dispensar."',
        options: [{ label: 'Não vai se repetir.', next: null }],
      },
      iv_fired: {
        text: 'Seu Ivo balançou a cabeça, sem graça. "Sinto muito, mas não posso mais contar com você. Vamos ter que nos despedir."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      iv_stranger: {
        text: 'Seu Ivo organiza as caixas da barraca. "Bom dia! Precisando de alguma coisa do mercado?"',
        options: [
          { label: 'Comprar comida (R$8)', next: 'iv_food', effect: { type: 'buyFood' }, minMoney: 8, maxHunger: 90 },
          { label: '(Encerrar conversa)', next: null },
        ],
      },
      iv_food: {
        text: 'Seu Ivo embrulha um lanche fresco. "Bom proveito!"',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
  mae_nobre: {
    start: 'dynamic',
    nodes: {
      bt_greet: {
        text: (sex) => `Dona Beatriz ajusta sua roupa antes que você saia. "Bom dia, ${pronoun(sex, { m: 'querido', f: 'querida', x: 'meu bem' })}. Primeiro dia na escola nova — nada de chegar atrasado(a), a diretoria liga pra essas coisas."`,
        options: [{ label: 'Pode deixar.', next: null }],
      },
      bt_ok: {
        text: 'Dona Beatriz: "Suas notas continuam boas, presumo. Continue assim."',
        options: [
          { label: 'Comer algo em casa (grátis)', next: 'bt_eat', effect: { type: 'eatHome' }, maxHunger: 90 },
          { label: '(Encerrar conversa)', next: null },
        ],
      },
      bt_worried: {
        text: 'Dona Beatriz: "Recebi uma ligação da escola sobre uma falta. Isso não pode virar hábito, ouviu?"',
        options: [
          { label: 'Comer algo em casa (grátis)', next: 'bt_eat', effect: { type: 'eatHome' }, maxHunger: 90 },
          { label: 'Não vai se repetir.', next: null },
        ],
      },
      bt_eat: {
        text: 'Uma empregada serve um prato elegante à mesa. Dona Beatriz observa de longe, aprovando em silêncio.',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      bt_fired: {
        text: 'Dona Beatriz suspira, contrariada, mas por baixo da cobrança há genuína preocupação. "Vamos conversar com calma sobre isso."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      bt_stranger: {
        text: 'Dona Beatriz cumprimenta com um aceno educado, mas distante. "Boa tarde."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
  professora: {
    start: 'dynamic',
    nodes: {
      el_intro: {
        text: 'Professora Elaine: "Seja bem-vindo(a) à turma. As aulas vão das 8h às 14h, sem exceções. Vamos começar bem?"',
        options: [{ label: 'Vamos.', next: null }],
      },
      el_ok: {
        text: 'Professora Elaine: "Bom te ver na aula de hoje."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      el_warning: {
        text: 'A Professora Elaine suspirou. "Mais uma falta e eu vou ter que chamar seus pais."',
        options: [{ label: 'Entendido.', next: null }],
      },
      el_fired: {
        text: 'Professora Elaine anotou algo com pesar. "Seu desempenho caiu demais. Precisamos conversar sério sobre isso."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
      el_stranger: {
        text: 'Professora Elaine organiza seus materiais. "Olá. Aula em instantes."',
        options: [{ label: '(Encerrar conversa)', next: null }],
      },
    },
  },
};
