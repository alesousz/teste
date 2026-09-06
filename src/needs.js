import { CONFIG } from './data.js';

// Sistema simplificado de necessidades: Energia, Fome e Dinheiro. O resto do
// peso do "life sim" fica nas escolhas narrativas e na rotina, não em barras
// pra ficar monitorando o tempo todo.
export class NeedsSystem {
  constructor(startMoney) {
    this.energy = 100;
    this.hunger = 100;
    this.money = startMoney;
  }

  update(dt) {
    // um dia inteiro acordado (sem dormir) drena a energia quase por completo
    const energyDrain = this.isStarving() ? 90 * 2 : 90;
    this.energy = Math.max(0, this.energy - dt * (energyDrain / CONFIG.DAY_LENGTH_SECONDS));
    // fome drena mais devagar — não é algo pra ficar de olho o tempo todo,
    // só um lembrete de que o dia tem hora de comer
    this.hunger = Math.max(0, this.hunger - dt * (100 / (CONFIG.DAY_LENGTH_SECONDS * 1.5)));
  }

  isExhausted() {
    return this.energy <= 15;
  }

  isStarving() {
    return this.hunger <= 10;
  }

  restoreEnergy(amount) {
    this.energy = Math.min(100, this.energy + amount);
  }

  restoreHunger(amount) {
    this.hunger = Math.min(100, this.hunger + amount);
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
    return { energy: this.energy, hunger: this.hunger, money: this.money };
  }

  deserialize(data) {
    if (!data) return;
    this.energy = data.energy ?? this.energy;
    this.hunger = data.hunger ?? this.hunger;
    this.money = data.money ?? this.money;
  }
}
