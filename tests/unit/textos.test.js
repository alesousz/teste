import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ESQUEMA, CAMPO_POR_CHAVE, PADROES, GRUPOS, ACONTECIMENTOS, CAIXAS,
  TUTORIAL_PADRAO, DICAS_PADRAO, ABERTURA_PADRAO,
  preencher, criarTexto, normalizarTextos, validarTextos, errosDosTextos,
  serveComoTextos, buracosDe, ondeFica,
} from '../../src/textos.js';
import { TEXTOS, TEXTOS_PROBLEMAS, TEXTOS_SAO_RASCUNHO, LOADING_TIPS, t } from '../../src/data.js';

const publicado = JSON.parse(readFileSync(new URL('../../src/data/textos.json', import.meta.url), 'utf8'));
const de = (problemas, campo, nivel) => problemas.find(p => p.campo === campo && (!nivel || p.nivel === nivel));

describe('preencher: o molde vira frase', () => {
  test('troca os buracos pelos valores', () => {
    assert.equal(preencher('Pegar {item}', { item: 'um café' }), 'Pegar um café');
    assert.equal(preencher('{a} e {b}', { a: 1, b: 2 }), '1 e 2');
  });

  test('buraco que ninguém sabe preencher fica literal — o autor vê o erro na tela', () => {
    assert.equal(preencher('Você pegou: {pessoa}', { item: 'x' }), 'Você pegou: {pessoa}');
  });

  test('valor faltando nunca vira "undefined" na tela', () => {
    assert.doesNotMatch(preencher('Pegar {item}', { item: undefined }), /undefined/);
  });

  test('a variação de gênero é a mesma dos diálogos', () => {
    const molde = 'Oi, {{m:meu filho|f:minha filha|x:meu bem}}.';
    assert.equal(preencher(molde, {}, { sexo: 'f' }), 'Oi, minha filha.');
    assert.equal(preencher(molde, {}, { sexo: 'x' }), 'Oi, meu bem.');
    assert.equal(preencher(molde, {}), 'Oi, meu filho.', 'sexo desconhecido cai no masculino');
  });

  test('buracosDe lê os buracos escritos', () => {
    assert.deepEqual(buracosDe('{a} no meio {b}'), ['a', 'b']);
    assert.deepEqual(buracosDe('sem buraco'), []);
  });
});

describe('normalizar: o que o jogo usa', () => {
  test('arquivo vazio devolve o jogo de fábrica inteiro', () => {
    const n = normalizarTextos({});
    assert.deepEqual(n.recados, PADROES);
    assert.equal(n.tutorial.length, TUTORIAL_PADRAO.length);
    assert.deepEqual(n.dicas, DICAS_PADRAO);
    assert.equal(n.abertura.contato, ABERTURA_PADRAO.contato);
  });

  test('recado em branco cai no de fábrica', () => {
    assert.equal(normalizarTextos({ recados: { 'toast.diario': '   ' } }).recados['toast.diario'], PADROES['toast.diario']);
  });

  test('passo com id que o jogo não conhece é descartado', () => {
    const n = normalizarTextos({ tutorial: [{ id: 'voou', texto: 'oi' }, { id: 'moveu', texto: 'anda' }] });
    assert.deepEqual(n.tutorial.map(p => p.id), ['moveu']);
  });

  test('lista de dicas vazia não explode, e some de vez', () => {
    assert.deepEqual(normalizarTextos({ dicas: [] }).dicas, []);
    assert.deepEqual(normalizarTextos({ dicas: ['  ', ''] }).dicas, []);
  });

  test('espera fora da faixa é presa, e texto vazio some da conversa', () => {
    const n = normalizarTextos({ abertura: { mensagens: [{ id: 'a', espera: 999, texto: 'oi' }, { id: 'b', texto: '' }] } });
    assert.equal(n.abertura.mensagens.length, 1);
    assert.equal(n.abertura.mensagens[0].espera, 120);
  });

  test('chave inventada não entra no jogo', () => {
    assert.equal('nao.existe' in normalizarTextos({ recados: { 'nao.existe': 'oi' } }).recados, false);
  });
});

describe('conferência: o que o autor lê', () => {
  test('escrever a tecla num recado que já ganha a tecla na frente é erro', () => {
    const p = de(validarTextos({ recados: { 'prompt.npc': '{tecla} Falar com {pessoa}' } }), 'prompt.npc', 'erro');
    assert.match(p.mensagem, /já põe a tecla/);
  });

  test('buraco que não existe no recado é erro, e diz quais existem', () => {
    const p = de(validarTextos({ recados: { 'toast.item.pegou': 'Você pegou: {pessoa}' } }), 'toast.item.pegou', 'erro');
    assert.match(p.mensagem, /\{pessoa\}, que não existe aqui/);
    assert.match(p.mensagem, /\{item\}/);
  });

  test('buraco obrigatório faltando é erro', () => {
    const p = de(validarTextos({ recados: { 'toast.item.pegou': 'Você pegou:' } }), 'toast.item.pegou', 'erro');
    assert.match(p.mensagem, /ficou sem \{item\}/);
  });

  test('sinal de < num texto desenhado como marcação é erro', () => {
    const p = de(validarTextos({ recados: { 'vazio.missoes': 'Nada <ainda>' } }), 'vazio.missoes', 'erro');
    assert.match(p.mensagem, /come o resto da frase/);
  });

  test('texto comprido é aviso com o número medido, nunca erro', () => {
    const p = de(validarTextos({ recados: { 'compromisso.agora': 'x'.repeat(40) } }), 'compromisso.agora', 'aviso');
    assert.match(p.mensagem, /40 caracteres/);
    assert.match(p.mensagem, new RegExp(String(CAIXAS.hud.caracteres)));
    assert.equal(errosDosTextos([p]).length, 0);
  });

  test('passo do tutorial que o jogo não emite é erro', () => {
    const p = validarTextos({ tutorial: [{ id: 'abriu_a_janela', texto: 'oi' }] }).find(x => x.nivel === 'erro');
    assert.match(p.mensagem, /"abriu_a_janela" não existe no jogo/);
  });

  test('{tecla} sem ação escolhida é erro', () => {
    const p = validarTextos({ tutorial: [{ id: 'moveu', acao: '', texto: '{tecla} pra andar' }] }).find(x => x.nivel === 'erro');
    assert.match(p.mensagem, /não está ligado a ação nenhuma/);
  });

  test('o passo do celular sem mensagem de abertura trava o tutorial: é erro', () => {
    const p = validarTextos({
      tutorial: [{ id: 'leu_mensagem', acao: 'phone', texto: '{tecla} abre o celular.' }],
      abertura: { mensagens: [] },
    }).find(x => /trava aqui pra sempre/.test(x.mensagem));
    assert.equal(p.nivel, 'erro');
  });

  test('tutorial e dicas vazios são aviso, não erro: o jogo abre normal', () => {
    const semPasso = validarTextos({ tutorial: [] });
    assert.equal(semPasso[0].nivel, 'aviso');
    assert.equal(errosDosTextos(semPasso).length, 0);

    const semDica = validarTextos({ dicas: [] });
    assert.equal(semDica[0].nivel, 'aviso');
    assert.match(semDica[0].mensagem, /única coisa pra ler/);
  });

  test('dica repetida avisa', () => {
    const p = validarTextos({ dicas: ['igual', 'igual'] }).find(x => /duas vezes/.test(x.mensagem));
    assert.equal(p.nivel, 'aviso');
  });

  test('renomear o contato avisa sobre o save antigo', () => {
    const antes = { abertura: { contato: 'Mãe', mensagens: [{ id: 'pais_1', texto: 'a' }] } };
    const p = validarTextos({ abertura: { contato: 'Minha mãe', mensagens: [{ id: 'pais_1', texto: 'a' }] } }, { publicado: antes })
      .find(x => /DUAS conversas/.test(x.mensagem));
    assert.equal(p.nivel, 'aviso');
  });

  test('trocar o id de uma mensagem avisa que ela chega de novo', () => {
    const antes = { abertura: { contato: 'Mãe', mensagens: [{ id: 'pais_1', texto: 'a' }] } };
    const p = validarTextos({ abertura: { contato: 'Mãe', mensagens: [{ id: 'abertura_1', texto: 'a' }] } }, { publicado: antes })
      .find(x => /como se fosse a primeira vez/.test(x.mensagem));
    assert.equal(p.nivel, 'aviso');
  });

  test('id de mensagem repetido é erro: o celular ignora a segunda', () => {
    const p = validarTextos({ abertura: { mensagens: [{ id: 'a', texto: '1' }, { id: 'a', texto: '2' }] } })
      .find(x => x.nivel === 'erro');
    assert.match(p.mensagem, /repetido/);
  });

  test('recado que não existe no jogo é acusado', () => {
    const p = de(validarTextos({ recados: { 'toast.inventado': 'oi' } }), 'toast.inventado', 'erro');
    assert.match(p.mensagem, /não existe no jogo/);
  });
});

describe('esquema e arquivo publicado', () => {
  test('todo campo tem rótulo, onde aparece, grupo conhecido e exemplo pros buracos', () => {
    const grupos = new Set(GRUPOS.map(g => g.id));
    for (const campo of ESQUEMA) {
      assert.ok(campo.rotulo && campo.onde, campo.chave);
      assert.ok(grupos.has(campo.grupo), `${campo.chave}: grupo ${campo.grupo}`);
      assert.ok(ondeFica(campo.chave).includes(campo.rotulo));
      for (const buraco of campo.buracos) {
        assert.ok(buraco in campo.exemplo, `${campo.chave}: falta exemplo pra {${buraco}}`);
      }
      // O padrão de fábrica tem que usar exatamente os buracos declarados.
      assert.deepEqual(buracosDe(campo.padrao).sort(), [...campo.buracos].sort(), campo.chave);
    }
  });

  test('o arquivo publicado está limpo e é o que o jogo está usando', () => {
    assert.deepEqual(validarTextos(publicado, { publicado }), []);
    assert.deepEqual(TEXTOS_PROBLEMAS, []);
    assert.equal(TEXTOS_SAO_RASCUNHO, false, 'em Node o jogo lê sempre o publicado');
  });

  test('toda chave do esquema existe no arquivo, e todo campo do arquivo existe no esquema', () => {
    assert.deepEqual(Object.keys(publicado.recados).sort(), Object.keys(CAMPO_POR_CHAVE).sort());
  });

  test('todo passo publicado aponta pra um acontecimento que o jogo emite', () => {
    const conhecidos = new Set(ACONTECIMENTOS.map(a => a.id));
    for (const passo of publicado.tutorial) assert.ok(conhecidos.has(passo.id), passo.id);
  });

  test('as dicas da tela de carregamento são as do arquivo', () => {
    assert.deepEqual(LOADING_TIPS, publicado.dicas);
  });

  test('o jogo diz as mesmas palavras de antes desta entrega', () => {
    assert.equal(t('prompt.npc', { pessoa: 'Seu Ivo' }), 'Falar com Seu Ivo');
    assert.equal(t('toast.item.pegou', { item: 'um café' }), 'Você pegou: um café');
    assert.equal(t('compromisso.comecou', { compromisso: 'Turno', hora: '14:00' }), 'Começou agora: Turno. Vai até 14:00.');
    assert.equal(t('vazio.celular'), 'Nenhuma mensagem ainda.');
    assert.equal(t('alvo.nome'), 'Boneco de Treino');
  });

  test('criarTexto devolve vazio pra chave que não existe, nunca "undefined"', () => {
    const escrever = criarTexto(TEXTOS);
    assert.equal(escrever('nao.existe'), '');
  });
});

describe('rascunho', () => {
  test('serve como textos quando tem alguma das seções', () => {
    assert.equal(serveComoTextos({ recados: {} }), true);
    assert.equal(serveComoTextos({ dicas: [] }), true);
    assert.equal(serveComoTextos({}), false);
    assert.equal(serveComoTextos([publicado]), false);
    assert.equal(serveComoTextos(null), false);
  });
});
