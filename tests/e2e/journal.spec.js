import { test, expect } from '@playwright/test';
import { startGameDirect, collectConsoleErrors } from './helpers.js';

test.beforeEach(({ page }) => collectConsoleErrors(page));

test('aba Pessoas mostra "ninguém ainda" antes de qualquer conversa', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.toggleJournal(g.quests, g.collectibles, g.gameState);
    g.ui.setJournalTab('people');
  });
  const text = await page.locator('#people-rows').textContent();
  expect(text).toContain('ninguém');
});

test('depois de conversar, o NPC aparece na aba Pessoas com nome, escala de proximidade e ficha', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => {
    const g = window.__game;
    const npc = g.npcs.find(n => n.def.id === 'almeida');
    g.dialogue.start('almeida', false, npc);
    g.dialogue.close();
    g.ui.toggleJournal(g.quests, g.collectibles, g.gameState);
    g.ui.setJournalTab('people');
  });

  const rowText = await page.locator('#people-rows').textContent();
  expect(rowText).toContain('Sr. Almeida');

  const detailText = await page.locator('#people-detail').textContent();
  expect(detailText).toContain('Conversas');
  expect(detailText).toMatch(/\d+\s*\/\s*\d+/); // "N / RELATIONSHIP_MAX"
});

// Nenhum nó de src/data/dialogues.json usa o efeito changeRelationship ainda
// (a UI e o GameState têm o suporte pronto desde a PR #27, mas o conteúdo
// narrativo que dispara isso ainda não foi escrito) — por isso este teste
// aciona o GameState direto, pra cobrir o caminho GameState → renderização
// da ficha sem depender de conteúdo que ainda não existe.
test('mudança de relacionamento com nota grava uma linha no histórico exibido na ficha', async ({ page }) => {
  await startGameDirect(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.dialogue.start('marina', false, g.npcs.find(n => n.def.id === 'marina'));
    g.dialogue.close(); // garante hasMet, pra aparecer na lista
    g.gameState.changeRelationship('marina', 2, 'Ajudou a procurar o livro', g.world);
    g.ui.toggleJournal(g.quests, g.collectibles, g.gameState);
    g.ui.setJournalTab('people');
    g.ui._peopleSelectedId = 'marina';
    g.ui._renderPeople();
  });
  const logText = await page.locator('#people-detail .people-log').textContent();
  expect(logText).toContain('Ajudou a procurar o livro');
});

test('setJournalTab troca a aba visível e journalCycleTab navega em ciclo', async ({ page }) => {
  await startGameDirect(page);
  const tabsSeen = await page.evaluate(() => {
    const g = window.__game;
    g.ui.toggleJournal(g.quests, g.collectibles, g.gameState);
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push(g.ui._journalTab);
      g.ui.journalCycleTab(1);
    }
    return seen;
  });
  // 3 abas em ciclo: a 4ª leitura deve repetir a 1ª.
  expect(tabsSeen[0]).toBe(tabsSeen[3]);
  expect(new Set(tabsSeen.slice(0, 3)).size).toBe(3);
});

test('aba Fragmentos mostra um slot vazio por fragmento ainda não fotografado', async ({ page }) => {
  await startGameDirect(page);
  const result = await page.evaluate(() => {
    const g = window.__game;
    g.ui.toggleJournal(g.quests, g.collectibles, g.gameState);
    g.ui.setJournalTab('fragments');
    return {
      fragmentCount: g.collectibles.fragments.length,
      emptySlots: document.querySelectorAll('#journal-gallery .photo-card.empty').length,
    };
  });
  expect(result.emptySlots).toBe(result.fragmentCount);
});
