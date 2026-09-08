// Mobília e objetos do apartamento 201 (o inicial) e das áreas comuns do
// prédio — corredor do andar e saguão do térreo.
//
// A ideia central: as medidas de cada peça moram numa tabela PURA (MOVEIS),
// sem three.js e sem DOM, e são consumidas em três lugares diferentes — a
// geometria visual (buildApartmentProps), os AABBs de colisão
// (apartmentSolids) e os pontos de interação (apartmentAnchors). Assim o que
// o jogador vê, o que ele esbarra e o que ele pode usar nunca saem de
// sincronia, e os testes conseguem checar as três coisas sem WebGL.
//
// Tudo em COORDENADAS LOCAIS do prédio, as mesmas de src/data/apartment.js:
// x = largura, z = profundidade, y = altura, térreo em y = 0 e andar dos
// apartamentos em y = AP.FLOOR_H. Quem chama é que aplica a translação pro
// mundo — nada aqui conhece coordenadas de mundo.
//
// As posições são sempre derivadas dos retângulos de ROOMS/LOBBY/CORRIDOR:
// se a planta mudar, a mobília acompanha.

import { AP, LEVELS, ROOMS, LOBBY, CORRIDOR, WINDOWS } from './data/apartment.js';

const Y_TERREO = LEVELS[0].y;   // piso do saguão
const Y_ANDAR = LEVELS[1].y;    // piso do apartamento e do corredor

// Atalhos pros retângulos dos cômodos (fonte de verdade das medidas).
const Q = ROOMS.quarto;
const BA = ROOMS.banheiro;
const SL = ROOMS.sala;

// A janela do quarto vem da planta; a âncora "olhar pela janela" usa a
// altura real do vão em vez de um número inventado.
const JANELA = WINDOWS.find(w => w.room === 'quarto' && w.level === 1);

// ---------------------------------------------------------------------------
// Tabela de móveis. Cada entrada já é o AABB do objeto em coordenadas locais
// (envelope: nenhuma peça da geometria sai da caixa no plano x/z), com:
//   tag    — nome curto em português, pra depuração;
//   room   — cômodo/ambiente a que pertence;
//   solido — se o jogador esbarra nele.
// `box.y0/y1` são relativos ao piso do ambiente; o helper soma o piso.
// ---------------------------------------------------------------------------
function movel(tag, room, piso, box, solido = true) {
  return {
    tag,
    room,
    solido,
    minX: box.x0, maxX: box.x1,
    minY: piso + box.y0, maxY: piso + box.y1,
    minZ: box.z0, maxZ: box.z1,
  };
}

const MOVEIS = [
  // --- Quarto -------------------------------------------------------------
  // Cama de solteiro encostada na parede oeste, cabeceira na parede da
  // janela; o SPAWN da planta cai justo do lado dela.
  movel('cama', 'quarto', Y_ANDAR, {
    x0: Q.x0 + 0.10, x1: Q.x0 + 1.00,
    z0: Q.z0 + 0.10, z1: Q.z0 + 2.00,
    y0: 0, y1: 0.55,
  }),
  movel('criado_mudo', 'quarto', Y_ANDAR, {
    x0: Q.x0 + 1.10, x1: Q.x0 + 1.55,
    z0: Q.z0 + 0.10, z1: Q.z0 + 0.52,
    y0: 0, y1: 0.52,
  }),
  // O abajur é um volume à parte (em cima do criado-mudo) só pra não inflar
  // o AABB de colisão do móvel com uma peça frágil.
  movel('abajur', 'quarto', Y_ANDAR, {
    x0: Q.x0 + 1.23, x1: Q.x0 + 1.43,
    z0: Q.z0 + 0.21, z1: Q.z0 + 0.41,
    y0: 0.52, y1: 0.88,
  }, false),
  // Guarda-roupa na parede da porta, a leste do vão (o vão fica em x≈1.7).
  movel('guarda_roupa', 'quarto', Y_ANDAR, {
    x0: Q.x1 - 0.75, x1: Q.x1 - 0.04,
    z0: Q.z1 - 0.55, z1: Q.z1 - 0.04,
    y0: 0, y1: 2.05,
  }),
  // Tapete: dá pra pisar em cima, então não entra em `solids`.
  movel('tapete', 'quarto', Y_ANDAR, {
    x0: Q.x0 + 1.15, x1: Q.x0 + 2.25,
    z0: Q.z0 + 0.65, z1: Q.z0 + 1.85,
    y0: 0, y1: 0.02,
  }, false),

  // --- Banheiro -----------------------------------------------------------
  movel('box_banho', 'banheiro', Y_ANDAR, {
    x0: BA.x0 + 0.05, x1: BA.x0 + 0.95,
    z0: BA.z0 + 0.10, z1: BA.z0 + 1.00,
    y0: 0, y1: 1.95,
  }),
  movel('vaso', 'banheiro', Y_ANDAR, {
    x0: BA.x0 + 0.07, x1: BA.x0 + 0.67,
    z0: BA.z0 + 1.45, z1: BA.z0 + 2.20,
    y0: 0, y1: 0.78,
  }),
  movel('pia_banheiro', 'banheiro', Y_ANDAR, {
    x0: BA.x1 - 0.55, x1: BA.x1 - 0.02,
    z0: BA.z0 + 1.25, z1: BA.z0 + 2.15,
    y0: 0, y1: 0.88,
  }),
  // Espelho colado na parede leste, acima da pia — decorativo.
  movel('espelho', 'banheiro', Y_ANDAR, {
    x0: BA.x1 - 0.04, x1: BA.x1,
    z0: BA.z0 + 1.37, z1: BA.z0 + 2.03,
    y0: 1.05, y1: 1.75,
  }, false),

  // --- Sala e cozinha -----------------------------------------------------
  movel('sofa', 'sala', Y_ANDAR, {
    x0: SL.x0 + 0.15, x1: SL.x0 + 1.65,
    z0: SL.z0 + 1.70, z1: SL.z0 + 2.55,
    y0: 0, y1: 0.82,
  }),
  movel('mesinha_centro', 'sala', Y_ANDAR, {
    x0: SL.x0 + 0.35, x1: SL.x0 + 1.40,
    z0: SL.z0 + 2.80, z1: SL.z0 + 3.40,
    y0: 0, y1: 0.42,
  }),
  movel('rack_tv', 'sala', Y_ANDAR, {
    x0: SL.x0 + 0.10, x1: SL.x0 + 1.50,
    z0: SL.z1 - 0.50, z1: SL.z1 - 0.08,
    y0: 0, y1: 0.50,
  }),
  // Monitor antigo e porta-retratos ficam APOIADOS no rack: o rack já barra
  // o jogador, então eles não precisam de colisão própria.
  movel('monitor', 'sala', Y_ANDAR, {
    x0: SL.x0 + 0.37, x1: SL.x0 + 0.97,
    z0: SL.z1 - 0.45, z1: SL.z1 - 0.12,
    y0: 0.50, y1: 0.98,
  }, false),
  movel('porta_retratos', 'sala', Y_ANDAR, {
    x0: SL.x0 + 1.21, x1: SL.x0 + 1.41,
    z0: SL.z1 - 0.38, z1: SL.z1 - 0.30,
    y0: 0.50, y1: 0.72,
  }, false),
  // Mesa pequena encostada na parede das portas, com as duas cadeiras do
  // lado de fora: é o único jeito de caber uma mesa aqui sem fechar a
  // passagem entre a porta de entrada, o quarto, o banheiro e a cozinha.
  // Deslocada 20 cm pro oeste quando os vãos foram alargados de 1,05 pra
  // 1,15 m — o jogador colide como um círculo de 0,90 m e não passava.
  movel('mesa_jantar', 'sala', Y_ANDAR, {
    x0: SL.x0 + 2.45, x1: SL.x0 + 3.35,
    z0: SL.z0 + 0.10, z1: SL.z0 + 0.80,
    y0: 0, y1: 0.75,
  }),
  movel('cadeira_oeste', 'sala', Y_ANDAR, {
    x0: SL.x0 + 2.50, x1: SL.x0 + 2.90,
    z0: SL.z0 + 0.85, z1: SL.z0 + 1.25,
    y0: 0, y1: 0.88,
  }),
  movel('cadeira_leste', 'sala', Y_ANDAR, {
    x0: SL.x0 + 2.95, x1: SL.x0 + 3.35,
    z0: SL.z0 + 0.85, z1: SL.z0 + 1.25,
    y0: 0, y1: 0.88,
  }),
  movel('bancada', 'sala', Y_ANDAR, {
    x0: SL.x1 - 0.65, x1: SL.x1 - 0.02,
    z0: SL.z0 + 1.00, z1: SL.z0 + 2.80,
    y0: 0, y1: 0.90,
  }),
  // Armário aéreo: fica inteiro por cima da bancada, que já é sólida — não
  // adianta duplicar a colisão num volume onde o jogador nunca entra.
  movel('armario_aereo', 'sala', Y_ANDAR, {
    x0: SL.x1 - 0.36, x1: SL.x1,
    z0: SL.z0 + 1.05, z1: SL.z0 + 2.70,
    y0: 1.50, y1: 2.10,
  }, false),
  movel('geladeira', 'sala', Y_ANDAR, {
    x0: SL.x1 - 0.74, x1: SL.x1 - 0.02,
    z0: SL.z0 + 2.85, z1: SL.z0 + 3.60,
    y0: 0, y1: 1.78,
  }),
  // Mural de fotos pendurado na parede entre as portas do quarto e do
  // banheiro — objeto pessoal, sem colisão.
  movel('mural_fotos', 'sala', Y_ANDAR, {
    x0: SL.x0 + 2.00, x1: SL.x0 + 2.70,
    z0: SL.z0, z1: SL.z0 + 0.05,
    y0: 1.35, y1: 2.05,
  }, false),

  // --- Corredor do andar --------------------------------------------------
  movel('luminaria_corredor', 'corredor', Y_ANDAR, {
    x0: (CORRIDOR.x0 + CORRIDOR.x1) / 2 - 0.22,
    x1: (CORRIDOR.x0 + CORRIDOR.x1) / 2 + 0.22,
    z0: (CORRIDOR.z0 + CORRIDOR.z1) / 2 - 0.22,
    z1: (CORRIDOR.z0 + CORRIDOR.z1) / 2 + 0.22,
    y0: AP.CEIL - 0.12, y1: AP.CEIL - 0.02,
  }, false),
  // A um quarto do comprimento do corredor, longe da luminária central.
  movel('extintor', 'corredor', Y_ANDAR, {
    x0: CORRIDOR.x0 + (CORRIDOR.x1 - CORRIDOR.x0) * 0.25 - 0.12,
    x1: CORRIDOR.x0 + (CORRIDOR.x1 - CORRIDOR.x0) * 0.25 + 0.12,
    z0: CORRIDOR.z1 - 0.18, z1: CORRIDOR.z1,
    y0: 0.85, y1: 1.45,
  }, false),

  // --- Saguão do térreo ---------------------------------------------------
  movel('banco_saguao', 'saguao', Y_TERREO, {
    x0: LOBBY.x0 + 0.10, x1: LOBBY.x0 + 0.60,
    z0: LOBBY.z0 + 5.25, z1: LOBBY.z0 + 7.05,
    y0: 0, y1: 0.88,
  }),
  movel('caixa_correio', 'saguao', Y_TERREO, {
    x0: LOBBY.x0, x1: LOBBY.x0 + 0.18,
    z0: LOBBY.z0 + 2.85, z1: LOBBY.z0 + 4.45,
    y0: 0.95, y1: 1.85,
  }, false),
];

// ---------------------------------------------------------------------------
// Pontos de interação. Ficam logo à frente do objeto (em espaço livre) e na
// altura em que o jogador olha pra ele; quem consome só precisa de
// proximidade + o rótulo.
// ---------------------------------------------------------------------------
const ANCORAS = [
  { id: 'cama', x: Q.x0 + 1.25, y: Y_ANDAR + 0.60, z: Q.z0 + 1.05, label: 'Dormir até de manhã', room: 'quarto' },
  {
    id: 'janela_quarto',
    x: JANELA.at,
    y: Y_ANDAR + JANELA.sill + JANELA.h / 2,
    z: Q.z0 + 0.55,
    label: 'Olhar pela janela',
    room: 'quarto',
  },
  { id: 'abajur', x: Q.x0 + 1.33, y: Y_ANDAR + 0.78, z: Q.z0 + 0.31, label: 'Acender o abajur', room: 'quarto' },
  { id: 'armario', x: Q.x1 - 0.40, y: Y_ANDAR + 1.20, z: Q.z1 - 0.75, label: 'Abrir o guarda-roupa', room: 'quarto' },
  { id: 'box_banho', x: BA.x0 + 1.10, y: Y_ANDAR + 1.30, z: BA.z0 + 0.55, label: 'Tomar um banho', room: 'banheiro' },
  { id: 'vaso', x: BA.x0 + 0.85, y: Y_ANDAR + 0.55, z: BA.z0 + 1.82, label: 'Usar o banheiro', room: 'banheiro' },
  { id: 'pia', x: BA.x1 - 0.70, y: Y_ANDAR + 1.05, z: BA.z0 + 1.70, label: 'Lavar o rosto', room: 'banheiro' },
  { id: 'sofa', x: SL.x0 + 1.45, y: Y_ANDAR + 0.55, z: SL.z0 + 2.13, label: 'Sentar no sofá', room: 'sala' },
  { id: 'tv', x: SL.x0 + 1.45, y: Y_ANDAR + 0.75, z: SL.z1 - 0.60, label: 'Ligar o monitor antigo', room: 'sala' },
  { id: 'porta_retratos', x: SL.x0 + 1.37, y: Y_ANDAR + 0.64, z: SL.z1 - 0.58, label: 'Olhar o porta-retratos', room: 'sala' },
  { id: 'mural_fotos', x: SL.x0 + 2.35, y: Y_ANDAR + 1.70, z: SL.z0 + 0.40, label: 'Ver o mural de fotos', room: 'sala' },
  { id: 'mesa', x: SL.x0 + 3.10, y: Y_ANDAR + 0.80, z: SL.z0 + 1.30, label: 'Sentar à mesa', room: 'sala' },
  { id: 'bancada', x: SL.x1 - 0.85, y: Y_ANDAR + 0.95, z: SL.z0 + 1.90, label: 'Preparar alguma coisa', room: 'sala' },
  { id: 'geladeira', x: SL.x1 - 0.92, y: Y_ANDAR + 1.15, z: SL.z0 + 3.22, label: 'Abrir a geladeira', room: 'sala' },
  { id: 'caixa_correio', x: LOBBY.x0 + 0.50, y: Y_TERREO + 1.40, z: LOBBY.z0 + 3.65, label: 'Ver a caixa de correio', room: 'saguao' },
  { id: 'banco_saguao', x: LOBBY.x0 + 0.80, y: Y_TERREO + 0.55, z: LOBBY.z0 + 6.15, label: 'Sentar no banco', room: 'saguao' },
];

// ---------------------------------------------------------------------------
// API pura (sem three.js) — usada pelos testes e por quem só quer os dados.
// ---------------------------------------------------------------------------

/** Todos os volumes declarados, sólidos ou não (cópia defensiva). */
export function apartmentBoxes() {
  return MOVEIS.map(m => ({ ...m }));
}

/** AABBs de colisão: um por móvel que o jogador não pode atravessar. */
export function apartmentSolids() {
  return MOVEIS.filter(m => m.solido).map(m => ({
    minX: m.minX, maxX: m.maxX,
    minY: m.minY, maxY: m.maxY,
    minZ: m.minZ, maxZ: m.maxZ,
    tag: m.tag,
    room: m.room,
  }));
}

/** Pontos de interação, com o rótulo que aparece pro jogador. */
export function apartmentAnchors() {
  return ANCORAS.map(a => ({ ...a }));
}

// ---------------------------------------------------------------------------
// Geometria. Só caixas e cilindros, com UMA BoxGeometry e UM CylinderGeometry
// compartilhados por todo o apartamento (as peças são escalas dessas duas) e
// um punhado de materiais reaproveitados — é o que segura o custo de render.
// ---------------------------------------------------------------------------

function criarMateriais(THREE) {
  const M = (color, opts) => new THREE.MeshStandardMaterial({ color, ...opts });
  return {
    madeira: M(0x8a6242, { roughness: 0.78, metalness: 0.02 }),
    madeiraEsc: M(0x5b4232, { roughness: 0.82, metalness: 0.02 }),
    tecido: M(0x5f6f80, { roughness: 0.95, metalness: 0 }),
    tecidoClaro: M(0xe6e1d6, { roughness: 0.9, metalness: 0 }),
    tecidoQuente: M(0x9c5f4e, { roughness: 0.95, metalness: 0 }),
    metal: M(0xb8bec6, { roughness: 0.35, metalness: 0.85 }),
    metalEsc: M(0x3a3f45, { roughness: 0.5, metalness: 0.6 }),
    ceramica: M(0xf3f2ee, { roughness: 0.25, metalness: 0.02 }),
    pedra: M(0x6f7276, { roughness: 0.6, metalness: 0.1 }),
    vidro: M(0xcfe3e8, { roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28 }),
    espelho: M(0xdfe7ea, { roughness: 0.05, metalness: 1 }),
    tela: M(0x15181d, { roughness: 0.35, metalness: 0.1 }),
    luz: M(0xffe7bd, { roughness: 0.6, metalness: 0, emissive: 0xffd9a0, emissiveIntensity: 0.55 }),
    vermelho: M(0xb0342a, { roughness: 0.5, metalness: 0.3 }),
    papel: M(0xd9cfc0, { roughness: 0.9, metalness: 0 }),
  };
}

// Uma caixa entre dois cantos, em coordenadas absolutas do prédio.
function peca(ctx, mat, box, { sombra = true, recebe = false } = {}) {
  const m = new ctx.THREE.Mesh(ctx.geoCaixa, mat);
  m.scale.set(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0);
  m.position.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2);
  m.castShadow = sombra;
  m.receiveShadow = recebe;
  ctx.alvo.add(m);
  return m;
}

// Um cilindro em pé (eixo y), pelo centro em x/z.
function cilindro(ctx, mat, { x, z, y0, y1, raio }, { sombra = true, recebe = false } = {}) {
  const m = new ctx.THREE.Mesh(ctx.geoCilindro, mat);
  m.scale.set(raio * 2, y1 - y0, raio * 2);
  m.position.set(x, (y0 + y1) / 2, z);
  m.castShadow = sombra;
  m.receiveShadow = recebe;
  ctx.alvo.add(m);
  return m;
}

// Abre um subgrupo nomeado pro móvel `tag` e devolve o AABB dele.
function iniciar(ctx, tag) {
  const rec = ctx.porTag.get(tag);
  const g = new ctx.THREE.Group();
  g.name = tag;
  g.userData.tag = tag;
  g.userData.room = rec.room;
  ctx.grupo.add(g);
  ctx.alvo = g;
  return rec;
}

function montarQuarto(ctx) {
  const mats = ctx.mats;

  // --- Cama de solteiro (cabeceira no lado da janela, z menor) ------------
  {
    const c = iniciar(ctx, 'cama');
    peca(ctx, mats.madeiraEsc, { x0: c.minX, x1: c.maxX, y0: c.minY, y1: c.minY + 0.28, z0: c.minZ, z1: c.maxZ });
    peca(ctx, mats.tecidoClaro, {
      x0: c.minX + 0.03, x1: c.maxX - 0.03,
      y0: c.minY + 0.28, y1: c.maxY,
      z0: c.minZ + 0.03, z1: c.maxZ - 0.03,
    }, { recebe: true });
    // Travesseiro e coberta dobrada no pé da cama.
    peca(ctx, mats.tecidoClaro, {
      x0: c.minX + 0.14, x1: c.maxX - 0.14,
      y0: c.maxY, y1: c.maxY + 0.09,
      z0: c.minZ + 0.10, z1: c.minZ + 0.42,
    }, { sombra: false });
    peca(ctx, mats.tecidoQuente, {
      x0: c.minX + 0.02, x1: c.maxX - 0.02,
      y0: c.maxY - 0.05, y1: c.maxY + 0.03,
      z0: c.minZ + 0.85, z1: c.maxZ - 0.02,
    }, { recebe: true });
    // Cabeceira: sobe acima do AABB de colisão (que para no colchão), mas
    // fica encostada na parede da janela, então não muda o caminhamento.
    peca(ctx, mats.madeiraEsc, {
      x0: c.minX, x1: c.maxX,
      y0: c.minY, y1: c.minY + 0.75,
      z0: c.minZ, z1: c.minZ + 0.06,
    });
  }

  // --- Criado-mudo + abajur ----------------------------------------------
  {
    const c = iniciar(ctx, 'criado_mudo');
    peca(ctx, mats.madeira, { x0: c.minX, x1: c.maxX, y0: c.minY, y1: c.maxY, z0: c.minZ, z1: c.maxZ }, { recebe: true });
    // Gaveta: só uma frente rebaixada + puxador.
    peca(ctx, mats.madeiraEsc, {
      x0: c.minX + 0.05, x1: c.maxX - 0.05,
      y0: c.minY + 0.26, y1: c.maxY - 0.06,
      z0: c.maxZ - 0.02, z1: c.maxZ,
    }, { sombra: false });
    peca(ctx, mats.metal, {
      x0: (c.minX + c.maxX) / 2 - 0.06, x1: (c.minX + c.maxX) / 2 + 0.06,
      y0: c.minY + 0.36, y1: c.minY + 0.40,
      z0: c.maxZ - 0.01, z1: c.maxZ,
    }, { sombra: false });
  }
  {
    const a = iniciar(ctx, 'abajur');
    const cx = (a.minX + a.maxX) / 2;
    const cz = (a.minZ + a.maxZ) / 2;
    cilindro(ctx, mats.metalEsc, { x: cx, z: cz, y0: a.minY, y1: a.minY + 0.04, raio: 0.06 }, { sombra: false });
    cilindro(ctx, mats.metal, { x: cx, z: cz, y0: a.minY + 0.04, y1: a.minY + 0.20, raio: 0.015 }, { sombra: false });
    cilindro(ctx, mats.luz, { x: cx, z: cz, y0: a.minY + 0.20, y1: a.maxY, raio: 0.10 }, { sombra: false });
  }

  // --- Guarda-roupa (frente virada pro centro do quarto, z menor) ---------
  {
    const g = iniciar(ctx, 'guarda_roupa');
    peca(ctx, mats.madeira, { x0: g.minX, x1: g.maxX, y0: g.minY, y1: g.maxY, z0: g.minZ, z1: g.maxZ });
    const meio = (g.minX + g.maxX) / 2;
    for (const [x0, x1] of [[g.minX + 0.03, meio - 0.01], [meio + 0.01, g.maxX - 0.03]]) {
      peca(ctx, mats.madeiraEsc, {
        x0, x1,
        y0: g.minY + 0.06, y1: g.maxY - 0.06,
        z0: g.minZ, z1: g.minZ + 0.025,
      }, { sombra: false });
    }
    for (const x of [meio - 0.07, meio + 0.07]) {
      peca(ctx, mats.metal, {
        x0: x - 0.015, x1: x + 0.015,
        y0: g.minY + 1.00, y1: g.minY + 1.24,
        z0: g.minZ, z1: g.minZ + 0.01,
      }, { sombra: false });
    }
  }

  // --- Tapete -------------------------------------------------------------
  {
    const t = iniciar(ctx, 'tapete');
    peca(ctx, mats.tecidoQuente, { x0: t.minX, x1: t.maxX, y0: t.minY, y1: t.maxY, z0: t.minZ, z1: t.maxZ },
      { sombra: false, recebe: true });
  }
}

function montarBanheiro(ctx) {
  const mats = ctx.mats;

  // --- Box: base de louça + dois vidros (os outros dois lados são parede) --
  {
    const b = iniciar(ctx, 'box_banho');
    peca(ctx, mats.ceramica, { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.minY + 0.12, z0: b.minZ, z1: b.maxZ },
      { recebe: true });
    peca(ctx, mats.vidro, {
      x0: b.maxX - 0.025, x1: b.maxX,
      y0: b.minY + 0.12, y1: b.maxY,
      z0: b.minZ, z1: b.maxZ,
    }, { sombra: false });
    peca(ctx, mats.vidro, {
      x0: b.minX, x1: b.maxX,
      y0: b.minY + 0.12, y1: b.maxY,
      z0: b.maxZ - 0.025, z1: b.maxZ,
    }, { sombra: false });
    // Chuveiro no canto de dentro.
    cilindro(ctx, mats.metal, {
      x: b.minX + 0.22, z: b.minZ + 0.22,
      y0: b.maxY - 0.10, y1: b.maxY - 0.04, raio: 0.09,
    }, { sombra: false });
  }

  // --- Vaso sanitário (caixa acoplada na parede oeste) --------------------
  {
    const v = iniciar(ctx, 'vaso');
    peca(ctx, mats.ceramica, {
      x0: v.minX, x1: v.minX + 0.16,
      y0: v.minY + 0.38, y1: v.maxY,
      z0: v.minZ + 0.06, z1: v.maxZ - 0.06,
    });
    peca(ctx, mats.ceramica, {
      x0: v.minX + 0.16, x1: v.maxX,
      y0: v.minY, y1: v.minY + 0.36,
      z0: v.minZ + 0.10, z1: v.maxZ - 0.10,
    });
    peca(ctx, mats.ceramica, {
      x0: v.minX + 0.14, x1: v.maxX,
      y0: v.minY + 0.36, y1: v.minY + 0.42,
      z0: v.minZ, z1: v.maxZ,
    }, { recebe: true });
  }

  // --- Pia com coluna + torneira + espelho --------------------------------
  {
    const p = iniciar(ctx, 'pia_banheiro');
    const cz = (p.minZ + p.maxZ) / 2;
    peca(ctx, mats.ceramica, {
      x0: p.maxX - 0.24, x1: p.maxX,
      y0: p.minY, y1: p.maxY - 0.14,
      z0: cz - 0.11, z1: cz + 0.11,
    });
    peca(ctx, mats.ceramica, { x0: p.minX, x1: p.maxX, y0: p.maxY - 0.14, y1: p.maxY, z0: p.minZ, z1: p.maxZ },
      { recebe: true });
    cilindro(ctx, mats.metal, { x: p.maxX - 0.10, z: cz, y0: p.maxY, y1: p.maxY + 0.22, raio: 0.02 },
      { sombra: false });
  }
  {
    const e = iniciar(ctx, 'espelho');
    peca(ctx, mats.espelho, { x0: e.minX, x1: e.maxX, y0: e.minY, y1: e.maxY, z0: e.minZ, z1: e.maxZ },
      { sombra: false });
  }
}

function montarSala(ctx) {
  const mats = ctx.mats;

  // --- Sofá de dois lugares (encosto no lado z menor, virado pra TV) ------
  {
    const s = iniciar(ctx, 'sofa');
    peca(ctx, mats.tecido, { x0: s.minX, x1: s.maxX, y0: s.minY, y1: s.minY + 0.35, z0: s.minZ, z1: s.maxZ });
    peca(ctx, mats.tecido, {
      x0: s.minX + 0.15, x1: s.maxX - 0.15,
      y0: s.minY + 0.35, y1: s.minY + 0.48,
      z0: s.minZ + 0.20, z1: s.maxZ,
    }, { recebe: true });
    peca(ctx, mats.tecido, {
      x0: s.minX, x1: s.maxX,
      y0: s.minY + 0.35, y1: s.maxY,
      z0: s.minZ, z1: s.minZ + 0.20,
    });
    for (const [x0, x1] of [[s.minX, s.minX + 0.15], [s.maxX - 0.15, s.maxX]]) {
      peca(ctx, mats.tecido, { x0, x1, y0: s.minY + 0.35, y1: s.minY + 0.62, z0: s.minZ, z1: s.maxZ });
    }
    // Almofadas.
    for (const cx of [s.minX + 0.45, s.maxX - 0.45]) {
      peca(ctx, mats.tecidoQuente, {
        x0: cx - 0.16, x1: cx + 0.16,
        y0: s.minY + 0.48, y1: s.minY + 0.72,
        z0: s.minZ + 0.20, z1: s.minZ + 0.30,
      }, { sombra: false });
    }
  }

  // --- Mesinha de centro ---------------------------------------------------
  {
    const m = iniciar(ctx, 'mesinha_centro');
    peca(ctx, mats.madeira, { x0: m.minX, x1: m.maxX, y0: m.maxY - 0.04, y1: m.maxY, z0: m.minZ, z1: m.maxZ },
      { recebe: true });
    for (const [x, z] of [[m.minX + 0.06, m.minZ + 0.06], [m.maxX - 0.06, m.minZ + 0.06],
      [m.minX + 0.06, m.maxZ - 0.06], [m.maxX - 0.06, m.maxZ - 0.06]]) {
      peca(ctx, mats.madeiraEsc, {
        x0: x - 0.03, x1: x + 0.03,
        y0: m.minY, y1: m.maxY - 0.04,
        z0: z - 0.03, z1: z + 0.03,
      }, { sombra: false });
    }
  }

  // --- Rack + monitor antigo + porta-retratos ------------------------------
  {
    const r = iniciar(ctx, 'rack_tv');
    peca(ctx, mats.madeiraEsc, { x0: r.minX, x1: r.maxX, y0: r.minY, y1: r.maxY, z0: r.minZ, z1: r.maxZ },
      { recebe: true });
    peca(ctx, mats.madeira, {
      x0: r.minX + 0.06, x1: r.maxX - 0.06,
      y0: r.minY + 0.20, y1: r.minY + 0.24,
      z0: r.minZ + 0.04, z1: r.maxZ - 0.04,
    }, { sombra: false });
  }
  {
    const m = iniciar(ctx, 'monitor');
    peca(ctx, mats.metalEsc, { x0: m.minX, x1: m.maxX, y0: m.minY, y1: m.maxY, z0: m.minZ, z1: m.maxZ });
    peca(ctx, mats.tela, {
      x0: m.minX + 0.05, x1: m.maxX - 0.05,
      y0: m.minY + 0.06, y1: m.maxY - 0.06,
      z0: m.minZ, z1: m.minZ + 0.015,
    }, { sombra: false });
  }
  {
    const p = iniciar(ctx, 'porta_retratos');
    peca(ctx, mats.madeira, { x0: p.minX, x1: p.maxX, y0: p.minY, y1: p.maxY, z0: p.maxZ - 0.02, z1: p.maxZ },
      { sombra: false });
    peca(ctx, mats.papel, {
      x0: p.minX + 0.025, x1: p.maxX - 0.025,
      y0: p.minY + 0.03, y1: p.maxY - 0.025,
      z0: p.maxZ - 0.025, z1: p.maxZ - 0.02,
    }, { sombra: false });
    // Pezinho inclinado, só pra não parecer colado no rack.
    peca(ctx, mats.madeira, {
      x0: (p.minX + p.maxX) / 2 - 0.02, x1: (p.minX + p.maxX) / 2 + 0.02,
      y0: p.minY, y1: p.minY + 0.08,
      z0: p.minZ, z1: p.maxZ - 0.02,
    }, { sombra: false });
  }

  // --- Mesa pequena com duas cadeiras --------------------------------------
  {
    const m = iniciar(ctx, 'mesa_jantar');
    peca(ctx, mats.madeira, { x0: m.minX, x1: m.maxX, y0: m.maxY - 0.05, y1: m.maxY, z0: m.minZ, z1: m.maxZ },
      { recebe: true });
    for (const [x, z] of [[m.minX + 0.09, m.minZ + 0.09], [m.maxX - 0.09, m.minZ + 0.09],
      [m.minX + 0.09, m.maxZ - 0.09], [m.maxX - 0.09, m.maxZ - 0.09]]) {
      peca(ctx, mats.madeiraEsc, {
        x0: x - 0.035, x1: x + 0.035,
        y0: m.minY, y1: m.maxY - 0.05,
        z0: z - 0.035, z1: z + 0.035,
      }, { sombra: false });
    }
  }
  for (const tag of ['cadeira_oeste', 'cadeira_leste']) {
    const c = iniciar(ctx, tag);
    peca(ctx, mats.madeira, {
      x0: c.minX, x1: c.maxX,
      y0: c.minY + 0.42, y1: c.minY + 0.47,
      z0: c.minZ, z1: c.maxZ,
    }, { recebe: true });
    // As duas cadeiras ficam ao sul da mesa, então o encosto vai no lado
    // de lá (z maior) e o assento sobra virado pra mesa.
    const z0 = c.maxZ - 0.05;
    peca(ctx, mats.madeira, {
      x0: c.minX + 0.03, x1: c.maxX - 0.03,
      y0: c.minY + 0.47, y1: c.maxY,
      z0, z1: z0 + 0.05,
    });
    for (const [x, z] of [[c.minX + 0.05, c.minZ + 0.05], [c.maxX - 0.05, c.minZ + 0.05],
      [c.minX + 0.05, c.maxZ - 0.05], [c.maxX - 0.05, c.maxZ - 0.05]]) {
      peca(ctx, mats.madeiraEsc, {
        x0: x - 0.025, x1: x + 0.025,
        y0: c.minY, y1: c.minY + 0.42,
        z0: z - 0.025, z1: z + 0.025,
      }, { sombra: false });
    }
  }

  // --- Bancada da cozinha com pia + armário aéreo --------------------------
  {
    const b = iniciar(ctx, 'bancada');
    peca(ctx, mats.madeira, {
      x0: b.minX, x1: b.maxX,
      y0: b.minY, y1: b.maxY - 0.05,
      z0: b.minZ, z1: b.maxZ,
    });
    peca(ctx, mats.pedra, { x0: b.minX, x1: b.maxX, y0: b.maxY - 0.05, y1: b.maxY, z0: b.minZ, z1: b.maxZ },
      { recebe: true });
    // Cuba de inox embutida no tampo.
    peca(ctx, mats.metal, {
      x0: b.minX + 0.10, x1: b.maxX - 0.10,
      y0: b.maxY - 0.12, y1: b.maxY - 0.03,
      z0: b.minZ + 0.30, z1: b.minZ + 0.90,
    }, { sombra: false });
    cilindro(ctx, mats.metal, {
      x: b.maxX - 0.12, z: b.minZ + 0.60,
      y0: b.maxY, y1: b.maxY + 0.26, raio: 0.02,
    }, { sombra: false });
    // Portas embaixo da bancada.
    for (let i = 0; i < 3; i++) {
      const passo = (b.maxZ - b.minZ) / 3;
      peca(ctx, mats.madeiraEsc, {
        x0: b.minX, x1: b.minX + 0.02,
        y0: b.minY + 0.08, y1: b.maxY - 0.12,
        z0: b.minZ + i * passo + 0.03, z1: b.minZ + (i + 1) * passo - 0.03,
      }, { sombra: false });
    }
  }
  {
    const a = iniciar(ctx, 'armario_aereo');
    peca(ctx, mats.madeira, { x0: a.minX, x1: a.maxX, y0: a.minY, y1: a.maxY, z0: a.minZ, z1: a.maxZ });
    const meio = (a.minZ + a.maxZ) / 2;
    for (const [z0, z1] of [[a.minZ + 0.03, meio - 0.02], [meio + 0.02, a.maxZ - 0.03]]) {
      peca(ctx, mats.madeiraEsc, {
        x0: a.minX, x1: a.minX + 0.02,
        y0: a.minY + 0.04, y1: a.maxY - 0.04,
        z0, z1,
      }, { sombra: false });
    }
  }

  // --- Geladeira -----------------------------------------------------------
  {
    const g = iniciar(ctx, 'geladeira');
    peca(ctx, mats.metal, {
      x0: g.minX + 0.04, x1: g.maxX,
      y0: g.minY, y1: g.maxY,
      z0: g.minZ, z1: g.maxZ,
    });
    // Duas portas (freezer em cima) com puxadores rentes ao AABB.
    for (const [y0, y1] of [[g.minY + 0.02, g.minY + 1.18], [g.minY + 1.22, g.maxY - 0.02]]) {
      peca(ctx, mats.metalEsc, {
        x0: g.minX + 0.02, x1: g.minX + 0.04,
        y0, y1,
        z0: g.minZ + 0.02, z1: g.maxZ - 0.02,
      }, { sombra: false });
    }
    for (const [y0, y1] of [[g.minY + 0.75, g.minY + 1.10], [g.minY + 1.30, g.minY + 1.60]]) {
      peca(ctx, mats.metal, {
        x0: g.minX, x1: g.minX + 0.02,
        y0, y1,
        z0: g.maxZ - 0.14, z1: g.maxZ - 0.09,
      }, { sombra: false });
    }
  }

  // --- Mural de fotos na parede --------------------------------------------
  {
    const m = iniciar(ctx, 'mural_fotos');
    peca(ctx, mats.madeiraEsc, { x0: m.minX, x1: m.maxX, y0: m.minY, y1: m.maxY, z0: m.minZ, z1: m.maxZ },
      { sombra: false });
    const larg = (m.maxX - m.minX - 0.20) / 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        peca(ctx, mats.papel, {
          x0: m.minX + 0.05 + i * (larg + 0.05), x1: m.minX + 0.05 + i * (larg + 0.05) + larg,
          y0: m.minY + 0.06 + j * 0.32, y1: m.minY + 0.06 + j * 0.32 + 0.26,
          z0: m.maxZ - 0.005, z1: m.maxZ,
        }, { sombra: false });
      }
    }
  }
}

function montarComuns(ctx) {
  const mats = ctx.mats;

  // --- Luminária de teto do corredor ---------------------------------------
  {
    const l = iniciar(ctx, 'luminaria_corredor');
    const cx = (l.minX + l.maxX) / 2;
    const cz = (l.minZ + l.maxZ) / 2;
    cilindro(ctx, mats.metalEsc, { x: cx, z: cz, y0: l.maxY - 0.03, y1: l.maxY, raio: 0.08 }, { sombra: false });
    cilindro(ctx, mats.luz, { x: cx, z: cz, y0: l.minY, y1: l.maxY - 0.03, raio: 0.22 }, { sombra: false });
  }

  // --- Extintor na parede do corredor --------------------------------------
  {
    const e = iniciar(ctx, 'extintor');
    const cx = (e.minX + e.maxX) / 2;
    const cz = (e.minZ + e.maxZ) / 2;
    peca(ctx, mats.metalEsc, {
      x0: cx - 0.05, x1: cx + 0.05,
      y0: e.minY + 0.05, y1: e.maxY - 0.05,
      z0: e.maxZ - 0.03, z1: e.maxZ,
    }, { sombra: false });
    cilindro(ctx, mats.vermelho, { x: cx, z: cz, y0: e.minY, y1: e.maxY - 0.10, raio: 0.09 }, { sombra: false });
    cilindro(ctx, mats.metal, { x: cx, z: cz, y0: e.maxY - 0.10, y1: e.maxY, raio: 0.03 }, { sombra: false });
  }

  // --- Banco do saguão (encosto na parede oeste) ---------------------------
  {
    const b = iniciar(ctx, 'banco_saguao');
    peca(ctx, mats.madeira, {
      x0: b.minX, x1: b.maxX,
      y0: b.minY + 0.40, y1: b.minY + 0.48,
      z0: b.minZ, z1: b.maxZ,
    }, { recebe: true });
    peca(ctx, mats.madeira, {
      x0: b.minX, x1: b.minX + 0.06,
      y0: b.minY + 0.48, y1: b.maxY,
      z0: b.minZ, z1: b.maxZ,
    });
    for (const z of [b.minZ + 0.18, b.maxZ - 0.18]) {
      peca(ctx, mats.metalEsc, {
        x0: b.minX + 0.06, x1: b.maxX - 0.06,
        y0: b.minY, y1: b.minY + 0.40,
        z0: z - 0.03, z1: z + 0.03,
      }, { sombra: false });
    }
  }

  // --- Caixa de correio na parede do saguão --------------------------------
  {
    const c = iniciar(ctx, 'caixa_correio');
    peca(ctx, mats.metalEsc, { x0: c.minX, x1: c.maxX, y0: c.minY, y1: c.maxY, z0: c.minZ, z1: c.maxZ });
    const larg = (c.maxZ - c.minZ - 0.12) / 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        peca(ctx, mats.metal, {
          x0: c.maxX - 0.015, x1: c.maxX,
          y0: c.minY + 0.06 + j * 0.40, y1: c.minY + 0.06 + j * 0.40 + 0.32,
          z0: c.minZ + 0.03 + i * (larg + 0.03), z1: c.minZ + 0.03 + i * (larg + 0.03) + larg,
        }, { sombra: false });
      }
    }
  }
}

/**
 * Monta a mobília do apartamento inicial e das áreas comuns.
 *
 * Recebe o namespace THREE já importado pelo chamador (este módulo não
 * importa three.js justamente pra continuar testável sem WebGL).
 *
 * @returns {{ group: object, solids: object[], anchors: object[] }}
 *   group   — THREE.Group em coordenadas locais do prédio;
 *   solids  — AABBs de colisão;
 *   anchors — pontos de interação com rótulo.
 */
export function buildApartmentProps(THREE) {
  const grupo = new THREE.Group();
  grupo.name = 'moveis-apartamento';

  const ctx = {
    THREE,
    grupo,
    alvo: grupo,
    mats: criarMateriais(THREE),
    // Duas geometrias unitárias pro apartamento inteiro: cada peça é só uma
    // escala delas. Cilindro com 12 lados já é redondo o bastante nesta
    // escala e mantém a contagem de triângulos baixa.
    geoCaixa: new THREE.BoxGeometry(1, 1, 1),
    geoCilindro: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    porTag: new Map(MOVEIS.map(m => [m.tag, m])),
  };

  montarQuarto(ctx);
  montarBanheiro(ctx);
  montarSala(ctx);
  montarComuns(ctx);

  return { group: grupo, solids: apartmentSolids(), anchors: apartmentAnchors() };
}
