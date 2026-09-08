// Celular do jogador e tutorial dos primeiros minutos.
//
// Este módulo é deliberadamente livre de three.js e, na parte de lógica,
// livre de DOM: `Phone` e `Tutorial` guardam e movem estado puro (fila de
// mensagens, não lidas, temporizadores, passo atual do tutorial), e toda a
// pintura fica em `PhoneView`, que só existe quando há um `document`. É isso
// que deixa a lógica testável no runner do node, sem navegador.
//
// A ligação entre os dois é de mão única: o Phone chama `view.render(...)`
// depois de cada mudança; a view nunca mexe no estado.

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

// Mesmo escape usado no editor de diálogos — nenhum texto entra no innerHTML
// sem passar por aqui, mesmo o que hoje é conteúdo do jogo (amanhã pode ser
// o nome que o jogador digitou na criação).
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Mesma sintaxe do DialogueSystem: {{m:X|f:Y|x:Z}} escolhe a variante certa
// pro sexo do personagem. A regra de desempate é copiada de interactions.js
// de propósito — sexo desconhecido cai no masculino nos dois lugares, pra
// não existir "duas verdades" sobre o mesmo texto.
export const PRONOUN_PATTERN = /\{\{m:([^|}]*)\|f:([^|}]*)\|x:([^|}]*)\}\}/g;

export function applyPronouns(text, sex) {
  return String(text ?? '').replace(PRONOUN_PATTERN, (_, m, f, x) => (sex === 'f' ? f : sex === 'x' ? x : m));
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// Tecla do celular
//
// `data.js` (KEYBIND_ACTIONS/DEFAULT_KEYBINDS) é a casa das teclas
// remapeáveis, e é lá que a ação 'phone' deve entrar quando alguém puder
// tocar naquele arquivo. Enquanto isso não acontece, o celular usa uma tecla
// fixa própria: M, de "mensagens".
//
// M foi escolhida por não colidir com nada em uso hoje: WASD/Shift/Space/C
// (movimento, player.js), E (interagir e "usar" no menu de itens), F (foto),
// Q (esquiva), Tab (diário), I (itens), Esc (pausa), Enter, R (descartar item
// e restaurar teclas padrão), Digit1–9 (escolhas de diálogo) e as setas.
//
// O integrador pode escrever `ui.getBinding('phone') ?? PHONE_DEFAULT_KEY`:
// enquanto 'phone' não existir nos keybinds, cai no padrão; no dia em que
// existir, passa a respeitar o que o jogador configurou, sem mudar nada aqui.
export const PHONE_DEFAULT_KEY = 'KeyM';
export const PHONE_DEFAULT_KEY_LABEL = 'M';

// Rótulos de reserva pras dicas do tutorial, usados só quando o jogo não
// souber informar a tecla real daquela ação (ex.: 'phone', que ainda não está
// no mapa de teclas remapeáveis).
const FALLBACK_KEY_LABELS = {
  interact: 'E',
  phone: PHONE_DEFAULT_KEY_LABEL,
  journal: 'Tab',
  items: 'I',
  photo: 'F',
};

// Rótulo real da tecla de uma ação. '—' é o que o UI devolve pra ação sem
// tecla nenhuma: nesse caso (e quando o jogo não conhece a ação, como 'phone'
// hoje) vale o rótulo de reserva — melhor que mostrar um travessão no lugar
// da tecla.
export function keyLabelFor(getKeyLabel, action) {
  if (!action) return '';
  const label = getKeyLabel ? getKeyLabel(action) : null;
  if (typeof label === 'string' && label && label !== '—') return label;
  return FALLBACK_KEY_LABELS[action] || '—';
}

// ---------------------------------------------------------------------------
// Conteúdo: a primeira conversa
//
// Chega alguns segundos depois do começo da partida, enquanto o jogador ainda
// está andando pelo apartamento. São três mensagens curtas, na voz de mãe: sem
// dizer o que fazer, sem missão embutida, sem nome próprio novo.
// ---------------------------------------------------------------------------
export const PARENTS_CONTACT = 'Mãe';

export const PARENTS_MESSAGES = [
  // O possessivo entra dentro da variação ("meu filho" / "minha filha"), e
  // não fora dela: senão a versão feminina sai como "meu filha".
  { id: 'pais_1', from: PARENTS_CONTACT, delay: 14, text: 'Oi, {{m:meu filho|f:minha filha|x:meu bem}}. Chegou bem? Estava esperando notícia.' },
  { id: 'pais_2', from: PARENTS_CONTACT, delay: 4.5, text: 'Come alguma coisa direito hoje, viu. Café puro não é almoço.' },
  { id: 'pais_3', from: PARENTS_CONTACT, delay: 5, text: 'Qualquer coisa você liga, a hora que for. Um beijo, {{m:querido|f:querida|x:amor}}.' },
];

// ---------------------------------------------------------------------------
// Tutorial — máquina de estados linear
//
// Cada passo tem um id (que é também o nome do evento que o cumpre), a ação
// de teclado que a dica precisa citar (ou null, quando a tecla é fixa) e o
// texto da dica. `advance(id)` só anda quando o id é exatamente o do passo
// atual: evento repetido, fora de ordem ou já cumprido não faz nada — e nada
// nunca volta pra trás.
// ---------------------------------------------------------------------------
export const TUTORIAL_STEPS = [
  { id: 'moveu', action: null, hint: () => 'W A S D para andar pelo apartamento.' },
  { id: 'olhou', action: null, hint: () => 'Mova o mouse para olhar em volta.' },
  { id: 'interagiu', action: 'interact', hint: k => `${k} perto de alguma coisa para dar uma olhada nela.` },
  { id: 'leu_mensagem', action: 'phone', hint: k => `${k} abre o celular.` },
  { id: 'saiu_do_apartamento', action: 'interact', hint: k => `${k} na porta para sair do apartamento.` },
  { id: 'desceu_a_escada', action: null, hint: () => 'A escada fica no fim do corredor. Desça até o térreo.' },
  { id: 'saiu_do_predio', action: 'interact', hint: k => `${k} no portão para sair do prédio.` },
];

export class Tutorial {
  /**
   * @param {object} [opts]
   * @param {(action: string) => string} [opts.getKeyLabel] devolve o rótulo da
   *   tecla configurada pro jogador (ex.: ui.getBindingLabel). Chamado a cada
   *   leitura de `currentHint`, então remapear a tecla no meio do tutorial já
   *   muda a dica.
   * @param {() => void} [opts.onChange] avisado quando o passo muda.
   */
  constructor({ getKeyLabel = null, onChange = null } = {}) {
    this.getKeyLabel = getKeyLabel;
    this.onChange = onChange;
    this.index = 0;
    this.done = false;
  }

  get currentStep() {
    return this.done ? null : (TUTORIAL_STEPS[this.index] || null);
  }

  get currentHint() {
    const step = this.currentStep;
    return step ? step.hint(this.keyLabel(step.action)) : null;
  }

  get isDone() {
    return this.done;
  }

  keyLabel(action) {
    return keyLabelFor(this.getKeyLabel, action);
  }

  /**
   * Cumpre um passo. Só o passo atual pode ser cumprido.
   * @returns {boolean} true se o tutorial de fato avançou.
   */
  advance(eventId) {
    const step = this.currentStep;
    if (!step || eventId !== step.id) return false;
    this.index += 1;
    if (this.index >= TUTORIAL_STEPS.length) {
      this.index = TUTORIAL_STEPS.length;
      this.done = true;
    }
    this.onChange?.();
    return true;
  }

  // Encerra o tutorial de vez (ex.: jogador que carregou um save antigo já na
  // rua, ou uma opção futura de "pular tutorial").
  finish() {
    if (this.done) return false;
    this.index = TUTORIAL_STEPS.length;
    this.done = true;
    this.onChange?.();
    return true;
  }

  serialize() {
    return {
      // O id do passo, e não só o índice: reordenar/renomear passos no futuro
      // não faz um save antigo apontar pro passo errado.
      step: this.currentStep?.id ?? null,
      index: this.index,
      done: this.done,
    };
  }

  // Campo ausente ou inválido = mantém o padrão. Nunca lança, nunca chuta.
  deserialize(data) {
    const d = plainObject(data);
    if (!d) return;
    if (d.done === true) {
      this.index = TUTORIAL_STEPS.length;
      this.done = true;
      this.onChange?.();
      return;
    }
    let index = null;
    if (typeof d.step === 'string') {
      const i = TUTORIAL_STEPS.findIndex(s => s.id === d.step);
      if (i >= 0) index = i;
    }
    if (index === null && Number.isInteger(d.index) && d.index >= 0 && d.index <= TUTORIAL_STEPS.length) {
      index = d.index;
    }
    if (index === null) return; // nada utilizável: fica como estava
    this.index = index;
    this.done = index >= TUTORIAL_STEPS.length;
    this.onChange?.();
  }
}

// ---------------------------------------------------------------------------
// Celular
// ---------------------------------------------------------------------------
export class Phone {
  /**
   * @param {object} [opts]
   * @param {object|null} [opts.view] renderizador. Omitido, o celular cria uma
   *   `PhoneView` quando existe `document` (navegador) e fica sem view fora
   *   dele (testes). `null` desliga a renderização explicitamente.
   * @param {() => void} [opts.onOpen]
   * @param {() => void} [opts.onClose]
   * @param {(msg: object) => void} [opts.onMessageRead] uma vez por mensagem
   *   que passa de não lida a lida.
   * @param {(msg: object) => void} [opts.onNotify] mensagem recém-chegada —
   *   é aqui que o jogo encosta um toast, se quiser.
   * @param {() => string} [opts.getTimeLabel] hora do mundo, usada como
   *   carimbo das mensagens que chegam sem `at`.
   * @param {string} [opts.sex] 'm' | 'f' | 'x' — para {{m:|f:|x:}}.
   * @param {(action: string) => string} [opts.getKeyLabel] repassado ao
   *   tutorial que este celular carrega em `phone.tutorial`.
   */
  constructor(opts = {}) {
    const { view, onOpen, onClose, onMessageRead, onNotify, getTimeLabel, sex, getKeyLabel } = opts;
    this.onOpen = onOpen || null;
    this.onClose = onClose || null;
    this.onMessageRead = onMessageRead || null;
    this.onNotify = onNotify || null;
    this.getTimeLabel = getTimeLabel || null;
    this.getKeyLabel = getKeyLabel || null;
    this.sex = sex || null;

    this.messages = [];
    this.pending = [];      // { remaining, msg }
    this.selected = null;   // nome do contato da conversa aberta
    this.parentsStarted = false;
    this._open = false;
    this._autoId = 0;

    this.tutorial = new Tutorial({ getKeyLabel, onChange: () => this._sync() });

    if (view !== undefined) {
      this.view = view;
    } else {
      this.view = typeof document !== 'undefined' ? new PhoneView() : null;
    }
    // Clique numa conversa da lista abre a conversa. Uma view que já tenha
    // seu próprio tratamento continua com ele.
    if (this.view && !this.view.onSelect) {
      this.view.onSelect = from => this.selectConversation(from);
    }
    this._sync();
  }

  // -------------------------------------------------------------------
  // Abrir / fechar
  // -------------------------------------------------------------------
  get isOpen() { return this._open; }

  open() {
    if (this._open) return false;
    this._open = true;
    // Abrir é ler: a conversa que está na tela deixa de ter pendência. As
    // outras continuam marcadas até o jogador entrar nelas.
    this._markConversationRead(this.selected);
    this._sync();
    this.onOpen?.();
    return true;
  }

  close() {
    if (!this._open) return false;
    this._open = false;
    this._sync();
    this.onClose?.();
    return true;
  }

  toggle() {
    return this._open ? (this.close(), false) : (this.open(), true);
  }

  // -------------------------------------------------------------------
  // Mensagens
  // -------------------------------------------------------------------
  get unreadCount() {
    return this.messages.reduce((n, m) => n + (m.read ? 0 : 1), 0);
  }

  get conversations() {
    const byContact = new Map();
    for (const m of this.messages) {
      if (!byContact.has(m.from)) byContact.set(m.from, []);
      byContact.get(m.from).push(m);
    }
    return Array.from(byContact, ([from, msgs]) => ({
      from,
      messages: msgs,
      unread: msgs.reduce((n, m) => n + (m.read ? 0 : 1), 0),
      last: msgs[msgs.length - 1],
    }));
  }

  getConversation(from) {
    return this.messages.filter(m => m.from === from);
  }

  /**
   * Enfileira uma mensagem como não lida e devolve o objeto guardado.
   * @param {{id?: string, from?: string, text: string, at?: string}} msg
   */
  pushMessage(msg) {
    const m = plainObject(msg);
    if (!m || typeof m.text !== 'string') return null;
    // Id repetido significa a mesma mensagem chegando duas vezes (save
    // recarregado, agendamento duplicado). Uma conversa não pode ficar com a
    // mesma fala dobrada, então a segunda é ignorada.
    if (typeof m.id === 'string' && m.id && this.messages.some(x => x.id === m.id)) return null;
    const stored = {
      id: typeof m.id === 'string' && m.id ? m.id : `msg_${++this._autoId}`,
      from: typeof m.from === 'string' && m.from ? m.from : PARENTS_CONTACT,
      text: m.text,
      at: typeof m.at === 'string' ? m.at : (this.getTimeLabel?.() ?? ''),
      read: false,
    };
    this.messages.push(stored);
    if (!this.selected) this.selected = stored.from;
    // Mensagem que chega na conversa que já está aberta na tela conta como
    // lida na hora — o jogador está olhando pra ela.
    if (this._open && this.selected === stored.from) this._markRead(stored);
    this._sync();
    // Mensagem que já nasceu lida (o jogador estava com a conversa na tela)
    // não merece aviso nenhum: ele acabou de vê-la chegar.
    if (!stored.read) {
      this.onNotify?.(stored);
      this.view?.notify?.(stored);
    }
    return stored;
  }

  /**
   * Agenda uma mensagem para daqui a N segundos de jogo (ver `update`).
   */
  scheduleMessage(msg, delaySeconds = 0) {
    const m = plainObject(msg);
    if (!m || typeof m.text !== 'string') return false;
    const delay = Number.isFinite(delaySeconds) ? Math.max(0, delaySeconds) : 0;
    this.pending.push({ remaining: delay, msg: { ...m } });
    return true;
  }

  // A primeira conversa do jogo. Idempotente: chamar de novo (ou depois de
  // carregar um save) não reenvia nada.
  // Os `delay` de PARENTS_MESSAGES são o intervalo depois da mensagem
  // anterior (é assim que alguém digita: uma, pausa, outra), então viram
  // tempo acumulado desde agora. `delay` sobrescreve só a espera da primeira.
  startParentsConversation({ delay = null } = {}) {
    if (this.parentsStarted) return false;
    this.parentsStarted = true;
    let acc = 0;
    PARENTS_MESSAGES.forEach((m, i) => {
      acc += i === 0 && Number.isFinite(delay) ? Math.max(0, delay) : m.delay;
      this.scheduleMessage({ id: m.id, from: m.from, text: m.text }, acc);
    });
    return true;
  }

  markAllRead() {
    let changed = false;
    for (const m of this.messages) changed = this._markRead(m) || changed;
    if (changed) this._sync();
    return changed;
  }

  _markRead(m) {
    if (m.read) return false;
    m.read = true;
    this.onMessageRead?.(m);
    return true;
  }

  _markConversationRead(from) {
    if (!from) return false;
    let changed = false;
    for (const m of this.messages) {
      if (m.from === from) changed = this._markRead(m) || changed;
    }
    return changed;
  }

  // Abre uma conversa (e a marca como lida, se o celular estiver na tela).
  selectConversation(from) {
    if (!this.messages.some(m => m.from === from)) return false;
    this.selected = from;
    if (this._open) this._markConversationRead(from);
    this._sync();
    return true;
  }

  // Navegação por teclado dentro do celular (↑ ↓).
  moveSelection(delta) {
    const list = this.conversations;
    if (list.length === 0) return false;
    const at = Math.max(0, list.findIndex(c => c.from === this.selected));
    const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
    const next = list[(((at + step) % list.length) + list.length) % list.length];
    return this.selectConversation(next.from);
  }

  // Texto da mensagem já resolvido pro sexo do personagem — é o que a view
  // pinta e o que o jogo deve usar em qualquer outro lugar.
  messageText(msg) {
    return applyPronouns(msg?.text, this.sex);
  }

  setSex(sex) {
    this.sex = sex || null;
    this._sync();
  }

  // -------------------------------------------------------------------
  // Tempo
  // -------------------------------------------------------------------
  // `dt` em segundos, o mesmo do loop do jogo. Chamada com o jogo pausado ou
  // com dt zerado não move nada — quem decide se o tempo corre é o chamador.
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.pending.length === 0) return;
    const due = [];
    const rest = [];
    for (const p of this.pending) {
      p.remaining -= dt;
      (p.remaining <= 0 ? due : rest).push(p);
    }
    this.pending = rest;
    for (const p of due) this.pushMessage(p.msg);
  }

  // -------------------------------------------------------------------
  // Atalho do tutorial (mantém a dica na tela em dia)
  // -------------------------------------------------------------------
  advanceTutorial(eventId) {
    return this.tutorial.advance(eventId);
  }

  get currentHint() {
    return this.tutorial.currentHint;
  }

  // -------------------------------------------------------------------
  // Persistência
  // -------------------------------------------------------------------
  serialize() {
    return {
      messages: this.messages.map(m => ({ id: m.id, from: m.from, text: m.text, at: m.at, read: m.read })),
      pending: this.pending.map(p => ({ remaining: p.remaining, msg: { ...p.msg } })),
      parentsStarted: this.parentsStarted,
      selected: this.selected,
      tutorial: this.tutorial.serialize(),
    };
  }

  // Campo ausente ou inválido = mantém o padrão daquele campo. Entrada
  // quebrada dentro de uma lista é descartada (mesma política do saveSchema),
  // não "consertada".
  deserialize(data) {
    const d = plainObject(data);
    if (!d) return;

    if (Array.isArray(d.messages)) {
      // O contador de ids automáticos vem antes de montar a lista: um
      // "msg_N" gravado no save não pode ser reemitido pra outra mensagem
      // (nem pra uma do próprio save que veio sem id).
      for (const raw of d.messages) {
        const id = plainObject(raw)?.id;
        const n = typeof id === 'string' ? /^msg_(\d+)$/.exec(id) : null;
        if (n) this._autoId = Math.max(this._autoId, Number(n[1]));
      }
      const out = [];
      for (const raw of d.messages) {
        const m = plainObject(raw);
        if (!m || typeof m.text !== 'string') continue;
        out.push({
          id: typeof m.id === 'string' && m.id ? m.id : `msg_${++this._autoId}`,
          from: typeof m.from === 'string' && m.from ? m.from : PARENTS_CONTACT,
          text: m.text,
          at: typeof m.at === 'string' ? m.at : '',
          read: m.read === true,
        });
      }
      this.messages = out;
    }

    if (Array.isArray(d.pending)) {
      const out = [];
      for (const raw of d.pending) {
        const p = plainObject(raw);
        const m = plainObject(p?.msg);
        if (!p || !m || typeof m.text !== 'string' || !Number.isFinite(p.remaining)) continue;
        out.push({ remaining: Math.max(0, p.remaining), msg: { ...m } });
      }
      this.pending = out;
    }

    if (typeof d.parentsStarted === 'boolean') this.parentsStarted = d.parentsStarted;
    // Só aceita como conversa aberta um contato que existe nas mensagens.
    if (typeof d.selected === 'string' && this.messages.some(m => m.from === d.selected)) {
      this.selected = d.selected;
    } else if (!this.selected && this.messages.length > 0) {
      this.selected = this.messages[0].from;
    }
    this.tutorial.deserialize(d.tutorial);
    this._sync();
  }

  // -------------------------------------------------------------------
  _sync() {
    this.view?.render?.(this.viewState());
  }

  // Tudo que a view precisa saber, e nada além disso — inclusive já com os
  // pronomes resolvidos, pra view não ter regra de conteúdo nenhuma.
  viewState() {
    const conversations = this.conversations.map(c => ({
      from: c.from,
      unread: c.unread,
      preview: this.messageText(c.last),
      at: c.last?.at || '',
      selected: c.from === this.selected,
    }));
    const thread = this.getConversation(this.selected).map(m => ({
      id: m.id,
      at: m.at,
      read: m.read,
      text: this.messageText(m),
    }));
    return {
      open: this._open,
      unreadCount: this.unreadCount,
      conversations,
      thread,
      threadName: this.selected || '',
      hint: this.tutorial.currentHint,
      keyLabel: keyLabelFor(this.getKeyLabel, 'phone'),
    };
  }
}

// ---------------------------------------------------------------------------
// PhoneView — a única parte que fala com o DOM.
//
// Elementos ausentes não são erro: a view só ignora o pedaço que não existe.
// Isso mantém o módulo utilizável em páginas de teste sem o HUD inteiro.
// ---------------------------------------------------------------------------
export class PhoneView {
  constructor(doc = typeof document !== 'undefined' ? document : null) {
    this.doc = doc;
    const byId = id => doc?.getElementById(id) || null;
    this.root = byId('phone');
    this.list = byId('phone-conversations');
    this.thread = byId('phone-thread');
    this.threadName = byId('phone-thread-name');
    this.stamp = byId('phone-stamp');
    this.badge = byId('phone-badge');
    this.badgeCount = byId('phone-badge-count');
    this.badgeKey = byId('phone-badge-key');
    this.hintEl = byId('tutorial-hint');
    this._audio = null;
    this._pulseTimer = null;
  }

  render(state) {
    if (!state) return;
    this.root?.classList.toggle('hidden', !state.open);

    if (this.badge) {
      this.badge.classList.toggle('hidden', state.unreadCount === 0);
      if (this.badgeCount) this.badgeCount.textContent = String(state.unreadCount);
      // A tecla no aviso é a real, não uma letra fixa na marcação: o dia em
      // que o celular virar tecla remapeável, isto continua certo.
      if (this.badgeKey) this.badgeKey.textContent = state.keyLabel || '';
    }
    if (this.stamp) {
      this.stamp.textContent = state.unreadCount > 0
        ? `${state.unreadCount} não ${state.unreadCount === 1 ? 'lida' : 'lidas'}`
        : 'Tudo lido';
    }

    if (this.list) {
      this.list.innerHTML = state.conversations.map(c => `
        <button class="phone-row${c.selected ? ' selected' : ''}" data-contact="${escapeHtml(c.from)}">
          <span class="phone-row-main">
            <strong>${escapeHtml(c.from)}</strong>
            <span>${escapeHtml(c.preview)}</span>
          </span>
          <span class="phone-row-side">
            <span class="phone-row-at">${escapeHtml(c.at)}</span>
            ${c.unread > 0 ? `<span class="phone-dot">${escapeHtml(c.unread)}</span>` : ''}
          </span>
        </button>
      `).join('');
      for (const el of this.list.querySelectorAll('[data-contact]')) {
        el.onclick = () => this.onSelect?.(el.dataset.contact);
      }
    }

    if (this.threadName) this.threadName.textContent = state.threadName;
    if (this.thread) {
      this.thread.innerHTML = state.thread.length === 0
        ? '<div class="phone-empty">Nenhuma mensagem ainda.</div>'
        : state.thread.map(m => `
            <div class="phone-msg${m.read ? '' : ' unread'}">
              <div class="phone-msg-at">${escapeHtml(m.at)}</div>
              <div class="phone-msg-text">${escapeHtml(m.text)}</div>
            </div>
          `).join('');
      this.thread.scrollTop = this.thread.scrollHeight;
    }

    this.renderHint(state.hint);
  }

  renderHint(text) {
    if (!this.hintEl) return;
    this.hintEl.textContent = text || '';
    this.hintEl.classList.toggle('hidden', !text);
  }

  // Aviso discreto de mensagem nova: o badge pisca e toca um bipe curto.
  notify() {
    if (this.badge) {
      this.badge.classList.remove('hidden');
      this.badge.classList.remove('ping');
      // Reinicia a animação mesmo se ela ainda estiver rodando.
      void this.badge.offsetWidth;
      this.badge.classList.add('ping');
      clearTimeout(this._pulseTimer);
      this._pulseTimer = setTimeout(() => this.badge.classList.remove('ping'), 1600);
    }
    this._chime();
  }

  // Bipe de dois tons gerado na hora (WebAudio) — nenhum arquivo de áudio
  // novo e nenhuma dependência. Falha em silêncio onde o áudio não existe ou
  // ainda não foi liberado pelo navegador.
  _chime() {
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return;
      this._audio ||= new Ctx();
      if (this._audio.state === 'suspended') this._audio.resume?.();
      const t = this._audio.currentTime;
      const osc = this._audio.createOscillator();
      const gain = this._audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(1174, t + 0.1);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(gain);
      gain.connect(this._audio.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    } catch {
      // Áudio é enfeite: nunca pode derrubar a chegada de uma mensagem.
    }
  }
}
