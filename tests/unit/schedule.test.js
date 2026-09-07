import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ObligationSystem } from '../../src/schedule.js';
import { NeedsSystem } from '../../src/needs.js';

function makeDef(overrides = {}) {
  return {
    id: 'job_mercado',
    label: 'Turno no Mercado',
    location: { x: 0, z: 0 },
    startHour: 8,
    endHour: 14,
    payPerDay: 40,
    missPenaltyMoney: 10,
    maxMisses: 3,
    warningMessage: 'aviso',
    endMessage: 'demitido',
    ...overrides,
  };
}

describe('ObligationSystem — janela e presença', () => {
  test('isInWindow respeita [startHour, endHour)', () => {
    const ob = new ObligationSystem(makeDef());
    assert.equal(ob.isInWindow(7.99), false);
    assert.equal(ob.isInWindow(8), true);
    assert.equal(ob.isInWindow(13.99), true);
    assert.equal(ob.isInWindow(14), false);
  });

  test('update marca attendedToday só dentro da janela e perto do local', () => {
    const ob = new ObligationSystem(makeDef());
    ob.update(7, { x: 0, z: 0 }); // fora da janela
    assert.equal(ob.attendedToday, false);

    ob.update(10, { x: 100, z: 100 }); // longe demais
    assert.equal(ob.attendedToday, false);

    ob.update(10, { x: 0, z: 0 }); // dentro da janela e perto
    assert.equal(ob.attendedToday, true);
  });

  test('update não faz nada se já attendedToday ou inativo', () => {
    const ob = new ObligationSystem(makeDef());
    ob.attendedToday = true;
    ob.update(10, { x: 999, z: 999 });
    assert.equal(ob.attendedToday, true); // continua true, sem erro

    const inactive = new ObligationSystem(makeDef());
    inactive.active = false;
    inactive.update(10, { x: 0, z: 0 });
    assert.equal(inactive.attendedToday, false);
  });
});

describe('ObligationSystem — processDayEnd', () => {
  test('dia cumprido paga e zera misses', () => {
    const ob = new ObligationSystem(makeDef());
    ob.misses = 2;
    ob.attendedToday = true;
    const needs = new NeedsSystem(0);

    const result = ob.processDayEnd(1, needs);
    assert.equal(result.attended, true);
    assert.equal(needs.money, 40);
    assert.equal(ob.misses, 0);
    assert.equal(ob.attendedToday, false, 'reseta pro próximo dia');
  });

  test('dia perdido cobra multa e incrementa misses', () => {
    const ob = new ObligationSystem(makeDef());
    const needs = new NeedsSystem(100);

    const result = ob.processDayEnd(1, needs);
    assert.equal(result.attended, false);
    assert.equal(needs.money, 90);
    assert.equal(ob.misses, 1);
    assert.equal(ob.active, true);
  });

  test('penúltima falta antes do limite mostra warningMessage', () => {
    const ob = new ObligationSystem(makeDef({ maxMisses: 3 }));
    ob.misses = 1; // essa falta será a 2ª de 3
    const needs = new NeedsSystem(100);
    const result = ob.processDayEnd(1, needs);
    assert.equal(result.message, 'aviso');
    assert.equal(ob.active, true);
  });

  test('atingir maxMisses desativa a obrigação e usa endMessage', () => {
    const ob = new ObligationSystem(makeDef({ maxMisses: 3 }));
    ob.misses = 2; // essa falta será a 3ª
    const needs = new NeedsSystem(100);
    const result = ob.processDayEnd(1, needs);
    assert.equal(result.fired, true);
    assert.equal(result.message, 'demitido');
    assert.equal(ob.active, false);
  });

  test('processDayEnd é idempotente pro mesmo dayIndex', () => {
    const ob = new ObligationSystem(makeDef());
    const needs = new NeedsSystem(100);
    ob.attendedToday = true;
    const first = ob.processDayEnd(5, needs);
    assert.ok(first);
    const moneyAfterFirst = needs.money;

    const second = ob.processDayEnd(5, needs);
    assert.equal(second, null, 'mesmo dia processado de novo não deve gerar resultado');
    assert.equal(needs.money, moneyAfterFirst, 'não paga/cobra duas vezes pro mesmo dia');
  });

  test('processDayEnd inativo retorna null', () => {
    const ob = new ObligationSystem(makeDef());
    ob.active = false;
    const needs = new NeedsSystem(100);
    assert.equal(ob.processDayEnd(1, needs), null);
  });

  test('payPerDay 0 (ex: escola) gera mensagem sem valor em dinheiro', () => {
    const ob = new ObligationSystem(makeDef({ payPerDay: 0, label: 'Aula na Escola' }));
    ob.attendedToday = true;
    const needs = new NeedsSystem(0);
    const result = ob.processDayEnd(1, needs);
    assert.equal(result.message, 'Você cumpriu: Aula na Escola.');
    assert.equal(needs.money, 0);
  });

  test('serialize/deserialize round-trip', () => {
    const ob = new ObligationSystem(makeDef());
    ob.misses = 2;
    ob.active = false;
    ob.lastProcessedDay = 7;
    const copy = new ObligationSystem(makeDef());
    copy.deserialize(JSON.parse(JSON.stringify(ob.serialize())));
    assert.deepEqual(copy.serialize(), ob.serialize());
  });
});
