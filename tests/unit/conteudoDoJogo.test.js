import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTS, NPC_DEFS } from '../../src/data.js';

// Missões e diálogos são conteúdo escrito no editor (dialogue-editor.html) e
// gravado em arquivos de dados. Estes testes são a rede de segurança dessa
// autoria: pegam o erro de digitação antes dele virar missão que nunca
// conclui ou conversa que aponta pro vazio.
const dialogos = JSON.parse(readFileSync(new URL('../../src/data/dialogues.json', import.meta.url), 'utf8'));

describe('missões (src/data/quests.json)', () => {
  test('a chave do mapa é o id da missão', () => {
    for (const [chave, q] of Object.entries(QUESTS)) assert.equal(q.id, chave);
  });

  test('toda missão tem título, objetivo e ids de objetivo únicos', () => {
    for (const q of Object.values(QUESTS)) {
      assert.ok(q.title?.length, `${q.id} sem título`);
      assert.ok(q.objectives.length > 0, `${q.id} não tem objetivo: nunca conclui`);
      const ids = q.objectives.map(o => o.id);
      assert.equal(new Set(ids).size, ids.length, `${q.id} tem objetivo com id repetido`);
      for (const o of q.objectives) {
        assert.ok(o.id?.length && o.text?.length, `${q.id} tem objetivo sem id ou sem texto`);
        if (o.target !== undefined) {
          assert.ok(Number.isInteger(o.target) && o.target > 0, `${q.id}/${o.id} tem alvo inválido`);
          assert.match(o.text, /\(\d+\/\d+\)/, `${q.id}/${o.id} conta, então o texto precisa do (0/N)`);
        }
      }
    }
  });
});

describe('diálogos apontam pra conteúdo que existe', () => {
  // Percorre a árvore inteira juntando toda referência a missão e a NPC.
  const refs = { quests: [], objetivos: [], npcs: [] };
  const anotar = valor => {
    if (Array.isArray(valor)) return valor.forEach(anotar);
    if (!valor || typeof valor !== 'object') return;
    if (valor.quest) refs.quests.push(valor.quest);
    if (valor.quest && valor.objective) refs.objetivos.push([valor.quest, valor.objective]);
    if (valor.npc) refs.npcs.push(valor.npc);
    Object.values(valor).forEach(anotar);
  };
  anotar(dialogos);

  test('toda missão citada num diálogo existe', () => {
    for (const id of new Set(refs.quests)) assert.ok(QUESTS[id], `diálogo aponta pra missão inexistente: ${id}`);
  });

  test('todo objetivo citado num diálogo existe na missão', () => {
    for (const [quest, objetivo] of refs.objetivos) {
      const existe = QUESTS[quest]?.objectives.some(o => o.id === objetivo);
      assert.ok(existe, `diálogo aponta pro objetivo ${quest}/${objetivo}, que não existe`);
    }
  });

  test('todo NPC citado num diálogo existe na cena', () => {
    const ids = new Set(NPC_DEFS.map(n => n.id));
    for (const id of new Set(refs.npcs)) assert.ok(ids.has(id), `diálogo aponta pro NPC inexistente: ${id}`);
  });

  test('toda árvore de diálogo é de um NPC que existe na cena', () => {
    const ids = new Set(NPC_DEFS.map(n => n.id));
    for (const id of Object.keys(dialogos)) assert.ok(ids.has(id), `conversa escrita pra um NPC que não está na cena: ${id}`);
  });

  test('toda opção de diálogo leva a um nó que existe', () => {
    for (const [npcId, arvore] of Object.entries(dialogos)) {
      for (const [nodeId, node] of Object.entries(arvore.nodes)) {
        for (const opcao of node.options ?? []) {
          if (opcao.next === null || opcao.next === undefined) continue;
          assert.ok(arvore.nodes[opcao.next], `${npcId}/${nodeId} leva pro nó inexistente "${opcao.next}"`);
        }
      }
      assert.ok(arvore.nodes[arvore.startDefault], `${npcId}: nó padrão "${arvore.startDefault}" não existe`);
      for (const regra of arvore.startRules ?? []) {
        assert.ok(arvore.nodes[regra.node], `${npcId}: regra de início aponta pro nó inexistente "${regra.node}"`);
      }
    }
  });
});
