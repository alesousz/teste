// Configuração e conteúdo do mundo. Layout da cidade é gerado uma única vez
// (no load do módulo) e compartilhado por todos os sistemas — por isso não
// precisa de seed determinística: é um singleton de módulo ES.
// A cena de scene.js ou, no Modo Viver, a que o editor de mapa gravou.
import { CENA as SCENE } from './data/cenaAtiva.js';
// Missões: dado de conteúdo, escrito no editor de diálogos (aba Missões)
// e gravado em src/data/quests.json — não se mexe em código pra criar uma.
import MISSOES_PUBLICADAS from './data/quests.json' with { type: 'json' };
import ITENS_PUBLICADOS from './data/items.json' with { type: 'json' };
// Rotina (compromissos, casas, origens, cursos): mesmo caminho das missoes -
// arquivo de conteudo escrito na aba Rotina do editor.
import ROTINA_PUBLICADA from './data/routine.json' with { type: 'json' };
import { normalizarRotina, resolverLocal, janelasPorNpc, serveComoRotina, validarRotina } from './rotina.js';

/**
 * Rascunho do editor de conteúdo NESTA máquina: escreveu a missão (ou o item),
 * abriu o jogo, já está lá. Quem não tem rascunho — outra máquina, o site —
 * joga com o que está publicado. `serve` decide se o rascunho tem cara de
 * conteúdo válido; qualquer coisa estranha cai no publicado.
 */
function rascunhoDeConteudo(chave, serve) {
  if (typeof location === 'undefined') return null;   // testes em Node
  try {
    const bruto = localStorage.getItem(chave);
    const lido = bruto ? JSON.parse(bruto) : null;
    return lido && typeof lido === 'object' && serve(lido) ? lido : null;
  } catch {
    return null;
  }
}

const missoesDoEditor = () => rascunhoDeConteudo('quest-editor-draft', lido => Object.entries(lido)
  .every(([id, q]) => q?.id === id && Array.isArray(q.objectives) && q.objectives.length));

export const QUESTS = missoesDoEditor() ?? MISSOES_PUBLICADAS;

export const CONFIG = {
  GRID_SIZE: 5,
  BLOCK_SIZE: 40,
  ROAD_WIDTH: 10,
  DAY_LENGTH_SECONDS: 480, // duração de um ciclo dia/noite completo
  PLAYER_SPEED_WALK: 3.2,
  PLAYER_SPEED_RUN: 6.5,
  PLAYER_SPEED_CROUCH: 1.8,
  // 0,76 m de diâmetro: passa nos vãos de porta de 0,88–0,90 m do Building
  // Kit (decisão de 13/09/2026; era 0,45).
  PLAYER_RADIUS: 0.38,
  PLAYER_HEIGHT: 1.7,          // altura do corpo usada na colisão
  CAM_DIST_OUTDOOR: 6.5,       // câmera na rua
  CAM_DIST_INDOOR: 2.5,        // câmera dentro do prédio: 6,5 m não cabe num quarto
  CAM_DIST_LERP: 4.5,          // velocidade da transição entre as duas
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

// Quarteirão do prédio residencial onde o jogo começa — vizinho da praça, pra
// que a saída do prédio já caia num lugar com vida. O quarteirão é RESERVADO
// (a geração procedural não põe nada aqui), mas de propósito NÃO entra em
// CITY.buildings: o prédio inicial é feito de peças de kit na cena,
// e uma AABB maciça no lugar impediria o jogador de entrar nele.
const HOME_BLOCK = { ix: 2, iz: 1 };
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

// Cidade fixa (`cidade: 'fixa'` na cena): todo prédio vem da cena e dá pra
// mexer nele no editor de mapa. Sem isso, os lotes são sorteados a cada
// carregamento, como antes (tools/fixar-cidade.mjs grava uma versão fixa).
const CIDADE_FIXA = SCENE.cidade === 'fixa';

const sceneLandmarks = {}; // kind -> {cx,cz,ix,iz}
const sceneBuildings = []; // prédios da cena: {cx,cz,w,d,h,color,estilo,semente,ix,iz}
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
      // 'cidade': fachada com janelas e toldo, como os prédios gerados.
      estilo: item.props?.estilo ?? 'liso', semente: item.props?.semente ?? 0,
    });
  }
}

// Onde o jogador acorda numa partida nova: a peça "Início do jogo" da cena.
// Sem ela, vale o quarto do prédio em código (World.interior.spawn).
const pecaDeInicio = SCENE.items.find(item => item.typeId === 'spawn');
export const SPAWN_DA_CENA = pecaDeInicio
  ? {
    x: pecaDeInicio.position[0], y: pecaDeInicio.position[1], z: pecaDeInicio.position[2],
    facing: Number.isFinite(pecaDeInicio.rotY) ? pecaDeInicio.rotY : 0,
  }
  : null;

function isSpecial(ix, iz) {
  if (ix === PLAZA.ix && iz === PLAZA.iz) return 'plaza';
  if (ix === HOME_BLOCK.ix && iz === HOME_BLOCK.iz) return 'predio_inicial';
  for (const p of PARKS) if (p.ix === ix && p.iz === iz) return 'park';
  for (const kind of Object.keys(sceneLandmarks)) {
    if (sceneLandmarks[kind].ix === ix && sceneLandmarks[kind].iz === iz) return kind;
  }
  if (sceneBuildings.some(b => b.ix === ix && b.iz === iz)) return 'custom';
  return null;
}

const BUILDING_COLORS = [0xb9c4cc, 0xc9b6a3, 0x9fb3c8, 0xd9cba8, 0xa8a8a8, 0x8fa998, 0xc7a9a0];

// Lote de um marco e de um prédio da cena, com a caixa de colisão.
function loteDoMarco(kind, pos) {
  const spec = LANDMARK_SPECS[kind];
  return {
    minX: pos.cx - spec.w / 2, maxX: pos.cx + spec.w / 2,
    minZ: pos.cz - spec.d / 2, maxZ: pos.cz + spec.d / 2,
    h: spec.h, cx: pos.cx, cz: pos.cz, w: spec.w, d: spec.d, kind,
  };
}

function loteDaCena(cb) {
  return {
    minX: cb.cx - cb.w / 2, maxX: cb.cx + cb.w / 2,
    minZ: cb.cz - cb.d / 2, maxZ: cb.cz + cb.d / 2,
    h: cb.h, cx: cb.cx, cz: cb.cz, w: cb.w, d: cb.d, custom: true,
    color: cb.color, estilo: cb.estilo, winSeed: cb.semente,
  };
}

/**
 * Monta a cidade. `random` sorteia os lotes (o jogo usa Math.random; o script
 * de fixar a cidade passa um sorteador com semente). Com `fixa`, nada é
 * sorteado: cada marco e prédio da cena entra no quarteirão mais perto, quantos
 * forem.
 */
export function gerarCidade(random = Math.random, { fixa = CIDADE_FIXA } = {}) {
  const rand = (min, max) => min + random() * (max - min);
  const blocks = [];
  const buildings = []; // AABBs planos {minX,maxX,minZ,maxZ,h,colorIdx,seed}

  for (let ix = 0; ix < CONFIG.GRID_SIZE; ix++) {
    for (let iz = 0; iz < CONFIG.GRID_SIZE; iz++) {
      const { x: cx, z: cz } = blockCenter(ix, iz);
      const special = isSpecial(ix, iz);
      const block = { ix, iz, cx, cz, type: special || 'urban', lots: [] };
      const pôr = b => { buildings.push(b); block.lots.push(b); };

      if (fixa) {
        for (const [kind, pos] of Object.entries(sceneLandmarks)) {
          if (pos.ix === ix && pos.iz === iz) pôr(loteDoMarco(kind, pos));
        }
        for (const cb of sceneBuildings) {
          if (cb.ix === ix && cb.iz === iz) pôr(loteDaCena(cb));
        }
      } else if (special && LANDMARK_SPECS[special]) {
        pôr(loteDoMarco(special, sceneLandmarks[special]));
      } else if (special === 'custom') {
        pôr(loteDaCena(sceneBuildings.find(b => b.ix === ix && b.iz === iz)));
      } else if (!special) {
        const half = CONFIG.BLOCK_SIZE / 2;
        const margin = 3;
        const usable = half - margin;
        const splitAxis = random() < 0.55 ? null : (random() < 0.5 ? 'x' : 'z');

        const makeBuilding = (bx, bz, w, d) => {
          const h = rand(7, 38);
          const colorIdx = Math.floor(random() * BUILDING_COLORS.length);
          const winSeed = Math.floor(random() * 10000);
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

  return { blocks, buildings, fixa, plazaCenter: blockCenter(PLAZA.ix, PLAZA.iz), parkCenters: PARKS.map(p => blockCenter(p.ix, p.iz)) };
}

export const CITY = gerarCidade();

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
// Gente da cidade: cada peça "NPC" da cena diz quem é a pessoa (nome, cor,
// se anda por aí, o que carrega) além de onde ela fica. Criar um NPC novo é
// colocar a peça no editor e preencher os campos — sem passar por aqui.
const PECAS_DE_NPC = SCENE.items.filter(item => item.typeId === 'npc' && item.props?.npcId);

const numero = (v, padrao) => (Number.isFinite(v) ? v : padrao);

export const NPC_DEFS = PECAS_DE_NPC.map(item => {
  const p = item.props;
  return {
    id: p.npcId,
    name: p.nome || p.npcId,
    color: p.cor || '#6b4f3a',
    sexo: p.sexo === 'f' ? 'f' : 'm',
    home: { x: item.position[0], z: item.position[2] },
    wanderRadius: numero(p.raio, 0),
    speed: numero(p.velocidade, 0),
    prop: p.objeto || null,
  };
});

// ---------------------------------------------------------------------------
// Casa / Origem / Rotina - o nucleo do "life sim": qual compromisso o
// personagem tem todo dia, onde ele dorme e com quanto dinheiro comeca.
// Isso e conteudo: mora em src/data/routine.json, escrito na aba Rotina do
// editor de conteudo. O local de cada compromisso nao e coordenada digitada:
// e um marco do mapa (mercado, escola, casa), entao mover o predio no editor
// de mapa move o compromisso junto.
// ---------------------------------------------------------------------------
const rotinaDoEditor = () => rascunhoDeConteudo('routine-editor-draft', serveComoRotina);
const rotinaEscrita = rotinaDoEditor();
// Verdade sobre de onde veio a rotina desta partida: com rascunho, quem está
// jogando é o autor testando o que escreveu, e ele precisa saber se o que
// carregou tem erro (ver ROTINA_PROBLEMAS, usado pelo toast em main.js).
export const ROTINA_E_RASCUNHO = !!rotinaEscrita;
export const ROTINA = normalizarRotina(rotinaEscrita ?? ROTINA_PUBLICADA);

// Marcos que existem de fato na cena: o editor lista estes e a validacao
// recusa compromisso apontando pra um marco que ninguem colocou no mapa.
export const MARCOS_DA_CENA = Object.keys(LANDMARK_SPECS)
  .filter(kind => CITY.buildings.some(b => b.kind === kind));

// Como o mundo responde "onde fica X" pro resolvedor de local (rotina.js).
const MUNDO_DA_ROTINA = {
  marco: kind => {
    const b = CITY.buildings.find(b => b.kind === kind);
    return b ? { x: b.cx, z: b.cz, w: b.w, d: b.d } : null;
  },
  npc: id => {
    const n = NPC_DEFS.find(n => n.id === id);
    return n ? { x: n.home.x, z: n.home.z } : null;
  },
};

// Marco sumiu do mapa (o autor apagou a escola) e o ponto nao resolve: cai na
// praca central em vez de NaN. O jogo continua jogavel e os testes de
// conteudo apontam o buraco.
const PONTO_DE_RESERVA = () => ({ x: CITY.plazaCenter.x, z: CITY.plazaCenter.z });
const pontoDoLocal = local => resolverLocal(local, MUNDO_DA_ROTINA) ?? PONTO_DE_RESERVA();

export const HOMES = Object.fromEntries(Object.values(ROTINA.homes)
  .map(casa => [casa.id, { id: casa.id, kind: casa.kind, sleepSpot: pontoDoLocal(casa.local) }]));

export const OBLIGATIONS = Object.fromEntries(Object.values(ROTINA.obligations)
  .map(ob => [ob.id, { ...ob, location: pontoDoLocal(ob.local) }]));

export const ORIGINS = ROTINA.origins;
export const COURSES = ROTINA.courses;

// Horario de funcionamento de cada NPC com compromisso (npc.js usa pra fechar
// o lugar fora do turno). Sai do mesmo dado, sem tabela paralela.
export const JANELAS_DE_NPC = janelasPorNpc(OBLIGATIONS);

// A mesma conferência que o editor mostra, agora contra a cena de verdade.
// O jogo não se recusa a abrir por causa disso — normalizarRotina já garantiu
// que dá pra jogar —, mas quem está com rascunho aberto vê o aviso na tela.
export const ROTINA_PROBLEMAS = validarRotina(rotinaEscrita ?? ROTINA_PUBLICADA, {
  npcs: new Set(NPC_DEFS.map(n => n.id)),
  marcos: new Set(MARCOS_DA_CENA),
});

// ---------------------------------------------------------------------------
// Fragmentos de memória: peças 'fragment' da cena. Cada uma diz a nota que
// entra no diário e, se quiser, a missão e o objetivo que ela conta.
// ---------------------------------------------------------------------------
export const FRAGMENT_SPOTS = SCENE.items
  .filter(item => item.typeId === 'fragment')
  .map((item, i) => {
    const [x, , z] = item.position;
    return {
      id: `frag_${i + 1}`,
      position: { x, z },
      note: item.props?.note || '',
      questId: item.props?.questId || 'ecos_perdidos',
      objetivo: item.props?.objetivo || 'frags',
    };
  });

// ---------------------------------------------------------------------------
// Itens: o que existe pra carregar no inventário, escrito no editor de
// conteúdo (aba Itens) e gravado em src/data/items.json. O efeito só é
// aplicado quando o jogador usa o item pelo diário.
// ---------------------------------------------------------------------------
const itensDoEditor = () => rascunhoDeConteudo('item-editor-draft', lido => lido?.items && lido?.categories);
const ITENS = itensDoEditor() ?? ITENS_PUBLICADOS;

export const ITEM_CATEGORIES = ITENS.categories;
export const ITEM_DEFS = ITENS.items;

// ---------------------------------------------------------------------------
// Coisas largadas pelo chão: peças 'item_no_chao' da cena. Com um item
// escolhido, ela vai pro inventário ao ser pega; com missão e objetivo, marca
// o objetivo (é assim que o livro de Marina funciona). Dá pra ter os dois.
// ---------------------------------------------------------------------------
export const WORLD_ITEM_SPOTS = SCENE.items
  .filter(item => item.typeId === 'item_no_chao')
  .map(item => {
    const [x, , z] = item.position;
    const p = item.props ?? {};
    // O id entra no save: fica estável enquanto a peça não mudar de lugar.
    return {
      id: `item_${p.itemId || 'missao'}_${x}_${z}`,
      itemId: p.itemId || null,
      rotulo: p.rotulo || null,
      questId: p.questId || null,
      objetivo: p.objetivo || null,
      position: { x, z },
    };
  });

// ---------------------------------------------------------------------------
// Missões
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Controles — ações remapeáveis (lidas pelo main.js via ui.getBinding(id)) e
// os controles que continuam fixos por enquanto porque vivem em player.js
// (movimento, corrida, pulo, agachar) — só exibidos como referência na tela
// de configurações, não editáveis.
// ---------------------------------------------------------------------------
export const KEYBIND_ACTIONS = [
  { id: 'interact', label: 'Interagir / conversar' },
  { id: 'photo', label: 'Fotografar fragmento' },
  { id: 'dodge', label: 'Esquivar' },
  { id: 'journal', label: 'Diário' },
  { id: 'items', label: 'Itens' },
  { id: 'pause', label: 'Pausar' },
];

export const DEFAULT_KEYBINDS = {
  interact: 'KeyE',
  photo: 'KeyF',
  dodge: 'KeyQ',
  journal: 'Tab',
  items: 'KeyI',
  pause: 'Escape',
};

export const FIXED_CONTROLS = [
  { label: 'Mover', keys: ['W', 'A', 'S', 'D'] },
  { label: 'Correr', keys: ['Shift'] },
  { label: 'Pular', keys: ['Space'] },
  { label: 'Agachar', keys: ['C'] },
  { label: 'Olhar ao redor', device: 'Mouse' },
  { label: 'Socar', device: 'Clique esquerdo' },
];

// ---------------------------------------------------------------------------
// Tela de carregamento: imagens de fundo e dicas. A tela sorteia uma imagem
// por carregamento e passa as dicas em rotação.
// ---------------------------------------------------------------------------
export const LOADING_SHOTS = [
  'assets/loading/praca-noite.jpg',
  'assets/loading/mercado-manha.jpg',
  'assets/loading/parque-chuva.jpg',
  'assets/loading/predios-alvorada.jpg',
];

export const LOADING_TIPS = [
  'Faltar ao compromisso do dia tem consequência: primeiro vem o aviso, depois a demissão ou a expulsão do curso.',
  'Dormir em casa recupera a energia toda e avança para a manhã seguinte.',
  'Fragmentos de memória brilham em dourado. Chegue perto e pressione a tecla de foto.',
  'Ficar exausto deixa você mais lento e sem poder correr. Um café resolve por um tempo.',
  'Alguns NPCs só têm certas conversas depois que a noite cai.',
  'A bússola no topo mostra sua casa e o compromisso do dia; os pontos dourados são fragmentos.',
  'O peso e o valor dos itens são só informação — não existe limite de carga.',
  'O jogo salva sozinho a cada 20 segundos e quando você pausa.',
];

// ---------------------------------------------------------------------------
// Diário › Pessoas: quem aparece na aba e o que mostrar sobre cada um.
// `blurb` é a linha curta na tabela; `role`/`place` formam o subtítulo da
// ficha. Os ids têm que casar com os que o gameState usa (mesmos ids de
// NPC_DEFS) — "rosa" do rascunho original era, na verdade, mae_operaria.
// ---------------------------------------------------------------------------
export const RELATIONSHIP_MAX = 5;

// Diário › Pessoas: entra quem tem um resumo escrito na peça.
export const NPC_PROFILES = Object.fromEntries(PECAS_DE_NPC
  .filter(item => item.props.resumo)
  .map(item => [item.props.npcId, {
    id: item.props.npcId,
    name: item.props.nome || item.props.npcId,
    blurb: item.props.resumo,
    role: item.props.papel || '',
    place: item.props.lugar || '',
    ...(item.props.missao ? { quest: item.props.missao } : {}),
  }]));

