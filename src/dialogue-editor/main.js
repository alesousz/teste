import { NPC_DEFS, QUESTS, ITEM_DEFS } from '../data.js';
import {
  CONDITION_TYPES,
  SELECTABLE_CONDITION_TYPES,
  EFFECT_TYPES,
  RELATIONSHIP_OPERATORS,
  NO_EFFECT,
  conditionMeta,
  effectMeta,
  isKnownConditionType,
  isKnownEffectType,
  retypeCondition,
  retypeEffect,
  ruleFromJson,
  ruleToJson,
  flagValueKind,
  flagValueFromKind,
} from './vocabulary.js';

const DRAFT_KEY = 'dialogue-editor-draft';

// Tipo padrão de uma condição recém-criada.
const DEFAULT_CONDITION_TYPE = SELECTABLE_CONDITION_TYPES[0].type;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Um tipo que este editor não conhece nunca é escondido nem trocado por outro:
// ganha uma opção própria no select, marcada como desconhecida, e o objeto
// original fica intacto no rascunho. Sem isso o navegador selecionaria a
// primeira opção da lista e o editor mostraria um tipo que não é o do dado.
function unknownOptionHtml(meta) {
  return meta.unknown ? `<option value="${escapeHtml(meta.type)}" selected>${escapeHtml(meta.label)}</option>` : '';
}

// Mostra, em texto puro, o que o editor não sabe editar — pra quem estiver
// mexendo ver que existe conteúdo ali antes de decidir trocar o tipo.
function unknownPayloadHtml(obj, dropKeys = []) {
  const rest = Object.fromEntries(Object.entries(obj).filter(([k]) => k !== 'type' && !dropKeys.includes(k)));
  return `<p class="hint unknown-payload">Este editor não conhece este tipo. O conteúdo está preservado e será exportado como está:<br><code>${escapeHtml(JSON.stringify(rest))}</code></p>`;
}

// Trocar o tipo de algo que o editor não entende é a única operação capaz de
// destruir um dado preservado — então ela é sempre explícita.
function confirmLeavingUnknown(currentType) {
  return confirm(`"${currentType}" é um tipo que este editor não conhece, e os campos dele serão descartados se você trocar o tipo agora.\n\nTrocar mesmo assim?`);
}

export class DialogueEditorApp {
  constructor() {
    this.trees = null;
    this.currentNpcId = null;
    this.currentNodeId = null;
    this._editRules = [];

    this._bindStaticEvents();
    this._init();
  }

  async _init() {
    const draft = this._loadDraft();
    if (draft) {
      this.trees = draft;
    } else {
      await this._loadFromGameData(false);
    }
    this._renderNpcSelect();
    this._selectNpc(NPC_DEFS[0].id);
  }

  _loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  _persistDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(this.trees));
    const status = document.getElementById('save-status');
    status.textContent = 'Rascunho salvo automaticamente';
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => { status.textContent = ''; }, 2000);
  }

  async _loadFromGameData(confirmFirst = true) {
    if (confirmFirst && !confirm('Isso substitui todo o rascunho atual pelos diálogos que estão hoje no jogo. Continuar?')) return;
    const res = await fetch('src/data/dialogues.json');
    this.trees = await res.json();
    this._persistDraft();
    if (confirmFirst) {
      this._renderNpcSelect();
      this._selectNpc(this.currentNpcId && this.trees[this.currentNpcId] ? this.currentNpcId : NPC_DEFS[0].id);
    }
  }

  _bindStaticEvents() {
    document.getElementById('btn-reload-game-data').onclick = () => this._loadFromGameData(true);
    document.getElementById('btn-export').onclick = () => this._exportJson();
    document.getElementById('btn-close-export').onclick = () => document.getElementById('export-modal').classList.add('hidden');
    document.getElementById('npc-select').onchange = e => this._selectNpc(e.target.value);
    document.getElementById('btn-add-rule').onclick = () => this._addRule();
    document.getElementById('btn-add-node').onclick = () => this._addNode();
    document.getElementById('btn-add-option').onclick = () => this._addOption();
    document.getElementById('btn-delete-node').onclick = () => this._deleteNode(this.currentNodeId);
    document.getElementById('node-text').addEventListener('input', e => {
      this._currentTree().nodes[this.currentNodeId].text = e.target.value;
      this._persistDraft();
      this._renderNodeList();
    });
    document.getElementById('start-default-select').onchange = e => {
      this._currentTree().startDefault = e.target.value;
      this._persistDraft();
    };
  }

  _currentTree() {
    return this.trees[this.currentNpcId];
  }

  _renderNpcSelect() {
    const select = document.getElementById('npc-select');
    select.innerHTML = NPC_DEFS.map(n => `<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('');
  }

  _selectNpc(npcId) {
    this.currentNpcId = npcId;
    document.getElementById('npc-select').value = npcId;
    if (!this.trees[npcId]) this.trees[npcId] = { startRules: [], startDefault: null, nodes: {} };
    this._editRules = (this._currentTree().startRules || []).map(ruleFromJson);
    const nodeIds = Object.keys(this._currentTree().nodes);
    this.currentNodeId = nodeIds[0] || null;
    this._renderStartRules();
    this._renderNodeList();
    this._renderNodeEditor();
  }

  // -------------------------------------------------------------------
  // Regras de início
  // -------------------------------------------------------------------
  _renderStartRules() {
    const tree = this._currentTree();
    const nodeIds = Object.keys(tree.nodes);
    const list = document.getElementById('start-rules-list');
    list.innerHTML = this._editRules.map((rule, ri) => `
      <div class="rule-row" data-ri="${ri}">
        <div class="rule-row-head">
          <strong>Regra ${ri + 1}</strong>
          <button class="btn-icon" data-act="del-rule" data-ri="${ri}">✕</button>
        </div>
        <div class="rule-conditions">
          ${rule.conditions.map((cond, ci) => this._renderConditionRow(rule, cond, ri, ci)).join('')}
        </div>
        <button class="btn-secondary btn-icon" data-act="add-cond" data-ri="${ri}">+ condição (E)</button>
        <label class="field" style="margin-top:8px">
          → abre no nó
          <select data-act="rule-node" data-ri="${ri}">
            ${nodeIds.map(id => `<option value="${id}" ${id === rule.node ? 'selected' : ''}>${id}</option>`).join('')}
          </select>
        </label>
      </div>
    `).join('') || '<p class="hint">Nenhuma regra — sempre abre no nó padrão.</p>';

    list.querySelectorAll('[data-act="del-rule"]').forEach(btn => {
      btn.onclick = () => { this._editRules.splice(Number(btn.dataset.ri), 1); this._commitRules(); };
    });
    list.querySelectorAll('[data-act="add-cond"]').forEach(btn => {
      btn.onclick = () => {
        this._editRules[Number(btn.dataset.ri)].conditions.push({ type: DEFAULT_CONDITION_TYPE, negate: false });
        this._commitRules();
      };
    });
    list.querySelectorAll('[data-act="rule-node"]').forEach(sel => {
      sel.onchange = () => { this._editRules[Number(sel.dataset.ri)].node = sel.value; this._commitRules(); };
    });
    list.querySelectorAll('[data-act="cond-type"]').forEach(sel => {
      sel.onchange = () => {
        const { ri, ci } = sel.dataset;
        const atual = this._editRules[ri].conditions[ci];
        if (sel.value === atual.type) return;
        if (!isKnownConditionType(atual.type) && !confirmLeavingUnknown(atual.type)) {
          this._renderStartRules(); // devolve o select pro tipo original
          return;
        }
        this._editRules[ri].conditions[ci] = retypeCondition(atual, sel.value);
        this._commitRules();
      };
    });
    list.querySelectorAll('[data-act="cond-negate"]').forEach(cb => {
      cb.onchange = () => { this._editRules[cb.dataset.ri].conditions[cb.dataset.ci].negate = cb.checked; this._commitRules(); };
    });
    list.querySelectorAll('[data-act="cond-quest"]').forEach(sel => {
      sel.onchange = () => { this._editRules[sel.dataset.ri].conditions[sel.dataset.ci].quest = sel.value; this._commitRules(); };
    });
    list.querySelectorAll('[data-act="cond-objective"]').forEach(sel => {
      sel.onchange = () => { this._editRules[sel.dataset.ri].conditions[sel.dataset.ci].objective = sel.value; this._commitRules(); };
    });
    list.querySelectorAll('[data-act="cond-flag"]').forEach(inp => {
      inp.oninput = () => { this._editRules[inp.dataset.ri].conditions[inp.dataset.ci].flag = inp.value; this._commitRulesQuiet(); };
    });
    list.querySelectorAll('[data-act="cond-flag-kind"]').forEach(sel => {
      sel.onchange = () => {
        const cond = this._editRules[sel.dataset.ri].conditions[sel.dataset.ci];
        cond.value = flagValueFromKind(sel.value, typeof cond.value === 'string' ? cond.value : '');
        this._commitRules();
      };
    });
    list.querySelectorAll('[data-act="cond-flag-text"]').forEach(inp => {
      inp.oninput = () => { this._editRules[inp.dataset.ri].conditions[inp.dataset.ci].value = inp.value; this._commitRulesQuiet(); };
    });
    list.querySelectorAll('[data-act="cond-npc"]').forEach(sel => {
      sel.onchange = () => { this._editRules[sel.dataset.ri].conditions[sel.dataset.ci].npc = sel.value; this._commitRules(); };
    });
    list.querySelectorAll('[data-act="cond-operator"]').forEach(sel => {
      sel.onchange = () => { this._editRules[sel.dataset.ri].conditions[sel.dataset.ci].operator = sel.value; this._commitRules(); };
    });
    list.querySelectorAll('[data-act="cond-relvalue"]').forEach(inp => {
      inp.oninput = () => {
        const cond = this._editRules[inp.dataset.ri].conditions[inp.dataset.ci];
        // Campo vazio some do JSON em vez de virar 0 — 0 é um relacionamento
        // válido e não pode ser inventado a partir de "não preenchido".
        if (inp.value === '') delete cond.value; else cond.value = Number(inp.value);
        this._commitRulesQuiet();
      };
    });
    list.querySelectorAll('[data-act="del-cond"]').forEach(btn => {
      btn.onclick = () => {
        const { ri, ci } = btn.dataset;
        this._editRules[ri].conditions.splice(Number(ci), 1);
        this._commitRules();
      };
    });

    this._renderStartDefaultSelect();
  }

  _renderConditionRow(rule, cond, ri, ci) {
    const meta = conditionMeta(cond.type);
    const questOptions = Object.values(QUESTS).map(q => `<option value="${q.id}" ${q.id === cond.quest ? 'selected' : ''}>${escapeHtml(q.title)}</option>`).join('');
    const objectiveOptions = cond.quest && QUESTS[cond.quest]
      ? QUESTS[cond.quest].objectives.map(o => `<option value="${o.id}" ${o.id === cond.objective ? 'selected' : ''}>${escapeHtml(o.text)}</option>`).join('')
      : '';
    const kind = flagValueKind(cond.value);
    return `
      <div class="condition-row">
        <select data-act="cond-type" data-ri="${ri}" data-ci="${ci}">
          ${unknownOptionHtml(meta)}
          ${SELECTABLE_CONDITION_TYPES.map(c => `<option value="${c.type}" ${c.type === cond.type ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
        ${meta.unknown ? unknownPayloadHtml(cond, ['negate']) : ''}
        ${meta.fields.includes('quest') ? `<select data-act="cond-quest" data-ri="${ri}" data-ci="${ci}"><option value="">(escolha a missão)</option>${questOptions}</select>` : ''}
        ${meta.fields.includes('objective') ? `<select data-act="cond-objective" data-ri="${ri}" data-ci="${ci}"><option value="">(escolha o objetivo)</option>${objectiveOptions}</select>` : ''}
        ${meta.type === 'flag' ? `
          <input type="text" data-act="cond-flag" data-ri="${ri}" data-ci="${ci}" value="${escapeHtml(cond.flag)}" placeholder="nome da flag (ex: ja_conheceu)" />
          <select data-act="cond-flag-kind" data-ri="${ri}" data-ci="${ci}">
            <option value="true" ${kind === 'true' ? 'selected' : ''}>vale verdadeiro</option>
            <option value="false" ${kind === 'false' ? 'selected' : ''}>vale falso</option>
            <option value="text" ${kind === 'text' ? 'selected' : ''}>vale este texto…</option>
          </select>
          ${kind === 'text' ? `<input type="text" data-act="cond-flag-text" data-ri="${ri}" data-ci="${ci}" value="${escapeHtml(cond.value)}" placeholder="valor exato" />` : ''}
        ` : ''}
        ${meta.type === 'relationship' ? `
          <select data-act="cond-npc" data-ri="${ri}" data-ci="${ci}">
            <option value="">(escolha o NPC)</option>
            ${NPC_DEFS.map(n => `<option value="${n.id}" ${n.id === cond.npc ? 'selected' : ''}>${escapeHtml(n.name)}</option>`).join('')}
          </select>
          <select data-act="cond-operator" data-ri="${ri}" data-ci="${ci}">
            ${RELATIONSHIP_OPERATORS.map(o => `<option value="${escapeHtml(o.op)}" ${o.op === cond.operator ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
          <input type="number" data-act="cond-relvalue" data-ri="${ri}" data-ci="${ci}" value="${typeof cond.value === 'number' ? cond.value : ''}" placeholder="valor" />
        ` : ''}
        <div class="negate-row">
          <label class="negate"><input type="checkbox" data-act="cond-negate" data-ri="${ri}" data-ci="${ci}" ${cond.negate ? 'checked' : ''}/> negar (NÃO)</label>
          <button class="btn-icon" data-act="del-cond" data-ri="${ri}" data-ci="${ci}">✕</button>
        </div>
      </div>
    `;
  }

  _commitRules() {
    this._commitRulesQuiet();
    this._renderStartRules();
  }

  // Grava sem redesenhar. É o que os campos de texto usam: redesenhar a cada
  // tecla tiraria o foco de quem está digitando.
  _commitRulesQuiet() {
    this._currentTree().startRules = this._editRules.map(ruleToJson);
    this._persistDraft();
  }

  _addRule() {
    const nodeIds = Object.keys(this._currentTree().nodes);
    if (nodeIds.length === 0) { alert('Crie um nó antes de adicionar uma regra.'); return; }
    this._editRules.push({ conditions: [{ type: DEFAULT_CONDITION_TYPE, negate: false }], node: nodeIds[0] });
    this._commitRules();
  }

  _renderStartDefaultSelect() {
    const tree = this._currentTree();
    const nodeIds = Object.keys(tree.nodes);
    const select = document.getElementById('start-default-select');
    select.innerHTML = nodeIds.map(id => `<option value="${id}" ${id === tree.startDefault ? 'selected' : ''}>${id}</option>`).join('');
    if (!tree.startDefault && nodeIds.length) { tree.startDefault = nodeIds[0]; this._persistDraft(); }
  }

  // -------------------------------------------------------------------
  // Lista de nós
  // -------------------------------------------------------------------
  _renderNodeList() {
    const tree = this._currentTree();
    const list = document.getElementById('node-list');
    const ids = Object.keys(tree.nodes);
    list.innerHTML = ids.map(id => `
      <div class="node-item ${id === this.currentNodeId ? 'selected' : ''}" data-id="${id}">
        <span class="node-id">${id}</span>
        <span class="node-preview">${escapeHtml(tree.nodes[id].text).slice(0, 40)}</span>
      </div>
    `).join('') || '<p class="hint">Nenhum nó ainda.</p>';
    list.querySelectorAll('.node-item').forEach(el => {
      el.onclick = () => this._selectNode(el.dataset.id);
    });
  }

  _selectNode(id) {
    this.currentNodeId = id;
    this._renderNodeList();
    this._renderNodeEditor();
  }

  _addNode() {
    const id = prompt('ID do novo nó (curto, sem espaços, ex: "a4"):');
    if (!id) return;
    const tree = this._currentTree();
    if (tree.nodes[id]) { alert('Já existe um nó com esse ID.'); return; }
    tree.nodes[id] = { text: '', options: [] };
    this._persistDraft();
    this._selectNode(id);
    this._renderStartRules(); // novo nó passa a estar disponível como alvo de regra
  }

  _deleteNode(id) {
    if (!id) return;
    if (!confirm(`Excluir o nó "${id}"? Opções de outros nós que apontam pra ele vão precisar ser corrigidas manualmente.`)) return;
    const tree = this._currentTree();
    delete tree.nodes[id];
    if (tree.startDefault === id) tree.startDefault = Object.keys(tree.nodes)[0] || null;
    this.currentNodeId = Object.keys(tree.nodes)[0] || null;
    this._persistDraft();
    this._renderNodeList();
    this._renderNodeEditor();
    this._renderStartRules();
  }

  // -------------------------------------------------------------------
  // Editor do nó selecionado
  // -------------------------------------------------------------------
  _renderNodeEditor() {
    const empty = document.getElementById('node-editor-empty');
    const body = document.getElementById('node-editor-body');
    document.getElementById('editing-node-id').textContent = this.currentNodeId || '—';
    if (!this.currentNodeId) {
      empty.classList.remove('hidden');
      body.classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    body.classList.remove('hidden');

    const node = this._currentTree().nodes[this.currentNodeId];
    document.getElementById('node-text').value = node.text;

    const otherNodeIds = Object.keys(this._currentTree().nodes);
    const list = document.getElementById('options-list');
    list.innerHTML = node.options.map((opt, oi) => this._renderOptionRow(opt, oi, otherNodeIds)).join('') || '<p class="hint">Nenhuma opção — a conversa não tem como continuar daqui.</p>';

    list.querySelectorAll('[data-act="opt-label"]').forEach(inp => {
      inp.oninput = () => { node.options[inp.dataset.oi].label = inp.value; this._persistDraft(); this._renderNodeList(); };
    });
    list.querySelectorAll('[data-act="opt-next"]').forEach(sel => {
      sel.onchange = () => { node.options[sel.dataset.oi].next = sel.value === '__end__' ? null : sel.value; this._persistDraft(); };
    });
    list.querySelectorAll('[data-act="opt-effect"]').forEach(sel => {
      sel.onchange = () => {
        const opt = node.options[sel.dataset.oi];
        const atual = opt.effect?.type ?? NO_EFFECT;
        if (sel.value === atual) return;
        if (atual && !isKnownEffectType(atual) && !confirmLeavingUnknown(atual)) {
          this._renderNodeEditor(); // devolve o select pro tipo original
          return;
        }
        opt.effect = retypeEffect(opt.effect, sel.value);
        if (opt.effect === undefined) delete opt.effect;
        this._persistDraft();
        this._renderNodeEditor();
      };
    });
    list.querySelectorAll('[data-act="opt-effect-quest"]').forEach(sel => {
      sel.onchange = () => { node.options[sel.dataset.oi].effect.quest = sel.value; this._persistDraft(); this._renderNodeEditor(); };
    });
    list.querySelectorAll('[data-act="opt-effect-objective"]').forEach(sel => {
      sel.onchange = () => { node.options[sel.dataset.oi].effect.objective = sel.value; this._persistDraft(); };
    });
    list.querySelectorAll('[data-act="opt-effect-item"]').forEach(sel => {
      sel.onchange = () => { node.options[sel.dataset.oi].effect.item = sel.value; this._persistDraft(); };
    });
    list.querySelectorAll('[data-act="opt-effect-cost"]').forEach(inp => {
      inp.oninput = () => {
        const opt = node.options[inp.dataset.oi];
        const v = inp.value === '' ? undefined : Number(inp.value);
        if (v === undefined) delete opt.effect.cost; else opt.effect.cost = v;
        this._persistDraft();
      };
    });
    list.querySelectorAll('[data-act="opt-minmoney"]').forEach(inp => {
      inp.oninput = () => {
        const v = inp.value === '' ? undefined : Number(inp.value);
        if (v === undefined) delete node.options[inp.dataset.oi].minMoney; else node.options[inp.dataset.oi].minMoney = v;
        this._persistDraft();
      };
    });
    list.querySelectorAll('[data-act="opt-maxhunger"]').forEach(inp => {
      inp.oninput = () => {
        const v = inp.value === '' ? undefined : Number(inp.value);
        if (v === undefined) delete node.options[inp.dataset.oi].maxHunger; else node.options[inp.dataset.oi].maxHunger = v;
        this._persistDraft();
      };
    });
    list.querySelectorAll('[data-act="opt-effect-flag"]').forEach(inp => {
      inp.oninput = () => { node.options[inp.dataset.oi].effect.flag = inp.value; this._persistDraft(); };
    });
    list.querySelectorAll('[data-act="opt-effect-flag-kind"]').forEach(sel => {
      sel.onchange = () => {
        const effect = node.options[sel.dataset.oi].effect;
        effect.value = flagValueFromKind(sel.value, typeof effect.value === 'string' ? effect.value : '');
        this._persistDraft();
        this._renderNodeEditor();
      };
    });
    list.querySelectorAll('[data-act="opt-effect-flag-text"]').forEach(inp => {
      inp.oninput = () => { node.options[inp.dataset.oi].effect.value = inp.value; this._persistDraft(); };
    });
    list.querySelectorAll('[data-act="opt-effect-npc"]').forEach(sel => {
      sel.onchange = () => { node.options[sel.dataset.oi].effect.npc = sel.value; this._persistDraft(); };
    });
    list.querySelectorAll('[data-act="opt-effect-amount"]').forEach(inp => {
      inp.oninput = () => {
        const effect = node.options[inp.dataset.oi].effect;
        // Vazio some do JSON: 0 seria um delta válido e não pode ser inventado.
        if (inp.value === '') delete effect.amount; else effect.amount = Number(inp.value);
        this._persistDraft();
      };
    });
    list.querySelectorAll('[data-act="opt-effect-note"]').forEach(inp => {
      inp.oninput = () => {
        const effect = node.options[inp.dataset.oi].effect;
        // `note` é opcional: sem texto, o motor só muda o número sem registrar
        // linha no histórico do Diário.
        if (inp.value === '') delete effect.note; else effect.note = inp.value;
        this._persistDraft();
      };
    });
    list.querySelectorAll('[data-act="del-opt"]').forEach(btn => {
      btn.onclick = () => { node.options.splice(Number(btn.dataset.oi), 1); this._persistDraft(); this._renderNodeEditor(); };
    });
  }

  _renderOptionRow(opt, oi, otherNodeIds) {
    const effectType = opt.effect?.type ?? NO_EFFECT;
    const meta = effectMeta(effectType);
    const flagKind = flagValueKind(opt.effect?.value);
    const questOptions = Object.values(QUESTS).map(q => `<option value="${q.id}" ${q.id === opt.effect?.quest ? 'selected' : ''}>${escapeHtml(q.title)}</option>`).join('');
    const objectiveOptions = opt.effect?.quest && QUESTS[opt.effect.quest]
      ? QUESTS[opt.effect.quest].objectives.map(o => `<option value="${o.id}" ${o.id === opt.effect?.objective ? 'selected' : ''}>${escapeHtml(o.text)}</option>`).join('')
      : '';
    return `
      <div class="option-row" data-oi="${oi}">
        <div class="option-row-head">
          <strong>Opção ${oi + 1}</strong>
          <button class="btn-icon" data-act="del-opt" data-oi="${oi}">✕</button>
        </div>
        <div class="option-row-fields">
          <label class="field">Texto do botão
            <input type="text" data-act="opt-label" data-oi="${oi}" value="${escapeHtml(opt.label)}" />
          </label>
          <label class="field">Leva pro nó
            <select data-act="opt-next" data-oi="${oi}">
              <option value="__end__" ${opt.next === null ? 'selected' : ''}>(Encerrar conversa)</option>
              ${otherNodeIds.map(id => `<option value="${id}" ${id === opt.next ? 'selected' : ''}>${id}</option>`).join('')}
            </select>
          </label>
          <label class="field">Efeito
            <select data-act="opt-effect" data-oi="${oi}">
              ${unknownOptionHtml(meta)}
              <option value="${NO_EFFECT}" ${meta.none ? 'selected' : ''}>(Nenhum)</option>
              ${EFFECT_TYPES.map(e => `<option value="${e.type}" ${e.type === effectType ? 'selected' : ''}>${e.label}</option>`).join('')}
            </select>
          </label>
          ${meta.unknown ? unknownPayloadHtml(opt.effect) : ''}
          ${meta.fields.includes('quest') ? `<label class="field">Missão<select data-act="opt-effect-quest" data-oi="${oi}"><option value="">(escolha)</option>${questOptions}</select></label>` : ''}
          ${meta.fields.includes('objective') ? `<label class="field">Objetivo<select data-act="opt-effect-objective" data-oi="${oi}"><option value="">(escolha)</option>${objectiveOptions}</select></label>` : ''}
          ${meta.fields.includes('item') ? `<label class="field">Item<select data-act="opt-effect-item" data-oi="${oi}"><option value="">(escolha)</option>${Object.values(ITEM_DEFS).map(it => `<option value="${it.id}" ${it.id === opt.effect?.item ? 'selected' : ''}>${it.icon} ${escapeHtml(it.name)}</option>`).join('')}</select></label>` : ''}
          ${meta.fields.includes('cost') ? `<label class="field">Custo (R$)<input type="number" data-act="opt-effect-cost" data-oi="${oi}" value="${opt.effect?.cost ?? ''}" placeholder="grátis" /></label>` : ''}
          ${meta.type === 'setFlag' ? `
            <label class="field">Flag<input type="text" data-act="opt-effect-flag" data-oi="${oi}" value="${escapeHtml(opt.effect?.flag)}" placeholder="nome da flag (ex: ja_conheceu)" /></label>
            <label class="field">Valor gravado
              <select data-act="opt-effect-flag-kind" data-oi="${oi}">
                <option value="true" ${flagKind === 'true' ? 'selected' : ''}>verdadeiro</option>
                <option value="false" ${flagKind === 'false' ? 'selected' : ''}>falso</option>
                <option value="text" ${flagKind === 'text' ? 'selected' : ''}>este texto…</option>
              </select>
            </label>
            ${flagKind === 'text' ? `<label class="field">Texto<input type="text" data-act="opt-effect-flag-text" data-oi="${oi}" value="${escapeHtml(opt.effect?.value)}" placeholder="valor exato" /></label>` : ''}
          ` : ''}
          ${meta.type === 'changeRelationship' ? `
            <label class="field">NPC
              <select data-act="opt-effect-npc" data-oi="${oi}">
                <option value="">(escolha)</option>
                ${NPC_DEFS.map(n => `<option value="${n.id}" ${n.id === opt.effect?.npc ? 'selected' : ''}>${escapeHtml(n.name)}</option>`).join('')}
              </select>
            </label>
            <label class="field">Quanto muda (negativo piora)<input type="number" data-act="opt-effect-amount" data-oi="${oi}" value="${typeof opt.effect?.amount === 'number' ? opt.effect.amount : ''}" placeholder="ex: 1 ou -1" /></label>
            <label class="field">Nota pro Diário (opcional)<input type="text" data-act="opt-effect-note" data-oi="${oi}" value="${escapeHtml(opt.effect?.note ?? '')}" placeholder="ex: Você ajudou com a caixa" /></label>
          ` : ''}
          <div class="option-inline">
            <label class="field">Dinheiro mínimo p/ aparecer
              <input type="number" data-act="opt-minmoney" data-oi="${oi}" value="${opt.minMoney ?? ''}" placeholder="sem mínimo" />
            </label>
            <label class="field">Fome máxima p/ aparecer
              <input type="number" data-act="opt-maxhunger" data-oi="${oi}" value="${opt.maxHunger ?? ''}" placeholder="sem máximo" />
            </label>
          </div>
        </div>
      </div>
    `;
  }

  _addOption() {
    if (!this.currentNodeId) return;
    this._currentTree().nodes[this.currentNodeId].options.push({ label: 'Nova opção', next: null });
    this._persistDraft();
    this._renderNodeEditor();
  }

  // -------------------------------------------------------------------
  // Exportar
  // -------------------------------------------------------------------
  _exportJson() {
    document.getElementById('export-output').value = JSON.stringify(this.trees, null, 2);
    document.getElementById('export-modal').classList.remove('hidden');
  }
}

new DialogueEditorApp();
