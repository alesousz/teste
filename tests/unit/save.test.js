import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorageShim } from '../helpers/localstorage-shim.js';

installLocalStorageShim();
const { hasSave, loadSave, writeSave, clearSave } = await import('../../src/save.js');

describe('save.js', () => {
  beforeEach(() => localStorage.clear());

  test('hasSave/loadSave retornam vazio sem save gravado', () => {
    assert.equal(hasSave(), false);
    assert.equal(loadSave(), null);
  });

  test('writeSave grava e loadSave devolve o mesmo objeto', () => {
    const data = { version: 1, player: { x: 1, z: 2 } };
    assert.equal(writeSave(data), true);
    assert.equal(hasSave(), true);
    assert.deepEqual(loadSave(), data);
  });

  test('clearSave remove o save gravado', () => {
    writeSave({ a: 1 });
    clearSave();
    assert.equal(hasSave(), false);
    assert.equal(loadSave(), null);
  });

  test('loadSave com JSON corrompido não lança, retorna null', () => {
    localStorage.setItem('ecos-da-cidade-save-v1', '{ isso não é json válido');
    assert.doesNotThrow(() => loadSave());
    assert.equal(loadSave(), null);
  });

  test('writeSave/hasSave/loadSave não lançam se localStorage falhar', () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      getItem() { throw new Error('quota excedida'); },
      setItem() { throw new Error('quota excedida'); },
      removeItem() { throw new Error('quota excedida'); },
    };
    assert.equal(hasSave(), false);
    assert.equal(loadSave(), null);
    assert.equal(writeSave({ a: 1 }), false);
    assert.doesNotThrow(() => clearSave());
    globalThis.localStorage = original;
  });
});
