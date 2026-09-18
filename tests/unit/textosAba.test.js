import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AbaTextos } from '../../src/dialogue-editor/textosAba.js';
import { ESQUEMA, PADROES, ACONTECIMENTOS, TUTORIAL_PADRAO } from '../../src/textos.js';

// A aba Textos gera o formulário inteiro do ESQUEMA. O que importa testar sem
// navegador: que nenhum recado fica invisível, que "padrão" desfaz de verdade,
// e que a conferência aparece com o campo apontado.

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

function novaAba(textos) {
  const doc = novoDoc();
  const salvos = [];
  const aba = new AbaTextos({
    doc,
    teclas: [{ id: 'interact', label: 'Interagir' }, { id: 'photo', label: 'Fotografar' }],
    rotuloDaTecla: a => ({ interact: 'E', photo: 'F', phone: 'M' }[a] ?? ''),
    aoSalvar: dados => salvos.push(JSON.parse(JSON.stringify(dados))),
  });
  aba.definir(textos ?? {});
  return {
    aba, doc, salvos,
    painel: () => doc.getElementById('textos-panel').innerHTML,
    problemas: () => doc.getElementById('textos-problemas').innerHTML,
  };
}

describe('aba Textos', () => {
  test('desenha um campo por recado do jogo — nenhum fica invisível', () => {
    const { painel } = novaAba();
    for (const campo of ESQUEMA) {
      assert.ok(painel().includes(`data-recado="${campo.chave}"`), `${campo.chave} não apareceu`);
      assert.ok(painel().includes(campo.rotulo), `${campo.chave} apareceu sem rótulo em português`);
    }
  });

  test('mostra a prévia montada, com a tecla que o código põe em cinza travado', () => {
    const { painel } = novaAba();
    assert.match(painel(), /textos-travado">E — /);
    assert.match(painel(), /Falar com Seu Ivo/);
  });

  test('as três listas livres aparecem: tutorial, dicas e conversa de abertura', () => {
    const { painel } = novaAba();
    assert.equal((painel().match(/data-passo="/g) || []).length, TUTORIAL_PADRAO.length);
    assert.equal((painel().match(/data-dica="/g) || []).length, 8);
    assert.equal((painel().match(/data-msg="/g) || []).length, 3);
  });

  test('o dropdown do tutorial oferece os acontecimentos que o jogo emite, e o celular de tecla fixa', () => {
    const { painel } = novaAba();
    for (const a of ACONTECIMENTOS) assert.ok(painel().includes(`value="${a.id}"`), a.id);
    assert.match(painel(), /Celular \(tecla fixa, M\)/);
  });

  test('"padrão" desfaz o recado e grava o rascunho', () => {
    const { aba, salvos } = novaAba({ recados: { 'toast.diario': 'Anotado no caderninho' } });
    assert.equal(aba.textos.recados['toast.diario'], 'Anotado no caderninho');
    assert.equal(aba.voltarAoPadrao('toast.diario'), true);
    assert.equal(aba.textos.recados['toast.diario'], PADROES['toast.diario']);
    assert.equal(salvos.at(-1).recados['toast.diario'], PADROES['toast.diario']);
    assert.equal(aba.voltarAoPadrao('nao.existe'), false);
  });

  test('a conferência acende com erro antes de aviso e marca o campo', () => {
    const { aba, problemas } = novaAba({ recados: { 'toast.item.pegou': 'Você pegou: {pessoa}' } });
    const ordem = [...problemas().matchAll(/class="problema (erro|aviso)"/g)].map(m => m[1]);
    assert.ok(ordem.length >= 1);
    assert.equal(ordem[0], 'erro');
    assert.match(problemas(), /não existe aqui/);
    aba.apontar('toast.item.pegou');
    assert.equal(aba.destaque, 'toast.item.pegou');
  });

  test('o arquivo publicado abre sem erro nem aviso', () => {
    const { problemas } = novaAba();
    assert.match(problemas(), /Tudo certo/);
  });

  test('o rascunho salvo tem as quatro seções e todos os recados', () => {
    const { aba, salvos } = novaAba();
    aba.voltarAoPadrao('toast.diario');
    const salvo = salvos.at(-1);
    assert.deepEqual(Object.keys(salvo).sort(), ['abertura', 'dicas', 'recados', 'tutorial']);
    assert.deepEqual(Object.keys(salvo.recados).sort(), ESQUEMA.map(c => c.chave).sort());
  });

  test('o que o autor escreveu é guardado como está, mesmo errado — com o aviso do lado', () => {
    const { aba, problemas } = novaAba({ recados: { 'prompt.npc': '{tecla} Falar com {pessoa}' } });
    assert.equal(aba.textos.recados['prompt.npc'], '{tecla} Falar com {pessoa}', 'o campo mostra o que ele digitou');
    assert.match(problemas(), /já põe a tecla/);
  });
});
