import * as THREE from 'three';
import { clone as cloneSkeleton } from '../vendor/jsm/utils/SkeletonUtils.js';
import { getCharacterTemplates } from './assets.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Poses de bind (T-pose) dos braços, extraídas do glTF original — os dois
// personagens (macho/fêmea) compartilham o mesmo rig, então os valores
// servem para ambos.
const ARM_BIND = {
  l: new THREE.Quaternion(0.149803027510643, 0.6911307573318481, -0.14938844740390778, 0.6910719275474548),
  r: new THREE.Quaternion(0.1498030126094818, -0.6911307573318481, 0.14938844740390778, 0.6910719275474548),
};
const THIGH_BIND = new THREE.Quaternion(0.9898310303688049, 0, 0, 0.14224845170974731);

// Correção de T-pose -> braços caídos ao lado do corpo (achada por tentativa
// e erro: 82° em torno do eixo Z local do ombro, sinais opostos por lado).
const ARM_REST_ANGLE = (82 * Math.PI) / 180;

function findBones(root) {
  const get = (name) => root.getObjectByName(name);
  return {
    thighL: get('thigh_l'), thighR: get('thigh_r'),
    upperarmL: get('upperarm_l'), upperarmR: get('upperarm_r'),
    head: get('Head'),
  };
}

/**
 * Instancia um clone independente (esqueleto próprio) do personagem
 * masculino ou feminino do pack "Universal Base Characters" (Quaternius,
 * CC0), já na pose de descanso (braços ao lado do corpo).
 */
export function buildHumanoid({ variant = 'male' } = {}) {
  const templates = getCharacterTemplates();
  const template = templates?.[variant] ?? templates?.male;
  const group = cloneSkeleton(template);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const bones = findBones(group);
  bones.upperarmL.quaternion.copy(ARM_BIND.l).multiply(
    new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -ARM_REST_ANGLE)
  );
  bones.upperarmR.quaternion.copy(ARM_BIND.r).multiply(
    new THREE.Quaternion().setFromAxisAngle(Z_AXIS, ARM_REST_ANGLE)
  );

  return {
    group,
    bones,
    applyWalkSwing(swing) {
      bones.thighL.quaternion.copy(THIGH_BIND).multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, swing));
      bones.thighR.quaternion.copy(THIGH_BIND).multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, -swing));
      bones.upperarmL.quaternion.copy(ARM_BIND.l)
        .multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -ARM_REST_ANGLE))
        .multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, -swing * 0.6));
      bones.upperarmR.quaternion.copy(ARM_BIND.r)
        .multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, ARM_REST_ANGLE))
        .multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, swing * 0.6));
    },
  };
}
