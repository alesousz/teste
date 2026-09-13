import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITES_ORBITA, posicaoDaCamera, direcoesNoChao, aplicarZoom, limitarInclinacao,
} from '../../src/editor/orbita.js';
import { MODOS_PAREDE, ehParede, paredeRebaixada } from '../../src/editor/paredes.js';

const perto = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

describe('câmera orbital', () => {
  test('sem giro nem inclinação, a câmera fica atrás do alvo em +z', () => {
    assert.ok(perto(posicaoDaCamera({ alvo: [1, 0, 2], yaw: 0, pitch: 0, distancia: 10 }), [1, 0, 12]));
  });

  test('girada 90°, a câmera vai pro lado +x', () => {
    assert.ok(perto(posicaoDaCamera({ alvo: [0, 0, 0], yaw: Math.PI / 2, pitch: 0, distancia: 5 }), [5, 0, 0]));
  });

  test('inclinação sobe a câmera mantendo a distância até o alvo', () => {
    const [x, y, z] = posicaoDaCamera({ alvo: [0, 2.4, 0], yaw: 0.7, pitch: 0.9, distancia: 18 });
    assert.ok(Math.abs(Math.hypot(x, y - 2.4, z) - 18) < 1e-9);
    assert.ok(y > 2.4);
  });

  test('frente aponta da câmera pro alvo e direita é a direita da tela', () => {
    const { frente, direita } = direcoesNoChao(0);
    assert.ok(perto(frente, [0, -1]));
    assert.ok(perto(direita, [1, 0]));
    // Câmera em +x olhando pra −x: a direita da tela é −z.
    const girado = direcoesNoChao(Math.PI / 2);
    assert.ok(perto(girado.frente, [-1, 0]));
    assert.ok(perto(girado.direita, [0, -1]));
  });

  test('zoom multiplica e respeita os limites', () => {
    assert.ok(Math.abs(aplicarZoom(10, 1) - 11.2) < 1e-9);
    assert.ok(aplicarZoom(10, -1) < 10);
    assert.equal(aplicarZoom(4, -20), LIMITES_ORBITA.DIST_MIN);
    assert.equal(aplicarZoom(100, 20), LIMITES_ORBITA.DIST_MAX);
  });

  test('inclinação não passa do chão nem da vertical', () => {
    assert.equal(limitarInclinacao(-1), LIMITES_ORBITA.PITCH_MIN);
    assert.equal(limitarInclinacao(3), LIMITES_ORBITA.PITCH_MAX);
    assert.equal(limitarInclinacao(0.8), 0.8);
  });
});

describe('modos de parede', () => {
  const base = { andarDaParede: 0, andarAtual: 0, camera: [0, 10, 10], alvo: [0, 0, 0] };

  test('reconhece as paredes do kit e não o resto', () => {
    assert.deepEqual(MODOS_PAREDE, ['inteiras', 'cortadas', 'baixas']);
    for (const t of ['Wall', 'Wall_Corner', 'Wall_Doorway_Square', 'Wall_Window_Wide-VXybmU43Jk']) assert.ok(ehParede(t), t);
    for (const t of ['Floor', 'Column', 'sofa', 'Wooden_Door']) assert.ok(!ehParede(t), t);
  });

  test('inteiras: nenhuma abaixa; baixas: todas as do andar abaixam', () => {
    assert.equal(paredeRebaixada('inteiras', { ...base, posicao: [0, 0, 5] }), false);
    assert.equal(paredeRebaixada('baixas', { ...base, posicao: [0, 0, -5] }), true);
  });

  test('cortadas: abaixa só a parede do lado da câmera', () => {
    assert.equal(paredeRebaixada('cortadas', { ...base, posicao: [0, 0, 3] }), true);
    assert.equal(paredeRebaixada('cortadas', { ...base, posicao: [0, 0, -3] }), false);
    // A parede que passa pelo meio do cômodo continua de pé.
    assert.equal(paredeRebaixada('cortadas', { ...base, posicao: [2, 0, 0.3] }), false);
  });

  test('parede de outro andar não muda, e câmera bem em cima não corta nada', () => {
    assert.equal(paredeRebaixada('baixas', { ...base, andarDaParede: 1, posicao: [0, 0, 3] }), false);
    assert.equal(paredeRebaixada('cortadas', { ...base, camera: [0, 20, 0], posicao: [0, 0, 3] }), false);
  });
});
