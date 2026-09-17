import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers.js';

// A aba Rotina é a única parte do editor que mexe no que a partida é: horário
// do turno, curso da criação de personagem, onde o jogador dorme. Este spec
// cobre o caminho inteiro — escrever no editor, o jogo abrir com aquilo — e
// as recusas que impedem o autor de deixar a rotina num estado que não joga.

const RASCUNHO = 'routine-editor-draft';

async function abrirAbaRotina(page) {
  await page.goto('/dialogue-editor.html');
  await page.waitForFunction(() => document.querySelectorAll('#rotina-lista-obligation .quest-item').length > 0, { timeout: 60000 });
  await page.evaluate(k => localStorage.removeItem(k), RASCUNHO);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#rotina-lista-obligation .quest-item').length > 0, { timeout: 60000 });
  await page.click('#abas .aba[data-aba="rotina"]');
}

const rascunho = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), RASCUNHO);

test.describe('Editor › aba Rotina', () => {
  test.beforeEach(async ({ page }) => {
    collectConsoleErrors(page);
    await abrirAbaRotina(page);
  });

  test('a rotina publicada abre sem nenhum erro nem aviso na conferência', async ({ page }) => {
    await expect(page.locator('#rotina-problemas .tudo-certo')).toBeVisible();
    await expect(page.locator('#rotina-lista-course .quest-item')).toHaveCount(3);
    await expect(page.locator('#rotina-lista-home .quest-item')).toHaveCount(2);
  });

  test('o lugar do compromisso se escolhe entre os prédios do mapa, não se digita', async ({ page }) => {
    await page.click('#rotina-lista-obligation .quest-item:first-child');
    const predios = await page.$$eval('#rotina-editor-body [data-local="marco"] option', os => os.map(o => o.value).filter(Boolean));
    expect(predios).toContain('job_mercado');
    expect(predios).toContain('school');
    // Nenhum campo de coordenada solta no formulário.
    await expect(page.locator('#rotina-editor-body [data-prop="x"]')).toHaveCount(0);
  });

  test('horário invertido acende erro na conferência e marca o campo; corrigir apaga', async ({ page }) => {
    await page.click('#rotina-lista-obligation .quest-item:first-child');
    await page.fill('#rotina-editor-body [data-hora="endHour"]', '05:00');
    await expect(page.locator('#rotina-problemas .problema.erro')).toHaveCount(1);
    await expect(page.locator('#rotina-problemas .problema.erro')).toContainText('ninguém consegue cumprir');
    await expect(page.locator('#rotina-editor-body .campo-com-erro').first()).toBeVisible();

    await page.fill('#rotina-editor-body [data-hora="endHour"]', '14:00');
    await expect(page.locator('#rotina-problemas .problema.erro')).toHaveCount(0);
  });

  test('curso novo nasce com compromisso próprio, já apontado', async ({ page }) => {
    page.once('dialog', d => d.accept('artes'));
    await page.click('#rotina-panel [data-novo="course"]');
    const dados = await rascunho(page);
    expect(Object.keys(dados.courses)).toContain('artes');
    expect(dados.obligations[dados.courses.artes.obligation]).toBeTruthy();
    await expect(page.locator('#rotina-problemas .problema.erro')).toHaveCount(0);
  });

  test('excluir um compromisso que um curso usa é recusado com o nome de quem usa', async ({ page }) => {
    const avisos = [];
    page.on('dialog', d => { avisos.push(d.message()); d.dismiss(); });
    await page.click('#rotina-lista-obligation .quest-item[data-id="course_medicina"]');
    await page.click('#rotina-editor-body [data-acao="excluir"]');
    await expect.poll(() => avisos.length).toBeGreaterThan(0);
    expect(avisos.at(-1)).toContain('Medicina');
    // A recusa não mexe em nada: o compromisso segue na lista e o rascunho
    // nem chega a existir — ele só é gravado quando algo muda de verdade.
    // (Gravar rascunho só por abrir a aba faria o jogo passar a usar rascunho
    // sem o autor ter editado nada.)
    await expect(page.locator('#rotina-lista-obligation .quest-item[data-id="course_medicina"]')).toHaveCount(1);
    expect(await rascunho(page)).toBeNull();
  });

  test('clicar num problema leva até o item que tem o problema', async ({ page }) => {
    await page.click('#rotina-lista-obligation .quest-item[data-id="job_mercado"]');
    await page.fill('#rotina-editor-body [data-hora="endHour"]', '05:00');
    await page.click('#rotina-lista-obligation .quest-item[data-id="school"]');
    await expect(page.locator('#editing-rotina-id')).toContainText('school');

    await page.click('#rotina-problemas .problema.erro');
    await expect(page.locator('#editing-rotina-id')).toContainText('job_mercado');
  });
});

test.describe('Rotina do editor chega no jogo', () => {
  test('curso escrito no editor aparece na criação de personagem e vira a partida', async ({ page }) => {
    collectConsoleErrors(page);
    await abrirAbaRotina(page);

    page.once('dialog', d => d.accept('artes'));
    await page.click('#rotina-panel [data-novo="course"]');
    await page.fill('#rotina-editor-body [data-prop="label"]', 'Artes Visuais');
    const idOb = (await rascunho(page)).courses.artes.obligation;

    await page.click(`#rotina-lista-obligation .quest-item[data-id="${idOb}"]`);
    await page.fill('#rotina-editor-body [data-prop="label"]', 'Ateliê de Artes');
    await page.selectOption('#rotina-editor-body [data-local="marco"]', 'job_mercado');
    await page.fill('#rotina-editor-body [data-hora="startHour"]', '13:00');
    await page.fill('#rotina-editor-body [data-hora="endHour"]', '18:30');
    await expect(page.locator('#rotina-problemas .problema.erro')).toHaveCount(0);

    await page.goto('/index.html');
    await page.waitForFunction(() => window.__game && window.__game.dialogueTrees, { timeout: 45000 });
    await page.waitForSelector('#menu-screen:not(.hidden)');
    await page.click('#btn-newgame');
    await page.waitForSelector('#creation-screen:not(.hidden)');
    await page.fill('#cc-name', 'Artista');
    await page.click('[data-sex="f"]');
    await page.click('[data-course="artes"]');

    const resumo = (await page.locator('#cc-course-summary').textContent()).replace(/\s+/g, ' ');
    expect(resumo).toContain('Ateliê de Artes');
    // Meia hora escrita no editor precisa aparecer como 18:30, não "18.5:00".
    expect(resumo).toContain('13:00 – 18:30');

    await page.click('#cc-confirm');
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 45000 });
    const estado = await page.evaluate(() => {
      const d = window.__game.obligation.def;
      return { id: d.id, label: d.label, inicio: d.startHour, fim: d.endHour, ponto: d.location };
    });
    expect(estado.label).toBe('Ateliê de Artes');
    expect(estado.inicio).toBe(13);
    expect(estado.fim).toBe(18.5);
    expect(Number.isFinite(estado.ponto.x)).toBe(true);
  });

  test('o compromisso avisa quando abre e quando está pra fechar', async ({ page }) => {
    collectConsoleErrors(page);
    await page.goto('/index.html');
    await page.waitForFunction(() => window.__game && window.__game.dialogueTrees, { timeout: 45000 });
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => window.__game._startGame(null, { name: 'T', sex: 'x', courseId: 'engenharia' }));
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 45000 });

    const avisos = await page.evaluate(() => {
      const g = window.__game;
      const longe = { x: 9999, z: 9999 };
      return {
        antes: g.obligation.update(7.5, longe),
        abertura: g.obligation.update(8, longe),
        repetido: g.obligation.update(8.5, longe),
        fechando: g.obligation.update(13.5, longe),
      };
    });
    expect(avisos.antes).toBeNull();
    expect(avisos.abertura).toContain('Aula de Engenharia');
    expect(avisos.repetido).toBeNull();
    expect(avisos.fechando).toContain('30 min');
  });
});
