import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorageShim } from '../helpers/localstorage-shim.js';

installLocalStorageShim();
const { hasSave, loadSave, writeSave, clearSave, readSave, quarantineSave, readQuarantinedSave } = await import('../../src/save.js');
const { SaveStatus, SAVE_VERSION } = await import('../../src/saveSchema.js');

const CHAVE = 'ecos-da-cidade-save-v1';

function saveValido() {
  return {
    version: SAVE_VERSION,
    player: { x: 10, z: 20, camYaw: 1.2 },
    dayCount: 3,
    needs: { energy: 80, hunger: 70, money: 45 },
  };
}

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

describe('readSave — distingue os estados que loadSave() confundia', () => {
  beforeEach(() => localStorage.clear());

  test('sem save gravado → EMPTY', () => {
    assert.equal(readSave().status, SaveStatus.EMPTY);
  });

  test('save válido → OK, com os dados normalizados', () => {
    writeSave(saveValido());
    const r = readSave();
    assert.equal(r.status, SaveStatus.OK);
    assert.equal(r.save.player.x, 10);
    assert.equal(r.save.dayCount, 3);
  });

  // A-02: antes, este caso e o "sem save" acima devolviam ambos null, e o jogo
  // tratava os dois como "começar partida nova".
  test('JSON corrompido → UNREADABLE, e NÃO se confunde com "sem save"', () => {
    localStorage.setItem(CHAVE, '{ isso não é json');
    const r = readSave();
    assert.equal(r.status, SaveStatus.UNREADABLE);
    assert.notEqual(r.status, SaveStatus.EMPTY);
    assert.ok(r.message, 'precisa de mensagem pro jogador');
    assert.equal(r.save, undefined);
  });

  test('"null" gravado na chave → EMPTY (JSON válido que não é save)', () => {
    localStorage.setItem(CHAVE, 'null');
    assert.equal(readSave().status, SaveStatus.EMPTY);
  });

  // A-01
  test('save incompleto → MALFORMED, não EMPTY nem OK', () => {
    localStorage.setItem(CHAVE, '{}');
    const r = readSave();
    assert.equal(r.status, SaveStatus.MALFORMED);
    assert.ok(r.message);
  });

  // A-07
  test('versão futura → FUTURE_VERSION', () => {
    writeSave({ version: 99, player: { x: 1, z: 2 } });
    assert.equal(readSave().status, SaveStatus.FUTURE_VERSION);
  });

  test('ler um save inválido não o apaga nem o altera', () => {
    const bruto = '{ corrompido';
    localStorage.setItem(CHAVE, bruto);
    readSave();
    readSave();
    assert.equal(localStorage.getItem(CHAVE), bruto, 'o dado original precisa continuar lá');
  });
});

describe('quarantineSave — preservação do save que não pôde ser carregado', () => {
  beforeEach(() => localStorage.clear());

  test('copia o conteúdo bruto pra chave de quarentena', () => {
    const bruto = '{ corrompido';
    localStorage.setItem(CHAVE, bruto);
    assert.equal(quarantineSave(), true);
    assert.equal(readQuarantinedSave(), bruto);
  });

  test('preserva o original mesmo depois de clearSave + nova partida', () => {
    const bruto = JSON.stringify({ version: 1, dayCount: 42 });
    localStorage.setItem(CHAVE, bruto);
    quarantineSave();
    clearSave();
    writeSave(saveValido());
    assert.equal(readQuarantinedSave(), bruto, 'a partida nova não pode levar o save antigo junto');
    assert.equal(readSave().status, SaveStatus.OK);
  });

  test('sem nada pra preservar devolve false', () => {
    assert.equal(quarantineSave(), false);
    assert.equal(readQuarantinedSave(), null);
  });

  test('não lança se localStorage falhar', () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    assert.doesNotThrow(() => quarantineSave());
    assert.equal(quarantineSave(), false);
    assert.equal(readQuarantinedSave(), null);
    globalThis.localStorage = original;
  });
});
