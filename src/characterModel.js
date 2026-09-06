import * as THREE from 'three';

const faceTextureCache = new Map();

function getFaceTexture(skinHex) {
  if (faceTextureCache.has(skinHex)) return faceTextureCache.get(skinHex);
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  // olhos
  ctx.fillStyle = '#20242b';
  ctx.beginPath(); ctx.ellipse(44, 58, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(84, 58, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(46, 55, 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(86, 55, 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  // boca
  ctx.strokeStyle = '#7a4a3a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(50, 88);
  ctx.quadraticCurveTo(64, 96, 78, 88);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  faceTextureCache.set(skinHex, tex);
  return tex;
}

/**
 * Constrói um humanoide low-poly compartilhado por jogador e NPCs.
 * Usa cápsulas em vez de caixas pra silhueta mais orgânica, um rosto simples
 * (textura numa placa colada na cabeça, voltada pra frente/+Z local — que é
 * a direção de deslocamento depois de aplicar rotation.y) e uma "touca" de
 * cabelo pra dar um pouco de identidade visual.
 */
export function buildHumanoid({ clothColor, skinColor = 0xe0b295, pantsColor = 0x2f3542, hairColor = 0x2b2118 } = {}) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.75, metalness: 0.02 });
  const cloth = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.75, metalness: 0.02 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 4, 8), cloth);
  torso.position.y = 1.18;
  group.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.62;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skin);
  headGroup.add(head);

  const faceTex = getFaceTexture(skinColor);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false })
  );
  // -Z é a "frente" do modelo: a câmera em terceira pessoa fica no lado +Z
  // (atrás do personagem) na orientação padrão, então o rosto precisa ficar
  // do lado oposto pra não aparecer voltado pra câmera.
  face.position.set(0, -0.02, -0.205);
  face.rotation.y = Math.PI;
  headGroup.add(face);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 0.05;
  headGroup.add(hairCap);

  group.add(headGroup);

  const legGeo = new THREE.CapsuleGeometry(0.1, 0.46, 4, 6);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.13, 0.4, 0);
  legL.name = 'legL';
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.13, 0.4, 0);
  legR.name = 'legR';
  group.add(legL, legR);

  const armGeo = new THREE.CapsuleGeometry(0.08, 0.42, 4, 6);
  const armL = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.34, 1.18, 0);
  armL.name = 'armL';
  const armR = new THREE.Mesh(armGeo, cloth);
  armR.position.set(0.34, 1.18, 0);
  armR.name = 'armR';
  group.add(armL, armR);

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  face.castShadow = false;
  face.receiveShadow = false;

  return {
    group,
    legL, legR, armL, armR,
    setArmAttachPoint: (side) => side === 'L' ? armL : armR,
  };
}
