import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { modelosDaCena, PAPEIS } from '../../src/sceneModels.js';
import { OBSERVACOES } from '../../src/data/observacoes.js';
import { SPAWN_DA_CENA } from '../../src/data.js';

const peca = (extra = {}) => ({
  typeId: 'Kitchen_Fridge',
  position: [1, 0, 2],
  rotY: 0,
  modelo: { url: 'assets/props/quaternius-house-interior/Kitchen_Fridge.glb', no: null, escala: 0.5 },
  ...extra,
});

describe('propriedades de jogo nas peças da cena', () => {
  test('interacao, rotulo e portaId chegam no mundo', () => {
    const { porArquivo } = modelosDaCena([peca({ props: { interacao: 'geladeira', rotulo: 'Geladeira', portaId: 'ap101' } })]);
    const copia = [...porArquivo.values()][0][0];
    assert.equal(copia.interacao, 'geladeira');
    assert.equal(copia.rotulo, 'Geladeira');
    assert.equal(copia.portaId, 'ap101');
  });

  test('peça sem props continua válida e sem campos extras', () => {
    const { porArquivo, invalidos } = modelosDaCena([peca()]);
    const copia = [...porArquivo.values()][0][0];
    assert.deepEqual(invalidos, []);
    assert.equal(copia.interacao, undefined);
    assert.equal(copia.rotulo, undefined);
    assert.equal(copia.portaId, undefined);
  });

  test('props malformada derruba a peça em vez de entrar no jogo', () => {
    for (const props of [{ interacao: 7 }, { rotulo: {} }, { portaId: 'x'.repeat(61) }, [1, 2]]) {
      const { porArquivo, invalidos } = modelosDaCena([peca({ props })]);
      assert.equal(porArquivo.size, 0, JSON.stringify(props));
      assert.equal(invalidos.length, 1);
    }
  });

  test('luz é um papel de peça, junto com piso, escada e porta', () => {
    assert.deepEqual(PAPEIS, ['piso', 'escada', 'porta', 'luz']);
    const { porArquivo } = modelosDaCena([peca({ modelo: { url: 'assets/props/quaternius-house-interior/Light_Ceiling.glb', papel: 'luz' } })]);
    assert.equal([...porArquivo.values()][0][0].papel, 'luz');
  });

  test('todo texto de observação tem id em snake_case e frase não vazia', () => {
    for (const [id, texto] of Object.entries(OBSERVACOES)) {
      assert.match(id, /^[a-z][a-z0-9_]*$/, id);
      assert.ok(texto.length > 10, id);
    }
  });

  test('sem peça de início na cena, o jogo cai no quarto do prédio em código', () => {
    assert.equal(SPAWN_DA_CENA, null);
  });
});
