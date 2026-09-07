import { test, expect } from '@playwright/test';
import { gotoBooted, collectConsoleErrors } from './helpers.js';

test.describe('Menu inicial e configurações', () => {
  test.beforeEach(async ({ page }) => {
    collectConsoleErrors(page);
    await gotoBooted(page);
    await page.evaluate(() => localStorage.clear());
  });

  test('menu inicial tem os botões de novo jogo, configurações e créditos', async ({ page }) => {
    await expect(page.locator('#btn-newgame')).toBeVisible();
    await expect(page.locator('#btn-settings')).toBeVisible();
    await expect(page.locator('#btn-credits')).toBeVisible();
  });

  test('configurações abre a partir do menu e mostra os controles fixos e remapeáveis', async ({ page }) => {
    await page.click('#btn-settings');
    await expect.poll(() => page.evaluate(() => window.__game.ui.isSettingsOpen())).toBe(true);

    const rows = await page.evaluate(() => ({
      fixedCount: document.querySelectorAll('#keybinds-fixed .keybind-row').length,
      editableCount: document.querySelectorAll('#keybinds-editable .keybind-row').length,
      crouchText: [...document.querySelectorAll('#keybinds-fixed .keybind-row')].find(r => r.textContent.includes('Agachar'))?.textContent,
    }));
    expect(rows.fixedCount).toBe(6);
    expect(rows.editableCount).toBe(6);
    expect(rows.crouchText).toContain('C');
    expect(rows.crouchText).not.toContain('Ctrl');
  });

  test('remapear uma ação persiste em localStorage e reset volta ao padrão', async ({ page }) => {
    await page.click('#btn-settings');
    await page.click('[data-rebind="interact"]');
    await page.keyboard.press('KeyG');

    await expect.poll(() => page.evaluate(() => window.__game.ui.getBinding('interact'))).toBe('KeyG');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ecos.keybinds') || '{}').interact);
    expect(stored).toBe('KeyG');

    await page.keyboard.press('KeyR');
    await expect.poll(() => page.evaluate(() => window.__game.ui.getBinding('interact'))).toBe('KeyE');
  });

  test('Esc fecha as configurações e volta pro menu', async ({ page }) => {
    await page.click('#btn-settings');
    await page.keyboard.press('Escape');
    const state = await page.evaluate(() => ({
      settingsHidden: window.__game.ui.settingsScreen.classList.contains('hidden'),
      menuVisible: !window.__game.ui.menuScreen.classList.contains('hidden'),
    }));
    expect(state.settingsHidden).toBe(true);
    expect(state.menuVisible).toBe(true);
  });

  test('créditos abre e o botão de voltar retorna ao menu', async ({ page }) => {
    await page.click('#btn-credits');
    await expect.poll(() => page.evaluate(() => window.__game.ui.isCreditsOpen())).toBe(true);
    await page.click('#btn-credits-back');
    const state = await page.evaluate(() => ({
      creditsHidden: !window.__game.ui.isCreditsOpen(),
      menuVisible: !window.__game.ui.menuScreen.classList.contains('hidden'),
    }));
    expect(state.creditsHidden).toBe(true);
    expect(state.menuVisible).toBe(true);
  });

  test('dodge remapeado passa a valer no player.update, e a tecla antiga fica inerte', async ({ page }) => {
    await page.evaluate(() => {
      const g = window.__game;
      g._startGame(null, { name: 'Remap', sex: 'x', courseId: 'engenharia' });
      g.ui.keybinds.dodge = 'KeyZ';
      g.ui._saveKeybinds();
    });
    const result = await page.evaluate(() => {
      const g = window.__game;
      g.player.stamina = 100;
      g.input.justPressed.add('KeyQ');
      g.player.update(0.016, g.input, g.ui.getBinding('dodge'));
      const dodgedOnOldKey = g.player.isDodging;

      g.player.isDodging = false;
      g.player.stamina = 100;
      g.input.justPressed.add('KeyZ');
      g.player.update(0.016, g.input, g.ui.getBinding('dodge'));
      const dodgedOnNewKey = g.player.isDodging;
      return { dodgedOnOldKey, dodgedOnNewKey };
    });
    expect(result.dodgedOnOldKey).toBe(false);
    expect(result.dodgedOnNewKey).toBe(true);
  });
});

test.describe('Criação de personagem', () => {
  test.beforeEach(async ({ page }) => {
    collectConsoleErrors(page);
    await gotoBooted(page);
    await page.evaluate(() => localStorage.clear());
    await page.click('#btn-newgame');
  });

  test('mostra os 3 cursos disponíveis', async ({ page }) => {
    const count = await page.evaluate(() => document.querySelectorAll('#cc-course-list [data-course]').length);
    expect(count).toBe(3);
  });

  test('resumo do curso mostra o compromisso e o dinheiro inicial; confirmar só habilita com tudo escolhido', async ({ page }) => {
    await expect(page.locator('#cc-confirm')).toBeDisabled();

    await page.fill('#cc-name', 'Testador');
    await page.click('[data-sex="f"]');
    await page.click('[data-course="engenharia"]');

    const summary = (await page.locator('#cc-course-summary').textContent()).replace(/\s+/g, ' ').trim();
    expect(summary).toContain('Engenharia');
    expect(summary).toContain('R$60');
    await expect(page.locator('#cc-confirm')).toBeEnabled();
  });

  test('confirmar inicia o jogo com dinheiro/obrigação/casa derivados do curso', async ({ page }) => {
    await page.fill('#cc-name', 'Testador');
    await page.click('[data-sex="f"]');
    await page.click('[data-course="engenharia"]');
    await page.click('#cc-confirm');
    await page.waitForSelector('#hud:not(.hidden)');

    const state = await page.evaluate(() => {
      const g = window.__game;
      return {
        running: g.running,
        money: g.needs.money,
        obligationId: g.obligation.def.id,
        obligationLabel: g.obligation.def.label,
        homeKind: g.homeKind,
        courseId: g.profile.courseId,
      };
    });
    expect(state.running).toBe(true);
    expect(state.money).toBe(60);
    expect(state.obligationId).toBe('course_engenharia');
    expect(state.obligationLabel).toBe('Aula de Engenharia');
    expect(state.homeKind).toBe('home_operario');
    expect(state.courseId).toBe('engenharia');
  });
});

test.describe('Menu de pausa', () => {
  test('tem botão de configurações, e Esc a partir dele volta pra pausa (não pro jogo)', async ({ page }) => {
    collectConsoleErrors(page);
    await gotoBooted(page);
    await page.evaluate(() => {
      const g = window.__game;
      g._startGame(null, { name: 'Pausa', sex: 'x', courseId: 'engenharia' });
      g.paused = true;
      g.ui.showPause();
    });

    await expect(page.locator('#btn-pause-settings')).toBeVisible();
    await page.click('#btn-pause-settings');
    await expect.poll(() => page.evaluate(() => window.__game.ui.isSettingsOpen())).toBe(true);

    await page.keyboard.press('Escape');
    const backToPause = await page.evaluate(() => !window.__game.ui.pauseMenu.classList.contains('hidden'));
    expect(backToPause).toBe(true);
  });
});
