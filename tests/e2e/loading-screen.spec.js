import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers.js';

test('tela de carregamento mostra imagem/dica ao entrar, some ao terminar, e a barra chega a 100%', async ({ page }) => {
  const errors = collectConsoleErrors(page);

  // Segura o fetch dos diálogos pra travar o boot no meio (_boot() busca esse
  // arquivo entre "Carregando personagens" e "Montando a cidade"). Sem isso o
  // teste vira uma corrida contra a máquina: num runner rápido a tela de
  // carregamento aparece e some antes de qualquer asserção observá-la — foi
  // exatamente assim que este teste falhou no CI passando aqui.
  let releaseBoot;
  const bootHeld = new Promise(resolve => { releaseBoot = resolve; });
  await page.route('**/src/data/dialogues.json', async route => {
    await bootHeld;
    await route.continue();
  });

  // 'commit' em vez do 'load' padrão: não queremos esperar a página terminar
  // de carregar, justamente porque ela está segurada de propósito.
  await page.goto('/index.html', { waitUntil: 'commit' });

  // Espera o ui.js montar a tela (sortear a imagem) antes de olhar pra ela —
  // com 'commit' a página mal começou, então o módulo pode nem ter rodado
  // ainda. Como o boot está segurado, essa espera é determinística: a tela
  // fica nesse estado até a gente liberar.
  await page.waitForFunction(() => {
    const el = document.getElementById('loading-shot');
    return el && getComputedStyle(el).backgroundImage !== 'none';
  }, { timeout: 15000 });

  await expect(page.locator('#loading-screen')).not.toHaveClass(/hidden/);
  const shotBg = await page.locator('#loading-shot').evaluate(el => getComputedStyle(el).backgroundImage);
  expect(shotBg).toContain('assets/loading/');
  const tipText = await page.locator('#loading-tip-text').textContent();
  expect(tipText.length).toBeGreaterThan(5);

  // Libera o boot: a tela some, o menu aparece e a barra fecha em 100%.
  releaseBoot();
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
