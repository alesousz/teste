import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/jsm/loaders/GLTFLoader.js';
import { PALETTE, paletteById, addDynamicProps, TIPOS_QUE_O_JOGO_LE } from './palette.js?v=10';
import { SCENE as GAME_SCENE } from '../data/scene.js';
import { Historico } from './historico.js';
import {
  PASSOS_DE_GRADE, PASSOS_DE_GIRO, ajustar, normalizarAngulo, girarPasso, centroide, deslocar,
} from './grade.js';
import {
  fotografar, comandoColocar, comandoRemover, comandoTransformar, comandoAlterarProps,
} from './comandos.js';

const GRID_SIZE = 60;
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

const plural = (n, um, varios) => (n === 1 ? um : `${n} ${varios}`);

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

    // Grid e giro ajustáveis na barra (ver grade.js).
    this.passoGrade = 1;
    this.passoGiro = 90;

    this._buildLights();
    this._buildGround();

    this.items = []; // {uuid, typeId, position:[x,y,z], rotY, props, mesh}
    this.selecionados = new Set();
    this.armedType = null;
    this.ghost = null;
    // Toda mudança na cena passa pelo histórico (ver comandos.js).
    this.historico = new Historico({ aoMudar: () => this._atualizarBotoesHistorico() });
    this._areaDeTransferencia = null;
    this._colando = null;
    this._arrasto = null;
    this._caixa = null;

    this.keys = new Set();
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

  /** A peça selecionada, quando há exatamente uma (painel de propriedades). */
  get selected() {
    return this.selecionados.size === 1 ? [...this.selecionados][0] : null;
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
    this.andar = 0;
    this._reconstruirGrid();
  }

  // Grid visual no passo atual e na altura do andar de trabalho.
  _reconstruirGrid() {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    const grid = new THREE.GridHelper(GRID_SIZE, Math.round(GRID_SIZE / this.passoGrade), 0x223322, 0x2f4f2f);
    grid.position.y = this.andar * ALTURA_ANDAR + 0.01;
    this.scene.add(grid);
    this.grid = grid;
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

  // --- Entrada ------------------------------------------------------------------

  _bindInput() {
    this.mouse = new THREE.Vector2(0, 0);
    this.isDraggingCamera = false;
    this._criarControlesDeEdicao();
    this._criarIndicadorAndar();

    document.getElementById('btn-tool-select').onclick = () => this._setToolMode('select');
    document.getElementById('btn-tool-demolish').onclick = () => this._setToolMode('demolish');

    window.addEventListener('keydown', e => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      this.keys.add(e.code);

      if (e.ctrlKey || e.metaKey) {
        const atalho = {
          KeyZ: () => (e.shiftKey ? this._refazer() : this._desfazer()),
          KeyY: () => this._refazer(),
          KeyC: () => this._copiar(),
          KeyV: () => this._iniciarColagem(),
          KeyD: () => this._duplicar(),
          KeyA: () => this._selecionarTudo(),
        }[e.code];
        if (atalho) {
          e.preventDefault();
          atalho();
        }
        return;
      }

      const item = PALETTE.find(p => p.key === e.key);
      if (item) this._arm(item.id);
      if (e.code === 'Escape') {
        this._cancelarColagem();
        this._setToolMode('select');
      }
      if (e.code === 'KeyR') this._girar(e.shiftKey ? -1 : 1);
      if (e.code === 'Delete' || e.code === 'Backspace') this._apagarSelecionados();
      if (e.code === 'Tab') { e.preventDefault(); this._toggleScenePanel(); }
      if (e.code === 'PageUp') { e.preventDefault(); this._mudarAndar(1); }
      if (e.code === 'PageDown') { e.preventDefault(); this._mudarAndar(-1); }
      const seta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
      if (seta && this.selecionados.size) {
        e.preventDefault();
        this._empurrar(seta);
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    this.canvas.addEventListener('mousedown', e => {
      this._atualizarMouse(e);
      if (e.button === 2) { this.isDraggingCamera = true; return; }
      if (e.button !== 0 || this.armedType || this._colando || this.toolMode !== 'select') return;
      const item = this._raycastItems();
      const aditivo = e.ctrlKey || e.metaKey;
      if (item) {
        if (aditivo) {
          if (this.selecionados.has(item)) this.selecionados.delete(item);
          else this.selecionados.add(item);
          this._aoMudarSelecao();
        } else {
          if (!this.selecionados.has(item)) this._selecionar([item]);
          this._iniciarArrasto(item);
        }
      } else {
        this._caixa = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, aditivo };
      }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 2) this.isDraggingCamera = false;
      if (e.button !== 0) return;
      if (this._arrasto) this._finalizarArrasto();
      if (this._caixa) this._finalizarCaixa();
    });

    // Evita o menu de contexto nativo ao girar a câmera
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    this.canvas.addEventListener('mousemove', e => {
      this._atualizarMouse(e);
      if (this.isDraggingCamera) {
        this.yaw -= e.movementX * 0.0022;
        this.pitch -= e.movementY * 0.0022;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.3, 1.3);
      }
    });
    // Arrastar peça e caixa de seleção seguem o mouse mesmo por cima dos painéis.
    window.addEventListener('mousemove', e => {
      if (!this._arrasto && !this._caixa) return;
      this._atualizarMouse(e);
      if (this._arrasto) this._atualizarArrasto();
      if (this._caixa) this._atualizarCaixa(e);
    });

    this.canvas.addEventListener('click', e => {
      if (e.button !== 0) return;
      if (this.armedType || this._colando || this.toolMode === 'demolish') this._onConfirmClick();
    });
  }

  _atualizarMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // --- Barra: desfazer, refazer, grid, giro e andar --------------------------------

  _criarBotao(id, texto, titulo, acao) {
    const b = document.createElement('button');
    b.id = id;
    b.className = 'tool-btn';
    b.textContent = texto;
    b.title = titulo;
    b.style.padding = '8px 12px';
    b.onclick = acao;
    return b;
  }

  _criarControlesDeEdicao() {
    const barra = document.getElementById('top-toolbar');
    if (!barra || document.getElementById('btn-desfazer')) return;
    const grupo = document.createElement('div');
    grupo.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:16px;';
    const seletor = (id, titulo, opcoes, valor, aoMudar) => {
      const s = document.createElement('select');
      s.id = id;
      s.title = titulo;
      s.style.cssText = 'background:rgba(255,255,255,0.05);color:#cfd3da;border:1px solid rgba(255,255,255,0.15);'
        + 'border-radius:6px;padding:6px;font-size:0.85em;cursor:pointer;';
      for (const [v, rotulo] of opcoes) {
        const o = document.createElement('option');
        o.value = String(v);
        o.textContent = rotulo;
        o.style.color = '#1a1206';
        if (v === valor) o.selected = true;
        s.appendChild(o);
      }
      s.onchange = () => { aoMudar(Number(s.value)); s.blur(); };
      return s;
    };
    grupo.append(
      this._criarBotao('btn-desfazer', '↶', 'Desfazer (Ctrl+Z)', () => this._desfazer()),
      this._criarBotao('btn-refazer', '↷', 'Refazer (Ctrl+Y)', () => this._refazer()),
      seletor('sel-grade', 'Passo do grid: onde as peças encaixam', PASSOS_DE_GRADE.map(p => [p, `Grid ${String(p).replace('.', ',')} m`]),
        this.passoGrade, v => { this.passoGrade = v; this._reconstruirGrid(); }),
      seletor('sel-giro', 'Passo do giro (R gira, Shift+R volta)', PASSOS_DE_GIRO.map(g => [g, `Giro ${g}°`]),
        this.passoGiro, v => { this.passoGiro = v; }),
    );
    barra.appendChild(grupo);
    this._atualizarBotoesHistorico();
  }

  _atualizarBotoesHistorico() {
    const h = this.historico;
    if (!h) return;
    const botoes = [
      ['btn-desfazer', h.podeDesfazer, h.proximoDesfazer, 'Desfazer', 'Ctrl+Z'],
      ['btn-refazer', h.podeRefazer, h.proximoRefazer, 'Refazer', 'Ctrl+Y'],
    ];
    for (const [id, pode, proximo, nome, tecla] of botoes) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.disabled = !pode;
      b.style.opacity = pode ? '1' : '0.4';
      b.title = pode ? `${nome}: ${proximo} (${tecla})` : `${nome} (${tecla})`;
    }
  }

  _desfazer() {
    this._cancelarColagem();
    this.historico.desfazer();
  }

  _refazer() {
    this._cancelarColagem();
    this.historico.refazer();
  }

  // --- Operações que os comandos usam (ver comandos.js) ----------------------------

  itemPorUuid(uuid) {
    return this.items.find(it => it.uuid === uuid) ?? null;
  }

  criarItem(foto) {
    const def = paletteById(foto.typeId);
    if (!def) {
      console.warn(`"${foto.typeId}" não está no catálogo; peça ignorada.`);
      return null;
    }
    const mesh = def.build(foto.props);
    mesh.position.fromArray(foto.position);
    mesh.rotation.y = foto.rotY ?? 0;
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mesh.visible = this._andarDoY(foto.position[1]) <= this.andar;
    this.scene.add(mesh);
    const item = {
      uuid: foto.uuid, typeId: foto.typeId, position: [...foto.position], rotY: foto.rotY ?? 0, props: foto.props, mesh,
    };
    this.items.push(item);
    return item;
  }

  removerItem(uuid) {
    const item = this.itemPorUuid(uuid);
    if (!item) return;
    this.scene.remove(item.mesh);
    this.items = this.items.filter(it => it !== item);
    if (this.selecionados.delete(item)) this._aoMudarSelecao();
  }

  transformarItem(uuid, { position, rotY }) {
    const item = this.itemPorUuid(uuid);
    if (!item) return;
    item.position = [...position];
    item.rotY = rotY;
    item.mesh.position.fromArray(position);
    item.mesh.rotation.y = rotY;
    item.mesh.visible = this._andarDoY(position[1]) <= this.andar;
  }

  alterarProps(uuid, props) {
    const item = this.itemPorUuid(uuid);
    if (!item) return;
    item.props = props;
    this._rebuildItemMesh(item);
  }

  // --- Andar de trabalho -------------------------------------------------------------

  // Page Up / Page Down (ou os botões ▼ ▲) sobem e descem de ALTURA_ANDAR. O
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
    const escondidos = [...this.selecionados].filter(it => !it.mesh.visible);
    if (escondidos.length) {
      for (const it of escondidos) this.selecionados.delete(it);
      this._aoMudarSelecao();
    }
  }

  // Botões ▼ Andar N ▲ na barra de cima; Page Up / Page Down fazem o mesmo.
  _criarIndicadorAndar() {
    const barra = document.getElementById('top-toolbar');
    if (!barra || document.getElementById('andar-label')) return;
    const grupo = document.createElement('div');
    grupo.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:16px;';
    const rotulo = document.createElement('span');
    rotulo.id = 'andar-label';
    rotulo.title = 'Andar em que as peças são colocadas. O que está acima dele fica escondido.';
    rotulo.style.cssText = 'padding:6px 10px;border-radius:6px;background:rgba(255,217,138,0.15);'
      + 'color:#ffd98a;font-size:0.85em;white-space:nowrap;';
    grupo.append(
      this._criarBotao('btn-andar-descer', '▼', 'Descer um andar (Page Down)', () => this._mudarAndar(-1)),
      rotulo,
      this._criarBotao('btn-andar-subir', '▲', 'Subir um andar (Page Up)', () => this._mudarAndar(1)),
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

  // --- Colocar ---------------------------------------------------------------------------

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
      this._cancelarColagem();
      const def = paletteById(typeId);
      this.ghost = def.build(def.defaultProps ? def.defaultProps() : undefined);
      this._updateGhostMaterial(this.ghost, false);
      this.scene.add(this.ghost);
      this._selecionar([]);
    }
    this._renderPropsPanel();
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

  _raycastAll() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.mouse || new THREE.Vector2(0, 0), this.camera);

    const hitGround = new THREE.Vector3();
    const hitsGround = [];
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

  // Ponto onde o mouse aponta num plano horizontal na altura dada.
  _pontoNoPlano(altura) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.mouse, this.camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -altura), p) ? p : null;
  }

  _onConfirmClick() {
    if (this._colando) {
      this._confirmarColagem();
      return;
    }
    if (this.armedType) {
      const hit = this._raycastAll();
      if (!hit) return;
      const sx = ajustar(hit.point.x, this.passoGrade);
      const sz = ajustar(hit.point.z, this.passoGrade);
      const sy = this._alturaDaColocacao(hit);

      if (this.ghost) {
        this.ghost.position.set(sx, sy, sz);
        if (this._ocupadoParaColocar()) return;
      }

      const def = paletteById(this.armedType);
      const props = this._armedProps ? { ...this._armedProps } : (def.defaultProps ? def.defaultProps() : undefined);
      this.historico.executar(comandoColocar(this, [{
        uuid: crypto.randomUUID(), typeId: this.armedType, position: [sx, sy, sz],
        rotY: this.ghost ? normalizarAngulo(this.ghost.rotation.y) : 0, props,
      }], `Colocar ${def.name}`));
    } else if (this.toolMode === 'demolish') {
      const item = this._raycastItems();
      if (item) this.historico.executar(comandoRemover(this, [fotografar(item)], `Demolir ${paletteById(item.typeId)?.name ?? 'peça'}`));
    }
  }

  // Usado ao carregar cena e na casa de demonstração: entra direto, sem
  // histórico (carregar outra cena não se desfaz).
  _place(typeId, x, y, z, props, rotY = 0) {
    const def = paletteById(typeId);
    if (!def) {
      console.warn(`"${typeId}" não está no catálogo; peça ignorada.`);
      return null;
    }
    const itemProps = props ? { ...props } : (def.defaultProps ? def.defaultProps() : undefined);
    return this.criarItem({ uuid: crypto.randomUUID(), typeId, position: [x, y, z], rotY, props: itemProps });
  }

  _rebuildItemMesh(item) {
    const def = paletteById(item.typeId);
    const oldMesh = item.mesh;
    const newMesh = def.build(item.props);
    newMesh.position.fromArray(item.position);
    newMesh.rotation.y = item.rotY;
    newMesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    newMesh.visible = oldMesh.visible;
    this.scene.remove(oldMesh);
    this.scene.add(newMesh);
    item.mesh = newMesh;
    this._updateSelectionHighlight();
  }

  // --- Seleção -----------------------------------------------------------------------------

  _selecionar(itens) {
    this.selecionados = new Set(itens.filter(Boolean));
    this._aoMudarSelecao();
  }

  _selecionarTudo() {
    this._selecionar(this.items.filter(it => it.mesh.visible));
  }

  _aoMudarSelecao() {
    this._updateSelectionHighlight();
    this._renderPropsPanel();
  }

  _updateSelectionHighlight() {
    for (const b of this._destaques ?? []) this.scene.remove(b);
    this._destaques = [...this.selecionados].map(it => {
      const b = new THREE.BoxHelper(it.mesh, 0xffd98a);
      this.scene.add(b);
      return b;
    });
  }

  // Caixa de seleção: arrastar num espaço vazio no modo Selecionar.
  _atualizarCaixa(e) {
    Object.assign(this._caixa, { x1: e.clientX, y1: e.clientY });
    if (!this._divCaixa) {
      const d = document.createElement('div');
      d.id = 'caixa-selecao';
      d.style.cssText = 'position:fixed;border:1px dashed #ffd98a;background:rgba(255,217,138,0.12);pointer-events:none;z-index:20;';
      document.body.appendChild(d);
      this._divCaixa = d;
    }
    const { x0, y0, x1, y1 } = this._caixa;
    Object.assign(this._divCaixa.style, {
      display: 'block',
      left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`,
      width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px`,
    });
  }

  _finalizarCaixa() {
    const { x0, y0, x1, y1, aditivo } = this._caixa;
    this._caixa = null;
    if (this._divCaixa) this._divCaixa.style.display = 'none';
    // Clique sem arrastar num espaço vazio: limpa a seleção.
    if (Math.abs(x1 - x0) < 4 && Math.abs(y1 - y0) < 4) {
      if (!aditivo) this._selecionar([]);
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ya, yb] = [Math.min(y0, y1), Math.max(y0, y1)];
    const v = new THREE.Vector3();
    const dentro = this.items.filter(it => {
      if (!it.mesh.visible) return false;
      v.fromArray(it.position).project(this.camera);
      if (v.z > 1) return false;   // atrás da câmera
      const sx = rect.left + ((v.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - v.y) / 2) * rect.height;
      return sx >= xa && sx <= xb && sy >= ya && sy <= yb;
    });
    this._selecionar(aditivo ? [...this.selecionados, ...dentro] : dentro);
  }

  // --- Mover, girar, apagar -----------------------------------------------------------

  // Arrastar a seleção com o botão esquerdo: anda no passo do grid, num plano
  // na altura da peça agarrada, e vira UM passo do histórico ao soltar.
  _iniciarArrasto(item) {
    const inicio = this._pontoNoPlano(item.position[1]);
    if (!inicio) return;
    this._arrasto = { altura: item.position[1], inicio, antes: [...this.selecionados].map(fotografar), delta: [0, 0, 0] };
  }

  _atualizarArrasto() {
    const a = this._arrasto;
    const p = this._pontoNoPlano(a.altura);
    if (!p) return;
    const delta = [ajustar(p.x - a.inicio.x, this.passoGrade), 0, ajustar(p.z - a.inicio.z, this.passoGrade)];
    if (delta[0] === a.delta[0] && delta[2] === a.delta[2]) return;
    a.delta = delta;
    for (const f of a.antes) this.transformarItem(f.uuid, { position: deslocar(f.position, delta), rotY: f.rotY });
  }

  _finalizarArrasto() {
    const a = this._arrasto;
    this._arrasto = null;
    if (a.delta[0] === 0 && a.delta[2] === 0) return;
    this.historico.registrar(comandoTransformar(this, a.antes.map(f => ({
      uuid: f.uuid,
      antes: { position: f.position, rotY: f.rotY },
      depois: { position: deslocar(f.position, a.delta), rotY: f.rotY },
    }))));
  }

  // Setas empurram a seleção um passo do grid.
  _empurrar([dx, dz]) {
    const passo = this.passoGrade;
    this.historico.executar(comandoTransformar(this, [...this.selecionados].map(it => ({
      uuid: it.uuid,
      antes: { position: [...it.position], rotY: it.rotY },
      depois: { position: deslocar(it.position, [dx * passo, 0, dz * passo]), rotY: it.rotY },
    }))));
  }

  // R gira um passo (Shift+R volta). Uma peça gira no lugar; um grupo gira em
  // volta do próprio centro, levando as posições junto — uma casa inteira
  // gira como uma peça só.
  _girar(sentido) {
    if (this.armedType && this.ghost) {
      this.ghost.rotation.y = girarPasso(this.ghost.rotation.y, this.passoGiro, sentido);
      return;
    }
    const itens = [...this.selecionados];
    if (!itens.length) return;
    if (itens.length === 1) {
      const it = itens[0];
      this.historico.executar(comandoTransformar(this, [{
        uuid: it.uuid,
        antes: { position: [...it.position], rotY: it.rotY },
        depois: { position: [...it.position], rotY: girarPasso(it.rotY, this.passoGiro, sentido) },
      }], 'Girar peça'));
      return;
    }
    const delta = (sentido * this.passoGiro * Math.PI) / 180;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const [cx, , cz] = centroide(itens.map(it => it.position));
    this.historico.executar(comandoTransformar(this, itens.map(it => {
      const lx = it.position[0] - cx;
      const lz = it.position[2] - cz;
      return {
        uuid: it.uuid,
        antes: { position: [...it.position], rotY: it.rotY },
        depois: {
          position: deslocar([cx + lx * cos + lz * sin, it.position[1], cz - lx * sin + lz * cos], [0, 0, 0]),
          rotY: normalizarAngulo(it.rotY + delta),
        },
      };
    }), `Girar ${itens.length} peças`));
  }

  _apagarSelecionados() {
    if (!this.selecionados.size) return;
    this.historico.executar(comandoRemover(this, [...this.selecionados].map(fotografar)));
  }

  // --- Copiar, colar, duplicar -------------------------------------------------------

  _copiar() {
    if (!this.selecionados.size) return;
    this._areaDeTransferencia = [...this.selecionados].map(fotografar);
  }

  // Ctrl+V: a cópia segue o mouse no andar de trabalho e entra no clique. O
  // andar relativo é mantido: um grupo do térreo colado no andar 1 sobe inteiro.
  _iniciarColagem() {
    const fotos = this._areaDeTransferencia?.filter(f => paletteById(f.typeId));
    if (!fotos?.length) return;
    this._arm(null);
    this._cancelarColagem();
    const ref = fotos[0].position;
    const andarRef = this._andarDoY(Math.min(...fotos.map(f => f.position[1])));
    const grupo = new THREE.Group();
    for (const f of fotos) {
      const m = paletteById(f.typeId).build(f.props);
      m.position.set(f.position[0] - ref[0], f.position[1] - andarRef * ALTURA_ANDAR, f.position[2] - ref[2]);
      m.rotation.y = f.rotY;
      this._updateGhostMaterial(m, false);
      grupo.add(m);
    }
    this.scene.add(grupo);
    this._colando = { grupo, fotos, ref, andarRef };
    this._atualizarColagem();
  }

  _atualizarColagem() {
    const c = this._colando;
    const altura = this.andar * ALTURA_ANDAR;
    const p = this._pontoNoPlano(altura);
    if (!p) return;
    c.grupo.position.set(ajustar(p.x, this.passoGrade), altura, ajustar(p.z, this.passoGrade));
  }

  _confirmarColagem() {
    const c = this._colando;
    const deslocamento = [
      c.grupo.position.x - c.ref[0],
      (this.andar - c.andarRef) * ALTURA_ANDAR,
      c.grupo.position.z - c.ref[2],
    ];
    const novas = c.fotos.map(f => ({ ...f, uuid: crypto.randomUUID(), position: deslocar(f.position, deslocamento) }));
    this.historico.executar(comandoColocar(this, novas, `Colar ${plural(novas.length, 'peça', 'peças')}`));
    this._cancelarColagem();
    this._selecionar(novas.map(f => this.itemPorUuid(f.uuid)));
  }

  _cancelarColagem() {
    if (!this._colando) return;
    this.scene.remove(this._colando.grupo);
    this._colando = null;
  }

  // Ctrl+D: cópia da seleção logo ao lado (deslocada da largura dela, no grid).
  _duplicar() {
    const itens = [...this.selecionados];
    if (!itens.length) return;
    const caixa = new THREE.Box3();
    for (const it of itens) caixa.expandByObject(it.mesh);
    const largura = caixa.isEmpty() ? 0 : caixa.max.x - caixa.min.x;
    const passo = Math.max(this.passoGrade, ajustar(largura, this.passoGrade));
    const novas = itens.map(it => ({ ...fotografar(it), uuid: crypto.randomUUID(), position: deslocar(it.position, [passo, 0, 0]) }));
    this.historico.executar(comandoColocar(this, novas, `Duplicar ${plural(novas.length, 'peça', 'peças')}`));
    this._selecionar(novas.map(f => this.itemPorUuid(f.uuid)));
  }

  // --- Painel de propriedades ----------------------------------------------------------

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
      // Na peça selecionada: muda ao vivo enquanto digita e vira um passo do
      // histórico quando o campo é confirmado.
      let antes = null;
      input.addEventListener('focus', () => {
        if (this.selected) antes = fotografar(this.selected).props;
      });
      input.addEventListener('input', () => {
        const key = input.dataset.key;
        const val = input.type === 'number' ? Number(input.value) : input.value;
        if (this.selected) {
          if (antes === null) antes = fotografar(this.selected).props;
          this.alterarProps(this.selected.uuid, { ...this.selected.props, [key]: val });
        } else if (this.armedType) {
          if (!this._armedProps) this._armedProps = paletteById(this.armedType).defaultProps?.() ?? {};
          this._armedProps[key] = val;
          if (this.ghost) this.scene.remove(this.ghost);
          this.ghost = paletteById(this.armedType).build(this._armedProps);
          this._updateGhostMaterial(this.ghost, false);
          this.scene.add(this.ghost);
        }
      });
      input.addEventListener('change', () => {
        const alvo = this.selected;
        if (!alvo || antes === null) return;
        const depois = fotografar(alvo).props;
        if (JSON.stringify(antes) !== JSON.stringify(depois)) {
          this.historico.registrar(comandoAlterarProps(this, alvo.uuid, antes, depois, `Alterar ${def.name}`));
        }
        antes = depois;
      });
    });
  }

  // --- Cenas -------------------------------------------------------------------------------

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

    // Coordenadas: X (largura), Y (altura), Z (profundidade), em metros.
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
      { id: 'fusca', x: -5, y: 0, z: -1, rot: Math.PI / 4 },
    ];

    for (const item of items) {
      if (paletteById(item.id)) this._place(item.id, item.x, item.y, item.z, {}, item.rot);
    }

    document.getElementById('scene-name').value = 'Casa Completa';
    this.camera.position.set(0, 5, 8);
    this.pitch = -0.5;
    this.yaw = 0;
  }

  _toggleScenePanel() {
    const panel = document.getElementById('scene-panel');
    panel.classList.toggle('hidden');
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
    this._cancelarColagem();
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
    this._selecionar([]);
    // Trocar de cena não se desfaz: o histórico começa de novo.
    this.historico.limpar();
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
      this._place(it.typeId, it.position[0], it.position[1], it.position[2], it.props, it.rotY || 0);
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

  // --- Câmera e laço --------------------------------------------------------------------

  _updateCamera(dt) {
    const forward = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));
    // Ctrl segurado é atalho (Ctrl+D, Ctrl+A...), não movimento.
    const ctrl = this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('MetaLeft');
    const move = new THREE.Vector3();
    if (!ctrl) {
      const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 18 : 8) * dt;
      if (this.keys.has('KeyW')) move.addScaledVector(forward, 1);
      if (this.keys.has('KeyS')) move.addScaledVector(forward, -1);
      if (this.keys.has('KeyA')) move.addScaledVector(right, -1);
      if (this.keys.has('KeyD')) move.addScaledVector(right, 1);
      if (this.keys.has('KeyE')) move.y += 1;
      if (this.keys.has('KeyQ')) move.y -= 1;
      if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    }
    this.camera.position.add(move);
    this.camera.position.y = Math.max(1, this.camera.position.y);

    const lookDir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.camera.lookAt(this.camera.position.clone().add(lookDir));
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this._updateCamera(dt);

    if (this._colando) {
      this._atualizarColagem();
    } else if (this.ghost && this.armedType) {
      const hit = this._raycastAll();
      if (hit) {
        const sx = ajustar(hit.point.x, this.passoGrade);
        const sz = ajustar(hit.point.z, this.passoGrade);
        const sy = this._alturaDaColocacao(hit);
        this.ghost.position.set(sx, sy, sz);
        this._updateGhostMaterial(this.ghost, this._ocupadoParaColocar());
      }
    }
    for (const b of this._destaques ?? []) b.update();

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__editor = new EditorApp();
});
