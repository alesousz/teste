import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InventorySystem } from '../../src/inventory.js';
import { NeedsSystem } from '../../src/needs.js';

describe('InventorySystem', () => {
  test('addItem soma quantidade e ignora item inexistente', () => {
    const inv = new InventorySystem();
    inv.addItem('coffee');
    inv.addItem('coffee', 2);
    assert.equal(inv.counts.coffee, 3);

    inv.addItem('item_que_nao_existe');
    assert.equal(inv.counts.item_que_nao_existe, undefined);
  });

  test('getOwnedItems só lista itens com contagem > 0', () => {
    const inv = new InventorySystem();
    inv.addItem('coffee', 2);
    inv.addItem('snack', 1);
    inv.discardItem('snack');
    const owned = inv.getOwnedItems();
    assert.equal(owned.length, 1);
    assert.equal(owned[0].def.id, 'coffee');
    assert.equal(owned[0].count, 2);
  });

  test('useItem aplica o efeito do item e consome uma unidade', () => {
    const inv = new InventorySystem();
    const needs = new NeedsSystem(60);
    needs.energy = 50;
    inv.addItem('coffee', 1);

    const used = inv.useItem('coffee', needs);
    assert.equal(used, true);
    assert.equal(needs.energy, 75, 'coffee restaura 25 de energia');
    assert.equal(inv.counts.coffee, 0);
  });

  test('useItem falha sem estoque ou com item inexistente', () => {
    const inv = new InventorySystem();
    const needs = new NeedsSystem(60);
    assert.equal(inv.useItem('coffee', needs), false);
    assert.equal(inv.useItem('nao_existe', needs), false);
  });

  test('discardItem reduz contagem e falha em zero', () => {
    const inv = new InventorySystem();
    inv.addItem('snack', 1);
    assert.equal(inv.discardItem('snack'), true);
    assert.equal(inv.counts.snack, 0);
    assert.equal(inv.discardItem('snack'), false);
  });

  test('serialize/deserialize round-trip', () => {
    const inv = new InventorySystem();
    inv.addItem('coffee', 2);
    inv.addItem('homeMeal', 1);
    const copy = new InventorySystem();
    copy.deserialize(JSON.parse(JSON.stringify(inv.serialize())));
    assert.deepEqual(copy.counts, inv.counts);
  });
});
