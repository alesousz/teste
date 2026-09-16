// Aba Rotina do editor de conteúdo: compromissos, cursos, casas e origens.
// O que se escreve aqui vira src/data/routine.json e é o que o jogo joga.
//
// Duas ideias mandam no desenho desta aba:
//
// 1. Lugar se escolhe no mapa, não se digita. Todo local é uma peça da cena
//    (mercado, escola, casa) com âncora e distância. Ninguém acerta uma
//    coordenada de cabeça, e assim mover o prédio no editor de mapa move o
//    compromisso junto.
// 2. Estado inconsistente não se cria. Curso nasce junto com o compromisso
//    dele; apagar algo que outra coisa usa é recusado com o nome de quem usa;
//    e a conferência do lado direito roda a cada tecla, apontando o campo.

import {
  ANCORAS, TIPOS_DE_COMPROMISSO, ROTULO_DE_TIPO,
  validarRotina, descreverLocal, horaParaTexto, textoParaHora,
} from '../rotina.js';

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SECOES = ['obligation', 'course', 'home', 'origin'];

/** Onde cada tipo mora dentro do routine.json. */
const COLECAO = {
  obligation: 'obligations',
  course: 'courses',
  home: 'homes',
  origin: 'origins',
};

/**
 * O que apagar cada coisa quebraria. Usado pra RECUSAR a exclusão em vez de
 * deixar o autor descobrir depois, num erro vermelho, que o curso ficou
 * apontando pro vazio.
 */
const QUEM_USA = {
  obligation: (rotina, id) => [
    ...Object.values(rotina.courses).filter(c => c.obligation === id).map(c => `curso "${c.label || c.id}"`),
    ...Object.values(rotina.origins).filter(o => o.obligation === id).map(o => `origem "${o.label || o.id}"`),
  ],
  home: (rotina, id) => Object.values(rotina.origins).filter(o => o.home === id).map(o => `origem "${o.label || o.id}"`),
  course: () => [],
  origin: () => [],
};

// Campos de cada tipo, na ordem em que aparecem. `campo` é a chave que a
// validação usa pra apontar o problema — por isso início e fim compartilham
// 'horario': o erro é da janela, não de um dos dois.
const FORMULARIOS = {
  obligation: [
    { prop: 'label', campo: 'label', label: 'Nome (é o que o jogador lê no HUD)', tipo: 'texto' },
    { prop: 'type', campo: 'type', label: 'Tipo', tipo: 'select', opcoes: () => TIPOS_DE_COMPROMISSO, dica: 'Muda o ícone na bússola e no HUD.' },
    { tipo: 'local', campo: 'local', label: 'Onde acontece', dica: 'Escolhido no mapa. Mover o prédio no editor de mapa move o compromisso junto.' },
    { prop: 'npc', campo: 'npc', label: 'Quem atende', tipo: 'npc', dica: 'Este NPC só fica de pé no lugar dentro do horário; fora dele, volta pra casa.' },
    { tipo: 'janela', campo: 'horario' },
    { prop: 'payPerDay', campo: 'payPerDay', label: 'Paga por dia (R$)', tipo: 'inteiro', min: 0, meia: true },
    { prop: 'missPenaltyMoney', campo: 'missPenaltyMoney', label: 'Multa por faltar (R$)', tipo: 'inteiro', min: 0, meia: true },
    { prop: 'maxMisses', campo: 'maxMisses', label: 'Faltas até perder a vaga', tipo: 'inteiro', min: 1, dica: 'Na penúltima falta o jogador recebe o aviso abaixo; na última, perde a vaga.' },
    { prop: 'warningMessage', campo: 'warningMessage', label: 'Aviso na penúltima falta', tipo: 'longo' },
    { prop: 'endMessage', campo: 'endMessage', label: 'Despedida ao perder a vaga', tipo: 'longo' },
  ],
  course: [
    { prop: 'label', campo: 'label', label: 'Nome do curso', tipo: 'texto' },
    { prop: 'obligation', campo: 'obligation', label: 'Compromisso diário', tipo: 'ref', de: 'obligation', dica: 'O horário e o nome que aparecem na criação de personagem saem daqui.' },
    { prop: 'glyph', campo: 'glyph', label: 'Ícone (nome do Material Symbols)', tipo: 'texto', meia: true },
    { prop: 'age', campo: 'age', label: 'Idade ao começar', tipo: 'inteiro', min: 1, meia: true },
    { prop: 'startMoney', campo: 'startMoney', label: 'Dinheiro no bolso (R$)', tipo: 'inteiro', min: 0 },
    { prop: 'note', campo: 'note', label: 'Recado na tela de criação', tipo: 'longo' },
  ],
  home: [
    { prop: 'kind', campo: 'kind', label: 'Prédio da casa', tipo: 'marco', dica: 'É pra onde a bússola aponta quando o jogador quer voltar pra casa.' },
    { tipo: 'local', campo: 'local', label: 'Onde fica a cama', dica: 'O ponto em que dormir funciona. Costuma ser ao lado do prédio, fora da parede.' },
  ],
  origin: [
    { prop: 'label', campo: 'label', label: 'Nome da origem', tipo: 'texto' },
    { prop: 'shortDesc', campo: 'shortDesc', label: 'De onde essa pessoa vem', tipo: 'longo' },
    { prop: 'home', campo: 'home', label: 'Casa', tipo: 'ref', de: 'home' },
    { prop: 'obligation', campo: 'obligation', label: 'Compromisso diário', tipo: 'ref', de: 'obligation' },
    { prop: 'startMoney', campo: 'startMoney', label: 'Dinheiro no bolso (R$)', tipo: 'inteiro', min: 0, meia: true },
    { prop: 'familyNpc', campo: 'familyNpc', label: 'NPC da família', tipo: 'npc', meia: true },
  ],
};

const TITULO_DA_SECAO = {
  obligation: 'Compromisso', course: 'Curso', home: 'Casa', origin: 'Origem',
};

export class AbaRotina {
  /**
   * `npcs` e `marcos` são o que existe na cena hoje (vindos de data.js), e é
   * deles que saem os selects: só dá pra escolher NPC e prédio que existem.
   * `aoSalvar` grava o rascunho.
   */
  constructor({ npcs = [], marcos = [], nomeDoMarco = k => k, aoSalvar = () => {}, doc = document } = {}) {
    this.npcs = npcs;
    this.marcos = marcos;
    this.nomeDoMarco = nomeDoMarco;
    this.aoSalvar = aoSalvar;
    this.doc = doc;
    this.rotina = null;
    this.sel = null;              // { tipo, id }
    this.destaque = null;         // campo apontado pela conferência
  }

  definir(rotina) {
    this.rotina = rotina;
    for (const secao of Object.values(COLECAO)) if (!this.rotina[secao]) this.rotina[secao] = {};
    this.sel = null;
    this.destaque = null;
    this.render();
  }

  ligarBotoes() {
    for (const botao of this.doc.querySelectorAll('#rotina-panel [data-novo]')) {
      botao.onclick = () => this._novo(botao.dataset.novo);
    }
  }

  _item(sel = this.sel) {
    return sel ? this.rotina[COLECAO[sel.tipo]]?.[sel.id] ?? null : null;
  }

  _salvar() {
    this.aoSalvar(this.rotina);
  }

  // --- Listas ---------------------------------------------------------------

  /** Resumo de uma linha da lista: o que dá pra conferir sem abrir o item. */
  _resumo(tipo, item) {
    if (tipo === 'obligation') {
      return `${horaParaTexto(item.startHour ?? 8)}–${horaParaTexto(item.endHour ?? 14)} · ${descreverLocal(item.local, this.nomeDoMarco)}`;
    }
    if (tipo === 'course') {
      const ob = this.rotina.obligations[item.obligation];
      return ob ? `${ob.label || item.obligation} · ${horaParaTexto(ob.startHour ?? 8)}` : `sem compromisso (${item.obligation ?? '—'})`;
    }
    if (tipo === 'home') return descreverLocal(item.local, this.nomeDoMarco);
    const casa = this.rotina.homes[item.home];
    return `${casa ? this.nomeDoMarco(casa.kind) : 'sem casa'} · R$${item.startMoney ?? 0}`;
  }

  render() {
    if (!this.rotina) return;
    const problemas = this._problemas();
    for (const tipo of SECOES) {
      const lista = this.doc.getElementById(`rotina-lista-${tipo}`);
      if (!lista) continue;
      const itens = Object.entries(this.rotina[COLECAO[tipo]]);
      lista.innerHTML = itens.map(([id, item]) => {
        const nivel = this._piorNivel(problemas, tipo, id);
        const marca = nivel === 'erro' ? ' ⛔' : nivel === 'aviso' ? ' ⚠' : '';
        const selecionado = this.sel?.tipo === tipo && this.sel?.id === id ? ' selected' : '';
        return `<div class="quest-item${selecionado}" data-tipo="${tipo}" data-id="${escapeHtml(id)}">
          <span>${escapeHtml((item.label ?? item.kind ?? id) || id)}${marca}</span>
          <span class="quest-id">${escapeHtml(this._resumo(tipo, item))}</span>
        </div>`;
      }).join('') || '<p class="hint">Nada aqui ainda.</p>';
      for (const el of lista.querySelectorAll('.quest-item')) {
        el.onclick = () => this.selecionar(el.dataset.tipo, el.dataset.id);
      }
    }
    this._renderFormulario(problemas);
    this._renderProblemas(problemas);
  }

  _piorNivel(problemas, tipo, id) {
    const meus = problemas.filter(p => p.tipo === tipo && p.id === id);
    if (meus.some(p => p.nivel === 'erro')) return 'erro';
    return meus.length ? 'aviso' : null;
  }

  selecionar(tipo, id, campo = null) {
    this.sel = { tipo, id };
    this.destaque = campo;
    this.render();
    if (campo) {
      const el = this.doc.querySelector(`#rotina-editor-body [data-campo="${campo}"]`);
      el?.scrollIntoView({ block: 'center' });
    }
  }

  // --- Formulário -----------------------------------------------------------

  _opcoesRef(tipo, atual) {
    const vazio = `<option value="">— escolha —</option>`;
    const itens = Object.entries(this.rotina[COLECAO[tipo]])
      .map(([id, it]) => `<option value="${escapeHtml(id)}"${id === atual ? ' selected' : ''}>${escapeHtml(it.label || it.kind || id)}</option>`)
      .join('');
    // Referência que aponta pra algo apagado não some do select: vira uma
    // opção própria, visivelmente quebrada, pra o autor ver o que está lá.
    const orfa = atual && !this.rotina[COLECAO[tipo]][atual]
      ? `<option value="${escapeHtml(atual)}" selected>⛔ ${escapeHtml(atual)} (não existe mais)</option>` : '';
    return `${atual ? '' : vazio}${orfa}${itens}`;
  }

  _campoHtml(def, item, nivelPorCampo) {
    const valor = def.prop ? item[def.prop] : null;
    const classe = nivelPorCampo[def.campo] === 'erro' ? ' campo-com-erro'
      : nivelPorCampo[def.campo] === 'aviso' ? ' campo-com-aviso' : '';
    const dica = def.dica ? `<p class="hint">${escapeHtml(def.dica)}</p>` : '';
    const abre = `<label class="field${classe}" data-campo="${def.campo}">${escapeHtml(def.label ?? '')}`;

    if (def.tipo === 'janela') {
      return `<div class="linha-dupla">
        <label class="field${classe}" data-campo="horario">Começa às
          <input type="time" step="300" data-hora="startHour" value="${horaParaTexto(item.startHour ?? 8)}" />
        </label>
        <label class="field${classe}" data-campo="horario">Termina às
          <input type="time" step="300" data-hora="endHour" value="${horaParaTexto(item.endHour ?? 14)}" />
        </label>
      </div>
      <p class="hint">O jogador precisa estar no lugar em algum momento dessa janela pra contar presença.</p>`;
    }

    if (def.tipo === 'local') {
      const local = item.local && typeof item.local === 'object' ? item.local : {};
      // Local escrito à mão no JSON (ponto solto ou NPC) não é apagado sem
      // avisar: fica à vista, e trocar o prédio é o que o substitui.
      const forade = local.marco === undefined && (local.npc || Number.isFinite(local.x))
        ? `<p class="hint unknown-payload">Este local foi escrito à mão: <code>${escapeHtml(JSON.stringify(local))}</code>. Escolher um prédio abaixo substitui.</p>` : '';
      return `<div class="field${classe}" data-campo="${def.campo}">${escapeHtml(def.label)}
        ${dica}${forade}
        <div class="linha-tripla">
          <select data-local="marco">
            <option value="">— escolha um prédio —</option>
            ${this.marcos.map(k => `<option value="${escapeHtml(k)}"${k === local.marco ? ' selected' : ''}>${escapeHtml(this.nomeDoMarco(k))}</option>`).join('')}
            ${local.marco && !this.marcos.includes(local.marco) ? `<option value="${escapeHtml(local.marco)}" selected>⛔ ${escapeHtml(local.marco)} (fora do mapa)</option>` : ''}
          </select>
          <select data-local="ancora">
            ${ANCORAS.map(a => `<option value="${a.value}"${a.value === (local.ancora ?? 'frente') ? ' selected' : ''}>${escapeHtml(a.label)}</option>`).join('')}
          </select>
          <input type="number" data-local="margem" min="0" max="20" step="0.5" value="${Number.isFinite(local.margem) ? local.margem : 3}" title="Distância da parede, em metros" />
        </div>
      </div>`;
    }

    if (def.tipo === 'select') {
      const opcoes = def.opcoes().map(o => `<option value="${escapeHtml(o.value)}"${o.value === valor ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
      return `${abre}${dica}<select data-prop="${def.prop}">${opcoes}</select></label>`;
    }
    if (def.tipo === 'ref') {
      return `${abre}${dica}<select data-prop="${def.prop}">${this._opcoesRef(def.de, valor)}</select></label>`;
    }
    if (def.tipo === 'npc') {
      const orfao = valor && !this.npcs.some(n => n.id === valor)
        ? `<option value="${escapeHtml(valor)}" selected>⛔ ${escapeHtml(valor)} (não está no mapa)</option>` : '';
      const opcoes = this.npcs.map(n => `<option value="${escapeHtml(n.id)}"${n.id === valor ? ' selected' : ''}>${escapeHtml(n.name || n.id)}</option>`).join('');
      return `${abre}${dica}<select data-prop="${def.prop}"><option value="">— ninguém —</option>${orfao}${opcoes}</select></label>`;
    }
    if (def.tipo === 'marco') {
      const orfao = valor && !this.marcos.includes(valor)
        ? `<option value="${escapeHtml(valor)}" selected>⛔ ${escapeHtml(valor)} (fora do mapa)</option>` : '';
      const opcoes = this.marcos.map(k => `<option value="${escapeHtml(k)}"${k === valor ? ' selected' : ''}>${escapeHtml(this.nomeDoMarco(k))}</option>`).join('');
      return `${abre}${dica}<select data-prop="${def.prop}"><option value="">— escolha —</option>${orfao}${opcoes}</select></label>`;
    }
    if (def.tipo === 'longo') {
      return `${abre}${dica}<textarea rows="2" data-prop="${def.prop}">${escapeHtml(valor ?? '')}</textarea></label>`;
    }
    if (def.tipo === 'inteiro') {
      return `${abre}${dica}<input type="number" step="1" min="${def.min ?? 0}" data-prop="${def.prop}" data-numero="1" value="${Number.isFinite(valor) ? valor : ''}" /></label>`;
    }
    return `${abre}${dica}<input type="text" data-prop="${def.prop}" value="${escapeHtml(valor ?? '')}" /></label>`;
  }

  _renderFormulario(problemas) {
    const corpo = this.doc.getElementById('rotina-editor-body');
    const vazio = this.doc.getElementById('rotina-editor-empty');
    const titulo = this.doc.getElementById('editing-rotina-id');
    if (!corpo) return;
    const item = this._item();
    vazio?.classList.toggle('hidden', !!item);
    corpo.classList.toggle('hidden', !item);
    if (!item) {
      corpo.innerHTML = '';
      if (titulo) titulo.textContent = '—';
      return;
    }
    if (titulo) titulo.textContent = `${TITULO_DA_SECAO[this.sel.tipo]} · ${this.sel.id}`;

    const meus = problemas.filter(p => p.tipo === this.sel.tipo && p.id === this.sel.id);
    const nivelPorCampo = {};
    for (const p of meus) {
      if (!p.campo) continue;
      if (nivelPorCampo[p.campo] !== 'erro') nivelPorCampo[p.campo] = p.nivel;
    }
    if (this.destaque && !nivelPorCampo[this.destaque]) nivelPorCampo[this.destaque] = 'aviso';

    const campos = FORMULARIOS[this.sel.tipo].map(def => {
      const meia = def.meia ? 'meia' : 'inteira';
      return { meia, html: this._campoHtml(def, item, nivelPorCampo) };
    });

    // Campos marcados como "meia" se juntam dois a dois numa linha.
    let html = '';
    for (let i = 0; i < campos.length; i++) {
      if (campos[i].meia === 'meia' && campos[i + 1]?.meia === 'meia') {
        html += `<div class="linha-dupla">${campos[i].html}${campos[i + 1].html}</div>`;
        i++;
      } else {
        html += campos[i].html;
      }
    }
    html += `<div class="linha-dupla" style="margin-top:16px">
      <button class="btn-secondary" data-acao="duplicar">Duplicar</button>
      <button class="btn-danger" style="margin-top:0" data-acao="excluir">Excluir</button>
    </div>`;
    corpo.innerHTML = html;
    this._ligarFormulario(corpo, item);
  }

  _ligarFormulario(corpo, item) {
    const mudou = () => { this._salvar(); this.render(); };

    for (const el of corpo.querySelectorAll('[data-prop]')) {
      const prop = el.dataset.prop;
      const evento = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evento, () => {
        const bruto = el.value;
        if (el.dataset.numero) {
          // Campo numérico apagado vira ausência de valor, não NaN: o jogo
          // aplica o padrão e a conferência não inventa erro.
          if (bruto.trim() === '') delete item[prop];
          else item[prop] = Number(bruto);
        } else if (bruto === '' && (prop === 'npc' || prop === 'familyNpc')) {
          delete item[prop];
        } else {
          item[prop] = bruto;
        }
        mudou();
      });
    }

    for (const el of corpo.querySelectorAll('[data-hora]')) {
      el.addEventListener('input', () => {
        const h = textoParaHora(el.value);
        if (h === null) return;           // meio de digitação: espera terminar
        item[el.dataset.hora] = h;
        this._salvar();
        this._renderProblemas(this._problemas());
      });
      el.addEventListener('change', () => mudou());
    }

    for (const el of corpo.querySelectorAll('[data-local]')) {
      el.addEventListener('change', () => {
        const marco = corpo.querySelector('[data-local="marco"]').value;
        const ancora = corpo.querySelector('[data-local="ancora"]').value;
        const margem = Number(corpo.querySelector('[data-local="margem"]').value);
        item.local = { marco, ancora, margem: Number.isFinite(margem) ? margem : 3 };
        mudou();
      });
      if (el.tagName === 'INPUT') el.addEventListener('input', () => el.dispatchEvent(new Event('change', { bubbles: false })));
    }

    corpo.querySelector('[data-acao="excluir"]').onclick = () => this._excluir();
    corpo.querySelector('[data-acao="duplicar"]').onclick = () => this._duplicar();
  }

  // --- Conferência ----------------------------------------------------------

  _problemas() {
    return validarRotina(this.rotina, {
      npcs: new Set(this.npcs.map(n => n.id)),
      marcos: new Set(this.marcos),
    });
  }

  _renderProblemas(problemas) {
    const caixa = this.doc.getElementById('rotina-problemas');
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
      el.onclick = () => { if (p.id) this.selecionar(p.tipo, p.id, p.campo); };
    }
  }

  // --- Criar, duplicar, excluir --------------------------------------------

  _idLivre(tipo, sugestao) {
    const limpo = String(sugestao).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
    if (!limpo) return null;
    const usados = this.rotina[COLECAO[tipo]];
    if (!usados[limpo]) return limpo;
    let n = 2;
    while (usados[`${limpo}_${n}`]) n++;
    return `${limpo}_${n}`;
  }

  /** Molde de um compromisso novo: já nasce num lugar do mapa e cumprível. */
  _compromissoPadrao(id, label) {
    const marco = this.marcos.includes('job_mercado') ? 'job_mercado' : (this.marcos[0] ?? '');
    return {
      id, type: 'job', label,
      local: { marco, ancora: 'frente', margem: 3 },
      npc: this.npcs[0]?.id ?? '',
      startHour: 8, endHour: 14,
      payPerDay: 0, missPenaltyMoney: 0, maxMisses: 3,
      warningMessage: `Mais uma falta em ${label} e você perde a vaga.`,
      endMessage: `Você faltou demais e perdeu ${label}.`,
    };
  }

  _novo(tipo) {
    const sugestao = {
      obligation: 'compromisso_novo', course: 'curso_novo', home: 'casa_nova', origin: 'origem_nova',
    }[tipo];
    const digitado = this.doc.defaultView.prompt(`Id do ${ROTULO_DE_TIPO[tipo]} (sem espaço, é o que o resto da rotina usa):`, sugestao);
    if (!digitado) return;
    const id = this._idLivre(tipo, digitado);
    if (!id) {
      this.doc.defaultView.alert('Esse id não tem nenhuma letra nem número. Use algo como "turno_da_noite".');
      return;
    }

    if (tipo === 'obligation') {
      this.rotina.obligations[id] = this._compromissoPadrao(id, 'Compromisso novo');
    } else if (tipo === 'course') {
      // Curso sem compromisso é o estado inconsistente mais fácil de criar:
      // por isso o compromisso nasce junto, já apontado, em vez de o autor
      // ter que lembrar de criar os dois.
      const idOb = this._idLivre('obligation', `curso_${id}`);
      const base = this.rotina.obligations[this.sel?.tipo === 'obligation' ? this.sel.id : Object.keys(this.rotina.obligations)[0]];
      const label = 'Aula do curso novo';
      this.rotina.obligations[idOb] = base
        ? { ...structuredClone(base), id: idOb, label, type: 'school' }
        : this._compromissoPadrao(idOb, label);
      this.rotina.courses[id] = {
        id, label: 'Curso novo', glyph: 'school', age: 18, startMoney: 60,
        obligation: idOb, note: '',
      };
    } else if (tipo === 'home') {
      const marco = this.marcos.find(k => k.startsWith('home')) ?? this.marcos[0] ?? '';
      this.rotina.homes[id] = { id, kind: marco, local: { marco, ancora: 'lado', margem: 3 } };
    } else {
      this.rotina.origins[id] = {
        id, label: 'Origem nova', shortDesc: '', startMoney: 60,
        home: Object.keys(this.rotina.homes)[0] ?? '',
        obligation: Object.keys(this.rotina.obligations)[0] ?? '',
        familyNpc: '',
      };
    }
    this._salvar();
    this.selecionar(tipo, id);
  }

  _duplicar() {
    const { tipo, id } = this.sel;
    const novo = this._idLivre(tipo, `${id}_copia`);
    const copia = structuredClone(this._item());
    copia.id = novo;
    if (copia.label) copia.label = `${copia.label} (cópia)`;
    this.rotina[COLECAO[tipo]][novo] = copia;
    // Curso duplicado ganha compromisso próprio: dois cursos dividindo o mesmo
    // compromisso fazem faltar numa contar falta na outra.
    if (tipo === 'course' && this.rotina.obligations[copia.obligation]) {
      const idOb = this._idLivre('obligation', `${copia.obligation}_copia`);
      const ob = structuredClone(this.rotina.obligations[copia.obligation]);
      ob.id = idOb;
      ob.label = `${ob.label} (cópia)`;
      this.rotina.obligations[idOb] = ob;
      copia.obligation = idOb;
    }
    this._salvar();
    this.selecionar(tipo, novo);
  }

  _excluir() {
    const { tipo, id } = this.sel;
    const item = this._item();
    const janela = this.doc.defaultView;

    const dependentes = QUEM_USA[tipo](this.rotina, id);
    if (dependentes.length) {
      janela.alert(`Não dá pra excluir: ${dependentes.join(', ')} ainda usa isso.\n\nTroque lá primeiro e volte aqui.`);
      return;
    }
    const restantes = Object.keys(this.rotina[COLECAO[tipo]]).length;
    if (tipo === 'course' && restantes <= 1) {
      janela.alert('Este é o único curso. Sem nenhum, a criação de personagem fica vazia e ninguém consegue começar uma partida.');
      return;
    }
    if (tipo === 'home' && restantes <= 1) {
      janela.alert('Esta é a única casa. Sem nenhuma, o jogador não tem onde dormir.');
      return;
    }
    if (!janela.confirm(`Excluir "${item.label || item.kind || id}"?`)) return;
    delete this.rotina[COLECAO[tipo]][id];
    this.sel = null;
    this._salvar();
    this.render();
  }
}
