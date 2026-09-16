import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  repoDaUrl, configuracao, estaConfigurado, enderecoDoArquivo, paraBase64, mensagemDeErro, publicarArquivos,
} from '../../src/publicar.js';

const armazenamento = (valores = {}) => ({
  getItem: k => valores[k] ?? null,
  setItem: (k, v) => { valores[k] = v; },
  valores,
});

const CFG = { owner: 'alesousz', repo: 'teste', branch: 'minha-branch', token: 'tok_123' };

// fetch de mentira: responde conforme a lista e guarda o que foi pedido.
function fetchFalso(respostas) {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, metodo: opcoes.method ?? 'GET', opcoes });
    const r = respostas.shift() ?? { status: 500 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.corpo ?? {},
    };
  };
  return { buscar, chamadas };
}

describe('configuração de publicação', () => {
  test('deduz dono e repositório de uma URL do GitHub Pages', () => {
    assert.deepEqual(repoDaUrl('alesousz.github.io', '/teste/editor.html'), { owner: 'alesousz', repo: 'teste' });
    assert.equal(repoDaUrl('localhost', '/editor.html'), null);
    assert.equal(repoDaUrl('alesousz.github.io', '/'), null);
  });

  test('o que foi salvo ganha do que veio da URL', () => {
    const cfg = configuracao(
      armazenamento({ 'publicacao-github': JSON.stringify({ repo: 'outro', token: 'x' }) }),
      { hostname: 'alesousz.github.io', pathname: '/teste/' },
    );
    assert.equal(cfg.owner, 'alesousz');
    assert.equal(cfg.repo, 'outro');
    assert.equal(cfg.token, 'x');
  });

  test('configuração quebrada no navegador não derruba o editor', () => {
    const cfg = configuracao(armazenamento({ 'publicacao-github': '{quebrado' }), null);
    assert.equal(estaConfigurado(cfg), false);
  });

  test('só publica com dono, repositório, branch e token', () => {
    assert.equal(estaConfigurado(CFG), true);
    assert.equal(estaConfigurado({ ...CFG, token: '' }), false);
  });
});

describe('endereço e conteúdo', () => {
  test('o caminho do arquivo entra na URL da API, pedaço por pedaço', () => {
    assert.equal(
      enderecoDoArquivo(CFG, 'src/data/scene.js'),
      'https://api.github.com/repos/alesousz/teste/contents/src/data/scene.js',
    );
  });

  test('base64 preserva acento e emoji (btoa sozinho quebraria)', () => {
    const texto = 'Saguão, salão de festas — e a manutenção 🏠';
    assert.equal(Buffer.from(paraBase64(texto), 'base64').toString('utf8'), texto);
  });

  test('cada erro da API vira uma frase que diz o que fazer', () => {
    assert.match(mensagemDeErro(401), /token/i);
    assert.match(mensagemDeErro(403), /permiss/i);
    assert.match(mensagemDeErro(404), /branch/i);
    assert.match(mensagemDeErro(409), /mudou/i);
    assert.match(mensagemDeErro(503), /fora do ar/i);
  });
});

describe('publicarArquivos', () => {
  test('sem configuração, nem tenta ir na rede', async () => {
    const { buscar, chamadas } = fetchFalso([]);
    const r = await publicarArquivos([{ caminho: 'a.js', conteudo: 'x' }], 'msg', { cfg: { ...CFG, token: '' }, buscar });
    assert.equal(r.ok, false);
    assert.equal(chamadas.length, 0);
  });

  test('arquivo que já existe é sobrescrito com o sha dele', async () => {
    const { buscar, chamadas } = fetchFalso([
      { status: 200, corpo: { sha: 'abc123' } },
      { status: 200, corpo: {} },
    ]);
    const r = await publicarArquivos([{ caminho: 'src/data/scene.js', conteudo: 'olá' }], 'Cena nova', { cfg: CFG, buscar });
    assert.deepEqual(r, { ok: true, publicados: ['src/data/scene.js'], erro: null });
    assert.match(chamadas[0].url, /\?ref=minha-branch$/);
    assert.equal(chamadas[1].metodo, 'PUT');
    const corpo = JSON.parse(chamadas[1].opcoes.body);
    assert.equal(corpo.sha, 'abc123');
    assert.equal(corpo.branch, 'minha-branch');
    assert.equal(corpo.message, 'Cena nova');
    assert.equal(Buffer.from(corpo.content, 'base64').toString('utf8'), 'olá');
    assert.equal(chamadas[1].opcoes.headers.Authorization, 'Bearer tok_123');
  });

  test('arquivo que ainda não existe é criado, sem sha', async () => {
    const { buscar, chamadas } = fetchFalso([{ status: 404 }, { status: 201, corpo: {} }]);
    const r = await publicarArquivos([{ caminho: 'novo.json', conteudo: '{}' }], 'msg', { cfg: CFG, buscar });
    assert.equal(r.ok, true);
    assert.equal(JSON.parse(chamadas[1].opcoes.body).sha, undefined);
  });

  test('token recusado para tudo e explica, sem publicar pela metade', async () => {
    const { buscar, chamadas } = fetchFalso([{ status: 401 }]);
    const r = await publicarArquivos(
      [{ caminho: 'a.json', conteudo: '1' }, { caminho: 'b.json', conteudo: '2' }],
      'msg', { cfg: CFG, buscar },
    );
    assert.equal(r.ok, false);
    assert.deepEqual(r.publicados, []);
    assert.match(r.erro, /token/i);
    assert.equal(chamadas.length, 1);
  });

  test('arquivo mudou no repositório: diz pra publicar de novo, e conta o que já foi', async () => {
    const { buscar } = fetchFalso([
      { status: 200, corpo: { sha: 'a' } }, { status: 200, corpo: {} },   // primeiro arquivo vai
      { status: 200, corpo: { sha: 'b' } }, { status: 409, corpo: { message: 'is at' } },
    ]);
    const r = await publicarArquivos(
      [{ caminho: 'a.json', conteudo: '1' }, { caminho: 'b.json', conteudo: '2' }],
      'msg', { cfg: CFG, buscar },
    );
    assert.equal(r.ok, false);
    assert.deepEqual(r.publicados, ['a.json']);
    assert.match(r.erro, /mudou/i);
  });
});
