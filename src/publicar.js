// Publicar o que você escreveu nos editores direto no repositório, sem passar
// por git na mão: cena do mapa, diálogos e missões vão pela API do GitHub e
// viram um commit na branch escolhida.
//
// O token fica SÓ no seu navegador (localStorage desta máquina). Use um token
// de acesso restrito a este repositório, com permissão de escrita em
// "Contents" — e revogue quando quiser, que o editor volta a só baixar arquivo.
//
// A parte pura (montar caminho, corpo e mensagem de erro) não toca a rede:
// é ela que os testes exercitam.

const CHAVE = 'publicacao-github';

export const PADRAO = {
  owner: '',
  repo: '',
  branch: 'claude/rpg-3d-web-game-ez08rs',
  token: '',
};

/** Dono e repositório deduzidos de uma URL do GitHub Pages (usuario.github.io/repo). */
export function repoDaUrl(hostname = '', pathname = '/') {
  const dono = /^([\w-]+)\.github\.io$/i.exec(hostname)?.[1];
  if (!dono) return null;
  const nome = pathname.split('/').filter(Boolean)[0];
  return nome ? { owner: dono, repo: nome } : null;
}

export function configuracao(armazenamento = localStorage, local = typeof location === 'undefined' ? null : location) {
  let salvo = {};
  try {
    salvo = JSON.parse(armazenamento.getItem(CHAVE) || '{}');
  } catch {
    salvo = {};
  }
  const daUrl = local ? repoDaUrl(local.hostname, local.pathname) : null;
  return { ...PADRAO, ...daUrl, ...salvo };
}

export function guardarConfiguracao(cfg, armazenamento = localStorage) {
  armazenamento.setItem(CHAVE, JSON.stringify(cfg));
}

export const estaConfigurado = cfg => !!(cfg.owner && cfg.repo && cfg.branch && cfg.token);

/** Endereço do arquivo na API. `caminho` é relativo à raiz do projeto. */
export function enderecoDoArquivo(cfg, caminho) {
  const limpo = caminho.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${limpo}`;
}

/** Texto em base64, com acento funcionando (btoa sozinho quebra em UTF-8). */
export function paraBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

/** O que dizer pra quem está publicando quando a API recusa. */
export function mensagemDeErro(status, detalhe = '') {
  if (status === 401) return 'O token não foi aceito. Ele pode ter expirado — crie outro e configure de novo.';
  if (status === 403) return 'O token não tem permissão de escrita neste repositório (precisa de Contents: Read and write).';
  if (status === 404) return 'Repositório ou branch não encontrados. Confira o nome do repositório e da branch na configuração.';
  if (status === 409 || status === 422) return 'O arquivo mudou no repositório desde que você abriu o editor. Publique de novo pra continuar de onde ele está.';
  if (status >= 500) return 'O GitHub está fora do ar agora. Tente de novo em alguns minutos.';
  return `Não deu pra publicar (erro ${status})${detalhe ? `: ${detalhe}` : ''}.`;
}

async function pedir(buscar, url, cfg, opcoes = {}) {
  return buscar(url, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...opcoes.headers,
    },
  });
}

/**
 * Grava os arquivos na branch, um commit por arquivo.
 * `arquivos`: [{ caminho, conteudo }]. Devolve { ok, publicados, erro }.
 */
export async function publicarArquivos(arquivos, mensagem, { cfg = configuracao(), buscar = fetch } = {}) {
  if (!estaConfigurado(cfg)) return { ok: false, publicados: [], erro: 'Configure o repositório e o token antes de publicar.' };
  const publicados = [];
  for (const { caminho, conteudo } of arquivos) {
    const url = enderecoDoArquivo(cfg, caminho);
    // O sha do arquivo que já está lá; sem ele o GitHub recusa a sobrescrita.
    const atual = await pedir(buscar, `${url}?ref=${encodeURIComponent(cfg.branch)}`, cfg);
    if (!atual.ok && atual.status !== 404) {
      return { ok: false, publicados, erro: mensagemDeErro(atual.status) };
    }
    const sha = atual.ok ? (await atual.json()).sha : undefined;
    const resposta = await pedir(buscar, url, cfg, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: mensagem,
        content: paraBase64(conteudo),
        branch: cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!resposta.ok) {
      let detalhe = '';
      try {
        detalhe = (await resposta.json()).message ?? '';
      } catch { /* resposta sem json */ }
      return { ok: false, publicados, erro: mensagemDeErro(resposta.status, detalhe) };
    }
    publicados.push(caminho);
  }
  return { ok: true, publicados, erro: null };
}
