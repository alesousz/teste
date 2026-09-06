import * as THREE from 'three';
import { CONFIG, DUMMY_POS } from './data.js';

function makeBarSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 24;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 0.33, 1);
  sprite.renderOrder = 10;
  return { sprite, canvas, ctx, tex };
}

// Boneco de treino: alvo fixo pra testar soco/dano sem envolver NPCs nem
// inimigos hostis pela cidade — só um saco de pancadas que reseta o HP.
export class TrainingDummy {
  constructor(scene) {
    this.position = new THREE.Vector3(DUMMY_POS.x, 0, DUMMY_POS.z);
    this.maxHp = CONFIG.DUMMY_MAX_HP;
    this.hp = this.maxHp;
    this.respawnTimer = 0;
    this.hitFlash = 0;
    // Chance de "revidar" a cada soco recebido — dá um motivo real pra ter
    // HP e reação de dano no jogador, sem introduzir NPC hostil nem
    // inimigo pela cidade. O contra-ataque fica pendente até o jogador
    // sair do meio do próprio soco (ver consumePendingCounter).
    this.pendingCounter = false;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    const postMat = new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.85 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.4, 8), postMat);
    post.position.y = 1.2;
    post.castShadow = true;
    this.group.add(post);

    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    chain.position.y = 2.25;
    this.group.add(chain);

    const bagMat = new THREE.MeshStandardMaterial({ color: 0xb04a3a, roughness: 0.7 });
    this.bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 10), bagMat);
    this.bag.position.y = 1.55;
    this.bag.castShadow = true;
    this.group.add(this.bag);

    const bar = makeBarSprite();
    this.barCanvas = bar.canvas;
    this.barCtx = bar.ctx;
    this.barTex = bar.tex;
    bar.sprite.position.set(0, 2.75, 0);
    this.group.add(bar.sprite);

    this._redrawBar();
  }

  _redrawBar() {
    const ctx = this.barCtx;
    const w = this.barCanvas.width;
    const h = this.barCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10,10,14,0.75)';
    ctx.fillRect(0, 0, w, h);
    const ratio = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = ratio > 0.35 ? '#8fd35a' : '#d9543a';
    ctx.fillRect(3, 3, (w - 6) * ratio, h - 6);
    this.barTex.needsUpdate = true;
  }

  get isDown() {
    return this.hp <= 0;
  }

  takeDamage(amount) {
    if (this.isDown) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = 0.18;
    this._redrawBar();
    if (this.isDown) {
      this.respawnTimer = CONFIG.DUMMY_RESPAWN_DELAY;
    } else if (!this.pendingCounter && Math.random() < CONFIG.DUMMY_COUNTER_CHANCE) {
      this.pendingCounter = true;
    }
    return true;
  }

  // Consumida pelo Game assim que o jogador não estiver mais travado no
  // próprio soco — evita que o contra-ataque interrompa a animação de
  // ataque em andamento.
  consumePendingCounter() {
    if (!this.pendingCounter) return false;
    this.pendingCounter = false;
    return true;
  }

  update(dt) {
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      const f = this.hitFlash / 0.18;
      this.bag.rotation.z = Math.sin(this.hitFlash * 45) * 0.3 * f;
    } else {
      this.bag.rotation.z *= 0.8;
    }
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.hp = this.maxHp;
        this._redrawBar();
      }
    }
  }
}

export function createTrainingDummy(scene) {
  return new TrainingDummy(scene);
}
