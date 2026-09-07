import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NeedsSystem } from '../../src/needs.js';
import { CONFIG } from '../../src/data.js';

describe('NeedsSystem', () => {
  test('começa com energia/fome cheias e o dinheiro inicial dado', () => {
    const needs = new NeedsSystem(60);
    assert.equal(needs.energy, 100);
    assert.equal(needs.hunger, 100);
    assert.equal(needs.money, 60);
  });

  test('update drena energia e fome com o tempo, sem passar de 0', () => {
    const needs = new NeedsSystem(0);
    needs.update(CONFIG.DAY_LENGTH_SECONDS * 10); // bem mais que um dia inteiro
    assert.equal(needs.energy, 0);
    assert.equal(needs.hunger, 0);
  });

  test('faminto (hunger <= 10) drena energia no dobro da taxa', () => {
    const normal = new NeedsSystem(0);
    normal.hunger = 50; // não faminto
    normal.update(1);
    const normalDrain = 100 - normal.energy;

    const starving = new NeedsSystem(0);
    starving.hunger = 5; // faminto
    starving.update(1);
    const starvingDrain = 100 - starving.energy;

    assert.ok(starvingDrain > normalDrain, 'faminto deveria drenar energia mais rápido');
    assert.ok(Math.abs(starvingDrain - normalDrain * 2) < 1e-9, 'a taxa faminta é exatamente o dobro');
  });

  test('isExhausted / isStarving nos limiares', () => {
    const needs = new NeedsSystem(0);
    needs.energy = 16;
    assert.equal(needs.isExhausted(), false);
    needs.energy = 15;
    assert.equal(needs.isExhausted(), true);

    needs.hunger = 11;
    assert.equal(needs.isStarving(), false);
    needs.hunger = 10;
    assert.equal(needs.isStarving(), true);
  });

  test('restoreEnergy/restoreHunger não passam de 100', () => {
    const needs = new NeedsSystem(0);
    needs.energy = 90;
    needs.restoreEnergy(50);
    assert.equal(needs.energy, 100);

    needs.hunger = 90;
    needs.restoreHunger(50);
    assert.equal(needs.hunger, 100);
  });

  test('addMoney/spendMoney — spendMoney recusa saldo insuficiente', () => {
    const needs = new NeedsSystem(10);
    needs.addMoney(5);
    assert.equal(needs.money, 15);

    assert.equal(needs.spendMoney(20), false);
    assert.equal(needs.money, 15, 'saldo não muda numa compra recusada');

    assert.equal(needs.spendMoney(15), true);
    assert.equal(needs.money, 0);
  });

  test('serialize/deserialize round-trip, e deserialize(null) não altera nada', () => {
    const needs = new NeedsSystem(60);
    needs.energy = 42;
    needs.hunger = 33;
    needs.money = 77;

    const copy = new NeedsSystem(0);
    copy.deserialize(JSON.parse(JSON.stringify(needs.serialize())));
    assert.deepEqual(copy.serialize(), needs.serialize());

    const untouched = new NeedsSystem(5);
    untouched.deserialize(null);
    assert.equal(untouched.money, 5);
  });
});
