import { test, expect } from '@playwright/test';
import { startGameDirect, collectConsoleErrors } from './helpers.js';

// Regressão recorrente: toda vez que a ferramenta de design externa manda um
// ui.js novo, ela regenera bearingTo() a partir de uma versão antiga e
// inverte o sinal — o que faz alvos à frente do jogador sumirem da bússola
// (fora do FOV) e alvos atrás aparecerem centralizados. Ver git log de
// src/ui.js pra histórico. Este teste existe especificamente pra pegar essa
// reversão automaticamente, sem depender de eu lembrar de checar à mão.
test('bússola: alvo à frente aparece centralizado, atrás fica escondido', async ({ page }) => {
  collectConsoleErrors(page);
  await startGameDirect(page);
  await page.evaluate(() => { window.__game.running = false; }); // trava o loop real

  const result = await page.evaluate(() => {
    const g = window.__game;
    g.ui.compassMarkers.innerHTML = '';
    g.ui._markerEls.clear();

    // Por player.js: targetAngle = atan2(move.x, move.z) — facingAngle=0
    // significa o personagem virado/andando pra +Z.
    const player = { position: { x: 0, y: 0, z: 0 }, facingAngle: 0 };

    const probe = (position) => {
      g.ui.compassMarkers.innerHTML = '';
      g.ui._markerEls.clear();
      const fake = { fragments: [{ collected: false, mesh: { position } }], item: null };
      g.ui.drawCompass(player, fake, null, null);
      const m = g.ui._markerEls.get('frag_0');
      return m ? { left: m.style.left, display: m.style.display } : { left: null, display: 'missing' };
    };

    return {
      ahead: probe({ x: 0, y: 0, z: 5 }),
      behind: probe({ x: 0, y: 0, z: -5 }),
      right: probe({ x: 5, y: 0, z: 0 }),
    };
  });

  // O centro da faixa da bússola é a metade da sua largura (500px no CSS atual).
  expect(result.ahead.display).not.toBe('none');
  expect(result.ahead.display).not.toBe('missing');
  expect(parseFloat(result.ahead.left)).toBeCloseTo(250, 0);

  expect(result.behind.display === 'none' || result.behind.display === 'missing').toBe(true);
});

test('bússola: alvo lateral não fica no centro (a rotação de fato distingue frente de lado)', async ({ page }) => {
  collectConsoleErrors(page);
  await startGameDirect(page);
  await page.evaluate(() => { window.__game.running = false; });

  const result = await page.evaluate(() => {
    const g = window.__game;
    g.ui.compassMarkers.innerHTML = '';
    g.ui._markerEls.clear();
    const player = { position: { x: 0, y: 0, z: 0 }, facingAngle: 0 };
    const fake = { fragments: [{ collected: false, mesh: { position: { x: 5, y: 0, z: 0 } } }], item: null };
    g.ui.drawCompass(player, fake, null, null);
    const m = g.ui._markerEls.get('frag_0');
    return m ? parseFloat(m.style.left) : null;
  });

  expect(result).not.toBeNull();
  expect(Math.abs(result - 250)).toBeGreaterThan(20);
});
