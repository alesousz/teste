// Aba Regras do editor de conteúdo: os números que decidem como o jogo se
// comporta. O que se escreve aqui vira src/data/regras.json.
//
// Ao contrário da aba Rotina, esta aba não é escrita à mão campo a campo: o
// formulário inteiro, a conferência e o teste saem da mesma tabela, o ESQUEMA
// de src/regras.js. São ~30 números homogêneos — regra nova no jogo entra no
// esquema e aparece aqui sozinha, sem ninguém lembrar de mexer no editor.
//
// A aposta do desenho é a frase de consequência embaixo de cada campo: um
// número cru ("JUMP_SPEED 6.5") não diz nada pra quem não programa, mas
// "o pulo sobe 1,17 m — a parede do kit tem 2,40 m" diz.

import {
  ESQUEMA, GRUPOS, PADROES, TEXTO_DA_MALHA, MALHA_DO_GERADOR,
  fraseDoCampo, normalizarRegras, num, validarRegras,
} from '../regras.js';

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Quanto o campo anda a cada seta do teclado, pela grandeza do valor. */
function passoDoCampo(campo) {
  if (campo.max <= 1) return 0.05;
  if (campo.max <= 10) return 0.1;
  if (campo.max <= 100) return 1;
  return 10;
}

export class AbaRegras {
  constructor({ aoSalvar = () => {}, doc = document } = {}) {
    this.aoSalvar = aoSalvar;
    this.doc = doc;
    this.regras = null;
    this.destaque = null;   // campo apontado pela conferência
  }

  definir(regras) {
    // Guarda o que foi lido, não o normalizado: se o autor escreveu 999 num
    // campo que vai até 20, ele precisa ver o 999 que escreveu (e o aviso do
    // lado), não um 20 que ele não digitou.
    this.regras = { ...PADROES, ...(regras && typeof regras === 'object' ? regras : {}) };
    this.render();
  }

  /** O que o jogo vai usar de fato, com tudo preso na faixa. */
  valores() {
    return normalizarRegras(this.regras);
  }

  _problemas() {
    return validarRegras(this.regras);
  }

  _salvar() {
    this.aoSalvar(this.regras);
  }

  // --- Desenho -------------------------------------------------------------

  render() {
    if (!this.regras) return;
    const painel = this.doc.getElementById('regras-panel');
    if (painel) {
      painel.innerHTML = GRUPOS.map(g => this._grupoHtml(g)).join('') + this._malhaHtml();
      this._ligarCampos();
    }
    this._renderProblemas(this._problemas());
  }

  _grupoHtml(grupo) {
    const campos = ESQUEMA.filter(c => c.grupo === grupo.id);
    if (!campos.length) return '';
    return `
      <section class="regras-grupo">
        <h3>${escapeHtml(grupo.rotulo)}</h3>
        ${campos.map(c => this._campoHtml(c)).join('')}
      </section>`;
  }

  _campoHtml(campo) {
    const valor = this.regras[campo.chave];
    const noPadrao = valor === campo.padrao;
    const frase = fraseDoCampo(campo.chave, this.valores()[campo.chave], this.regras);
    return `
      <div class="regra-campo${this.destaque === campo.chave ? ' destacado' : ''}" data-campo="${campo.chave}">
        <label for="regra-${campo.chave}">
          ${escapeHtml(campo.rotulo)}${campo.unidade ? ` <span class="regra-unidade">(${escapeHtml(campo.unidade)})</span>` : ''}
        </label>
        <div class="regra-linha">
          <input type="number" id="regra-${campo.chave}" data-chave="${campo.chave}"
                 value="${valor}" min="${campo.min}" max="${campo.max}" step="${passoDoCampo(campo)}" />
          <button class="btn-secondary regra-padrao" data-padrao="${campo.chave}"
                  title="Voltar ao valor de fábrica: ${num(campo.padrao)}" ${noPadrao ? 'disabled' : ''}>padrão</button>
        </div>
        <p class="hint regra-dica">${escapeHtml(campo.dica)}</p>
        <p class="regra-frase" data-frase="${campo.chave}">${escapeHtml(frase)}</p>
      </div>`;
  }

  /** O cartão que explica por que o tamanho da cidade não é campo. */
  _malhaHtml() {
    const linhas = Object.entries(MALHA_DO_GERADOR)
      .map(([chave, valor]) => `<li><code>${escapeHtml(chave)}</code> — ${num(valor, 0)}</li>`).join('');
    return `
      <section class="regras-grupo regras-travado">
        <h3>A cidade</h3>
        <p class="hint">${escapeHtml(TEXTO_DA_MALHA)}</p>
        <ul class="regras-malha">${linhas}</ul>
      </section>`;
  }

  _ligarCampos() {
    const painel = this.doc.getElementById('regras-panel');
    if (!painel) return;

    for (const input of painel.querySelectorAll('input[data-chave]')) {
      input.addEventListener('input', () => {
        const chave = input.dataset.chave;
        const bruto = input.value.trim();
        // Campo vazio no meio da digitação não vira 0: fica como está até o
        // autor escrever um número. 0 só entra se ele escrever 0.
        if (bruto === '') return;
        const lido = Number(bruto.replace(',', '.'));
        this.regras[chave] = Number.isFinite(lido) ? lido : bruto;
        this._aoMudar(chave);
      });
    }

    for (const botao of painel.querySelectorAll('[data-padrao]')) {
      botao.onclick = () => this.voltarAoPadrao(botao.dataset.padrao);
    }
  }

  /** Devolve um campo ao valor de fábrica — o jeito de desfazer sem Ctrl+Z. */
  voltarAoPadrao(chave) {
    if (!(chave in PADROES)) return;
    this.regras[chave] = PADROES[chave];
    const input = this.doc.getElementById('regras-panel')?.querySelector(`input[data-chave="${chave}"]`);
    if (input) input.value = PADROES[chave];
    this._aoMudar(chave);
  }

  /**
   * Uma tecla mexe em mais coisa que o próprio campo: a frase de consequência
   * de outros campos depende deste (mudar a vida do jogador muda "aguenta N
   * contra-ataques"), então todas são recalculadas.
   */
  _aoMudar(chave) {
    const painel = this.doc.getElementById('regras-panel');
    const valores = this.valores();
    if (painel) {
      for (const campo of ESQUEMA) {
        const alvo = painel.querySelector(`[data-frase="${campo.chave}"]`);
        if (alvo) alvo.textContent = fraseDoCampo(campo.chave, valores[campo.chave], this.regras);
      }
      const botao = painel.querySelector(`[data-padrao="${chave}"]`);
      if (botao) botao.disabled = this.regras[chave] === PADROES[chave];
    }
    this._renderProblemas(this._problemas());
    this._salvar();
  }

  // --- Conferência ---------------------------------------------------------

  _renderProblemas(problemas) {
    const caixa = this.doc.getElementById('regras-problemas');
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
    const painel = this.doc.getElementById('regras-panel');
    if (!painel) return;
    const pior = {};
    for (const p of problemas) if (!pior[p.campo] || p.nivel === 'erro') pior[p.campo] = p.nivel;
    for (const el of painel.querySelectorAll('.regra-campo')) {
      const nivel = pior[el.dataset.campo];
      el.classList.toggle('campo-com-erro', nivel === 'erro');
      el.classList.toggle('campo-com-aviso', nivel === 'aviso');
    }
  }

  /** Leva o autor até o campo do problema que ele clicou. */
  apontar(chave) {
    this.destaque = chave;
    const painel = this.doc.getElementById('regras-panel');
    const input = painel?.querySelector(`input[data-chave="${chave}"]`);
    if (input) {
      input.focus?.();
      input.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
  }
}
