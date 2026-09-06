import { CONFIG } from './data.js';

// Acompanha o compromisso fixo (emprego ou escola) determinado pela origem
// do personagem: presença numa janela de horário, com consequência real
// (multa, aviso, demissão/expulsão) processada a cada virada de dia.
export class ObligationSystem {
  constructor(def) {
    this.def = def;
    this.attendedToday = false;
    this.misses = 0;
    this.active = true;
    this.lastProcessedDay = null;
  }

  isInWindow(hourFloat) {
    return hourFloat >= this.def.startHour && hourFloat < this.def.endHour;
  }

  update(hourFloat, playerPos) {
    if (!this.active || this.attendedToday) return;
    if (!this.isInWindow(hourFloat)) return;
    const d = Math.hypot(playerPos.x - this.def.location.x, playerPos.z - this.def.location.z);
    if (d < CONFIG.INTERACT_RADIUS + 3) this.attendedToday = true;
  }

  // Chamado uma vez quando o dia `dayIndex` termina (virada de meia-noite ou
  // ao dormir). Retorna um resumo pra exibir num toast, ou null se este dia
  // já tinha sido processado antes (evita contar duas vezes).
  processDayEnd(dayIndex, needs) {
    if (!this.active || this.lastProcessedDay === dayIndex) return null;
    this.lastProcessedDay = dayIndex;

    let result;
    if (this.attendedToday) {
      needs.addMoney(this.def.payPerDay);
      this.misses = 0;
      result = {
        attended: true,
        message: this.def.payPerDay > 0
          ? `Você cumpriu: ${this.def.label}. Ganhou R$${this.def.payPerDay}.`
          : `Você cumpriu: ${this.def.label}.`,
      };
    } else {
      this.misses += 1;
      needs.spendMoney(this.def.missPenaltyMoney);
      if (this.misses >= this.def.maxMisses) {
        this.active = false;
        result = { attended: false, fired: true, message: this.def.endMessage };
      } else if (this.misses === this.def.maxMisses - 1) {
        result = { attended: false, message: this.def.warningMessage };
      } else {
        result = { attended: false, message: `Você faltou: ${this.def.label}.` };
      }
    }
    this.attendedToday = false;
    return result;
  }

  serialize() {
    return {
      attendedToday: this.attendedToday,
      misses: this.misses,
      active: this.active,
      lastProcessedDay: this.lastProcessedDay,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.attendedToday = data.attendedToday ?? false;
    this.misses = data.misses ?? 0;
    this.active = data.active ?? true;
    this.lastProcessedDay = data.lastProcessedDay ?? null;
  }
}
