import * as THREE from 'three';
import { CONFIG, ORIGINS, HOMES, OBLIGATIONS } from './data.js';
import { World } from './world.js';
import { Player } from './player.js';
import { createNpcs } from './npc.js';
import { QuestSystem, DialogueSystem, CollectibleSystem } from './interactions.js';
import { NeedsSystem } from './needs.js';
import { ObligationSystem } from './schedule.js';
import { UI } from './ui.js';
import { hasSave, loadSave, writeSave, clearSave } from './save.js';
import { preloadCharacterAssets } from './assets.js';
import { createTrainingDummy } from './combat.js';

class InputManager {
  constructor(canvas) {
    this.keys = new Set();
    this.pointerLocked = false;
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.canvas = canvas;
    this.justPressed = new Set();
    this.attackJustPressed = false;

    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    // Só conta como soco se o clique aconteceu com o ponteiro já travado —
    // senão o primeiro clique (que só serve pra travar o mouse) já sairia
    // socando.
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0 && this.pointerLocked) this.attackJustPressed = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      window.dispatchEvent(new CustomEvent('pointerlockchange', { detail: this.pointerLocked }));
    });
    document.addEventListener('mousemove', e => {
      if (this.pointerLocked) {
        this.mouseDx += e.movementX || 0;
        this.mouseDy += e.movementY || 0;
      }
    });
  }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) {
    if (this.justPressed.has(code)) { this.justPressed.delete(code); return true; }
    return false;
  }
  consumeMouseDelta() {
    const d = { x: this.mouseDx, y: this.mouseDy };
    this.mouseDx = 0; this.mouseDy = 0;
    return d;
  }
  consumeAttack() {
    const a = this.attackJustPressed;
    this.attackJustPressed = false;
    return a;
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ui = new UI();
    this.input = new InputManager(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);

    this.world = new World(this.scene);
    this.player = null;
    this.npcs = [];
    this.dummy = createTrainingDummy(this.scene);

    this.quests = new QuestSystem(() => this._onQuestChange());
    this.collectibles = new CollectibleSystem(this.scene, this.quests);

    this.paused = true;
    this.running = false;
    this.clock = new THREE.Clock();

    this._bindMenu();
    this._bindCharacterCreation();
    this._bindPointerLock();
    this._bindResize();

    this._boot();
  }

  async _boot() {
    const [, dialogueTrees] = await Promise.all([
      preloadCharacterAssets(),
      fetch('src/data/dialogues.json').then(r => r.json()),
    ]);
    this.dialogueTrees = dialogueTrees;
    this.npcs = createNpcs(this.scene, this.world);
    this.ui.hideLoading();
    this.ui.showMenu(hasSave());
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _bindMenu() {
    document.getElementById('btn-newgame').onclick = () => {
      this.ui.hideMenu();
      this.ui.showCreation();
    };
    document.getElementById('btn-continue').onclick = () => {
      const data = loadSave();
      this._startGame(data, data?.profile);
    };
    document.getElementById('btn-resume').onclick = () => {
      this.ui.hidePause();
      this.canvas.requestPointerLock();
    };
    document.getElementById('btn-save-quit').onclick = () => {
      this._saveGame();
      this.ui.hidePause();
      this.running = false;
      this.ui.showMenu(true);
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }

  _bindCharacterCreation() {
    document.getElementById('cc-back').onclick = () => {
      this.ui.hideCreation();
      this.ui.showMenu(hasSave());
    };
    document.getElementById('cc-confirm').onclick = () => {
      const profile = this.ui.getCreationProfile();
      if (!profile) return;
      clearSave();
      this.ui.hideCreation();
      this._startGame(null, profile);
    };
  }

  _bindPointerLock() {
    window.addEventListener('pointerlockchange', e => {
      if (!this.running) return;
      if (e.detail) {
        this.paused = false;
        this.ui.hidePause();
      } else if (!this.ui.isJournalOpen()) {
        this.paused = true;
        this.ui.showPause();
      }
    });
  }

  _startGame(saveData, profile) {
    this.profile = profile || { name: 'Alex', sex: 'x', originId: 'operario' };
    const origin = ORIGINS[this.profile.originId];
    this.homeSleepSpot = HOMES[origin.home].sleepSpot;

    if (this.player) this.scene.remove(this.player.mesh);
    this.player = new Player(this.scene, this.world, this.profile.sex === 'f' ? 'female' : 'male');
    this.player.onAttackImpact = () => this._resolvePlayerAttack();
    this.dummy.onTelegraphExpire = () => {
      if (!this.player.isDodging) this.player.takeDamage(CONFIG.DUMMY_COUNTER_DAMAGE);
    };

    this.needs = new NeedsSystem(origin.startMoney);
    this.obligation = new ObligationSystem(OBLIGATIONS[origin.obligation]);
    this.dialogue = new DialogueSystem(this.dialogueTrees, this.quests, {
      show: (text, options) => this.ui.showDialogue(text, options, i => this.dialogue.choose(i)),
      hide: () => this.ui.hideDialogue(),
    }, this.collectibles, this.needs, this.obligation, this.profile.originId, this.profile.sex);

    this.ui.hideMenu();
    this.ui.hud.classList.remove('hidden');
    this.running = true;
    this.paused = true;
    this.ui.showPause();

    if (saveData) {
      this.player.position.set(saveData.player.x, 0, saveData.player.z);
      this.player.camYaw = saveData.player.camYaw ?? Math.PI;
      this.world.setTimeOfDay(saveData.timeOfDay ?? 0.3);
      this.world.dayCount = saveData.dayCount ?? 1;
      this.quests.deserialize(saveData.quests);
      this.collectibles.restoreCollected(saveData.collectedFragments);
      this.collectibles.restoreItem(saveData.bookCollected);
      this.needs.deserialize(saveData.needs);
      this.obligation.deserialize(saveData.obligation);
    } else {
      this.player.position.set(this.homeSleepSpot.x, 0, this.homeSleepSpot.z);
    }
    this.player.snapCamera();
    this._lastDayCount = this.world.dayCount;

    this.clock.getDelta();
    this._loop();
  }

  _saveGame() {
    writeSave({
      player: { x: this.player.position.x, z: this.player.position.z, camYaw: this.player.camYaw },
      timeOfDay: this.world.timeOfDay,
      dayCount: this.world.dayCount,
      quests: this.quests.serialize(),
      collectedFragments: Array.from(this.collectibles.collectedIds),
      bookCollected: this.collectibles.item?.collected || false,
      profile: this.profile,
      needs: this.needs.serialize(),
      obligation: this.obligation.serialize(),
    });
  }

  _sleep() {
    const endedDay = this.world.dayCount;
    const result = this.obligation.processDayEnd(endedDay, this.needs);
    this.needs.restoreEnergy(100);
    this.world.advanceToNextMorning();
    this._lastDayCount = this.world.dayCount;
    if (result) this.ui.showToast(result.message);
    this._saveGame();
  }

  // Checa se o boneco de treino está dentro do alcance e do cone frontal
  // do soco (~72° pra cada lado) antes de aplicar dano.
  _resolvePlayerAttack() {
    const dx = this.dummy.position.x - this.player.position.x;
    const dz = this.dummy.position.z - this.player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > CONFIG.PUNCH_RANGE) return;
    const toTarget = Math.atan2(dx, dz);
    let diff = toTarget - this.player.facingAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > Math.PI / 2.5) return;
    this.dummy.takeDamage(CONFIG.PUNCH_DAMAGE);
  }

  _nearSleepSpot() {
    return Math.hypot(
      this.player.position.x - this.homeSleepSpot.x,
      this.player.position.z - this.homeSleepSpot.z
    ) < CONFIG.INTERACT_RADIUS;
  }

  _onQuestChange() {
    this.ui.showToast('Diário atualizado');
    if (this.ui.isJournalOpen()) this.ui.renderJournal(this.quests, this.collectibles);
  }

  _handleInteractionPrompt() {
    if (this.dialogue.active) return;

    // O aviso de contra-ataque tem prioridade sobre qualquer outro prompt —
    // é a janela real pra esquivar (Q), então precisa ficar bem visível.
    if (this.dummy.telegraphActive) {
      this.ui.showPrompt('Q — Esquivar do contra-ataque!', true);
      return;
    }

    let nearestNpc = null;
    let nearestDist = CONFIG.INTERACT_RADIUS;
    for (const npc of this.npcs) {
      const d = Math.hypot(this.player.position.x - npc.position.x, this.player.position.z - npc.position.z);
      if (d < nearestDist) { nearestDist = d; nearestNpc = npc; }
    }
    const nearbyItem = this.collectibles.findNearbyItem(this.player.position);
    const nearbyFragment = this.collectibles.findNearbyFragment(this.player.position);

    let promptShown = false;
    if (nearestNpc) {
      this.ui.showPrompt(`E — Falar com ${nearestNpc.def.name}`);
      promptShown = true;
      if (this.input.wasPressed('KeyE')) {
        this.dialogue.start(nearestNpc.def.id, this.world.isNight, nearestNpc);
      }
    } else if (nearbyItem) {
      this.ui.showPrompt('E — Pegar o livro');
      promptShown = true;
      if (this.input.wasPressed('KeyE')) {
        this.collectibles.collectItem(nearbyItem);
        this.ui.showToast('Você pegou o livro de Marina.');
      }
    } else if (this._nearSleepSpot()) {
      this.ui.showPrompt('E — Dormir (recuperar energia e avançar o dia)');
      promptShown = true;
      if (this.input.wasPressed('KeyE')) this._sleep();
    } else if (Math.hypot(this.player.position.x - this.dummy.position.x, this.player.position.z - this.dummy.position.z) < CONFIG.PUNCH_RANGE + 1) {
      this.ui.showPrompt('Clique com o botão esquerdo — Socar o boneco de treino');
      promptShown = true;
    }

    if (nearbyFragment) {
      if (!promptShown) { this.ui.showPrompt('F — Fotografar este instante'); promptShown = true; }
      if (this.input.wasPressed('KeyF')) {
        const thumb = this._captureThumbnail();
        this.collectibles.capture(nearbyFragment, thumb);
        this.ui.flashPhoto();
        this.ui.showToast('Fragmento capturado.');
      }
    }

    if (!promptShown) this.ui.hidePrompt();
  }

  _captureThumbnail() {
    const w = 220, h = 140;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(this.renderer.domElement, 0, 0, tmp.width, tmp.height);
    return tmp.toDataURL('image/jpeg', 0.7);
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.input.wasPressed('Tab')) {
      const opened = this.ui.toggleJournal(this.quests, this.collectibles);
      if (opened) {
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
    if (this.input.wasPressed('Escape') && this.ui.isJournalOpen()) {
      this.ui.hideJournal();
    }

    if (this.dialogue.active) {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) {
        if (this.input.wasPressed(code)) this.dialogue.choose(Number(code.slice(-1)) - 1);
      }
    }

    const uiBlocking = this.paused || this.ui.isJournalOpen() || this.dialogue.active;

    if (!uiBlocking) {
      this.player.exhausted = this.needs.isExhausted();
      const { x, y } = this.input.consumeMouseDelta();
      this.player.applyCameraInput(x, y);
      this.player.update(dt, this.input);
      // O aviso do contra-ataque só começa quando o jogador não está mais
      // travado no próprio soco, pra não cortar a animação de ataque dele.
      // O dano em si só é resolvido depois (ver onTelegraphExpire), dando
      // tempo do jogador esquivar (Q) durante o aviso.
      if (this.dummy.counterPending && !this.player.isAttacking && !this.dummy.telegraphActive) {
        this.dummy.startTelegraph();
      }
      this._handleInteractionPrompt();
      this.needs.update(dt);
      this.obligation.update(this.world.timeOfDay * 24, this.player.position);
    } else {
      this.input.consumeMouseDelta();
    }

    for (const npc of this.npcs) npc.update(uiBlocking ? 0 : dt);
    this.collectibles.update(uiBlocking ? 0 : dt);
    this.world.update(uiBlocking ? 0 : dt);
    this.dummy.update(uiBlocking ? 0 : dt);

    if (this.world.dayCount !== this._lastDayCount) {
      const result = this.obligation.processDayEnd(this._lastDayCount, this.needs);
      this._lastDayCount = this.world.dayCount;
      if (result) this.ui.showToast(result.message);
    }

    this.ui.updateHUD(this.world, this.quests, this.needs, this.obligation, this.player);
    this.ui.drawMinimap(this.player, this.npcs, this.collectibles);

    this.camera.position.copy(this.player.cameraPosition);
    this.camera.lookAt(this.player.cameraTarget);

    this.renderer.render(this.scene, this.camera);

    this._autoSaveTimer = (this._autoSaveTimer || 0) + dt;
    if (this._autoSaveTimer > 20) {
      this._autoSaveTimer = 0;
      this._saveGame();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__game = new Game();
});
