import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../vendor/three.module.js';
import { apartmentBoxes, buildApartmentProps } from '../../src/apartmentProps.js';
import { ALTURA_EXTRA, ARQUIVO_MOVEIS, carregarModelosMoveis, encaixarModelo } from '../../src/propModels.js';

// Tolerância de arredondamento dos floats do .glb.
const TOL = 1e-3;

// Lê um .glb sem three: cabeçalho, bloco JSON e bloco binário.
function lerGlb(caminho) {
  const buf = readFileSync(caminho);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'assinatura glTF');
  const tamJson = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + tamJson).toString('utf8'));
  return { json, bin: buf.subarray(20 + tamJson + 8) };
}

// Posições de vértice de cada nó com malha, por nome do nó.
function verticesPorNo({ json, bin }) {
  const out = new Map();
  for (const no of json.nodes ?? []) {
    if (no.mesh === undefined) continue;
    assert.ok(!no.rotation && !no.scale, `nó ${no.name} sem rotação/escala (o encaixe assume isso)`);
    const [tx, ty, tz] = no.translation ?? [0, 0, 0];
    const vs = [];
    for (const prim of json.meshes[no.mesh].primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      const vista = json.bufferViews[acc.bufferView];
      const inicio = bin.byteOffset + (vista.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const f = new Float32Array(bin.buffer.slice(inicio, inicio + acc.count * 12));
      for (let i = 0; i < acc.count; i++) vs.push([f[i * 3] + tx, f[i * 3 + 1] + ty, f[i * 3 + 2] + tz]);
    }
    out.set(no.name, vs);
  }
  return out;
}

const glb = lerGlb(new URL(`../../${ARQUIVO_MOVEIS}`, import.meta.url));
const nos = verticesPorNo(glb);
const caixas = apartmentBoxes();

describe('moveis.glb', () => {
  test('traz uma peça pra cada móvel do jogo, e nada além', () => {
    assert.deepEqual([...nos.keys()].sort(), caixas.map(c => c.tag).sort());
  });

  for (const caixa of caixas) {
    test(`${caixa.tag}: cabe no AABB de colisão e encosta no piso`, () => {
      const vs = nos.get(caixa.tag);
      assert.ok(vs?.length > 0, 'peça presente no arquivo');
      const mn = [0, 1, 2].map(k => Math.min(...vs.map(v => v[k])));
      const mx = [0, 1, 2].map(k => Math.max(...vs.map(v => v[k])));
      const meiaX = (caixa.maxX - caixa.minX) / 2;
      const meiaZ = (caixa.maxZ - caixa.minZ) / 2;
      const teto = caixa.maxY - caixa.minY + (ALTURA_EXTRA[caixa.tag] ?? 0);

      // Origem no centro da base: é o que encaixarModelo assume.
      assert.ok(mn[0] >= -meiaX - TOL && mx[0] <= meiaX + TOL, `x [${mn[0]}, ${mx[0]}] em ±${meiaX}`);
      assert.ok(mn[2] >= -meiaZ - TOL && mx[2] <= meiaZ + TOL, `z [${mn[2]}, ${mx[2]}] em ±${meiaZ}`);
      assert.ok(mn[1] >= -TOL && mx[1] <= teto + TOL, `y [${mn[1]}, ${mx[1]}] em [0, ${teto}]`);
      // Um modelo flutuando também seria defeito.
      assert.ok(Math.abs(mn[1]) < 0.01, `base rente ao piso (y mínimo ${mn[1]})`);
    });
  }

  test('ALTURA_EXTRA só vale pra peças que existem', () => {
    const tags = new Set(caixas.map(c => c.tag));
    for (const tag of Object.keys(ALTURA_EXTRA)) assert.ok(tags.has(tag), tag);
  });

  // Orientação: a parte alta fica do lado da parede em que a peça encosta.
  const ladoDaParteAlta = (tag, limiarY, eixo) => {
    const alto = nos.get(tag).filter(v => v[1] > limiarY);
    assert.ok(alto.length > 0);
    return alto.reduce((s, v) => s + v[eixo], 0) / alto.length;
  };

  test('sofá: encosto do lado de z menor, assento virado pra TV', () => {
    assert.ok(ladoDaParteAlta('sofa', 0.70, 2) < 0);
  });

  test('cama: cabeceira do lado de z menor (parede da janela)', () => {
    assert.ok(ladoDaParteAlta('cama', 0.62, 2) < 0);
  });

  test('cadeiras: encosto do lado de z maior, longe da mesa', () => {
    assert.ok(ladoDaParteAlta('cadeira_oeste', 0.55, 2) > 0);
    assert.ok(ladoDaParteAlta('cadeira_leste', 0.55, 2) > 0);
  });

  test('banco do saguão: encosto do lado de x menor (parede oeste)', () => {
    assert.ok(ladoDaParteAlta('banco_saguao', 0.50, 0) < 0);
  });
});

describe('troca das caixas pelo modelo', () => {
  const caixa = { tag: 'sofa', minX: 1, maxX: 2.5, minY: 3.2, maxY: 4.02, minZ: 5, maxZ: 5.85 };

  test('encaixa no centro da base do AABB e liga as sombras', () => {
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh());
    const modelo = new THREE.Group();
    const malha = new THREE.Mesh();
    modelo.add(malha);

    encaixarModelo(grupo, modelo, caixa);

    assert.deepEqual(grupo.children, [modelo]);
    assert.equal(modelo.position.x, 1.75);
    assert.equal(modelo.position.y, 3.2);
    assert.equal(modelo.position.z, 5.425);
    assert.ok(malha.castShadow && malha.receiveShadow);
  });

  test('troca cada peça que o arquivo traz e mantém as caixas das outras', async () => {
    const { group } = buildApartmentProps(THREE);
    const cena = new THREE.Group();
    const sofa = new THREE.Group();
    sofa.name = 'sofa';
    const cama = new THREE.Group();
    cama.name = 'cama';
    cena.add(sofa, cama);
    const mesaAntes = group.getObjectByName('mesa_jantar').children.slice();

    const n = await carregarModelosMoveis(group, apartmentBoxes(), async () => ({ scene: cena }));

    assert.equal(n, 2);
    assert.deepEqual(group.getObjectByName('sofa').children, [sofa]);
    assert.deepEqual(group.getObjectByName('cama').children, [cama]);
    assert.deepEqual(group.getObjectByName('mesa_jantar').children, mesaAntes);
  });

  test('mantém todas as caixas quando o arquivo falha', async () => {
    const { group } = buildApartmentProps(THREE);
    const antes = group.getObjectByName('sofa').children.slice();
    const avisoOriginal = console.warn;
    console.warn = () => {};
    try {
      const n = await carregarModelosMoveis(group, apartmentBoxes(), async () => { throw new Error('404'); });
      assert.equal(n, 0);
    } finally {
      console.warn = avisoOriginal;
    }
    assert.deepEqual(group.getObjectByName('sofa').children, antes);
  });
});
