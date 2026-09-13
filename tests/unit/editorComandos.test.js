import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Historico, lote } from '../../src/editor/historico.js';
import {
  fotografar, comandoColocar, comandoRemover, comandoTransformar, comandoAlterarProps,
} from '../../src/editor/comandos.js';

// Cena falsa: só um mapa de uuid → peça, com as quatro operações do alvo.
function cenaFalsa() {
  const itens = new Map();
  return {
    itens,
    criarItem: f => {
      assert.ok(!itens.has(f.uuid), `uuid repetido ${f.uuid}`);
      itens.set(f.uuid, { ...f, position: [...f.position], props: f.props && { ...f.props } });
    },
    removerItem: uuid => {
      assert.ok(itens.has(uuid), `removendo peça que não existe ${uuid}`);
      itens.delete(uuid);
    },
    transformarItem: (uuid, { position, rotY }) => {
      const it = itens.get(uuid);
      it.position = [...position];
      it.rotY = rotY;
    },
    alterarProps: (uuid, props) => { itens.get(uuid).props = props; },
  };
}

const peca = (uuid, x = 0) => ({ uuid, typeId: 'Wall', position: [x, 0, 0], rotY: 0, props: { cor: 'azul' } });

describe('fotografar', () => {
  test('a foto não muda quando a peça muda depois', () => {
    const it = peca('a');
    const foto = fotografar(it);
    it.position[0] = 9;
    it.props.cor = 'verde';
    assert.equal(foto.position[0], 0);
    assert.equal(foto.props.cor, 'azul');
  });
});

describe('colocar e apagar', () => {
  test('desfazer colocar tira a peça; refazer põe de volta', () => {
    const cena = cenaFalsa();
    const h = new Historico();
    h.executar(comandoColocar(cena, [peca('a'), peca('b', 2)]));
    assert.equal(cena.itens.size, 2);
    h.desfazer();
    assert.equal(cena.itens.size, 0);
    h.refazer();
    assert.deepEqual([...cena.itens.keys()], ['a', 'b']);
  });

  test('apagar e desfazer devolve a MESMA peça, no mesmo lugar e com as mesmas propriedades', () => {
    const cena = cenaFalsa();
    const h = new Historico();
    h.executar(comandoColocar(cena, [peca('a', 3)]));
    cena.alterarProps('a', { cor: 'vermelho' });
    h.executar(comandoRemover(cena, [fotografar(cena.itens.get('a'))]));
    assert.equal(cena.itens.size, 0);
    h.desfazer();
    const volta = cena.itens.get('a');
    assert.deepEqual(volta.position, [3, 0, 0]);
    assert.equal(volta.props.cor, 'vermelho');
  });

  test('descrição no singular e no plural', () => {
    const cena = cenaFalsa();
    assert.equal(comandoColocar(cena, [peca('a')]).descricao, 'Colocar peça');
    assert.equal(comandoRemover(cena, [peca('a'), peca('b')]).descricao, 'Apagar 2 peças');
  });
});

describe('mover, girar e propriedades', () => {
  test('transformar vai e volta entre antes e depois', () => {
    const cena = cenaFalsa();
    const h = new Historico();
    h.executar(comandoColocar(cena, [peca('a')]));
    h.executar(comandoTransformar(cena, [{
      uuid: 'a',
      antes: { position: [0, 0, 0], rotY: 0 },
      depois: { position: [2, 2.4, 1], rotY: Math.PI / 2 },
    }]));
    assert.deepEqual(cena.itens.get('a').position, [2, 2.4, 1]);
    h.desfazer();
    assert.deepEqual(cena.itens.get('a').position, [0, 0, 0]);
    assert.equal(cena.itens.get('a').rotY, 0);
  });

  test('alterar propriedades desfaz pro valor anterior', () => {
    const cena = cenaFalsa();
    const h = new Historico();
    h.executar(comandoColocar(cena, [peca('a')]));
    h.executar(comandoAlterarProps(cena, 'a', { cor: 'azul' }, { cor: 'rosa' }));
    assert.equal(cena.itens.get('a').props.cor, 'rosa');
    h.desfazer();
    assert.equal(cena.itens.get('a').props.cor, 'azul');
  });

  test('colar várias peças e mover o grupo volta inteiro em dois Ctrl+Z', () => {
    const cena = cenaFalsa();
    const h = new Historico();
    h.executar(lote('Colar 3 peças', [comandoColocar(cena, [peca('a'), peca('b', 2), peca('c', 4)])]));
    h.executar(comandoTransformar(cena, ['a', 'b', 'c'].map((uuid, i) => ({
      uuid,
      antes: { position: [i * 2, 0, 0], rotY: 0 },
      depois: { position: [i * 2, 0, 5], rotY: 0 },
    }))));
    h.desfazer();
    assert.ok([...cena.itens.values()].every(it => it.position[2] === 0));
    h.desfazer();
    assert.equal(cena.itens.size, 0);
  });
});
