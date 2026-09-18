import { CONFIG, t } from './data.js';
import { horaParaTexto as horaDoDia } from './rotina.js';

// Quanto antes do fim da janela o jogo avisa que o compromisso vai fechar.
// Uma hora: dá tempo de atravessar a cidade a pé.
const AVISO_ANTES_DO_FIM = 1;

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
    // Avisos já dados hoje: zeram na virada do dia, junto com a presença.
    this.warnedStart = false;
    this.warnedEnd = false;
  }

  isInWindow(hourFloat) {
    return hourFloat >= this.def.startHour && hourFloat < this.def.endHour;
  }

  /**
   * Roda a cada frame. Devolve um aviso pra mostrar num toast quando o dia
   * vira uma dessas duas horas, ou null — o jogador perdia o turno sem nada
   * na tela ter mudado, e a consequência só aparecia na virada do dia.
   * Cada aviso sai uma vez por dia; entrar no lugar antes disso cala os dois.
   */
  update(hourFloat, playerPos) {
    if (!this.active || this.attendedToday) return null;

    let aviso = null;
    if (this.isInWindow(hourFloat)) {
      if (!this.warnedStart) {
        this.warnedStart = true;
        aviso = t('compromisso.comecou', { compromisso: this.def.label, hora: horaDoDia(this.def.endHour) });
      } else if (!this.warnedEnd && hourFloat >= this.def.endHour - AVISO_ANTES_DO_FIM) {
        this.warnedEnd = true;
        const faltam = Math.max(1, Math.round((this.def.endHour - hourFloat) * 60));
        aviso = t('compromisso.fechando', { minutos: faltam, compromisso: this.def.label });
      }

      const d = Math.hypot(playerPos.x - this.def.location.x, playerPos.z - this.def.location.z);
      if (d < CONFIG.INTERACT_RADIUS + 3) this.attendedToday = true;
    }
    return aviso;
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
          ? t('compromisso.cumpriu_pago', { compromisso: this.def.label, dinheiro: this.def.payPerDay })
          : t('compromisso.cumpriu', { compromisso: this.def.label }),
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
        result = { attended: false, message: t('compromisso.faltou_dia', { compromisso: this.def.label }) };
      }
    }
    this.attendedToday = false;
    this.warnedStart = false;
    this.warnedEnd = false;
    return result;
  }

  serialize() {
    return {
      attendedToday: this.attendedToday,
      misses: this.misses,
      active: this.active,
      lastProcessedDay: this.lastProcessedDay,
      warnedStart: this.warnedStart,
      warnedEnd: this.warnedEnd,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.attendedToday = data.attendedToday ?? false;
    this.misses = data.misses ?? 0;
    this.active = data.active ?? true;
    this.lastProcessedDay = data.lastProcessedDay ?? null;
    this.warnedStart = data.warnedStart ?? false;
    this.warnedEnd = data.warnedEnd ?? false;
  }
}
