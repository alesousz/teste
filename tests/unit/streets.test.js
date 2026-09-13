import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, CITY } from '../../src/data.js';
import { RUAS, PERFIL, EIXOS, LIMITE, MEIA_PISTA } from '../../src/data/streets.js';

const EPS = 1e-6;
const MEIA_RUA = CONFIG.ROAD_WIDTH / 2;
const N = CONFIG.GRID_SIZE;

// Declarados AQUI a partir do grid, não copiados do módulo: o teste confere
// o traçado contra a cidade, não contra a opinião do próprio traçado.
const PISTAS = EIXOS.flatMap(r => [
  { x0: r - MEIA_PISTA, x1: r + MEIA_PISTA, z0: -LIMITE, z1: LIMITE },
  { x0: -LIMITE, x1: LIMITE, z0: r - MEIA_PISTA, z1: r + MEIA_PISTA },
]);
const QUARTEIROES = CITY.blocks.map(b => ({
  x0: b.cx - CONFIG.BLOCK_SIZE / 2, x1: b.cx + CONFIG.BLOCK_SIZE / 2,
  z0: b.cz - CONFIG.BLOCK_SIZE / 2, z1: b.cz + CONFIG.BLOCK_SIZE / 2,
}));
const MIOLOS = EIXOS.flatMap(a => EIXOS.map(b => ({
  x0: a - MEIA_PISTA, x1: a + MEIA_PISTA, z0: b - MEIA_PISTA, z1: b + MEIA_PISTA,
})));

const cruza = (a, b) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
const dentro = (p, r) => p.x >= r.x0 - EPS && p.x <= r.x1 + EPS && p.z >= r.z0 - EPS && p.z <= r.z1 + EPS;
const contem = (fora, r) => r.x0 >= fora.x0 - EPS && r.x1 <= fora.x1 + EPS && r.z0 >= fora.z0 - EPS && r.z1 <= fora.z1 + EPS;
const cantosEMeio = r => [
  { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x0, z: r.z1 }, { x: r.x1, z: r.z1 },
  { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 },
];

const pecasDeCalcada = [...RUAS.calcadas, ...RUAS.meioFio];
const sinalizacao = [...RUAS.faixasPedestre.flatMap(f => f.barras), ...RUAS.retencao, ...RUAS.eixoAmarelo];

describe('perfil da rua', () => {
  test('duas calçadas e a pista somam a largura da rua', () => {
    assert.equal(2 * PERFIL.CALCADA + 2 * MEIA_PISTA, CONFIG.ROAD_WIDTH);
  });

  test('os eixos das ruas caem no meio do espaço entre quarteirões', () => {
    for (const q of QUARTEIROES) {
      assert.ok(EIXOS.some(r => Math.abs(q.x0 - (r + MEIA_RUA)) < EPS), `borda oeste ${q.x0}`);
      assert.ok(EIXOS.some(r => Math.abs(q.x1 - (r - MEIA_RUA)) < EPS), `borda leste ${q.x1}`);
    }
  });
});

describe('calçadas e meio-fio', () => {
  test('nenhuma peça se sobrepõe a outra', () => {
    for (let i = 0; i < pecasDeCalcada.length; i++) {
      for (let j = i + 1; j < pecasDeCalcada.length; j++) {
        assert.ok(!cruza(pecasDeCalcada[i], pecasDeCalcada[j]), `peças ${i} e ${j} se sobrepõem`);
      }
    }
  });

  test('nenhuma peça invade pista nem quarteirão', () => {
    for (const p of pecasDeCalcada) {
      for (const pista of PISTAS) assert.ok(!cruza(p, pista), `calçada ${JSON.stringify(p)} na pista`);
      for (const q of QUARTEIROES) assert.ok(!cruza(p, q), `calçada ${JSON.stringify(p)} no quarteirão`);
    }
  });

  test('toda a faixa de rua fora da pista é calçada, sem buraco', () => {
    const naPista = pt => PISTAS.some(r => pt.x > r.x0 + EPS && pt.x < r.x1 - EPS && pt.z > r.z0 + EPS && pt.z < r.z1 - EPS);
    const naRua = pt => EIXOS.some(r => Math.abs(pt.x - r) < MEIA_RUA || Math.abs(pt.z - r) < MEIA_RUA);
    let conferidos = 0;
    for (let x = -LIMITE + 0.25; x < LIMITE; x += 0.5) {
      for (let z = -LIMITE + 0.25; z < LIMITE; z += 0.5) {
        const pt = { x, z };
        if (!naRua(pt) || naPista(pt)) continue;
        const cobrem = pecasDeCalcada.filter(p => dentro(pt, p)).length;
        assert.equal(cobrem, 1, `ponto (${x}, ${z}) coberto por ${cobrem} peças`);
        conferidos++;
      }
    }
    assert.ok(conferidos > 10000);
  });

  test('meio-fio sempre encosta numa pista', () => {
    for (const f of RUAS.faces) {
      const meio = { x: (f.x0 + f.x1) / 2 + f.nx * 0.05, z: (f.z0 + f.z1) / 2 + f.nz * 0.05 };
      assert.ok(PISTAS.some(p => dentro(meio, p)), `face ${JSON.stringify(f)} não dá pra pista`);
    }
  });
});

describe('sinalização horizontal', () => {
  test('toda pintura fica na pista, fora dos quarteirões', () => {
    for (const s of sinalizacao) {
      assert.ok(PISTAS.some(p => contem(p, s)), `pintura ${JSON.stringify(s)} fora da pista`);
      assert.ok(Math.abs(s.x0) <= LIMITE && Math.abs(s.x1) <= LIMITE && Math.abs(s.z0) <= LIMITE && Math.abs(s.z1) <= LIMITE);
    }
  });

  test('uma faixa de pedestre em cada chegada de cruzamento', () => {
    // Cada rua tem N trechos, cada trecho duas chegadas; são 2(N+1) ruas.
    assert.equal(RUAS.faixasPedestre.length, 2 * (N + 1) * 2 * N);
    for (const f of RUAS.faixasPedestre) {
      assert.ok(f.barras.length >= 6, 'zebrada com barras suficientes');
      for (const b of f.barras) assert.ok(contem(f.area, b));
    }
  });

  test('faixa de pedestre não invade o miolo do cruzamento', () => {
    for (const f of RUAS.faixasPedestre) {
      for (const m of MIOLOS) assert.ok(!cruza(f.area, m), `faixa em ${JSON.stringify(f.area)}`);
    }
  });

  test('retenção fica antes da faixa, do lado direito de quem chega', () => {
    for (const r of RUAS.retencao) {
      const faixa = RUAS.faixasPedestre.find(f => f.eixo === r.eixo && f.r === r.r && f.cruzamento === r.cruzamento && f.sentido === r.sentido);
      assert.ok(faixa);
      assert.ok(!cruza(r, faixa.area), 'retenção separada da faixa');
      // Mais longe do cruzamento que a faixa.
      const s = x => (r.eixo === 'z' ? x.z0 + x.z1 : x.x0 + x.x1) / 2;
      assert.ok(Math.abs(s(r) - r.cruzamento) > Math.abs(s(faixa.area) - r.cruzamento));
      // Mão direita: chegando em -z (sentido +1 ao longo de z) a faixa é a de x maior.
      const t = (r.eixo === 'z' ? r.x0 + r.x1 : r.z0 + r.z1) / 2 - r.r;
      const esperado = r.eixo === 'z' ? r.sentido : -r.sentido;
      assert.equal(Math.sign(t), esperado);
    }
  });

  test('eixo tracejado não passa por cima de faixa nem de retenção', () => {
    for (const e of RUAS.eixoAmarelo) {
      for (const f of RUAS.faixasPedestre) assert.ok(!cruza(e, f.area));
      for (const r of RUAS.retencao) assert.ok(!cruza(e, r));
      for (const m of MIOLOS) assert.ok(!cruza(e, m));
    }
  });
});

describe('piso tátil', () => {
  const corpoConcreto = RUAS.calcadas.filter(c => c.piso === 'concreto');

  test('fica em calçada de concreto e não sobe no meio-fio', () => {
    for (const t of [...RUAS.tatilDirecional, ...RUAS.tatilAlerta]) {
      for (const p of cantosEMeio(t)) {
        assert.ok(corpoConcreto.some(c => dentro(p, c)), `tátil ${JSON.stringify(t)} fora do concreto em ${JSON.stringify(p)}`);
      }
      for (const m of RUAS.meioFio) assert.ok(!cruza(t, m), `tátil ${JSON.stringify(t)} no meio-fio`);
    }
  });

  test('peças de piso tátil não se sobrepõem', () => {
    const todos = [...RUAS.tatilDirecional, ...RUAS.tatilAlerta];
    for (let i = 0; i < todos.length; i++) {
      for (let j = i + 1; j < todos.length; j++) assert.ok(!cruza(todos[i], todos[j]), `táteis ${i} e ${j}`);
    }
  });

  test('alerta encosta no meio-fio onde a faixa de pedestre chega', () => {
    for (const a of RUAS.tatilAlerta) {
      assert.ok(RUAS.faixasPedestre.some(f => {
        const s = f.eixo === 'z' ? [a.z0, a.z1, f.area.z0, f.area.z1] : [a.x0, a.x1, f.area.x0, f.area.x1];
        return Math.abs(s[0] - s[2]) < EPS && Math.abs(s[1] - s[3]) < EPS;
      }));
    }
  });
});

describe('praça', () => {
  test('o quarteirão da praça é calçado de pedra portuguesa', () => {
    const pracas = CITY.blocks.filter(b => b.type === 'plaza');
    assert.equal(RUAS.pracas.length, pracas.length);
  });

  test('só a calçada em volta da praça é de pedra, e ela contorna a praça inteira', () => {
    const pedra = RUAS.calcadas.filter(c => c.piso === 'pedra');
    assert.equal(pedra.length, 4 * RUAS.pracas.length);
    for (const c of pedra) {
      assert.ok(RUAS.pracas.some(p => contem({
        x0: p.x0 - PERFIL.CALCADA, x1: p.x1 + PERFIL.CALCADA, z0: p.z0 - PERFIL.CALCADA, z1: p.z1 + PERFIL.CALCADA,
      }, c)));
    }
  });
});
