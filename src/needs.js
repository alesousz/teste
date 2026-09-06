import { CONFIG } from './data.js';

// Sistema simplificado de necessidades: só Energia e Dinheiro. O resto do
// peso do "life sim" fica nas escolhas narrativas e na rotina, não em barras
// pra ficar monitorando o tempo todo.
export class NeedsSystem {
  constructor(startMoney) {
    this.energy = 100;
    this.money = startMoney;
  }

  update(dt) {
    // um dia inteiro acordado (sem dormir) drena a energia quase por completo
    this.energy = Math.max(0, this.energy - dt * (90 / CONFIG.DAY_LENGTH_SECONDS));
  }

  isExhausted() {
    return this.energy <= 15;
  }

  restoreEnergy(amount) {
    this.energy = Math.min(100, this.energy + amount);
  }

  addMoney(amount) {
    this.money += amount;
  }

  spendMoney(amount) {
    if (this.money < amount) return false;
    this.money -= amount;
    return true;
  }

  serialize() {
    return { energy: this.energy, money: this.money };
  }

  deserialize(data) {
    if (!data) return;
    this.energy = data.energy ?? this.energy;
    this.money = data.money ?? this.money;
  }
}
