import { test, expect } from '@playwright/test';
import { startGameRunning, collectConsoleErrors } from './helpers.js';

async function positionPlayerAtDummy(page) {
  await page.evaluate(() => {
    const g = window.__game;
    const d = g.dummy.position;
    g.player.position.set(d.x - 1.2, 0, d.z);
    g.player.facingAngle = Math.PI / 2;
  });
}

// Vai direto pro jogo rodando em vez de clicar pela tela de criação: o fluxo
// de criação já é coberto por menus.spec.js, e pagar por ele em cada um dos
// cinco testes de combate era o que fazia este arquivo estourar o timeout
// num runner lento.
test.beforeEach(async ({ page }) => {
  collectConsoleErrors(page);
  await startGameRunning(page, { name: 'Combate', sex: 'm' });
  await positionPlayerAtDummy(page);
});

test('esquivar a tempo do telegraph evita o dano do contra-ataque', async ({ page }) => {
  const hpBefore = await page.evaluate(() => window.__game.player.hp);
  await page.evaluate(() => { window.__game.dummy.counterPending = true; });
  await page.waitForFunction(() => window.__game.dummy.telegraphActive, { timeout: 5000 });

  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(30);
  await page.keyboard.up('KeyQ');
  const isDodgingRightAfter = await page.evaluate(() => window.__game.player.isDodging);
  expect(isDodgingRightAfter).toBe(true);

  await page.waitForFunction(() => !window.__game.dummy.telegraphActive, { timeout: 5000 });
  const hpAfter = await page.evaluate(() => window.__game.player.hp);
  expect(hpAfter).toBe(hpBefore);
});

test('não esquivar do telegraph resulta em dano do contra-ataque', async ({ page }) => {
  const hpBefore = await page.evaluate(() => window.__game.player.hp);
  await page.evaluate(() => { window.__game.dummy.counterPending = true; });
  await page.waitForFunction(() => window.__game.dummy.telegraphActive, { timeout: 5000 });
  await page.waitForFunction(() => !window.__game.dummy.telegraphActive, { timeout: 5000 });
  const hpAfter = await page.evaluate(() => window.__game.player.hp);
  expect(hpAfter).toBe(hpBefore - 8);
});

test('um soco isolado tira o dano normal do boneco', async ({ page }) => {
  const hp0 = await page.evaluate(() => window.__game.dummy.hp);
  await page.evaluate(() => { window.__game.input.attackJustPressed = true; });
  await page.waitForFunction(() => window.__game.player.isAttacking, { timeout: 5000 });
  await page.waitForFunction(() => !window.__game.player.isAttacking, { timeout: 5000 });
  const hp1 = await page.evaluate(() => window.__game.dummy.hp);
  expect(hp0 - hp1).toBe(12);
});

// A janela de combo dura 0.4s de tempo de jogo. Fazer isso pelo relógio real
// (evaluate -> waitForFunction -> evaluate) é uma corrida perdida em máquina
// lenta: o round-trip do Playwright sozinho já estoura a janela. Por isso a
// sequência inteira roda dentro de um único evaluate, com o loop congelado e
// o dt sendo passado à mão — o que também deixa o teste determinístico.
test('segundo soco dentro da janela de combo usa o dano de combo; fora dela, o dano normal', async ({ page }) => {
  const result = await page.evaluate(() => {
    const g = window.__game;
    g.running = false; // congela o requestAnimationFrame pra controlar o tempo
    const p = g.player;
    const input = g.input;
    const dodgeKey = g.ui.getBinding('dodge');
    const step = dt => p.update(dt, input, dodgeKey);

    const punch = () => {
      p.stamina = 100;
      input.attackJustPressed = true;
      step(1 / 60);
      const damage = p.attackDamage;
      let guard = 0;
      while (p.isAttacking && guard++ < 600) step(1 / 60); // roda até a animação acabar
      return damage;
    };

    const firstDamage = punch();
    const comboWindowOpen = p.comboStage === 1 && p.comboTimer > 0;
    const comboDamage = punch(); // imediatamente depois: dentro da janela

    // Agora deixa a janela expirar (0.4s de tempo de jogo) e soca de novo.
    for (let i = 0; i < 60; i++) step(1 / 60); // 1s > 0.4s de janela
    const afterWindowDamage = punch();

    return { firstDamage, comboWindowOpen, comboDamage, afterWindowDamage };
  });

  expect(result.firstDamage).toBe(12);
  expect(result.comboWindowOpen).toBe(true);
  expect(result.comboDamage).toBe(18);
  expect(result.afterWindowDamage).toBe(12);
});

test('agachado: bloqueia ataque, esquiva e pulo; solta ao levantar', async ({ page }) => {
  await page.keyboard.down('KeyC');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.player.isCrouching)).toBe(true);

  await page.evaluate(() => { window.__game.input.attackJustPressed = true; });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__game.player.isAttacking)).toBe(false);

  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(50);
  await page.keyboard.up('KeyQ');
  expect(await page.evaluate(() => window.__game.player.isDodging)).toBe(false);

  await page.keyboard.down('Space');
  await page.waitForTimeout(50);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.__game.player.isGrounded)).toBe(true);

  await page.keyboard.up('KeyC');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game.player.isCrouching)).toBe(false);
});
