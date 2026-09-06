import { NPC_DEFS, QUESTS, ITEM_DEFS } from '../data.js';

const DRAFT_KEY = 'dialogue-editor-draft';

const CONDITION_TYPES = [
  { type: 'questDone', label: 'Missão concluída', fields: ['quest'] },
  { type: 'questActive', label: 'Missão ativa', fields: ['quest'] },
  { type: 'objectiveDone', label: 'Objetivo de missão concluído', fields: ['quest', 'objective'] },
  { type: 'isNight', label: 'É noite', fields: [] },
  { type: 'hasMetPlayer', label: 'Já se conheceram antes', fields: [] },
  { type: 'obligationActive', label: 'Compromisso (emprego/escola) ainda ativo', fields: [] },
  { type: 'obligationHasMisses', label: 'Jogador tem falta registrada', fields: [] },
  { type: 'isPlayerFamily', label: 'É família do jogador', fields: [] },
  { type: 'isPlayerBoss', label: 'É chefe/responsável do jogador', fields: [] },
];

const EFFECT_TYPES = [
  { type: '', label: '(Nenhum)', fields: [] },
  { type: 'giveItem', label: 'Dar item (pro inventário)', fields: ['item', 'cost'] },
  { type: 'startQuest', label: 'Iniciar missão', fields: ['quest'] },
  { type: 'completeObjective', label: 'Completar objetivo de missão', fields: ['quest', 'objective'] },
];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function conditionMeta(type) {
  return CONDITION_TYPES.find(c => c.type === type) || CONDITION_TYPES[0];
}
function effectMeta(type) {
  return EFFECT_TYPES.find(e => e.type === type) || EFFECT_TYPES[0];
}

// Converte uma regra do formato salvo ({if:[...], node}) pro formato de
// edição (condições com uma flag "negate" em vez de aninhar {type:'not'}) —
// cobre 100% do uso real, já que "not" nunca aparece aninhado mais de um
// nível nos dados de hoje.
function ruleFromJson(rule) {
  return {
    node: rule.node,
    conditions: rule.if.map(cond => {
      if (cond.type === 'not') return { ...cond.of, negate: true };
      return { ...cond, negate: false };
    }),
  };
}
function ruleToJson(rule) {
  return {
    node: rule.node,
    if: rule.conditions.map(({ negate, ...cond }) => (negate ? { type: 'not', of: cond } : cond)),
  };
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
        this._editRules[Number(btn.dataset.ri)].conditions.push({ type: CONDITION_TYPES[0].type, negate: false });
        this._commitRules();
      };
    });
    list.querySelectorAll('[data-act="rule-node"]').forEach(sel => {
      sel.onchange = () => { this._editRules[Number(sel.dataset.ri)].node = sel.value; this._commitRules(); };
    });
    list.querySelectorAll('[data-act="cond-type"]').forEach(sel => {
      sel.onchange = () => {
        const { ri, ci } = sel.dataset;
        this._editRules[ri].conditions[ci] = { type: sel.value, negate: this._editRules[ri].conditions[ci].negate };
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
    return `
      <div class="condition-row">
        <select data-act="cond-type" data-ri="${ri}" data-ci="${ci}">
          ${CONDITION_TYPES.map(c => `<option value="${c.type}" ${c.type === cond.type ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
        ${meta.fields.includes('quest') ? `<select data-act="cond-quest" data-ri="${ri}" data-ci="${ci}"><option value="">(escolha a missão)</option>${questOptions}</select>` : ''}
        ${meta.fields.includes('objective') ? `<select data-act="cond-objective" data-ri="${ri}" data-ci="${ci}"><option value="">(escolha o objetivo)</option>${objectiveOptions}</select>` : ''}
        <div class="negate-row">
          <label class="negate"><input type="checkbox" data-act="cond-negate" data-ri="${ri}" data-ci="${ci}" ${cond.negate ? 'checked' : ''}/> negar (NÃO)</label>
          <button class="btn-icon" data-act="del-cond" data-ri="${ri}" data-ci="${ci}">✕</button>
        </div>
      </div>
    `;
  }

  _commitRules() {
    this._currentTree().startRules = this._editRules.map(ruleToJson);
    this._persistDraft();
    this._renderStartRules();
  }

  _addRule() {
    const nodeIds = Object.keys(this._currentTree().nodes);
    if (nodeIds.length === 0) { alert('Crie um nó antes de adicionar uma regra.'); return; }
    this._editRules.push({ conditions: [{ type: CONDITION_TYPES[0].type, negate: false }], node: nodeIds[0] });
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
        opt.effect = sel.value ? { type: sel.value } : undefined;
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
    list.querySelectorAll('[data-act="del-opt"]').forEach(btn => {
      btn.onclick = () => { node.options.splice(Number(btn.dataset.oi), 1); this._persistDraft(); this._renderNodeEditor(); };
    });
  }

  _renderOptionRow(opt, oi, otherNodeIds) {
    const effectType = opt.effect?.type || '';
    const meta = effectMeta(effectType);
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
              ${EFFECT_TYPES.map(e => `<option value="${e.type}" ${e.type === effectType ? 'selected' : ''}>${e.label}</option>`).join('')}
            </select>
          </label>
          ${meta.fields.includes('quest') ? `<label class="field">Missão<select data-act="opt-effect-quest" data-oi="${oi}"><option value="">(escolha)</option>${questOptions}</select></label>` : ''}
          ${meta.fields.includes('objective') ? `<label class="field">Objetivo<select data-act="opt-effect-objective" data-oi="${oi}"><option value="">(escolha)</option>${objectiveOptions}</select></label>` : ''}
          ${meta.fields.includes('item') ? `<label class="field">Item<select data-act="opt-effect-item" data-oi="${oi}"><option value="">(escolha)</option>${Object.values(ITEM_DEFS).map(it => `<option value="${it.id}" ${it.id === opt.effect?.item ? 'selected' : ''}>${it.icon} ${escapeHtml(it.name)}</option>`).join('')}</select></label>` : ''}
          ${meta.fields.includes('cost') ? `<label class="field">Custo (R$)<input type="number" data-act="opt-effect-cost" data-oi="${oi}" value="${opt.effect?.cost ?? ''}" placeholder="grátis" /></label>` : ''}
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
