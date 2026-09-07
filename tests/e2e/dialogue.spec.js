import { test, expect } from '@playwright/test';
import { startGameDirect, collectConsoleErrors } from './helpers.js';

// Cobre a integração real do DialogueSystem com o conteúdo de
// src/data/dialogues.json — a lógica de avaliação de condição/efeito em si
// já tem cobertura unitária com árvores sintéticas (interactions.test.js).
// Aqui o objetivo é pegar quebras de contrato entre conteúdo e código: um id
// de nó que sumiu, uma condição que passou a exigir algo que o NPC não tem,
// etc.

test.beforeEach(({ page }) => collectConsoleErrors(page));

test('Sr. Almeida: completar a árvore de boas-vindas conclui a missão e reabre em "idle"', async ({ page }) => {
  await startGameDirect(page);
  const result = await page.evaluate(() => {
    const g = window.__game;
    const npc = g.npcs.find(n => n.def.id === 'almeida');
    g.dialogue.start('almeida', false, npc);
    const node1 = g.dialogue.nodeId;
    g.dialogue.choose(0);
    const node2 = g.dialogue.nodeId;
    g.dialogue.choose(0);
    const node3 = g.dialogue.nodeId;
    const boasVindasDone = g.quests.isDone('boas_vindas');
    g.dialogue.close();
    g.dialogue.start('almeida', false, npc);
    const reopen = g.dialogue.nodeId;
    return { node1, node2, node3, boasVindasDone, reopen };
  });
  expect(result.node1).toBe('a1');
  expect(result.node2).toBe('a2');
  expect(result.node3).toBe('a3');
  expect(result.boasVindasDone).toBe(true);
  expect(result.reopen).toBe('idle');
});

test('Marina: aceitar a missão do livro, achar e devolver conclui "livro_esquecido"', async ({ page }) => {
  await startGameDirect(page);
  const result = await page.evaluate(() => {
    const g = window.__game;
    const npc = g.npcs.find(n => n.def.id === 'marina');

    g.dialogue.start('marina', false, npc);
    const intro = g.dialogue.nodeId;
    g.dialogue.choose(0); // aceita a missão
    const afterAccept = g.dialogue.nodeId;
    const livroActive = g.quests.isActive('livro_esquecido');
    g.dialogue.close();

    g.dialogue.start('marina', false, npc); // ainda não achou o livro
    const waiting = g.dialogue.nodeId;
    g.dialogue.close();

    g.quests.completeObjective('livro_esquecido', 'find_book');
    g.dialogue.start('marina', false, npc); // achou, ainda não devolveu
    const readyToReturn = g.dialogue.nodeId;
    g.dialogue.choose(0); // devolve
    const livroDone = g.quests.isDone('livro_esquecido');
    g.dialogue.close();

    g.dialogue.start('marina', false, npc); // já devolvido
    const done = g.dialogue.nodeId;

    return { intro, afterAccept, livroActive, waiting, readyToReturn, livroDone, done };
  });

  expect(result.livroActive).toBe(true);
  expect(result.livroDone).toBe(true);
  // Cada estágio da missão deve levar a um nó diferente do anterior — prova
  // de que o startRules está de fato reagindo ao progresso da missão.
  const stages = [result.intro, result.waiting, result.readyToReturn, result.done];
  expect(new Set(stages).size).toBe(4);
});

test('Diego: nó de diálogo muda entre dia e noite', async ({ page }) => {
  await startGameDirect(page);
  const result = await page.evaluate(() => {
    const g = window.__game;
    const npc = g.npcs.find(n => n.def.id === 'diego');
    g.dialogue.start('diego', false, npc);
    const day = g.dialogue.nodeId;
    g.dialogue.close();
    g.dialogue.start('diego', true, npc);
    const night = g.dialogue.nodeId;
    return { day, night };
  });
  expect(result.day).not.toBe(result.night);
});

test('Dona Rosa: reage à origem do jogador (família vs. estranho) e ao estado da obrigação', async ({ page }) => {
  await startGameDirect(page, { name: 'Rel', sex: 'f', courseId: 'engenharia' });
  const result = await page.evaluate(() => {
    const g = window.__game;
    const npc = g.npcs.find(n => n.def.id === 'mae_operaria');

    const savedOrigin = g.dialogue.originId;
    g.dialogue.originId = 'nobre'; // não é família dela
    g.dialogue.start('mae_operaria', false, npc);
    const stranger = g.dialogue.nodeId;
    g.dialogue.close();

    g.dialogue.originId = savedOrigin === 'nobre' ? 'operario' : savedOrigin;
    npc.hasMetPlayer = false;
    g.dialogue.start('mae_operaria', false, npc);
    const firstGreet = g.dialogue.nodeId;
    g.dialogue.close();

    g.dialogue.start('mae_operaria', false, npc); // já se conheceram
    const knownAlready = g.dialogue.nodeId;
    g.dialogue.close();

    g.obligation.misses = 1;
    g.dialogue.start('mae_operaria', false, npc);
    const withMisses = g.dialogue.nodeId;
    g.dialogue.close();

    g.obligation.active = false;
    g.dialogue.start('mae_operaria', false, npc);
    const obligationOver = g.dialogue.nodeId;

    return { stranger, firstGreet, knownAlready, withMisses, obligationOver };
  });

  // O nó "estranho" (não-família) tem que ser diferente do primeiro
  // encontro com a família, e cada mudança de estado (já conhecido, com
  // faltas, sem obrigação) tem que levar a um nó distinto.
  const familyStages = [result.firstGreet, result.knownAlready, result.withMisses, result.obligationOver];
  expect(result.stranger).not.toBe(result.firstGreet);
  expect(new Set(familyStages).size).toBe(4);
});
