import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers.js';

test('tela de carregamento mostra imagem/dica ao entrar, some ao terminar, e a barra chega a 100%', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/index.html');

  const shotBg = await page.evaluate(() => {
    const el = document.getElementById('loading-shot');
    return el ? getComputedStyle(el).backgroundImage : null;
  });
  expect(shotBg).toBeTruthy();
  expect(shotBg).not.toBe('none');

  await expect(page.locator('#loading-screen')).not.toHaveClass(/hidden/);
  const tipText1 = await page.locator('#loading-tip-text').textContent();
  expect(tipText1.length).toBeGreaterThan(5);

  await expect(page.locator('#menu-screen')).not.toHaveClass(/hidden/, { timeout: 45000 });
  await expect(page.locator('#loading-screen')).toHaveClass(/hidden/);

  const finalFill = await page.locator('#loading-fill').evaluate(el => el.style.width);
  expect(finalFill).toBe('100%');

  expect(errors).toEqual([]);
});

test('o timer de rotação de dicas é limpo quando a tela some (não segue trocando escondida)', async ({ page }) => {
  collectConsoleErrors(page);
  await page.goto('/index.html');
  await expect(page.locator('#menu-screen')).not.toHaveClass(/hidden/, { timeout: 45000 });
  const tipAfterHide = await page.locator('#loading-tip-text').textContent();
  await page.waitForTimeout(6500); // > intervalo de troca de dica (6s)
  const tipLater = await page.locator('#loading-tip-text').textContent();
  expect(tipLater).toBe(tipAfterHide);
});
