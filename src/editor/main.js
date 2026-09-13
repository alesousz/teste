import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { PALETTE, paletteById, addDynamicProps, TIPOS_QUE_O_JOGO_LE } from './palette.js?v=10';
import { SCENE as GAME_SCENE } from '../data/scene.js';

const GRID_SIZE = 60;
const CELL = 1;
// Altura de um andar de trabalho: a parede do Building Kit tem 2,4 m, e o
// piso do andar de cima assenta em cima dela.
const ALTURA_ANDAR = 2.4;

// Papel de uma peça de kit pelo nome do arquivo: `papeis` no índice mapeia
// expressão regular → papel (piso, escada, porta).
function papelDoArquivo(papeis, arquivo) {
  for (const [padrao, papel] of Object.entries(papeis ?? {})) {
    if (new RegExp(padrao, 'i').test(arquivo)) return papel;
  }
  return null;
}

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
    this.camera.position.set(0, 15, 10);

    this._buildLights();
    this._buildGround();

    this.items = []; // {uuid, typeId, position:[x,y,z], rotY, mesh}
    this.selected = null;
    this.armedType = null;
    this.ghost = null;

    this.keys = new Set();
    this.pointerLocked = false;
    this.yaw = 0;
    this.pitch = -1.0;
    this.toolMode = 'select';
    // Exposto pra depuração e pros testes, como window.__game no jogo.
    window.__editor = this;

    this._bindInput();
    this._bindSceneUI();

    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.renderer.setSize(innerWidth, innerHeight);

    this._init();
  }

  async _init() {
    const modelos = await this._listarModelos();
    const loader = new GLTFLoader();
    // Em paralelo: com ~100 arquivos, baixar um de cada vez deixava o editor
    // parado antes de mostrar qualquer coisa. O catálogo mantém a ordem da
    // lista, não a ordem de chegada.
    const carregados = await Promise.all(modelos.map(m =>
      loader.loadAsync(m.url).then(
        gltf => ({ m, gltf }),
        () => { console.warn(`Não carregou ${m.url}: ignorando.`); return null; },
      )));
    for (const item of carregados) {
      if (!item) continue;
      const { m, gltf } = item;
      // Arquivo de um objeto só: o nome do arquivo vira o nome do item, porque
      // o nó raiz costuma ser genérico ("RootNode" nos pacotes da Quaternius).
      // Arquivos com várias peças (móveis, itens) mantêm o nome de cada nó.
      // Pacote de variações (`variacoes` no índice, ex.: natureza da
      // Quaternius): um nó raiz com várias versões do objeto enfileiradas, e
      // cada filho vira um item. O jogo acha o filho pelo nome e o coloca na
      // posição do editor, sem o deslocamento da fileira.
      const pecas = m.variacoes ? { children: [...(gltf.scene.children[0]?.children ?? [])] } : gltf.scene;
      if (!m.variacoes && gltf.scene.children.length === 1 && !m.variasPecas) gltf.scene.children[0].name = m.nome;
      if (m.escala !== 1) pecas.children.forEach(c => c.scale.multiplyScalar(m.escala));
      addDynamicProps(pecas, {
        categoria: m.categoria, url: m.url, escala: m.escala, variasPecas: m.variasPecas || m.variacoes,
        colisao: m.colisao, sobreposicaoLivre: m.sobreposicaoLivre, papel: m.papel,
      });
    }

    this._buildPaletteUI();
    this._loadLastOrEmpty();
    this._loop();
  }


  // Modelos do projeto (soltos em assets/props) e pacotes de terceiros (uma
  // subpasta cada, com indice.json). pacotes.json e os índices são gerados por
  // tools/gerar-indices-props.mjs — copiou modelos, roda o script.
  async _listarModelos() {
    const soltos = [
      { arquivo: 'moveis.glb', variasPecas: true },
      { arquivo: 'itens.glb', variasPecas: true },
      { arquivo: 'fusca.glb', variasPecas: false },
      { arquivo: 'velhinho.glb', variasPecas: false },
    ].map(s => ({
      url: `assets/props/${s.arquivo}`, nome: s.arquivo.replace(/\.glb$/, ''),
      escala: 1, categoria: null, variasPecas: s.variasPecas,
    }));

    const lerJson = async url => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    };
    let pastas = [];
    try {
      pastas = await lerJson('assets/props/pacotes.json');
    } catch (e) {
      console.warn(`Sem assets/props/pacotes.json (${e.message}): só os modelos do projeto entram no catálogo.`);
    }
    const pacotes = await Promise.all(pastas.map(async pasta => {
      try {
        const indice = await lerJson(`assets/props/${pasta}/indice.json`);
        return indice.modelos.map(arquivo => ({
          url: `assets/props/${pasta}/${arquivo}`, nome: arquivo.replace(/\.glb$/, ''),
          // `escalas` corrige um arquivo específico quando o pacote não tem
          // proporção uniforme (os animais da Quaternius vêm todos do mesmo
          // tamanho, da raposa à vaca).
          escala: indice.escalas?.[arquivo] ?? indice.escala ?? 1,
          categoria: indice.categoria ?? null, variasPecas: false,
          variacoes: !!indice.variacoes,
          // Kit de construção: peças que encaixam umas nas outras (porta no
          // vão, piso sob a parede) e não passam pela trava de lugar ocupado.
          sobreposicaoLivre: !!indice.sobreposicaoLivre,
          papel: papelDoArquivo(indice.papeis, arquivo),
          // Exceção à colisão automática: `colisoes` por arquivo ou `colisao`
          // pro pacote inteiro (true força, false desliga).
          colisao: indice.colisoes?.[arquivo] ?? indice.colisao,
        }));
      } catch (e) {
        console.warn(`Sem índice em assets/props/${pasta} (${e.message}): pasta ignorada.`);
        return [];
      }
    }));
    return [...soltos, ...pacotes.flat()];
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
    // O grid acompanha o andar de trabalho (ver _mudarAndar).
    this.grid = grid;
    this.andar = 0;
  }

  _generateThumbnail(item) {
    if (!this.thumbRenderer) {
      this.thumbRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.thumbRenderer.setSize(128, 128);
      this.thumbScene = new THREE.Scene();
      const light = new THREE.DirectionalLight(0xffffff, 1.2);
      light.position.set(5, 10, 5);
      this.thumbScene.add(light, new THREE.AmbientLight(0xffffff, 0.8));
      this.thumbCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    }
    const obj = item.build();
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);
    
    obj.position.sub(center);
    this.thumbScene.add(obj);
    
    this.thumbCamera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
    this.thumbCamera.lookAt(0, 0, 0);
    this.thumbRenderer.render(this.thumbScene, this.thumbCamera);
    
    const dataUrl = this.thumbRenderer.domElement.toDataURL();
    this.thumbScene.remove(obj);
    return dataUrl;
  }

  _buildPaletteUI() {
    const list = document.getElementById('palette-list');
    const searchInput = document.getElementById('palette-search');
    const sidebar = document.getElementById('palette-sidebar');
    
    let activeCategory = 'Tudo';
    const categories = ['Tudo', ...new Set(PALETTE.map(p => p.category))];
    
    // Constrói abas laterais dinâmicas
    if (sidebar) {
      const catHtml = categories.map(c => `<button class="cat-btn ${c === activeCategory ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
      sidebar.innerHTML = `<h3>Catálogo</h3>${catHtml}<div style="flex-grow: 1;"></div><div class="hint">Teclas 1-9, 0 para atalhos</div><div class="hint">Esc — soltar item</div>`;
      
      sidebar.querySelectorAll('.cat-btn').forEach(btn => {
        btn.onclick = () => {
          activeCategory = btn.dataset.cat;
          sidebar.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === activeCategory));
          renderList(searchInput ? searchInput.value : '');
        };
      });
    }

    const renderList = (filter = '') => {
      const lowerFilter = filter.toLowerCase();
      const filtered = PALETTE.filter(p => {
        if (activeCategory !== 'Tudo' && p.category !== activeCategory) return false;
        return p.name.toLowerCase().includes(lowerFilter);
      });
      
      list.innerHTML = filtered.map(p => {
        if (!p._thumb) p._thumb = this._generateThumbnail(p);
        return `
        <div class="palette-item ${this.armedType === p.id ? 'active' : ''}" data-id="${p.id}" title="${p.name}">
          ${p.key && p.key !== '-' ? `<span class="palette-key">${p.key}</span>` : ''}
          ${TIPOS_QUE_O_JOGO_LE.has(p.id) || p.modelo ? '' : '<span title="O jogo ainda não carrega este item: ele só aparece na cena do editor." style="position: absolute; top: 6px; right: 6px; font-size: 0.55em; padding: 1px 4px; border-radius: 3px; background: #b0342a; color: #fff; pointer-events: none;">só editor</span>'}
          <img src="${p._thumb}" style="width: 60px; height: 60px; object-fit: contain; pointer-events: none;" />
          <span style="position: absolute; bottom: 4px; font-size: 0.65em; opacity: 0.7; pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%;">${p.name}</span>
        </div>
        `;
      }).join('');
      
      this.paletteEls = {};
      list.querySelectorAll('.palette-item').forEach(el => {
        this.paletteEls[el.dataset.id] = el;
        el.addEventListener('click', () => {
          this._arm(el.dataset.id);
        });
      });
    };

    if (searchInput) searchInput.addEventListener('input', (e) => renderList(e.target.value));
    renderList();
  }

  _setToolMode(mode) {
    this.toolMode = mode;
    if (mode !== 'build') this._arm(null);
    
    document.getElementById('btn-tool-select').classList.toggle('active', mode === 'select');
    document.getElementById('btn-tool-demolish').classList.toggle('active', mode === 'demolish');
  }

  _bindInput() {
    this.mouse = new THREE.Vector2(0, 0);
    this.isDraggingCamera = false;
    this._criarIndicadorAndar();

    document.getElementById('btn-tool-select').onclick = () => this._setToolMode('select');
    document.getElementById('btn-tool-demolish').onclick = () => this._setToolMode('demolish');

    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      const item = PALETTE.find(p => p.key === e.key);
      if (item) this._arm(item.id);
      if (e.code === 'Escape') this._setToolMode('select');
      if (e.code === 'KeyR') this._rotateSelectedOrGhost();
      if (e.code === 'Delete' || e.code === 'Backspace') this._deleteSelected();
      if (e.code === 'Tab') { e.preventDefault(); this._toggleScenePanel(); }
      if (e.code === 'PageUp') { e.preventDefault(); this._mudarAndar(1); }
      if (e.code === 'PageDown') { e.preventDefault(); this._mudarAndar(-1); }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 2) this.isDraggingCamera = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 2) this.isDraggingCamera = false;
    });
    
    // Evita o menu de contexto nativo ao girar a câmera
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    this.canvas.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      if (this.isDraggingCamera) {
        this.yaw -= e.movementX * 0.0022;
        this.pitch -= e.movementY * 0.0022;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.3, 1.3);
      }
    });

    this.canvas.addEventListener('click', (e) => {
      if (e.button === 0) this._onConfirmClick();
    });
  }

  _updateGhostMaterial(mesh, isRed = false) {
    if (!mesh) return;
    mesh.traverse(o => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (!o.userData.origColors) {
          o.material = Array.isArray(o.material) ? mats.map(m => m.clone()) : mats[0].clone();
          const newMats = Array.isArray(o.material) ? o.material : [o.material];
          o.userData.origColors = newMats.map(m => m.color ? m.color.getHex() : 0xffffff);
        }
        const activeMats = Array.isArray(o.material) ? o.material : [o.material];
        activeMats.forEach((m, i) => {
          m.transparent = true;
          m.opacity = 0.65;
          if (m.color) {
            const orig = o.userData.origColors[i] ?? 0xffffff;
            m.color.setHex(isRed ? 0xff4444 : orig);
          }
        });
      }
    });
  }

  _arm(typeId) {
    this.armedType = typeId;
    this._armedProps = null;
    if (this.paletteEls) {
      Object.entries(this.paletteEls).forEach(([id, el]) => el.classList.toggle('active', id === typeId));
    }
    
    if (typeId && this.toolMode !== 'build') {
      this.toolMode = 'build';
      document.getElementById('btn-tool-select').classList.remove('active');
      document.getElementById('btn-tool-demolish').classList.remove('active');
      const crosshair = document.getElementById('crosshair');
      crosshair.style.background = '#fff';
      crosshair.style.boxShadow = '0 0 4px rgba(0,0,0,0.6)';
    }

    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    if (typeId) {
      const def = paletteById(typeId);
      this.ghost = def.build(def.defaultProps ? def.defaultProps() : undefined);
      this._updateGhostMaterial(this.ghost, false);
      this.scene.add(this.ghost);
      this.selected = null;
      this._updateSelectionHighlight();
      this._renderPropsPanel();
    }
    this._renderPropsPanel();
  }

  _snap(v) {
    return Math.round(v / CELL) * CELL;
  }

  _isOccupied3D(ghostMesh) {
    ghostMesh.updateMatrixWorld(true);
    const box1 = new THREE.Box3().setFromObject(ghostMesh);
    box1.expandByScalar(-0.05);

    for (const it of this.items) {
      if (it.mesh === ghostMesh) continue;
      // Peça de kit já colocada não impede nada: móvel em cima do piso,
      // quadro na parede. Andar escondido também não.
      if (paletteById(it.typeId)?.sobreposicaoLivre || !it.mesh.visible) continue;
      const box2 = new THREE.Box3().setFromObject(it.mesh);
      box2.expandByScalar(-0.05);
      if (box1.intersectsBox(box2)) {
        return true;
      }
    }
    return false;
  }

  // Andar de trabalho: Page Up / Page Down sobem e descem de ALTURA_ANDAR. O
  // plano onde o mouse aponta, o grid e a câmera vão junto — dá pra colocar
  // o piso do andar de cima em qualquer lugar, com ou sem parede embaixo.
  _mudarAndar(delta) {
    const novo = Math.max(0, Math.min(20, this.andar + delta));
    if (novo === this.andar) return;
    const subida = (novo - this.andar) * ALTURA_ANDAR;
    this.andar = novo;
    const altura = novo * ALTURA_ANDAR;
    this.groundPlane.constant = -altura;
    this.grid.position.y = altura + 0.01;
    this.camera.position.y = Math.max(1, this.camera.position.y + subida);
    this._atualizarIndicadorAndar();
    this._aplicarVisibilidadeDosAndares();
  }

  // Andar a que uma altura pertence (uma peça em 2,5 m, em cima do piso do
  // andar 1, é do andar 1).
  _andarDoY(y) {
    return Math.floor((y + 0.01) / ALTURA_ANDAR);
  }

  // Como no The Sims: o que está acima do andar de trabalho some, pra dar pra
  // ver e mexer embaixo. Escondido também não é clicável nem ocupa lugar.
  _aplicarVisibilidadeDosAndares() {
    for (const it of this.items) it.mesh.visible = this._andarDoY(it.position[1]) <= this.andar;
  }

  // Botões ▼ Andar N ▲ na barra de cima; Page Up / Page Down fazem o mesmo.
  _criarIndicadorAndar() {
    const barra = document.getElementById('top-toolbar');
    if (!barra || document.getElementById('andar-label')) return;
    const grupo = document.createElement('div');
    grupo.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:16px;';
    const botao = (id, texto, titulo, delta) => {
      const b = document.createElement('button');
      b.id = id;
      b.className = 'tool-btn';
      b.textContent = texto;
      b.title = titulo;
      b.style.padding = '8px 12px';
      b.onclick = () => this._mudarAndar(delta);
      return b;
    };
    const rotulo = document.createElement('span');
    rotulo.id = 'andar-label';
    rotulo.title = 'Andar em que as peças são colocadas. O que está acima dele fica escondido.';
    rotulo.style.cssText = 'padding:6px 10px;border-radius:6px;background:rgba(255,217,138,0.15);'
      + 'color:#ffd98a;font-size:0.85em;white-space:nowrap;';
    grupo.append(
      botao('btn-andar-descer', '▼', 'Descer um andar (Page Down)', -1),
      rotulo,
      botao('btn-andar-subir', '▲', 'Subir um andar (Page Up)', 1),
    );
    barra.appendChild(grupo);
    this._atualizarIndicadorAndar();
  }

  _atualizarIndicadorAndar() {
    const el = document.getElementById('andar-label');
    if (el) el.textContent = `Andar ${this.andar} · ${(this.andar * ALTURA_ANDAR).toFixed(1).replace('.', ',')} m`;
    const descer = document.getElementById('btn-andar-descer');
    if (descer) {
      descer.disabled = this.andar === 0;
      descer.style.opacity = this.andar === 0 ? '0.4' : '1';
    }
  }

  // Altura onde a peça armada vai: peça de kit sempre na altura do andar (pra
  // parede e piso ficarem alinhados); o resto empilha no que estiver embaixo
  // do mouse, mas nunca abaixo do andar de trabalho.
  _alturaDaColocacao(hit) {
    const doAndar = this.andar * ALTURA_ANDAR;
    if (hit.type !== 'item' || paletteById(this.armedType)?.sobreposicaoLivre) return doAndar;
    const topo = new THREE.Box3().setFromObject(hit.object).max.y;
    return Math.max(doAndar, topo);
  }

  // Trava de lugar ocupado na hora de colocar. Peça de kit encaixa sem trava;
  // segurando Shift, qualquer item também.
  _ocupadoParaColocar() {
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) return false;
    if (paletteById(this.armedType)?.sobreposicaoLivre) return false;
    return this._isOccupied3D(this.ghost);
  }

  _raycastGround() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.mouse || new THREE.Vector2(0, 0), this.camera);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(this.groundPlane, hit)) return hit;
    return null;
  }

  _raycastAll() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.mouse || new THREE.Vector2(0, 0), this.camera);
    
    const hitGround = new THREE.Vector3();
    let hitsGround = [];
    if (ray.ray.intersectPlane(this.groundPlane, hitGround)) {
      hitsGround.push({ point: hitGround.clone(), distance: ray.ray.origin.distanceTo(hitGround) });
    }
    
    // Só o que está à mostra: andar escondido não é clicável.
    const meshes = this.items.filter(it => it.mesh.visible).map(it => it.mesh);
    const hitsItems = ray.intersectObjects(meshes, true);
    
    const allHits = [];
    if (hitsGround.length) allHits.push({ type: 'ground', point: hitsGround[0].point, distance: hitsGround[0].distance });
    if (hitsItems.length) {
      let obj = hitsItems[0].object;
      while (obj && !this.items.find(it => it.mesh === obj)) obj = obj.parent;
      if (obj) allHits.push({ type: 'item', point: hitsItems[0].point, distance: hitsItems[0].distance, object: obj });
    }
    allHits.sort((a, b) => a.distance - b.distance);
    return allHits.length ? allHits[0] : null;
  }

  _raycastItems() {
    const hit = this._raycastAll();
    if (hit && hit.type === 'item') {
      return this.items.find(it => it.mesh === hit.object) || null;
    }
    return null;
  }

  _onConfirmClick() {
    if (this.armedType) {
      const hit = this._raycastAll();
      if (!hit) return;
      const sx = this._snap(hit.point.x);
      const sz = this._snap(hit.point.z);
      
      const sy = this._alturaDaColocacao(hit);
      
      if (this.ghost) {
        this.ghost.position.set(sx, sy, sz);
        if (this._ocupadoParaColocar()) return;
      }
      
      const placed = this._place(this.armedType, sx, sy, sz, this._armedProps);
      if (this.ghost) {
        placed.rotY = this.ghost.rotation.y;
        placed.mesh.rotation.y = placed.rotY;
      }
    } else if (this.toolMode === 'demolish') {
      const hitItem = this._raycastItems();
      if (hitItem) {
        this.selected = hitItem;
        this._deleteSelected();
      }
    } else {
      const hitItem = this._raycastItems();
      this.selected = hitItem;
      this._updateSelectionHighlight();
      this._renderPropsPanel();
    }
  }

  _place(typeId, x, y, z, props) {
    const def = paletteById(typeId);
    const itemProps = props ? { ...props } : (def.defaultProps ? def.defaultProps() : undefined);
    const mesh = def.build(itemProps);
    mesh.position.set(x, y, z);
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mesh.visible = this._andarDoY(y) <= this.andar;
    this.scene.add(mesh);
    const item = { uuid: crypto.randomUUID(), typeId, position: [x, y, z], rotY: 0, props: itemProps, mesh };
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
          this.ghost.traverse(o => { 
            if (o.isMesh) { 
              o.material = o.material.clone(); 
              o.material.transparent = true; 
              o.material.opacity = 0.65; 
              o.userData.origColor = o.material.color.getHex();
            } 
          });
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
    document.getElementById('btn-load-game-scene').onclick = () => this._loadGameScene();
    document.getElementById('btn-export-scene').onclick = () => this._exportScene();
    const btnDemo = document.getElementById('btn-demo-room');
    if (btnDemo) btnDemo.onclick = () => this._buildDemoRoom();
    this._renderSceneList();
  }

  _buildDemoRoom() {
    this._newScene();
    
    // Coordenadas: X (largura), Y (altura), Z (profundidade). Tudo em blocos CELL.
    const items = [
      // Cozinha
      { id: 'bancada', x: -1, y: 0, z: -2, rot: 0 },
      { id: 'bancada', x: 0, y: 0, z: -2, rot: 0 },
      { id: 'pia_banheiro', x: 0, y: 0, z: -2, rot: 0 }, // Fake sink
      { id: 'geladeira', x: -2.5, y: 0, z: -2, rot: 0 },
      { id: 'armario_aereo', x: -1, y: 1.2, z: -2, rot: 0 },
      { id: 'armario_aereo', x: 0, y: 1.2, z: -2, rot: 0 },
      
      // Jantar
      { id: 'mesa_jantar', x: 2.5, y: 0, z: -1.5, rot: 0 },
      { id: 'cadeira_leste', x: 1.5, y: 0, z: -1.5, rot: 0 },
      { id: 'cadeira_oeste', x: 3.5, y: 0, z: -1.5, rot: 0 },
      
      // Sala
      { id: 'tapete', x: -1, y: 0.01, z: 2, rot: 0 },
      { id: 'sofa', x: -1, y: 0, z: 2, rot: Math.PI },
      { id: 'mesinha_centro', x: -1, y: 0, z: 1, rot: 0 },
      { id: 'rack_tv', x: -1, y: 0, z: 0, rot: 0 },
      { id: 'monitor', x: -1, y: 0.5, z: 0, rot: Math.PI }, 
      { id: 'vaso', x: -2.5, y: 0, z: 0, rot: 0 },
      { id: 'abajur', x: -2.5, y: 0, z: 3, rot: 0 },
      
      // Pequenos detalhes
      { id: 'celular', x: -1, y: 0.45, z: 1, rot: Math.PI / 4 },
      { id: 'dinheiro', x: -0.8, y: 0.45, z: 1, rot: 0 },
      { id: 'porta_retratos', x: -1, y: 0.8, z: 0, rot: 0 },
      
      // Quarto (visão do lado)
      { id: 'cama', x: 4, y: 0, z: 2, rot: -Math.PI / 2 },
      { id: 'criado_mudo', x: 4, y: 0, z: 1, rot: -Math.PI / 2 },
      { id: 'guarda_roupa', x: 5, y: 0, z: 3, rot: -Math.PI },
      
      // Fusca na Garagem
      { id: 'fusca', x: -5, y: 0, z: -1, rot: Math.PI / 4 }
    ];
    
    for (const item of items) {
      if (paletteById(item.id)) {
        const placed = this._place(item.id, item.x, item.y, item.z, {});
        if (placed) {
          placed.rotY = item.rot;
          placed.mesh.rotation.y = item.rot;
        }
      }
    }
    
    document.getElementById('scene-name').value = 'Casa Completa';
    this.camera.position.set(0, 5, 8);
    this.pitch = -0.5;
    this.yaw = 0;
  }

  _toggleScenePanel() {
    const panel = document.getElementById('scene-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden') && document.pointerLockElement) document.exitPointerLock();
  }

  _serializeScene() {
    return {
      // Itens vindos de .glb levam a origem do modelo, que é o que o jogo usa
      // pra carregá-los (src/sceneModels.js).
      items: this.items.map(it => {
        const modelo = paletteById(it.typeId)?.modelo;
        return { typeId: it.typeId, position: it.position, rotY: it.rotY, props: it.props, ...(modelo ? { modelo } : {}) };
      }),
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
    this._loadSceneData(data);
    document.getElementById('scene-name').value = name;
    localStorage.setItem('editor-last-scene', name);
  }

  _loadSceneData(data) {
    this._newScene();
    for (const it of data.items) {
      const placed = this._place(it.typeId, it.position[0], it.position[1], it.position[2], it.props);
      placed.rotY = it.rotY || 0;
      placed.mesh.rotation.y = placed.rotY;
    }
  }

  // Carrega o layout que está de verdade no jogo agora (src/data/scene.js)
  // — ponto de partida pra editar em vez de começar de uma tela vazia.
  _loadGameScene() {
    if (!confirm('Isso substitui a cena que você está editando pela cena atual do jogo. Continuar?')) return;
    this._loadSceneData(GAME_SCENE);
    document.getElementById('scene-name').value = '';
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
    // Sem cena salva, parte da cena que está no jogo: começar vazio e exportar
    // sobrescreveria src/data/scene.js sem os marcos, NPCs e fragmentos.
    if (last && map[last]) this._loadScene(last);
    else this._loadSceneData(GAME_SCENE);
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
    this._avisarItensIgnorados(out);
    out.focus();
    out.select();
  }

  // O jogo só entende parte do catálogo (TIPOS_QUE_O_JOGO_LE) e põe tudo no
  // chão: avisa antes de a cena ir pra src/data/scene.js e os objetos
  // "sumirem" no jogo sem nenhum erro.
  _avisarItensIgnorados(out) {
    const ignorados = {};
    let foraDoChao = 0;
    for (const it of this.items) {
      const temModelo = !!paletteById(it.typeId)?.modelo;   // carregado com altura e giro
      if (!TIPOS_QUE_O_JOGO_LE.has(it.typeId) && !temModelo) ignorados[it.typeId] = (ignorados[it.typeId] || 0) + 1;
      else if (!temModelo && Math.abs(it.position[1]) > 1e-6) foraDoChao++;
    }
    let aviso = document.getElementById('export-aviso');
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.id = 'export-aviso';
      aviso.className = 'hint';
      aviso.style.color = '#ffb4a8';
      out.parentNode.insertBefore(aviso, out);
    }
    const partes = [];
    const lista = Object.entries(ignorados).map(([tipo, n]) => `${tipo} (${n})`).join(', ');
    if (lista) partes.push(`O jogo ainda ignora estes itens: ${lista}.`);
    if (foraDoChao) partes.push(`${foraDoChao} item(ns) do jogo estão acima do chão; lá eles vão pro chão.`);
    aviso.textContent = partes.join(' ');
    aviso.hidden = partes.length === 0;
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
      const hit = this._raycastAll();
      if (hit) {
        const sx = this._snap(hit.point.x);
        const sz = this._snap(hit.point.z);
        const sy = this._alturaDaColocacao(hit);
        
        this.ghost.position.set(sx, sy, sz);
        const occupied = this._ocupadoParaColocar();
        
        this._updateGhostMaterial(this.ghost, occupied);
      }
    }
    if (this._highlightBox) this._highlightBox.update();

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__editor = new EditorApp();
});
