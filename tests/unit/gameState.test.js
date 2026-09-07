import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../../src/gameState.js';

describe('GameState — flags', () => {
  test('setFlag/getFlag/hasFlag/removeFlag', () => {
    const gs = new GameState();
    assert.equal(gs.hasFlag('x'), false);
    assert.equal(gs.getFlag('x'), undefined);

    gs.setFlag('x');
    assert.equal(gs.getFlag('x'), true, 'setFlag sem valor deve default pra true');
    assert.equal(gs.hasFlag('x'), true);

    gs.setFlag('y', 'algum_valor');
    assert.equal(gs.getFlag('y'), 'algum_valor');

    gs.removeFlag('x');
    assert.equal(gs.hasFlag('x'), false);
    assert.equal(gs.getFlag('x'), undefined);
  });

  test('hasFlag distingue "nunca setada" de "setada com valor falsy"', () => {
    const gs = new GameState();
    gs.setFlag('desligada', false);
    assert.equal(gs.hasFlag('desligada'), true);
    assert.equal(gs.getFlag('desligada'), false);
  });
});

describe('GameState — relacionamentos', () => {
  test('getRelationship começa em 0 pra NPC nunca visto', () => {
    const gs = new GameState();
    assert.equal(gs.getRelationship('marina'), 0);
    assert.equal(gs.hasMet('marina'), false);
  });

  test('changeRelationship soma e retorna o delta aplicado', () => {
    const gs = new GameState();
    const delta = gs.changeRelationship('marina', 5);
    assert.equal(delta, 5);
    assert.equal(gs.getRelationship('marina'), 5);
    gs.changeRelationship('marina', -2);
    assert.equal(gs.getRelationship('marina'), 3);
  });

  test('setRelationship define um valor absoluto', () => {
    const gs = new GameState();
    gs.changeRelationship('marina', 5);
    gs.setRelationship('marina', 42);
    assert.equal(gs.getRelationship('marina'), 42);
  });

  test('changeRelationship com nota e world grava no histórico', () => {
    const gs = new GameState();
    const world = { dayCount: 3 };
    gs.changeRelationship('marina', 1, 'Ajudou a achar o livro', world);
    const log = gs.getRelationshipLog('marina');
    assert.equal(log.length, 1);
    assert.deepEqual(log[0], { day: 3, text: 'Ajudou a achar o livro' });
  });

  test('changeRelationship sem nota não grava histórico', () => {
    const gs = new GameState();
    gs.changeRelationship('marina', 1);
    assert.equal(gs.getRelationshipLog('marina').length, 0);
  });

  test('recordTalk marca hasMet, incrementa talks e guarda dia/hora', () => {
    const gs = new GameState();
    const world = { dayCount: 1, getFormattedTime: () => '08:30' };
    assert.equal(gs.hasMet('almeida'), false);

    gs.recordTalk('almeida', world);
    assert.equal(gs.hasMet('almeida'), true);
    assert.equal(gs.getTalkCount('almeida'), 1);
    assert.equal(gs.getLastSeen('almeida'), 'dia 1, 08:30');

    world.dayCount = 2;
    world.getFormattedTime = () => '09:00';
    gs.recordTalk('almeida', world);
    assert.equal(gs.getTalkCount('almeida'), 2);
    assert.equal(gs.getLastSeen('almeida'), 'dia 2, 09:00');
  });

  test('getLastSeen retorna null antes de qualquer conversa', () => {
    const gs = new GameState();
    assert.equal(gs.getLastSeen('almeida'), null);
  });

  test('recordTalk não muda relacionamento, só presença/contagem', () => {
    const gs = new GameState();
    const world = { dayCount: 1, getFormattedTime: () => '08:30' };
    gs.recordTalk('almeida', world);
    assert.equal(gs.getRelationship('almeida'), 0);
  });
});

describe('GameState — serialize/deserialize', () => {
  test('round-trip preserva flags, npcs, storyProgress, worldState e discoveredLocations', () => {
    const gs = new GameState();
    gs.setFlag('conheceu_marina', true);
    gs.changeRelationship('marina', 7, 'Devolveu o livro', { dayCount: 2 });
    gs.discoveredLocations.add('parque_norte');
    gs.worldState.chuva = true;
    gs.storyProgress.capitulo = 2;

    const data = gs.serialize();
    // discoveredLocations precisa virar array simples pra JSON.stringify não
    // perder o conteúdo (Set não serializa em JSON puro).
    assert.ok(Array.isArray(data.discoveredLocations));

    const restored = new GameState();
    restored.deserialize(JSON.parse(JSON.stringify(data)));

    assert.equal(restored.getFlag('conheceu_marina'), true);
    assert.equal(restored.getRelationship('marina'), 7);
    assert.deepEqual(restored.getRelationshipLog('marina'), [{ day: 2, text: 'Devolveu o livro' }]);
    assert.ok(restored.discoveredLocations.has('parque_norte'));
    assert.equal(restored.worldState.chuva, true);
    assert.equal(restored.storyProgress.capitulo, 2);
  });

  test('deserialize(null/undefined) não lança e mantém estado default', () => {
    const gs = new GameState();
    assert.doesNotThrow(() => gs.deserialize(null));
    assert.doesNotThrow(() => gs.deserialize(undefined));
    assert.deepEqual(gs.flags, {});
  });

  test('deserialize migra saves antigos (relationships: {npc: number}) sem perder o valor', () => {
    const gs = new GameState();
    gs.deserialize({ flags: {}, relationships: { seu_ivo: 12, marina: -3 } });
    assert.equal(gs.getRelationship('seu_ivo'), 12);
    assert.equal(gs.getRelationship('marina'), -3);
    // Migrado sem histórico prévio — não deve quebrar leitura da aba Pessoas.
    assert.equal(gs.getTalkCount('seu_ivo'), 0);
    assert.equal(gs.hasMet('seu_ivo'), true);
    assert.deepEqual(gs.getRelationshipLog('seu_ivo'), []);
  });

  test('deserialize com save sem npcs nem relationships zera limpo', () => {
    const gs = new GameState();
    gs.changeRelationship('marina', 99); // estado prévio não deve sobreviver
    gs.deserialize({ flags: { x: true } });
    assert.equal(gs.getRelationship('marina'), 0);
    assert.equal(gs.getFlag('x'), true);
  });
});
