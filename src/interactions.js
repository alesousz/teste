import { QUESTS } from './data.js';

// ---------------------------------------------------------------------------
// Sistema de missões
// ---------------------------------------------------------------------------
export class QuestSystem {
  // `gameState` é opcional — hoje o QuestSystem não consulta nem altera
  // flags/relacionamentos sozinho, mas fica com a referência pronta pra
  // quando uma missão precisar disso (ex: exigir uma flag pra iniciar).
  constructor(onChange, gameState = null) {
    this.onChange = onChange || (() => {});
    this.gameState = gameState;
    this.state = {}; // id -> {active, done, objectives: {objId: {done, count}}}
    for (const q of Object.values(QUESTS)) {
      this.state[q.id] = {
        active: !!q.autoStart,
        done: false,
        objectives: Object.fromEntries(q.objectives.map(o => [o.id, { done: false, count: o.count || 0 }])),
      };
    }
  }

  startQuest(id) {
    const s = this.state[id];
    if (!s || s.active || s.done) return;
    s.active = true;
    this.onChange();
  }

  completeObjective(questId, objId) {
    const s = this.state[questId];
    if (!s || !s.active) return;
    const o = s.objectives[objId];
    if (!o || o.done) return;
    o.done = true;
    this._checkQuestDone(questId);
    this.onChange();
  }

  incrementObjective(questId, objId) {
    const questDef = QUESTS[questId];
    const objDef = questDef.objectives.find(o => o.id === objId);
    const s = this.state[questId];
    if (!s || !s.active) return;
    const o = s.objectives[objId];
    if (o.done) return;
    o.count = (o.count || 0) + 1;
    if (objDef.target && o.count >= objDef.target) o.done = true;
    this._checkQuestDone(questId);
    this.onChange();
  }

  _checkQuestDone(questId) {
    const s = this.state[questId];
    const allDone = Object.values(s.objectives).every(o => o.done);
    if (allDone) s.done = true;
  }

  isActive(id) { return this.state[id]?.active && !this.state[id]?.done; }
  isDone(id) { return !!this.state[id]?.done; }

  getObjectiveText(questId, objId) {
    const questDef = QUESTS[questId];
    const objDef = questDef.objectives.find(o => o.id === objId);
    const s = this.state[questId].objectives[objId];
    if (objDef.target) {
      return objDef.text.replace(/\(\d+\/\d+\)/, `(${s.count}/${objDef.target})`);
    }
    return objDef.text;
  }

  getActiveObjectivesSummary() {
    const lines = [];
    for (const q of Object.values(QUESTS)) {
      const s = this.state[q.id];
      if (!s.active || s.done) continue;
      for (const o of q.objectives) {
        if (!s.objectives[o.id].done) lines.push({ quest: q.title, text: this.getObjectiveText(q.id, o.id) });
      }
    }
    return lines;
  }

  serialize() { return this.state; }
  deserialize(data) {
    if (!data) return;
    for (const id of Object.keys(this.state)) {
      if (data[id]) this.state[id] = data[id];
    }
  }
}

// ---------------------------------------------------------------------------
// Sistema de diálogo — as árvores em si (texto/opções/regras de início) vêm
// de src/data/dialogues.json como dados simples (sem função embutida), pra
// poder ser lido e escrito por um editor visual no futuro. Só a metadata de
// "quem é família/chefe de quem" continua aqui, por ser propriedade da
// definição do NPC, não do conteúdo do diálogo.
// ---------------------------------------------------------------------------
const FAMILY_NPCS = { mae_operaria: 'operario', mae_nobre: 'nobre' };
const BOSS_NPCS = { seu_ivo: 'operario', professora: 'nobre' };

// Sintaxe {{m:X|f:Y|x:Z}} num texto escolhe a variante certa pro pronome do
// personagem — usada pelo poucos nós que precisam disso (falas de mãe/pai).
const PRONOUN_PATTERN = /\{\{m:([^|}]*)\|f:([^|}]*)\|x:([^|}]*)\}\}/g;

export class DialogueSystem {
  constructor(dialogueTrees, questSystem, uiCallbacks, collectibleSystem, inventorySystem, needsSystem, obligationSystem, gameState, originId, sex, world) {
    this.trees = dialogueTrees;
    this.quests = questSystem;
    this.ui = uiCallbacks; // { show(text, options, npcName, delta), hide() }
    this.collectibles = collectibleSystem;
    this.inventory = inventorySystem;
    this.needs = needsSystem;
    this.obligation = obligationSystem;
    this.gameState = gameState;
    this.originId = originId;
    this.sex = sex;
    this.world = world;
    this.active = false;
    this.currentNpcId = null;
  }

  // Avalia um único critério de uma regra de início de diálogo. O vocabulário
  // é fechado de propósito (só o que os diálogos atuais realmente precisam)
  // — crescer esse vocabulário é uma decisão de conteúdo, não só técnica.
  _evalCondition(cond, npcId, npc) {
    switch (cond.type) {
      case 'questDone': return this.quests.isDone(cond.quest);
      case 'questActive': return this.quests.isActive(cond.quest);
      case 'objectiveDone': return !!this.quests.state[cond.quest]?.objectives[cond.objective]?.done;
      case 'isNight': return !!this._isNight;
      case 'hasMetPlayer': return !!npc?.hasMetPlayer;
      case 'obligationActive': return !!this.obligation.active;
      case 'obligationHasMisses': return this.obligation.misses > 0;
      case 'isPlayerFamily': return FAMILY_NPCS[npcId] === this.originId;
      case 'isPlayerBoss': return BOSS_NPCS[npcId] === this.originId;
      case 'flag': return this.gameState.getFlag(cond.flag) === cond.value;
      case 'relationship': return this._compareRelationship(cond.npc, cond.operator, cond.value);
      case 'not': return !this._evalCondition(cond.of, npcId, npc);
      default: return false;
    }
  }

  _compareRelationship(npcId, operator, value) {
    const rel = this.gameState.getRelationship(npcId);
    switch (operator) {
      case '>': return rel > value;
      case '>=': return rel >= value;
      case '<': return rel < value;
      case '<=': return rel <= value;
      case '==': return rel === value;
      case '!=': return rel !== value;
      default: return false;
    }
  }

  _resolveStartNode(npcId, npc) {
    const tree = this.trees[npcId];
    for (const rule of tree.startRules || []) {
      if (rule.if.every(cond => this._evalCondition(cond, npcId, npc))) return rule.node;
    }
    return tree.startDefault;
  }

  start(npcId, isNight, npc) {
    this._isNight = isNight;
    this.active = true;
    this.currentNpcId = npcId;
    this.currentNpc = npc;
    this.nodeId = this._resolveStartNode(npcId, npc);
    this._lastDelta = 0;
    if (npc) npc.hasMetPlayer = true;
    this.gameState.recordTalk(npcId, this.world);
    this._render();
  }

  _render() {
    const tree = this.trees[this.currentNpcId];
    const node = tree.nodes[this.nodeId];
    const sex = this.sex;
    const text = node.text.replace(PRONOUN_PATTERN, (_, m, f, x) => (sex === 'f' ? f : sex === 'x' ? x : m));
    this._lastText = text;
    this._visibleOptions = node.options.filter(o =>
      (!o.minMoney || this.needs.money >= o.minMoney) &&
      (!o.maxHunger || this.needs.hunger <= o.maxHunger)
    );
    this.ui.show(text, this._visibleOptions.map(o => o.label), this.currentNpc?.def?.name || '', this._lastDelta || 0);
  }

  choose(index) {
    const opt = this._visibleOptions?.[index];
    if (!opt) return;
    this._lastDelta = 0;
    if (opt.effect) this._applyEffect(opt.effect);
    if (opt.next === null) {
      this.close();
    } else {
      this.nodeId = opt.next;
      this._render();
    }
  }

  _applyEffect(effect) {
    if (effect.type === 'giveItem') {
      if (effect.cost && !this.needs.spendMoney(effect.cost)) return;
      this.inventory.addItem(effect.item);
    }
    if (effect.type === 'startQuest') {
      this.quests.startQuest(effect.quest);
      if (effect.quest === 'livro_esquecido' && this.collectibles?.item?.collected) {
        this.quests.completeObjective('livro_esquecido', 'find_book');
      }
    }
    if (effect.type === 'completeObjective') this.quests.completeObjective(effect.quest, effect.objective);
    if (effect.type === 'setFlag') this.gameState.setFlag(effect.flag, effect.value);
    if (effect.type === 'changeRelationship') {
      this._lastDelta = this.gameState.changeRelationship(effect.npc, effect.amount, effect.note, this.world);
    }
  }

  close() {
    this.active = false;
    this.currentNpcId = null;
    this.ui.hide();
  }
}
