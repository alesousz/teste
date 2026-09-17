import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARCOS_PADRAO, TIPO_ANTIGO, TIPO_DE_MARCO, LIMITES_DO_MARCO,
  ehMarco, marcoDaPeca, marcosDaCena, problemasDosMarcos,
} from '../../src/marcos.js';
import { LANDMARK_SPECS, MARCOS_DA_CENA, MARCOS_PROBLEMAS, landmarkCenter } from '../../src/data.js';

const peca = (props, typeId = TIPO_DE_MARCO, position = [10, 0, -20]) => ({ typeId, position, rotY: 0, props });

describe('marco como peça da cena', () => {
  test('as medidas escritas na peça são as que valem', () => {
    const m = marcoDaPeca(peca({ kind: 'padaria', label: 'PADARIA', w: 12, d: 8, h: 6, color: '#ffffff', roofColor: '#000000' }));
    assert.deepEqual(m, {
      kind: 'padaria', label: 'PADARIA', w: 12, d: 8, h: 6,
      color: '#ffffff', roofColor: '#000000', x: 10, z: -20,
    });
  });

  test('peça sem medida cai no padrão, e medida absurda é presa no limite', () => {
    const m = marcoDaPeca(peca({ kind: 'padaria', w: 999, h: -5, color: 'vermelho' }));
    assert.equal(m.w, LIMITES_DO_MARCO.MAX);
    assert.equal(m.h, LIMITES_DO_MARCO.MIN);
    assert.equal(m.color, MARCOS_PADRAO.job_mercado.color, 'cor inválida volta pro padrão');
    assert.equal(m.label, MARCOS_PADRAO.job_mercado.label);
  });

  test('cena antiga continua abrindo: o typeId de antes vira marco de fábrica', () => {
    for (const [typeId, kind] of Object.entries(TIPO_ANTIGO)) {
      assert.ok(ehMarco(typeId), typeId);
      const m = marcoDaPeca(peca(undefined, typeId));
      assert.equal(m.kind, kind);
      assert.equal(m.w, MARCOS_PADRAO[kind].w);
      assert.equal(m.label, MARCOS_PADRAO[kind].label);
    }
  });

  test('peça que não é marco, e marco sem id, não viram nada', () => {
    assert.equal(marcoDaPeca(peca({ kind: 'x' }, 'tree')), null);
    assert.equal(marcoDaPeca(peca({ label: 'SEM ID' })), null);
  });

  test('dois marcos com o mesmo id: vale o último, e a conferência acusa', () => {
    const itens = [peca({ kind: 'padaria', w: 10 }), peca({ kind: 'padaria', w: 20 })];
    assert.equal(marcosDaCena(itens).padaria.w, 20);
    const problemas = problemasDosMarcos(itens);
    assert.equal(problemas.filter(p => p.nivel === 'erro').length, 1);
    assert.match(problemas[0].mensagem, /já existe outro marco/i);
  });

  test('a conferência reclama de id vazio e avisa sobre id fora do padrão', () => {
    const semId = problemasDosMarcos([peca({ label: 'X' })]);
    assert.equal(semId[0].nivel, 'erro');
    assert.match(semId[0].mensagem, /sem id/i);

    const torto = problemasDosMarcos([peca({ kind: 'Padaria Central' })]);
    assert.equal(torto[0].nivel, 'aviso');
    assert.match(torto[0].mensagem, /padrão/i);
  });
});

describe('os marcos do jogo saem da cena', () => {
  test('a cena publicada não tem problema de marco', () => {
    assert.deepEqual(MARCOS_PROBLEMAS, []);
  });

  test('os quatro marcos do jogo existem, com as medidas de sempre', () => {
    for (const [kind, padrao] of Object.entries(MARCOS_PADRAO)) {
      const spec = LANDMARK_SPECS[kind];
      assert.ok(spec, `${kind} sumiu da cena`);
      assert.equal(spec.w, padrao.w);
      assert.equal(spec.label, padrao.label);
      assert.ok(MARCOS_DA_CENA.includes(kind), `${kind} não está na lista que o editor oferece`);
      const centro = landmarkCenter(kind);
      assert.ok(centro.x !== 0 || centro.z !== 0, `${kind} caiu no fallback (0,0)`);
    }
  });
});
