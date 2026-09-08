// Fronteira de compatibilidade do save.
//
// Tudo que vem do localStorage é dado NÃO CONFIÁVEL: pode ter sido escrito por
// uma versão futura do jogo, editado à mão, truncado por falta de espaço ou
// corrompido. Este módulo é o único lugar que decide se um save pode ser
// carregado com segurança — e, quando pode, devolve uma cópia normalizada onde
// todo campo já é do tipo que o jogo espera.
//
// Regra de normalização (vale pra todo campo opcional): campo inválido é
// OMITIDO, nunca "consertado" com um palpite. Como todo deserialize() dos
// sistemas trata ausência como "mantém o padrão", omitir devolve o jogo ao
// default legítimo daquele sistema em vez de inventar um valor.
//
// Sem dependências de propósito: dá pra testar em Node puro, sem navegador.

export const SAVE_VERSION = 1;

// Status possíveis de um save. `ok` é o único que pode ser carregado.
export const SaveStatus = {
  EMPTY: 'empty',                     // não existe save
  OK: 'ok',                           // válido e compatível
  UNREADABLE: 'unreadable',           // existe, mas não é JSON válido
  MALFORMED: 'malformed',             // é JSON, mas não tem o mínimo pra carregar
  FUTURE_VERSION: 'future-version',   // escrito por uma versão mais nova do jogo
};

// Mensagens voltadas ao jogador — dizem o que aconteceu e o que dá pra fazer.
const MESSAGES = {
  [SaveStatus.UNREADABLE]: 'O arquivo de save está corrompido e não pôde ser lido. Ele foi mantido intacto; começar um novo jogo vai guardá-lo à parte.',
  [SaveStatus.MALFORMED]: 'O save existe mas está incompleto e não pôde ser carregado. Ele foi mantido intacto; começar um novo jogo vai guardá-lo à parte.',
  [SaveStatus.FUTURE_VERSION]: 'Este save foi criado por uma versão mais nova do jogo e não pode ser aberto aqui. Ele foi mantido intacto.',
};

export function saveErrorMessage(status) {
  return MESSAGES[status] || null;
}

// ---------------------------------------------------------------------------
// Coerções pequenas e explícitas. Todas devolvem `undefined` quando o valor
// não serve — é assim que o campo acaba omitido do save normalizado.
// ---------------------------------------------------------------------------

// Number.isFinite (e não isFinite) de propósito: não queremos coerção de
// string. "abc" não vira NaN silenciosamente, e "5" não vira 5.
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numIn(value, min, max) {
  const n = num(value);
  if (n === undefined) return undefined;
  return Math.min(max, Math.max(min, n));
}

function intAtLeast(value, min) {
  const n = num(value);
  if (n === undefined) return undefined;
  const i = Math.trunc(n);
  return i >= min ? i : undefined;
}

function bool(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function str(value, maxLength = 64) {
  return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function idArray(value) {
  if (!Array.isArray(value)) return undefined;
  return value.filter(v => typeof v === 'string');
}

// Só entra no objeto final o que foi de fato validado — evita gravar
// `{ energy: undefined }`, que serializaria diferente do campo ausente.
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Decide se um save pode ser carregado.
 * @param {unknown} raw objeto já parseado (ou null/undefined se não existe)
 * @returns {{status: string, save?: object, message?: string}}
 */
export function validateSave(raw) {
  if (raw === null || raw === undefined) return { status: SaveStatus.EMPTY };

  if (!plainObject(raw)) {
    return { status: SaveStatus.MALFORMED, message: MESSAGES[SaveStatus.MALFORMED] };
  }

  // Versão. Ausente = save legado, de antes do versionamento existir: aceito,
  // porque foi assim que o jogo gravou por um bom tempo e esses saves ainda
  // carregam corretamente. Presente = precisa ser inteiro >= 1 e conhecido.
  if (raw.version !== undefined) {
    const version = intAtLeast(raw.version, 1);
    if (version === undefined) {
      return { status: SaveStatus.MALFORMED, message: MESSAGES[SaveStatus.MALFORMED] };
    }
    if (version > SAVE_VERSION) {
      return { status: SaveStatus.FUTURE_VERSION, message: MESSAGES[SaveStatus.FUTURE_VERSION] };
    }
  }

  // `player` com posição numérica é o único campo sem o qual o save não
  // significa nada — é também o que quebrava o jogo antes desta validação.
  // Todo o resto degrada pro default do sistema correspondente.
  const player = plainObject(raw.player);
  if (!player || num(player.x) === undefined || num(player.z) === undefined) {
    return { status: SaveStatus.MALFORMED, message: MESSAGES[SaveStatus.MALFORMED] };
  }

  return { status: SaveStatus.OK, save: normalizeSave(raw, player) };
}

function normalizeSave(raw, player) {
  return compact({
    version: intAtLeast(raw.version, 1) ?? null,
    timestamp: num(raw.timestamp),
    player: compact({
      x: num(player.x),
      z: num(player.z),
      camYaw: num(player.camYaw),
    }),
    timeOfDay: numIn(raw.timeOfDay, 0, 1),
    dayCount: intAtLeast(raw.dayCount, 1),
    quests: normalizeQuests(raw.quests),
    collectedFragments: idArray(raw.collectedFragments),
    bookCollected: bool(raw.bookCollected),
    collectedWorldItems: idArray(raw.collectedWorldItems),
    inventory: normalizeInventory(raw.inventory),
    profile: normalizeProfile(raw.profile),
    needs: normalizeNeeds(raw.needs),
    obligation: normalizeObligation(raw.obligation),
    // Repassado como veio: o próprio GameState.deserialize já sabe distinguir
    // o formato atual (`npcs`) do antigo (`relationships`) e migrar entre eles.
    // Normalizar aqui quebraria essa migração.
    gameState: plainObject(raw.gameState),
  });
}

function normalizeQuests(value) {
  const quests = plainObject(value);
  if (!quests) return undefined;
  const out = {};
  for (const [id, state] of Object.entries(quests)) {
    const s = plainObject(state);
    // Sem `objectives` a entrada não é utilizável pelo QuestSystem; descartar
    // faz a missão voltar ao estado inicial em vez de corromper o sistema.
    if (!s || !plainObject(s.objectives)) continue;
    out[id] = { active: s.active === true, done: s.done === true, objectives: s.objectives };
  }
  return out;
}

function normalizeInventory(value) {
  const inv = plainObject(value);
  if (!inv) return undefined;
  const out = {};
  for (const [itemId, count] of Object.entries(inv)) {
    const n = intAtLeast(count, 0);
    if (n !== undefined) out[itemId] = n;
  }
  return out;
}

function normalizeProfile(value) {
  const profile = plainObject(value);
  if (!profile) return undefined;
  return compact({
    name: str(profile.name, 24),
    sex: ['m', 'f', 'x'].includes(profile.sex) ? profile.sex : undefined,
    // courseId inválido já é tolerado pelo jogo (cai no curso padrão), então
    // basta garantir que é string.
    courseId: str(profile.courseId, 32),
    originId: str(profile.originId, 32),
  });
}

function normalizeNeeds(value) {
  const needs = plainObject(value);
  if (!needs) return undefined;
  return compact({
    energy: numIn(needs.energy, 0, 100),
    hunger: numIn(needs.hunger, 0, 100),
    money: intAtLeast(needs.money, 0),
  });
}

function normalizeObligation(value) {
  const ob = plainObject(value);
  if (!ob) return undefined;
  return compact({
    attendedToday: bool(ob.attendedToday),
    misses: intAtLeast(ob.misses, 0),
    active: bool(ob.active),
    lastProcessedDay: ob.lastProcessedDay === null ? null : intAtLeast(ob.lastProcessedDay, 0),
  });
}
