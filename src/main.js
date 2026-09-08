import * as THREE from 'three';
import { CONFIG, ORIGINS, COURSES, HOMES, OBLIGATIONS, ITEM_DEFS } from './data.js';
import { World } from './world.js';
import { abrirPorta } from './building.js';
import { Phone, PHONE_DEFAULT_KEY } from './phone.js';
import { OBSERVACOES } from './data/apartment.js';
import { Player } from './player.js';
import { createNpcs } from './npc.js';
import { QuestSystem, DialogueSystem } from './interactions.js';
import { CollectibleSystem } from './collectibles.js';
import { NeedsSystem } from './needs.js';
import { InventorySystem } from './inventory.js';
import { GameState } from './gameState.js';
import { ObligationSystem } from './schedule.js';
import { UI } from './ui.js';
import { writeSave, clearSave, readSave, quarantineSave } from './save.js';
import { SAVE_VERSION, SaveStatus, validateSave, saveErrorMessage } from './saveSchema.js';
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

    this.gameState = new GameState();
    this.quests = new QuestSystem(() => this._onQuestChange(), this.gameState);
    this.inventory = new InventorySystem();
    this.collectibles = new CollectibleSystem(this.scene, this.quests, this.inventory);
    this._boundUseItem = itemId => this._useItem(itemId);
    this._boundDiscardItem = itemId => this._discardItem(itemId);

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
    this.ui.setLoadingProgress(0.1, 'Carregando personagens');
    await preloadCharacterAssets();

    this.ui.setLoadingProgress(0.5, 'Carregando diálogos');
    this.dialogueTrees = await fetch('src/data/dialogues.json').then(r => r.json());

    this.ui.setLoadingProgress(0.8, 'Montando a cidade');
    this.npcs = createNpcs(this.scene, this.world);

    this.ui.setLoadingProgress(1, 'Pronto');
    this.ui.hideLoading();
    this._showMenu();
  }

  // Único lugar que decide o estado do menu a partir do save. "Continuar" só
  // fica disponível quando existe um save que realmente carrega — um save
  // ilegível desabilita o botão e explica o motivo, em vez de deixar o
  // jogador clicar num caminho que sempre falha.
  _showMenu({ notificarErro = true } = {}) {
    const result = readSave();
    this._saveState = result;
    if (result.status === SaveStatus.OK) {
      this.ui.showMenu(true);
    } else if (result.status === SaveStatus.EMPTY) {
      this.ui.showMenu(false);
    } else {
      // A nota abaixo do botão é permanente; o toast, com a explicação
      // completa, só aparece quando o estado é descoberto ou quando o jogador
      // tenta continuar — voltar das configurações não repete o aviso.
      this.ui.showMenu(false, 'Save não pôde ser lido');
      if (notificarErro && this._statusAvisado !== result.status) {
        this._statusAvisado = result.status;
        this.ui.showToast(result.message);
      }
    }
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
    document.getElementById('btn-continue').onclick = () => this._continueGame();
    document.getElementById('btn-resume').onclick = () => {
      this.ui.hidePause();
      this.canvas.requestPointerLock();
    };
    document.getElementById('btn-save-quit').onclick = () => {
      this._saveGame();
      this.ui.hidePause();
      this.running = false;
      this._showMenu();
      if (document.pointerLockElement) document.exitPointerLock();
    };
    document.getElementById('btn-settings').onclick = () => {
      this.ui.hideMenu();
      this.ui.showSettings('menu');
    };
    document.getElementById('btn-credits').onclick = () => {
      this.ui.hideMenu();
      this.ui.showCredits();
    };
    document.getElementById('btn-pause-settings').onclick = () => {
      this.ui.hidePause();
      this.ui.showSettings('pause');
    };

    // Voltar da tela de configurações/créditos para onde ela foi aberta.
    this.ui.onSettingsClose = from => {
      if (from === 'pause') this.ui.showPause();
      else this._showMenu();
    };
    document.getElementById('btn-credits-back').addEventListener('click', () => {
      this._showMenu();
    });
  }

  // Carrega o save existente. Toda a validação acontece ANTES de qualquer
  // mudança de estado ou de tela: se o save não serve, o jogador continua no
  // menu, sabendo o porquê, e o save original fica intacto.
  _continueGame() {
    const result = readSave();
    if (result.status !== SaveStatus.OK) {
      this._saveState = result;
      // Tentativa explícita do jogador: sempre responde, mesmo que o mesmo
      // erro já tenha sido avisado antes.
      this._statusAvisado = null;
      this.ui.showToast(result.message || 'Não há jogo salvo.');
      this._showMenu();
      return false;
    }
    return this._startGame(result.save, result.save.profile);
  }

  _bindCharacterCreation() {
    document.getElementById('cc-back').onclick = () => {
      this.ui.hideCreation();
      this._showMenu();
    };
    document.getElementById('cc-confirm').onclick = () => {
      const profile = this.ui.getCreationProfile();
      if (!profile) return;
      // Se o save existente não podia ser carregado, ele é posto em quarentena
      // antes de a chave ser reaproveitada — assim a partida nova não leva
      // junto o dado que o jogador não conseguiu recuperar.
      if (this._saveState && this._saveState.status !== SaveStatus.OK && this._saveState.status !== SaveStatus.EMPTY) {
        quarantineSave();
      }
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
      } else if (!this.ui.isJournalOpen() && !this.ui.isItemMenuOpen() && !this.phone?.isOpen) {
        this.paused = true;
        this.ui.showPause();
      }
    });
  }

  // `saveData` null/undefined = partida nova. Qualquer outra coisa é validada
  // ANTES de mudar estado ou esconder o menu: antes desta guarda, um save sem
  // `player` lançava no meio da restauração, depois de `running = true` e do
  // menu já escondido, deixando o jogador numa tela sem jogo e sem saída.
  // A validação fica aqui, e não só no chamador, porque é o ponto por onde
  // todo carregamento passa.
  _startGame(saveData, profile) {
    let restore = null;
    if (saveData !== null && saveData !== undefined) {
      const result = validateSave(saveData);
      if (result.status !== SaveStatus.OK) {
        this._saveState = result;
        this.ui.showToast(result.message || saveErrorMessage(SaveStatus.MALFORMED));
        this._showMenu();
        return false;
      }
      restore = result.save;
    }

    this.profile = profile || { name: 'Alex', sex: 'f', courseId: 'medicina' };
    const course = COURSES[this.profile.courseId] || COURSES.medicina;
    // Nenhum curso define casa/família própria ainda — todos usam a origem
    // operária como base disso (decisão do usuário), só trocando o
    // compromisso diário pelo curso escolhido.
    const origin = ORIGINS.operario;
    this.homeSleepSpot = HOMES[origin.home].sleepSpot;
    this.homeKind = origin.home;

    if (this.player) this.scene.remove(this.player.mesh);
    this.player = new Player(this.scene, this.world, this.profile.sex === 'f' ? 'female' : 'male');
    this.player.onAttackImpact = () => this._resolvePlayerAttack();
    this.dummy.onTelegraphExpire = () => {
      if (!this.player.isDodging) this.player.takeDamage(CONFIG.DUMMY_COUNTER_DAMAGE);
    };

    this.needs = new NeedsSystem(course.startMoney);
    this.obligation = new ObligationSystem(OBLIGATIONS[course.obligation]);
    this.dialogue = new DialogueSystem(this.dialogueTrees, this.quests, {
      show: (text, options, npcName, delta) => this.ui.showDialogue(text, options, i => this.dialogue.choose(i), npcName, delta),
      hide: () => this.ui.hideDialogue(),
    }, this.collectibles, this.inventory, this.needs, this.obligation, this.gameState, origin.id, this.profile.sex, this.world);

    // Celular: entrega a primeira mensagem e conduz o tutorial dos primeiros
    // minutos. Guardado em gameState.worldState porque o esquema do save é
    // uma lista branca e um campo novo no topo seria descartado em silêncio.
    this.phone = new Phone({
      sex: this.profile.sex,
      getKeyLabel: acao => this.ui.getBindingLabel(acao),
      getTimeLabel: () => this.world.getFormattedTime(),
      onOpen: () => { if (document.pointerLockElement) document.exitPointerLock(); },
      onMessageRead: () => this.phone.advanceTutorial('leu_mensagem'),
      onNotify: msg => this.ui.showToast(`Nova mensagem — ${msg.from}`),
    });

    this.ui.hideMenu();
    this.ui.hud.classList.remove('hidden');
    this.running = true;
    this.paused = true;
    this.ui.showPause();

    // `restore` já passou pela validação: todo campo presente aqui é do tipo
    // certo, e o que estava inválido foi omitido — daí os `??`, que agora
    // aplicam o padrão do sistema em vez de deixar lixo entrar.
    if (restore) {
      // `?? 0` cobre saves anteriores ao prédio: sem altura gravada, o
      // jogador volta ao nível da rua, que é onde ele estava naquela versão.
      this.player.position.set(restore.player.x, restore.player.y ?? 0, restore.player.z);
      this.player.camYaw = restore.player.camYaw ?? Math.PI;
      this.world.setTimeOfDay(restore.timeOfDay ?? 0.3);
      this.world.dayCount = restore.dayCount ?? 1;
      this.quests.deserialize(restore.quests);
      this.collectibles.restoreCollected(restore.collectedFragments);
      this.collectibles.restoreItem(restore.bookCollected);
      this.collectibles.restoreCollectedWorldItems(restore.collectedWorldItems);
      this.inventory.deserialize(restore.inventory);
      this.needs.deserialize(restore.needs);
      this.obligation.deserialize(restore.obligation);
      // Ausente em saves de antes do GameState existir — deserialize(undefined)
      // não faz nada, então o GameState fica nos valores padrão (sem flags,
      // sem relacionamentos), sem perder nenhum outro dado do save antigo.
      this.gameState.deserialize(restore.gameState);
      this.phone.deserialize(this.gameState.worldState.phone);
    } else {
      // Partida nova começa DENTRO do apartamento, no quarto — é o ponto de
      // partida dos primeiros minutos.
      const s = this.world.interior.spawn;
      this.player.position.set(s.x, s.y, s.z);
      this.player.facingAngle = s.facing;
      this.player.camYaw = s.facing;
    }
    this.phone.startParentsConversation();
    this.player.snapCamera();
    this._lastDayCount = this.world.dayCount;
    this._saveState = { status: SaveStatus.OK };

    this.clock.getDelta();
    this._loop();
    return true;
  }

  _saveGame() {
    // Só uma partida de fato iniciada pode gravar. Sem esta guarda, qualquer
    // caminho que deixasse o jogo meio-inicializado poderia sobrescrever um
    // save existente (inclusive um corrompido que o jogador ainda não teve
    // chance de recuperar) com um estado incompleto.
    if (!this.running || !this.player) return false;
    this.gameState.worldState.phone = this.phone.serialize();
    return writeSave({
      version: SAVE_VERSION,
      timestamp: Date.now(),
      player: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, camYaw: this.player.camYaw },
      timeOfDay: this.world.timeOfDay,
      dayCount: this.world.dayCount,
      quests: this.quests.serialize(),
      collectedFragments: Array.from(this.collectibles.collectedIds),
      bookCollected: this.collectibles.item?.collected || false,
      collectedWorldItems: Array.from(this.collectibles.collectedWorldItemIds),
      inventory: this.inventory.serialize(),
      profile: this.profile,
      needs: this.needs.serialize(),
      obligation: this.obligation.serialize(),
      gameState: this.gameState.serialize(),
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
    this.dummy.takeDamage(this.player.attackDamage);
  }

  _nearSleepSpot() {
    return Math.hypot(
      this.player.position.x - this.homeSleepSpot.x,
      this.player.position.z - this.homeSleepSpot.z
    ) < CONFIG.INTERACT_RADIUS;
  }

  _onQuestChange() {
    this.ui.showToast('Diário atualizado');
    if (this.ui.isJournalOpen()) this.ui.renderJournal(this.quests, this.collectibles, this.gameState);
  }

  _useItem(itemId) {
    const def = ITEM_DEFS[itemId];
    if (this.inventory.useItem(itemId, this.needs)) {
      this.ui.showToast(`Usou: ${def.name}`);
      if (this.ui.isItemMenuOpen()) this.ui.renderItemMenu(this.inventory, this.needs, this._boundUseItem, this._boundDiscardItem);
    }
  }

  _discardItem(itemId) {
    const def = ITEM_DEFS[itemId];
    if (this.inventory.discardItem(itemId)) {
      this.ui.showToast(`Descartou: ${def.name}`);
      if (this.ui.isItemMenuOpen()) this.ui.renderItemMenu(this.inventory, this.needs, this._boundUseItem, this._boundDiscardItem);
    }
  }

  _handleInteractionPrompt() {
    if (this.dialogue.active) return;

    // O aviso de contra-ataque tem prioridade sobre qualquer outro prompt —
    // é a janela real pra esquivar, então precisa ficar bem visível.
    if (this.dummy.telegraphActive) {
      this.ui.showPrompt(`${this.ui.getBindingLabel('dodge')} — Esquivar do contra-ataque!`, true);
      return;
    }

    let nearestNpc = null;
    let nearestDist = CONFIG.INTERACT_RADIUS;
    for (const npc of this.npcs) {
      const d = Math.hypot(this.player.position.x - npc.position.x, this.player.position.z - npc.position.z);
      if (d < nearestDist) { nearestDist = d; nearestNpc = npc; }
    }
    const nearbyItem = this.collectibles.findNearbyItem(this.player.position);
    const nearbyWorldItem = this.collectibles.findNearbyWorldItem(this.player.position);
    const nearbyFragment = this.collectibles.findNearbyFragment(this.player.position);

    const interactKey = this.ui.getBinding('interact');
    const interactLabel = this.ui.getBindingLabel('interact');
    const photoKey = this.ui.getBinding('photo');
    const photoLabel = this.ui.getBindingLabel('photo');

    // Porta vem antes de tudo: dentro do prédio é a única interação que
    // existe, e do lado de fora ela só aparece encostado na entrada.
    const porta = this.world.nearestDoor(this.player.position);
    const objeto = porta ? null : this.world.nearestAnchor(this.player.position);

    let promptShown = false;
    if (porta) {
      const rotulo = porta.def.label;
      if (porta.def.locked) {
        this.ui.showPrompt(`${rotulo} — trancada`);
      } else {
        this.ui.showPrompt(`${interactLabel} — ${porta.aberta ? 'Fechar' : 'Abrir'}: ${rotulo}`);
        if (this.input.wasPressed(interactKey) && abrirPorta(porta)) {
          this.phone.advanceTutorial('interagiu');
          if (porta.def.id === 'ap201') this.phone.advanceTutorial('saiu_do_apartamento');
          if (porta.def.id === 'entrada') this.phone.advanceTutorial('saiu_do_predio');
        }
      }
      promptShown = true;
    } else if (objeto) {
      this.ui.showPrompt(`${interactLabel} — ${objeto.label}`);
      promptShown = true;
      if (this.input.wasPressed(interactKey)) {
        this.ui.showToast(OBSERVACOES[objeto.id] || objeto.label);
        this.phone.advanceTutorial('interagiu');
      }
    } else if (nearestNpc) {
      this.ui.showPrompt(`${interactLabel} — Falar com ${nearestNpc.def.name}`);
      promptShown = true;
      if (this.input.wasPressed(interactKey)) {
        this.dialogue.start(nearestNpc.def.id, this.world.isNight, nearestNpc);
      }
    } else if (nearbyItem) {
      this.ui.showPrompt(`${interactLabel} — Pegar o livro`);
      promptShown = true;
      if (this.input.wasPressed(interactKey)) {
        this.collectibles.collectItem(nearbyItem);
        this.ui.showToast('Você pegou o livro de Marina.');
      }
    } else if (nearbyWorldItem) {
      const def = ITEM_DEFS[nearbyWorldItem.itemId];
      this.ui.showPrompt(`${interactLabel} — Pegar ${def.name}`);
      promptShown = true;
      if (this.input.wasPressed(interactKey)) {
        this.collectibles.collectWorldItem(nearbyWorldItem);
        this.ui.showToast(`Você pegou: ${def.name}`);
      }
    } else if (this._nearSleepSpot()) {
      this.ui.showPrompt(`${interactLabel} — Dormir (recuperar energia e avançar o dia)`);
      promptShown = true;
      if (this.input.wasPressed(interactKey)) this._sleep();
    } else if (Math.hypot(this.player.position.x - this.dummy.position.x, this.player.position.z - this.dummy.position.z) < CONFIG.PUNCH_RANGE + 1) {
      this.ui.showPrompt('Clique com o botão esquerdo — Socar o boneco de treino');
      promptShown = true;
    }

    if (nearbyFragment) {
      if (!promptShown) { this.ui.showPrompt(`${photoLabel} — Fotografar este instante`); promptShown = true; }
      if (this.input.wasPressed(photoKey)) {
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

    if (this.input.wasPressed(this.ui.getBinding('journal'))) {
      const opened = this.ui.toggleJournal(this.quests, this.collectibles, this.gameState);
      if (opened) {
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
    if (this.input.wasPressed(this.ui.getBinding('items'))) {
      const opened = this.ui.toggleItemMenu(this.inventory, this.needs, this._boundUseItem, this._boundDiscardItem);
      if (opened) {
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
    if (this.input.wasPressed(this.ui.getBinding('phone') ?? PHONE_DEFAULT_KEY)) {
      if (this.phone.toggle() && document.pointerLockElement) document.exitPointerLock();
    }
    if (this.phone.isOpen) {
      if (this.input.wasPressed('ArrowUp')) this.phone.moveSelection(-1);
      if (this.input.wasPressed('ArrowDown')) this.phone.moveSelection(1);
    }
    if (this.input.wasPressed(this.ui.getBinding('pause'))) {
      if (this.phone.isOpen) this.phone.close();
      if (this.ui.isJournalOpen()) this.ui.hideJournal();
      if (this.ui.isItemMenuOpen()) this.ui.hideItemMenu();
      if (this.dialogue.active) this.dialogue.close();
    }

    if (this.ui.isJournalOpen()) {
      if (this.input.wasPressed('ArrowLeft')) this.ui.journalCycleTab(-1);
      if (this.input.wasPressed('ArrowRight')) this.ui.journalCycleTab(1);
      if (this.input.wasPressed('ArrowUp')) this.ui.peopleMoveSelection(-1);
      if (this.input.wasPressed('ArrowDown')) this.ui.peopleMoveSelection(1);
    }

    if (this.ui.isItemMenuOpen()) {
      if (this.input.wasPressed('ArrowDown')) this.ui.itemMenuMoveSelection(1);
      if (this.input.wasPressed('ArrowUp')) this.ui.itemMenuMoveSelection(-1);
      if (this.input.wasPressed('ArrowRight')) this.ui.itemMenuCycleCategory(1);
      if (this.input.wasPressed('ArrowLeft')) this.ui.itemMenuCycleCategory(-1);
      if (this.input.wasPressed('KeyE') || this.input.wasPressed('Enter')) this.ui.itemMenuUseSelected();
      if (this.input.wasPressed('KeyR')) this.ui.itemMenuDiscardSelected();
    }

    if (this.dialogue.active) {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']) {
        if (this.input.wasPressed(code)) this.dialogue.choose(Number(code.slice(-1)) - 1);
      }
    }

    const uiBlocking = this.paused || this.ui.isJournalOpen() || this.ui.isItemMenuOpen() || this.dialogue.active || this.phone.isOpen;

    if (!uiBlocking) {
      this.player.exhausted = this.needs.isExhausted();
      const { x, y } = this.input.consumeMouseDelta();
      if (Math.abs(x) + Math.abs(y) > 2) this.phone.advanceTutorial('olhou');
      this.player.applyCameraInput(x, y);
      const antes = { x: this.player.position.x, z: this.player.position.z };
      this.player.update(dt, this.input, this.ui.getBinding('dodge'));
      if (Math.hypot(this.player.position.x - antes.x, this.player.position.z - antes.z) > 0.01) {
        this.phone.advanceTutorial('moveu');
      }
      // Voltar ao nível da rua ainda dentro do prédio = desceu a escada.
      if (this.world.insideHome(this.player.position.x, this.player.position.z) && this.player.position.y < 0.2) {
        this.phone.advanceTutorial('desceu_a_escada');
      }
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
    this.world.updateBuilding(uiBlocking ? 0 : dt);
    this.phone.update(uiBlocking ? 0 : dt);
    this.dummy.update(uiBlocking ? 0 : dt);

    if (this.world.dayCount !== this._lastDayCount) {
      const result = this.obligation.processDayEnd(this._lastDayCount, this.needs);
      this._lastDayCount = this.world.dayCount;
      if (result) this.ui.showToast(result.message);
    }

    this.ui.updateHUD(this.world, this.quests, this.needs, this.obligation, this.player);
    this.ui.drawCompass(this.player, this.collectibles, this.obligation, this.homeKind);
    this.ui.updateTarget(this.dummy, this.player);

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
