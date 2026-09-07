import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { QuestSystem, DialogueSystem } from '../../src/interactions.js';
import { GameState } from '../../src/gameState.js';
import { NeedsSystem } from '../../src/needs.js';
import { InventorySystem } from '../../src/inventory.js';
import { QUESTS } from '../../src/data.js';

describe('QuestSystem', () => {
  test('missões com autoStart começam ativas; as demais não', () => {
    const qs = new QuestSystem();
    for (const q of Object.values(QUESTS)) {
      assert.equal(qs.isActive(q.id), !!q.autoStart, `quest ${q.id}`);
    }
  });

  test('startQuest ativa uma missão parada e é no-op numa já ativa/feita', () => {
    let changes = 0;
    const qs = new QuestSystem(() => changes++);
    const paradaId = Object.values(QUESTS).find(q => !q.autoStart).id;

    assert.equal(qs.isActive(paradaId), false);
    qs.startQuest(paradaId);
    assert.equal(qs.isActive(paradaId), true);
    assert.equal(changes, 1);

    qs.startQuest(paradaId); // já ativa — não deve disparar onChange de novo
    assert.equal(changes, 1);
  });

  test('completeObjective marca o objetivo e completa a quest quando todos terminam', () => {
    const qs = new QuestSystem();
    const q = Object.values(QUESTS).find(q => q.objectives.length > 1);
    qs.startQuest(q.id);
    for (const obj of q.objectives) {
      assert.equal(qs.isDone(q.id), false);
      qs.completeObjective(q.id, obj.id);
    }
    assert.equal(qs.isDone(q.id), true);
    assert.equal(qs.isActive(q.id), false, 'isActive é false depois de feita (done exclui active)');
  });

  test('incrementObjective soma count e marca done ao bater o target', () => {
    const qs = new QuestSystem();
    const q = Object.values(QUESTS).find(q => q.objectives.some(o => o.target));
    const obj = q.objectives.find(o => o.target);
    qs.startQuest(q.id);

    for (let i = 0; i < obj.target - 1; i++) qs.incrementObjective(q.id, obj.id);
    assert.equal(qs.state[q.id].objectives[obj.id].done, false);

    qs.incrementObjective(q.id, obj.id);
    assert.equal(qs.state[q.id].objectives[obj.id].done, true);
    assert.equal(qs.state[q.id].objectives[obj.id].count, obj.target);
  });

  test('getObjectiveText substitui o contador (x/y) quando o objetivo tem target', () => {
    const qs = new QuestSystem();
    const q = Object.values(QUESTS).find(q => q.objectives.some(o => o.target));
    const obj = q.objectives.find(o => o.target);
    qs.startQuest(q.id);
    qs.incrementObjective(q.id, obj.id);
    const text = qs.getObjectiveText(q.id, obj.id);
    assert.match(text, /\(1\/\d+\)/);
  });

  test('getActiveObjectivesSummary só lista objetivos pendentes de quests ativas', () => {
    const qs = new QuestSystem();
    const summary = qs.getActiveObjectivesSummary();
    const activeAutoStartCount = Object.values(QUESTS).filter(q => q.autoStart).reduce((n, q) => n + q.objectives.length, 0);
    assert.equal(summary.length, activeAutoStartCount);
  });

  test('serialize/deserialize preserva estado por id e ignora ids desconhecidos', () => {
    const qs = new QuestSystem();
    const paradaId = Object.values(QUESTS).find(q => !q.autoStart).id;
    qs.startQuest(paradaId);
    const saved = JSON.parse(JSON.stringify(qs.serialize()));
    saved.quest_que_nao_existe_mais = { active: true, done: false, objectives: {} };

    const restored = new QuestSystem();
    restored.deserialize(saved);
    assert.equal(restored.isActive(paradaId), true);
    assert.equal(restored.state.quest_que_nao_existe_mais, undefined);
  });
});

// ---------------------------------------------------------------------------
// DialogueSystem — construído com árvores sintéticas (não as reais de
// src/data/dialogues.json) pra isolar o teste do conteúdo narrativo.
// ---------------------------------------------------------------------------
function makeUiRecorder() {
  const calls = [];
  return {
    calls,
    show(text, options, npcName, delta) { calls.push({ type: 'show', text, options, npcName, delta }); },
    hide() { calls.push({ type: 'hide' }); },
  };
}

const TREES = {
  vendedor: {
    startRules: [
      { if: [{ type: 'flag', flag: 'ja_conheceu', value: true }], node: 'returning' },
      { if: [{ type: 'isNight' }], node: 'night' },
    ],
    startDefault: 'greet',
    nodes: {
      greet: {
        text: 'Olá, {{m:rapaz|f:moça|x:pessoa}}!',
        options: [
          { label: 'Comprar café (R$5)', next: 'bought', minMoney: 5, effect: { type: 'giveItem', item: 'coffee', cost: 5 } },
          { label: 'Só de passagem', next: null },
          { label: 'Parece com fome...', next: 'hungry_only', maxHunger: 30 },
        ],
      },
      bought: { text: 'Aqui está.', options: [{ label: 'Valeu', next: null }] },
      hungry_only: { text: 'Toma um lanche de graça.', options: [{ label: 'Obrigado', next: null }] },
      returning: {
        text: 'De novo por aqui!',
        options: [{ label: 'Marcar ponto', next: null, effect: { type: 'setFlag', flag: 'marcou_ponto', value: true } }],
      },
      night: { text: 'Já é tarde, hein.', options: [{ label: 'Boa noite', next: null }] },
    },
  },
  marina: {
    startDefault: 'intro',
    nodes: {
      intro: {
        text: 'Oi!',
        options: [{ label: 'Ajudar a achar o livro', next: null, effect: { type: 'changeRelationship', npc: 'marina', amount: 2, note: 'Ajudou a procurar' } }],
      },
    },
  },
  mae_operaria: {
    startDefault: 'family_check',
    nodes: {
      family_check: {
        text: 'Oi, filho(a).',
        options: [{ label: 'Oi, mãe', next: null }],
      },
    },
  },
};

function makeDialogueSystem({ money = 100, hunger = 100, originId = 'operario', sex = 'm', world } = {}) {
  const quests = new QuestSystem();
  const needs = new NeedsSystem(money);
  needs.hunger = hunger;
  const inventory = new InventorySystem();
  const gameState = new GameState();
  const ui = makeUiRecorder();
  const obligation = { active: true, misses: 0 };
  const w = world || { dayCount: 1, getFormattedTime: () => '08:00' };
  const ds = new DialogueSystem(TREES, quests, ui, null, inventory, needs, obligation, gameState, originId, sex, w);
  return { ds, ui, quests, needs, inventory, gameState, world: w };
}

describe('DialogueSystem — início e seleção de nó', () => {
  test('start() sem regra aplicável cai no startDefault e aplica pronome do sexo', () => {
    const { ds, ui } = makeDialogueSystem({ sex: 'f' });
    ds.start('vendedor', false, {});
    assert.equal(ui.calls[0].text, 'Olá, moça!');
  });

  test('sex "x" usa a variante neutra do pronome', () => {
    const { ds, ui } = makeDialogueSystem({ sex: 'x' });
    ds.start('vendedor', false, {});
    assert.equal(ui.calls[0].text, 'Olá, pessoa!');
  });

  test('startRules é avaliado em ordem — flag "ja_conheceu" leva pra returning', () => {
    const { ds, ui, gameState } = makeDialogueSystem();
    gameState.setFlag('ja_conheceu', true);
    ds.start('vendedor', false, {});
    assert.equal(ui.calls[0].text, 'De novo por aqui!');
  });

  test('isNight true leva pro nó noturno quando nenhuma outra regra bate antes', () => {
    const { ds, ui } = makeDialogueSystem();
    ds.start('vendedor', true, {});
    assert.equal(ui.calls[0].text, 'Já é tarde, hein.');
  });

  test('start() marca hasMetPlayer no npc e recordTalk no gameState', () => {
    const { ds, gameState } = makeDialogueSystem();
    const npc = {};
    assert.equal(gameState.hasMet('vendedor'), false);
    ds.start('vendedor', false, npc);
    assert.equal(npc.hasMetPlayer, true);
    assert.equal(gameState.hasMet('vendedor'), true);
    assert.equal(gameState.getTalkCount('vendedor'), 1);
  });
});

describe('DialogueSystem — filtro de opções por dinheiro/fome', () => {
  test('opção com minMoney some quando o jogador não tem o suficiente', () => {
    const { ds, ui } = makeDialogueSystem({ money: 2 });
    ds.start('vendedor', false, {});
    const labels = ui.calls[0].options;
    assert.ok(!labels.includes('Comprar café (R$5)'));
  });

  test('opção com maxHunger só aparece quando a fome está baixa o bastante', () => {
    const { ds: dsFaminto, ui: uiFaminto } = makeDialogueSystem({ hunger: 20 });
    dsFaminto.start('vendedor', false, {});
    assert.ok(uiFaminto.calls[0].options.includes('Parece com fome...'));

    const { ds: dsSaciado, ui: uiSaciado } = makeDialogueSystem({ hunger: 90 });
    dsSaciado.start('vendedor', false, {});
    assert.ok(!uiSaciado.calls[0].options.includes('Parece com fome...'));
  });
});

describe('DialogueSystem — choose() e efeitos', () => {
  test('giveItem com custo: paga, adiciona o item e avança pro próximo nó', () => {
    const { ds, ui, needs, inventory } = makeDialogueSystem({ money: 10 });
    ds.start('vendedor', false, {});
    ds.choose(0); // "Comprar café (R$5)"
    assert.equal(needs.money, 5);
    assert.equal(inventory.counts.coffee, 1);
    assert.equal(ui.calls.at(-1).text, 'Aqui está.');
  });

  test('opção com next: null fecha o diálogo (chama ui.hide, active=false)', () => {
    const { ds, ui } = makeDialogueSystem();
    ds.start('vendedor', false, {});
    ds.choose(1); // "Só de passagem"
    assert.equal(ds.active, false);
    assert.equal(ui.calls.at(-1).type, 'hide');
  });

  test('setFlag effect grava a flag no gameState', () => {
    const { ds, gameState } = makeDialogueSystem();
    gameState.setFlag('ja_conheceu', true);
    ds.start('vendedor', false, {});
    ds.choose(0); // "Marcar ponto" (único nó em returning)
    assert.equal(gameState.getFlag('marcou_ponto'), true);
  });

  test('changeRelationship effect atualiza o relacionamento e passa o delta pro próximo show()', () => {
    const { ds, ui, gameState } = makeDialogueSystem();
    ds.start('marina', false, {});
    ds.choose(0); // "Ajudar a achar o livro" — fecha o diálogo (next: null)
    assert.equal(gameState.getRelationship('marina'), 2);
    assert.deepEqual(gameState.getRelationshipLog('marina'), [{ day: 1, text: 'Ajudou a procurar' }]);
  });
});

describe('DialogueSystem — condições de família/chefe/relacionamento (via _evalCondition)', () => {
  test('isPlayerFamily bate só quando a origem do jogador é a família daquele NPC', () => {
    const { ds: filho } = makeDialogueSystem({ originId: 'operario' });
    assert.equal(filho._evalCondition({ type: 'isPlayerFamily' }, 'mae_operaria', {}), true);

    const { ds: estranho } = makeDialogueSystem({ originId: 'nobre' });
    assert.equal(estranho._evalCondition({ type: 'isPlayerFamily' }, 'mae_operaria', {}), false);
  });

  test('isPlayerBoss bate só quando a origem do jogador corresponde ao emprego daquele NPC', () => {
    const { ds: empregado } = makeDialogueSystem({ originId: 'operario' });
    assert.equal(empregado._evalCondition({ type: 'isPlayerBoss' }, 'seu_ivo', {}), true);
    assert.equal(empregado._evalCondition({ type: 'isPlayerBoss' }, 'professora', {}), false);
  });

  test('"not" inverte o resultado da condição interna', () => {
    const { ds } = makeDialogueSystem();
    assert.equal(ds._evalCondition({ type: 'not', of: { type: 'isNight' } }, 'vendedor', {}), true);
    ds._isNight = true;
    assert.equal(ds._evalCondition({ type: 'not', of: { type: 'isNight' } }, 'vendedor', {}), false);
  });

  test('condição "relationship" cobre os seis operadores', () => {
    const { ds, gameState } = makeDialogueSystem();
    gameState.setRelationship('marina', 3);
    const cases = [
      ['>', 2, true], ['>', 3, false],
      ['>=', 3, true], ['>=', 4, false],
      ['<', 4, true], ['<', 3, false],
      ['<=', 3, true], ['<=', 2, false],
      ['==', 3, true], ['==', 4, false],
      ['!=', 4, true], ['!=', 3, false],
    ];
    for (const [operator, value, expected] of cases) {
      assert.equal(
        ds._evalCondition({ type: 'relationship', npc: 'marina', operator, value }, 'marina', {}),
        expected,
        `relationship ${operator} ${value}`
      );
    }
  });

  test('obligationActive/obligationHasMisses refletem o obligationSystem injetado', () => {
    const { ds } = makeDialogueSystem();
    assert.equal(ds._evalCondition({ type: 'obligationActive' }, 'x', {}), true);
    assert.equal(ds._evalCondition({ type: 'obligationHasMisses' }, 'x', {}), false);
    ds.obligation.misses = 1;
    assert.equal(ds._evalCondition({ type: 'obligationHasMisses' }, 'x', {}), true);
  });

  test('condição de tipo desconhecido é segura por padrão (retorna false)', () => {
    const { ds } = makeDialogueSystem();
    assert.equal(ds._evalCondition({ type: 'tipo_que_nao_existe' }, 'x', {}), false);
  });
});
