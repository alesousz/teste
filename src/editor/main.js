import * as THREE from 'three';
import { PALETTE, paletteById } from './palette.js';

const GRID_SIZE = 60;
const CELL = 1;

class EditorApp {
  constructor() {
    this.canvas = document.getElementById('editor-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6f8fae);
    this.scene.fog = new THREE.Fog(0x6f8fae, 40, 140);
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 500);
    this.camera.position.set(0, 12, 20);

    this._buildLights();
    this._buildGround();

    this.items = []; // {uuid, typeId, position:[x,y,z], rotY, mesh}
    this.selected = null;
    this.armedType = null;
    this.ghost = null;

    this.keys = new Set();
    this.pointerLocked = false;
    this.yaw = 0;
    this.pitch = -0.35;

    this._bindInput();
    this._buildPaletteUI();
    this._bindSceneUI();

    this._loadLastOrEmpty();

    this.clock = new THREE.Clock();
    this._loop();

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.renderer.setSize(innerWidth, innerHeight);
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x3a3a2f, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const d = 60;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    this.scene.add(sun);
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4c7a4a, roughness: 1 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / CELL, 0x223322, 0x2f4f2f);
    grid.position.y = 0.01;
    this.scene.add(grid);
  }

  _buildPaletteUI() {
    const list = document.getElementById('palette-list');
    list.innerHTML = PALETTE.map(p => `
      <div class="palette-item" data-id="${p.id}">
        <span class="palette-key">${p.key}</span><span>${p.name}</span>
      </div>
    `).join('');
    this.paletteEls = {};
    list.querySelectorAll('.palette-item').forEach(el => {
      this.paletteEls[el.dataset.id] = el;
      el.addEventListener('click', () => this._arm(el.dataset.id));
    });
  }

  _bindInput() {
    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      const item = PALETTE.find(p => p.key === e.key);
      if (item) this._arm(item.id);
      if (e.code === 'Escape') this._arm(null);
      if (e.code === 'KeyR') this._rotateSelectedOrGhost();
      if (e.code === 'Delete' || e.code === 'Backspace') this._deleteSelected();
      if (e.code === 'Tab') { e.preventDefault(); this._toggleScenePanel(); }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    this.canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
        return;
      }
      this._onConfirmClick();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      document.getElementById('mode-label').textContent = this.pointerLocked
        ? (this.armedType ? `Colocando: ${paletteById(this.armedType).name}` : 'Selecionar (clique para colocar/selecionar)')
        : 'Clique na tela para travar o cursor';
    });
    document.addEventListener('mousemove', e => {
      if (!this.pointerLocked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.3, 1.3);
    });
  }

  _arm(typeId) {
    this.armedType = typeId;
    this._armedProps = null;
    Object.entries(this.paletteEls).forEach(([id, el]) => el.classList.toggle('active', id === typeId));
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    if (typeId) {
      const def = paletteById(typeId);
      this.ghost = def.build(def.defaultProps ? def.defaultProps() : undefined);
      this.ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
      this.scene.add(this.ghost);
      this.selected = null;
      this._updateSelectionHighlight();
      this._renderPropsPanel();
    }
    const label = document.getElementById('mode-label');
    if (label) label.textContent = typeId ? `Colocando: ${paletteById(typeId).name}` : 'Selecionar (clique para colocar/selecionar)';
    this._renderPropsPanel();
  }

  _snap(v) {
    return Math.round(v / CELL) * CELL;
  }

  _raycastGround() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(this.groundPlane, hit)) return hit;
    return null;
  }

  _raycastItems() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const meshes = this.items.map(it => it.mesh);
    const hits = ray.intersectObjects(meshes, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !this.items.find(it => it.mesh === obj)) obj = obj.parent;
    return this.items.find(it => it.mesh === obj) || null;
  }

  _onConfirmClick() {
    if (this.armedType) {
      const hit = this._raycastGround();
      if (!hit) return;
      this._place(this.armedType, this._snap(hit.x), this._snap(hit.z), this._armedProps);
    } else {
      const hitItem = this._raycastItems();
      this.selected = hitItem;
      this._updateSelectionHighlight();
      this._renderPropsPanel();
    }
  }

  _place(typeId, x, z, props) {
    const def = paletteById(typeId);
    const itemProps = props ? { ...props } : (def.defaultProps ? def.defaultProps() : undefined);
    const mesh = def.build(itemProps);
    mesh.position.set(x, 0, z);
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(mesh);
    const item = { uuid: crypto.randomUUID(), typeId, position: [x, 0, z], rotY: 0, props: itemProps, mesh };
    this.items.push(item);
    return item;
  }

  _rebuildItemMesh(item) {
    const def = paletteById(item.typeId);
    const oldMesh = item.mesh;
    const newMesh = def.build(item.props);
    newMesh.position.fromArray(item.position);
    newMesh.rotation.y = item.rotY;
    newMesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.remove(oldMesh);
    this.scene.add(newMesh);
    item.mesh = newMesh;
    this._updateSelectionHighlight();
  }

  _renderPropsPanel() {
    const panel = document.getElementById('props-panel');
    const target = this.selected || (this.armedType ? { typeId: this.armedType, props: paletteById(this.armedType).defaultProps?.() } : null);
    const def = target && paletteById(target.typeId);
    if (!def || !def.propFields) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    panel.innerHTML = `<h3>${def.name}${this.selected ? '' : ' (a colocar)'}</h3>` + def.propFields.map(f => {
      const value = target.props?.[f.key] ?? '';
      if (f.type === 'select') {
        return `<label>${f.label}<select data-key="${f.key}">${f.options.map(o => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('')}</select></label>`;
      }
      if (f.type === 'color') {
        return `<label>${f.label}<input type="color" data-key="${f.key}" value="${value || '#b9c4cc'}" /></label>`;
      }
      if (f.type === 'number') {
        return `<label>${f.label}<input type="number" data-key="${f.key}" value="${value}" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 1}" /></label>`;
      }
      return `<label>${f.label}<input type="text" data-key="${f.key}" value="${value}" /></label>`;
    }).join('');

    panel.querySelectorAll('[data-key]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.key;
        const val = input.type === 'number' ? Number(input.value) : input.value;
        if (this.selected) {
          this.selected.props = { ...this.selected.props, [key]: val };
          this._rebuildItemMesh(this.selected);
        } else if (this.armedType) {
          if (!this._armedProps) this._armedProps = paletteById(this.armedType).defaultProps?.() ?? {};
          this._armedProps[key] = val;
          if (this.ghost) { this.scene.remove(this.ghost); }
          this.ghost = paletteById(this.armedType).build(this._armedProps);
          this.ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
          this.scene.add(this.ghost);
        }
      });
    });
  }

  _deleteSelected() {
    if (!this.selected) return;
    this.scene.remove(this.selected.mesh);
    this.items = this.items.filter(it => it !== this.selected);
    this.selected = null;
    this._updateSelectionHighlight();
    this._renderPropsPanel();
  }

  _rotateSelectedOrGhost() {
    if (this.armedType && this.ghost) {
      this.ghost.rotation.y += Math.PI / 2;
    } else if (this.selected) {
      this.selected.rotY += Math.PI / 2;
      this.selected.mesh.rotation.y = this.selected.rotY;
    }
  }

  _updateSelectionHighlight() {
    if (this._highlightBox) { this.scene.remove(this._highlightBox); this._highlightBox = null; }
    if (this.selected) {
      const box = new THREE.BoxHelper(this.selected.mesh, 0xffd98a);
      this.scene.add(box);
      this._highlightBox = box;
    }
  }

  _bindSceneUI() {
    document.getElementById('btn-save-scene').onclick = () => this._saveScene();
    document.getElementById('btn-new-scene').onclick = () => this._newScene();
    document.getElementById('btn-export-scene').onclick = () => this._exportScene();
    this._renderSceneList();
  }

  _toggleScenePanel() {
    const panel = document.getElementById('scene-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden') && document.pointerLockElement) document.exitPointerLock();
  }

  _serializeScene() {
    return {
      items: this.items.map(it => ({ typeId: it.typeId, position: it.position, rotY: it.rotY, props: it.props })),
    };
  }

  _loadScenesMap() {
    try { return JSON.parse(localStorage.getItem('editor-scenes') || '{}'); } catch { return {}; }
  }
  _saveScenesMap(map) {
    localStorage.setItem('editor-scenes', JSON.stringify(map));
  }

  _saveScene() {
    const name = document.getElementById('scene-name').value.trim() || 'sem-nome';
    const map = this._loadScenesMap();
    map[name] = this._serializeScene();
    this._saveScenesMap(map);
    localStorage.setItem('editor-last-scene', name);
    this._renderSceneList();
  }

  _newScene() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
    this.selected = null;
    this._updateSelectionHighlight();
    document.getElementById('scene-name').value = '';
  }

  _loadScene(name) {
    const map = this._loadScenesMap();
    const data = map[name];
    if (!data) return;
    this._newScene();
    for (const it of data.items) {
      const placed = this._place(it.typeId, it.position[0], it.position[2], it.props);
      placed.rotY = it.rotY || 0;
      placed.mesh.rotation.y = placed.rotY;
    }
    document.getElementById('scene-name').value = name;
    localStorage.setItem('editor-last-scene', name);
  }

  _deleteScene(name) {
    const map = this._loadScenesMap();
    delete map[name];
    this._saveScenesMap(map);
    this._renderSceneList();
  }

  _loadLastOrEmpty() {
    const last = localStorage.getItem('editor-last-scene');
    const map = this._loadScenesMap();
    if (last && map[last]) this._loadScene(last);
  }

  _renderSceneList() {
    const map = this._loadScenesMap();
    const el = document.getElementById('scene-list');
    const names = Object.keys(map);
    el.innerHTML = names.length ? names.map(n => `
      <div class="scene-row">
        <span>${n}</span>
        <span>
          <button data-act="load" data-name="${n}">Carregar</button>
          <button data-act="del" data-name="${n}">Excluir</button>
        </span>
      </div>
    `).join('') : '<p class="hint">Nenhuma cena salva ainda.</p>';
    el.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        if (b.dataset.act === 'load') this._loadScene(b.dataset.name);
        if (b.dataset.act === 'del') this._deleteScene(b.dataset.name);
      };
    });
  }

  _exportScene() {
    const out = document.getElementById('export-output');
    out.classList.remove('hidden');
    out.value = JSON.stringify(this._serializeScene(), null, 2);
    out.focus();
    out.select();
  }

  _updateCamera(dt) {
    const forward = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 18 : 8) * dt;
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW')) move.addScaledVector(forward, 1);
    if (this.keys.has('KeyS')) move.addScaledVector(forward, -1);
    if (this.keys.has('KeyA')) move.addScaledVector(right, -1);
    if (this.keys.has('KeyD')) move.addScaledVector(right, 1);
    if (this.keys.has('KeyE')) move.y += 1;
    if (this.keys.has('KeyQ')) move.y -= 1;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    this.camera.position.add(move);
    this.camera.position.y = Math.max(1, this.camera.position.y);

    const lookDir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.camera.lookAt(this.camera.position.clone().add(lookDir));
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this._updateCamera(dt);

    if (this.ghost && this.armedType) {
      const hit = this._raycastGround();
      if (hit) this.ghost.position.set(this._snap(hit.x), 0, this._snap(hit.z));
    }
    if (this._highlightBox) this._highlightBox.update();

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__editor = new EditorApp();
});
