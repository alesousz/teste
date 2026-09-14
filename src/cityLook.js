// Aparência dos prédios da cidade: fachada com janelas (que acendem à noite),
// mureta e equipamentos no teto, antena nos altos e toldo listrado na frente.
// Usada pelo jogo (world.js) e pela prévia do editor de mapa, pra o prédio
// aparecer igual nos dois. Tudo sai da `semente`: a mesma semente dá sempre as
// mesmas janelas e o mesmo teto.
import * as THREE from 'three';

export function makeWindowTexture(seed, w, h, lit) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cols = Math.max(2, Math.round(w / 3));
  const rows = Math.max(3, Math.round(h / 3));
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s % 1000) / 1000; };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const on = lit ? rnd() > 0.45 : rnd() > 0.85;
      ctx.fillStyle = on ? 'rgba(255,214,140,0.95)' : 'rgba(70,80,95,0.5)';
      ctx.fillRect(c * cw + cw * 0.15, r * ch + ch * 0.2, cw * 0.7, ch * 0.6);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Prédio da cidade com a base no chão, centrado em (0, 0) — quem usa posiciona
 * o grupo. `corpo` é a caixa das janelas: o jogo troca a textura dela entre
 * acesa (`userData.litTex`) e apagada (`userData.darkTex`) no ciclo do dia.
 */
export function construirPredioDaCidade({ w, d, h, color, semente = 0 }) {
  const grupo = new THREE.Group();

  const litTex = makeWindowTexture(semente, w, h, true);
  const darkTex = makeWindowTexture(semente, w, h, false);
  litTex.repeat.set(1, Math.max(1, Math.round(h / 4)));
  darkTex.repeat.set(1, Math.max(1, Math.round(h / 4)));
  const sideMat = new THREE.MeshStandardMaterial({ color, map: darkTex, roughness: 0.8 });
  const topMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideMat, sideMat, topMat, topMat, sideMat, sideMat]);
  corpo.position.y = h / 2;
  corpo.castShadow = true;
  corpo.receiveShadow = true;
  corpo.userData.litTex = litTex;
  corpo.userData.darkTex = darkTex;
  corpo.userData.isBuildingSide = true;
  grupo.add(corpo);

  // Teto: mureta, um ou dois equipamentos e antena nos prédios altos.
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.9 });
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.3, d + 0.15), roofMat);
  parapet.position.y = h + 0.15;
  parapet.castShadow = true;
  grupo.add(parapet);

  let seed = semente;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000) / 1000; };
  const propCount = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < propCount; i++) {
    const px = (rnd() - 0.5) * (w * 0.5);
    const pz = (rnd() - 0.5) * (d * 0.5);
    if (rnd() > 0.5) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x8a9199, roughness: 0.7 }));
      ac.position.set(px, h + 0.55, pz);
      ac.castShadow = true;
      grupo.add(ac);
    } else {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.8 }));
      tank.position.set(px, h + 0.75, pz);
      tank.castShadow = true;
      grupo.add(tank);
    }
  }
  if (h > 24) {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 3, 6), roofMat);
    antenna.position.y = h + 1.8;
    grupo.add(antenna);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 0.8 }),
    );
    light.position.y = h + 3.3;
    grupo.add(light);
  }

  // Toldo listrado na fachada da frente (+z).
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 8;
  const ctx = canvas.getContext('2d');
  const stripeColor = `#${new THREE.Color(color).offsetHSL(0, 0.1, -0.1).getHexString()}`;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? stripeColor : '#e8e4da';
    ctx.fillRect(i * 4, 0, 4, 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(w / 2)), 1);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.4, 0.12, 0.6),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
  );
  awning.position.set(0, 2.6, d / 2 + 0.25);
  awning.castShadow = true;
  grupo.add(awning);

  return { grupo, corpo };
}
