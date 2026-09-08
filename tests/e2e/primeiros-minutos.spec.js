import { test, expect } from '@playwright/test';
import { gotoBooted, startGameRunning, collectConsoleErrors } from './helpers.js';

// Os primeiros minutos jogáveis: o jogador acorda no apartamento, explora,
// recebe a mensagem dos pais, sai pelo corredor, desce a escada e chega na rua.
//
// O percurso é andado com o `player.update()` real (mesma física, mesma
// colisão) em vez de eventos de teclado: assim o teste é determinístico e não
// depende do tempo de resposta do navegador, mas continua exercitando o
// caminho de verdade — foi assim que apareceu o buraco na laje da soleira.

const ROTA = [
  ['porta do quarto', 1.7, 3.9],
  ['sala e cozinha', 2.8, 6.2],
  ['porta do 201', 2.6, 8.7],
  ['corredor', 6.0, 9.8],
  ['porta do patamar', 11.5, 10.5],
  ['patamar', 13.6, 10.2],
  ['escada', 13.6, 6.0],
  ['base da escada', 13.6, 2.0],
  ['porta do saguão', 11.5, 1.9],
  ['saguão', 8.0, 4.0],
  ['soleira', 5.8, 1.2],
  ['rua', 5.8, -4.0],
];

// Anda até um ponto da planta usando o update real do jogador.
async function caminharAte(page, lx, lz) {
  return page.evaluate(({ lx, lz }) => {
    const g = window.__game;
    const O = g.world.interior.origin;
    const alvo = { x: lx + O.x, z: lz + O.z };
    const p = g.player;
    const input = { isDown: c => c === 'KeyW', wasPressed: () => false, consumeAttack: () => false };
    let travado = 0;
    for (let i = 0; i < 2000; i++) {
      const dx = alvo.x - p.position.x, dz = alvo.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) return { ok: true, y: p.position.y };
      const antes = { x: p.position.x, z: p.position.z };
      // A câmera fica ATRÁS do personagem, então ele anda em -forward.
      p.camYaw = Math.atan2(-dx, -dz);
      p.update(1 / 60, input, 'KeyQ');
      if (p.position.y < -1) return { ok: false, motivo: 'caiu do mundo', y: p.position.y };
      travado = Math.hypot(p.position.x - antes.x, p.position.z - antes.z) < 0.005 ? travado + 1 : 0;
      if (travado > 60) return { ok: false, motivo: 'preso na geometria', y: p.position.y };
    }
    return { ok: false, motivo: 'não alcançou o ponto', y: p.position.y };
  }, { lx, lz });
}

test.beforeEach(({ page }) => collectConsoleErrors(page));

test('o jogador acorda dentro do apartamento, no andar de cima', async ({ page }) => {
  await startGameRunning(page);
  const s = await page.evaluate(() => {
    const g = window.__game;
    const O = g.world.interior.origin;
    return {
      y: g.player.position.y,
      lx: g.player.position.x - O.x,
      lz: g.player.position.z - O.z,
      dentro: g.world.insideHome(g.player.position.x, g.player.position.z),
      camDist: g.player.camDistance,
    };
  });
  expect(s.dentro, 'a partida nova começa dentro do prédio').toBe(true);
  expect(s.y, 'no pavimento dos apartamentos, não na rua').toBeCloseTo(3.2, 1);
  // Dentro dos limites do quarto declarados na planta.
  expect(s.lx).toBeGreaterThan(0.35);
  expect(s.lx).toBeLessThan(3.1);
  expect(s.lz).toBeLessThan(3.5);
});

test('percurso completo: quarto → corredor → escada → saguão → rua', async ({ page }) => {
  const excecoes = [];
  page.on('pageerror', e => excecoes.push(e.message));
  await startGameRunning(page);

  for (const [nome, lx, lz] of ROTA) {
    const r = await caminharAte(page, lx, lz);
    expect(r.ok, `${nome}: ${r.motivo}`).toBe(true);
  }

  const fim = await page.evaluate(() => {
    const g = window.__game;
    return {
      y: g.player.position.y,
      dentro: g.world.insideHome(g.player.position.x, g.player.position.z),
      camDist: g.player.camDistance,
    };
  });
  expect(fim.y, 'termina no nível da rua').toBeLessThan(0.05);
  expect(fim.dentro, 'termina fora do prédio').toBe(false);
  expect(excecoes, 'nenhuma exceção não tratada durante o percurso').toEqual([]);
});

test('a câmera se aproxima dentro do prédio e volta a afastar na rua', async ({ page }) => {
  await startGameRunning(page);
  // Alguns quadros parado deixam a distância convergir pro valor de interior.
  const dentro = await page.evaluate(() => {
    const g = window.__game;
    const input = { isDown: () => false, wasPressed: () => false, consumeAttack: () => false };
    for (let i = 0; i < 120; i++) g.player.update(1 / 60, input, 'KeyQ');
    return g.player.camDistance;
  });
  expect(dentro, 'câmera de interior precisa ser bem mais curta').toBeLessThan(3);

  for (const [, lx, lz] of ROTA) await caminharAte(page, lx, lz);
  const fora = await page.evaluate(() => {
    const g = window.__game;
    const input = { isDown: () => false, wasPressed: () => false, consumeAttack: () => false };
    for (let i = 0; i < 240; i++) g.player.update(1 / 60, input, 'KeyQ');
    return g.player.camDistance;
  });
  expect(fora, 'na rua a câmera volta pra distância aberta').toBeGreaterThan(5.5);
});

test('portas: a do apartamento abre, as dos vizinhos ficam trancadas', async ({ page }) => {
  await startGameRunning(page);
  const r = await page.evaluate(async () => {
    const { abrirPorta } = await import('/src/building.js');
    const g = window.__game;
    const p201 = g.world.doors.get('ap201');
    const p202 = g.world.doors.get('ap202');
    return {
      abriu201: abrirPorta(p201), estado201: p201.aberta,
      abriu202: abrirPorta(p202), estado202: p202.aberta,
    };
  });
  expect(r.abriu201).toBe(true);
  expect(r.estado201).toBe(true);
  expect(r.abriu202, 'porta trancada não pode abrir').toBe(false);
  expect(r.estado202).toBe(false);
});

test('o celular entrega a primeira mensagem dos pais', async ({ page }) => {
  await startGameRunning(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    // Avança o relógio do celular sem esperar em tempo real.
    for (let i = 0; i < 200; i++) g.phone.update(0.25);
    return { naoLidas: g.phone.unreadCount };
  });
  expect(r.naoLidas, 'a mensagem dos pais precisa chegar sozinha').toBeGreaterThan(0);
});

// A altura passou a fazer parte do save junto com o prédio de dois pavimentos.
// Sem isso, salvar no apartamento e voltar deixava o jogador no térreo.
test('salvar no apartamento e recarregar mantém o jogador no andar de cima', async ({ page }) => {
  await startGameRunning(page);
  const antes = await page.evaluate(() => {
    const g = window.__game;
    g._saveGame();
    return { x: g.player.position.x, y: g.player.position.y, z: g.player.position.z };
  });
  expect(antes.y).toBeCloseTo(3.2, 1);

  await page.reload();
  await gotoBooted(page);
  await page.evaluate(() => document.getElementById('btn-continue').click());
  await page.waitForTimeout(1200);

  const depois = await page.evaluate(() => ({
    y: window.__game.player.position.y,
    rodando: window.__game.running,
  }));
  expect(depois.rodando).toBe(true);
  expect(depois.y, 'a altura precisa sobreviver ao save').toBeCloseTo(antes.y, 1);
});
