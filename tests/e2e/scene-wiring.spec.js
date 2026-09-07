import { test, expect } from '@playwright/test';
import { createNewGameViaMenu, collectConsoleErrors } from './helpers.js';
import { NPC_DEFS, LANDMARK_SPECS } from '../../src/data.js';

test('a cena carrega todos os NPCs, landmarks e o boneco de treino nas posições esperadas, sem erros', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await createNewGameViaMenu(page, { name: 'Cena', sex: 'm' });

  const state = await page.evaluate(() => {
    const g = window.__game;
    return {
      npcPositions: g.npcs.map(n => ({ id: n.def.id, x: n.position.x, z: n.position.z })),
      landmarkKinds: g.world.buildingAABBs.filter(b => b.kind).map(b => b.kind),
      fragmentCount: g.collectibles.fragments.length,
      dummyPos: g.dummy.position,
    };
  });

  const expectedIds = NPC_DEFS.map(n => n.id).sort();
  expect(state.npcPositions.map(n => n.id).sort()).toEqual(expectedIds);
  // Nenhum NPC deveria carregar em (0,0) por engano (posição não resolvida).
  for (const npc of state.npcPositions) {
    expect(npc.x !== 0 || npc.z !== 0).toBe(true);
  }

  expect(state.landmarkKinds.sort()).toEqual(Object.keys(LANDMARK_SPECS).sort());
  expect(state.fragmentCount).toBeGreaterThan(0);
  expect(Number.isFinite(state.dummyPos.x)).toBe(true);
  expect(Number.isFinite(state.dummyPos.z)).toBe(true);

  expect(errors).toEqual([]);
});
