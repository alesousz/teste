import { test, expect } from '@playwright/test';

test('o jogo carrega e chega no menu inicial sem erros de console', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));

  await page.goto('/index.html');
  await page.waitForFunction(() => window.__game && window.__game.dialogueTrees, { timeout: 45000 });
  await expect(page.locator('#menu-screen')).not.toHaveClass(/hidden/, { timeout: 45000 });

  expect(errors).toEqual([]);
});
