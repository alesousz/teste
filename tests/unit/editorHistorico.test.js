import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Historico, lote } from '../../src/editor/historico.js';

// Comando que anota o que aconteceu num registro compartilhado.
const cmd = (registro, nome) => ({
  descricao: nome,
  fazer: () => registro.push(`+${nome}`),
  desfazer: () => registro.push(`-${nome}`),
});

describe('Historico', () => {
  test('executar faz; desfazer e refazer andam na ordem certa', () => {
    const r = [];
    const h = new Historico();
    h.executar(cmd(r, 'a'));
    h.executar(cmd(r, 'b'));
    h.desfazer();
    h.desfazer();
    h.refazer();
    assert.deepEqual(r, ['+a', '+b', '-b', '-a', '+a']);
    assert.equal(h.proximoDesfazer, 'a');
    assert.equal(h.proximoRefazer, 'b');
  });

  test('ação nova depois de desfazer descarta o que dava pra refazer', () => {
    const r = [];
    const h = new Historico();
    h.executar(cmd(r, 'a'));
    h.desfazer();
    assert.ok(h.podeRefazer);
    h.executar(cmd(r, 'c'));
    assert.equal(h.podeRefazer, false);
    assert.equal(h.refazer(), null);
  });

  test('registrar guarda sem fazer (o efeito já aconteceu)', () => {
    const r = [];
    const h = new Historico();
    h.registrar(cmd(r, 'arrastar'));
    assert.deepEqual(r, []);
    h.desfazer();
    assert.deepEqual(r, ['-arrastar']);
  });

  test('desfazer e refazer com pilha vazia não quebram', () => {
    const h = new Historico();
    assert.equal(h.desfazer(), null);
    assert.equal(h.refazer(), null);
    assert.equal(h.podeDesfazer, false);
    assert.equal(h.proximoDesfazer, null);
  });

  test('respeita o limite, esquecendo o mais antigo', () => {
    const r = [];
    const h = new Historico({ limite: 2 });
    for (const n of ['a', 'b', 'c']) h.executar(cmd(r, n));
    h.desfazer();
    h.desfazer();
    assert.equal(h.desfazer(), null);
    assert.deepEqual(r.slice(3), ['-c', '-b']);
  });

  test('avisa quem mostra os botões a cada mudança', () => {
    let avisos = 0;
    const h = new Historico({ aoMudar: () => avisos++ });
    h.executar(cmd([], 'a'));
    h.desfazer();
    h.refazer();
    h.limpar();
    assert.equal(avisos, 4);
  });
});

describe('lote', () => {
  test('faz na ordem e desfaz na ordem inversa, num passo só', () => {
    const r = [];
    const h = new Historico();
    h.executar(lote('três peças', [cmd(r, '1'), cmd(r, '2'), cmd(r, '3')]));
    h.desfazer();
    assert.deepEqual(r, ['+1', '+2', '+3', '-3', '-2', '-1']);
    assert.equal(h.podeDesfazer, false);
  });
});
