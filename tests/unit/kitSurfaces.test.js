import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSO, retanguloNoMundo, pisoDoKit, escadaDoKit, alturaDaEscada, apoioEm, tetoEm,
} from '../../src/kitSurfaces.js';

const perto = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// Medidas do Building Kit: piso 2x2 com 0,1 de espessura; escada de 1,3 de
// largura, 4 de comprimento e 2,5 de altura, subindo em +z local.
const PISO = { x0: -1, x1: 1, z0: -1, z1: 1, y0: 0, y1: 0.1 };
const ESCADA = { x0: -0.65, x1: 0.65, z0: -2, z1: 2, y0: 0, y1: 2.5 };

describe('retanguloNoMundo', () => {
  test('giro de 90° troca largura e profundidade', () => {
    const r = retanguloNoMundo(ESCADA, { x: 10, z: 5, rotY: Math.PI / 2 });
    assert.ok(perto(r.minX, 8) && perto(r.maxX, 12));
    assert.ok(perto(r.minZ, 4.35) && perto(r.maxZ, 5.65));
  });
});

describe('pisos', () => {
  test('sustenta quem está até um passo abaixo do topo', () => {
    const andar = pisoDoKit(PISO, { x: 0, y: 2.4, z: 0 });
    assert.equal(andar.y, 2.5);
    assert.equal(apoioEm([andar], 0, 0, 2.5), 2.5);
    assert.equal(apoioEm([andar], 0, 0, 2.5 - PASSO), 2.5);
  });

  test('não puxa quem está no andar de baixo', () => {
    const andar = pisoDoKit(PISO, { x: 0, y: 2.4, z: 0 });
    assert.equal(apoioEm([andar], 0, 0, 0), -Infinity);
  });

  test('fora do retângulo não sustenta', () => {
    const chao = pisoDoKit(PISO, { x: 0, y: 0, z: 0 });
    assert.equal(apoioEm([chao], 1.5, 0, 0), -Infinity);
  });

  test('a base do piso de cima é teto pra quem está embaixo', () => {
    const andar = pisoDoKit(PISO, { x: 0, y: 2.4, z: 0 });
    assert.equal(tetoEm([andar], 0, 0, 0), 2.4);
    // Quem está em cima dele não bate a cabeça nele.
    assert.equal(tetoEm([andar], 0, 0, 2.5), Infinity);
  });
});

describe('escadas', () => {
  test('sem giro sobe em +z: chão no começo, topo no fim, meio no meio', () => {
    const e = escadaDoKit(ESCADA, { x: 0, y: 0, z: 0, rotY: 0 });
    assert.equal(e.eixo, 'z');
    assert.equal(e.sentido, 1);
    assert.ok(perto(alturaDaEscada(e, 0, -2), 0));
    assert.ok(perto(alturaDaEscada(e, 0, 0), 1.25));
    assert.ok(perto(alturaDaEscada(e, 0, 2), 2.5));
  });

  test('girada 180° sobe em -z', () => {
    const e = escadaDoKit(ESCADA, { x: 0, y: 0, z: 0, rotY: Math.PI });
    assert.equal(e.eixo, 'z');
    assert.equal(e.sentido, -1);
    assert.ok(perto(alturaDaEscada(e, 0, 2), 0));
    assert.ok(perto(alturaDaEscada(e, 0, -2), 2.5));
  });

  test('girada 90° sobe em +x', () => {
    const e = escadaDoKit(ESCADA, { x: 0, y: 0, z: 0, rotY: Math.PI / 2 });
    assert.equal(e.eixo, 'x');
    assert.equal(e.sentido, 1);
    assert.ok(perto(alturaDaEscada(e, -2, 0), 0));
    assert.ok(perto(alturaDaEscada(e, 2, 0), 2.5));
  });

  test('subir degrau a degrau funciona, pular do chão pro topo não', () => {
    const e = escadaDoKit(ESCADA, { x: 0, y: 0, z: 0 });
    // Andando: os pés estão logo abaixo do ponto da rampa.
    let pes = 0;
    // Passo inteiro: somar 0,1 quarenta vezes para em 1,9999… e pula o fim.
    for (let i = 0; i <= 40; i++) {
      const z = -2 + i * 0.1;
      const y = apoioEm([e], 0, z, pes);
      assert.ok(y > -Infinity, `perdeu o apoio em z=${z.toFixed(1)}`);
      pes = y;
    }
    assert.ok(perto(pes, 2.5));
    // Do chão, o fim da escada (2,5 m) está fora do alcance do passo.
    assert.equal(apoioEm([e], 0, 2, 0), -Infinity);
  });

  test('escada com patamar: a rampa acaba em zTopo e o resto é plano', () => {
    // Como a Stairs_Sides: vai de z −2 a 4, chega no topo em z = 2.
    const e = escadaDoKit({ x0: -0.75, x1: 0.75, z0: -2, z1: 4, y0: 0, y1: 2.55, zTopo: 2 }, { x: 0, y: 0, z: 0 });
    assert.ok(perto(alturaDaEscada(e, 0, 0), 1.275));
    assert.ok(perto(alturaDaEscada(e, 0, 2), 2.55));
    assert.ok(perto(alturaDaEscada(e, 0, 3.5), 2.55));
    // Girada 180°: o patamar fica do lado de z negativo.
    const g = escadaDoKit({ x0: -0.75, x1: 0.75, z0: -2, z1: 4, y0: 0, y1: 2.55, zTopo: 2 }, { x: 0, y: 0, z: 0, rotY: Math.PI });
    assert.ok(perto(alturaDaEscada(g, 0, -3.5), 2.55));
    assert.ok(perto(alturaDaEscada(g, 0, 2), 0));
  });

  test('a escada escolhe o maior apoio entre ela e o piso de cima', () => {
    const e = escadaDoKit(ESCADA, { x: 0, y: 0, z: 0 });
    const patamar = pisoDoKit(PISO, { x: 0, y: 2.4, z: 3 });
    assert.ok(perto(apoioEm([e, patamar], 0, 2, 2.45), 2.5));
    assert.ok(perto(apoioEm([e, patamar], 0, 3, 2.45), 2.5));
  });
});
