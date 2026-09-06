import * as THREE from 'three';
import { CONFIG } from './data.js';
import { World } from './world.js';
import { Player } from './player.js';
import { createNpcs } from './npc.js';
import { QuestSystem, DialogueSystem, CollectibleSystem } from './interactions.js';
import { UI } from './ui.js';
import { hasSave, loadSave, writeSave, clearSave } from './save.js';

class InputManager {
  constructor(canvas) {
    this.keys = new Set();
    this.pointerLocked = false;
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.canvas = canvas;
    this.justPressed = new Set();

    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
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

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);

    this.world = new World(this.scene);
    this.player = new Player(this.scene, this.world);
    this.npcs = createNpcs(this.scene, this.world);

    this.quests = new QuestSystem(() => this._onQuestChange());
    this.collectibles = new CollectibleSystem(this.scene, this.quests);
    this.dialogue = new DialogueSystem(this.quests, {
      show: (text, options) => this.ui.showDialogue(text, options, i => this.dialogue.choose(i)),
      hide: () => this.ui.hideDialogue(),
    }, this.collectibles);

    this.paused = true;
    this.running = false;
    this.clock = new THREE.Clock();

    this._bindMenu();
    this._bindPointerLock();
    this._bindResize();

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
      clearSave();
      this._startGame(null);
    };
    document.getElementById('btn-continue').onclick = () => {
      const data = loadSave();
      this._startGame(data);
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

  _startGame(saveData) {
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
      this.player.snapCamera();
    }

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
    });
  }

  _onQuestChange() {
    this.ui.showToast('Diário atualizado');
    if (this.ui.isJournalOpen()) this.ui.renderJournal(this.quests, this.collectibles);
  }

  _handleInteractionPrompt() {
    if (this.dialogue.active) return;

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
        this.dialogue.start(nearestNpc.def.id, this.world.isNight);
      }
    } else if (nearbyItem) {
      this.ui.showPrompt('E — Pegar o livro');
      promptShown = true;
      if (this.input.wasPressed('KeyE')) {
        this.collectibles.collectItem(nearbyItem);
        this.ui.showToast('Você pegou o livro de Marina.');
      }
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
      const { x, y } = this.input.consumeMouseDelta();
      this.player.applyCameraInput(x, y);
      this.player.update(dt, this.input);
      this._handleInteractionPrompt();
    } else {
      this.input.consumeMouseDelta();
    }

    for (const npc of this.npcs) npc.update(uiBlocking ? 0 : dt);
    this.collectibles.update(uiBlocking ? 0 : dt);
    this.world.update(uiBlocking ? 0 : dt);
    this.ui.updateHUD(this.world, this.quests);
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
