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
    this.npcs = {}; // npcId -> { rel, talks, lastDay, lastTime, log }
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
  // Relacionamentos — número por NPC, mais o histórico que o Diário › Pessoas
  // usa (quantas conversas, quando foi a última, o que aconteceu).
  // hasMet/recordTalk marcam presença de conversa; changeRelationship só
  // mexe no número e, quando há uma nota, registra uma linha no histórico.
  // -------------------------------------------------------------------
  _npc(npcId) {
    return (this.npcs[npcId] ||= { rel: 0, talks: 0, lastDay: null, lastTime: null, log: [] });
  }

  getRelationship(npcId) {
    return this.npcs[npcId]?.rel || 0;
  }

  changeRelationship(npcId, amount, note, world) {
    const n = this._npc(npcId);
    n.rel += amount;
    if (note && world) n.log.push({ day: world.dayCount, text: note });
    return amount;
  }

  setRelationship(npcId, value) {
    this._npc(npcId).rel = value;
  }

  hasMet(npcId) {
    return !!this.npcs[npcId];
  }

  getTalkCount(npcId) {
    return this.npcs[npcId]?.talks || 0;
  }

  getLastSeen(npcId) {
    const n = this.npcs[npcId];
    if (!n?.lastDay) return null;
    return `dia ${n.lastDay}, ${n.lastTime}`;
  }

  getRelationshipLog(npcId) {
    return this.npcs[npcId]?.log || [];
  }

  // Chamado uma vez por conversa iniciada (não por escolha) — separado de
  // changeRelationship porque nem toda conversa muda o relacionamento.
  recordTalk(npcId, world) {
    const n = this._npc(npcId);
    n.talks += 1;
    n.lastDay = world.dayCount;
    n.lastTime = world.getFormattedTime();
  }

  serialize() {
    return {
      flags: this.flags,
      npcs: this.npcs,
      storyProgress: this.storyProgress,
      discoveredLocations: Array.from(this.discoveredLocations),
      worldState: this.worldState,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.flags = data.flags || {};
    // Saves antigos guardavam só um número por NPC em `relationships`;
    // migra pra estrutura nova sem perder o valor.
    if (data.npcs) {
      this.npcs = data.npcs;
    } else if (data.relationships) {
      this.npcs = {};
      for (const [npcId, rel] of Object.entries(data.relationships)) {
        this.npcs[npcId] = { rel, talks: 0, lastDay: null, lastTime: null, log: [] };
      }
    } else {
      this.npcs = {};
    }
    this.storyProgress = data.storyProgress || {};
    this.discoveredLocations = new Set(data.discoveredLocations || []);
    this.worldState = data.worldState || {};
  }
}
