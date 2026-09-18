// Aba Animações do editor de conteúdo: monta os conjuntos de animação que os
// personagens usam. O que se escreve aqui vira src/data/animacoes.json.
//
// A aba é feita em cima de uma ideia só: ninguém escolhe animação lendo nome
// numa lista. Então a biblioteca de clipes fica sempre à vista, clicar num
// clipe toca ele no boneco, e só depois de ver é que ele entra no campo.
//
// Sem three aqui de propósito: a prévia 3D mora em previaDeAnimacao.js e
// chega por injeção. Assim esta aba — que é onde moram as decisões sobre o
// arquivo — roda nos testes em Node com uma prévia de mentira.

import {
  CLIPES, CLIPE_POR_NOME, GRUPOS_DE_CLIPE, ESTADOS, GESTOS,
  CONJUNTO_DE_FABRICA, ID_PADRAO, EM_LOOP,
  idLimpo, normalizarAnimacoes, validarAnimacoes,
} from '../animacoes.js';

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SECOES = [
  { id: 'estados', titulo: 'Como ele se mexe', campos: ESTADOS, dica: 'Ficam repetindo enquanto durarem — por isso pedem animação que repete.' },
  { id: 'gestos', titulo: 'O que ele faz de vez em quando', campos: GESTOS, dica: 'Tocam uma vez e devolvem o controle — por isso pedem animação que termina.' },
];

export class AbaAnimacoes {
  /**
   * `npcs` é quem existe na cena (vindo de data.js), pra mostrar quem usa
   * cada conjunto. `previa` é o boneco 3D; sem ela a aba funciona igual, só
   * não mostra nada se mexendo.
   */
  constructor({ npcs = [], usosExtras = () => [], aoSalvar = () => {}, doc = document, previa = null } = {}) {
    this.npcs = npcs;
    // Quem mais cita um conjunto além da peça do NPC — hoje, as paradas da
    // agenda (aba Rotina). Sem isso a aba acusaria de "ninguém usa" um
    // conjunto que só a agenda pede.
    this.usosExtras = usosExtras;
    this.aoSalvar = aoSalvar;
    this.doc = doc;
    this.previa = previa;
    this.animacoes = null;
    this.sel = null;              // id do conjunto aberto
    this.foco = null;             // { secao, chave } — onde o clipe escolhido entra
    this.tocando = null;          // nome do clipe na prévia
  }

  definir(animacoes) {
    this.animacoes = normalizarAnimacoes(animacoes);
    this.sel = this.animacoes.conjuntos[this.animacoes.padrao] ? this.animacoes.padrao : Object.keys(this.animacoes.conjuntos)[0];
    this.foco = null;
    this.render();
  }

  definirPrevia(previa) {
    this.previa = previa;
    if (this.tocando) this.previa?.tocar(this.tocando);
  }

  _conjunto() {
    return this.animacoes?.conjuntos[this.sel] ?? null;
  }

  _salvar() {
    this.aoSalvar(this.animacoes);
  }

  /** Quem cita cada conjunto: a peça de cada NPC e as paradas das agendas. */
  _usoPorConjunto() {
    const uso = new Map();
    const anotar = (conjunto, quem) => {
      const id = idLimpo(conjunto);
      if (!id) return;
      if (!uso.has(id)) uso.set(id, []);
      if (!uso.get(id).includes(quem)) uso.get(id).push(quem);
    };
    for (const npc of this.npcs) anotar(npc.animacoes || this.animacoes?.padrao || ID_PADRAO, npc.name || npc.id);
    for (const extra of this.usosExtras()) anotar(extra.conjunto, extra.quem);
    return uso;
  }

  _problemas() {
    return validarAnimacoes(this.animacoes, { usados: this._usoPorConjunto(), conferirUso: true });
  }

  // --- Desenho -------------------------------------------------------------

  render() {
    if (!this.animacoes) return;
    this._renderLista();
    this._renderCorpo();
    this._renderBiblioteca();
    this._renderProblemas(this._problemas());
    this._renderUsar();
  }

  _renderLista() {
    const lista = this.doc.getElementById('animacoes-lista');
    if (!lista) return;
    const uso = this._usoPorConjunto();
    lista.innerHTML = Object.values(this.animacoes.conjuntos).map(c => `
      <div class="quest-item ${c.id === this.sel ? 'selected' : ''}" data-id="${c.id}">
        <strong>${escapeHtml(c.label || c.id)}</strong>
        <span class="hint">${c.id === this.animacoes.padrao ? 'padrão · ' : ''}${(uso.get(c.id) || []).length} personagem(ns)</span>
      </div>`).join('');
    for (const el of lista.querySelectorAll('.quest-item')) {
      el.onclick = () => this.selecionar(el.dataset.id);
    }

    const quemUsa = this.doc.getElementById('animacoes-uso');
    if (quemUsa) {
      const nomes = uso.get(this.sel) || [];
      quemUsa.innerHTML = nomes.length
        ? `<p class="hint">${nomes.map(escapeHtml).join(', ')}</p>`
        : '<p class="hint">Ninguém ainda. Escolha este conjunto na peça do NPC, no editor de mapa, ou troque pra ele num diálogo.</p>';
    }
  }

  _renderCorpo() {
    const corpo = this.doc.getElementById('animacoes-editor-body');
    const titulo = this.doc.getElementById('editing-animacao-id');
    const c = this._conjunto();
    if (titulo) titulo.textContent = c ? (c.label || c.id) : '—';
    if (!corpo) return;
    if (!c) { corpo.innerHTML = '<p class="hint">Escolha um conjunto na lista.</p>'; return; }

    corpo.innerHTML = `
      <label class="field">Nome<input type="text" data-act="anim-label" value="${escapeHtml(c.label)}" /></label>
      <p class="hint">Id citado pelo resto do jogo: <code>${escapeHtml(c.id)}</code></p>
      ${SECOES.map(secao => `
        <section class="anim-secao">
          <h3>${escapeHtml(secao.titulo)}</h3>
          <p class="hint">${escapeHtml(secao.dica)}</p>
          ${secao.campos.map(campo => this._campoHtml(secao.id, campo, c[secao.id][campo.chave])).join('')}
        </section>`).join('')}
      <div class="anim-acoes">
        <button class="btn-secondary" data-act="anim-duplicar">Duplicar conjunto</button>
        <button class="btn-secondary" data-act="anim-padrao">Usar como padrão</button>
        <button class="btn-secondary" data-act="anim-excluir">Excluir</button>
      </div>`;
    this._ligarCorpo();
  }

  _campoHtml(secao, campo, valor) {
    const clipe = CLIPE_POR_NOME[valor];
    const focado = this.foco?.secao === secao && this.foco?.chave === campo.chave;
    const opcoes = GRUPOS_DE_CLIPE.map(grupo => `
      <optgroup label="${escapeHtml(grupo)}">
        ${CLIPES.filter(c => c.grupo === grupo).map(c => `<option value="${c.nome}" ${c.nome === valor ? 'selected' : ''}>${escapeHtml(c.rotulo)}</option>`).join('')}
      </optgroup>`).join('');
    return `
      <div class="anim-campo ${focado ? 'focado' : ''}" data-secao="${secao}" data-chave="${campo.chave}">
        <div class="anim-campo-topo">
          <label>${escapeHtml(campo.rotulo)}</label>
          <button class="btn-secondary anim-tocar" data-act="anim-tocar" title="Ver esta animação">▶</button>
        </div>
        <select data-act="anim-clipe">${opcoes}</select>
        <p class="hint">${escapeHtml(campo.dica)}</p>
        ${clipe ? '' : '<p class="hint anim-faltando">Esta animação não está no pacote: vai usar a de fábrica.</p>'}
      </div>`;
  }

  _ligarCorpo() {
    const corpo = this.doc.getElementById('animacoes-editor-body');
    if (!corpo) return;
    const c = this._conjunto();

    const nome = corpo.querySelector('[data-act="anim-label"]');
    if (nome) nome.oninput = () => { c.label = nome.value; this._salvar(); this._renderLista(); };

    for (const campo of corpo.querySelectorAll('.anim-campo')) {
      const { secao, chave } = campo.dataset;
      campo.onclick = () => this.focarCampo(secao, chave);
      const select = campo.querySelector('[data-act="anim-clipe"]');
      if (select) {
        select.onchange = () => {
          c[secao][chave] = select.value;
          this._salvar();
          this.tocar(select.value);
          this.render();
        };
      }
      const tocar = campo.querySelector('[data-act="anim-tocar"]');
      if (tocar) {
        tocar.onclick = e => {
          e.stopPropagation();
          this.focarCampo(secao, chave);
          this.tocar(c[secao][chave]);
        };
      }
    }

    const acoes = {
      'anim-duplicar': () => this.duplicar(),
      'anim-padrao': () => this.definirPadrao(this.sel),
      'anim-excluir': () => this.excluir(this.sel),
    };
    for (const [act, fn] of Object.entries(acoes)) {
      const botao = corpo.querySelector(`[data-act="${act}"]`);
      if (botao) botao.onclick = fn;
    }
  }

  /** A biblioteca: as animações do pacote, por assunto. Clicar toca. */
  _renderBiblioteca() {
    const caixa = this.doc.getElementById('animacoes-biblioteca');
    if (!caixa) return;
    caixa.innerHTML = GRUPOS_DE_CLIPE.map(grupo => `
      <div class="anim-grupo">
        <h4>${escapeHtml(grupo)}</h4>
        ${CLIPES.filter(c => c.grupo === grupo).map(c => `
          <button class="anim-clipe ${c.nome === this.tocando ? 'tocando' : ''}" data-clipe="${c.nome}">
            ${escapeHtml(c.rotulo)}
            <span class="hint">${c.tipo === EM_LOOP ? 'repete' : 'toca uma vez'}</span>
          </button>`).join('')}
      </div>`).join('');
    for (const el of caixa.querySelectorAll('[data-clipe]')) {
      el.onclick = () => this.tocar(el.dataset.clipe);
    }
  }

  _renderUsar() {
    const botao = this.doc.getElementById('btn-usar-clipe');
    const info = this.doc.getElementById('animacoes-previa-info');
    const clipe = CLIPE_POR_NOME[this.tocando];
    if (info) {
      info.textContent = clipe
        ? `${clipe.rotulo} — ${clipe.tipo === EM_LOOP ? 'repete sem parar' : 'toca uma vez e para'}`
        : 'Clique numa animação da lista pra ver o boneco fazer.';
    }
    if (!botao) return;
    const campo = this._campoEmFoco();
    botao.disabled = !clipe || !campo;
    botao.textContent = clipe && campo
      ? `Usar em "${campo.rotulo}"`
      : 'Escolha uma animação e um campo';
  }

  _campoEmFoco() {
    if (!this.foco) return null;
    const lista = this.foco.secao === 'gestos' ? GESTOS : ESTADOS;
    return lista.find(c => c.chave === this.foco.chave) ?? null;
  }

  _renderProblemas(problemas) {
    const caixa = this.doc.getElementById('animacoes-problemas');
    if (!caixa) return;
    if (!problemas.length) {
      caixa.innerHTML = '<p class="tudo-certo">Tudo certo: nenhum erro nem aviso.</p>';
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
      el.onclick = () => {
        if (p.id && this.animacoes.conjuntos[p.id]) this.selecionar(p.id);
        if (p.campo) this.focarCampo(ESTADOS.some(e => e.chave === p.campo) ? 'estados' : 'gestos', p.campo);
      };
    }
  }

  // --- Ações ---------------------------------------------------------------

  selecionar(id) {
    if (!this.animacoes?.conjuntos[id]) return;
    this.sel = id;
    this.foco = null;
    this.render();
  }

  focarCampo(secao, chave) {
    this.foco = { secao, chave };
    this.render();
  }

  /** Mostra o clipe no boneco. É o que faz a lista valer alguma coisa. */
  tocar(nomeDoClipe) {
    if (!CLIPE_POR_NOME[nomeDoClipe]) return false;
    this.tocando = nomeDoClipe;
    this.previa?.tocar(nomeDoClipe);
    this._renderBiblioteca();
    this._renderUsar();
    return true;
  }

  /** Põe o clipe que está tocando no campo em foco. */
  usarClipeNoCampo() {
    const c = this._conjunto();
    if (!c || !this.foco || !CLIPE_POR_NOME[this.tocando]) return false;
    c[this.foco.secao][this.foco.chave] = this.tocando;
    this._salvar();
    this.render();
    return true;
  }

  definirPadrao(id) {
    if (!this.animacoes?.conjuntos[id]) return false;
    this.animacoes.padrao = id;
    this._salvar();
    this.render();
    return true;
  }

  criar(sugestao) {
    const id = this._idLivre(sugestao);
    if (!id) return null;
    this.animacoes.conjuntos[id] = {
      id,
      label: String(sugestao).trim() || id,
      estados: { ...CONJUNTO_DE_FABRICA.estados },
      gestos: { ...CONJUNTO_DE_FABRICA.gestos },
    };
    this._salvar();
    this.selecionar(id);
    return id;
  }

  /** Duplicar é o caminho normal: quase todo conjunto novo é "o normal, só que…". */
  duplicar() {
    const base = this._conjunto();
    if (!base) return null;
    const id = this._idLivre(`${base.id}_copia`);
    if (!id) return null;
    this.animacoes.conjuntos[id] = {
      id,
      label: `${base.label || base.id} (cópia)`,
      estados: { ...base.estados },
      gestos: { ...base.gestos },
    };
    this._salvar();
    this.selecionar(id);
    return id;
  }

  /**
   * Excluir é recusado quando alguém ainda usa o conjunto, ou quando é o
   * padrão: nos dois casos a exclusão deixaria personagem sem jeito de andar,
   * e o autor só descobriria jogando.
   */
  excluir(id) {
    const conjunto = this.animacoes?.conjuntos[id];
    if (!conjunto) return false;
    const janela = this.doc.defaultView;
    if (id === this.animacoes.padrao) {
      janela?.alert('Não dá pra excluir: este é o conjunto padrão, o que vale pra quem não escolheu nenhum. Marque outro como padrão antes.');
      return false;
    }
    const usam = this._usoPorConjunto().get(id) || [];
    if (usam.length) {
      janela?.alert(`Não dá pra excluir: ${usam.join(', ')} ainda usa este conjunto. Troque o conjunto deles antes.`);
      return false;
    }
    if (!janela?.confirm(`Excluir o conjunto "${conjunto.label || id}"?`)) return false;
    delete this.animacoes.conjuntos[id];
    this._salvar();
    this.sel = this.animacoes.padrao;
    this.render();
    return true;
  }

  _idLivre(sugestao) {
    const limpo = idLimpo(sugestao);
    if (!limpo) return null;
    if (!this.animacoes.conjuntos[limpo]) return limpo;
    for (let i = 2; i < 100; i++) {
      if (!this.animacoes.conjuntos[`${limpo}_${i}`]) return `${limpo}_${i}`;
    }
    return null;
  }

  ligarBotoes() {
    const novo = this.doc.getElementById('btn-novo-conjunto');
    if (novo) {
      novo.onclick = () => {
        const nome = this.doc.defaultView?.prompt('Nome do conjunto (ex: Apressado, Cansado, Formal):', 'Novo jeito');
        if (nome) this.criar(nome);
      };
    }
    const usar = this.doc.getElementById('btn-usar-clipe');
    if (usar) usar.onclick = () => this.usarClipeNoCampo();
  }
}
