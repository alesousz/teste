import { CONFIG, CITY, QUESTS } from './data.js';

export class UI {
  constructor() {
    this.loadingScreen = document.getElementById('loading-screen');
    this.menuScreen = document.getElementById('menu-screen');
    this.continueBtn = document.getElementById('btn-continue');
    this.newGameBtn = document.getElementById('btn-newgame');
    this.hud = document.getElementById('hud');
    this.objectiveBox = document.getElementById('objective-box');
    this.clockEl = document.getElementById('clock');
    this.dayEl = document.getElementById('day-counter');
    this.promptEl = document.getElementById('interact-prompt');
    this.dialogueBox = document.getElementById('dialogue-box');
    this.dialogueText = document.getElementById('dialogue-text');
    this.dialogueOptions = document.getElementById('dialogue-options');
    this.journal = document.getElementById('journal');
    this.journalQuests = document.getElementById('journal-quests');
    this.journalGallery = document.getElementById('journal-gallery');
    this.pauseMenu = document.getElementById('pause-menu');
    this.flashEl = document.getElementById('photo-flash');
    this.crosshairHint = document.getElementById('crosshair-hint');
    this.minimapCanvas = document.getElementById('minimap');
    this.mmCtx = this.minimapCanvas.getContext('2d');
    this.toast = document.getElementById('toast');
    this._toastTimer = null;

    this.creationScreen = document.getElementById('creation-screen');
    this.ccNameInput = document.getElementById('cc-name');
    this.ccConfirmBtn = document.getElementById('cc-confirm');
    this._cc = { sex: null, originId: null };
    this._bindCreationChips();

    this.needsBar = document.getElementById('needs-bar');
    this.hpFill = document.getElementById('hp-fill');
    this.energyFill = document.getElementById('energy-fill');
    this.hungerFill = document.getElementById('hunger-fill');
    this.moneyValue = document.getElementById('money-value');
    this.scheduleBox = document.getElementById('schedule-box');
  }

  _bindCreationChips() {
    document.querySelectorAll('[data-sex]').forEach(el => {
      el.onclick = () => {
        document.querySelectorAll('[data-sex]').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        this._cc.sex = el.dataset.sex;
        this._updateCreationValidity();
      };
    });
    document.querySelectorAll('[data-origin]').forEach(el => {
      el.onclick = () => {
        document.querySelectorAll('[data-origin]').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        this._cc.originId = el.dataset.origin;
        this._updateCreationValidity();
      };
    });
    this.ccNameInput?.addEventListener('input', () => this._updateCreationValidity());
  }

  _updateCreationValidity() {
    const nameOk = this.ccNameInput.value.trim().length > 0;
    this.ccConfirmBtn.disabled = !(nameOk && this._cc.sex && this._cc.originId);
  }

  showCreation() {
    this.creationScreen.classList.remove('hidden');
    this._updateCreationValidity();
  }
  hideCreation() { this.creationScreen.classList.add('hidden'); }

  getCreationProfile() {
    if (this.ccConfirmBtn.disabled) return null;
    return { name: this.ccNameInput.value.trim(), sex: this._cc.sex, originId: this._cc.originId };
  }

  hideLoading() { this.loadingScreen.classList.add('hidden'); }

  showMenu(canContinue) {
    this.menuScreen.classList.remove('hidden');
    this.continueBtn.disabled = !canContinue;
  }
  hideMenu() { this.menuScreen.classList.add('hidden'); }

  showPause() { this.pauseMenu.classList.remove('hidden'); }
  hidePause() { this.pauseMenu.classList.add('hidden'); }

  updateHUD(world, questSystem, needs, obligation, player) {
    this.clockEl.textContent = world.getFormattedTime();
    this.dayEl.textContent = `Dia ${world.dayCount}`;

    if (player) {
      this.hpFill.style.width = `${Math.max(0, player.hp)}%`;
      this.hpFill.classList.toggle('low', player.hp <= 30);
    }
    if (needs) {
      this.energyFill.style.width = `${Math.max(0, needs.energy)}%`;
      this.energyFill.classList.toggle('low', needs.energy <= 15);
      this.hungerFill.style.width = `${Math.max(0, needs.hunger)}%`;
      this.hungerFill.classList.toggle('low', needs.hunger <= 15);
      this.moneyValue.textContent = `R$${Math.floor(needs.money)}`;
    }
    if (obligation) {
      const hour = world.timeOfDay * 24;
      const def = obligation.def;
      let status, cls;
      if (!obligation.active) { status = 'Dispensado(a)'; cls = 'missed'; }
      else if (obligation.attendedToday) { status = 'Cumprido hoje'; cls = 'done'; }
      else if (hour >= def.startHour && hour < def.endHour) { status = 'Agora — vá até lá!'; cls = 'active'; }
      else if (hour < def.startHour) { status = `Começa às ${String(def.startHour).padStart(2, '0')}:00`; cls = ''; }
      else { status = 'Faltou hoje'; cls = 'missed'; }
      this.scheduleBox.innerHTML = `<div class="schedule-label">${def.label}</div><div class="schedule-status ${cls}">${status}</div>`;
    }

    const objectives = questSystem.getActiveObjectivesSummary();
    if (objectives.length === 0) {
      this.objectiveBox.innerHTML = '<div class="objective-title">Sem missões ativas</div>';
    } else {
      this.objectiveBox.innerHTML = objectives
        .slice(0, 3)
        .map(o => `<div class="objective-title">${o.quest}</div><div class="objective-text">• ${o.text}</div>`)
        .join('');
    }
  }

  showPrompt(text, warning = false) {
    this.promptEl.textContent = text;
    this.promptEl.classList.toggle('warning', warning);
    this.promptEl.classList.remove('hidden');
  }
  hidePrompt() { this.promptEl.classList.add('hidden'); this.promptEl.classList.remove('warning'); }

  showDialogue(text, optionLabels, onChoose) {
    this.dialogueBox.classList.remove('hidden');
    this.dialogueText.textContent = text;
    this.dialogueOptions.innerHTML = '';
    optionLabels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'dialogue-option';
      btn.textContent = `${i + 1}. ${label}`;
      btn.onclick = () => onChoose(i);
      this.dialogueOptions.appendChild(btn);
    });
  }
  hideDialogue() { this.dialogueBox.classList.add('hidden'); }

  toggleJournal(questSystem, collectibleSystem) {
    const isHidden = this.journal.classList.contains('hidden');
    if (isHidden) this.renderJournal(questSystem, collectibleSystem);
    this.journal.classList.toggle('hidden');
    return isHidden;
  }
  hideJournal() { this.journal.classList.add('hidden'); }
  isJournalOpen() { return !this.journal.classList.contains('hidden'); }

  renderJournal(questSystem, collectibleSystem) {
    const parts = [];
    for (const q of Object.values(QUESTS)) {
      const s = questSystem.state[q.id];
      if (!s.active && !s.done) continue;
      const status = s.done ? '✔ Concluída' : 'Em andamento';
      const objs = q.objectives.map(o => {
        const done = s.objectives[o.id].done;
        return `<li class="${done ? 'done' : ''}">${questSystem.getObjectiveText(q.id, o.id)}</li>`;
      }).join('');
      parts.push(`
        <div class="journal-quest">
          <h3>${q.title} <span class="quest-status">${status}</span></h3>
          <p>${q.description}</p>
          <ul>${objs}</ul>
          ${s.done ? `<p class="quest-reward">${q.reward}</p>` : ''}
        </div>
      `);
    }
    this.journalQuests.innerHTML = parts.join('') || '<p>Nenhuma missão iniciada ainda.</p>';

    const photos = collectibleSystem.photos;
    this.journalGallery.innerHTML = photos.length
      ? photos.map(p => `<div class="photo-card"><img src="${p.thumb}" alt="fragmento"/><p>${p.note}</p></div>`).join('')
      : '<p>Nenhum fragmento fotografado ainda. Procure por brilhos dourados pela cidade.</p>';
  }

  flashPhoto() {
    this.flashEl.classList.add('active');
    setTimeout(() => this.flashEl.classList.remove('active'), 220);
  }

  showToast(text) {
    this.toast.textContent = text;
    this.toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('visible'), 3200);
  }

  drawMinimap(player, npcs, collectibleSystem) {
    const ctx = this.mmCtx;
    const size = this.minimapCanvas.width;
    const worldSpan = CONFIG.WORLD_HALF * 2 + 20;
    const scale = size / worldSpan;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(15,17,22,0.55)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    const toScreen = (x, z) => ({
      sx: size / 2 + (x - player.position.x) * scale,
      sy: size / 2 + (z - player.position.z) * scale,
    });

    for (const block of CITY.blocks) {
      const { sx, sy } = toScreen(block.cx, block.cz);
      ctx.fillStyle = block.type === 'park' ? 'rgba(80,140,90,0.55)' : block.type === 'plaza' ? 'rgba(170,160,140,0.55)' : 'rgba(120,122,128,0.4)';
      const s = CONFIG.BLOCK_SIZE * scale;
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }

    for (const f of collectibleSystem.fragments) {
      if (f.collected) continue;
      const { sx, sy } = toScreen(f.mesh.position.x, f.mesh.position.z);
      ctx.fillStyle = '#ffe58a';
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
    }
    if (collectibleSystem.item && !collectibleSystem.item.collected) {
      const { sx, sy } = toScreen(collectibleSystem.item.mesh.position.x, collectibleSystem.item.mesh.position.z);
      ctx.fillStyle = '#e05252';
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
    }

    for (const npc of npcs) {
      const { sx, sy } = toScreen(npc.position.x, npc.position.z);
      ctx.fillStyle = '#7fd0ff';
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(player.facingAngle);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', size / 2 - 4, 13);
  }
}
