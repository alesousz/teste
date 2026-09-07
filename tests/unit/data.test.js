import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, CITY, blockCenter, landmarkCenter, LANDMARK_SPECS,
  HOMES, OBLIGATIONS, ORIGINS, COURSES, NPC_DEFS, NPC_PROFILES,
  ITEM_DEFS, QUESTS, KEYBIND_ACTIONS, DEFAULT_KEYBINDS,
  LOADING_SHOTS, LOADING_TIPS, RELATIONSHIP_MAX,
} from '../../src/data.js';

describe('grade da cidade', () => {
  test('CONFIG.CELL e WORLD_HALF derivam de BLOCK_SIZE/ROAD_WIDTH/GRID_SIZE', () => {
    assert.equal(CONFIG.CELL, CONFIG.BLOCK_SIZE + CONFIG.ROAD_WIDTH);
    assert.equal(CONFIG.WORLD_HALF, (CONFIG.GRID_SIZE * CONFIG.CELL) / 2);
  });

  test('blockCenter(ix,iz) é simétrico em torno da origem pro quarteirão central', () => {
    const half = (CONFIG.GRID_SIZE - 1) / 2;
    const center = blockCenter(half, half);
    assert.equal(center.x, 0);
    assert.equal(center.z, 0);
  });

  test('todos os landmarks conhecidos existem em CITY.buildings', () => {
    for (const kind of Object.keys(LANDMARK_SPECS)) {
      const c = landmarkCenter(kind);
      assert.notDeepEqual(c, { x: 0, z: 0 }, `landmark ${kind} não deveria cair no fallback (0,0)`);
    }
  });

  test('landmarkCenter de um kind inexistente cai no fallback (0,0) sem lançar', () => {
    assert.deepEqual(landmarkCenter('nao_existe'), { x: 0, z: 0 });
  });

  test('todo prédio gerado fica dentro dos limites do próprio quarteirão (nenhum vaza pra rua)', () => {
    const halfBlock = CONFIG.BLOCK_SIZE / 2;
    for (const b of CITY.buildings) {
      if (b.kind || b.custom) continue; // landmarks/prédios customizados têm suas próprias dimensões
      const dx = Math.max(Math.abs(b.minX - b.cx), Math.abs(b.maxX - b.cx));
      const dz = Math.max(Math.abs(b.minZ - b.cz), Math.abs(b.maxZ - b.cz));
      assert.ok(dx <= halfBlock + 1e-9, `prédio em (${b.cx},${b.cz}) vaza no eixo X: ${dx} > ${halfBlock}`);
      assert.ok(dz <= halfBlock + 1e-9, `prédio em (${b.cx},${b.cz}) vaza no eixo Z: ${dz} > ${halfBlock}`);
    }
  });

  test('CITY tem exatamente GRID_SIZE² quarteirões', () => {
    assert.equal(CITY.blocks.length, CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
  });
});

describe('cursos, origens e obrigações', () => {
  test('todo curso aponta pra uma OBLIGATIONS existente', () => {
    for (const course of Object.values(COURSES)) {
      assert.ok(OBLIGATIONS[course.obligation], `curso ${course.id} referencia obrigação inexistente: ${course.obligation}`);
    }
  });

  test('toda origem aponta pra HOMES e OBLIGATIONS existentes', () => {
    for (const origin of Object.values(ORIGINS)) {
      assert.ok(HOMES[origin.home], `origem ${origin.id} referencia home inexistente: ${origin.home}`);
      assert.ok(OBLIGATIONS[origin.obligation], `origem ${origin.id} referencia obrigação inexistente: ${origin.obligation}`);
    }
  });

  test('toda OBLIGATIONS com npc aponta pra um NPC_DEFS existente', () => {
    const ids = new Set(NPC_DEFS.map(n => n.id));
    for (const ob of Object.values(OBLIGATIONS)) {
      if (ob.npc) assert.ok(ids.has(ob.npc), `obrigação ${ob.id} referencia NPC inexistente: ${ob.npc}`);
    }
  });

  test('startHour < endHour em toda obrigação', () => {
    for (const ob of Object.values(OBLIGATIONS)) {
      assert.ok(ob.startHour < ob.endHour, `obrigação ${ob.id} tem janela inválida`);
    }
  });
});

describe('NPC_PROFILES (Diário › Pessoas)', () => {
  test('todo id em NPC_PROFILES existe em NPC_DEFS', () => {
    const defIds = new Set(NPC_DEFS.map(n => n.id));
    for (const id of Object.keys(NPC_PROFILES)) {
      assert.ok(defIds.has(id), `NPC_PROFILES tem um id sem NPC_DEFS correspondente: ${id}`);
    }
  });

  test('RELATIONSHIP_MAX é um número positivo', () => {
    assert.ok(typeof RELATIONSHIP_MAX === 'number' && RELATIONSHIP_MAX > 0);
  });
});

describe('itens e missões', () => {
  test('todo ITEM_DEFS tem effect.type reconhecido pelo InventorySystem', () => {
    const known = new Set(['restoreEnergy', 'restoreHunger']);
    for (const item of Object.values(ITEM_DEFS)) {
      assert.ok(known.has(item.effect.type), `item ${item.id} tem effect.type desconhecido: ${item.effect.type}`);
    }
  });

  test('toda QUESTS tem ao menos um objetivo', () => {
    for (const q of Object.values(QUESTS)) {
      assert.ok(q.objectives.length > 0, `missão ${q.id} não tem objetivos`);
    }
  });
});

describe('keybinds e loading screen', () => {
  test('DEFAULT_KEYBINDS cobre exatamente as ações remapeáveis de KEYBIND_ACTIONS', () => {
    const actionIds = KEYBIND_ACTIONS.map(a => a.id).sort();
    const boundIds = Object.keys(DEFAULT_KEYBINDS).sort();
    assert.deepEqual(boundIds, actionIds);
  });

  test('LOADING_SHOTS e LOADING_TIPS não estão vazios', () => {
    assert.ok(LOADING_SHOTS.length > 0);
    assert.ok(LOADING_TIPS.length > 0);
  });
});
