import { ITEM_DEFS } from './data.js';

// Inventário simples: contagem por tipo de item. O efeito de cada item só é
// aplicado quando usado de verdade (ver useItem) — comprar ou achar pelo
// mundo só guarda, não aplica nada sozinho.
export class InventorySystem {
  constructor() {
    this.counts = {}; // itemId -> quantidade
  }

  addItem(itemId, amount = 1) {
    if (!ITEM_DEFS[itemId]) return;
    this.counts[itemId] = (this.counts[itemId] || 0) + amount;
  }

  getOwnedItems() {
    return Object.entries(this.counts)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ def: ITEM_DEFS[id], count }));
  }

  useItem(itemId, needsSystem) {
    const count = this.counts[itemId] || 0;
    const def = ITEM_DEFS[itemId];
    if (count <= 0 || !def) return false;
    if (def.effect.type === 'restoreEnergy') needsSystem.restoreEnergy(def.effect.amount);
    else if (def.effect.type === 'restoreHunger') needsSystem.restoreHunger(def.effect.amount);
    this.counts[itemId] = count - 1;
    return true;
  }

  serialize() { return this.counts; }
  deserialize(data) { if (data) this.counts = data; }
}
