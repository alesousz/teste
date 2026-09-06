import * as THREE from 'three';
import { CONFIG, CITY, BUILDING_COLOR_PALETTE, LANDMARK_SPECS } from './data.js';

function makeWindowTexture(seed, w, h, lit) {
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

function makeAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(128, 0); ctx.lineTo(128, 256);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 128); ctx.lineTo(256, 128);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(CONFIG.GRID_SIZE * 3, CONFIG.GRID_SIZE * 3);
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.buildingAABBs = CITY.buildings;
    this.windowTexturesLit = [];
    this.windowTexturesDark = [];
    this._buildGround();
    this._buildBlocks();
    this._buildProps();
    this._buildSky();
    this._buildLights();
    this.streetLamps = [];
    this._buildStreetLamps();
    this.timeOfDay = 0.3; // 0..1, 0 = meia-noite, 0.5 = meio-dia
    this.dayCount = 1;
  }

  _buildGround() {
    const size = CONFIG.GRID_SIZE * CONFIG.CELL + 40;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshStandardMaterial({ map: makeAsphaltTexture(), roughness: 1 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildBlocks() {
    const grassCanvas = document.createElement('canvas');
    grassCanvas.width = 64; grassCanvas.height = 64;
    const gctx = grassCanvas.getContext('2d');
    gctx.fillStyle = '#4c7a4a';
    gctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 200; i++) {
      gctx.fillStyle = `rgba(${60 + Math.random() * 30},${110 + Math.random() * 30},${60 + Math.random() * 20},0.5)`;
      gctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }
    const grassTex = new THREE.CanvasTexture(grassCanvas);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(6, 6);

    for (const block of CITY.blocks) {
      const isGrass = block.type === 'park' || block.type.startsWith('home_');
      const lotMat = new THREE.MeshStandardMaterial(
        isGrass
          ? { map: grassTex, roughness: 1 }
          : { color: block.type === 'plaza' ? 0xb9b0a0 : 0x8d8f92, roughness: 0.95 }
      );
      const lotGeo = new THREE.PlaneGeometry(CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE);
      const lot = new THREE.Mesh(lotGeo, lotMat);
      lot.rotation.x = -Math.PI / 2;
      lot.position.set(block.cx, 0.02, block.cz);
      lot.receiveShadow = true;
      this.scene.add(lot);

      for (const b of block.lots) {
        if (b.kind) this._addLandmark(b);
        else this._addBuilding(b);
      }

      if (block.type === 'plaza') this._addPlazaProps(block);
      if (block.type === 'park') this._addParkProps(block);
    }
  }

  _addLandmark(b) {
    const spec = LANDMARK_SPECS[b.kind];
    const bodyMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), bodyMat);
    body.position.set(b.cx, b.h / 2, b.cz);
    body.castShadow = true;
    body.receiveShadow = true;
    this.scene.add(body);

    const roofMat = new THREE.MeshStandardMaterial({ color: spec.roofColor, roughness: 0.9 });
    const roofRadius = Math.max(b.w, b.d) / 1.7;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(roofRadius, b.h * 0.5, 4), roofMat);
    roof.position.set(b.cx, b.h + b.h * 0.25, b.cz);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.scene.add(roof);

    const label = this._makeLabelSprite(spec.label);
    label.position.set(b.cx, b.h + b.h * 0.6 + 1.2, b.cz);
    this.scene.add(label);
  }

  _makeLabelSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15,17,22,0.75)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffd98a';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6, 1.5, 1);
    return sprite;
  }

  _addBuilding(b) {
    const color = BUILDING_COLOR_PALETTE[b.colorIdx];
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    const litTex = makeWindowTexture(b.winSeed, b.w, b.h, true);
    const darkTex = makeWindowTexture(b.winSeed, b.w, b.h, false);
    litTex.repeat.set(1, Math.max(1, Math.round(b.h / 4)));
    darkTex.repeat.set(1, Math.max(1, Math.round(b.h / 4)));
    const sideMat = new THREE.MeshStandardMaterial({ color, map: darkTex, roughness: 0.8 });
    const topMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 });
    const mats = [sideMat, sideMat, topMat, topMat, sideMat, sideMat];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(b.cx, b.h / 2, b.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.litTex = litTex;
    mesh.userData.darkTex = darkTex;
    mesh.userData.isBuildingSide = true;
    this.scene.add(mesh);
    this.windowTexturesLit.push(mesh);
  }

  _addPlazaProps(block) {
    const fountainGeo = new THREE.CylinderGeometry(4, 4.4, 0.8, 24);
    const fountainMat = new THREE.MeshStandardMaterial({ color: 0x9aa5ab, roughness: 0.6 });
    const fountain = new THREE.Mesh(fountainGeo, fountainMat);
    fountain.position.set(block.cx, 0.4, block.cz);
    fountain.castShadow = true;
    fountain.receiveShadow = true;
    this.scene.add(fountain);

    const waterGeo = new THREE.CylinderGeometry(3.4, 3.4, 0.1, 24);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3d7ea6, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(block.cx, 0.85, block.cz);
    this.scene.add(water);

    const centerGeo = new THREE.CylinderGeometry(0.5, 0.6, 2.2, 12);
    const center = new THREE.Mesh(centerGeo, fountainMat);
    center.position.set(block.cx, 1.9, block.cz);
    this.scene.add(center);
  }

  _addParkProps(block) {
    const treeCount = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < treeCount; i++) {
      const x = block.cx + (Math.random() - 0.5) * (CONFIG.BLOCK_SIZE - 6);
      const z = block.cz + (Math.random() - 0.5) * (CONFIG.BLOCK_SIZE - 6);
      this._addTree(x, z);
    }
    for (let i = 0; i < 3; i++) {
      const x = block.cx + (Math.random() - 0.5) * (CONFIG.BLOCK_SIZE - 10);
      const z = block.cz + (Math.random() - 0.5) * (CONFIG.BLOCK_SIZE - 10);
      this._addBench(x, z, Math.random() * Math.PI);
    }
  }

  _addTree(x, z) {
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.32, 2.2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3d26, roughness: 1 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.1, z);
    this.scene.add(trunk);

    const leavesGeo = new THREE.ConeGeometry(1.6, 3.2, 8);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x3d6b3f, roughness: 1 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.set(x, 3.4, z);
    this.scene.add(leaves);
  }

  _addBench(x, z, rotY) {
    const group = new THREE.Group();
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.9 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.6), seatMat);
    seat.position.y = 0.5;
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.08), seatMat);
    back.position.set(0, 0.8, -0.26);
    group.add(back);
    const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.5);
    for (const dx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(legGeo, seatMat);
      leg.position.set(dx, 0.25, 0);
      group.add(leg);
    }
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    group.traverse(o => { if (o.isMesh) { o.receiveShadow = true; } });
    this.scene.add(group);
  }

  _buildStreetLamps() {
    const positions = [];
    const half = (CONFIG.GRID_SIZE) * CONFIG.CELL / 2;
    for (let ix = 0; ix <= CONFIG.GRID_SIZE; ix++) {
      for (let iz = 0; iz <= CONFIG.GRID_SIZE; iz++) {
        if ((ix + iz) % 2 !== 0) continue;
        const x = ix * CONFIG.CELL - half;
        const z = iz * CONFIG.CELL - half;
        positions.push({ x, z });
      }
    }
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.4 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c9, emissive: 0xfff2c9, emissiveIntensity: 0 });
    for (const p of positions) {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5, 8), poleMat);
      pole.position.y = 2.5;
      group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), poleMat);
      arm.position.set(0.5, 5, 0);
      group.add(arm);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), bulbMat.clone());
      bulb.position.set(1.05, 4.85, 0);
      group.add(bulb);
      const light = new THREE.PointLight(0xffdca0, 0, 12, 2);
      light.position.set(1.05, 4.8, 0);
      light.castShadow = false;
      group.add(light);
      group.position.set(p.x, 0, p.z);
      this.scene.add(group);
      this.streetLamps.push({ bulb, light });
    }
  }

  _buildProps() {
    // vendedor: pequena barraca perto da praça (posição alinhada a NPC_DEFS.almeida)
  }

  _buildSky() {
    this.scene.fog = new THREE.Fog(0x445566, 40, 190);
    this.sky = new THREE.Color(0x87ceeb);
    this.scene.background = this.sky.clone();
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfd7ff, 0x3a3a2f, 0.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);
    const d = 140;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.moonAmbient = new THREE.AmbientLight(0x445577, 0.15);
    this.scene.add(this.moonAmbient);
  }

  setTimeOfDay(t) {
    this.timeOfDay = ((t % 1) + 1) % 1;
  }

  advanceToNextMorning() {
    this.timeOfDay = 0.3;
    this.dayCount += 1;
  }

  update(dt) {
    const prevT = this.timeOfDay;
    this.timeOfDay += dt / CONFIG.DAY_LENGTH_SECONDS;
    if (this.timeOfDay >= 1) {
      this.timeOfDay -= 1;
      this.dayCount++;
    }
    const t = this.timeOfDay;

    const angle = t * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    const sunDist = 120;
    this.sun.position.set(Math.cos(angle) * sunDist, Math.max(sunHeight, -0.15) * sunDist + 20, Math.sin(angle * 0.6) * 40);
    this.sun.target.position.set(0, 0, 0);

    const dayFactor = THREE.MathUtils.clamp(sunHeight * 1.6 + 0.25, 0, 1);
    this.sun.intensity = 0.15 + dayFactor * 1.3;
    this.hemi.intensity = 0.15 + dayFactor * 0.55;

    const nightColor = new THREE.Color(0x0a1224);
    const duskColor = new THREE.Color(0xd98a5a);
    const dayColor = new THREE.Color(0x87ceeb);

    let skyColor;
    if (sunHeight > 0.15) {
      skyColor = dayColor;
    } else if (sunHeight > -0.15) {
      const f = (sunHeight + 0.15) / 0.3;
      skyColor = duskColor.clone().lerp(dayColor, Math.max(0, f));
      if (f < 0.5) skyColor = nightColor.clone().lerp(duskColor, f * 2);
    } else {
      skyColor = nightColor;
    }
    this.scene.background.copy(skyColor);
    this.scene.fog.color.copy(skyColor);
    this.sun.color.copy(dayFactor > 0.5 ? new THREE.Color(0xfff3e0) : duskColor);

    const isNight = dayFactor < 0.35;
    this.isNight = isNight;
    const lampIntensity = isNight ? THREE.MathUtils.clamp((0.35 - dayFactor) / 0.35, 0, 1) : 0;
    for (const lamp of this.streetLamps) {
      lamp.light.intensity = lampIntensity * 1.4;
      lamp.bulb.material.emissiveIntensity = lampIntensity;
    }
    for (const mesh of this.windowTexturesLit) {
      const useLit = isNight;
      const targetTex = useLit ? mesh.userData.litTex : mesh.userData.darkTex;
      if (mesh.material[0].map !== targetTex) {
        mesh.material[0].map = targetTex;
        mesh.material[1].map = targetTex;
        mesh.material[4].map = targetTex;
        mesh.material[5].map = targetTex;
        mesh.material[0].needsUpdate = true;
        mesh.material[1].needsUpdate = true;
        mesh.material[4].needsUpdate = true;
        mesh.material[5].needsUpdate = true;
      }
    }
  }

  getFormattedTime() {
    const totalMinutes = this.timeOfDay * 24 * 60;
    let h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Resolve colisão circular do jogador contra todas as AABBs de edifícios.
  resolveCollision(pos, radius) {
    for (const b of this.buildingAABBs) {
      const closestX = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
      const closestZ = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const overlap = radius - dist;
        pos.x += (dx / dist) * overlap;
        pos.z += (dz / dist) * overlap;
      }
    }
    const half = CONFIG.WORLD_HALF - 2;
    pos.x = THREE.MathUtils.clamp(pos.x, -half, half);
    pos.z = THREE.MathUtils.clamp(pos.z, -half, half);
    return pos;
  }

  // Raycast simples usado pela câmera para não atravessar prédios.
  raycastBuildings(origin, dir, maxDist) {
    let closest = maxDist;
    const ray = new THREE.Ray(origin, dir);
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    for (const b of this.buildingAABBs) {
      box.min.set(b.minX, 0, b.minZ);
      box.max.set(b.maxX, b.h, b.maxZ);
      if (ray.intersectBox(box, hit)) {
        const d = origin.distanceTo(hit);
        if (d < closest) closest = d;
      }
    }
    return closest;
  }
}
