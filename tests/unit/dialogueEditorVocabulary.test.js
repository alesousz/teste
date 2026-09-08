import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CONDITION_TYPES,
  EFFECT_TYPES,
  SELECTABLE_CONDITION_TYPES,
  RELATIONSHIP_OPERATORS,
  conditionMeta,
  effectMeta,
  isKnownConditionType,
  isKnownEffectType,
  retypeCondition,
  retypeEffect,
  ruleFromJson,
  ruleToJson,
  flagValueKind,
  flagValueFromKind,
} from '../../src/dialogue-editor/vocabulary.js';

// ---------------------------------------------------------------------------
// Extração do vocabulário direto do código do motor.
//
// O motor descreve o que aceita num switch/if — não dá pra perguntar isso em
// tempo de execução (tipo desconhecido e tipo conhecido que deu falso devolvem
// os dois `false`). Então lemos o fonte. É frágil de propósito: se alguém
// reescrever _evalCondition/_applyEffect de outro jeito, estes testes falham
// pedindo que o extrator seja atualizado — que é exatamente quando alguém
// precisa reconferir se o editor continua alinhado.
// ---------------------------------------------------------------------------
const ENGINE_SRC = readFileSync(fileURLToPath(new URL('../../src/interactions.js', import.meta.url)), 'utf8');

function corpoEntre(inicio, fim) {
  const a = ENGINE_SRC.indexOf(inicio);
  const b = ENGINE_SRC.indexOf(fim, a);
  assert.ok(a !== -1, `não achei "${inicio}" em src/interactions.js — atualize o extrator deste teste`);
  assert.ok(b > a, `não achei "${fim}" depois de "${inicio}" — atualize o extrator deste teste`);
  return ENGINE_SRC.slice(a, b);
}

// Condições: um `case 'tipo':` por linha, e os campos lidos na mesma linha.
function condicoesDoMotor() {
  const corpo = corpoEntre('_evalCondition(cond, npcId, npc) {', '_compareRelationship(npcId, operator, value) {');
  const out = new Map();
  for (const linha of corpo.split('\n')) {
    const m = linha.match(/case '([A-Za-z]+)':/);
    if (!m) continue;
    const campos = [...linha.matchAll(/\bcond\.([A-Za-z]+)/g)].map(x => x[1]);
    out.set(m[1], new Set(campos));
  }
  return out;
}

// Efeitos: um bloco `if (effect.type === 'tipo')` por efeito; os campos são os
// `effect.x` que aparecem até o começo do bloco seguinte.
function efeitosDoMotor() {
  const corpo = corpoEntre('_applyEffect(effect) {', '\n  close()');
  const partes = corpo.split(/if \(effect\.type === '/).slice(1);
  const out = new Map();
  for (const parte of partes) {
    const tipo = parte.slice(0, parte.indexOf("'"));
    const campos = [...parte.matchAll(/\beffect\.([A-Za-z]+)/g)].map(x => x[1]).filter(f => f !== 'type');
    out.set(tipo, new Set(campos));
  }
  return out;
}

function operadoresDoMotor() {
  const corpo = corpoEntre('_compareRelationship(npcId, operator, value) {', '_resolveStartNode(');
  return new Set([...corpo.matchAll(/case '([^']+)':/g)].map(m => m[1]));
}

describe('contrato editor ↔ motor de diálogo', () => {
  test('o extrator ainda enxerga o motor (guarda contra falso "tudo certo")', () => {
    assert.ok(condicoesDoMotor().size >= 10, 'poucas condições extraídas — o extrator deste teste precisa ser atualizado');
    assert.ok(efeitosDoMotor().size >= 4, 'poucos efeitos extraídos — o extrator deste teste precisa ser atualizado');
    assert.ok(operadoresDoMotor().size >= 6, 'poucos operadores extraídos — o extrator deste teste precisa ser atualizado');
  });

  test('toda condição que o motor aceita é conhecida pelo editor, e vice-versa', () => {
    const motor = [...condicoesDoMotor().keys()].sort();
    const editor = CONDITION_TYPES.map(c => c.type).sort();
    assert.deepEqual(editor, motor,
      'vocabulário divergente: atualize CONDITION_TYPES em src/dialogue-editor/vocabulary.js');
  });

  test('todo efeito que o motor aceita é conhecido pelo editor, e vice-versa', () => {
    const motor = [...efeitosDoMotor().keys()].sort();
    const editor = EFFECT_TYPES.map(e => e.type).sort();
    assert.deepEqual(editor, motor,
      'vocabulário divergente: atualize EFFECT_TYPES em src/dialogue-editor/vocabulary.js');
  });

  test('os campos declarados pelo editor são exatamente os que o motor lê', () => {
    for (const [tipo, campos] of condicoesDoMotor()) {
      const declarados = new Set(conditionMeta(tipo).fields);
      assert.deepEqual([...declarados].sort(), [...campos].sort(), `condição "${tipo}"`);
    }
    for (const [tipo, campos] of efeitosDoMotor()) {
      const declarados = new Set(effectMeta(tipo).fields);
      assert.deepEqual([...declarados].sort(), [...campos].sort(), `efeito "${tipo}"`);
    }
  });

  test('os operadores de relacionamento oferecidos são os que o motor compara', () => {
    assert.deepEqual(
      RELATIONSHIP_OPERATORS.map(o => o.op).sort(),
      [...operadoresDoMotor()].sort(),
      'atualize RELATIONSHIP_OPERATORS'
    );
  });

  test('flag, relationship, setFlag e changeRelationship — os tipos do achado A-03', () => {
    for (const t of ['flag', 'relationship']) assert.ok(isKnownConditionType(t), `condição "${t}" ainda desconhecida`);
    for (const t of ['setFlag', 'changeRelationship']) assert.ok(isKnownEffectType(t), `efeito "${t}" ainda desconhecido`);
    assert.deepEqual(conditionMeta('flag').fields, ['flag', 'value']);
    assert.deepEqual(conditionMeta('relationship').fields, ['npc', 'operator', 'value']);
    assert.deepEqual(effectMeta('setFlag').fields, ['flag', 'value']);
    assert.deepEqual(effectMeta('changeRelationship').fields, ['npc', 'amount', 'note']);
  });

  test('`not` é aceito pelo motor mas não vira opção do select (vira a caixinha "negar")', () => {
    assert.ok(isKnownConditionType('not'));
    assert.ok(!SELECTABLE_CONDITION_TYPES.some(c => c.type === 'not'));
    assert.equal(SELECTABLE_CONDITION_TYPES.length, CONDITION_TYPES.length - 1);
  });
});

describe('tipo desconhecido — nunca é trocado nem escondido', () => {
  const desconhecida = { type: 'algumTipoNovo', foo: 'bar', negate: false };
  const efeitoDesconhecido = { type: 'algumEfeitoNovo', foo: 'bar', n: 3 };

  test('conditionMeta NÃO devolve o primeiro tipo da lista pra um tipo que não conhece', () => {
    const meta = conditionMeta('algumTipoNovo');
    assert.equal(meta.type, 'algumTipoNovo', 'o tipo original tem que sobreviver');
    assert.equal(meta.unknown, true);
    assert.notEqual(meta.type, CONDITION_TYPES[0].type);
    assert.deepEqual(meta.fields, [], 'sem campos: o editor não inventa editor pra o que não entende');
  });

  test('effectMeta NÃO devolve "(Nenhum)" pra um efeito que não conhece', () => {
    const meta = effectMeta('algumEfeitoNovo');
    assert.equal(meta.type, 'algumEfeitoNovo');
    assert.equal(meta.unknown, true);
    assert.notEqual(meta.none, true, 'um efeito desconhecido não pode se passar por "sem efeito"');
  });

  test('efeito ausente continua sendo "(Nenhum)", não "desconhecido"', () => {
    for (const v of [undefined, null, '']) {
      const meta = effectMeta(v);
      assert.equal(meta.none, true);
      assert.notEqual(meta.unknown, true);
    }
  });

  test('abrir e salvar uma regra com condição desconhecida devolve o mesmo JSON', () => {
    const original = { node: 'a1', if: [{ type: 'algumTipoNovo', foo: 'bar', lista: [1, 2] }] };
    const voltou = ruleToJson(ruleFromJson(structuredClone(original)));
    assert.deepEqual(voltou, original);
  });

  test('condição desconhecida negada (dentro de "not") também sobrevive ao ciclo', () => {
    const original = { node: 'a1', if: [{ type: 'not', of: { type: 'algumTipoNovo', foo: 'bar' } }] };
    assert.deepEqual(ruleToJson(ruleFromJson(structuredClone(original))), original);
  });

  test('ciclo abrir→salvar preserva os diálogos reais do jogo sem alterar nada', async () => {
    const trees = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/dialogues.json', import.meta.url)), 'utf8'));
    for (const [npcId, tree] of Object.entries(trees)) {
      for (const regra of tree.startRules || []) {
        assert.deepEqual(ruleToJson(ruleFromJson(structuredClone(regra))), regra, `${npcId}: regra alterada no ciclo`);
      }
    }
  });

  test('retypeCondition preserva os campos que o tipo novo também usa', () => {
    const antes = { type: 'questDone', quest: 'livro_esquecido', negate: true };
    assert.deepEqual(retypeCondition(antes, 'questActive'), { type: 'questActive', negate: true, quest: 'livro_esquecido' });
  });

  test('retypeCondition descarta o que o tipo novo não usa (e não deixa lixo escondido)', () => {
    const antes = { type: 'objectiveDone', quest: 'q', objective: 'o', negate: false };
    assert.deepEqual(retypeCondition(antes, 'isNight'), { type: 'isNight', negate: false });
  });

  test('retypeEffect preserva campos em comum e nunca inventa valor', () => {
    assert.deepEqual(retypeEffect({ type: 'startQuest', quest: 'q' }, 'completeObjective'), { type: 'completeObjective', quest: 'q' });
    assert.deepEqual(retypeEffect({ type: 'setFlag', flag: 'f', value: true }, 'changeRelationship'), { type: 'changeRelationship', amount: 1 });
    assert.equal(retypeEffect({ type: 'setFlag', flag: 'f' }, ''), undefined, '"(Nenhum)" é ausência de efeito, não {type:""}');
  });

  test('sair de um tipo desconhecido é sempre uma troca explícita — nunca acontece sozinho', () => {
    // retypeCondition só é chamado quando alguém escolhe outro tipo no select,
    // e o editor pede confirmação antes disso (confirmLeavingUnknown). Aqui só
    // garantimos que ele não é usado como "normalizador" silencioso: passar o
    // mesmo tipo desconhecido não destrói nada por conta própria.
    assert.deepEqual(retypeCondition(desconhecida, 'algumTipoNovo'), { type: 'algumTipoNovo', negate: false },
      'campos de um tipo desconhecido só somem numa troca deliberada de tipo');
    assert.deepEqual(efeitoDesconhecido, { type: 'algumEfeitoNovo', foo: 'bar', n: 3 }, 'o objeto de origem nunca é mutado');
  });
});

describe('tipo recém-criado nasce coerente com o que a tela mostra', () => {
  // Sem os defaults, o editor exportaria um dado que o motor lê de um jeito que
  // a tela não mostra — o mesmo tipo de mentira do A-03, só que na criação.
  test('condição `flag` nova já vem com value: true — senão seria sempre verdadeira', () => {
    const nova = retypeCondition({ type: 'isNight', negate: false }, 'flag');
    assert.strictEqual(nova.value, true);
    // A armadilha evitada: getFlag(undefined) === undefined dá true no motor.
    assert.notEqual(nova.value, undefined);
  });

  test('condição `relationship` nova já vem com o operador que o select exibe', () => {
    const nova = retypeCondition({ type: 'isNight', negate: false }, 'relationship');
    assert.strictEqual(nova.operator, '>=');
    assert.ok(RELATIONSHIP_OPERATORS.some(o => o.op === nova.operator));
  });

  test('efeito `changeRelationship` novo já vem com amount numérico — senão o motor faz rel += undefined (NaN)', () => {
    const novo = retypeEffect(undefined, 'changeRelationship');
    assert.equal(typeof novo.amount, 'number');
    assert.ok(Number.isFinite(novo.amount));
  });

  test('efeito `setFlag` novo grava um booleano de verdade', () => {
    assert.strictEqual(retypeEffect(undefined, 'setFlag').value, true);
  });

  test('um valor já existente sempre ganha do default', () => {
    assert.strictEqual(retypeCondition({ type: 'flag', flag: 'f', value: false }, 'flag').value, false);
    assert.strictEqual(retypeEffect({ type: 'changeRelationship', amount: -3 }, 'changeRelationship').amount, -3);
  });
});

describe('valor de flag — o motor compara com ===, então o tipo importa', () => {
  test('flagValueKind separa booleano de texto', () => {
    assert.equal(flagValueKind(true), 'true');
    assert.equal(flagValueKind(false), 'false');
    assert.equal(flagValueKind('capitulo2'), 'text');
    assert.equal(flagValueKind(undefined), 'text');
  });

  test('flagValueFromKind devolve booleano de verdade, não a string "true"', () => {
    assert.strictEqual(flagValueFromKind('true', 'ignorado'), true);
    assert.strictEqual(flagValueFromKind('false', 'ignorado'), false);
    assert.strictEqual(flagValueFromKind('text', 'capitulo2'), 'capitulo2');
    assert.strictEqual(flagValueFromKind('text', undefined), '');
  });
});
