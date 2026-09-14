import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validarCena, lerCenaEmTeste, CHAVE_CENA_EM_TESTE } from '../../src/data/cenaEmTeste.js';
import { CENA, MODO_VIVER } from '../../src/data/cenaAtiva.js';
import { SCENE } from '../../src/data/scene.js';

const armazenamento = valores => ({ getItem: k => valores[k] ?? null });

describe('validarCena', () => {
  test('aceita a cena do editor e limpa o resto', () => {
    const cena = validarCena({
      cidade: 'fixa',
      extra: 'ignorado',
      spawn: { x: 1, y: 2.4, z: -3 },
      items: [
        { typeId: 'Wall', position: [1, 0, 4], rotY: 1.57, modelo: { url: 'a.glb' }, lixo: 1 },
        { typeId: 'tree', position: [0, 0, 0] },
      ],
    });
    assert.deepEqual(cena, {
      cidade: 'fixa',
      spawn: { x: 1, y: 2.4, z: -3 },
      items: [
        { typeId: 'Wall', position: [1, 0, 4], rotY: 1.57, modelo: { url: 'a.glb' } },
        { typeId: 'tree', position: [0, 0, 0], rotY: 0 },
      ],
    });
  });

  test('recusa peça malformada em vez de jogar a cena pela metade', () => {
    const casos = [
      null, [], { items: 'x' },
      { items: [{ typeId: '', position: [0, 0, 0] }] },
      { items: [{ typeId: 'tree', position: [0, 0] }] },
      { items: [{ typeId: 'tree', position: [0, NaN, 0] }] },
      { items: [{ typeId: 'tree', position: [0, 0, 0], rotY: '1' }] },
      { items: [{ typeId: 'tree', position: [0, 0, 0], props: [1] }] },
      { items: [{ typeId: 'tree', position: [0, 0, 0], modelo: 'a.glb' }] },
    ];
    for (const c of casos) assert.equal(validarCena(c), null, JSON.stringify(c));
  });

  test('spawn inválido some sem derrubar a cena', () => {
    const cena = validarCena({ items: [], spawn: { x: 1, y: 'a', z: 0 } });
    assert.deepEqual(cena, { items: [] });
  });
});

describe('lerCenaEmTeste', () => {
  const gravada = JSON.stringify({ items: [{ typeId: 'tree', position: [1, 0, 1] }], spawn: { x: 1, y: 0, z: 1 } });

  test('só vale com ?viver=1', () => {
    const a = armazenamento({ [CHAVE_CENA_EM_TESTE]: gravada });
    assert.equal(lerCenaEmTeste(a, ''), null);
    assert.equal(lerCenaEmTeste(a, '?viver=0'), null);
    assert.equal(lerCenaEmTeste(a, '?postfx=0&viver=1').items.length, 1);
  });

  test('sem cena, JSON quebrado ou armazenamento bloqueado: partida normal', () => {
    assert.equal(lerCenaEmTeste(armazenamento({}), '?viver=1'), null);
    assert.equal(lerCenaEmTeste(armazenamento({ [CHAVE_CENA_EM_TESTE]: '{quebrado' }), '?viver=1'), null);
    assert.equal(lerCenaEmTeste({ getItem() { throw new Error('bloqueado'); } }, '?viver=1'), null);
  });
});

describe('cenaAtiva', () => {
  test('fora do navegador o jogo usa scene.js', () => {
    assert.equal(CENA, SCENE);
    assert.equal(MODO_VIVER, null);
  });
});
