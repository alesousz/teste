// Vocabulário de diálogo que o motor aceita hoje.
//
// FONTE DE VERDADE: src/interactions.js — DialogueSystem._evalCondition
// (condições) e DialogueSystem._applyEffect (efeitos). Este arquivo é a versão
// declarativa daquele switch, pra o editor saber quais tipos oferecer e quais
// campos cada tipo usa. Ele NÃO manda no motor: é uma cópia.
//
// O que impede esta cópia de envelhecer é tests/unit/dialogue-vocabulary.test.js,
// que lê o código de interactions.js e falha se os dois divergirem. Ao mexer no
// vocabulário do motor, mexa aqui também — o teste avisa se esquecer.
//
// Sem DOM e sem import de data.js de propósito: assim roda no Node e pode ser
// testado sem navegador.

// `not` é aceito pelo motor mas não aparece como opção no select: o editor o
// representa pela caixinha "negar (NÃO)" de cada condição, que é a mesma coisa
// escrita de outro jeito (veja ruleFromJson/ruleToJson).
export const CONDITION_TYPES = [
  { type: 'questDone', label: 'Missão concluída', fields: ['quest'] },
  { type: 'questActive', label: 'Missão ativa', fields: ['quest'] },
  { type: 'objectiveDone', label: 'Objetivo de missão concluído', fields: ['quest', 'objective'] },
  { type: 'isNight', label: 'É noite', fields: [] },
  { type: 'hasMetPlayer', label: 'Já se conheceram antes', fields: [] },
  { type: 'obligationActive', label: 'Compromisso (emprego/escola) ainda ativo', fields: [] },
  { type: 'obligationHasMisses', label: 'Jogador tem falta registrada', fields: [] },
  { type: 'isPlayerFamily', label: 'É família do jogador', fields: [] },
  { type: 'isPlayerBoss', label: 'É chefe/responsável do jogador', fields: [] },
  // `defaults` existe pra o dado nascer coerente com o que a tela mostra.
  // Sem eles: uma condição `flag` recém-criada exportaria {type:'flag'} e o
  // motor compararia undefined === undefined, ou seja, daria SEMPRE verdadeiro;
  // e o select de operador mostraria ">=" com o campo vazio no JSON.
  { type: 'flag', label: 'Marco da história (flag) tem valor', fields: ['flag', 'value'], defaults: { value: true } },
  { type: 'relationship', label: 'Relacionamento com um NPC', fields: ['npc', 'operator', 'value'], defaults: { operator: '>=' } },
  { type: 'not', label: 'Negação', fields: ['of'], viaNegate: true },
];

export const EFFECT_TYPES = [
  { type: 'giveItem', label: 'Dar item (pro inventário)', fields: ['item', 'cost'] },
  { type: 'startQuest', label: 'Iniciar missão', fields: ['quest'] },
  { type: 'completeObjective', label: 'Completar objetivo de missão', fields: ['quest', 'objective'] },
  { type: 'setFlag', label: 'Gravar marco da história (flag)', fields: ['flag', 'value'], defaults: { value: true } },
  // amount sem valor viraria `rel += undefined` → NaN no save do jogador.
  { type: 'changeRelationship', label: 'Mudar relacionamento com um NPC', fields: ['npc', 'amount', 'note'], defaults: { amount: 1 } },
];

// Os seis operadores de DialogueSystem._compareRelationship. Qualquer outro faz
// a condição dar false, então o editor só oferece estes.
export const RELATIONSHIP_OPERATORS = [
  { op: '>=', label: '≥ (pelo menos)' },
  { op: '>', label: '> (mais que)' },
  { op: '<=', label: '≤ (no máximo)' },
  { op: '<', label: '< (menos que)' },
  { op: '==', label: '= (exatamente)' },
  { op: '!=', label: '≠ (diferente de)' },
];

// O que o select de condição mostra: tudo menos o `not`, que vira a caixinha.
export const SELECTABLE_CONDITION_TYPES = CONDITION_TYPES.filter(c => !c.viaNegate);

// Sentinela só de UI ("esta opção não tem efeito nenhum"). Não é um tipo do
// motor — um efeito ausente é `undefined` no JSON, não `{type:''}`.
export const NO_EFFECT = '';

function unknownMeta(type) {
  return {
    type,
    label: `⚠ tipo desconhecido: ${type === undefined || type === null || type === '' ? '(sem tipo)' : type}`,
    fields: [],
    unknown: true,
  };
}

/**
 * Metadados do tipo de condição. Tipo que o editor não conhece NÃO vira outro
 * tipo: devolve um meta "desconhecido" que preserva o `type` original, pra a UI
 * poder mostrar o que realmente está lá em vez de mentir.
 */
export function conditionMeta(type) {
  return CONDITION_TYPES.find(c => c.type === type) || unknownMeta(type);
}

export function effectMeta(type) {
  if (!type) return { type: NO_EFFECT, label: '(Nenhum)', fields: [], none: true };
  return EFFECT_TYPES.find(e => e.type === type) || unknownMeta(type);
}

export function isKnownConditionType(type) {
  return CONDITION_TYPES.some(c => c.type === type);
}

export function isKnownEffectType(type) {
  return EFFECT_TYPES.some(e => e.type === type);
}

/**
 * Troca o tipo de uma condição preservando o que o tipo novo também usa.
 * Antes, trocar o tipo jogava fora o objeto inteiro; agora campos em comum
 * (ex: `quest` ao ir de "missão concluída" pra "missão ativa") sobrevivem.
 * Campos que o tipo novo não usa saem — isso é intencional: o dado deixaria de
 * ter significado e ficaria escondido no JSON.
 */
export function retypeCondition(cond, newType) {
  const meta = conditionMeta(newType);
  const next = { type: newType, ...(meta.defaults || {}) };
  if ('negate' in cond) next.negate = cond.negate;
  for (const f of meta.fields) {
    if (cond[f] !== undefined) next[f] = cond[f];
  }
  return next;
}

export function retypeEffect(effect, newType) {
  if (!newType) return undefined;
  const meta = effectMeta(newType);
  const next = { type: newType, ...(meta.defaults || {}) };
  for (const f of meta.fields) {
    if (effect?.[f] !== undefined) next[f] = effect[f];
  }
  return next;
}

// Converte uma regra do formato salvo ({if:[...], node}) pro formato de
// edição (condições com uma flag "negate" em vez de aninhar {type:'not'}) —
// cobre 100% do uso real, já que "not" nunca aparece aninhado mais de um
// nível nos dados de hoje.
//
// O espalhamento ({...cond}) é o que faz um tipo desconhecido atravessar o
// ciclo abrir→salvar sem perder campo nenhum.
export function ruleFromJson(rule) {
  return {
    node: rule.node,
    conditions: (rule.if || []).map(cond => {
      if (cond.type === 'not') return { ...cond.of, negate: true };
      return { ...cond, negate: false };
    }),
  };
}

export function ruleToJson(rule) {
  return {
    node: rule.node,
    if: rule.conditions.map(({ negate, ...cond }) => (negate ? { type: 'not', of: cond } : cond)),
  };
}

// --- valor de flag -------------------------------------------------------
// O motor compara com === (`getFlag(cond.flag) === cond.value`), então "true"
// (texto) e true (booleano) são coisas diferentes. A UI precisa deixar isso
// explícito em vez de adivinhar a partir de um campo de texto.
export function flagValueKind(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'text';
}

export function flagValueFromKind(kind, text) {
  if (kind === 'true') return true;
  if (kind === 'false') return false;
  return String(text ?? '');
}
