import * as THREE from 'three';
import { CONFIG } from './data.js';

function buildHumanoid(color) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b295, roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.28), cloth);
  torso.position.y = 1.15;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skin);
  head.position.y = 1.62;
  group.add(head);

  const legGeo = new THREE.BoxGeometry(0.18, 0.7, 0.2);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.14, 0.45, 0);
  legL.name = 'legL';
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.14, 0.45, 0);
  legR.name = 'legR';
  group.add(legL, legR);

  const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.18);
  const armL = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.35, 1.15, 0);
  armL.name = 'armL';
  const armR = new THREE.Mesh(armGeo, cloth);
  armR.position.set(0.35, 1.15, 0);
  armR.name = 'armR';
  group.add(armL, armR);

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

export class Player {
  constructor(scene, world) {
    this.world = world;
    this.mesh = buildHumanoid(0x3f6fb0);
    scene.add(this.mesh);
    this.position = new THREE.Vector3(0, 0, -16);
    this.velocity = new THREE.Vector3();
    this.facingAngle = Math.PI;
    this.isRunning = false;
    this.walkT = 0;
    this.legL = this.mesh.getObjectByName('legL');
    this.legR = this.mesh.getObjectByName('legR');
    this.armL = this.mesh.getObjectByName('armL');
    this.armR = this.mesh.getObjectByName('armR');

    // Câmera terceira-pessoa em coordenadas esféricas relativas ao jogador
    this.camYaw = Math.PI;
    this.camPitch = 0.35;
    this.camDistance = 6.5;
    this._updateCamera();
  }

  snapCamera() {
    this._updateCamera();
  }

  applyCameraInput(dx, dy) {
    this.camYaw -= dx * 0.0022;
    this.camPitch -= dy * 0.0022;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch, 0.08, 1.3);
  }

  update(dt, input) {
    const moveX = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const moveZ = (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0);
    const hasInput = moveX !== 0 || moveZ !== 0;
    this.isRunning = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

    const speed = this.isRunning ? CONFIG.PLAYER_SPEED_RUN : CONFIG.PLAYER_SPEED_WALK;

    if (hasInput) {
      const forward = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
      const right = new THREE.Vector3(Math.sin(this.camYaw + Math.PI / 2), 0, Math.cos(this.camYaw + Math.PI / 2));
      const move = new THREE.Vector3();
      move.addScaledVector(forward, -moveZ);
      move.addScaledVector(right, moveX);
      move.normalize().multiplyScalar(speed * dt);
      this.position.x += move.x;
      this.position.z += move.z;

      const targetAngle = Math.atan2(move.x, move.z);
      let diff = targetAngle - this.facingAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facingAngle += diff * Math.min(1, dt * 10);

      this.walkT += dt * (this.isRunning ? 10 : 6);
    } else {
      this.walkT *= 0.9;
    }

    this.world.resolveCollision(this.position, CONFIG.PLAYER_RADIUS);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facingAngle;

    const swing = Math.sin(this.walkT) * (hasInput ? 0.6 : 0);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing;
    this.armR.rotation.x = swing;

    this._updateCamera();
  }

  _updateCamera() {
    const target = this.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const desiredDist = this.camDistance;
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch)
    );
    const camPos = target.clone().addScaledVector(dir, desiredDist);

    const toCam = camPos.clone().sub(target);
    const dist = toCam.length();
    const allowed = this.world.raycastBuildings(target, toCam.clone().normalize(), dist);
    const finalDist = Math.min(dist, Math.max(allowed - 0.3, 1.2));
    this.cameraPosition = target.clone().addScaledVector(toCam.normalize(), finalDist);
    this.cameraTarget = target;
  }
}
