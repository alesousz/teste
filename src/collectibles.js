import * as THREE from 'three';
import { FRAGMENT_SPOTS, WORLD_ITEM_SPOTS, CONFIG } from './data.js';

// ---------------------------------------------------------------------------
// Colecionáveis (fragmentos de memória) + item de missão (livro)
// ---------------------------------------------------------------------------
export class CollectibleSystem {
  constructor(scene, questSystem, inventorySystem) {
    this.scene = scene;
    this.quests = questSystem;
    this.inventory = inventorySystem;
    this.fragments = [];
    this.collectedIds = new Set();
    this.photos = [];

    const geo = new THREE.IcosahedronGeometry(0.35, 0);
    for (const spot of FRAGMENT_SPOTS) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe58a, emissiveIntensity: 0.9, roughness: 0.3 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(spot.position.x, 1.4, spot.position.z);
      const light = new THREE.PointLight(0xffe58a, 1.2, 5);
      light.position.copy(mesh.position);
      scene.add(mesh, light);
      this.fragments.push({ def: spot, mesh, light, collected: false });
    }

    // Só pra saves antigos, que gravavam o livro separado (ver restoreItem).
    this.item = null;

    // Coisas largadas pelo chão, colocadas no editor de mapa: a caixinha
    // dourada vai pro inventário; a peça que só marca objetivo de missão (o
    // livro de Marina) é um objeto vermelho e baixo.
    this.worldItems = [];
    this.collectedWorldItemIds = new Set();
    const caixaGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    const livroGeo = new THREE.BoxGeometry(0.3, 0.05, 0.22);
    for (const spot of WORLD_ITEM_SPOTS) {
      const daMissao = !spot.itemId;
      const mat = new THREE.MeshStandardMaterial(daMissao
        ? { color: 0xb03a3a, roughness: 0.7 }
        : { color: 0xd9a441, emissive: 0x5a3a10, emissiveIntensity: 0.4, roughness: 0.6 });
      const mesh = new THREE.Mesh(daMissao ? livroGeo : caixaGeo, mat);
      mesh.position.set(spot.position.x, daMissao ? 0.35 : 0.6, spot.position.z);
      scene.add(mesh);
      this.worldItems.push({ def: spot, itemId: spot.itemId, mesh, collected: false, altura: mesh.position.y });
    }
  }

  restoreCollected(ids) {
    for (const id of ids || []) {
      const f = this.fragments.find(f => f.def.id === id);
      if (f && !f.collected) {
        f.collected = true;
        this.scene.remove(f.mesh, f.light);
        this.collectedIds.add(id);
      }
    }
  }

  restoreItem(collected) {
    if (collected && this.item && !this.item.collected) {
      this.item.collected = true;
      this.scene.remove(this.item.mesh);
    }
  }

  restoreCollectedWorldItems(ids) {
    for (const id of ids || []) {
      const w = this.worldItems.find(w => w.def.id === id);
      if (w && !w.collected) {
        w.collected = true;
        this.scene.remove(w.mesh);
        this.collectedWorldItemIds.add(id);
      }
    }
  }

  update(dt) {
    for (const f of this.fragments) {
      if (f.collected) continue;
      f.mesh.rotation.y += dt * 1.5;
      f.mesh.position.y = 1.4 + Math.sin(performance.now() * 0.002 + f.mesh.position.x) * 0.15;
      f.light.position.y = f.mesh.position.y;
    }
    for (const w of this.worldItems) {
      if (w.collected) continue;
      w.mesh.rotation.y += dt * (w.itemId ? 0.8 : 0.4);
      w.mesh.position.y = w.altura + Math.sin(performance.now() * 0.0025 + w.mesh.position.x) * 0.1;
    }
  }

  findNearbyWorldItem(pos) {
    for (const w of this.worldItems) {
      if (w.collected) continue;
      const d = Math.hypot(pos.x - w.mesh.position.x, pos.z - w.mesh.position.z);
      if (d < CONFIG.INTERACT_RADIUS) return w;
    }
    return null;
  }

  // Pegar do chão: vai pro inventário se tiver item, e marca o objetivo se a
  // peça estiver ligada a uma missão. Os dois foram escolhidos no editor.
  collectWorldItem(worldItem) {
    worldItem.collected = true;
    this.scene.remove(worldItem.mesh);
    this.collectedWorldItemIds.add(worldItem.def.id);
    if (worldItem.itemId) this.inventory.addItem(worldItem.itemId);
    const { questId, objetivo } = worldItem.def;
    if (questId && objetivo) this.quests.completeObjective(questId, objetivo);
  }

  findNearbyFragment(pos) {
    for (const f of this.fragments) {
      if (f.collected) continue;
      const d = Math.hypot(pos.x - f.mesh.position.x, pos.z - f.mesh.position.z);
      if (d < CONFIG.PHOTO_RADIUS) return f;
    }
    return null;
  }

  capture(fragment, thumbnailDataUrl) {
    fragment.collected = true;
    this.collectedIds.add(fragment.def.id);
    this.scene.remove(fragment.mesh, fragment.light);
    this.photos.push({ note: fragment.def.note, thumb: thumbnailDataUrl });
    // Qual missão a foto conta vem da peça do fragmento, no editor.
    this.quests.incrementObjective(fragment.def.questId, fragment.def.objetivo);
  }
}
