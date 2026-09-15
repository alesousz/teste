import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSOS_DE_GRADE, PASSOS_DE_GIRO, ajustar, ajustarPonto, normalizarAngulo, girarPasso, centroide, deslocar,
} from '../../src/editor/grade.js';

const perto = (a, b) => Math.abs(a - b) < 1e-9;

describe('grid', () => {
  test('ajusta ao múltiplo mais próximo de cada passo oferecido', () => {
    assert.deepEqual(PASSOS_DE_GRADE, [0.25, 0.5, 1, 2]);
    assert.equal(ajustar(1.13, 0.25), 1.25);
    assert.equal(ajustar(1.13, 0.5), 1);
    assert.equal(ajustar(1.6, 1), 2);
    assert.equal(ajustar(2.9, 2), 2);
  });

  test('sem ruído de ponto flutuante nem −0', () => {
    assert.equal(ajustar(0.1 + 0.2, 0.1), 0.3);
    assert.ok(Object.is(ajustar(-0.1, 1), 0));
  });

  test('ajustarPonto mexe em x e z, não na altura', () => {
    assert.deepEqual(ajustarPonto([1.2, 2.47, -3.7], 0.5), [1, 2.47, -3.5]);
  });
});

describe('giro', () => {
  test('passos oferecidos', () => {
    assert.deepEqual(PASSOS_DE_GIRO, [90, 45, 15]);
  });

  test('normaliza pra [0, 2π)', () => {
    assert.ok(perto(normalizarAngulo(-Math.PI / 2), 1.5 * Math.PI));
    assert.equal(normalizarAngulo(2 * Math.PI), 0);
    assert.ok(perto(normalizarAngulo(5 * Math.PI), Math.PI));
  });

  test('gira um passo e cai num múltiplo dele', () => {
    assert.ok(perto(girarPasso(0, 90), Math.PI / 2));
    assert.ok(perto(girarPasso(0, 45), Math.PI / 4));
    // Peça a 10°, giro de 45°: vai pra 45°, não pra 55°.
    assert.ok(perto(girarPasso((10 * Math.PI) / 180, 45), Math.PI / 4));
    // Volta completa e sentido contrário.
    assert.equal(girarPasso((270 * Math.PI) / 180, 90), 0);
    assert.ok(perto(girarPasso(0, 15, -1), (345 * Math.PI) / 180));
  });
});

describe('grupos', () => {
  test('centroide é a média das posições', () => {
    assert.deepEqual(centroide([[0, 0, 0], [2, 2.4, 4]]), [1, 1.2, 2]);
    assert.deepEqual(centroide([]), [0, 0, 0]);
  });

  test('deslocar soma sem ruído', () => {
    assert.deepEqual(deslocar([0.1, 0, 0.2], [0.2, 2.4, 0.1]), [0.3, 2.4, 0.3]);
  });
});
