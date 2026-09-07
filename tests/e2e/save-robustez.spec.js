import { test, expect } from '@playwright/test';
import { gotoBooted, startGameDirect, collectConsoleErrors } from './helpers.js';

// Reproduz, no jogo real, os achados A-01, A-02, A-07 e A-08 da auditoria do
// commit 45dc746. Cada teste aqui falhava antes da blindagem do save.
//
// A propriedade central verificada: um save que não pode ser carregado nunca
// vira partida nova nem deixa o jogador numa tela sem saída.

const CHAVE = 'ecos-da-cidade-save-v1';
const CHAVE_QUARENTENA = 'ecos-da-cidade-save-v1.corrompido';

// Grava um save bruto e recarrega a página, pra o jogo bootar já com ele.
async function comSaveGravado(page, valorBruto) {
  await gotoBooted(page);
  await page.evaluate(v => localStorage.setItem('ecos-da-cidade-save-v1', v), valorBruto);
  await page.reload();
  await gotoBooted(page);
}

// Conta quadros de fato renderizados: é o que distingue "jogo rodando" de
// "tela congelada com HUD" — o sintoma exato do A-01.
async function instrumentarRender(page) {
  await page.evaluate(() => {
    const g = window.__game;
    window.__frames = 0;
    const render = g.renderer.render.bind(g.renderer);
    g.renderer.render = (...args) => { window.__frames++; return render(...args); };
  });
}

async function estado(page) {
  return page.evaluate(() => ({
    frames: window.__frames,
    running: window.__game.running,
    menuVisivel: !document.getElementById('menu-screen').classList.contains('hidden'),
    hudVisivel: !document.getElementById('hud').classList.contains('hidden'),
    notaContinuar: document.getElementById('btn-continue-note')?.textContent,
    continuarDesabilitado: document.getElementById('btn-continue').disabled,
    saveBruto: localStorage.getItem('ecos-da-cidade-save-v1'),
  }));
}

// Só exceções JS não tratadas. É o que o A-01 produzia
// ("Cannot read properties of undefined (reading 'x')") e o que precisa
// continuar em zero. Mensagens de console ficam de fora de propósito: o
// carregador de GLTF emite falhas de textura neste ambiente sandboxed mesmo
// com os arquivos presentes no disco — ruído pré-existente, alheio ao save.
function coletarExcecoes(page) {
  const excecoes = [];
  page.on('pageerror', e => excecoes.push(e.message));
  return excecoes;
}

test.beforeEach(({ page }) => collectConsoleErrors(page));

test('Caso 1 — sem save: Continuar fica indisponível e Novo jogo funciona', async ({ page }) => {
  await gotoBooted(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await gotoBooted(page);

  const s = await estado(page);
  expect(s.continuarDesabilitado).toBe(true);
  expect(s.notaContinuar).toContain('Sem jogo salvo');

  // O fluxo de partida nova continua intacto.
  await page.click('#btn-newgame');
  await page.fill('#cc-name', 'Testador');
  await page.click('[data-sex="f"]');
  await page.click('[data-course="engenharia"]');
  await page.click('#cc-confirm');
  await page.waitForSelector('#hud:not(.hidden)');
  expect(await page.evaluate(() => window.__game.running)).toBe(true);
});

test('Caso 2 — A-02: JSON corrompido não vira partida nova silenciosamente', async ({ page }) => {
  const corrompido = '{ isso não é json válido';
  await comSaveGravado(page, corrompido);
  await instrumentarRender(page);

  // O jogador clica em Continuar — o caminho real pelo qual o bug aparecia.
  await page.evaluate(() => document.getElementById('btn-continue').click());
  await page.waitForTimeout(1200);

  const s = await estado(page);
  expect(s.running, 'não pode ter iniciado partida alguma').toBe(false);
  expect(s.menuVisivel, 'o menu tem que continuar acessível').toBe(true);
  expect(s.hudVisivel).toBe(false);
  expect(s.notaContinuar, 'o jogador precisa saber o que houve').toMatch(/não pôde ser lido/i);
  expect(s.saveBruto, 'o save original não pode ser tocado').toBe(corrompido);
});

test('Caso 3 — objeto vazio é inválido, não partida nova', async ({ page }) => {
  await comSaveGravado(page, '{}');
  await page.evaluate(() => document.getElementById('btn-continue').click());
  await page.waitForTimeout(800);

  const s = await estado(page);
  expect(s.running).toBe(false);
  expect(s.menuVisivel).toBe(true);
  expect(s.saveBruto).toBe('{}');
});

test('Caso 4 — A-01: save sem player não congela o jogo', async ({ page }) => {
  const excecoes = coletarExcecoes(page);
  const semPlayer = JSON.stringify({ version: 1, timeOfDay: 0.3, dayCount: 2, needs: { money: 10 } });
  await comSaveGravado(page, semPlayer);
  await instrumentarRender(page);

  await page.evaluate(() => document.getElementById('btn-continue').click());
  await page.waitForTimeout(1200);

  const s = await estado(page);
  // O sintoma exato do A-01 era: running=true, menu escondido, HUD visível e
  // ZERO quadros renderizados — jogo nem rodando nem acessível.
  expect(s.frames, 'nenhum loop pode ter começado com estado parcial').toBe(0);
  expect(s.running).toBe(false);
  expect(s.menuVisivel, 'o menu não pode sumir deixando o jogador preso').toBe(true);
  expect(s.hudVisivel).toBe(false);
  expect(s.notaContinuar).toMatch(/não pôde ser lido/i);
  // Antes da blindagem, aparecia aqui:
  // "Cannot read properties of undefined (reading 'x')"
  expect(excecoes, 'nenhuma exceção não tratada').toEqual([]);
});

// O teste acima cobre a defesa da UI (botão desabilitado). Este cobre a
// defesa de dentro do _startGame, chamando-o direto com um save inválido —
// o caminho exato do A-01, sem depender do estado do botão. Sem ele, remover
// a validação de _startGame passaria despercebido.
test('Caso 4b — A-01: _startGame recusa save inválido sem mexer em estado nenhum', async ({ page }) => {
  const excecoes = coletarExcecoes(page);
  await gotoBooted(page);

  const r = await page.evaluate(() => {
    const g = window.__game;
    const antes = { running: g.running, temPlayer: !!g.player };
    let lancou = null;
    let retorno;
    try {
      // Save sem `player`: exatamente o formato que congelava o jogo.
      retorno = g._startGame({ version: 1, dayCount: 2 }, { name: 'X', sex: 'f', courseId: 'medicina' });
    } catch (e) {
      lancou = e.message;
    }
    return {
      antes,
      lancou,
      retorno,
      running: g.running,
      menuVisivel: !document.getElementById('menu-screen').classList.contains('hidden'),
      hudVisivel: !document.getElementById('hud').classList.contains('hidden'),
    };
  });

  expect(r.lancou, 'não pode lançar').toBeNull();
  expect(r.retorno, '_startGame precisa sinalizar a recusa').toBe(false);
  expect(r.running, 'não pode ficar "rodando" sem loop').toBe(false);
  expect(r.menuVisivel, 'o menu não pode ter sido escondido').toBe(true);
  expect(r.hudVisivel, 'o HUD não pode aparecer numa partida que não começou').toBe(false);
  expect(excecoes).toEqual([]);
});

test('Caso 4c — _startGame aceita save válido e inicia a partida', async ({ page }) => {
  await gotoBooted(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const retorno = g._startGame(
      { version: 1, player: { x: 7, z: -3, camYaw: 0.5 }, dayCount: 2 },
      { name: 'X', sex: 'f', courseId: 'medicina' }
    );
    return { retorno, running: g.running, x: g.player.position.x, z: g.player.position.z };
  });
  expect(r.retorno).toBe(true);
  expect(r.running).toBe(true);
  expect(r.x).toBe(7);
  expect(r.z).toBe(-3);
});

test('Caso 5 — A-08: tipos inválidos nunca chegam ao Vector3', async ({ page }) => {
  await comSaveGravado(page, JSON.stringify({ version: 1, player: { x: 'abc', y: 0, z: 'xyz' } }));
  await page.evaluate(() => document.getElementById('btn-continue').click());
  await page.waitForTimeout(800);

  const s = await estado(page);
  expect(s.running).toBe(false);
  expect(s.menuVisivel).toBe(true);

  // A garantia explícita pedida: em nenhuma hipótese position.x === 'abc'.
  const posicao = await page.evaluate(() => {
    const p = window.__game.player;
    return p ? { x: p.position.x, z: p.position.z } : null;
  });
  if (posicao) {
    expect(typeof posicao.x).toBe('number');
    expect(Number.isFinite(posicao.x)).toBe(true);
    expect(Number.isFinite(posicao.z)).toBe(true);
  }
});

test('Caso 6 — A-07: versão futura é recusada, e o save é preservado', async ({ page }) => {
  const futuro = JSON.stringify({ version: 99, player: { x: 5, z: 5, camYaw: 0 }, dayCount: 7 });
  await comSaveGravado(page, futuro);
  await page.evaluate(() => document.getElementById('btn-continue').click());
  await page.waitForTimeout(800);

  const s = await estado(page);
  expect(s.running, 'formato desconhecido não pode ser carregado às cegas').toBe(false);
  expect(s.menuVisivel).toBe(true);
  expect(s.saveBruto).toBe(futuro);
});

test('Caso 7 — save válido continua carregando exatamente como antes', async ({ page }) => {
  // Cria uma partida de verdade e salva por dentro do jogo.
  await startGameDirect(page, { name: 'Salvo', sex: 'x', courseId: 'engenharia' });
  await page.evaluate(() => {
    const g = window.__game;
    g.player.position.set(12, 0, -34);
    g.world.dayCount = 4;
    g.needs.money = 77;
    g.inventory.addItem('coffee', 2);
    g.gameState.setFlag('marco_de_teste', true);
    g._saveGame();
  });

  await page.reload();
  await gotoBooted(page);

  const s = await estado(page);
  expect(s.continuarDesabilitado, 'save bom precisa habilitar Continuar').toBe(false);
  expect(s.notaContinuar).toContain('Retomar o dia');

  await page.evaluate(() => document.getElementById('btn-continue').click());
  await page.waitForTimeout(1000);

  const restaurado = await page.evaluate(() => {
    const g = window.__game;
    return {
      running: g.running,
      x: Math.round(g.player.position.x),
      z: Math.round(g.player.position.z),
      dia: g.world.dayCount,
      dinheiro: g.needs.money,
      cafe: g.inventory.counts.coffee,
      flag: g.gameState.getFlag('marco_de_teste'),
    };
  });
  expect(restaurado.running).toBe(true);
  expect(restaurado.x).toBe(12);
  expect(restaurado.z).toBe(-34);
  expect(restaurado.dia).toBe(4);
  expect(restaurado.dinheiro).toBe(77);
  expect(restaurado.cafe).toBe(2);
  expect(restaurado.flag).toBe(true);
});

test('save inválido é posto em quarentena ao começar uma partida nova', async ({ page }) => {
  const corrompido = '{ corrompido mas precioso';
  await comSaveGravado(page, corrompido);

  await page.click('#btn-newgame');
  await page.fill('#cc-name', 'Recomeço');
  await page.click('[data-sex="m"]');
  await page.click('[data-course="medicina"]');
  await page.click('#cc-confirm');
  await page.waitForSelector('#hud:not(.hidden)');

  const guardado = await page.evaluate(k => localStorage.getItem(k), CHAVE_QUARENTENA);
  expect(guardado, 'o save que o jogador não pôde recuperar tem que sobreviver').toBe(corrompido);
});

test('autosave de partida não iniciada não sobrescreve o save existente', async ({ page }) => {
  const corrompido = '{ corrompido';
  await comSaveGravado(page, corrompido);

  // Tenta forçar uma gravação sem partida iniciada — o caminho pelo qual um
  // estado meio-inicializado poderia destruir o save original.
  const gravou = await page.evaluate(() => window.__game._saveGame());
  expect(gravou).toBe(false);
  expect(await page.evaluate(k => localStorage.getItem(k), CHAVE)).toBe(corrompido);
});
