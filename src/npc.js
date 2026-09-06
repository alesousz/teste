import * as THREE from 'three';
import { NPC_DEFS } from './data.js';
import { buildHumanoid } from './characterModel.js';

const HAIR_PALETTE = [0x2b2118, 0x4a3223, 0x1a1a1a, 0x6b4a2f, 0x3a2a1a, 0x7a5a3a];
function hairColorFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return HAIR_PALETTE[Math.abs(hash) % HAIR_PALETTE.length];
}

function buildNpcMesh(def) {
  const built = buildHumanoid({ clothColor: def.color, hairColor: hairColorFor(def.id) });
  const { group, armR } = built;

  if (def.prop === 'phone') {
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.15, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111318, emissive: 0x224466, emissiveIntensity: 0.6 })
    );
    phone.position.set(0.4, 1.1, 0.15);
    phone.rotation.x = -0.6;
    group.add(phone);
    armR.rotation.x = -1.1;
  }
  if (def.prop === 'guitar') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 1.0, 0.2);
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

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return built;
}

export class NPC {
  constructor(scene, world, def) {
    this.def = def;
    this.world = world;
    const built = buildNpcMesh(def);
    this.mesh = built.group;
    this.legL = built.legL; this.legR = built.legR;
    this.position = new THREE.Vector3(def.home.x, 0, def.home.z);
    this.mesh.position.copy(this.position);
    scene.add(this.mesh);

    this.target = this.position.clone();
    this.waitTimer = Math.random() * 3;
    this.facing = 0;
    this.walkT = 0;
    this.hasMetPlayer = false;
    this.questGiven = false;
  }

  _pickNewTarget() {
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
        this.walkT *= 0.9;
      } else {
        toTarget.normalize();
        this.position.addScaledVector(toTarget, this.def.speed * dt);
        const targetAngle = Math.atan2(toTarget.x, toTarget.z);
        let diff = targetAngle - this.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.facing += diff * Math.min(1, dt * 6);
        this.walkT += dt * 6;
      }
    }
    this.world.resolveCollision(this.position, 0.4);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;
    const swing = Math.sin(this.walkT) * 0.5;
    if (this.legL) this.legL.rotation.x = swing;
    if (this.legR) this.legR.rotation.x = -swing;
  }
}

export function createNpcs(scene, world) {
  return NPC_DEFS.map(def => new NPC(scene, world, def));
}
