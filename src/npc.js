import * as THREE from 'three';
import { NPC_DEFS, OBLIGATIONS } from './data.js';
import { buildHumanoid } from './characterModel.js';

// NPCs com um turno fixo (dono do mercado, professora) usam o mesmo horário
// que o próprio sistema de obrigação do jogador já define — sem duplicar
// dado nenhum. Fora do turno eles "fecham" (ficam parados no lugar).
const NPC_OBLIGATIONS = {};
for (const ob of Object.values(OBLIGATIONS)) {
  if (ob.npc) NPC_OBLIGATIONS[ob.npc] = ob;
}

const FEMALE_NPCS = new Set(['mae_operaria', 'mae_nobre', 'marina', 'busker', 'professora']);

function buildNpcMesh(def) {
  const variant = FEMALE_NPCS.has(def.id) ? 'female' : 'male';
  const built = buildHumanoid({ variant });
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

    // Ritmo dia/noite: NPC com obrigação fixa (ver NPC_OBLIGATIONS) só fica
    // "ativo" dentro do próprio horário de turno; os demais que perambulam
    // ficam ativos de dia e voltam pra casa (parados) de noite. A checagem
    // roda só ~1x/s (com um atraso inicial aleatório pra não sincronizar
    // todo mundo no mesmo frame) — não precisa ser por frame.
    this.obligation = NPC_OBLIGATIONS[def.id] || null;
    this.resting = false;
    this._scheduleCheckTimer = Math.random();
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
    if (this.resting) {
      this.target = new THREE.Vector3(this.def.home.x, 0, this.def.home.z);
      return;
    }
    if (this.def.wanderRadius <= 0) return;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * this.def.wanderRadius;
    this.target = new THREE.Vector3(
      this.def.home.x + Math.cos(angle) * r,
      0,
      this.def.home.z + Math.sin(angle) * r
    );
  }

  update(dt) {
    this._scheduleCheckTimer -= dt;
    if (this._scheduleCheckTimer <= 0) {
      this._scheduleCheckTimer = 1 + Math.random() * 0.5;
      const shouldRest = !this._isActiveNow(this.world);
      if (shouldRest !== this.resting) {
        this.resting = shouldRest;
        this._pickNewTarget();
        this.waitTimer = 0;
      }
    }

    this.isWalking = false;
    if (this.def.speed > 0) {
      const toTarget = this.target.clone().sub(this.position);
      toTarget.y = 0;
      const dist = toTarget.length();
      if (dist < 0.3) {
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
