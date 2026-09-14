import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  pontoDaGrade, celulaDoPonto, centroDaCelula, trechosDaLinha, trechosDoComodo, chaveDoTrecho,
  comprimentoDaParede, trechosDaPeca, trocaDeAbertura, folhaDoVao, posicaoDaFolha, folhasNaParede,
  celulasDoRetangulo, preencherComodo, telhasDoComodo, ehAbertura, ehFolhaDePorta, ehTelhado,
} from '../../src/editor/construcao.js';

const Q = Math.PI / 2;
const perto = (a, b) => Math.abs(a - b) < 1e-9;

describe('grade de construção', () => {
  test('pontos nas linhas pares e células de 2 m', () => {
    assert.deepEqual(pontoDaGrade(2.9, -1.2), [2, -2]);
    assert.deepEqual(pontoDaGrade(-0.4, 0.4), [0, 0]);
    assert.deepEqual(celulaDoPonto(3.5, -0.5), [1, -1]);
    assert.deepEqual(centroDaCelula([1, -1]), [3, -1]);
  });
});

describe('paredes', () => {
  test('linha ao longo de x vira trechos de 2 m girados 90°', () => {
    const t = trechosDaLinha([0, 4], [6, 5]);
    assert.deepEqual(t.map(chaveDoTrecho), ['1,4', '3,4', '5,4']);
    assert.ok(t.every(p => perto(p.rotY, Q)));
  });

  test('linha ao longo de z, arrastada ao contrário, e ponto parado', () => {
    const t = trechosDaLinha([2, 4], [2, 0]);
    assert.deepEqual(t.map(chaveDoTrecho), ['2,1', '2,3']);
    assert.ok(t.every(p => p.rotY === 0));
    assert.deepEqual(trechosDaLinha([2, 2], [2, 2]), []);
  });

  test('cômodo 4 × 2 m tem 6 trechos, sem repetir', () => {
    const t = trechosDoComodo([0, 0], [4, 2]).map(chaveDoTrecho);
    assert.equal(t.length, 6);
    assert.equal(new Set(t).size, 6);
    assert.deepEqual([...t].sort(), ['0,1', '1,0', '1,2', '3,0', '3,2', '4,1']);
  });

  test('comprimento pelas peças do kit', () => {
    assert.equal(comprimentoDaParede('Wall'), 2);
    assert.equal(comprimentoDaParede('Wall_Window_Wide-VXybmU43Jk'), 4);
    assert.equal(comprimentoDaParede('Wall_Doorway_Wide_Ro'), 4);
    assert.equal(comprimentoDaParede('Wall_Half'), 1);
    assert.equal(comprimentoDaParede('Wall_Corner'), 0);
    assert.equal(comprimentoDaParede('Floor'), 0);
  });

  test('trechos de uma peça colocada', () => {
    assert.deepEqual(trechosDaPeca({ typeId: 'Wall', position: [1, 0, 4], rotY: Q }), ['1,4']);
    assert.deepEqual(trechosDaPeca({ typeId: 'Wall_Window_Wide', position: [2, 0, 4], rotY: Q }), ['1,4', '3,4']);
    assert.deepEqual(trechosDaPeca({ typeId: 'Wall_Doorway_Wide', position: [0, 0, 2], rotY: 0 }), ['0,1', '0,3']);
    assert.deepEqual(trechosDaPeca({ typeId: 'Column', position: [0, 0, 0] }), []);
  });

  test('classificação das peças', () => {
    assert.ok(ehAbertura('Wall_Doorway_Square') && ehAbertura('Wall_Window_Wide') && !ehAbertura('Wall'));
    assert.ok(ehFolhaDePorta('Wooden_Door') && ehFolhaDePorta('Red_door') && !ehFolhaDePorta('Wall_Doorway_Square'));
    assert.ok(ehTelhado('Roof_Flat_Side') && !ehTelhado('Floor'));
  });
});

describe('portas e janelas', () => {
  const parede = (uuid, x, z, rotY = Q, typeId = 'Wall') => ({ uuid, typeId, position: [x, 0, z], rotY });

  test('porta troca a parede no mesmo lugar e traz a folha', () => {
    const a = parede('a', 1, 4);
    const t = trocaDeAbertura('Wall_Doorway_Square', a, [1.2, 4], [a]);
    assert.deepEqual(t.remover.map(p => p.uuid), ['a']);
    assert.equal(t.colocar[0].typeId, 'Wall_Doorway_Square');
    assert.deepEqual(t.colocar[0].position, [1, 0, 4]);
    assert.equal(t.colocar[1].typeId, 'Wooden_Door');
    assert.deepEqual(t.colocar[1].position, posicaoDaFolha([1, 0, 4], Q));
  });

  test('a folha fica 0,45 m pra trás no vão (medida do kit)', () => {
    assert.deepEqual(posicaoDaFolha([12, 0, -16], Q), [11.55, 0, -16]);
    assert.equal(folhaDoVao('Wall_Doorway_Wide'), null);
    assert.equal(folhaDoVao('Wall_Doorway_Round'), 'Wooden_Door_Rounded');
  });

  test('janela larga ocupa duas paredes em linha, do lado do mouse', () => {
    const a = parede('a', 1, 4);
    const b = parede('b', 3, 4);
    const c = parede('c', -1, 4);
    const t = trocaDeAbertura('Wall_Window_Wide', a, [1.6, 4], [a, b, c]);
    assert.deepEqual(t.remover.map(p => p.uuid), ['a', 'b']);
    assert.deepEqual(t.colocar[0].position, [2, 0, 4]);
    const outro = trocaDeAbertura('Wall_Window_Wide', a, [0.4, 4], [a, b, c]);
    assert.deepEqual(outro.remover.map(p => p.uuid), ['a', 'c']);
    assert.deepEqual(outro.colocar[0].position, [0, 0, 4]);
  });

  test('não encaixa: larga sem vizinha, meia peça larga, nem a mesma peça', () => {
    const a = parede('a', 1, 4);
    assert.equal(trocaDeAbertura('Wall_Window_Wide', a, [1.6, 4], [a]), null);
    const larga = parede('l', 2, 4, Q, 'Wall_Window_Wide');
    assert.equal(trocaDeAbertura('Wall_Window_Square', larga, [1, 4], [larga]), null);
    const janela = parede('j', 1, 4, Q, 'Wall_Window_Square');
    assert.equal(trocaDeAbertura('Wall_Window_Square', janela, [1, 4], [janela]), null);
    assert.equal(trocaDeAbertura('Wall', a, [1, 4], [a]), null);
  });

  test('trocar um vão de porta leva a folha antiga junto', () => {
    const vao = parede('v', 1, 4, Q, 'Wall_Doorway_Square');
    const folha = { uuid: 'f', typeId: 'Wooden_Door', position: posicaoDaFolha([1, 0, 4], Q), rotY: Q };
    const longe = { uuid: 'g', typeId: 'Wooden_Door', position: [9, 0, 4], rotY: Q };
    assert.deepEqual(folhasNaParede(vao, [vao, folha, longe]).map(p => p.uuid), ['f']);
    const t = trocaDeAbertura('Wall_Window_Square', vao, [1, 4], [vao, folha, longe]);
    assert.deepEqual(t.remover.map(p => p.uuid), ['v', 'f']);
    assert.equal(t.colocar.length, 1);
  });
});

describe('piso e telhado', () => {
  test('retângulo de células, em qualquer sentido', () => {
    const c = celulasDoRetangulo([4.5, 0.2], [0.1, 3.9]);
    assert.equal(c.length, 6);
    assert.deepEqual(c[0], [0, 0]);
  });

  test('cômodo fechado é preenchido; aberto não', () => {
    const paredes = new Set(trechosDoComodo([0, 0], [6, 4]).map(chaveDoTrecho));
    const cel = preencherComodo([1, 1], paredes);
    assert.equal(cel.length, 6);
    paredes.delete('3,0');
    assert.equal(preencherComodo([1, 1], paredes, 100), null);
  });

  test('parede interna não divide o preenchimento de outro cômodo', () => {
    const paredes = new Set([...trechosDoComodo([0, 0], [8, 4]), ...trechosDaLinha([4, 0], [4, 4])].map(chaveDoTrecho));
    assert.equal(preencherComodo([0, 0], paredes).length, 4);
    assert.equal(preencherComodo([3, 1], paredes).length, 4);
  });

  test('telhado de um cômodo 3 × 3 células: cantos, lados e miolo', () => {
    const cel = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cel.push([i, j]);
    const t = telhasDoComodo(cel);
    const em = (x, z) => t.find(p => p.x === x && p.z === z);
    assert.equal(em(3, 3).typeId, 'Roof_Flat_Center');
    assert.deepEqual([em(5, 3).typeId, em(5, 3).rotY], ['Roof_Flat_Side', 0]);          // mureta em +x
    assert.ok(perto(em(3, 1).rotY, Q) && em(3, 1).typeId === 'Roof_Flat_Side');        // mureta em −z
    assert.deepEqual([em(5, 5).typeId, em(5, 5).rotY], ['Roof_Flat_Corner', 0]);        // canto +x +z
    assert.ok(perto(em(1, 1).rotY, Math.PI) && em(1, 1).typeId === 'Roof_Flat_Corner'); // canto −x −z
  });

  test('cômodo em L usa o canto de dentro e célula solta vira placa com mureta em volta', () => {
    // 3 × 3 sem o canto (2, 2): a célula do meio tem os quatro vizinhos e só a diagonal vazia.
    const L = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== 2 || j !== 2) L.push([i, j]);
    const t = telhasDoComodo(L);
    const miolo = t.find(p => p.x === 3 && p.z === 3);   // célula (1, 1)
    assert.equal(miolo.typeId, 'Roof_Flat_Corner_Inn');
    assert.equal(telhasDoComodo([[5, 5]])[0].typeId, 'Roof_Flat_Square');
  });
});
