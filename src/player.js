import * as THREE from 'three';
import { CONFIG } from './data.js';
import { buildHumanoid } from './characterModel.js';

export class Player {
  constructor(scene, world, variant = 'male') {
    this.world = world;
    const built = buildHumanoid({ variant });
    this.mesh = built.group;
    this.rig = built;
    scene.add(this.mesh);
    this.position = new THREE.Vector3(0, 0, -16);
    this.velocity = new THREE.Vector3();
    this.facingAngle = Math.PI;
    this.isRunning = false;
    this.walkT = 0;

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
    this.isRunning = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && !this.exhausted;

    const baseSpeed = this.isRunning ? CONFIG.PLAYER_SPEED_RUN : CONFIG.PLAYER_SPEED_WALK;
    const speed = this.exhausted ? baseSpeed * 0.55 : baseSpeed;

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
    this.rig.applyWalkSwing(swing);

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
