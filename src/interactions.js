import * as THREE from 'three';
import { DIALOGUES, QUESTS, FRAGMENT_SPOTS, ITEM_PROPS, CONFIG } from './data.js';

// ---------------------------------------------------------------------------
// Sistema de missões
// ---------------------------------------------------------------------------
export class QuestSystem {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
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
// Sistema de diálogo
// ---------------------------------------------------------------------------
const FAMILY_NPCS = { mae_operaria: 'operario', mae_nobre: 'nobre' };
const BOSS_NPCS = { seu_ivo: 'operario', professora: 'nobre' };
const DYNAMIC_PREFIX = { mae_operaria: 'ro', seu_ivo: 'iv', mae_nobre: 'bt', professora: 'el' };

export class DialogueSystem {
  constructor(questSystem, uiCallbacks, collectibleSystem, needsSystem, obligationSystem, originId, sex) {
    this.quests = questSystem;
    this.ui = uiCallbacks; // { show(text, options), hide() }
    this.collectibles = collectibleSystem;
    this.needs = needsSystem;
    this.obligation = obligationSystem;
    this.originId = originId;
    this.sex = sex;
    this.active = false;
    this.currentNpcId = null;
  }

  _resolveStartNode(npcId, npc) {
    const tree = DIALOGUES[npcId];
    if (tree.start !== 'dynamic') return tree.start;

    if (npcId === 'almeida') {
      return this.quests.isDone('boas_vindas') ? 'idle' : 'a1';
    }
    if (npcId === 'marina') {
      if (this.quests.isDone('livro_esquecido')) return 'm_done';
      const bookFound = this.quests.state.livro_esquecido.objectives.find_book.done;
      const questActive = this.quests.isActive('livro_esquecido');
      if (questActive && bookFound) return 'm_return';
      if (questActive) return 'm_wait';
      return 'm_intro';
    }
    if (npcId === 'diego') {
      if (this.quests.isDone('desconectar')) return 'd_after';
      if (this._isNight) return 'd_night';
      return 'd_day';
    }

    const prefix = DYNAMIC_PREFIX[npcId];
    if (prefix) {
      const belongsToPlayer = FAMILY_NPCS[npcId] === this.originId || BOSS_NPCS[npcId] === this.originId;
      if (!belongsToPlayer) return `${prefix}_stranger`;
      if (!npc.hasMetPlayer) return `${prefix}_${npcId in FAMILY_NPCS ? 'greet' : 'intro'}`;
      if (!this.obligation.active) return `${prefix}_fired`;
      if (this.obligation.misses > 0) return `${prefix}_warning` in tree.nodes ? `${prefix}_warning` : `${prefix}_worried`;
      return `${prefix}_ok`;
    }
    return tree.start;
  }

  start(npcId, isNight, npc) {
    this._isNight = isNight;
    this.active = true;
    this.currentNpcId = npcId;
    this.currentNpc = npc;
    this.nodeId = this._resolveStartNode(npcId, npc);
    if (npc) npc.hasMetPlayer = true;
    this._render();
  }

  _render() {
    const tree = DIALOGUES[this.currentNpcId];
    const node = tree.nodes[this.nodeId];
    const text = typeof node.text === 'function' ? node.text(this.sex) : node.text;
    this._visibleOptions = node.options.filter(o =>
      (!o.minMoney || this.needs.money >= o.minMoney) &&
      (!o.maxHunger || this.needs.hunger <= o.maxHunger)
    );
    this.ui.show(text, this._visibleOptions.map(o => o.label));
  }

  choose(index) {
    const opt = this._visibleOptions?.[index];
    if (!opt) return;
    if (opt.effect) this._applyEffect(opt.effect);
    if (opt.next === null) {
      this.close();
    } else {
      this.nodeId = opt.next;
      this._render();
    }
  }

  _applyEffect(effect) {
    if (effect.type === 'buyCoffee') {
      if (this.needs.spendMoney(5)) this.needs.restoreEnergy(25);
    }
    if (effect.type === 'eatHome') {
      this.needs.restoreHunger(100);
    }
    if (effect.type === 'buyFood') {
      if (this.needs.spendMoney(8)) this.needs.restoreHunger(60);
    }
    if (effect.type === 'startQuest') {
      this.quests.startQuest(effect.quest);
      if (effect.quest === 'livro_esquecido' && this.collectibles?.item?.collected) {
        this.quests.completeObjective('livro_esquecido', 'find_book');
      }
    }
    if (effect.type === 'completeObjective') this.quests.completeObjective(effect.quest, effect.objective);
  }

  close() {
    this.active = false;
    this.currentNpcId = null;
    this.ui.hide();
  }
}

// ---------------------------------------------------------------------------
// Colecionáveis (fragmentos de memória) + item de missão (livro)
// ---------------------------------------------------------------------------
export class CollectibleSystem {
  constructor(scene, questSystem) {
    this.scene = scene;
    this.quests = questSystem;
    this.fragments = [];
    this.collectedIds = new Set();
    this.photos = [];

    const geo = new THREE.IcosahedronGeometry(0.35, 0);
    for (const spot of FRAGMENT_SPOTS) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe58a, emissiveIntensity: 0.9, roughness: 0.3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(spot.position.x, 1.4, spot.position.z);
      const light = new THREE.PointLight(0xffe58a, 1.2, 5);
      light.position.copy(mesh.position);
      scene.add(mesh, light);
      this.fragments.push({ def: spot, mesh, light, collected: false });
    }

    this.item = null;
    const itemDef = ITEM_PROPS[0];
    const bookGeo = new THREE.BoxGeometry(0.3, 0.05, 0.22);
    const bookMat = new THREE.MeshStandardMaterial({ color: 0xb03a3a, roughness: 0.7 });
    const bookMesh = new THREE.Mesh(bookGeo, bookMat);
    bookMesh.position.set(itemDef.position.x, 0.35, itemDef.position.z);
    bookMesh.rotation.y = 0.4;
    scene.add(bookMesh);
    this.item = { def: itemDef, mesh: bookMesh, collected: false };
  }

  restoreCollected(ids) {
    for (const id of ids || []) {
      const f = this.fragments.find(f => f.def.id === id);
      if (f && !f.collected) {
        f.collected = true;
        this.scene.remove(f.mesh, f.light);
        this.collectedIds.add(id);
      }
    }
  }

  restoreItem(collected) {
    if (collected && this.item && !this.item.collected) {
      this.item.collected = true;
      this.scene.remove(this.item.mesh);
    }
  }

  update(dt) {
    for (const f of this.fragments) {
      if (f.collected) continue;
      f.mesh.rotation.y += dt * 1.5;
      f.mesh.position.y = 1.4 + Math.sin(performance.now() * 0.002 + f.mesh.position.x) * 0.15;
      f.light.position.y = f.mesh.position.y;
    }
    if (this.item && !this.item.collected) {
      this.item.mesh.rotation.y += dt * 0.4;
    }
  }

  findNearbyFragment(pos) {
    for (const f of this.fragments) {
      if (f.collected) continue;
      const d = Math.hypot(pos.x - f.mesh.position.x, pos.z - f.mesh.position.z);
      if (d < CONFIG.PHOTO_RADIUS) return f;
    }
    return null;
  }

  findNearbyItem(pos) {
    if (!this.item || this.item.collected) return null;
    const d = Math.hypot(pos.x - this.item.mesh.position.x, pos.z - this.item.mesh.position.z);
    return d < CONFIG.INTERACT_RADIUS ? this.item : null;
  }

  capture(fragment, thumbnailDataUrl) {
    fragment.collected = true;
    this.collectedIds.add(fragment.def.id);
    this.scene.remove(fragment.mesh, fragment.light);
    this.photos.push({ note: fragment.def.note, thumb: thumbnailDataUrl });
    this.quests.incrementObjective('ecos_perdidos', 'frags');
  }

  collectItem(item) {
    item.collected = true;
    this.scene.remove(item.mesh);
    this.quests.completeObjective('livro_esquecido', 'find_book');
  }
}
