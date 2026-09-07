// Helpers compartilhados pelos specs E2E. O jogo expõe `window.__game` (ver
// main.js) especificamente pra permitir esse tipo de inspeção/controle
// direto em teste, sem precisar simular cada interação pelo DOM.

// O boot gera a cidade proceduralmente e roda em WebGL via software
// rendering nesse tipo de ambiente — bem mais lento que uma máquina normal,
// por isso os timeouts generosos abaixo (ver também playwright.config.js).
const BOOT_TIMEOUT = 45000;

export async function gotoBooted(page) {
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__game && window.__game.dialogueTrees, { timeout: BOOT_TIMEOUT });
}

// Cria um personagem novo passando pelo fluxo real de UI (clique nos
// botões), pra cobrir a tela de criação em si — não só o estado resultante.
// Navega sozinho: assim um spec pode chamar só isso, sem precisar lembrar
// de dar o goto antes (esquecer disso trava esperando um seletor numa
// página em branco).
export async function createNewGameViaMenu(page, { name = 'Testador', sex = 'm', courseId = 'engenharia' } = {}) {
  await gotoBooted(page);
  await page.waitForSelector('#menu-screen:not(.hidden)', { timeout: BOOT_TIMEOUT });
  await page.click('#btn-newgame');
  await page.waitForSelector('#creation-screen:not(.hidden)');
  await page.fill('#cc-name', name);
  await page.click(`[data-sex="${sex}"]`);
  await page.click(`[data-course="${courseId}"]`);
  await page.waitForFunction(() => !document.querySelector('#cc-confirm').disabled);
  await page.click('#cc-confirm');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: BOOT_TIMEOUT });
}

// Atalho pra specs que só precisam de uma partida em andamento e não estão
// testando a tela de criação em si — pula direto pro estado "jogo rodando".
export async function startGameDirect(page, profile = { name: 'Testador', sex: 'x', courseId: 'engenharia' }) {
  await gotoBooted(page);
  await page.evaluate((p) => window.__game._startGame(null, p), profile);
  await page.waitForTimeout(200);
}

export function collectConsoleErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Ruído do proxy/rede do ambiente de execução (telemetria do Chrome,
    // recursos externos bloqueados) — não é erro do jogo.
    if (/ERR_CONNECTION_RESET|net::ERR_|404 \(Not Found\)|Failed to load resource/.test(text)) return;
    errors.push('console error: ' + text);
  });
  return errors;
}
