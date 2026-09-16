// A janelinha de publicar, compartilhada pelos dois editores: pede repositório,
// branch e token na primeira vez, guarda no navegador e mostra como foi.
//
// Sem framework e com estilo embutido de propósito: as duas páginas têm CSS
// próprio, e isto precisa aparecer igual nas duas.
import { configuracao, guardarConfiguracao, estaConfigurado, publicarArquivos } from './publicar.js';

const CAIXA = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;'
  + 'justify-content:center;z-index:999;font-family:system-ui,sans-serif;';
const PAINEL = 'background:#14161c;color:#e9ecf1;border:1px solid rgba(255,255,255,0.15);border-radius:10px;'
  + 'padding:20px;width:min(460px,92vw);display:flex;flex-direction:column;gap:10px;';
const CAMPO = 'padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);'
  + 'background:rgba(255,255,255,0.06);color:#eee;font-size:0.9em;';

function linha(rotulo, id, valor, tipo = 'text', dica = '') {
  return `<label style="display:flex;flex-direction:column;gap:4px;font-size:0.82em;color:#cfd3da;">
    ${rotulo}
    <input id="${id}" type="${tipo}" value="${String(valor).replace(/"/g, '&quot;')}" style="${CAMPO}" />
    ${dica ? `<span style="font-size:0.85em;color:#8992a0;">${dica}</span>` : ''}
  </label>`;
}

/** Abre a configuração. Resolve com a config salva, ou null se cancelou. */
export function abrirConfiguracao() {
  const cfg = configuracao();
  return new Promise(resolve => {
    const fundo = document.createElement('div');
    fundo.style.cssText = CAIXA;
    fundo.innerHTML = `<div style="${PAINEL}">
      <h2 style="margin:0;font-size:1.05em;color:#ffd98a;">Publicar no GitHub</h2>
      <p style="margin:0;font-size:0.82em;color:#8992a0;line-height:1.5;">
        O token fica guardado só neste navegador e vai direto pro GitHub, mais ninguém.
        Use um token de acesso restrito a este repositório, com Contents: Read and write.
      </p>
      ${linha('Dono (usuário ou organização)', 'pub-owner', cfg.owner)}
      ${linha('Repositório', 'pub-repo', cfg.repo)}
      ${linha('Branch', 'pub-branch', cfg.branch, 'text', 'O site do GitHub Pages só muda quando esta branch entra no main.')}
      ${linha('Token', 'pub-token', cfg.token, 'password', 'Deixe em branco pra apagar o token guardado.')}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
        <button id="pub-cancelar" style="${CAMPO};cursor:pointer;">Cancelar</button>
        <button id="pub-salvar" style="${CAMPO};background:#ffd98a;color:#1a1206;font-weight:600;cursor:pointer;">Salvar</button>
      </div>
    </div>`;
    document.body.appendChild(fundo);
    const fechar = valor => { fundo.remove(); resolve(valor); };
    fundo.querySelector('#pub-cancelar').onclick = () => fechar(null);
    fundo.querySelector('#pub-salvar').onclick = () => {
      const novo = {
        owner: fundo.querySelector('#pub-owner').value.trim(),
        repo: fundo.querySelector('#pub-repo').value.trim(),
        branch: fundo.querySelector('#pub-branch').value.trim(),
        token: fundo.querySelector('#pub-token').value.trim(),
      };
      guardarConfiguracao(novo);
      fechar(novo);
    };
    fundo.onclick = e => { if (e.target === fundo) fechar(null); };
    fundo.querySelector('#pub-token').focus();
  });
}

/**
 * Publica os arquivos, pedindo a configuração se ainda não tiver.
 * `avisar(texto, ok)` mostra o andamento na página de quem chamou.
 */
export async function publicarConteudo(arquivos, mensagem, avisar = texto => alert(texto)) {
  let cfg = configuracao();
  if (!estaConfigurado(cfg)) {
    cfg = await abrirConfiguracao();
    if (!cfg || !estaConfigurado(cfg)) {
      avisar('Publicação cancelada: falta repositório, branch ou token.', false);
      return { ok: false, publicados: [], erro: 'sem configuração' };
    }
  }
  avisar(`Publicando em ${cfg.owner}/${cfg.repo} (${cfg.branch})...`, true);
  const r = await publicarArquivos(arquivos, mensagem, { cfg });
  if (r.ok) avisar(`Publicado: ${r.publicados.join(', ')}. O site atualiza quando a branch entrar no main.`, true);
  else avisar(r.erro, false);
  return r;
}
