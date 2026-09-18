import * as THREE from 'three';
import { CONFIG, FIXED_CONTROLS, ORIGINS, COURSES, HOMES, OBLIGATIONS, ITEM_DEFS, SPAWN_DA_CENA, ROTINA_E_RASCUNHO, ROTINA_PROBLEMAS, REGRAS_SAO_RASCUNHO, REGRAS_PROBLEMAS, TEXTOS, TEXTOS_SAO_RASCUNHO, TEXTOS_PROBLEMAS, t, definirSexoDosTextos } from './data.js';
import { errosDaRotina } from './rotina.js';
import { errosDasRegras } from './regras.js';
import { World } from './world.js';
import { Phone, PHONE_DEFAULT_KEY } from './phone.js';
import { RenderPipeline } from './render.js';
import { PostFX, rendererEhSoftware } from './postfx.js';
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
import { MODO_VIVER, USANDO_RASCUNHO } from './data/cenaAtiva.js';

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

    this.scene = new THREE.Scene();
    // Uma detecção só governa toda a escala de qualidade: pós-processamento,
    // tamanho do mapa de sombra e frequência do mapa de ambiente. Num
    // rasterizador de software cada texel de sombra e cada busca de textura é
    // CPU, e o passe visual dobrava o tempo de um teste E2E.
    const ehSoftware = rendererEhSoftware(this.renderer);
    this.render = new RenderPipeline(this.renderer, this.scene, { software: ehSoftware });
    // Sem GPU, quase todo o custo de um quadro é resolução: medido em
    // 13/09/2026 com SwiftShader, 1280x720 levava 6,5 s por quadro e 640x360
    // levava 2,1 s — tirar as sombras mudava menos de 10%. Metade da
    // resolução nesse modo é o que separa "lento" de "travado" (e os testes
    // E2E de estourar o tempo esperando quadro).
    if (ehSoftware) this.renderer.setPixelRatio(0.5);

    // `?postfx=0` / `?postfx=1` força qualquer um dos dois — é assim que a
    // cadeia é inspecionada em ambiente sem GPU, já que é justamente lá que
    // ela ficaria desligada.
    const forcado = new URLSearchParams(location.search).get('postfx');
    const usarPostfx = forcado === null ? !ehSoftware : forcado !== '0';
    this.postfx = new PostFX(this.renderer, window.innerWidth, window.innerHeight, { enabled: usarPostfx });
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);

    this.world = new World(this.scene);
    this.render.configurarSombra(this.world.sun);
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
    // Rascunho do editor de conteúdo nesta máquina vem antes do publicado: é
    // o que deixa escrever a conversa e já testar no jogo, sem publicar.
    const rascunhoDeDialogos = this._dialogosDoEditor();
    this.dialogueTrees = rascunhoDeDialogos ?? await fetch('src/data/dialogues.json').then(r => r.json());
    this.usandoRascunho = USANDO_RASCUNHO || !!rascunhoDeDialogos;

    this.ui.setLoadingProgress(0.8, 'Montando a cidade');
    this.npcs = createNpcs(this.scene, this.world);

    this.ui.setLoadingProgress(1, 'Pronto');
    this.ui.hideLoading();
    if (MODO_VIVER) this._iniciarModoViver();
    else this._showMenu();
  }

  _dialogosDoEditor() {
    try {
      const bruto = localStorage.getItem('dialogue-editor-draft');
      const lido = bruto ? JSON.parse(bruto) : null;
      return lido && typeof lido === 'object' && Object.keys(lido).length ? lido : null;
    } catch {
      return null;   // armazenamento bloqueado: joga com o publicado
    }
  }

  // Modo Viver (editor.html → "▶ Modo Viver"): entra direto na cena do
  // editor, sem menu nem criação de personagem, e nada é salvo — o save da
  // partida de verdade fica intacto. Esc na pausa volta pro editor.
  _iniciarModoViver() {
    this.modoViver = MODO_VIVER;
    const voltar = () => { location.href = 'editor.html'; };
    const acoes = document.querySelector('#pause-menu .menu-actions');
    if (acoes && !document.getElementById('btn-voltar-editor')) {
      const botao = document.createElement('button');
      botao.id = 'btn-voltar-editor';
      botao.className = 'menu-action';
      botao.innerHTML = '<span>Voltar ao editor</span><span class="menu-action-note">Esc</span>';
      botao.onclick = voltar;
      acoes.appendChild(botao);
    }
    const sair = document.getElementById('btn-save-quit');
    if (sair) sair.style.display = 'none';
    const rodape = document.querySelector('#pause-menu .pause-foot');
    if (rodape) rodape.textContent = 'Modo Viver: nada é salvo';
    // Na captura, antes de qualquer outro atalho do jogo mexer na pausa. O Esc
    // que solta o mouse não chega na página; o seguinte, com a pausa aberta, volta.
    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape' || document.pointerLockElement) return;
      if (!this.ui.pauseMenu.classList.contains('hidden')) voltar();
    }, { capture: true });
    this._startGame(null, { name: 'Teste', sex: 'f', courseId: 'medicina' });
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
      this.postfx?.setSize(window.innerWidth, window.innerHeight);
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
    this.homeKind = HOMES[origin.home].kind;

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
      semDialogo: nome => this.ui.showToast(`${nome} ainda não tem o que dizer. Escreva a conversa no editor de diálogos.`),
    }, this.collectibles, this.inventory, this.needs, this.obligation, this.gameState, origin.id, this.profile.sex, this.world);

    // O diálogo guarda a troca de animação no gameState, mas quem conhece os
    // bonecos em cena é aqui. 'player' é o próprio jogador.
    this.dialogue.trocarAnimacoes = (quem, conjunto) => {
      if (quem === 'player') return this.player?.trocarAnimacoes(conjunto);
      return this.npcs.find(n => n.def.id === quem)?.trocarAnimacoes(conjunto);
    };

    // Celular: entrega a primeira mensagem e conduz o tutorial dos primeiros
    // minutos. Guardado em gameState.worldState porque o esquema do save é
    // uma lista branca e um campo novo no topo seria descartado em silêncio.
    // A partir daqui os moldes sabem o sexo do personagem, pra {{m:|f:|x:}}.
    definirSexoDosTextos(this.profile.sex);

    this.phone = new Phone({
      sex: this.profile.sex,
      passos: TEXTOS.tutorial,
      abertura: TEXTOS.abertura,
      textoVazio: t('vazio.celular'),
      getKeyLabel: acao => this.ui.getBindingLabel(acao),
      getTimeLabel: () => this.world.getFormattedTime(),
      onOpen: () => { if (document.pointerLockElement) document.exitPointerLock(); },
      onMessageRead: () => this.phone.advanceTutorial('leu_mensagem'),
      onNotify: msg => this.ui.showToast(t('toast.mensagem', { contato: msg.from })),
    });

    // Rascunho da aba Rotina com erro: o jogo abre (os valores foram presos em
    // limites seguros), mas quem escreveu precisa saber que não é isso que ele
    // escreveu. Quem só joga o publicado nunca vê esta mensagem.
    if (ROTINA_E_RASCUNHO) {
      const erros = errosDaRotina(ROTINA_PROBLEMAS);
      if (erros.length) {
        this.ui.showToast(`Rotina do editor com ${erros.length} erro(s): ${erros[0].onde} — ${erros[0].mensagem}`);
      }
    }
    if (REGRAS_SAO_RASCUNHO) {
      const erros = errosDasRegras(REGRAS_PROBLEMAS);
      if (erros.length) {
        this.ui.showToast(`Regras do editor com ${erros.length} erro(s): ${erros[0].onde} — ${erros[0].mensagem}`);
      }
    }

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
      // Quem mudou de jeito de andar durante a história continua mudado:
      // sem isso, recarregar desfaria o efeito da missão.
      for (const [quem, conjunto] of Object.entries(this.gameState.animacoes)) {
        this.dialogue.trocarAnimacoes(quem, conjunto);
      }
    } else if (this.modoViver?.spawn) {
      // Modo Viver: nasce no ponto que a câmera do editor olhava.
      const s = this.modoViver.spawn;
      this.player.position.set(s.x, s.y, s.z);
      this.player.facingAngle = Math.PI;
      this.player.camYaw = Math.PI;
    } else {
      // Partida nova começa DENTRO do apartamento, no quarto — é o ponto de
      // partida dos primeiros minutos. Quem diz onde é a peça "Início do
      // jogo" da cena; sem ela, o centro do mapa, pra não travar o jogo.
      const s = SPAWN_DA_CENA ?? { x: 0, y: 0, z: 0, facing: Math.PI };
      this.player.position.set(s.x, s.y, s.z);
      this.player.facingAngle = s.facing;
      this.player.camYaw = s.facing;
    }
    // No Modo Viver o tutorial do celular só atrapalharia o teste da cena.
    if (!this.modoViver) this.phone.startParentsConversation();
    // Quem está jogando com rascunho precisa saber: o que ele vê não é o que
    // está publicado (e ninguém mais vê isso ainda).
    if (this.usandoRascunho && !this.modoViver) {
      this.ui.showToast('Jogando com os rascunhos dos seus editores — publique pra valer pra todo mundo.');
    }
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
    // Modo Viver nunca grava: é um teste da cena do editor.
    if (!this.running || !this.player || this.modoViver) return false;
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

  /**
   * O recado com a tecla na frente. A tecla sai SEMPRE do sistema de atalhos
   * — inclusive a do soco, que antes estava escrita na frase ("Clique com o
   * botão esquerdo") e mentia pra quem remapeasse. O molde guarda só a
   * frase: o formato "TECLA — frase" é o que o HUD lê pra desenhar a
   * teclinha, e não pode ser problema de quem escreve o texto.
   */
  _recado(acao, chave, valores) {
    const rebindavel = this.ui.getBindingLabel(acao);
    const fixa = FIXED_CONTROLS.find(c => c.label === 'Socar')?.device;
    const tecla = rebindavel && rebindavel !== '—' ? rebindavel : (acao === 'attack' ? fixa : '');
    const frase = t(chave, valores);
    return tecla ? `${tecla} — ${frase}` : frase;
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
    this.ui.showToast(t('toast.diario'));
    if (this.ui.isJournalOpen()) this.ui.renderJournal(this.quests, this.collectibles, this.gameState);
  }

  _useItem(itemId) {
    const def = ITEM_DEFS[itemId];
    if (this.inventory.useItem(itemId, this.needs)) {
      this.ui.showToast(t('toast.item.usou', { item: def.name }));
      if (this.ui.isItemMenuOpen()) this.ui.renderItemMenu(this.inventory, this.needs, this._boundUseItem, this._boundDiscardItem);
    }
  }

  _discardItem(itemId) {
    const def = ITEM_DEFS[itemId];
    if (this.inventory.discardItem(itemId)) {
      this.ui.showToast(t('toast.item.descartou', { item: def.name }));
      if (this.ui.isItemMenuOpen()) this.ui.renderItemMenu(this.inventory, this.needs, this._boundUseItem, this._boundDiscardItem);
    }
  }

  _handleInteractionPrompt() {
    if (this.dialogue.active) return;

    // O aviso de contra-ataque tem prioridade sobre qualquer outro prompt —
    // é a janela real pra esquivar, então precisa ficar bem visível.
    if (this.dummy.telegraphActive) {
      this.ui.showPrompt(this._recado('dodge', 'prompt.esquiva'), true);
      return;
    }

    let nearestNpc = null;
    let nearestDist = CONFIG.INTERACT_RADIUS;
    for (const npc of this.npcs) {
      const d = Math.hypot(this.player.position.x - npc.position.x, this.player.position.z - npc.position.z);
      if (d < nearestDist) { nearestDist = d; nearestNpc = npc; }
    }
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
        this.ui.showPrompt(t('prompt.porta.trancada', { porta: rotulo }));
      } else {
        this.ui.showPrompt(this._recado('interact', porta.aberta ? 'prompt.porta.fechar' : 'prompt.porta.abrir', { porta: rotulo }));
        if (this.input.wasPressed(interactKey) && porta.alternar()) {
          this.phone.advanceTutorial('interagiu');
          if (porta.def.id === 'ap101') this.phone.advanceTutorial('saiu_do_apartamento');
          if (porta.def.id === 'entrada') this.phone.advanceTutorial('saiu_do_predio');
        }
      }
      promptShown = true;
    } else if (objeto) {
      this.ui.showPrompt(this._recado('interact', 'prompt.objeto', { objeto: objeto.label }));
      promptShown = true;
      if (this.input.wasPressed(interactKey)) {
        // O texto é escrito na peça, no editor de mapa.
        this.ui.showToast(objeto.texto || objeto.label);
        this.phone.advanceTutorial('interagiu');
      }
    } else if (nearestNpc) {
      this.ui.showPrompt(this._recado('interact', 'prompt.npc', { pessoa: nearestNpc.def.name }));
      promptShown = true;
      if (this.input.wasPressed(interactKey)) {
        this.dialogue.start(nearestNpc.def.id, this.world.isNight, nearestNpc);
      }
    } else if (nearbyWorldItem) {
      // O nome vem do que foi escrito na peça, ou do item que ela dá.
      const nome = nearbyWorldItem.def.rotulo || ITEM_DEFS[nearbyWorldItem.itemId]?.name || 'isso';
      this.ui.showPrompt(this._recado('interact', 'prompt.item', { item: nome }));
      promptShown = true;
      if (this.input.wasPressed(interactKey)) {
        this.collectibles.collectWorldItem(nearbyWorldItem);
        this.ui.showToast(t('toast.item.pegou', { item: nome }));
      }
    } else if (this._nearSleepSpot()) {
      this.ui.showPrompt(this._recado('interact', 'prompt.dormir'));
      promptShown = true;
      if (this.input.wasPressed(interactKey)) this._sleep();
    } else if (Math.hypot(this.player.position.x - this.dummy.position.x, this.player.position.z - this.dummy.position.z) < CONFIG.PUNCH_RANGE + 1) {
      this.ui.showPrompt(this._recado('attack', 'prompt.boneco'));
      promptShown = true;
    }

    if (nearbyFragment) {
      if (!promptShown) { this.ui.showPrompt(this._recado('photo', 'prompt.foto')); promptShown = true; }
      if (this.input.wasPressed(photoKey)) {
        const thumb = this._captureThumbnail();
        this.collectibles.capture(nearbyFragment, thumb);
        this.ui.flashPhoto();
        this.ui.showToast(t('toast.fragmento'));
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
      if (this.player.position.y < 0.2 && this.world.dentroDeConstrucao(this.player.position)) {
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
      // O compromisso avisa quando abre e quando está pra fechar: faltar por
      // não ter visto a hora passar não é desafio, é falta de informação.
      const aviso = this.obligation.update(this.world.timeOfDay * 24, this.player.position);
      if (aviso) this.ui.showToast(aviso);
    } else {
      this.input.consumeMouseDelta();
    }

    // A posição do jogador vai junto: é ela que decide se um NPC pode trocar
    // de lugar sem ninguém ver, quando a agenda dele muda de parada.
    for (const npc of this.npcs) npc.update(uiBlocking ? 0 : dt, this.player.position);
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

    // Sombra e ambiente acompanham o jogador e o horário. O ambiente só é
    // refeito quando o céu muda de verdade — é um render + convolução.
    this.render.focusShadows(this.world.sun, this.player.position);
    const ambienteMudou = this.world.skyColor
      && this.render.updateEnvironment(this.world.skyColor, this.world.groundColor, this.world.dayFactor);
    if (ambienteMudou || this.world.homeMaterialsDirty) {
      this.world.homeMaterialsDirty = false;
      // Reaplicado a cada troca de ambiente e quando um modelo da cena chega,
      // porque materiais criados depois (ou clonados) voltariam ao padrão 1.0.
      // O asfalto e as fachadas da cidade são rugosos, e com ambiente cheio
      // devolviam o azul do céu como se fossem espelhos foscos.
      this.render.applyEnvIntensity(this.scene, this.world.cityEnvIntensity);
    }

    this.camera.position.copy(this.player.cameraPosition);
    this.camera.lookAt(this.player.cameraTarget);

    this.postfx.render(this.scene, this.camera);

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
