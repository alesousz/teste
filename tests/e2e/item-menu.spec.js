import { test, expect } from '@playwright/test';
import { startGameDirect, collectConsoleErrors } from './helpers.js';

test.beforeEach(({ page }) => collectConsoleErrors(page));

function openItemMenu(page) {
  return page.evaluate(() => {
    const g = window.__game;
    g.ui.toggleItemMenu(g.inventory, g.needs, g._boundUseItem, g._boundDiscardItem);
  });
}

test('usar um item consome uma unidade e aplica o efeito (energia)', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => { window.__game.inventory.addItem('coffee', 2); window.__game.needs.energy = 50; });
  await openItemMenu(page);

  const result = await page.evaluate(() => {
    const g = window.__game;
    g.ui._renderItemMenuBody(); // seleciona o primeiro item automaticamente
    g.ui.itemMenuUseSelected();
    return { coffee: g.inventory.counts.coffee, energy: g.needs.energy };
  });
  expect(result.coffee).toBe(1);
  expect(result.energy).toBe(75);
});

test('descartar um item reduz a contagem e some da lista quando chega a zero', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => { window.__game.inventory.addItem('snack', 1); });
  await openItemMenu(page);

  const result = await page.evaluate(() => {
    const g = window.__game;
    g.ui._renderItemMenuBody();
    g.ui.itemMenuDiscardSelected();
    return { snack: g.inventory.counts.snack, owned: g.inventory.getOwnedItems().length };
  });
  expect(result.snack).toBe(0);
  expect(result.owned).toBe(0);
});

test('toggleItemMenu abre e fecha, refletindo em isItemMenuOpen()', async ({ page }) => {
  await startGameDirect(page);
  await openItemMenu(page);
  expect(await page.evaluate(() => window.__game.ui.isItemMenuOpen())).toBe(true);
  await openItemMenu(page);
  expect(await page.evaluate(() => window.__game.ui.isItemMenuOpen())).toBe(false);
});
