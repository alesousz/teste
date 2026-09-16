import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { modelosDaCena, PAPEIS } from '../../src/sceneModels.js';
import { SPAWN_DA_CENA } from '../../src/data.js';
import { SCENE } from '../../src/data/scene.js';

const peca = (extra = {}) => ({
  typeId: 'Kitchen_Fridge',
  position: [1, 0, 2],
  rotY: 0,
  modelo: { url: 'assets/props/quaternius-house-interior/Kitchen_Fridge.glb', no: null, escala: 0.5 },
  ...extra,
});

describe('propriedades de jogo nas peças da cena', () => {
  test('texto, rotulo e portaId chegam no mundo', () => {
    const { porArquivo } = modelosDaCena([peca({ props: { texto: 'Quase vazia.', rotulo: 'Geladeira', portaId: 'ap101' } })]);
    const copia = [...porArquivo.values()][0][0];
    assert.equal(copia.texto, 'Quase vazia.');
    assert.equal(copia.rotulo, 'Geladeira');
    assert.equal(copia.portaId, 'ap101');
  });

  test('peça sem props continua válida e sem campos extras', () => {
    const { porArquivo, invalidos } = modelosDaCena([peca()]);
    const copia = [...porArquivo.values()][0][0];
    assert.deepEqual(invalidos, []);
    assert.equal(copia.texto, undefined);
    assert.equal(copia.rotulo, undefined);
    assert.equal(copia.portaId, undefined);
  });

  test('props malformada derruba a peça em vez de entrar no jogo', () => {
    for (const props of [{ texto: 7 }, { texto: 'x'.repeat(401) }, { rotulo: {} }, { portaId: 'x'.repeat(61) }, [1, 2]]) {
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

  test('o texto de cada objeto mora na cena, não no código', () => {
    const comTexto = SCENE.items.filter(i => i.props?.texto);
    assert.ok(comTexto.length >= 15, `poucos objetos com texto: ${comTexto.length}`);
    for (const item of comTexto) {
      assert.ok(item.props.texto.length > 10, item.typeId);
      assert.ok(item.props.rotulo, `${item.typeId} tem texto mas não tem nome de prompt`);
    }
  });

  test('a peça de início manda o jogador pro quarto do apartamento 101', () => {
    assert.ok(SPAWN_DA_CENA, 'a cena precisa ter a peça "Início do jogo"');
    const { x, y, z } = SPAWN_DA_CENA;
    // Dentro do quarto do 101 e no piso do 1º andar (placa de 10 cm em 2,4 m).
    assert.ok(x > -6 && x < -2, `x fora do quarto: ${x}`);
    assert.ok(z > -58 && z < -54, `z fora do quarto: ${z}`);
    assert.equal(y, 2.5);
  });
});
