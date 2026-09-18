// Aba Textos do editor de conteúdo: a voz do jogo. O que se escreve aqui
// vira src/data/textos.json.
//
// Como a aba Regras, o formulário inteiro nasce do ESQUEMA de src/textos.js —
// recado novo no jogo entra no esquema e aparece aqui sozinho. E como lá, o
// campo não mostra só a caixa de texto: mostra a PRÉVIA montada, com a parte
// que o código põe (a tecla e o travessão) em cinza travado. É a prévia que
// ensina o contrato sem precisar explicá-lo.
//
// Três listas livres convivem com os campos fixos: as dicas do tutorial, as
// dicas da tela de carregamento e a conversa que abre o jogo. As duas
// primeiras seções ficam lado a lado de propósito: o passo do celular só se
// cumpre se alguma mensagem chegar, e essa dependência precisa estar à vista.

import {
  ESQUEMA, GRUPOS, PADROES, ACONTECIMENTOS, CAMPO_POR_CHAVE,
  TUTORIAL_PADRAO, DICAS_PADRAO, ABERTURA_PADRAO,
  preencher, validarTextos, ondeFica, buracosDe,
} from '../textos.js';

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Uma dica de tutorial nova nasce no primeiro acontecimento ainda livre. */
const PASSO_NOVO = usados => {
  const livre = ACONTECIMENTOS.find(a => !usados.includes(a.id)) ?? ACONTECIMENTOS[0];
  return { id: livre.id, acao: '', texto: '' };
};

export class AbaTextos {
  /**
   * `teclas` são as ações remapeáveis que existem no jogo (KEYBIND_ACTIONS),
   * pro dropdown do tutorial e pra prévia mostrar a tecla certa.
   * `publicado` é o arquivo no ar — é comparando com ele que dá pra avisar
   * sobre id de mensagem trocado, que só aparece em save antigo.
   */
  constructor({ teclas = [], rotuloDaTecla = a => a, publicado = null, aoSalvar = () => {}, doc = document } = {}) {
    this.teclas = teclas;
    this.rotuloDaTecla = rotuloDaTecla;
    this.publicado = publicado;
    this.aoSalvar = aoSalvar;
    this.doc = doc;
    this.textos = null;
    this.destaque = null;
  }

  definir(textos) {
    const lido = textos && typeof textos === 'object' ? textos : {};
    // Guarda o que foi lido, não o normalizado: o autor precisa ver o que ele
    // escreveu (inclusive o errado), com o aviso do lado.
    this.textos = {
      recados: { ...PADROES, ...(lido.recados ?? {}) },
      tutorial: Array.isArray(lido.tutorial) ? structuredClone(lido.tutorial) : structuredClone(TUTORIAL_PADRAO),
      dicas: Array.isArray(lido.dicas) ? [...lido.dicas] : [...DICAS_PADRAO],
      abertura: {
        contato: lido.abertura?.contato ?? ABERTURA_PADRAO.contato,
        mensagens: Array.isArray(lido.abertura?.mensagens)
          ? structuredClone(lido.abertura.mensagens)
          : structuredClone(ABERTURA_PADRAO.mensagens),
      },
    };
    this.publicado ??= structuredClone(this.textos);
    this.render();
  }

  _problemas() {
    return validarTextos(this.textos, {
      publicado: this.publicado,
      acoesDeTecla: new Set(this.teclas.map(t => t.id)),
    });
  }

  _salvar() {
    this.aoSalvar(this.textos);
  }

  // --- Desenho -------------------------------------------------------------

  render() {
    if (!this.textos) return;
    const painel = this.doc.getElementById('textos-panel');
    if (painel) {
      painel.innerHTML = this._primeirosMinutosHtml()
        + this._dicasHtml()
        + GRUPOS.filter(g => ['acao', 'compromisso', 'vazio'].includes(g.id)).map(g => this._grupoHtml(g)).join('');
      this._ligar();
    }
    this._renderProblemas(this._problemas());
  }

  /** Seção 1: a conversa de abertura e o tutorial, lado a lado. */
  _primeirosMinutosHtml() {
    const a = this.textos.abertura;
    const usados = this.textos.tutorial.map(p => p?.id);
    return `
      <section class="textos-grupo textos-largo">
        <h3>Os primeiros minutos</h3>
        <p class="hint">Os dois andam juntos: o passo do celular só se cumpre quando o jogador lê uma mensagem — se a conversa ficar vazia, o tutorial trava ali.</p>
        <div class="textos-lado-a-lado">
          <div>
            <h4>A conversa que abre o jogo</h4>
            <label class="field">Quem manda
              <input type="text" data-abertura="contato" value="${escapeHtml(a.contato)}" />
            </label>
            <p class="hint">Trocar este nome depois de publicar deixa duas conversas no celular de quem já tem jogo salvo.</p>
            ${a.mensagens.map((m, i) => `
              <div class="textos-mensagem" data-msg="${i}">
                <div class="textos-mensagem-topo">
                  <input type="number" step="0.5" min="0" data-msg-campo="espera" value="${Number.isFinite(m.espera) ? m.espera : 5}" title="Segundos de espera antes de chegar" />
                  <span class="hint">s depois da anterior</span>
                  <button class="btn-secondary" data-msg-acao="remover" title="Remover">✕</button>
                </div>
                <textarea rows="2" data-msg-campo="texto">${escapeHtml(m.texto ?? '')}</textarea>
                <p class="hint">id: <code>${escapeHtml(m.id ?? '')}</code> — não mexa nele se for só o texto que mudou.</p>
              </div>`).join('')}
            <button class="btn-secondary" data-msg-acao="nova">+ Nova mensagem</button>
          </div>
          <div>
            <h4>As dicas do tutorial</h4>
            <p class="hint">Escreva <code>{tecla}</code> onde a tecla deve entrar: assim ela continua certa quando o jogador remapear.</p>
            ${this.textos.tutorial.map((p, i) => this._passoHtml(p, i, usados)).join('')}
            <button class="btn-secondary" data-passo-acao="novo">+ Nova dica</button>
          </div>
        </div>
      </section>`;
  }

  _passoHtml(passo, i, usados) {
    const p = passo && typeof passo === 'object' ? passo : {};
    const acontecimento = ACONTECIMENTOS.find(a => a.id === p.id);
    const opcoesDeTecla = [
      `<option value=""${!p.acao ? ' selected' : ''}>— sem tecla —</option>`,
      ...this.teclas.map(t => `<option value="${escapeHtml(t.id)}"${t.id === p.acao ? ' selected' : ''}>${escapeHtml(t.label)} (${escapeHtml(this.rotuloDaTecla(t.id))})</option>`),
      `<option value="phone"${p.acao === 'phone' ? ' selected' : ''}>Celular (tecla fixa, M)</option>`,
    ].join('');
    return `
      <div class="textos-passo" data-passo="${i}">
        <div class="textos-passo-topo">
          <select data-passo-campo="id">
            ${ACONTECIMENTOS.map(a => `<option value="${a.id}"${a.id === p.id ? ' selected' : ''}>${escapeHtml(a.rotulo)}</option>`).join('')}
            ${p.id && !acontecimento ? `<option value="${escapeHtml(p.id)}" selected>⛔ ${escapeHtml(p.id)} (não existe)</option>` : ''}
          </select>
          <button class="btn-secondary" data-passo-acao="subir" title="Subir"${i === 0 ? ' disabled' : ''}>↑</button>
          <button class="btn-secondary" data-passo-acao="remover" title="Remover">✕</button>
        </div>
        <textarea rows="2" data-passo-campo="texto">${escapeHtml(p.texto ?? '')}</textarea>
        <select data-passo-campo="acao">${opcoesDeTecla}</select>
        <p class="textos-previa">${escapeHtml(String(p.texto ?? '').replace(/\{tecla\}/g, this.rotuloDaTecla(p.acao) || '—'))}</p>
      </div>`;
  }

  /** Seção 2: as dicas da tela de carregamento. */
  _dicasHtml() {
    const d = this.textos.dicas;
    return `
      <section class="textos-grupo textos-largo">
        <h3>A tela de carregamento</h3>
        <p class="hint">${d.length} dica(s) · cada uma fica 6 s na tela, em ordem sorteada. É a única coisa pra ler enquanto o jogo abre.</p>
        ${d.map((dica, i) => `
          <div class="textos-dica" data-dica="${i}">
            <textarea rows="2" data-dica-campo="texto">${escapeHtml(dica ?? '')}</textarea>
            <button class="btn-secondary" data-dica-acao="remover" title="Remover">✕</button>
          </div>`).join('')}
        <button class="btn-secondary" data-dica-acao="nova">+ Nova dica</button>
      </section>`;
  }

  _grupoHtml(grupo) {
    const campos = ESQUEMA.filter(c => c.grupo === grupo.id);
    if (!campos.length) return '';
    const nota = grupo.id === 'compromisso'
      ? '<p class="hint">O aviso da penúltima falta e a despedida ao perder a vaga são de cada compromisso, e ficam na aba Rotina.</p>'
      : '';
    return `
      <section class="textos-grupo">
        <h3>${escapeHtml(grupo.rotulo)}</h3>
        ${nota}
        ${campos.map(c => this._campoHtml(c)).join('')}
      </section>`;
  }

  _campoHtml(campo) {
    const valor = this.textos.recados[campo.chave] ?? '';
    const noPadrao = valor === campo.padrao;
    const tecla = campo.tecla ? (this.rotuloDaTecla(campo.tecla) || '—') : '';
    const previa = preencher(valor, campo.exemplo);
    return `
      <div class="textos-campo${this.destaque === campo.chave ? ' destacado' : ''}" data-campo="${campo.chave}">
        <div class="textos-campo-topo">
          <label>${escapeHtml(campo.rotulo)}</label>
          <button class="btn-secondary textos-padrao" data-padrao="${campo.chave}" ${noPadrao ? 'disabled' : ''}
                  title="Voltar ao texto de fábrica">padrão</button>
        </div>
        <textarea rows="2" data-recado="${campo.chave}">${escapeHtml(valor)}</textarea>
        ${campo.buracos.length ? `<p class="textos-buracos">${campo.buracos.map(b => `<button class="textos-buraco" data-inserir="${b}" data-em="${campo.chave}">{${b}}</button>`).join('')}</p>` : ''}
        <p class="hint">${escapeHtml(campo.onde)}</p>
        <p class="textos-previa" data-previa="${campo.chave}">${tecla ? `<span class="textos-travado">${escapeHtml(tecla)} — </span>` : ''}${escapeHtml(previa)}</p>
      </div>`;
  }

  // --- Ligações -------------------------------------------------------------

  _ligar() {
    const painel = this.doc.getElementById('textos-panel');
    if (!painel) return;
    const mudou = () => { this._salvar(); this.render(); };
    const mudouSemRedesenhar = () => { this._salvar(); this._renderProblemas(this._problemas()); };

    for (const el of painel.querySelectorAll('[data-recado]')) {
      el.addEventListener('input', () => {
        const chave = el.dataset.recado;
        this.textos.recados[chave] = el.value;
        const previa = painel.querySelector(`[data-previa="${chave}"]`);
        if (previa) {
          const campo = CAMPO_POR_CHAVE[chave];
          const tecla = campo?.tecla ? (this.rotuloDaTecla(campo.tecla) || '—') : '';
          previa.innerHTML = `${tecla ? `<span class="textos-travado">${escapeHtml(tecla)} — </span>` : ''}${escapeHtml(preencher(el.value, campo?.exemplo))}`;
        }
        // O botão "padrão" acompanha a digitação: esperar o campo perder o
        // foco pra ele acender deixaria o autor achando que não dá pra desfazer.
        const botao = painel.querySelector(`[data-padrao="${chave}"]`);
        if (botao) botao.disabled = el.value === PADROES[chave];
        mudouSemRedesenhar();
      });
      // Sem redesenhar no change: o change dispara quando o campo perde o
      // foco, e um redesenho ali destroi o botao entre o apertar e o soltar do
      // mouse — o clique nunca chega. Quem precisa redesenhar e o select.
    }

    for (const el of painel.querySelectorAll('[data-padrao]')) {
      el.onclick = () => this.voltarAoPadrao(el.dataset.padrao);
    }

    // Ficha de buraco: põe {item} no fim do texto, pra ninguém ter que
    // decorar quais existem em cada recado.
    for (const el of painel.querySelectorAll('[data-inserir]')) {
      el.onclick = () => {
        const chave = el.dataset.em;
        this.textos.recados[chave] = `${this.textos.recados[chave] ?? ''}{${el.dataset.inserir}}`;
        mudou();
      };
    }

    // --- tutorial ---
    for (const el of painel.querySelectorAll('[data-passo-campo]')) {
      const i = Number(el.closest('[data-passo]').dataset.passo);
      const campo = el.dataset.passoCampo;
      const aplicar = () => {
        const p = this.textos.tutorial[i];
        if (!p) return;
        p[campo] = el.value;
        mudouSemRedesenhar();
      };
      el.addEventListener('input', aplicar);
      // Só o select redesenha: trocar o acontecimento muda a prévia inteira.
      if (el.tagName === 'SELECT') el.addEventListener('change', () => { aplicar(); this.render(); });
    }
    for (const el of painel.querySelectorAll('[data-passo-acao]')) {
      const linha = el.closest('[data-passo]');
      const i = linha ? Number(linha.dataset.passo) : -1;
      el.onclick = () => {
        const acao = el.dataset.passoAcao;
        if (acao === 'novo') this.textos.tutorial.push(PASSO_NOVO(this.textos.tutorial.map(p => p?.id)));
        if (acao === 'remover') this.textos.tutorial.splice(i, 1);
        if (acao === 'subir' && i > 0) {
          [this.textos.tutorial[i - 1], this.textos.tutorial[i]] = [this.textos.tutorial[i], this.textos.tutorial[i - 1]];
        }
        mudou();
      };
    }

    // --- dicas ---
    for (const el of painel.querySelectorAll('[data-dica-campo]')) {
      const i = Number(el.closest('[data-dica]').dataset.dica);
      el.addEventListener('input', () => { this.textos.dicas[i] = el.value; mudouSemRedesenhar(); });
    }
    for (const el of painel.querySelectorAll('[data-dica-acao]')) {
      const linha = el.closest('[data-dica]');
      const i = linha ? Number(linha.dataset.dica) : -1;
      el.onclick = () => {
        if (el.dataset.dicaAcao === 'nova') this.textos.dicas.push('');
        if (el.dataset.dicaAcao === 'remover') this.textos.dicas.splice(i, 1);
        mudou();
      };
    }

    // --- conversa de abertura ---
    const contato = painel.querySelector('[data-abertura="contato"]');
    if (contato) {
      contato.addEventListener('input', () => { this.textos.abertura.contato = contato.value; mudouSemRedesenhar(); });

    }
    for (const el of painel.querySelectorAll('[data-msg-campo]')) {
      const i = Number(el.closest('[data-msg]').dataset.msg);
      const campo = el.dataset.msgCampo;
      const aplicar = () => {
        const m = this.textos.abertura.mensagens[i];
        if (!m) return;
        m[campo] = campo === 'espera' ? Number(el.value) : el.value;
        mudouSemRedesenhar();
      };
      el.addEventListener('input', aplicar);
    }
    for (const el of painel.querySelectorAll('[data-msg-acao]')) {
      const linha = el.closest('[data-msg]');
      const i = linha ? Number(linha.dataset.msg) : -1;
      el.onclick = () => {
        if (el.dataset.msgAcao === 'nova') {
          this.textos.abertura.mensagens.push({ id: this._idLivre(), espera: 5, texto: '' });
        }
        if (el.dataset.msgAcao === 'remover') this.textos.abertura.mensagens.splice(i, 1);
        mudou();
      };
    }
  }

  _idLivre() {
    const usados = new Set(this.textos.abertura.mensagens.map(m => m?.id));
    for (let i = 1; i < 100; i++) if (!usados.has(`msg_${i}`)) return `msg_${i}`;
    return `msg_${usados.size + 1}`;
  }

  /** Devolve um recado ao texto de fábrica. */
  voltarAoPadrao(chave) {
    if (!(chave in PADROES)) return false;
    this.textos.recados[chave] = PADROES[chave];
    this._salvar();
    this.render();
    return true;
  }

  // --- Conferência ---------------------------------------------------------

  _renderProblemas(problemas) {
    const caixa = this.doc.getElementById('textos-problemas');
    if (!caixa) return;
    if (!problemas.length) {
      caixa.innerHTML = '<p class="tudo-certo">Tudo certo: nenhum erro nem aviso.</p>';
      this._marcarCampos([]);
      return;
    }
    const ordem = { erro: 0, aviso: 1 };
    const ordenados = [...problemas].sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
    caixa.innerHTML = ordenados.map((p, i) => `
      <button class="problema ${p.nivel}" data-i="${i}">
        <span class="problema-onde">${escapeHtml(p.onde)}</span>
        ${escapeHtml(p.mensagem)}
      </button>`).join('');
    for (const el of caixa.querySelectorAll('.problema')) {
      const p = ordenados[Number(el.dataset.i)];
      el.onclick = () => this.apontar(p.campo);
    }
    this._marcarCampos(ordenados);
  }

  _marcarCampos(problemas) {
    const painel = this.doc.getElementById('textos-panel');
    if (!painel) return;
    const pior = {};
    for (const p of problemas) if (!pior[p.campo] || p.nivel === 'erro') pior[p.campo] = p.nivel;
    for (const el of painel.querySelectorAll('.textos-campo')) {
      const nivel = pior[el.dataset.campo];
      el.classList.toggle('campo-com-erro', nivel === 'erro');
      el.classList.toggle('campo-com-aviso', nivel === 'aviso');
    }
  }

  apontar(chave) {
    this.destaque = chave;
    const painel = this.doc.getElementById('textos-panel');
    const alvo = painel?.querySelector(`[data-recado="${chave}"]`);
    alvo?.focus?.();
    alvo?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }
}

export { ondeFica, buracosDe };
