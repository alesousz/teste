import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.js';
import { AP, LEVELS, ROOMS, LOBBY, CORRIDOR, DOORS, SPAWN } from '../../src/data/apartment.js';
import { CONFIG } from '../../src/data.js';
import {
  buildApartmentProps, apartmentSolids, apartmentAnchors, apartmentBoxes,
} from '../../src/apartmentProps.js';

const EPS = 1e-9;

// Mapa ambiente → retângulo + piso. É declarado AQUI de propósito: o teste
// confere a mobília contra a planta (src/data/apartment.js), não contra a
// opinião do próprio módulo de móveis.
const AMBIENTES = {
  quarto: { rect: ROOMS.quarto, piso: LEVELS[1].y },
  banheiro: { rect: ROOMS.banheiro, piso: LEVELS[1].y },
  sala: { rect: ROOMS.sala, piso: LEVELS[1].y },
  corredor: { rect: CORRIDOR, piso: LEVELS[1].y },
  saguao: { rect: LOBBY, piso: LEVELS[0].y },
};

const pisoDoNivel = (level) => LEVELS.find(l => l.id === level).y;

// Volume livre que a porta precisa: a largura do vão, meio metro pra cada
// lado da folha e a altura do vão.
function vaoDaPorta(porta) {
  const piso = pisoDoNivel(porta.level);
  const meia = porta.w / 2;
  const folga = 0.5;
  const y = { minY: piso, maxY: piso + AP.DOOR_H };
  return porta.axis === 'x'
    ? { minX: porta.x - meia, maxX: porta.x + meia, minZ: porta.z - folga, maxZ: porta.z + folga, ...y }
    : { minX: porta.x - folga, maxX: porta.x + folga, minZ: porta.z - meia, maxZ: porta.z + meia, ...y };
}

function seCruzam(a, b) {
  return a.minX < b.maxX - EPS && b.minX < a.maxX - EPS
    && a.minY < b.maxY - EPS && b.minY < a.maxY - EPS
    && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;
}

// Distância no plano do chão entre um ponto e um AABB (0 se está dentro).
function distanciaAoAABB(px, pz, caixa) {
  const dx = Math.max(caixa.minX - px, 0, px - caixa.maxX);
  const dz = Math.max(caixa.minZ - pz, 0, pz - caixa.maxZ);
  return Math.hypot(dx, dz);
}

describe('apartmentProps — AABBs de colisão', () => {
  test('todo sólido tem min < max nos três eixos', () => {
    const solids = apartmentSolids();
    assert.ok(solids.length > 0, 'nenhum sólido foi gerado');
    for (const s of solids) {
      assert.ok(s.minX < s.maxX, `${s.tag}: minX >= maxX`);
      assert.ok(s.minY < s.maxY, `${s.tag}: minY >= maxY`);
      assert.ok(s.minZ < s.maxZ, `${s.tag}: minZ >= maxZ`);
    }
  });

  test('todo sólido declara tag e ambiente conhecidos', () => {
    const vistos = new Set();
    for (const s of apartmentSolids()) {
      assert.equal(typeof s.tag, 'string');
      assert.ok(s.tag.length > 0, 'tag vazia');
      assert.ok(!vistos.has(s.tag), `tag repetida: ${s.tag}`);
      vistos.add(s.tag);
      assert.ok(AMBIENTES[s.room], `sólido ${s.tag} num ambiente desconhecido: ${s.room}`);
    }
  });

  test('nenhum sólido ultrapassa os limites do cômodo nem o pé-direito', () => {
    for (const s of apartmentSolids()) {
      const { rect, piso } = AMBIENTES[s.room];
      assert.ok(s.minX >= rect.x0 - EPS, `${s.tag} vaza a oeste (${s.minX} < ${rect.x0})`);
      assert.ok(s.maxX <= rect.x1 + EPS, `${s.tag} vaza a leste (${s.maxX} > ${rect.x1})`);
      assert.ok(s.minZ >= rect.z0 - EPS, `${s.tag} vaza pro sul (${s.minZ} < ${rect.z0})`);
      assert.ok(s.maxZ <= rect.z1 + EPS, `${s.tag} vaza pro norte (${s.maxZ} > ${rect.z1})`);
      assert.ok(s.minY >= piso - EPS, `${s.tag} afunda no piso (${s.minY} < ${piso})`);
      assert.ok(s.maxY <= piso + AP.CEIL + EPS, `${s.tag} fura o teto (${s.maxY} > ${piso + AP.CEIL})`);
    }
  });

  test('todos os volumes declarados (sólidos ou não) respeitam o cômodo', () => {
    for (const m of apartmentBoxes()) {
      const { rect, piso } = AMBIENTES[m.room];
      assert.ok(m.minX >= rect.x0 - EPS && m.maxX <= rect.x1 + EPS, `${m.tag} fora do cômodo em x`);
      assert.ok(m.minZ >= rect.z0 - EPS && m.maxZ <= rect.z1 + EPS, `${m.tag} fora do cômodo em z`);
      assert.ok(m.minY >= piso - EPS && m.maxY <= piso + AP.CEIL + EPS, `${m.tag} fora do pé-direito`);
    }
  });

  test('dois sólidos nunca ocupam o mesmo espaço', () => {
    const solids = apartmentSolids();
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        assert.ok(
          !seCruzam(solids[i], solids[j]),
          `${solids[i].tag} e ${solids[j].tag} se atravessam`,
        );
      }
    }
  });

  test('nenhum sólido cobre o ponto de SPAWN', () => {
    const piso = pisoDoNivel(SPAWN.level);
    for (const s of apartmentSolids()) {
      if (Math.abs(s.minY - piso) > AP.CEIL) continue; // sólido de outro pavimento
      const dentro = SPAWN.x > s.minX && SPAWN.x < s.maxX && SPAWN.z > s.minZ && SPAWN.z < s.maxZ;
      assert.ok(!dentro, `o jogador nasceria dentro de ${s.tag}`);
    }
  });

  test('o jogador cabe em pé no SPAWN (raio de colisão livre)', () => {
    const piso = pisoDoNivel(SPAWN.level);
    for (const s of apartmentSolids()) {
      if (Math.abs(s.minY - piso) > AP.CEIL) continue;
      const d = distanciaAoAABB(SPAWN.x, SPAWN.z, s);
      assert.ok(
        d > CONFIG.PLAYER_RADIUS,
        `${s.tag} está a ${d.toFixed(2)}m do spawn, menos que o raio do jogador (${CONFIG.PLAYER_RADIUS})`,
      );
    }
  });

  test('nenhum sólido bloqueia o vão de nenhuma porta', () => {
    for (const porta of DOORS) {
      const vao = vaoDaPorta(porta);
      for (const s of apartmentSolids()) {
        assert.ok(!seCruzam(s, vao), `${s.tag} invade o vão da porta "${porta.id}"`);
      }
    }
  });

  test('a mobília mínima de cada ambiente tem colisão', () => {
    const tags = new Set(apartmentSolids().map(s => s.tag));
    for (const esperado of [
      'cama', 'criado_mudo', 'guarda_roupa',           // quarto
      'vaso', 'pia_banheiro', 'box_banho',             // banheiro
      'sofa', 'mesinha_centro', 'rack_tv', 'mesa_jantar',
      'cadeira_oeste', 'cadeira_leste', 'bancada', 'geladeira',
      'banco_saguao',                                  // saguão
    ]) {
      assert.ok(tags.has(esperado), `faltou colisão pra "${esperado}"`);
    }
  });

  test('objetos decorativos ficam fora de solids (dá pra pisar/passar)', () => {
    const tags = new Set(apartmentSolids().map(s => s.tag));
    for (const decorativo of ['tapete', 'mural_fotos', 'luminaria_corredor', 'extintor', 'caixa_correio', 'espelho']) {
      assert.ok(!tags.has(decorativo), `"${decorativo}" não deveria ter colisão`);
    }
  });

  test('apartmentSolids devolve cópias (mexer no resultado não estraga o módulo)', () => {
    const antes = apartmentSolids();
    antes[0].minX = -999;
    assert.notEqual(apartmentSolids()[0].minX, -999);
  });
});

describe('apartmentProps — pontos de interação', () => {
  test('todo anchor tem id único, rótulo e ambiente válidos', () => {
    const ids = new Set();
    for (const a of apartmentAnchors()) {
      assert.ok(!ids.has(a.id), `id de anchor repetido: ${a.id}`);
      ids.add(a.id);
      assert.equal(typeof a.label, 'string');
      assert.ok(a.label.trim().length > 0, `anchor ${a.id} sem rótulo`);
      assert.ok(AMBIENTES[a.room], `anchor ${a.id} num ambiente desconhecido: ${a.room}`);
    }
  });

  test('todo anchor fica dentro do prédio', () => {
    for (const a of apartmentAnchors()) {
      assert.ok(a.x >= 0 && a.x <= AP.W, `anchor ${a.id} fora do prédio em x: ${a.x}`);
      assert.ok(a.z >= 0 && a.z <= AP.D, `anchor ${a.id} fora do prédio em z: ${a.z}`);
      assert.ok(a.y >= 0 && a.y <= AP.ROOF_Y, `anchor ${a.id} fora do prédio em y: ${a.y}`);
    }
  });

  test('todo anchor cai dentro do próprio cômodo e abaixo do teto', () => {
    for (const a of apartmentAnchors()) {
      const { rect, piso } = AMBIENTES[a.room];
      assert.ok(a.x >= rect.x0 && a.x <= rect.x1, `anchor ${a.id} fora do cômodo em x`);
      assert.ok(a.z >= rect.z0 && a.z <= rect.z1, `anchor ${a.id} fora do cômodo em z`);
      assert.ok(a.y > piso && a.y < piso + AP.CEIL, `anchor ${a.id} fora do pé-direito`);
    }
  });

  test('todo anchor tem espaço livre em volta pro jogador chegar nele', () => {
    // Varre um quadrado de 0,9 m em volta do ponto procurando UMA posição
    // onde o jogador (círculo de PLAYER_RADIUS) caiba dentro do cômodo sem
    // encostar em móvel. Sem isso, um rótulo pode existir mas ser
    // inalcançável — âncora enterrada dentro da mobília.
    const r = CONFIG.PLAYER_RADIUS;
    const solids = apartmentSolids();
    for (const a of apartmentAnchors()) {
      const { rect, piso } = AMBIENTES[a.room];
      const doAndar = solids.filter(s => Math.abs(s.minY - piso) < AP.CEIL);
      let achou = false;
      for (let dx = -0.9; dx <= 0.9 && !achou; dx += 0.05) {
        for (let dz = -0.9; dz <= 0.9 && !achou; dz += 0.05) {
          const x = a.x + dx;
          const z = a.z + dz;
          if (Math.hypot(dx, dz) > 0.9) continue;
          if (x < rect.x0 + r || x > rect.x1 - r || z < rect.z0 + r || z > rect.z1 - r) continue;
          if (doAndar.every(s => distanciaAoAABB(x, z, s) >= r)) achou = true;
        }
      }
      assert.ok(achou, `não há onde ficar em pé perto do anchor "${a.id}"`);
    }
  });

  test('os pontos de interação obrigatórios existem', () => {
    const ids = new Set(apartmentAnchors().map(a => a.id));
    for (const id of ['cama', 'janela_quarto', 'armario', 'geladeira', 'pia', 'porta_retratos']) {
      assert.ok(ids.has(id), `faltou o anchor "${id}"`);
    }
  });
});

describe('apartmentProps — geometria', () => {
  const { group, solids, anchors } = buildApartmentProps(THREE);

  test('devolve group, solids e anchors coerentes com a API pura', () => {
    assert.ok(group.isGroup, 'group não é um THREE.Group');
    assert.deepEqual(solids, apartmentSolids());
    assert.deepEqual(anchors, apartmentAnchors());
  });

  test('cada móvel declarado virou um subgrupo com malhas', () => {
    const moveis = apartmentBoxes();
    assert.equal(group.children.length, moveis.length);
    for (const m of moveis) {
      const g = group.children.find(c => c.name === m.tag);
      assert.ok(g, `nenhum subgrupo pro móvel "${m.tag}"`);
      const malhas = g.children.filter(o => o.isMesh);
      assert.ok(malhas.length > 0, `o móvel "${m.tag}" não tem malha nenhuma`);
    }
  });

  test('a geometria de cada móvel cabe no AABB declarado (nada atravessa parede nem flutua)', () => {
    // Em x/z o encaixe é exato: o AABB é o envelope do móvel. Em y só o
    // apoio é exato — peças finas como abajur, torneira e cabeceira podem
    // subir acima do volume de colisão de propósito.
    const TOL = 0.02;
    const TOL_ALTURA = 0.45;
    for (const m of apartmentBoxes()) {
      const g = group.children.find(c => c.name === m.tag);
      const caixa = new THREE.Box3().setFromObject(g);
      assert.ok(caixa.min.x >= m.minX - TOL, `${m.tag}: geometria sai do AABB em -x`);
      assert.ok(caixa.max.x <= m.maxX + TOL, `${m.tag}: geometria sai do AABB em +x`);
      assert.ok(caixa.min.z >= m.minZ - TOL, `${m.tag}: geometria sai do AABB em -z`);
      assert.ok(caixa.max.z <= m.maxZ + TOL, `${m.tag}: geometria sai do AABB em +z`);
      assert.ok(Math.abs(caixa.min.y - m.minY) <= TOL, `${m.tag}: base flutuando/afundada (${caixa.min.y} vs ${m.minY})`);
      assert.ok(caixa.max.y <= m.maxY + TOL_ALTURA, `${m.tag}: geometria alta demais pro AABB`);
    }
  });

  test('o grupo inteiro cabe dentro do prédio', () => {
    const caixa = new THREE.Box3().setFromObject(group);
    assert.ok(caixa.min.x >= 0 && caixa.max.x <= AP.W, 'mobília fora do prédio em x');
    assert.ok(caixa.min.z >= 0 && caixa.max.z <= AP.D, 'mobília fora do prédio em z');
    assert.ok(caixa.min.y >= 0 && caixa.max.y <= AP.ROOF_Y, 'mobília fora do prédio em y');
  });

  test('materiais e geometrias são compartilhados (custo de render baixo)', () => {
    const materiais = new Set();
    const geometrias = new Set();
    let malhas = 0;
    group.traverse(o => {
      if (!o.isMesh) return;
      malhas++;
      materiais.add(o.material);
      geometrias.add(o.geometry);
      assert.ok(o.material.isMeshStandardMaterial, 'material fora do padrão MeshStandardMaterial');
    });
    assert.ok(malhas > 50, `poucas malhas: ${malhas}`);
    assert.ok(materiais.size <= 16, `materiais demais (${materiais.size}) — algum não está sendo reaproveitado`);
    assert.ok(geometrias.size <= 2, `geometrias demais (${geometrias.size}) — deveriam ser caixa + cilindro`);
  });

  test('todo móvel com volume projeta sombra', () => {
    for (const s of apartmentSolids()) {
      const g = group.children.find(c => c.name === s.tag);
      const projeta = g.children.some(o => o.isMesh && o.castShadow);
      assert.ok(projeta, `nenhuma peça de "${s.tag}" tem castShadow`);
    }
  });

  test('superfícies horizontais grandes recebem sombra', () => {
    for (const tag of ['cama', 'mesa_jantar', 'bancada', 'tapete', 'banco_saguao', 'mesinha_centro']) {
      const g = group.children.find(c => c.name === tag);
      assert.ok(g.children.some(o => o.isMesh && o.receiveShadow), `"${tag}" não recebe sombra`);
    }
  });

  test('duas montagens são independentes', () => {
    const outro = buildApartmentProps(THREE);
    assert.notEqual(outro.group, group);
    assert.equal(outro.group.children.length, group.children.length);
  });
});
