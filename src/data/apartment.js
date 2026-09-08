// Planta do prédio residencial onde o jogo começa.
//
// Tudo aqui é DADO PURO, em coordenadas locais do prédio (canto mínimo em
// 0,0,0), sem three.js e sem DOM: a mesma planta alimenta a geometria visual
// (src/building.js), a física (src/interior.js) e os testes, sem que nenhum
// dos três precise adivinhar as medidas do outro.
//
// Eixos: x = largura (0..W), z = profundidade (0..D), y = altura.
// A rua fica em z = 0 (fachada sul). O nível 0 é o térreo; o nível 1 é o
// andar dos apartamentos.

export const AP = {
  W: 16,            // largura do prédio
  D: 12,            // profundidade
  WALL: 0.25,       // espessura de parede interna
  SHELL: 0.35,      // espessura da fachada
  FLOOR_H: 3.2,     // altura de um pavimento (piso a piso)
  SLAB: 0.35,       // espessura da laje
  CEIL: 2.85,       // pé-direito livre
  // 1,15 m e não 1,05: o jogador colide como um círculo de 0,90 m de diâmetro
  // (CONFIG.PLAYER_RADIUS = 0,45), e uma porta de porte residencial real não o
  // deixa passar. Alargar a porta é mais barato do que abrir exceção de raio
  // só dentro de casa.
  DOOR_W: 1.15,     // vão de porta
  DOOR_H: 2.15,
};

AP.ROOF_Y = AP.FLOOR_H * 2;   // 6.4 — topo do prédio

// Cotas verticais dos dois pavimentos.
export const LEVELS = [
  { id: 0, y: 0, label: 'Térreo' },
  { id: 1, y: AP.FLOOR_H, label: '2º andar' },
];

// ---------------------------------------------------------------------------
// Retângulos de ambiente. Todo o resto (paredes, portas, props) é derivado
// destes — mexer aqui move o cômodo inteiro de forma consistente.
// Formato: { x0, x1, z0, z1 } em coordenadas locais, já pelo lado de dentro.
// ---------------------------------------------------------------------------
const S = AP.SHELL;

// --- Térreo ---------------------------------------------------------------
// Saguão de entrada (sul, dá pra rua) e caixa de escada (leste).
//
// A caixa de escada é um VÃO DE ALTURA DUPLA de propósito: se houvesse
// apartamento por cima dela, o lance de escada teria ~1 m de pé-direito no
// meio do caminho. O andar de cima só volta a ter piso depois do patamar.
export const LOBBY = { x0: S, x1: 11.25, z0: S, z1: AP.D - S };
export const STAIRWELL = { x0: 11.75, x1: AP.W - S, z0: S, z1: AP.D - S };

// Piso plano na base da escada, onde a porta do saguão desemboca. Sem ele, a
// porta abriria no meio da rampa, a 2 m do chão.
export const STAIR_BASE = { x0: 11.75, x1: AP.W - S, z0: S, z1: 3.0 };

// O lance sobe reto no sentido +z.
// Ocupa a largura inteira da caixa de escada de propósito: qualquer fresta
// entre o lance e a parede vira um buraco pelo qual o jogador cai.
export const STAIRS = {
  x0: 11.75, x1: AP.W - S,
  z0: 3.0, z1: 9.0,
  yLow: 0, yHigh: AP.FLOOR_H,
  axis: 'z',            // a altura varia ao longo de z
  steps: 16,            // degraus desenhados (a física usa a rampa contínua)
};

// Patamar de chegada, já no nível do andar de cima.
export const LANDING = { x0: 11.75, x1: AP.W - S, z0: 9.0, z1: AP.D - S };

// --- Andar dos apartamentos ----------------------------------------------
// Corredor que liga o patamar às três portas.
export const CORRIDOR = { x0: S, x1: 11.25, z0: 8.4, z1: AP.D - S };

// Três unidades lado a lado, ao norte do corredor. Só a 201 é acessível.
export const UNITS = [
  { id: '201', x0: S,    x1: 5.6,   z0: S, z1: 8.15, player: true,  name: 'Apartamento 201' },
  { id: '202', x0: 5.85, x1: 8.5,   z0: S, z1: 8.15, player: false, name: 'Apartamento 202' },
  { id: '203', x0: 8.75, x1: 11.25, z0: S, z1: 8.15, player: false, name: 'Apartamento 203' },
];

export const PLAYER_UNIT = UNITS[0];

// --- Cômodos do apartamento do jogador (dentro de UNITS[0]) ---------------
// Divisão em L: quarto e banheiro ao norte, sala/cozinha ocupando o sul.
export const ROOMS = {
  quarto:   { x0: S,   x1: 3.1,  z0: S,   z1: 3.5, name: 'Quarto' },
  banheiro: { x0: 3.35, x1: 5.6, z0: S,   z1: 3.5, name: 'Banheiro' },
  sala:     { x0: S,   x1: 5.6,  z0: 3.75, z1: 8.0, name: 'Sala e cozinha' },
};

// ---------------------------------------------------------------------------
// Portas. `level` é o pavimento; `axis` é o eixo ao longo do qual o vão se
// abre. `locked` marca as portas que só existem pra dar vida ao corredor.
// ---------------------------------------------------------------------------
export const DOORS = [
  {
    id: 'entrada', level: 0, axis: 'x', // vão na fachada sul, dá pra rua
    x: 5.8, z: 0, w: 1.6, locked: false, exterior: true,
    label: 'Sair do prédio',
  },
  {
    id: 'saguao_escada', level: 0, axis: 'z', // saguão → base da escada
    x: 11.5, z: 1.9, w: 1.4, locked: false,
    label: 'Escada',
  },
  {
    id: 'corredor_patamar', level: 1, axis: 'z', // corredor → patamar
    x: 11.5, z: 10.5, w: 1.4, locked: false,
    label: 'Corredor',
  },
  { id: 'ap201', level: 1, axis: 'x', x: 2.6,  z: 8.275, w: AP.DOOR_W, locked: false, unit: '201', label: 'Apartamento 201' },
  { id: 'ap202', level: 1, axis: 'x', x: 7.2,  z: 8.275, w: AP.DOOR_W, locked: true,  unit: '202', label: 'Apartamento 202' },
  { id: 'ap203', level: 1, axis: 'x', x: 10.0, z: 8.275, w: AP.DOOR_W, locked: true,  unit: '203', label: 'Apartamento 203' },
  // Portas internas do 201.
  { id: 'quarto',   level: 1, axis: 'x', x: 1.7, z: 3.625, w: AP.DOOR_W, locked: false, label: 'Quarto' },
  { id: 'banheiro', level: 1, axis: 'x', x: 4.4, z: 3.625, w: 1.05,      locked: false, label: 'Banheiro' },
];

// ---------------------------------------------------------------------------
// Onde o jogador nasce: ao lado da cama, olhando pro centro do quarto.
// ---------------------------------------------------------------------------
export const SPAWN = {
  x: 2.2, z: 2.4, level: 1,
  facing: Math.PI,   // olhando pro sul (pra saída do quarto)
};

// Janelas: buracos na fachada, usados pela geometria e pela iluminação.
// `face` diz em qual parede externa fica.
export const WINDOWS = [
  // As unidades ficam ao SUL (z 0.35..8.15) e o corredor ao NORTE — então a
  // janela de um quarto dá na fachada sul, não na norte. A primeira versão
  // tinha isso trocado: a "janela do quarto" era desenhada na parede do
  // corredor, longe do ponto de interação que o jogador vê.
  { face: 'south', level: 1, at: 1.8,  w: 1.5, h: 1.3, sill: 1.0, room: 'quarto' },
  { face: 'west',  level: 1, at: 5.6,  w: 1.8, h: 1.3, sill: 1.0, room: 'sala' },
  { face: 'south', level: 1, at: 7.2,  w: 1.4, h: 1.3, sill: 1.0 },   // ap 202
  { face: 'south', level: 1, at: 10.0, w: 1.4, h: 1.3, sill: 1.0 },   // ap 203
  { face: 'north', level: 1, at: 5.5,  w: 1.6, h: 1.2, sill: 1.1 },   // corredor
  { face: 'west',  level: 0, at: 4.0,  w: 1.6, h: 1.4, sill: 1.1 },   // saguão
  { face: 'south', level: 0, at: 2.5,  w: 1.6, h: 1.4, sill: 1.1 },   // saguão, pra rua
  { face: 'east',  level: 0, at: 4.0,  w: 1.2, h: 1.4, sill: 1.1 },   // caixa de escada
];

// Utilitário compartilhado: um retângulo de cômodo vira AABB de piso.
export function rectToFloor(rect, y) {
  return { minX: rect.x0, maxX: rect.x1, minZ: rect.z0, maxZ: rect.z1, y };
}

// ---------------------------------------------------------------------------
// Retorno de interação dos objetos do apartamento. Uma linha curta por
// âncora — o suficiente pra a interação ter resposta, sem virar sistema de
// pensamento do personagem (que está fora do escopo destes primeiros minutos).
// A chave é o `id` da âncora declarada em src/apartmentProps.js.
// ---------------------------------------------------------------------------
export const OBSERVACOES = {
  cama: 'A cama ainda está desarrumada. Dá pra deixar assim.',
  janela_quarto: 'Lá fora a cidade já está acordada. O barulho entra mesmo com a janela fechada.',
  abajur: 'O abajur pisca uma vez antes de acender direito.',
  armario: 'Roupa suficiente pra uma semana, se você não for exigente.',
  box_banho: 'O chuveiro pinga. Sempre pingou.',
  vaso: 'Tudo em ordem por aqui.',
  pia: 'A água sai gelada primeiro.',
  sofa: 'O sofá afunda de um lado só.',
  tv: 'O monitor liga com um estalo e não mostra nada de útil.',
  porta_retratos: 'Uma foto antiga, de antes da mudança.',
  mural_fotos: 'Recortes, bilhetes, um ímã torto. As coisas que você não jogou fora.',
  mesa: 'A mesa balança se você apoiar o cotovelo.',
  bancada: 'Louça de ontem, ainda na pia.',
  geladeira: 'Quase vazia. Precisa fazer compras.',
  caixa_correio: 'Nada na sua caixa hoje.',
  banco_saguao: 'O banco do saguão, onde ninguém nunca senta.',
};
