import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AbaAnimacoes } from '../../src/dialogue-editor/animacoesAba.js';
import { CONJUNTO_DE_FABRICA, ESTADOS, CLIPES } from '../../src/animacoes.js';

// A aba Animações decide o que pode virar conjunto e o que não pode ser
// apagado — é isso que separa um autor que experimenta de um autor que deixa
// um personagem sem jeito de andar. O DOM falso só deixa render() rodar; a
// prévia falsa registra o que foi pedido pro boneco fazer.

function novoDoc() {
  const porId = {};
  const criarEl = () => ({
    innerHTML: '', textContent: '', value: '', disabled: false, onclick: null, oninput: null, dataset: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
  });
  const doc = {
    avisos: [], perguntas: [],
    getElementById(id) {
      porId[id] ??= criarEl();
      return porId[id];
    },
  };
  doc.defaultView = {
    alert: msg => doc.avisos.push(msg),
    confirm: msg => { doc.perguntas.push(msg); return doc.respostaDoConfirm !== false; },
    prompt: (_, sugestao) => sugestao,
  };
  return doc;
}

function novaAba({ npcs = [], animacoes } = {}) {
  const doc = novoDoc();
  const salvos = [];
  const tocados = [];
  const aba = new AbaAnimacoes({
    doc, npcs,
    aoSalvar: dados => salvos.push(JSON.parse(JSON.stringify(dados))),
    previa: { tocar: nome => { tocados.push(nome); return true; } },
  });
  aba.definir(animacoes ?? {
    padrao: 'normal',
    conjuntos: {
      normal: { label: 'Normal', ...CONJUNTO_DE_FABRICA },
      apressado: { label: 'Apressado', estados: { ...CONJUNTO_DE_FABRICA.estados, walk: 'Jog_Fwd_Loop' }, gestos: { ...CONJUNTO_DE_FABRICA.gestos } },
    },
  });
  return { aba, doc, salvos, tocados, lista: () => doc.getElementById('animacoes-lista').innerHTML, corpo: () => doc.getElementById('animacoes-editor-body').innerHTML, biblioteca: () => doc.getElementById('animacoes-biblioteca').innerHTML };
}

describe('aba Animações', () => {
  test('abre no conjunto padrão e desenha um campo por estado e por gesto', () => {
    const { aba, corpo } = novaAba();
    assert.equal(aba.sel, 'normal');
    for (const estado of ESTADOS) {
      assert.ok(corpo().includes(`data-chave="${estado.chave}"`), `${estado.chave} não apareceu`);
      assert.ok(corpo().includes(estado.rotulo), `${estado.chave} apareceu sem rótulo`);
    }
  });

  test('a biblioteca mostra as animações do pacote, com nome em português', () => {
    const { biblioteca } = novaAba();
    for (const c of CLIPES) {
      assert.ok(biblioteca().includes(`data-clipe="${c.nome}"`), `${c.nome} ficou fora da biblioteca`);
    }
    assert.match(biblioteca(), /Dançando/);
  });

  test('clicar numa animação toca ela no boneco', () => {
    const { aba, tocados } = novaAba();
    assert.equal(aba.tocar('Dance_Loop'), true);
    assert.deepEqual(tocados, ['Dance_Loop']);
    assert.equal(aba.tocar('Nao_Existe'), false, 'animação de fora do pacote não toca');
    assert.deepEqual(tocados, ['Dance_Loop']);
  });

  test('"usar aqui" só funciona com animação tocando E campo escolhido', () => {
    const { aba, salvos } = novaAba();
    aba.tocar('Dance_Loop');
    assert.equal(aba.usarClipeNoCampo(), false, 'sem campo em foco não mexe em nada');

    aba.focarCampo('estados', 'idle');
    assert.equal(aba.usarClipeNoCampo(), true);
    assert.equal(aba.animacoes.conjuntos.normal.estados.idle, 'Dance_Loop');
    assert.equal(salvos.at(-1).conjuntos.normal.estados.idle, 'Dance_Loop', 'gravou o rascunho');
  });

  test('duplicar copia o conjunto inteiro e abre a cópia', () => {
    const { aba } = novaAba();
    aba.selecionar('apressado');
    const novo = aba.duplicar();
    assert.equal(aba.sel, novo);
    assert.equal(aba.animacoes.conjuntos[novo].estados.walk, 'Jog_Fwd_Loop');
    // Mexer na cópia não mexe no original.
    aba.animacoes.conjuntos[novo].estados.walk = 'Walk_Loop';
    assert.equal(aba.animacoes.conjuntos.apressado.estados.walk, 'Jog_Fwd_Loop');
  });

  test('criar nasce com o jeito de fábrica e id limpo', () => {
    const { aba } = novaAba();
    const id = aba.criar('Meu Jeito');
    assert.equal(id, 'meu_jeito');
    assert.deepEqual(aba.animacoes.conjuntos[id].estados, CONJUNTO_DE_FABRICA.estados);
    assert.equal(aba.criar('Meu Jeito'), 'meu_jeito_2', 'id repetido não sobrescreve o que já existe');
  });

  test('não dá pra excluir o conjunto padrão', () => {
    const { aba, doc } = novaAba();
    assert.equal(aba.excluir('normal'), false);
    assert.match(doc.avisos.at(-1), /conjunto padrão/);
    assert.ok(aba.animacoes.conjuntos.normal);
  });

  test('não dá pra excluir conjunto que um personagem usa, e o aviso diz quem', () => {
    const { aba, doc } = novaAba({ npcs: [{ id: 'runner', name: 'Caio', animacoes: 'apressado' }] });
    assert.equal(aba.excluir('apressado'), false);
    assert.match(doc.avisos.at(-1), /Caio ainda usa/);
    assert.ok(aba.animacoes.conjuntos.apressado);
  });

  test('conjunto que ninguém usa sai, depois de confirmar', () => {
    const { aba, doc } = novaAba();
    assert.equal(aba.excluir('apressado'), true);
    assert.equal(aba.animacoes.conjuntos.apressado, undefined);
    assert.match(doc.perguntas.at(-1), /Excluir o conjunto/);
    assert.equal(aba.sel, 'normal', 'volta pro padrão depois de apagar o que estava aberto');
  });

  test('recusar a confirmação não apaga nada', () => {
    const { aba, doc } = novaAba();
    doc.respostaDoConfirm = false;
    assert.equal(aba.excluir('apressado'), false);
    assert.ok(aba.animacoes.conjuntos.apressado);
  });

  test('trocar o padrão muda quem vale pra quem não escolheu', () => {
    const { aba, salvos } = novaAba();
    assert.equal(aba.definirPadrao('apressado'), true);
    assert.equal(aba.animacoes.padrao, 'apressado');
    assert.equal(salvos.at(-1).padrao, 'apressado');
    // E aí o antigo padrão pode ser apagado.
    assert.equal(aba.excluir('normal'), true);
  });

  test('a conferência aparece e aponta o campo errado', () => {
    const { aba, doc } = novaAba();
    aba.focarCampo('gestos', 'attack');
    aba.tocar('Dance_Loop');
    aba.usarClipeNoCampo();
    const painel = doc.getElementById('animacoes-problemas').innerHTML;
    assert.match(painel, /problema erro/);
    assert.match(painel, /nunca volta a andar/);
  });

  test('quem usa cada conjunto aparece na lista', () => {
    const { lista, doc } = novaAba({ npcs: [{ id: 'runner', name: 'Caio', animacoes: 'apressado' }] });
    assert.match(lista(), /1 personagem\(ns\)/);
    assert.match(doc.getElementById('animacoes-uso').innerHTML, /Ninguém ainda/);
  });
});
