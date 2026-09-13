import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../vendor/three.module.js';
import { apartmentBoxes, buildApartmentProps } from '../../src/apartmentProps.js';
import { MODELOS_MOVEIS, carregarModelosMoveis, encaixarModelo } from '../../src/propModels.js';

// Tolerância de arredondamento dos floats do .glb.
const TOL = 1e-3;

// Lê um .glb sem three: cabeçalho, bloco JSON e bloco binário.
function lerGlb(caminho) {
  const buf = readFileSync(caminho);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'assinatura glTF');
  const tamJson = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + tamJson).toString('utf8'));
  const inicioBin = 20 + tamJson + 8;
  return { json, bin: buf.subarray(inicioBin) };
}

// Todas as posições de vértice do arquivo, já com a translação dos nós.
function vertices({ json, bin }) {
  const out = [];
  for (const no of json.nodes ?? []) {
    if (no.mesh === undefined) continue;
    assert.ok(!no.rotation && !no.scale, `nó ${no.name} sem rotação/escala (o encaixe assume isso)`);
    const [tx, ty, tz] = no.translation ?? [0, 0, 0];
    for (const prim of json.meshes[no.mesh].primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      const vista = json.bufferViews[acc.bufferView];
      const inicio = (vista.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const f = new Float32Array(bin.buffer.slice(bin.byteOffset + inicio, bin.byteOffset + inicio + acc.count * 12));
      for (let i = 0; i < acc.count; i++) out.push([f[i * 3] + tx, f[i * 3 + 1] + ty, f[i * 3 + 2] + tz]);
    }
  }
  return out;
}

describe('modelos .glb dos móveis', () => {
  const caixas = new Map(apartmentBoxes().map(c => [c.tag, c]));

  for (const { tag, url } of MODELOS_MOVEIS) {
    test(`${tag}: o modelo cabe no AABB de colisão`, () => {
      const caixa = caixas.get(tag);
      assert.ok(caixa, `tag ${tag} existe em apartmentProps`);
      const vs = vertices(lerGlb(new URL(`../../${url}`, import.meta.url)));
      assert.ok(vs.length > 0);

      const mn = [0, 1, 2].map(k => Math.min(...vs.map(v => v[k])));
      const mx = [0, 1, 2].map(k => Math.max(...vs.map(v => v[k])));
      const meiaX = (caixa.maxX - caixa.minX) / 2;
      const meiaZ = (caixa.maxZ - caixa.minZ) / 2;
      const altura = caixa.maxY - caixa.minY;

      // Origem no centro da base: é o que encaixarModelo assume.
      assert.ok(mn[0] >= -meiaX - TOL && mx[0] <= meiaX + TOL, `x [${mn[0]}, ${mx[0]}] em ±${meiaX}`);
      assert.ok(mn[2] >= -meiaZ - TOL && mx[2] <= meiaZ + TOL, `z [${mn[2]}, ${mx[2]}] em ±${meiaZ}`);
      assert.ok(mn[1] >= -TOL && mx[1] <= altura + TOL, `y [${mn[1]}, ${mx[1]}] em [0, ${altura}]`);
      // E encosta no piso: um modelo flutuando também seria defeito.
      assert.ok(Math.abs(mn[1]) < 0.01, `base rente ao piso (y mínimo ${mn[1]})`);
    });
  }

  test('sofa: encosto do lado de z menor, assento virado pra TV', () => {
    const vs = vertices(lerGlb(new URL('../../assets/props/sofa.glb', import.meta.url)));
    const altos = vs.filter(v => v[1] > 0.70);
    assert.ok(altos.length > 0);
    const zMedio = altos.reduce((s, v) => s + v[2], 0) / altos.length;
    assert.ok(zMedio < 0, `a parte alta (encosto) fica em z < 0, veio ${zMedio}`);
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

  test('troca o móvel quando o arquivo chega', async () => {
    const { group } = buildApartmentProps(THREE);
    const modelo = new THREE.Group();
    const n = await carregarModelosMoveis(group, apartmentBoxes(), async () => ({ scene: modelo }));
    assert.equal(n, MODELOS_MOVEIS.length);
    assert.equal(group.getObjectByName('sofa').children[0], modelo);
  });

  test('mantém as caixas quando o arquivo falha', async () => {
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
