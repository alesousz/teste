import * as THREE from 'three';
import { NPC_DEFS, JANELAS_DE_NPC, AGENDAS, clipesDoPersonagem } from './data.js';
import { paradaAgora } from './rotina.js';
import { buildHumanoid } from './characterModel.js';

// A que distância do jogador dá pra trocar alguém de lugar sem ninguém ver.
// É a primeira forma de fazer a agenda acontecer: em vez de calcular caminho
// pelas ruas, quem está longe some e reaparece na próxima parada. Perto do
// jogador ninguém se teleporta — quem tem perna vai andando, e quem não tem
// espera o jogador se afastar.
const DISTANCIA_PRA_SUMIR = 45;

// NPCs com turno fixo (dono do mercado, professora) fecham fora do horário do
// compromisso que atendem. A tabela vem pronta da rotina (src/data/routine.json,
// aba Rotina do editor) — mudar o horário do turno lá muda o expediente do NPC
// aqui, sem nenhuma lista paralela pra esquecer de atualizar.


function buildNpcMesh(def) {
  const variant = def.sexo === 'f' ? 'female' : 'male';
  const built = buildHumanoid({ variant, clipes: clipesDoPersonagem(def.animacoes) });
  const { group } = built;

  if (def.prop === 'phone') {
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.15, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111318, emissive: 0x224466, emissiveIntensity: 0.6 })
    );
    phone.position.set(0.3, 1.05, 0.15);
    phone.rotation.x = -0.6;
    group.add(phone);
  }
  if (def.prop === 'guitar') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 0.95, 0.2);
    group.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x5b3d26 }));
    neck.position.set(0.4, 1.1, 0.2);
    group.add(neck);
  }
  if (def.prop === 'cart') {
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
    cart.position.set(0.9, 0.35, 0);
    group.add(cart);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0xb03a3a }));
    canopy.position.set(0.9, 0.95, 0);
    canopy.rotation.y = Math.PI / 4;
    group.add(canopy);
  }

  return built;
}

export class NPC {
  constructor(scene, world, def) {
    this.def = def;
    this.world = world;
    const built = buildNpcMesh(def);
    this.mesh = built.group;
    this.rig = built;
    this.position = new THREE.Vector3(def.home.x, 0, def.home.z);
    this.mesh.position.copy(this.position);
    scene.add(this.mesh);

    this.target = this.position.clone();
    this.waitTimer = Math.random() * 3;
    this.facing = 0;
    this.isWalking = false;
    this.hasMetPlayer = false;
    this.questGiven = false;

    // Ritmo dia/noite: NPC com obrigação fixa (ver JANELAS_DE_NPC) só fica
    // "ativo" dentro do próprio horário de turno; os demais que perambulam
    // ficam ativos de dia e voltam pra casa (parados) de noite. A checagem
    // roda só ~1x/s (com um atraso inicial aleatório pra não sincronizar
    // todo mundo no mesmo frame) — não precisa ser por frame.
    this.obligation = JANELAS_DE_NPC[def.id] || null;
    this.resting = false;
    this._scheduleCheckTimer = Math.random();

    // Agenda: as paradas do dia (aba Rotina). Quem não tem uma continua com o
    // comportamento de sempre — em volta da própria peça, o dia todo.
    this.agenda = AGENDAS[def.id] ?? null;
    this.parada = null;
    this.viajando = false;
    // O conjunto de animação escrito na peça é o de sempre; o da parada vale
    // enquanto ele está lá; o que uma missão trocou manda em todos, porque é
    // uma mudança na pessoa, não no que ela está fazendo agora.
    this.conjuntoDaCena = def.animacoes;
    this.conjuntoDaHistoria = null;
    this.centro = { x: def.home.x, z: def.home.z };
    this.raio = def.wanderRadius;
    // No primeiro quadro ele já nasce onde a agenda manda — ninguém vê a
    // troca, porque o jogo ainda não começou a desenhar.
    if (this.agenda) this._verificarAgenda(null, true);
  }

  /**
   * Troca o conjunto de animação em jogo: é isto que uma missão ou um
   * diálogo dispara quando a pessoa passa a se mexer de outro jeito daqui
   * em diante (ver o efeito "Trocar animações do personagem").
   */
  trocarAnimacoes(id) {
    this.conjuntoDaHistoria = id;
    this.def.animacoes = id;
    return this.rig.trocarConjunto(clipesDoPersonagem(id));
  }

  _isActiveNow(world) {
    if (this.obligation) {
      const hour = world.timeOfDay * 24;
      return hour >= this.obligation.startHour && hour < this.obligation.endHour;
    }
    if (this.def.wanderRadius > 0) return !world.isNight;
    return true;
  }

  _pickNewTarget() {
    if (this.resting || this.raio <= 0) {
      this.target = new THREE.Vector3(this.centro.x, 0, this.centro.z);
      return;
    }
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * this.raio;
    this.target = new THREE.Vector3(
      this.centro.x + Math.cos(angle) * r,
      0,
      this.centro.z + Math.sin(angle) * r
    );
  }

  // --- Agenda ---------------------------------------------------------------

  _pontoDe(parada) {
    return parada?.ponto ?? { x: this.def.home.x, z: this.def.home.z };
  }

  _longeDoJogador(ponto, jogador) {
    if (!jogador) return true;
    return Math.hypot(ponto.x - jogador.x, ponto.z - jogador.z) > DISTANCIA_PRA_SUMIR;
  }

  /**
   * Qual conjunto de animação vale agora. A ordem importa: o que uma missão
   * trocou é uma mudança na pessoa e manda em tudo; a parada só decide como
   * ela se mexe enquanto está ali (sentada em casa, empurrando o carrinho).
   */
  _aplicarAnimacaoDaParada() {
    const id = this.conjuntoDaHistoria || this.parada?.animacoes || this.conjuntoDaCena;
    if (!id || id === this.def.animacoes) return;
    this.def.animacoes = id;
    this.rig.trocarConjunto(clipesDoPersonagem(id));
  }

  /**
   * Onde ele deveria estar a esta hora. Se já está lá, não faz nada; se não,
   * some e reaparece (longe do jogador), vai andando (se tiver perna), ou
   * espera o jogador virar as costas.
   */
  _verificarAgenda(jogador, inicial = false) {
    const hora = (this.world?.timeOfDay ?? 0) * 24;
    const nova = paradaAgora(this.agenda, hora);
    const mudou = nova !== this.parada;
    this.parada = nova;
    this.centro = this._pontoDe(nova);
    this.raio = nova ? nova.raio : this.def.wanderRadius;
    if (mudou || inicial) this._aplicarAnimacaoDaParada();

    const distancia = Math.hypot(this.position.x - this.centro.x, this.position.z - this.centro.z);
    if (distancia <= this.raio + 1) { this.viajando = false; return; }

    const some = inicial
      || (this._longeDoJogador(this.position, jogador) && this._longeDoJogador(this.centro, jogador));
    if (some) {
      this.position.set(this.centro.x, 0, this.centro.z);
      this.mesh.position.copy(this.position);
      this.viajando = false;
      this.waitTimer = 0;
      this._pickNewTarget();
    } else if (this.def.speed > 0) {
      this.viajando = true;
      this.target.set(this.centro.x, 0, this.centro.z);
    }
  }

  update(dt, jogador = null) {
    this._scheduleCheckTimer -= dt;
    if (this._scheduleCheckTimer <= 0) {
      this._scheduleCheckTimer = 1 + Math.random() * 0.5;
      if (this.agenda) {
        this._verificarAgenda(jogador);
      } else {
        const shouldRest = !this._isActiveNow(this.world);
        if (shouldRest !== this.resting) {
          this.resting = shouldRest;
          this._pickNewTarget();
          this.waitTimer = 0;
        }
      }
    }

    this.isWalking = false;
    if (this.def.speed > 0) {
      const toTarget = this.target.clone().sub(this.position);
      toTarget.y = 0;
      const dist = toTarget.length();
      if (dist < 0.3) {
        this.viajando = false;
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) {
          this._pickNewTarget();
          this.waitTimer = 2 + Math.random() * 4;
        }
      } else {
        toTarget.normalize();
        this.position.addScaledVector(toTarget, this.def.speed * dt);
        const targetAngle = Math.atan2(toTarget.x, toTarget.z);
        let diff = targetAngle - this.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.facing += diff * Math.min(1, dt * 6);
        this.isWalking = true;
      }
    }
    this.world.resolveCollision(this.position, 0.4);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;
    this.rig.setState(this.isWalking ? 'walk' : 'idle');
    this.rig.update(dt);
  }
}

export function createNpcs(scene, world) {
  return NPC_DEFS.map(def => new NPC(scene, world, def));
}
