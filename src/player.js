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
    this.velocityY = 0;
    this.isGrounded = true;
    this.isAttacking = false;
    this.isHitStunned = false;
    this.hp = CONFIG.PLAYER_MAX_HP;
    this.koTimer = 0;
    // Definido externamente (pelo Game) pra resolver o "quem foi atingido"
    // no momento em que o soco começa.
    this.onAttackImpact = null;

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

  takeDamage(amount) {
    if (this.hp <= 0 || this.isHitStunned) return;
    this.hp = Math.max(0, this.hp - amount);
    this.isHitStunned = true;
    this.rig.playOnce('hit', () => { this.isHitStunned = false; });
    if (this.hp === 0) this.koTimer = CONFIG.PLAYER_KO_RECOVER_DELAY;
  }

  update(dt, input) {
    const moveX = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const moveZ = (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0);
    const hasInput = moveX !== 0 || moveZ !== 0;
    this.isRunning = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && !this.exhausted;

    const baseSpeed = this.isRunning ? CONFIG.PLAYER_SPEED_RUN : CONFIG.PLAYER_SPEED_WALK;
    const speed = this.exhausted ? baseSpeed * 0.55 : baseSpeed;

    if (this.koTimer > 0) {
      this.koTimer -= dt;
      if (this.koTimer <= 0) { this.koTimer = 0; this.hp = CONFIG.PLAYER_MAX_HP; }
    }
    // Soco trava o personagem no lugar por um instante (mesma lógica de
    // "root" de jogos de ação simples) e resolve o acerto já no começo do
    // movimento, sem esperar o quadro exato do impacto na animação.
    if (input.consumeAttack() && this.isGrounded && !this.isAttacking && !this.isHitStunned) {
      this.isAttacking = true;
      this.onAttackImpact?.();
      this.rig.playOnce('attack', () => { this.isAttacking = false; });
    }

    if (hasInput && !this.isAttacking && !this.isHitStunned) {
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
    }

    if (input.wasPressed('Space') && this.isGrounded && !this.isAttacking && !this.isHitStunned) {
      this.velocityY = CONFIG.JUMP_SPEED;
      this.isGrounded = false;
    }
    this.velocityY -= CONFIG.GRAVITY * dt;
    this.position.y += this.velocityY * dt;
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocityY = 0;
      this.isGrounded = true;
    }

    this.world.resolveCollision(this.position, CONFIG.PLAYER_RADIUS);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facingAngle;

    if (!this.isGrounded) {
      this.rig.setState('jump');
    } else if (!this.isAttacking && !this.isHitStunned) {
      this.rig.setState(!hasInput ? 'idle' : (this.isRunning ? 'run' : 'walk'));
    }
    this.rig.update(dt);

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
