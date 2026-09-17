import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AbaRegras } from '../../src/dialogue-editor/regrasAba.js';
import { ESQUEMA, PADROES, MALHA_DO_GERADOR } from '../../src/regras.js';

// A aba Regras desenha o formulário inteiro a partir do ESQUEMA. O que
// importa testar aqui, sem navegador: que nenhuma regra fica de fora da tela,
// que "voltar ao padrão" desfaz de verdade, e que a conferência aparece com
// erro antes de aviso. O DOM falso só guarda o innerHTML de cada painel.

function novoDoc() {
  const porId = {};
  const criarEl = () => ({
    innerHTML: '', textContent: '', value: '', disabled: false, onclick: null, dataset: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    focus() {},
    scrollIntoView() {},
  });
  return {
    getElementById(id) {
      porId[id] ??= criarEl();
      return porId[id];
    },
  };
}

function novaAba(regras = {}) {
  const doc = novoDoc();
  const salvos = [];
  const aba = new AbaRegras({ doc, aoSalvar: dados => salvos.push({ ...dados }) });
  aba.definir({ ...PADROES, ...regras });
  return { aba, doc, salvos, painel: () => doc.getElementById('regras-panel').innerHTML, problemas: () => doc.getElementById('regras-problemas').innerHTML };
}

describe('aba Regras', () => {
  test('desenha um campo por regra do jogo — nenhuma fica invisível', () => {
    const { painel } = novaAba();
    for (const campo of ESQUEMA) {
      assert.ok(painel().includes(`data-campo="${campo.chave}"`), `${campo.chave} não apareceu na tela`);
      assert.ok(painel().includes(campo.rotulo), `${campo.chave} apareceu sem rótulo em português`);
    }
  });

  test('mostra a frase de consequência, não só o número', () => {
    const { painel } = novaAba();
    assert.match(painel(), /sobe 1,17 m/);
    assert.match(painel(), /9 socos/);
  });

  test('a malha da cidade aparece como cartão de leitura, com o motivo escrito', () => {
    const { painel } = novaAba();
    assert.match(painel(), /regras-travado/);
    assert.match(painel(), /editor de mapa/);
    for (const chave of Object.keys(MALHA_DO_GERADOR)) {
      assert.ok(painel().includes(chave), `${chave} devia estar listado no cartão travado`);
      assert.equal(painel().includes(`data-campo="${chave}"`), false, `${chave} não pode virar campo`);
    }
  });

  test('guarda o que o autor escreveu, mesmo fora da faixa, e mostra o que o jogo vai usar', () => {
    const { aba } = novaAba({ PLAYER_SPEED_RUN: 999 });
    assert.equal(aba.regras.PLAYER_SPEED_RUN, 999, 'o campo mostra o que ele digitou');
    assert.equal(aba.valores().PLAYER_SPEED_RUN, 20, 'o jogo usa o valor preso no limite');
  });

  test('"voltar ao padrão" desfaz o campo e salva o rascunho', () => {
    const { aba, salvos } = novaAba({ GRAVITY: 3 });
    aba.voltarAoPadrao('GRAVITY');
    assert.equal(aba.regras.GRAVITY, PADROES.GRAVITY);
    assert.equal(salvos.at(-1).GRAVITY, PADROES.GRAVITY);
    // Campo que não existe não cria chave nova no arquivo.
    aba.voltarAoPadrao('NAO_EXISTE');
    assert.equal('NAO_EXISTE' in aba.regras, false);
  });

  test('a conferência aparece com erro antes de aviso, e some quando está tudo certo', () => {
    const { aba, problemas } = novaAba({ GRAVITY: 2, PUNCH_STAMINA_COST: 500 });
    const ordem = [...problemas().matchAll(/class="problema (erro|aviso)"/g)].map(m => m[1]);
    assert.deepEqual(ordem, ['erro', 'aviso', 'aviso']);
    assert.match(problemas(), /nunca consegue socar/);

    aba.voltarAoPadrao('PUNCH_STAMINA_COST');
    aba.voltarAoPadrao('GRAVITY');
    assert.match(problemas(), /Tudo certo/);
  });

  test('o rascunho salvo não inventa nem perde regra', () => {
    const { aba, salvos } = novaAba();
    aba.voltarAoPadrao('GRAVITY');
    assert.deepEqual(Object.keys(salvos.at(-1)).sort(), ESQUEMA.map(c => c.chave).sort());
  });
});
