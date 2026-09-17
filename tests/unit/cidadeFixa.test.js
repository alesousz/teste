import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, CITY, gerarCidade, LANDMARK_SPECS } from '../../src/data.js';
import { SCENE } from '../../src/data/scene.js';
import { ehMarco } from '../../src/marcos.js';
import { textoDoScene } from '../../src/data/formatoCena.js';

function sorteador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('cidade sorteada', () => {
  test('a mesma semente dá a mesma cidade', () => {
    const a = gerarCidade(sorteador(7), { fixa: false });
    const b = gerarCidade(sorteador(7), { fixa: false });
    assert.deepEqual(a.buildings, b.buildings);
  });

  test('praça, parques e o quarteirão do prédio inicial ficam sem prédio sorteado', () => {
    const cidade = gerarCidade(sorteador(3), { fixa: false });
    for (const bloco of cidade.blocks) {
      if (['plaza', 'park', 'predio_inicial'].includes(bloco.type)) assert.equal(bloco.lots.length, 0, bloco.type);
    }
  });
});

describe('cidade fixa', () => {
  test('scene.js está com a cidade fixa', () => {
    assert.equal(SCENE.cidade, 'fixa');
    assert.equal(CITY.fixa, true);
  });

  test('todo marco e prédio da cena vira lote com colisão, sem sortear nada', () => {
    const nuncaSorteia = () => { throw new Error('cidade fixa não sorteia'); };
    const cidade = gerarCidade(nuncaSorteia, { fixa: true });
    const marcos = SCENE.items.filter(i => ehMarco(i.typeId)).length;
    const predios = SCENE.items.filter(i => i.typeId === 'building').length;
    assert.ok(predios > 0, 'a cena fixa tem prédios');
    assert.equal(cidade.buildings.length, marcos + predios);
    assert.deepEqual(cidade.buildings.filter(b => b.kind).map(b => b.kind).sort(), Object.keys(LANDMARK_SPECS).sort());
  });

  test('os prédios fixados continuam dentro dos quarteirões, fora da rua', () => {
    const meio = CONFIG.BLOCK_SIZE / 2;
    for (const bloco of CITY.blocks) {
      for (const b of bloco.lots) {
        if (b.kind || b.estilo !== 'cidade') continue;
        assert.ok(b.minX >= bloco.cx - meio - 1e-6 && b.maxX <= bloco.cx + meio + 1e-6, `prédio em ${b.cx},${b.cz} vaza em x`);
        assert.ok(b.minZ >= bloco.cz - meio - 1e-6 && b.maxZ <= bloco.cz + meio + 1e-6, `prédio em ${b.cx},${b.cz} vaza em z`);
      }
    }
  });

  test('os parques têm árvores e bancos na cena', () => {
    const noParque = (item, tipo) => item.typeId === tipo && CITY.blocks.some(b => b.type === 'park'
      && Math.abs(item.position[0] - b.cx) <= CONFIG.BLOCK_SIZE / 2 && Math.abs(item.position[2] - b.cz) <= CONFIG.BLOCK_SIZE / 2);
    assert.ok(SCENE.items.filter(i => noParque(i, 'tree')).length >= 16);
    assert.ok(SCENE.items.filter(i => noParque(i, 'bench')).length >= 6);
  });
});

describe('arquivo scene.js', () => {
  test('o texto gerado é um módulo que devolve a mesma cena', async () => {
    const cena = {
      cidade: 'fixa',
      items: [
        { typeId: 'npc', position: [1, 0, 2], rotY: 0, props: { npcId: 'almeida', note: "d'água \"aspas\"" } },
        { modelo: { url: 'a.glb', no: null, escala: 1 }, rotY: 1.5, position: [0, 2.4, 0], typeId: 'Wall' },
      ],
    };
    const texto = textoDoScene(cena);
    const { SCENE: lida } = await import(`data:text/javascript,${encodeURIComponent(texto)}`);
    assert.deepEqual(lida, cena);
    assert.match(texto, /\{"typeId":"Wall","position":\[0,2\.4,0\],"rotY":1\.5,"modelo"/);
  });
});
