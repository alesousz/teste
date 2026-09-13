import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FAIXA, pegadaNaFaixa, colisorDoObjeto, empurrarParaFora } from '../../src/objectCollision.js';

const EPS = 1e-9;

// Triângulos de uma caixa entre dois cantos — como uma malha de verdade: os
// vértices ficam só nos cantos, então uma caixa alta não tem vértice nenhum no
// meio da faixa do corpo.
const caixa = (x0, x1, y0, y1, z0, z1) => {
  const v = (i, j, k) => [[x0, x1][i], [y0, y1][j], [z0, z1][k]];
  const faces = [
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
    [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)],
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)],
    [v(1, 0, 0), v(1, 0, 1), v(1, 1, 1), v(1, 1, 0)],
  ];
  return faces.flatMap(([a, b, c, d]) => [[...a, ...b, ...c], [...a, ...c, ...d]]);
};
const percorrer = (...pecas) => cb => { for (const p of pecas) for (const t of p) cb(...t); };

describe('pegadaNaFaixa', () => {
  test('árvore bloqueia pelo tronco, não pela copa', () => {
    // O tronco só tem vértices em y = 0 e y = 3: é a aresta cruzando a faixa
    // que tem de contar.
    const tronco = caixa(-0.2, 0.2, 0, 3, -0.2, 0.2);
    const copa = caixa(-2.5, 2.5, 2.5, 7, -2.5, 2.5);
    const p = pegadaNaFaixa(percorrer(tronco, copa));
    assert.deepEqual({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 }, { x0: -0.2, x1: 0.2, z0: -0.2, z1: 0.2 });
    assert.equal(p.altura, 7);
  });

  test('objeto baixo não bloqueia (grama, flores, tapete)', () => {
    assert.equal(pegadaNaFaixa(percorrer(caixa(-0.3, 0.3, 0, FAIXA.ALTURA_MINIMA - 0.01, -0.3, 0.3))), null);
  });

  test('objeto alto sem nada na faixa do corpo não bloqueia (luminária suspensa)', () => {
    assert.equal(pegadaNaFaixa(percorrer(caixa(-0.3, 0.3, 2.0, 2.8, -0.3, 0.3))), null);
  });

  test('colisao: false desliga e colisao: true força', () => {
    const cadeira = percorrer(caixa(-0.2, 0.2, 0, 0.9, -0.2, 0.2));
    assert.ok(pegadaNaFaixa(cadeira));
    assert.equal(pegadaNaFaixa(cadeira, { colisao: false }), null);

    const banquinho = percorrer(caixa(-0.3, 0.3, 0, 0.4, -0.3, 0.3));
    assert.equal(pegadaNaFaixa(banquinho), null);
    assert.ok(pegadaNaFaixa(banquinho, { colisao: true }));

    // Forçado e sem vértice na faixa: usa a pegada inteira.
    const suspenso = pegadaNaFaixa(percorrer(caixa(-1, 1, 2, 3, -0.5, 0.5)), { colisao: true });
    assert.deepEqual({ x0: suspenso.x0, x1: suspenso.x1 }, { x0: -1, x1: 1 });
  });

  test('modelo sem vértice nenhum não quebra', () => {
    assert.equal(pegadaNaFaixa(() => {}), null);
  });
});

describe('colisorDoObjeto', () => {
  test('pegada deslocada da origem gira junto com o objeto', () => {
    // Pegada centrada em (1, 0) local; objeto girado 90° no ponto (10, 0, 5).
    const s = colisorDoObjeto({ x0: 0.5, x1: 1.5, z0: -0.25, z1: 0.25, altura: 2 }, { x: 10, y: 0, z: 5, rotY: Math.PI / 2 });
    // rotation.y = +90°: o eixo x local aponta pra -z do mundo.
    assert.ok(Math.abs(s.cx - 10) < 1e-9);
    assert.ok(Math.abs(s.cz - 4) < 1e-9);
    assert.equal(s.hx, 0.5);
    assert.equal(s.hz, 0.25);
    assert.equal(s.yMin, FAIXA.MIN);
    assert.equal(s.yMax, 2);
  });
});

describe('empurrarParaFora', () => {
  const retangulo = (rotY = 0, extra = {}) => colisorDoObjeto({ x0: -1, x1: 1, z0: -0.5, z1: 0.5, altura: 1.5 }, { x: 0, y: 0, z: 0, rotY, ...extra });

  test('corpo encostando pela lateral sai até o raio', () => {
    const pos = { x: 1.3, y: 0, z: 0 };
    assert.equal(empurrarParaFora(pos, 0.45, 1.7, retangulo()), true);
    assert.ok(Math.abs(pos.x - 1.45) < EPS);
    assert.equal(pos.z, 0);
  });

  test('corpo longe não é empurrado', () => {
    const pos = { x: 3, y: 0, z: 0 };
    assert.equal(empurrarParaFora(pos, 0.45, 1.7, retangulo()), false);
    assert.equal(pos.x, 3);
  });

  test('centro dentro do retângulo sai pelo lado mais próximo', () => {
    const pos = { x: 0.2, y: 0, z: 0.4 };   // 0,1 da borda em z, 0,8 em x
    empurrarParaFora(pos, 0.45, 1.7, retangulo());
    assert.ok(Math.abs(pos.z - (0.5 + 0.45)) < EPS);
    assert.ok(Math.abs(pos.x - 0.2) < EPS);
  });

  test('retângulo girado empurra na direção girada', () => {
    // Girado 90°: o lado comprido (x local, meia-largura 1) fica ao longo de z.
    const s = retangulo(Math.PI / 2);
    const pos = { x: 0, y: 0, z: 1.3 };
    assert.equal(empurrarParaFora(pos, 0.45, 1.7, s), true);
    assert.ok(Math.abs(pos.z - 1.45) < 1e-9);
    assert.ok(Math.abs(pos.x) < 1e-9);

    // Na mesma posição, sem giro, o lado curto não alcança o corpo.
    const reto = { x: 0, y: 0, z: 1.3 };
    assert.equal(empurrarParaFora(reto, 0.45, 1.7, retangulo()), false);
  });

  test('só colide quando as alturas se cruzam', () => {
    const noSegundoAndar = retangulo(0, { y: 3.2 });
    const naRua = { x: 1.2, y: 0, z: 0 };
    assert.equal(empurrarParaFora(naRua, 0.45, 1.7, noSegundoAndar), false);

    const emCimaDoObjeto = { x: 1.2, y: 1.6, z: 0 };
    assert.equal(empurrarParaFora(emCimaDoObjeto, 0.45, 1.7, retangulo()), false);
  });
});
