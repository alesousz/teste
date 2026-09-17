import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLIPES, CLIPE_POR_NOME, ESTADOS, GESTOS, CONJUNTO_DE_FABRICA, ID_PADRAO, EM_LOOP,
  normalizarAnimacoes, validarAnimacoes, errosDasAnimacoes, serveComoAnimacoes,
  clipesDoConjunto, opcoesDeConjunto, idLimpo,
} from '../../src/animacoes.js';
import { ANIMACOES, ANIMACOES_PROBLEMAS, NPC_DEFS, clipesDoPersonagem, usoDosConjuntos } from '../../src/data.js';

const publicado = JSON.parse(readFileSync(new URL('../../src/data/animacoes.json', import.meta.url), 'utf8'));

/** Os nomes de animação que existem de verdade dentro do .glb do pacote. */
function clipesDoArquivo() {
  const b = readFileSync(new URL('../../assets/animations/UAL1_Standard.glb', import.meta.url));
  const tamanho = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + tamanho).toString('utf8'));
  return json.animations.map(a => a.name);
}

const de = (problemas, campo, nivel) => problemas.find(p => p.campo === campo && (!nivel || p.nivel === nivel));

describe('a lista de animações bate com o arquivo', () => {
  test('o editor oferece exatamente as animações que existem no pacote', () => {
    assert.deepEqual(CLIPES.map(c => c.nome).sort(), clipesDoArquivo().sort());
  });

  test('toda animação tem rótulo em português, grupo e tipo', () => {
    for (const c of CLIPES) {
      assert.ok(c.rotulo && c.grupo, c.nome);
      assert.ok([EM_LOOP, 'unica'].includes(c.tipo), c.nome);
      assert.notEqual(c.rotulo, c.nome, `${c.nome} está sem tradução`);
    }
  });

  test('o conjunto de fábrica só cita animação que existe, e é coerente', () => {
    for (const [estado, nome] of Object.entries(CONJUNTO_DE_FABRICA.estados)) {
      assert.ok(CLIPE_POR_NOME[nome], `${estado}: ${nome} não existe`);
      assert.equal(CLIPE_POR_NOME[nome].tipo, EM_LOOP, `${estado} precisa de animação que repete`);
    }
    for (const [gesto, nome] of Object.entries(CONJUNTO_DE_FABRICA.gestos)) {
      assert.ok(CLIPE_POR_NOME[nome], `${gesto}: ${nome} não existe`);
      assert.notEqual(CLIPE_POR_NOME[nome].tipo, EM_LOOP, `${gesto} não pode ser animação que repete`);
    }
    assert.deepEqual(Object.keys(CONJUNTO_DE_FABRICA.estados).sort(), ESTADOS.map(e => e.chave).sort());
    assert.deepEqual(Object.keys(CONJUNTO_DE_FABRICA.gestos).sort(), GESTOS.map(g => g.chave).sort());
  });
});

describe('normalizar: o que o jogo usa', () => {
  test('arquivo vazio ainda dá um conjunto inteiro — ninguém fica sem animação', () => {
    const a = normalizarAnimacoes({});
    assert.deepEqual(Object.keys(a.conjuntos), [ID_PADRAO]);
    assert.deepEqual(a.conjuntos[ID_PADRAO].estados, CONJUNTO_DE_FABRICA.estados);
    assert.equal(a.padrao, ID_PADRAO);
  });

  test('animação inventada num campo cai na de fábrica, sem derrubar o resto', () => {
    const a = normalizarAnimacoes({
      conjuntos: { teste: { label: 'T', estados: { walk: 'Voando_Loop', run: 'Jog_Fwd_Loop' } } },
    });
    assert.equal(a.conjuntos.teste.estados.walk, CONJUNTO_DE_FABRICA.estados.walk);
    assert.equal(a.conjuntos.teste.estados.run, 'Jog_Fwd_Loop', 'o campo bom é preservado');
    assert.equal(a.conjuntos.teste.gestos.attack, CONJUNTO_DE_FABRICA.gestos.attack, 'gesto esquecido vem de fábrica');
  });

  test('id com espaço e maiúscula é limpo, e o conjunto continua achável', () => {
    const a = normalizarAnimacoes({ conjuntos: { 'Meu Jeito': { label: 'Meu Jeito' } } });
    assert.ok(a.conjuntos.meu_jeito);
    assert.equal(idLimpo('Meu Jeito'), 'meu_jeito');
  });

  test('padrão que aponta pro vazio volta pro normal', () => {
    const a = normalizarAnimacoes({ padrao: 'sumiu', conjuntos: { normal: {} } });
    assert.equal(a.padrao, ID_PADRAO);
  });

  test('personagem sem conjunto, ou com conjunto apagado, usa o padrão', () => {
    const a = normalizarAnimacoes(publicado);
    assert.equal(clipesDoConjunto(a, null).id, a.padrao);
    assert.equal(clipesDoConjunto(a, 'ja_foi_apagado').id, a.padrao);
    assert.equal(clipesDoConjunto(a, 'apressado').estados.walk, 'Jog_Fwd_Loop');
  });
});

describe('conferência: o que o autor lê', () => {
  test('animação que repete num gesto é erro — o personagem entraria e nunca voltaria', () => {
    const p = de(validarAnimacoes({ conjuntos: { x: { gestos: { attack: 'Dance_Loop' } } } }), 'attack', 'erro');
    assert.match(p.mensagem, /nunca volta a andar/);
  });

  test('animação que termina num estado é aviso — ele congela na última pose', () => {
    const p = de(validarAnimacoes({ conjuntos: { x: { estados: { walk: 'Interact' } } } }), 'walk', 'aviso');
    assert.match(p.mensagem, /congela/);
  });

  test('animação que não está no pacote é erro, no campo certo', () => {
    const p = de(validarAnimacoes({ conjuntos: { x: { estados: { idle: 'Nao_Existe' } } } }), 'idle', 'erro');
    assert.match(p.mensagem, /não está no pacote/);
    assert.equal(p.onde, 'conjunto x');
  });

  test('personagem apontando pra conjunto que não existe é erro, com o nome dele', () => {
    const usados = new Map([['manco', ['Dona Rosa', 'Seu Ivo']]]);
    const problemas = validarAnimacoes(publicado, { usados });
    const p = problemas.find(x => x.nivel === 'erro');
    assert.match(p.mensagem, /Dona Rosa, Seu Ivo/);
    assert.match(p.mensagem, /"manco", que não existe/);
  });

  test('conjunto que ninguém usa só é apontado no editor, não no jogo', () => {
    const semUso = validarAnimacoes(publicado, { usados: new Map(), conferirUso: true });
    assert.ok(semUso.some(p => /Ninguém usa/.test(p.mensagem)));
    assert.deepEqual(validarAnimacoes(publicado, { usados: new Map() }), []);
  });

  test('errosDasAnimacoes separa o que quebra do que é só estranho', () => {
    const problemas = validarAnimacoes({ conjuntos: { x: { gestos: { attack: 'Dance_Loop' }, estados: { walk: 'Interact' } } } });
    assert.equal(errosDasAnimacoes(problemas).length, 1);
    assert.ok(problemas.length > 1);
  });

  test('arquivo sem conjunto nenhum é erro', () => {
    assert.match(validarAnimacoes({ conjuntos: {} })[0].mensagem, /Não existe nenhum conjunto/);
  });
});

describe('o arquivo publicado e o jogo', () => {
  test('o publicado está limpo, com os personagens que apontam pra ele', () => {
    assert.deepEqual(validarAnimacoes(publicado, { usados: usoDosConjuntos(), conferirUso: true }), []);
    assert.deepEqual(ANIMACOES_PROBLEMAS, []);
  });

  test('os NPCs da cena escolhem conjunto, e quem não escolheu cai no padrão', () => {
    const porId = Object.fromEntries(NPC_DEFS.map(n => [n.id, n]));
    assert.equal(porId.runner.animacoes, 'apressado');
    assert.equal(porId.mae_nobre.animacoes, 'formal');
    assert.equal(porId.almeida.animacoes, ANIMACOES.padrao);
  });

  test('o jeito de andar de cada um é mesmo diferente', () => {
    assert.equal(clipesDoPersonagem('apressado').estados.walk, 'Jog_Fwd_Loop');
    assert.equal(clipesDoPersonagem('formal').estados.walk, 'Walk_Formal_Loop');
    assert.equal(clipesDoPersonagem(ANIMACOES.padrao).estados.walk, 'Walk_Loop');
  });

  test('todo conjunto publicado tem os sete estados e os quatro gestos', () => {
    for (const c of Object.values(ANIMACOES.conjuntos)) {
      assert.deepEqual(Object.keys(c.estados).sort(), ESTADOS.map(e => e.chave).sort(), c.id);
      assert.deepEqual(Object.keys(c.gestos).sort(), GESTOS.map(g => g.chave).sort(), c.id);
    }
  });

  test('as opções do select saem dos conjuntos que existem', () => {
    assert.deepEqual(opcoesDeConjunto(ANIMACOES).map(o => o.value).sort(), ['apressado', 'formal', 'normal']);
  });
});

describe('rascunho', () => {
  test('serve como animações só com conjunto de verdade dentro', () => {
    assert.equal(serveComoAnimacoes(publicado), true);
    assert.equal(serveComoAnimacoes({ conjuntos: { x: { estados: {} } } }), true);
    assert.equal(serveComoAnimacoes({ conjuntos: {} }), false);
    assert.equal(serveComoAnimacoes({ conjuntos: { x: 'errado' } }), false);
    assert.equal(serveComoAnimacoes(null), false);
  });
});
