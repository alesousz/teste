import { test, expect } from '@playwright/test';
import { gotoBooted, startGameDirect, collectConsoleErrors } from './helpers.js';

// A lógica pura de save/load e do GameState já tem cobertura unitária
// (tests/unit/gameState.test.js, tests/unit/save.test.js). Aqui testamos só
// a integração real: o jogo inteiro (_startGame/_saveGame) gravando e
// restaurando estado através do localStorage de verdade.

test.beforeEach(({ page }) => { collectConsoleErrors(page); });

test('save inclui version/timestamp/gameState, e load restaura tudo', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.gameState.setFlag('test_save_flag', true);
    g.gameState.setRelationship('ivo', 33);
    g._saveGame();
  });

  const saveShape = await page.evaluate(() => JSON.parse(localStorage.getItem('ecos-da-cidade-save-v1')));
  expect(saveShape.version).toBe(1);
  expect(typeof saveShape.timestamp).toBe('number');
  expect(saveShape.gameState.flags.test_save_flag).toBe(true);
  expect(saveShape.gameState.npcs.ivo.rel).toBe(33);

  await page.reload();
  await gotoBooted(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('ecos-da-cidade-save-v1'));
    window.__game._startGame(data, data.profile);
  });
  await page.waitForTimeout(300);

  const restored = await page.evaluate(() => ({
    flag: window.__game.gameState.getFlag('test_save_flag'),
    rel: window.__game.gameState.getRelationship('ivo'),
  }));
  expect(restored.flag).toBe(true);
  expect(restored.rel).toBe(33);
});

test('inventário e itens do mundo coletados sobrevivem a um save/load', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.inventory.addItem('coffee', 2);
    g.collectibles.collectWorldItem(g.collectibles.worldItems[0]);
    g._saveGame();
  });

  await page.reload();
  await gotoBooted(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('ecos-da-cidade-save-v1'));
    window.__game._startGame(data, data.profile);
  });
  await page.waitForTimeout(300);

  const restored = await page.evaluate(() => ({
    coffee: window.__game.inventory.counts.coffee,
    collectedCount: window.__game.collectibles.collectedWorldItemIds.size,
  }));
  expect(restored.coffee).toBe(2);
  expect(restored.collectedCount).toBe(1);
});

test('save antigo sem version/gameState carrega sem lançar e migra pro estado default', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => {
    const g = window.__game;
    const legacySave = {
      player: { x: 10, z: 20, camYaw: 1.2 },
      timeOfDay: 0.4,
      dayCount: 3,
      quests: g.quests.serialize(),
      collectedFragments: [],
      bookCollected: false,
      collectedWorldItems: [],
      inventory: { coffee: 2 },
      profile: { name: 'Legado', sex: 'm', originId: 'operario' },
      needs: { energy: 80, hunger: 70, money: 45 },
      obligation: { attendedToday: false, misses: 1, active: true, lastProcessedDay: 2 },
    };
    localStorage.setItem('ecos-da-cidade-save-v1', JSON.stringify(legacySave));
  });

  await page.reload();
  await gotoBooted(page);
  const result = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('ecos-da-cidade-save-v1'));
    let threw = null;
    try {
      window.__game._startGame(data, data.profile);
    } catch (e) {
      threw = e.message;
    }
    const g = window.__game;
    return {
      threw,
      playerX: g.player.position.x,
      dayCount: g.world.dayCount,
      money: g.needs.money,
      coffeeCount: g.inventory.counts.coffee,
      gameStateIsDefault: Object.keys(g.gameState.flags).length === 0 && Object.keys(g.gameState.npcs).length === 0,
    };
  });

  expect(result.threw).toBeNull();
  expect(result.playerX).toBe(10);
  expect(result.dayCount).toBe(3);
  expect(result.money).toBe(45);
  expect(result.coffeeCount).toBe(2);
  expect(result.gameStateIsDefault).toBe(true);
});

test('save antigo com "relationships: {npc: number}" migra pro formato novo sem perder o valor', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => {
    localStorage.setItem('ecos-da-cidade-save-v1', JSON.stringify({
      version: 1,
      player: { x: 0, z: 0, camYaw: 0 },
      timeOfDay: 0.4,
      dayCount: 1,
      quests: window.__game.quests.serialize(),
      collectedFragments: [],
      bookCollected: false,
      collectedWorldItems: [],
      inventory: {},
      profile: { name: 'PréMigração', sex: 'm', courseId: 'engenharia' },
      needs: { energy: 100, hunger: 100, money: 60 },
      obligation: { attendedToday: false, misses: 0, active: true, lastProcessedDay: null },
      gameState: { flags: {}, relationships: { seu_ivo: 12, marina: -3 } },
    }));
  });

  await page.reload();
  await gotoBooted(page);
  const rel = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('ecos-da-cidade-save-v1'));
    window.__game._startGame(data, data.profile);
    const g = window.__game;
    return { ivo: g.gameState.getRelationship('seu_ivo'), marina: g.gameState.getRelationship('marina') };
  });
  expect(rel.ivo).toBe(12);
  expect(rel.marina).toBe(-3);
});
