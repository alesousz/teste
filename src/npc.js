import * as THREE from 'three';
import { NPC_DEFS } from './data.js';

function buildNpcMesh(def) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a879, roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x33363f, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.26), cloth);
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 12), skin);
  head.position.y = 1.58;
  group.add(head);
  const legGeo = new THREE.BoxGeometry(0.17, 0.68, 0.19);
  const legL = new THREE.Mesh(legGeo, pants); legL.position.set(-0.13, 0.44, 0); legL.name = 'legL';
  const legR = new THREE.Mesh(legGeo, pants); legR.position.set(0.13, 0.44, 0); legR.name = 'legR';
  group.add(legL, legR);
  const armGeo = new THREE.BoxGeometry(0.14, 0.58, 0.17);
  const armL = new THREE.Mesh(armGeo, cloth); armL.position.set(-0.33, 1.12, 0); armL.name = 'armL';
  const armR = new THREE.Mesh(armGeo, cloth); armR.position.set(0.33, 1.12, 0); armR.name = 'armR';
  group.add(armL, armR);

  if (def.prop === 'phone') {
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.15, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111318, emissive: 0x224466, emissiveIntensity: 0.6 })
    );
    phone.position.set(0.4, 1.05, 0.15);
    phone.rotation.x = -0.6;
    group.add(phone);
    armR.rotation.x = -1.1;
  }
  if (def.prop === 'guitar') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 0.95, 0.2);
    group.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x5b3d26 }));
    neck.position.set(0.4, 1.05, 0.2);
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
  return { group, legL, legR, armL, armR };
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
