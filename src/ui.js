import { CONFIG, QUESTS, ITEM_CATEGORIES, COURSES, KEYBIND_ACTIONS, FIXED_CONTROLS, DEFAULT_KEYBINDS, landmarkCenter } from './data.js';

// Bússola: abertura de 180° e os pontos cardeais em português. Na prática,
// player.facingAngle é 0 = +Z (não -Z): targetAngle em player.js vem de
// atan2(move.x, move.z), que dá 0 quando o personagem anda pra +Z. bearingTo
// usa a mesma convenção (atan2(dx, dz), sem inverter o Z) pra bater com isso
// — confirmado empiricamente: com a inversão antiga, alvos à frente saíam
// escondidos (fora do FOV) e alvos atrás apareciam centralizados.
const COMPASS_FOV = Math.PI;
const CARDINALS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

function bearingTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
const KEYBINDS_STORAGE = 'ecos.keybinds';

// Rótulo curto pra tecla, a partir do KeyboardEvent.code.
function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const named = {
    Escape: 'Esc', Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace',
    ShiftLeft: 'Shift', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl dir.',
    AltLeft: 'Alt', AltRight: 'Alt dir.', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return named[code] || code;
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

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
    this.journalStamp = document.getElementById('journal-stamp');
    this.journalFragCount = document.getElementById('journal-fragcount');
    this.pauseMenu = document.getElementById('pause-menu');
    this.itemMenu = document.getElementById('item-menu');
    this.itemMenuTitle = document.getElementById('item-menu-title');
    this.itemMenuTabs = document.getElementById('item-menu-tabs');
    this.itemMenuRows = document.getElementById('item-menu-rows');
    this.itemMenuDetailDock = document.getElementById('item-menu-detail-dock');
    this.itemMenuMoney = document.getElementById('item-menu-money');
    this._itemMenuCategory = 'all';
    this._itemMenuSort = { column: 'name', dir: 1 };
    this._itemMenuSelectedId = null;
    this.flashEl = document.getElementById('photo-flash');
    this.crosshairHint = document.getElementById('crosshair-hint');
    this.toast = document.getElementById('toast');
    this._toastTimer = null;

    // Bússola (substitui o minimapa) e barra do alvo
    this.compassCanvas = document.getElementById('compass-strip');
    this.compassCtx = this.compassCanvas.getContext('2d');
    this.compassMarkers = document.getElementById('compass-markers');
    this._markerEls = new Map();
    this.targetBar = document.getElementById('target-bar');
    this.targetName = document.getElementById('target-name');
    this.targetHpText = document.getElementById('target-hp-text');
    this.targetFill = document.getElementById('target-fill');

    this.creationScreen = document.getElementById('creation-screen');
    this.ccNameInput = document.getElementById('cc-name');
    this.ccNameCount = document.getElementById('cc-name-count');
    this.ccConfirmBtn = document.getElementById('cc-confirm');
    this.ccCourseList = document.getElementById('cc-course-list');
    this.ccCourseSummary = document.getElementById('cc-course-summary');
    this.ccCourseNote = document.getElementById('cc-course-note');
    this._cc = { sex: null, courseId: null };
    this._bindCreationChips();

    this.continueNote = document.getElementById('btn-continue-note');
    this.pauseStamp = document.getElementById('pause-stamp');
    this.pauseSub = document.getElementById('pause-sub');

    // Configurações / créditos
    this.settingsScreen = document.getElementById('settings-screen');
    this.creditsScreen = document.getElementById('credits-screen');
    this.keybindsFixed = document.getElementById('keybinds-fixed');
    this.keybindsEditable = document.getElementById('keybinds-editable');
    this._settingsFrom = 'menu';
    this._listeningAction = null;
    this.keybinds = this._loadKeybinds();
    this._bindSettings();

    this.needsBar = document.getElementById('needs-bar');
    this.hpFill = document.getElementById('hp-fill');
    this.staminaFill = document.getElementById('stamina-fill');
    this.energyFill = document.getElementById('energy-fill');
    this.hungerFill = document.getElementById('hunger-fill');
    this.hpValue = document.getElementById('hp-value');
    this.staminaValue = document.getElementById('stamina-value');
    this.energyValue = document.getElementById('energy-value');
    this.hungerValue = document.getElementById('hunger-value');
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
    this._renderCourses();
    this.ccNameInput?.addEventListener('input', () => this._updateCreationValidity());
  }

  _renderCourses() {
    if (!this.ccCourseList) return;
    this.ccCourseList.innerHTML = Object.values(COURSES).map(c => `
      <button class="cc-course-card" data-course="${c.id}">
        <span class="ms">${c.glyph}</span>
        <span>${c.label}</span>
      </button>
    `).join('');
    this.ccCourseList.querySelectorAll('[data-course]').forEach(el => {
      el.onclick = () => {
        this.ccCourseList.querySelectorAll('[data-course]').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        this._cc.courseId = el.dataset.course;
        this._renderCourseSummary(el.dataset.course);
        this._updateCreationValidity();
      };
    });
  }

  _renderCourseSummary(courseId) {
    const c = COURSES[courseId];
    if (!c || !this.ccCourseSummary) return;
    const hours = `${String(c.startHour).padStart(2, '0')}:00 – ${String(c.endHour).padStart(2, '0')}:00`;
    this.ccCourseSummary.innerHTML = `
      <div class="cc-summary-row"><span>Compromisso</span><span>${c.obligationLabel}</span></div>
      <div class="cc-summary-row"><span>Horário</span><span class="num">${hours}</span></div>
      <div class="cc-summary-row"><span>Idade</span><span>${c.age} anos</span></div>
      <div class="cc-summary-row"><span>No bolso</span><span class="money">R$${c.startMoney}</span></div>
    `;
    if (this.ccCourseNote) this.ccCourseNote.textContent = c.note || '';
  }

  _updateCreationValidity() {
    const name = this.ccNameInput.value.trim();
    if (this.ccNameCount) this.ccNameCount.textContent = `${name.length} / 24`;
    this.ccConfirmBtn.disabled = !(name.length > 0 && this._cc.sex && this._cc.courseId);
  }

  showCreation() {
    this.creationScreen.classList.remove('hidden');
    this._updateCreationValidity();
  }
  hideCreation() { this.creationScreen.classList.add('hidden'); }

  getCreationProfile() {
    if (this.ccConfirmBtn.disabled) return null;
    return { name: this.ccNameInput.value.trim(), sex: this._cc.sex, courseId: this._cc.courseId };
  }

  hideLoading() { this.loadingScreen.classList.add('hidden'); }

  showMenu(canContinue) {
    this.menuScreen.classList.remove('hidden');
    this.continueBtn.disabled = !canContinue;
    if (this.continueNote) this.continueNote.textContent = canContinue ? 'Retomar o dia' : 'Sem jogo salvo';
  }
  hideMenu() { this.menuScreen.classList.add('hidden'); }

  // A pausa reaproveita o que o HUD já mostra (dia, hora, compromisso, dinheiro).
  showPause() {
    if (this.pauseStamp) this.pauseStamp.textContent = `${this.dayEl.textContent}, ${this.clockEl.textContent}`;
    if (this.pauseSub) {
      const status = this.scheduleBox.querySelector('.schedule-status')?.textContent;
      const label = this.scheduleBox.querySelector('.schedule-label')?.textContent;
      const duty = label && status ? `${label}: ${status.toLowerCase()}` : null;
      this.pauseSub.textContent = [duty, `${this.moneyValue.textContent} no bolso`].filter(Boolean).join(' · ');
    }
    this.pauseMenu.classList.remove('hidden');
  }
  hidePause() { this.pauseMenu.classList.add('hidden'); }

  updateHUD(world, questSystem, needs, obligation, player) {
    this.clockEl.textContent = world.getFormattedTime();
    this.dayEl.textContent = `Dia ${world.dayCount}`;

    const setBar = (fill, valueEl, value, lowAt) => {
      const v = Math.max(0, Math.round(value));
      fill.style.width = `${v}%`;
      fill.classList.toggle('low', value <= lowAt);
      if (valueEl) {
        valueEl.textContent = v;
        valueEl.classList.toggle('low', value <= lowAt);
      }
    };

    if (player) {
      setBar(this.hpFill, this.hpValue, player.hp, 30);
      setBar(this.staminaFill, this.staminaValue, player.stamina, CONFIG.PUNCH_STAMINA_COST);
    }
    if (needs) {
      setBar(this.energyFill, this.energyValue, needs.energy, 15);
      setBar(this.hungerFill, this.hungerValue, needs.hunger, 15);
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
      const hours = `${String(def.startHour).padStart(2, '0')}:00 – ${String(def.endHour).padStart(2, '0')}:00`;
      this.scheduleBox.innerHTML =
        `<div class="schedule-label">${def.label}</div>` +
        `<div class="schedule-status ${cls}">${status}</div>` +
        `<div class="schedule-hours">${hours}</div>`;
    }

    const objectives = questSystem.getActiveObjectivesSummary();
    if (objectives.length === 0) {
      this.objectiveBox.innerHTML =
        '<div class="objective-quest"><div class="objective-kicker">SEM MISSÕES ATIVAS</div></div>';
    } else {
      this.objectiveBox.innerHTML = objectives.slice(0, 3).map((o, i) => `
        <div class="objective-quest">
          ${i === 0 ? '<div class="objective-kicker">MISSÃO ATIVA</div>' : ''}
          <div class="objective-title">${o.quest}</div>
          <div class="objective-text">${o.text}</div>
        </div>
      `).join('');
    }
  }

  // A tecla sai do texto e vira a "tecla" desenhada pelo CSS (::before).
  // Prompts sem tecla curta (ex.: "Clique com o botão esquerdo — ...")
  // continuam como texto puro.
  showPrompt(text, warning = false) {
    const m = text.match(/^(.{1,3})\s+—\s+(.*)$/);
    this.promptEl.dataset.key = m ? m[1] : '';
    this.promptEl.textContent = m ? m[2] : text;
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
    // O carimbo reaproveita o que o HUD já calculou (dia + hora), pra não
    // precisar passar o `world` até aqui.
    if (this.journalStamp) this.journalStamp.textContent = `${this.dayEl.textContent} · ${this.clockEl.textContent}`;

    const fragments = collectibleSystem.fragments || [];
    const photos = collectibleSystem.photos || [];
    if (this.journalFragCount) this.journalFragCount.textContent = `${photos.length} / ${fragments.length} fragmentos`;

    // Em andamento primeiro, concluídas depois.
    const shown = Object.values(QUESTS)
      .map(q => ({ q, s: questSystem.state[q.id] }))
      .filter(({ s }) => s.active || s.done)
      .sort((a, b) => Number(a.s.done) - Number(b.s.done));

    this.journalQuests.innerHTML = shown.map(({ q, s }) => {
      const objs = q.objectives.map(o => {
        const done = s.objectives[o.id].done;
        const glyph = done ? 'check_circle' : 'radio_button_unchecked';
        return `<li class="${done ? 'done' : ''}"><span class="ms">${glyph}</span><span>${questSystem.getObjectiveText(q.id, o.id)}</span></li>`;
      }).join('');
      return `
        <div class="journal-quest ${s.done ? 'done' : ''}">
          <div class="journal-quest-head">
            <h3>${q.title}</h3>
            <span class="quest-status">${s.done ? 'Concluída' : 'Em andamento'}</span>
          </div>
          ${s.done ? '' : `<p>${q.description}</p>`}
          <ul>${objs}</ul>
          ${s.done ? `<p class="quest-reward">${q.reward}</p>` : ''}
        </div>
      `;
    }).join('') || '<p class="item-menu-empty">Nenhuma missão iniciada ainda.</p>';

    // Fotos primeiro, depois os slots que faltam — dá noção de progresso.
    const emptySlots = Math.max(0, fragments.length - photos.length);
    this.journalGallery.innerHTML = [
      ...photos.map(p => `<div class="photo-card"><img src="${p.thumb}" alt="fragmento"/><p>${p.note}</p></div>`),
      ...Array.from({ length: emptySlots }, () => '<div class="photo-card empty"><div class="photo-slot"></div><p>vazio</p></div>'),
    ].join('');
  }

  // -------------------------------------------------------------------
  // Menu de itens — abas de categoria em texto, uma tabela ordenável,
  // ficha do item na coluna da direita, navegação por teclado.
  // -------------------------------------------------------------------
  toggleItemMenu(inventorySystem, needsSystem, onUseItem, onDiscardItem) {
    const isHidden = this.itemMenu.classList.contains('hidden');
    if (isHidden) this.renderItemMenu(inventorySystem, needsSystem, onUseItem, onDiscardItem);
    this.itemMenu.classList.toggle('hidden');
    return isHidden;
  }
  hideItemMenu() { this.itemMenu.classList.add('hidden'); }
  isItemMenuOpen() { return !this.itemMenu.classList.contains('hidden'); }

  renderItemMenu(inventorySystem, needsSystem, onUseItem, onDiscardItem) {
    this._itemMenuCtx = { inventorySystem, needsSystem, onUseItem, onDiscardItem };
    const owned = inventorySystem.getOwnedItems();
    const categoriesPresent = Object.values(ITEM_CATEGORIES).filter(cat =>
      owned.some(({ def }) => def.category === cat.id)
    );
    if (this._itemMenuCategory !== 'all' && !categoriesPresent.some(c => c.id === this._itemMenuCategory)) {
      this._itemMenuCategory = 'all';
    }

    const tabs = [{ id: 'all', icon: '★', label: 'Tudo' }, ...categoriesPresent];
    this.itemMenuTabs.innerHTML = tabs.map(tab => `
      <div class="item-menu-tab ${tab.id === this._itemMenuCategory ? 'selected' : ''}" data-tab="${tab.id}">${tab.label}</div>
    `).join('');
    this.itemMenuTabs.querySelectorAll('[data-tab]').forEach(el => {
      el.onclick = () => {
        this._itemMenuCategory = el.dataset.tab;
        this.renderItemMenu(inventorySystem, needsSystem, onUseItem, onDiscardItem);
      };
    });
    const activeTab = tabs.find(t => t.id === this._itemMenuCategory);
    this.itemMenuTitle.textContent = activeTab?.label || 'Itens';

    document.querySelectorAll('.item-menu-col[data-sort]').forEach(el => {
      el.classList.toggle('sorted', el.dataset.sort === this._itemMenuSort.column);
      el.onclick = () => {
        if (this._itemMenuSort.column === el.dataset.sort) this._itemMenuSort.dir *= -1;
        else this._itemMenuSort = { column: el.dataset.sort, dir: 1 };
        this._renderItemMenuBody();
      };
    });

    this._renderItemMenuBody();
  }

  _renderItemMenuBody() {
    const { inventorySystem, needsSystem, onUseItem, onDiscardItem } = this._itemMenuCtx;
    const owned = inventorySystem.getOwnedItems();
    let items = this._itemMenuCategory === 'all' ? owned : owned.filter(({ def }) => def.category === this._itemMenuCategory);

    const { column, dir } = this._itemMenuSort;
    const keyOf = ({ def, count }) => column === 'name' ? def.name : column === 'qty' ? count : def[column];
    items = [...items].sort((a, b) => {
      const ka = keyOf(a), kb = keyOf(b);
      const cmp = typeof ka === 'string' ? ka.localeCompare(kb) : ka - kb;
      return cmp * dir;
    });
    this._itemMenuVisible = items;

    document.querySelectorAll('.item-menu-col[data-sort]').forEach(el => {
      el.classList.toggle('sorted', el.dataset.sort === column);
    });

    if (!items.some(({ def }) => def.id === this._itemMenuSelectedId)) {
      this._itemMenuSelectedId = items[0]?.def.id || null;
    }

    this.itemMenuRows.innerHTML = items.length
      ? items.map(({ def, count }) => `
        <div class="item-menu-row ${def.id === this._itemMenuSelectedId ? 'selected' : ''}" data-item="${def.id}">
          <span class="item-menu-row-name"><span class="ms item-menu-row-icon">${def.glyph || def.icon}</span>${def.name}</span>
          <span class="item-menu-row-num">${count}</span>
          <span class="item-menu-row-num">${def.weight.toFixed(1)}</span>
          <span class="item-menu-row-num item-menu-col-value">R$${def.value}</span>
        </div>
      `).join('')
      : '<p class="item-menu-empty">Nenhum item guardado ainda.</p>';
    this.itemMenuRows.querySelectorAll('[data-item]').forEach(el => {
      el.onclick = () => { this._itemMenuSelectedId = el.dataset.item; this._renderItemMenuBody(); };
    });

    const selected = items.find(({ def }) => def.id === this._itemMenuSelectedId);
    this.itemMenuDetailDock.classList.toggle('hidden', !selected);
    if (selected) {
      const def = selected.def;
      const category = ITEM_CATEGORIES[def.category]?.label || 'Item';
      const effect = def.effect?.type === 'restoreEnergy' ? `Energia +${def.effect.amount}`
        : def.effect?.type === 'restoreHunger' ? `Fome +${def.effect.amount}`
        : null;
      this.itemMenuDetailDock.innerHTML = `
        <div class="item-menu-detail-top">
          <span class="ms item-menu-detail-icon">${def.glyph || def.icon}</span>
          <div>
            <h3 class="item-menu-detail-name">${def.name}</h3>
            <div class="item-menu-detail-kicker">${category} · ${selected.count} no bolso</div>
          </div>
        </div>
        <p class="item-menu-detail-desc">${def.description}</p>
        <div class="item-menu-detail-stats">
          ${effect ? `<div class="item-menu-detail-stat"><span>Efeito</span><span class="effect">${effect}</span></div>` : ''}
          <div class="item-menu-detail-stat"><span>Peso</span><span class="num">${def.weight.toFixed(1)}</span></div>
          <div class="item-menu-detail-stat"><span>Valor</span><span class="num">R$${def.value}</span></div>
        </div>
        <div class="item-menu-actions">
          <span class="item-menu-action"><span class="key">E</span>Usar</span>
          <span class="item-menu-action secondary"><span class="key">R</span>Descartar</span>
        </div>
      `;
    }

    this.itemMenuMoney.textContent = `R$${Math.floor(needsSystem.money)}`;
    this._itemMenuOnUse = onUseItem;
    this._itemMenuOnDiscard = onDiscardItem;
  }

  itemMenuMoveSelection(delta) {
    const items = this._itemMenuVisible || [];
    if (!items.length) return;
    const idx = Math.max(0, items.findIndex(({ def }) => def.id === this._itemMenuSelectedId));
    const next = (idx + delta + items.length) % items.length;
    this._itemMenuSelectedId = items[next].def.id;
    this._renderItemMenuBody();
  }

  itemMenuCycleCategory(delta) {
    const tabIds = Array.from(this.itemMenuTabs.querySelectorAll('[data-tab]')).map(el => el.dataset.tab);
    if (!tabIds.length) return;
    const idx = Math.max(0, tabIds.indexOf(this._itemMenuCategory));
    this._itemMenuCategory = tabIds[(idx + delta + tabIds.length) % tabIds.length];
    this.renderItemMenu(this._itemMenuCtx.inventorySystem, this._itemMenuCtx.needsSystem, this._itemMenuCtx.onUseItem, this._itemMenuCtx.onDiscardItem);
  }

  itemMenuUseSelected() { if (this._itemMenuSelectedId) this._itemMenuOnUse?.(this._itemMenuSelectedId); }
  itemMenuDiscardSelected() { if (this._itemMenuSelectedId) this._itemMenuOnDiscard?.(this._itemMenuSelectedId); }

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

  // Barra do alvo — aparece quando o boneco está machucado ou por perto.
  updateTarget(dummy, player) {
    if (!dummy || !player) return;
    const dist = Math.hypot(dummy.position.x - player.position.x, dummy.position.z - player.position.z);
    const visible = dummy.hp < dummy.maxHp || dist <= CONFIG.PUNCH_RANGE + 2;
    this.targetBar.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.targetFill.style.width = `${Math.max(0, (dummy.hp / dummy.maxHp) * 100)}%`;
    this.targetHpText.textContent = `${Math.ceil(dummy.hp)} / ${dummy.maxHp}`;
  }

  // -------------------------------------------------------------------
  // Bússola — substitui o minimapa. Uma fita de graus que rola com a
  // direção do jogador, mais marcadores para casa, compromisso,
  // fragmentos não fotografados e o item de missão.
  // -------------------------------------------------------------------
  drawCompass(player, collectibleSystem, obligation, homeKind) {
    const ctx = this.compassCtx;
    const W = this.compassCanvas.width / 2;   // 500 CSS px
    const H = this.compassCanvas.height / 2;  // 22 CSS px
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const heading = normalizeAngle(player.facingAngle);
    const half = COMPASS_FOV / 2;
    const xOf = rel => W / 2 + (rel / half) * (W / 2);
    const fade = rel => Math.max(0, Math.min(1, (1 - Math.abs(rel) / half) * 3.2));

    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';

    for (let deg = 0; deg < 360; deg += 5) {
      const rel = normalizeAngle((deg * Math.PI) / 180 - heading);
      if (Math.abs(rel) > half) continue;
      const x = xOf(rel);
      const isCardinal = deg % 45 === 0;
      ctx.globalAlpha = fade(rel) * (isCardinal ? 1 : 0.55);
      ctx.fillStyle = '#f2f4f7';
      ctx.fillRect(Math.round(x), 0, 1, isCardinal ? 7 : 4);
      if (isCardinal) {
        ctx.globalAlpha = fade(rel);
        ctx.fillStyle = deg === 0 ? '#ffffff' : '#aeb6c0';
        ctx.fillText(CARDINALS[deg / 45], x, H - 1);
      }
    }
    ctx.globalAlpha = 1;

    const targets = [];
    if (homeKind) targets.push({ id: 'home', cls: 'home', glyph: 'home', pos: landmarkCenter(homeKind) });
    if (obligation?.active && obligation.def?.location) {
      targets.push({
        id: 'duty', cls: 'duty',
        glyph: obligation.def.type === 'school' ? 'school' : 'work',
        pos: obligation.def.location,
      });
    }
    for (const f of collectibleSystem.fragments) {
      if (f.collected) continue;
      targets.push({ id: f.id ?? `frag_${targets.length}`, cls: 'fragment', glyph: 'auto_awesome', pos: f.mesh.position });
    }
    if (collectibleSystem.item && !collectibleSystem.item.collected) {
      targets.push({ id: 'quest_item', cls: 'quest', glyph: 'menu_book', pos: collectibleSystem.item.mesh.position });
    }

    const seen = new Set();
    for (const t of targets) {
      const rel = normalizeAngle(bearingTo(player.position, t.pos) - heading);
      if (Math.abs(rel) > half) continue;
      seen.add(t.id);
      let el = this._markerEls.get(t.id);
      if (!el) {
        el = document.createElement('span');
        el.className = `compass-marker ms ${t.cls}`;
        el.textContent = t.glyph;
        this.compassMarkers.appendChild(el);
        this._markerEls.set(t.id, el);
      }
      el.style.display = '';
      el.style.left = `${xOf(rel)}px`;
      el.style.opacity = fade(rel);
    }
    for (const [id, el] of this._markerEls) {
      if (!seen.has(id)) el.style.display = 'none';
    }
  }
  // -------------------------------------------------------------------
  // Configurações › Controles — a mesma tela abre do menu inicial e da
  // pausa; `from` decide pra onde o "voltar" retorna. As teclas ficam em
  // localStorage e são lidas pelo main.js via getBinding().
  // -------------------------------------------------------------------
  _loadKeybinds() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEYBINDS_STORAGE) || '{}');
      return { ...DEFAULT_KEYBINDS, ...saved };
    } catch {
      return { ...DEFAULT_KEYBINDS };
    }
  }

  _saveKeybinds() {
    try { localStorage.setItem(KEYBINDS_STORAGE, JSON.stringify(this.keybinds)); } catch {}
  }

  getBinding(action) { return this.keybinds[action] || DEFAULT_KEYBINDS[action]; }
  getBindingLabel(action) { return keyLabel(this.getBinding(action)); }

  _bindSettings() {
    document.getElementById('btn-settings-back')?.addEventListener('click', () => this.hideSettings());
    document.getElementById('btn-credits-back')?.addEventListener('click', () => this.hideCredits());
    document.getElementById('btn-keybinds-reset')?.addEventListener('click', () => {
      this.keybinds = { ...DEFAULT_KEYBINDS };
      this._saveKeybinds();
      this._renderKeybinds();
    });

    // A tela abre também fora do loop do jogo (menu inicial), então ela
    // escuta o teclado por conta própria.
    window.addEventListener('keydown', e => {
      if (this.isCreditsOpen() && e.code === 'Escape') { e.preventDefault(); this.hideCredits(); return; }
      if (!this.isSettingsOpen()) return;
      if (this._listeningAction) {
        e.preventDefault();
        if (e.code !== 'Escape') {
          // Se a tecla já era de outra ação, a outra fica sem tecla.
          for (const [action, code] of Object.entries(this.keybinds)) {
            if (code === e.code && action !== this._listeningAction) this.keybinds[action] = null;
          }
          this.keybinds[this._listeningAction] = e.code;
          this._saveKeybinds();
        }
        this._listeningAction = null;
        this._renderKeybinds();
        return;
      }
      if (e.code === 'Escape') { e.preventDefault(); this.hideSettings(); }
      if (e.code === 'KeyR') {
        this.keybinds = { ...DEFAULT_KEYBINDS };
        this._saveKeybinds();
        this._renderKeybinds();
      }
    });
  }

  showSettings(from = 'menu') {
    this._settingsFrom = from;
    this._listeningAction = null;
    this._renderKeybinds();
    this.settingsScreen.classList.remove('hidden');
  }
  hideSettings() {
    this._listeningAction = null;
    this.settingsScreen.classList.add('hidden');
    this.onSettingsClose?.(this._settingsFrom);
  }
  isSettingsOpen() { return !this.settingsScreen.classList.contains('hidden'); }

  showCredits() { this.creditsScreen.classList.remove('hidden'); }
  hideCredits() { this.creditsScreen.classList.add('hidden'); }
  isCreditsOpen() { return !this.creditsScreen.classList.contains('hidden'); }

  _renderKeybinds() {
    if (this.keybindsFixed) {
      this.keybindsFixed.innerHTML = FIXED_CONTROLS.map(c => `
        <div class="keybind-row">
          <span>${c.label}</span>
          ${c.keys
            ? `<span class="keybind-keys">${c.keys.map(k => `<span class="keycap">${k}</span>`).join('')}</span>`
            : `<span class="fixed">${c.device}</span>`}
        </div>
      `).join('');
    }
    if (!this.keybindsEditable) return;
    this.keybindsEditable.innerHTML = KEYBIND_ACTIONS.map(a => {
      const listening = this._listeningAction === a.id;
      const code = this.keybinds[a.id];
      return `
        <div class="keybind-row ${listening ? 'listening' : ''} ${code ? '' : 'conflict'}" data-action="${a.id}">
          <span>${a.label}</span>
          <span class="keybind-keys">
            ${listening ? '<span class="keybind-hint">Pressione a nova tecla</span>' : ''}
            <button class="keycap" data-rebind="${a.id}">${keyLabel(code)}</button>
          </span>
        </div>
      `;
    }).join('');
    this.keybindsEditable.querySelectorAll('[data-rebind]').forEach(el => {
      el.onclick = () => {
        this._listeningAction = el.dataset.rebind;
        this._renderKeybinds();
      };
    });
  }
}
