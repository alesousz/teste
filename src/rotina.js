// Rotina do jogo de vida — compromissos (turno, aula), casas, origens e
// cursos — lida de src/data/routine.json, que é escrito no editor de
// conteúdo (aba Rotina). Este módulo é puro de propósito: não toca cena,
// DOM nem rede, pra o editor e os testes usarem exatamente as mesmas regras
// que o jogo usa ao carregar.
//
// A divisão é intencional:
//   validarRotina  — olha o que o AUTOR escreveu e devolve problemas pra ele
//                    ler e corrigir; não conserta nada.
//   normalizarRotina — devolve o que o JOGO vai usar, com valor padrão e
//                    limite em tudo, pra nenhum erro de digitação virar
//                    partida quebrada (aula que nunca termina, salário
//                    negativo, compromisso impossível de cumprir).
// Um arquivo com erro ainda carrega: o jogo continua jogável e o editor
// mostra em vermelho o que precisa de conserto.

/** Como o local é ancorado no marco escolhido no mapa. */
export const ANCORAS = [
  { value: 'frente', label: 'Na frente' },
  { value: 'lado', label: 'Ao lado' },
  { value: 'centro', label: 'No meio' },
];

const ANCORAS_VALIDAS = new Set(ANCORAS.map(a => a.value));

/** Tipo do compromisso: muda só o ícone na bússola e no HUD. */
export const TIPOS_DE_COMPROMISSO = [
  { value: 'job', label: 'Trabalho' },
  { value: 'school', label: 'Estudo' },
];

const TIPOS_VALIDOS = new Set(TIPOS_DE_COMPROMISSO.map(t => t.value));

const MAX_MARGEM = 20;     // mais que isso joga o ponto pra dentro da rua
const MAX_FALTAS = 99;
const MAX_DINHEIRO = 100000;

const eNumero = v => typeof v === 'number' && Number.isFinite(v);
const texto = (v, padrao = '') => (typeof v === 'string' ? v : padrao);

function numero(v, padrao, min, max) {
  if (!eNumero(v)) return padrao;
  return Math.min(max, Math.max(min, v));
}

/** Meia hora é o menor passo que o relógio do jogo mostra. */
function hora(v, padrao) {
  const n = numero(v, padrao, 0, 24);
  return Math.round(n * 2) / 2;
}

// ---------------------------------------------------------------------------
// Local: escolhido no mapa, não digitado
// ---------------------------------------------------------------------------

/**
 * Onde o compromisso (ou a cama) fica, a partir de uma peça da cena. O autor
 * escolhe o marco no editor e o ponto é calculado daí — mover o mercado no
 * editor de mapa move o turno junto, sem ninguém reescrever coordenada.
 *
 * `mundo.marco(kind)` devolve { x, z, w, d } do marco na cena (ou null);
 * `mundo.npc(id)` devolve { x, z } de um NPC (ou null).
 * Sem nada que resolva, devolve null — quem chama decide o que fazer.
 */
export function resolverLocal(local, mundo = {}) {
  if (!local || typeof local !== 'object') return null;

  if (typeof local.marco === 'string' && local.marco) {
    const m = mundo.marco?.(local.marco);
    if (!m) return null;
    const margem = numero(local.margem, 3, 0, MAX_MARGEM);
    if (local.ancora === 'centro') return { x: m.x, z: m.z };
    if (local.ancora === 'lado') return { x: m.x + m.w / 2 + margem, z: m.z };
    return { x: m.x, z: m.z + m.d / 2 + margem }; // 'frente' é o padrão
  }

  if (typeof local.npc === 'string' && local.npc) {
    const p = mundo.npc?.(local.npc);
    return p ? { x: p.x, z: p.z } : null;
  }

  if (eNumero(local.x) && eNumero(local.z)) return { x: local.x, z: local.z };
  return null;
}

/** Local normalizado: sempre um objeto que resolverLocal entende. */
function normalizarLocal(local) {
  if (!local || typeof local !== 'object') return { marco: '', ancora: 'frente', margem: 3 };
  if (typeof local.marco === 'string' && local.marco) {
    return {
      marco: local.marco,
      ancora: ANCORAS_VALIDAS.has(local.ancora) ? local.ancora : 'frente',
      margem: numero(local.margem, 3, 0, MAX_MARGEM),
    };
  }
  if (typeof local.npc === 'string' && local.npc) return { npc: local.npc };
  if (eNumero(local.x) && eNumero(local.z)) return { x: local.x, z: local.z };
  return { marco: '', ancora: 'frente', margem: 3 };
}

/** Texto curto do local, pro editor mostrar sem abrir o mapa. */
export function descreverLocal(local, nomeDoMarco = k => k) {
  const l = normalizarLocal(local);
  if (l.marco) {
    const ancora = ANCORAS.find(a => a.value === l.ancora)?.label ?? l.ancora;
    return `${ancora} de ${nomeDoMarco(l.marco)}`;
  }
  if (l.npc) return `Onde ${l.npc} está`;
  if (eNumero(l.x)) return `Ponto (${l.x}, ${l.z})`;
  return 'sem local';
}

// ---------------------------------------------------------------------------
// Normalização — o que o jogo consome
// ---------------------------------------------------------------------------

function normalizarCompromisso(id, bruto = {}) {
  const label = texto(bruto.label).trim() || id;
  const inicio = hora(bruto.startHour, 8);
  // Janela invertida ou de duração zero deixaria um compromisso impossível de
  // cumprir: o jogo garante pelo menos meia hora aberta e o editor avisa.
  const fim = Math.max(inicio + 0.5, hora(bruto.endHour, 14));
  const maxMisses = Math.round(numero(bruto.maxMisses, 3, 1, MAX_FALTAS));
  return {
    id,
    type: TIPOS_VALIDOS.has(bruto.type) ? bruto.type : 'job',
    label,
    local: normalizarLocal(bruto.local),
    npc: texto(bruto.npc).trim() || null,
    startHour: inicio,
    endHour: Math.min(24, fim),
    payPerDay: Math.round(numero(bruto.payPerDay, 0, 0, MAX_DINHEIRO)),
    missPenaltyMoney: Math.round(numero(bruto.missPenaltyMoney, 0, 0, MAX_DINHEIRO)),
    maxMisses,
    warningMessage: texto(bruto.warningMessage).trim() || `Mais uma falta em ${label} e você perde a vaga.`,
    endMessage: texto(bruto.endMessage).trim() || `Você faltou demais: perdeu ${label}.`,
  };
}

function normalizarCasa(id, bruta = {}) {
  return { id, kind: texto(bruta.kind).trim() || id, local: normalizarLocal(bruta.local) };
}

function normalizarOrigem(id, bruta = {}, obrigacoes, casas) {
  const primeiraCasa = Object.keys(casas)[0] ?? '';
  const primeiraObrigacao = Object.keys(obrigacoes)[0] ?? '';
  return {
    id,
    label: texto(bruta.label).trim() || id,
    shortDesc: texto(bruta.shortDesc),
    startMoney: Math.round(numero(bruta.startMoney, 0, 0, MAX_DINHEIRO)),
    home: casas[bruta.home] ? bruta.home : primeiraCasa,
    obligation: obrigacoes[bruta.obligation] ? bruta.obligation : primeiraObrigacao,
    familyNpc: texto(bruta.familyNpc).trim() || null,
  };
}

function normalizarCurso(id, bruto = {}, obrigacoes) {
  const primeira = Object.keys(obrigacoes)[0] ?? '';
  const obligation = obrigacoes[bruto.obligation] ? bruto.obligation : primeira;
  const ob = obrigacoes[obligation];
  return {
    id,
    label: texto(bruto.label).trim() || id,
    glyph: texto(bruto.glyph).trim() || 'school',
    age: Math.round(numero(bruto.age, 18, 1, 120)),
    startMoney: Math.round(numero(bruto.startMoney, 0, 0, MAX_DINHEIRO)),
    obligation,
    note: texto(bruto.note),
    // Rótulo e horário na tela de criação SAEM do compromisso, não são campo
    // do curso: escrito duas vezes, um dia a tela mostraria um horário que o
    // jogo não cumpre.
    obligationLabel: ob?.label ?? '',
    startHour: ob?.startHour ?? 0,
    endHour: ob?.endHour ?? 0,
  };
}

const mapa = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * Rotina pronta pro jogo: todas as chaves presentes, todo valor dentro de
 * limite, toda referência apontando pra algo que existe.
 */
export function normalizarRotina(bruta) {
  const raiz = mapa(bruta);
  const obrigacoes = {};
  for (const [id, ob] of Object.entries(mapa(raiz.obligations))) obrigacoes[id] = normalizarCompromisso(id, mapa(ob));

  const casas = {};
  for (const [id, casa] of Object.entries(mapa(raiz.homes))) casas[id] = normalizarCasa(id, mapa(casa));

  const origens = {};
  for (const [id, o] of Object.entries(mapa(raiz.origins))) origens[id] = normalizarOrigem(id, mapa(o), obrigacoes, casas);

  const cursos = {};
  for (const [id, c] of Object.entries(mapa(raiz.courses))) cursos[id] = normalizarCurso(id, mapa(c), obrigacoes);

  return { obligations: obrigacoes, homes: casas, origins: origens, courses: cursos };
}

/**
 * Horário de funcionamento de cada NPC que tem compromisso: fora dele o NPC
 * "fecha" (fica parado em casa). Um mesmo NPC pode atender mais de um
 * compromisso (a professora atende os três cursos) — vale a união das
 * janelas, pra ele nunca fechar a porta de um curso por causa de outro.
 */
export function janelasPorNpc(obrigacoes) {
  const por = {};
  for (const ob of Object.values(obrigacoes)) {
    if (!ob.npc) continue;
    const atual = por[ob.npc];
    por[ob.npc] = atual
      ? { startHour: Math.min(atual.startHour, ob.startHour), endHour: Math.max(atual.endHour, ob.endHour) }
      : { startHour: ob.startHour, endHour: ob.endHour };
  }
  return por;
}

// ---------------------------------------------------------------------------
// Validação — o que o autor precisa ler
// ---------------------------------------------------------------------------

/**
 * Problemas do que está escrito, sem consertar nada.
 * `erro` = o jogo vai se comportar diferente do que o autor quis;
 * `aviso` = funciona, mas provavelmente não é o que ele queria.
 *
 * `mundo.npcs` e `mundo.marcos` são conjuntos de ids que existem na cena;
 * sem eles, as referências não são checadas (nos testes de unidade, por ex.).
 */
export function validarRotina(bruta, { npcs = null, marcos = null } = {}) {
  const problemas = [];
  const raiz = mapa(bruta);
  const obrigacoes = mapa(raiz.obligations);
  const casas = mapa(raiz.homes);
  const origens = mapa(raiz.origins);
  const cursos = mapa(raiz.courses);

  const erro = (onde, campo, mensagem) => problemas.push({ nivel: 'erro', onde, campo, mensagem });
  const aviso = (onde, campo, mensagem) => problemas.push({ nivel: 'aviso', onde, campo, mensagem });

  if (!Object.keys(obrigacoes).length) erro('rotina', null, 'Não existe nenhum compromisso: todo curso precisa de um.');
  if (!Object.keys(cursos).length) erro('rotina', null, 'Não existe nenhum curso: a criação de personagem fica vazia.');
  if (!Object.keys(casas).length) erro('rotina', null, 'Não existe nenhuma casa: o jogador não tem onde dormir.');

  const checarLocal = (onde, local, oQueE) => {
    const l = mapa(local);
    if (typeof l.marco === 'string' && l.marco) {
      if (marcos && !marcos.has(l.marco)) erro(onde, 'local', `O lugar "${l.marco}" não está no mapa. Coloque a peça no editor de mapa ou escolha outro.`);
      if (l.ancora !== undefined && !ANCORAS_VALIDAS.has(l.ancora)) aviso(onde, 'local', `Âncora "${l.ancora}" desconhecida; vai valer "na frente".`);
      if (eNumero(l.margem) && (l.margem < 0 || l.margem > MAX_MARGEM)) aviso(onde, 'local', `Distância de ${l.margem} m fora do razoável (0 a ${MAX_MARGEM}).`);
      return;
    }
    if (typeof l.npc === 'string' && l.npc) {
      if (npcs && !npcs.has(l.npc)) erro(onde, 'local', `O NPC "${l.npc}" não existe no mapa.`);
      return;
    }
    if (eNumero(l.x) && eNumero(l.z)) return;
    erro(onde, 'local', `Sem lugar escolhido: ${oQueE} ia parar no meio da praça central.`);
  };

  for (const [id, cru] of Object.entries(obrigacoes)) {
    const ob = mapa(cru);
    const onde = `compromisso ${id}`;
    if (ob.id !== undefined && ob.id !== id) erro(onde, 'id', `O campo id ("${ob.id}") não bate com a chave "${id}".`);
    if (!texto(ob.label).trim()) erro(onde, 'label', 'Sem nome: o HUD mostraria o id cru pro jogador.');
    if (ob.type !== undefined && !TIPOS_VALIDOS.has(ob.type)) aviso(onde, 'type', `Tipo "${ob.type}" desconhecido; vai valer "Trabalho".`);

    const inicio = ob.startHour;
    const fim = ob.endHour;
    if (!eNumero(inicio) || !eNumero(fim)) {
      erro(onde, 'horario', 'Horário de início e de fim precisam ser números (ex.: 8 e 14).');
    } else if (fim <= inicio) {
      erro(onde, 'horario', `Termina (${fim}h) antes ou na mesma hora que começa (${inicio}h): ninguém consegue cumprir.`);
    } else {
      if (inicio < 0 || fim > 24) erro(onde, 'horario', 'Horário fora do dia: use de 0 a 24.');
      if (fim - inicio < 1) aviso(onde, 'horario', `A janela tem só ${Math.round((fim - inicio) * 60)} min: fácil demais de perder.`);
    }

    if (!texto(ob.npc).trim()) {
      aviso(onde, 'npc', 'Sem NPC responsável: ninguém abre e fecha o lugar no horário do compromisso.');
    } else if (npcs && !npcs.has(ob.npc)) {
      erro(onde, 'npc', `O NPC "${ob.npc}" não existe no mapa. Crie a peça no editor de mapa ou corrija o id.`);
    }

    checarLocal(onde, ob.local, 'o compromisso');

    if (eNumero(ob.payPerDay) && ob.payPerDay < 0) erro(onde, 'payPerDay', 'Pagamento negativo: use a multa por falta pra tirar dinheiro.');
    if (eNumero(ob.missPenaltyMoney) && ob.missPenaltyMoney < 0) erro(onde, 'missPenaltyMoney', 'Multa negativa: faltar pagaria o jogador.');
    if (ob.maxMisses !== undefined && (!eNumero(ob.maxMisses) || ob.maxMisses < 1)) {
      erro(onde, 'maxMisses', 'Limite de faltas precisa ser pelo menos 1.');
    }
    if (eNumero(ob.maxMisses) && ob.maxMisses >= 2 && !texto(ob.warningMessage).trim()) {
      aviso(onde, 'warningMessage', 'Sem aviso escrito: o jogador perde a vaga sem ter sido avisado antes.');
    }
    if (!texto(ob.endMessage).trim()) aviso(onde, 'endMessage', 'Sem mensagem de despedida: perder a vaga passa em branco.');
  }

  for (const [id, cru] of Object.entries(casas)) {
    const casa = mapa(cru);
    const onde = `casa ${id}`;
    if (!texto(casa.kind).trim()) aviso(onde, 'kind', 'Sem marco de casa: a bússola não aponta pra casa.');
    else if (marcos && !marcos.has(casa.kind)) erro(onde, 'kind', `O marco "${casa.kind}" não está no mapa.`);
    checarLocal(onde, casa.local, 'a cama');
  }

  for (const [id, cru] of Object.entries(origens)) {
    const o = mapa(cru);
    const onde = `origem ${id}`;
    if (!texto(o.label).trim()) aviso(onde, 'label', 'Sem nome.');
    if (!casas[o.home]) erro(onde, 'home', `Aponta pra casa "${o.home}", que não existe.`);
    if (!obrigacoes[o.obligation]) erro(onde, 'obligation', `Aponta pro compromisso "${o.obligation}", que não existe.`);
    if (eNumero(o.startMoney) && o.startMoney < 0) erro(onde, 'startMoney', 'Dinheiro inicial negativo.');
    if (o.familyNpc && npcs && !npcs.has(o.familyNpc)) erro(onde, 'familyNpc', `O NPC de família "${o.familyNpc}" não existe no mapa.`);
  }

  const usadas = new Set();
  for (const [id, cru] of Object.entries(cursos)) {
    const c = mapa(cru);
    const onde = `curso ${id}`;
    if (!texto(c.label).trim()) erro(onde, 'label', 'Sem nome: a criação de personagem mostraria um botão em branco.');
    if (!obrigacoes[c.obligation]) {
      erro(onde, 'obligation', `Aponta pro compromisso "${c.obligation}", que não existe. Escolha um compromisso.`);
    } else {
      usadas.add(c.obligation);
    }
    if (eNumero(c.startMoney) && c.startMoney < 0) erro(onde, 'startMoney', 'Dinheiro inicial negativo.');
    if (c.age !== undefined && (!eNumero(c.age) || c.age < 1)) aviso(onde, 'age', 'Idade precisa ser um número maior que zero.');
  }

  for (const [id, cru] of Object.entries(obrigacoes)) {
    const usadaPorOrigem = Object.values(origens).some(o => mapa(o).obligation === id);
    if (!usadas.has(id) && !usadaPorOrigem) {
      aviso(`compromisso ${id}`, null, `"${mapa(cru).label || id}" não é usado por nenhum curso nem origem: ninguém vai cumprir ele.`);
    }
  }

  return problemas;
}

/** Só os erros — o que impede a rotina de rodar como escrita. */
export const errosDaRotina = problemas => problemas.filter(p => p.nivel === 'erro');

/**
 * O rascunho do editor serve como rotina? Tem que ter as quatro seções e não
 * pode ter erro estrutural; se tiver, o jogo usa o que está publicado (ver
 * rascunhoDeConteudo em data.js).
 */
export function serveComoRotina(lido) {
  if (!lido || typeof lido !== 'object') return false;
  for (const secao of ['obligations', 'homes', 'origins', 'courses']) {
    const v = lido[secao];
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  }
  return Object.keys(lido.obligations).length > 0 && Object.keys(lido.courses).length > 0;
}
