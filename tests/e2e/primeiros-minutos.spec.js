import { test, expect } from '@playwright/test';
import { gotoBooted, startGameRunning, collectConsoleErrors } from './helpers.js';

// Os primeiros minutos jogáveis: o jogador acorda no apartamento 101, sai pelo
// corredor, desce a escada, atravessa o saguão e chega na rua.
//
// O prédio é feito de peças do Building Kit colocadas na cena
// (tools/gerar-predio-inicial.mjs), então a rota é em coordenadas do mundo.
// O percurso é andado com o `player.update()` real (mesma física, mesma
// colisão) em vez de eventos de teclado: assim o teste é determinístico e não
// depende do tempo de resposta do navegador, mas continua exercitando o
// caminho de verdade.

const ANDAR_DOS_APES = 2.5;   // topo da placa de piso do 1º andar

// Cada vão é atravessado em linha reta: o ponto seguinte à porta fica do
// outro lado dela, senão o jogador vira cedo e encosta na parede.
const ROTA = [
  ['porta do quarto', -5, -54.8],
  ['saída do quarto', -5, -53.4],
  ['sala do 101', -3.6, -52.2],
  ['porta do 101', -3, -50.8],
  ['saída do 101', -3, -49],
  ['corredor', -9, -48.6],
  ['vão do patamar', -9, -51],
  ['patamar', -8, -51.6],
  ['escada', -8, -54],
  ['base da escada', -8, -56.4],
  ['volta pro vão', -9, -51.4],
  ['saguão', -9, -48.6],
  ['frente da porta', -5, -47.2],
  ['porta do prédio', -5, -45.2],
  ['calçada do terreno', -5, -40],
  ['portão da rua', -5, -34.8],
  ['rua', -5, -31],
];

// Abre todas as portas do prédio: a rota testa a geometria, não a interação
// com cada folha (isso tem teste próprio abaixo).
async function abrirTodasAsPortas(page) {
  await page.evaluate(() => {
    for (const p of window.__game.world.portasKit) if (!p.aberta) p.alternar();
    // As folhas animam; a colisão já sai do caminho na hora.
    window.__game.world.updateBuilding(2);
  });
}

// Anda por uma sequência de pontos usando o update real do jogador, numa
// ÚNICA ida ao navegador. Cada page.evaluate espera o quadro em curso
// terminar, e com renderização por software um quadro desta cena leva
// segundos: uma ida por ponto somava mais de um minuto só de espera. Para no
// primeiro ponto que falhar.
async function caminharPor(page, pontos) {
  return page.evaluate((pontos) => {
    const g = window.__game;
    const p = g.player;
    const input = { isDown: c => c === 'KeyW', wasPressed: () => false, consumeAttack: () => false };
    const resultados = [];
    for (const [nome, ax, az] of pontos) {
      let r = null;
      let travado = 0;
      for (let i = 0; i < 2000 && !r; i++) {
        const dx = ax - p.position.x, dz = az - p.position.z;
        if (Math.hypot(dx, dz) < 0.25) { r = { ok: true, y: p.position.y }; break; }
        const antes = { x: p.position.x, z: p.position.z };
        // A câmera fica ATRÁS do personagem, então ele anda em -forward.
        p.camYaw = Math.atan2(-dx, -dz);
        p.update(1 / 60, input, 'KeyQ');
        if (p.position.y < -1) r = { ok: false, motivo: 'caiu do mundo', y: p.position.y };
        travado = Math.hypot(p.position.x - antes.x, p.position.z - antes.z) < 0.005 ? travado + 1 : 0;
        if (!r && travado > 60) r = { ok: false, motivo: 'preso na geometria', y: p.position.y };
      }
      r = r || { ok: false, motivo: 'não alcançou o ponto', y: p.position.y };
      resultados.push({ nome, ...r });
      if (!r.ok) break;
    }
    return resultados;
  }, pontos);
}

// O prédio chega por .glb: espera as peças estarem na física antes de andar.
async function esperarOPredio(page) {
  await page.waitForFunction(
    () => window.__game?.world?.superficiesKit.length > 50 && window.__game.world.portasKit.length >= 5,
    null, { timeout: 60000 },
  );
}

test.beforeEach(({ page }) => collectConsoleErrors(page));

test('o jogador acorda dentro do apartamento, no andar de cima', async ({ page }) => {
  await startGameRunning(page);
  await esperarOPredio(page);
  // Alguns quadros parado: o jogador assenta no piso do apartamento.
  const s = await page.evaluate(() => {
    const g = window.__game;
    const input = { isDown: () => false, wasPressed: () => false, consumeAttack: () => false };
    for (let i = 0; i < 60; i++) g.player.update(1 / 60, input, 'KeyQ');
    return {
      x: g.player.position.x, y: g.player.position.y, z: g.player.position.z,
      dentro: g.world.dentroDeConstrucao(g.player.position),
    };
  });
  expect(s.y, 'no pavimento dos apartamentos, não na rua').toBeCloseTo(ANDAR_DOS_APES, 1);
  expect(s.dentro, 'a partida nova começa dentro do prédio').toBe(true);
  // Dentro do quarto do 101 (x -6..-2, z -58..-54).
  expect(s.x).toBeGreaterThan(-6);
  expect(s.x).toBeLessThan(-2);
  expect(s.z).toBeLessThan(-54);
  expect(s.z).toBeGreaterThan(-58);
});

test('percurso completo: quarto → corredor → escada → saguão → rua', async ({ page }) => {
  const excecoes = [];
  page.on('pageerror', e => excecoes.push(e.message));
  await startGameRunning(page);
  await esperarOPredio(page);
  await abrirTodasAsPortas(page);

  const passos = await caminharPor(page, ROTA);
  for (const r of passos) expect(r.ok, `${r.nome}: ${r.motivo}`).toBe(true);
  expect(passos.length, 'todos os pontos da rota foram alcançados').toBe(ROTA.length);

  const fim = await page.evaluate(() => {
    const g = window.__game;
    return {
      y: g.player.position.y,
      dentro: g.world.dentroDeConstrucao(g.player.position),
    };
  });
  expect(fim.y, 'termina no nível da rua').toBeLessThan(0.2);
  expect(fim.dentro, 'termina fora do prédio').toBe(false);
  expect(excecoes, 'nenhuma exceção não tratada durante o percurso').toEqual([]);
});

test('a câmera se aproxima dentro do prédio e volta a afastar na rua', async ({ page }) => {
  await startGameRunning(page);
  await esperarOPredio(page);
  // Alguns quadros parado deixam a distância convergir pro valor de interior.
  const dentro = await page.evaluate(() => {
    const g = window.__game;
    const input = { isDown: () => false, wasPressed: () => false, consumeAttack: () => false };
    for (let i = 0; i < 120; i++) g.player.update(1 / 60, input, 'KeyQ');
    return g.player.camDistance;
  });
  expect(dentro, 'câmera de interior precisa ser bem mais curta').toBeLessThan(3);

  await abrirTodasAsPortas(page);
  await caminharPor(page, ROTA);
  const fora = await page.evaluate(() => {
    const g = window.__game;
    const input = { isDown: () => false, wasPressed: () => false, consumeAttack: () => false };
    for (let i = 0; i < 240; i++) g.player.update(1 / 60, input, 'KeyQ');
    return g.player.camDistance;
  });
  expect(fora, 'na rua a câmera volta pra distância aberta').toBeGreaterThan(5.5);
});

test('as portas do prédio têm nome e abrem e fecham', async ({ page }) => {
  await startGameRunning(page);
  await esperarOPredio(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const nomes = g.world.portasKit.map(p => p.def.id);
    const ap101 = g.world.portasKit.find(p => p.def.id === 'ap101');
    const abriu = ap101.alternar();
    const aberta = ap101.aberta;
    ap101.alternar();
    return { nomes, rotulo: ap101.def.label, abriu, aberta, fechou: !ap101.aberta };
  });
  // O roteiro do jogo procura estas duas: a do apartamento e a do prédio.
  expect(r.nomes).toContain('ap101');
  expect(r.nomes).toContain('entrada');
  expect(r.rotulo).toBe('Apartamento 101');
  expect(r.abriu).toBe(true);
  expect(r.aberta).toBe(true);
  expect(r.fechou).toBe(true);
});

test('os móveis do apartamento respondem com uma observação', async ({ page }) => {
  await startGameRunning(page);
  await esperarOPredio(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const cama = g.world.homeAnchors.find(a => a.label === 'Sua cama');
    const perto = g.world.nearestAnchor({ x: cama.x, y: cama.nivelY, z: cama.z });
    return { total: g.world.homeAnchors.length, achou: perto?.label, texto: perto?.texto ?? null };
  });
  expect(r.total, 'o prédio tem móveis com interação').toBeGreaterThan(8);
  expect(r.achou).toBe('Sua cama');
  // O texto vem escrito na peça, não de uma lista no código.
  expect(r.texto).toMatch(/cama/i);
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

// A altura faz parte do save junto com o prédio de dois pavimentos. Sem isso,
// salvar no apartamento e voltar deixava o jogador no térreo.
test('salvar no apartamento e recarregar mantém o jogador no andar de cima', async ({ page }) => {
  await startGameRunning(page);
  await esperarOPredio(page);
  const antes = await page.evaluate(() => {
    const g = window.__game;
    const input = { isDown: () => false, wasPressed: () => false, consumeAttack: () => false };
    for (let i = 0; i < 60; i++) g.player.update(1 / 60, input, 'KeyQ');
    g._saveGame();
    return { y: g.player.position.y };
  });
  expect(antes.y).toBeCloseTo(ANDAR_DOS_APES, 1);

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
