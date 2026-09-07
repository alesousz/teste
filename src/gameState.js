// Estado central do mundo: flags, relacionamentos e outros dados que
// diálogos, quests e NPCs precisam consultar/alterar, mas que não pertencem
// a nenhum sistema específico (diferente de energia/fome, que são do
// NeedsSystem, ou progresso de missão, que é do QuestSystem).
//
// `storyProgress` e `worldState` são só a fundação estrutural pedida —
// ainda não têm API própria porque nada consome isso ainda; quando um caso
// de uso real aparecer, os métodos entram junto com ele.
export class GameState {
  constructor() {
    this.flags = {};
    this.relationships = {};
    this.storyProgress = {};
    this.discoveredLocations = new Set();
    this.worldState = {};
  }

  // -------------------------------------------------------------------
  // Flags — valores simples (booleanos ou não) por nome. Acesso sempre via
  // esta API, nunca direto em `this.flags` fora desta classe.
  // -------------------------------------------------------------------
  setFlag(name, value = true) {
    this.flags[name] = value;
  }

  getFlag(name) {
    return this.flags[name];
  }

  hasFlag(name) {
    return Object.prototype.hasOwnProperty.call(this.flags, name);
  }

  removeFlag(name) {
    delete this.flags[name];
  }

  // -------------------------------------------------------------------
  // Relacionamentos — só a fundação numérica (id do NPC -> número).
  // -------------------------------------------------------------------
  getRelationship(npcId) {
    return this.relationships[npcId] || 0;
  }

  changeRelationship(npcId, amount) {
    this.relationships[npcId] = this.getRelationship(npcId) + amount;
  }

  setRelationship(npcId, value) {
    this.relationships[npcId] = value;
  }

  serialize() {
    return {
      flags: this.flags,
      relationships: this.relationships,
      storyProgress: this.storyProgress,
      discoveredLocations: Array.from(this.discoveredLocations),
      worldState: this.worldState,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.flags = data.flags || {};
    this.relationships = data.relationships || {};
    this.storyProgress = data.storyProgress || {};
    this.discoveredLocations = new Set(data.discoveredLocations || []);
    this.worldState = data.worldState || {};
  }
}
