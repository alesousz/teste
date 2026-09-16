import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AbaRotina } from '../../src/dialogue-editor/rotinaAba.js';

// A aba Rotina decide o que pode e o que não pode ser criado/apagado. Essas
// regras são a diferença entre um autor que erra e conserta e um autor que
// deixa o jogo num estado que não abre — então elas são testadas aqui, sem
// navegador. O DOM falso abaixo só existe pra `render()` poder rodar: o que
// importa é o que sobra na rotina depois de cada operação.

function novoDoc(respostas = {}) {
  const criarEl = () => ({
    innerHTML: '', textContent: '', value: '', onclick: null, dataset: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    querySelectorAll: () => [],
    querySelector: () => criarEl(),
    addEventListener() {},
    scrollIntoView() {},
  });
  const porId = {};
  const doc = {
    avisos: [],       // o que o editor disse pro autor
    perguntas: [],    // as confirmações que ele pediu
    getElementById(id) {
      porId[id] ??= criarEl();
      return porId[id];
    },
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  doc.defaultView = {
    prompt: () => respostas.prompt ?? null,
    alert: texto => doc.avisos.push(texto),
    confirm: texto => { doc.perguntas.push(texto); return respostas.confirm ?? true; },
  };
  return doc;
}

const rotinaBase = () => ({
  obligations: {
    job_mercado: {
      id: 'job_mercado', type: 'job', label: 'Turno no Mercado',
      local: { marco: 'job_mercado', ancora: 'frente', margem: 3 },
      npc: 'seu_ivo', startHour: 8, endHour: 14,
      payPerDay: 40, missPenaltyMoney: 10, maxMisses: 3,
      warningMessage: 'aviso', endMessage: 'fim',
    },
    school: {
      id: 'school', type: 'school', label: 'Aula na Escola',
      local: { marco: 'school', ancora: 'frente', margem: 3 },
      npc: 'professora', startHour: 8, endHour: 14,
      payPerDay: 0, missPenaltyMoney: 0, maxMisses: 3,
      warningMessage: 'aviso', endMessage: 'fim',
    },
  },
  homes: {
    home_operario: { id: 'home_operario', kind: 'home_operario', local: { marco: 'home_operario', ancora: 'lado', margem: 3 } },
    home_nobre: { id: 'home_nobre', kind: 'home_nobre', local: { marco: 'home_nobre', ancora: 'lado', margem: 3 } },
  },
  origins: {
    operario: { id: 'operario', label: 'Bairro Operário', startMoney: 60, home: 'home_operario', obligation: 'job_mercado' },
  },
  courses: {
    medicina: { id: 'medicina', label: 'Medicina', glyph: 'stethoscope', age: 18, startMoney: 60, obligation: 'school' },
    direito: { id: 'direito', label: 'Direito', glyph: 'gavel', age: 18, startMoney: 60, obligation: 'school' },
  },
});

function montar(respostas) {
  const documento = novoDoc(respostas);
  let salvo = null;
  const aba = new AbaRotina({
    npcs: [{ id: 'seu_ivo', name: 'Seu Ivo' }, { id: 'professora', name: 'Professora Elaine' }],
    marcos: ['home_operario', 'home_nobre', 'job_mercado', 'school'],
    nomeDoMarco: k => k.toUpperCase(),
    aoSalvar: dados => { salvo = dados; },
    doc: documento,
  });
  aba.definir(rotinaBase());
  return { aba, doc: documento, salvou: () => salvo };
}

describe('aba Rotina — criar', () => {
  test('curso novo nasce com compromisso próprio: nunca curso sem compromisso', () => {
    const { aba, salvou } = montar({ prompt: 'artes' });
    aba._novo('course');
    const curso = aba.rotina.courses.artes;
    assert.ok(curso, 'o curso deveria ter sido criado');
    assert.ok(aba.rotina.obligations[curso.obligation], 'o compromisso do curso tem que existir');
    assert.notEqual(curso.obligation, 'school', 'não pode reaproveitar o compromisso de outro curso');
    assert.ok(salvou(), 'criar tem que gravar o rascunho');
  });

  test('o compromisso do curso novo já nasce cumprível: lugar no mapa e janela aberta', () => {
    const { aba } = montar({ prompt: 'artes' });
    aba._novo('course');
    const ob = aba.rotina.obligations[aba.rotina.courses.artes.obligation];
    assert.ok(aba.marcos.includes(ob.local.marco), 'o lugar tem que ser um prédio que existe');
    assert.ok(ob.endHour > ob.startHour);
    assert.ok(ob.maxMisses >= 1);
  });

  test('id repetido não sobrescreve o que já existe: ganha sufixo', () => {
    const { aba } = montar({ prompt: 'medicina' });
    aba._novo('course');
    assert.equal(aba.rotina.courses.medicina.label, 'Medicina', 'o curso original tem que continuar intacto');
    assert.ok(aba.rotina.courses.medicina_2, 'o novo entra com outro id');
  });

  test('id com espaço, acento e maiúscula vira um id que o jogo aceita', () => {
    const { aba } = montar({ prompt: 'Turno da Noite!' });
    aba._novo('obligation');
    assert.ok(aba.rotina.obligations.turno_da_noite, Object.keys(aba.rotina.obligations).join(','));
  });

  test('id só de pontuação é recusado com uma dica, sem criar nada', () => {
    const { aba, doc: d } = montar({ prompt: '!!!' });
    const antes = Object.keys(aba.rotina.obligations).length;
    aba._novo('obligation');
    assert.equal(Object.keys(aba.rotina.obligations).length, antes);
    assert.match(d.avisos.at(-1), /turno_da_noite/);
  });

  test('cancelar o prompt não cria nada', () => {
    const { aba } = montar({ prompt: null });
    const antes = Object.keys(aba.rotina.courses).length;
    aba._novo('course');
    assert.equal(Object.keys(aba.rotina.courses).length, antes);
  });
});

describe('aba Rotina — duplicar', () => {
  test('curso duplicado ganha compromisso próprio: faltar num não conta no outro', () => {
    const { aba } = montar();
    aba.selecionar('course', 'medicina');
    aba._duplicar();
    const copia = Object.values(aba.rotina.courses).find(c => c.id !== 'medicina' && c.label.includes('cópia'));
    assert.ok(copia);
    assert.notEqual(copia.obligation, aba.rotina.courses.medicina.obligation);
    assert.ok(aba.rotina.obligations[copia.obligation]);
  });

  test('compromisso duplicado é cópia independente, não a mesma referência', () => {
    const { aba } = montar();
    aba.selecionar('obligation', 'job_mercado');
    aba._duplicar();
    const copia = aba.rotina.obligations.job_mercado_copia;
    assert.ok(copia);
    copia.local.marco = 'school';
    assert.equal(aba.rotina.obligations.job_mercado.local.marco, 'job_mercado', 'mexer na cópia não pode mexer no original');
  });
});

describe('aba Rotina — excluir sem deixar estado quebrado', () => {
  test('compromisso usado por um curso não é excluído, e o aviso diz quem usa', () => {
    const { aba, doc: d } = montar();
    aba.selecionar('obligation', 'school');
    aba._excluir();
    assert.ok(aba.rotina.obligations.school, 'não podia ter sido excluído');
    assert.match(d.avisos.at(-1), /Medicina/);
    assert.match(d.avisos.at(-1), /Direito/);
  });

  test('compromisso usado por uma origem também é recusado', () => {
    const { aba, doc: d } = montar();
    aba.selecionar('obligation', 'job_mercado');
    aba._excluir();
    assert.ok(aba.rotina.obligations.job_mercado);
    assert.match(d.avisos.at(-1), /Bairro Oper/);
  });

  test('casa usada por uma origem é recusada', () => {
    const { aba, doc: d } = montar();
    aba.selecionar('home', 'home_operario');
    aba._excluir();
    assert.ok(aba.rotina.homes.home_operario);
    assert.match(d.avisos.at(-1), /origem/);
  });

  test('compromisso que ninguém usa é excluído depois de confirmar', () => {
    const { aba } = montar({ confirm: true });
    aba.rotina.obligations.bico = { id: 'bico', label: 'Bico', local: { marco: 'job_mercado' }, startHour: 1, endHour: 2 };
    aba.selecionar('obligation', 'bico');
    aba._excluir();
    assert.equal(aba.rotina.obligations.bico, undefined);
  });

  test('recusar a confirmação mantém tudo', () => {
    const { aba } = montar({ confirm: false });
    aba.rotina.obligations.bico = { id: 'bico', label: 'Bico', local: { marco: 'job_mercado' }, startHour: 1, endHour: 2 };
    aba.selecionar('obligation', 'bico');
    aba._excluir();
    assert.ok(aba.rotina.obligations.bico);
  });

  test('o último curso não pode ser excluído: sem nenhum, ninguém começa uma partida', () => {
    const { aba, doc: d } = montar({ confirm: true });
    delete aba.rotina.courses.direito;
    aba.selecionar('course', 'medicina');
    aba._excluir();
    assert.ok(aba.rotina.courses.medicina);
    assert.match(d.avisos.at(-1), /único curso/);
  });

  test('a última casa não pode ser excluída: o jogador precisa de onde dormir', () => {
    const { aba, doc: d } = montar({ confirm: true });
    delete aba.rotina.origins.operario;      // tira o dependente
    delete aba.rotina.homes.home_nobre;
    aba.selecionar('home', 'home_operario');
    aba._excluir();
    assert.ok(aba.rotina.homes.home_operario);
    assert.match(d.avisos.at(-1), /única casa/);
  });
});

describe('aba Rotina — o que a lista mostra', () => {
  test('o resumo do compromisso diz horário e lugar, sem abrir o item', () => {
    const { aba } = montar();
    const resumo = aba._resumo('obligation', aba.rotina.obligations.job_mercado);
    assert.match(resumo, /08:00/);
    assert.match(resumo, /14:00/);
    assert.match(resumo, /JOB_MERCADO/);
  });

  test('o resumo do curso mostra o compromisso dele, e acusa quando ele sumiu', () => {
    const { aba } = montar();
    assert.match(aba._resumo('course', aba.rotina.courses.medicina), /Aula na Escola/);
    assert.match(aba._resumo('course', { obligation: 'sumiu' }), /sem compromisso/);
  });

  test('render marca no item a pior gravidade que a conferência achou', () => {
    const { aba } = montar();
    aba.rotina.obligations.job_mercado.npc = 'fantasma';
    const problemas = aba._problemas();
    assert.equal(aba._piorNivel(problemas, 'obligation', 'job_mercado'), 'erro');
    assert.equal(aba._piorNivel(problemas, 'course', 'medicina'), null);
  });
});
