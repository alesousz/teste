import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { modelosDaCena } from '../../src/sceneModels.js';

const item = (extra = {}) => ({
  typeId: 'Door',
  position: [1, 0, 2],
  rotY: 0.5,
  modelo: { url: 'assets/props/quaternius-house-interior/Door.glb', no: null, escala: 0.5 },
  ...extra,
});

describe('modelosDaCena', () => {
  test('ignora itens sem modelo (marcos, NPCs, árvores)', () => {
    const { porArquivo, invalidos } = modelosDaCena([
      { typeId: 'npc', position: [0, 0, 0], props: { npcId: 'diego' } },
      { typeId: 'tree', position: [1, 0, 1] },
    ]);
    assert.equal(porArquivo.size, 0);
    assert.equal(invalidos.length, 0);
  });

  test('agrupa as cópias por arquivo, pra baixar cada .glb uma vez', () => {
    const { porArquivo } = modelosDaCena([
      item(),
      item({ position: [5, 0, 5] }),
      { typeId: 'sofa', position: [0, 3.2, 0], rotY: 0, modelo: { url: 'assets/props/moveis.glb', no: 'sofa', escala: 1 } },
    ]);
    assert.equal(porArquivo.size, 2);
    assert.equal(porArquivo.get('assets/props/quaternius-house-interior/Door.glb').length, 2);
    assert.deepEqual(porArquivo.get('assets/props/moveis.glb'), [
      { typeId: 'sofa', no: 'sofa', escala: 1, position: [0, 3.2, 0], rotY: 0 },
    ]);
  });

  test('mantém a altura do editor e completa padrões', () => {
    const { porArquivo } = modelosDaCena([
      { typeId: 'celular', position: [0, 0.45, 1], modelo: { url: 'assets/props/itens.glb', no: 'celular' } },
    ]);
    const [copia] = porArquivo.get('assets/props/itens.glb');
    assert.equal(copia.position[1], 0.45);
    assert.equal(copia.escala, 1);
    assert.equal(copia.rotY, 0);
  });

  test('repassa colisao só quando o pacote forçou', () => {
    const { porArquivo } = modelosDaCena([
      item({ modelo: { url: 'assets/props/a.glb', no: null, escala: 1, colisao: false } }),
      item({ modelo: { url: 'assets/props/b.glb', no: null, escala: 1 } }),
    ]);
    assert.equal(porArquivo.get('assets/props/a.glb')[0].colisao, false);
    assert.ok(!('colisao' in porArquivo.get('assets/props/b.glb')[0]));
  });

  test('recusa origem fora de assets/props, subida de pasta e valores inválidos', () => {
    const ruins = [
      item({ modelo: { url: 'https://exemplo.com/x.glb', escala: 1 } }),
      item({ modelo: { url: 'assets/props/../../segredo.glb', escala: 1 } }),
      item({ modelo: { url: 'assets/props/a.gltf', escala: 1 } }),
      item({ modelo: { url: 'assets/props/a.glb', escala: 0 } }),
      item({ modelo: { url: 'assets/props/a.glb', escala: Number.NaN } }),
      item({ modelo: { url: 'assets/props/a.glb', no: 42 } }),
      item({ modelo: { url: 'assets/props/a.glb', colisao: 'sim' } }),
      item({ position: [1, 0] }),
      item({ position: [1, Number.POSITIVE_INFINITY, 0] }),
    ];
    const { porArquivo, invalidos } = modelosDaCena(ruins);
    assert.equal(porArquivo.size, 0);
    assert.equal(invalidos.length, ruins.length);
  });
});
