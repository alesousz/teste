import * as THREE from 'three';
import { CONFIG, CITY, BUILDING_COLOR_PALETTE, LANDMARK_SPECS , HOME_ORIGIN } from './data.js';
import { Interior } from './interior.js';
import { buildBuilding, updateDoors } from './building.js';
import { buildApartmentProps, apartmentBoxes } from './apartmentProps.js';
import { carregarModelosMoveis } from './propModels.js';
import { loadGLTF } from './assets.js';
import { SCENE } from './data/scene.js';
import { modelosDaCena } from './sceneModels.js';
import { pegadaNaFaixa, colisorDoObjeto, empurrarParaFora, raioContraColisor } from './objectCollision.js';
import { pisoDoKit, escadaDoKit, apoioEm, tetoEm, raioContraPiso } from './kitSurfaces.js';
import { clone as clonarComEsqueleto } from '../vendor/jsm/utils/SkeletonUtils.js';
import { criarAsfalto, criarChaoDaRua } from './streetGround.js';
import { construirPredioDaCidade, criarTerrenoDosQuarteiroes, criarFonte, criarPostesDaRua } from './cityLook.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.buildingAABBs = CITY.buildings;
    // Prédio inicial: o único volume do mundo com interior de verdade. Ele
    // NÃO entra em `buildingAABBs` de propósito — uma caixa maciça no lugar
    // impediria o jogador de entrar. As paredes dele vêm do `Interior`.
    this.interior = new Interior(HOME_ORIGIN);
    this.windowTexturesLit = [];
    this.windowTexturesDark = [];
    this.streetLamps = [];
    // Colisores dos objetos do catálogo (ver objectCollision.js) e a pegada
    // medida de cada modelo, reaproveitada por todas as cópias dele.
    this.objetosSolidos = [];
    this._pegadas = new Map();
    // Peças de kit de construção com papel (ver sceneModels.PAPEIS): pisos e
    // escadas que sustentam o jogador, portas que abrem com E.
    this.superficiesKit = [];
    this.portasKit = [];
    this._buildGround();
    this._buildBlocks();
    this._buildProps();
    this._buildSceneModels();
    this._buildSky();
    this._buildLights();
    this._buildStreetLamps();
    this._buildHomeBuilding();
    this.timeOfDay = 0.3; // 0..1, 0 = meia-noite, 0.5 = meio-dia
    this.dayCount = 1;
  }

  _buildGround() {
    const size = CONFIG.GRID_SIZE * CONFIG.CELL + 40;
    this.scene.add(criarAsfalto(size));
    // Calçadas, meio-fio, faixas e a praça: traçado em data/streets.js.
    this.scene.add(criarChaoDaRua());
  }

  _buildBlocks() {
    // Terreno, fonte e postes vêm de cityLook.js: o editor de mapa mostra os mesmos.
    this.scene.add(criarTerrenoDosQuarteiroes(CITY.blocks, CONFIG.BLOCK_SIZE));

    for (const block of CITY.blocks) {
      for (const b of block.lots) {
        if (b.kind) this._addLandmark(b);
        else if (b.custom) this._addCustomBuilding(b);
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

  // Prédio da cidade com janelas, teto e toldo (ver cityLook.js). `color`
  // vem da cena na cidade fixa; no sorteio, do índice da paleta.
  _addBuilding(b) {
    const { grupo, corpo } = construirPredioDaCidade({
      w: b.w, d: b.d, h: b.h, color: b.color ?? BUILDING_COLOR_PALETTE[b.colorIdx], semente: b.winSeed,
    });
    grupo.position.set(b.cx, 0, b.cz);
    this.scene.add(grupo);
    this.windowTexturesLit.push(corpo);
  }

  // Prédio colocado no editor de mapa: com fachada de cidade, igual aos
  // gerados; liso, só a caixa na cor escolhida (o editor mostra igual).
  _addCustomBuilding(b) {
    if (b.estilo === 'cidade') {
      this._addBuilding(b);
      return;
    }
    const mat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.85 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.cx, b.h / 2, b.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  _addPlazaProps(block) {
    this.scene.add(criarFonte(block.cx, block.cz));
  }

  _addParkProps(block) {
    // Cidade fixa: as árvores e os bancos dos parques são peças da cena.
    if (CITY.fixa) return;
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
    const { grupo, postes } = criarPostesDaRua(CONFIG.GRID_SIZE, CONFIG.CELL);
    this.scene.add(grupo);
    this.streetLamps.push(...postes);
  }

  // Decoração colocada à mão no editor de mapa (árvore/banco/poste) — os
  // marcos, NPCs e fragmentos da cena já são consumidos em data.js; aqui só
  // sobra o que é puramente visual, sem afetar colisão nem jogabilidade.
  _buildProps() {
    for (const item of SCENE.items) {
      const [x, , z] = item.position;
      if (item.typeId === 'tree') this._addTree(x, z);
      else if (item.typeId === 'bench') this._addBench(x, z, item.rotY || 0);
      else if (item.typeId === 'lamp') this._addLamp(x, z);
    }
  }

  // Objetos do catálogo do editor (móveis, veículos, animais, pacotes): cada
  // item da cena diz de que arquivo e nó veio (ver sceneModels.js). Só
  // visual por enquanto: sem colisão e sem animação.
  _buildSceneModels() {
    const { porArquivo, invalidos } = modelosDaCena(SCENE.items);
    for (const item of invalidos) console.warn('[cena] item com modelo inválido, ignorado:', item.typeId, item.modelo);
    for (const [url, copias] of porArquivo) {
      loadGLTF(url).then(gltf => {
        for (const c of copias) {
          const origem = c.no ? gltf.scene.getObjectByName(c.no) : gltf.scene.children[0];
          if (!origem) {
            console.warn(`[cena] "${c.no}" não existe em ${url}; ${c.typeId} ignorado.`);
            continue;
          }
          // SkeletonUtils: um clone comum de modelo com esqueleto (animais)
          // divide os ossos com o original e deforma errado.
          const obj = clonarComEsqueleto(origem);
          obj.name = c.typeId;
          obj.userData.modeloDaCena = url;
          obj.position.set(c.position[0], c.position[1], c.position[2]);
          // Igual ao editor: troca só o giro vertical e preserva a inclinação
          // que o nó já traz do arquivo.
          obj.rotation.y = c.rotY;
          obj.scale.copy(origem.scale).multiplyScalar(c.escala);
          obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          this.scene.add(obj);
          // Escada não colide pelas laterais: quem manda nela é a rampa.
          const colisores = c.papel === 'escada' ? [] : this._colisoresDe(obj, url, c).map(s => ({ ...s, nome: c.typeId }));
          this.objetosSolidos.push(...colisores);
          const onde = { x: c.position[0], y: c.position[1], z: c.position[2], rotY: c.rotY };
          if (c.papel === 'piso' || c.papel === 'escada') {
            const caixa = this._caixaLocal(obj, url, c);
            if (caixa) this.superficiesKit.push(c.papel === 'piso' ? pisoDoKit(caixa, onde) : escadaDoKit(caixa, onde));
          } else if (c.papel === 'porta') {
            this._registrarPortaKit(obj, gltf, url, c, colisores);
          }
        }
        // Materiais novos nascem com o ambiente cheio; o loop redosa.
        this.homeMaterialsDirty = true;
      }, err => console.warn(`[cena] ${url} não carregou; ${copias.length} objeto(s) ficam de fora.`, err));
    }
  }

  // Colisores de uma cópia — um por parte sólida (parede com porta dá dois).
  // A pegada é medida uma vez por modelo, no referencial dele (sem giro e na
  // origem), e reaproveitada pelas cópias.
  _colisoresDe(obj, url, c) {
    const chave = `${url}|${c.no ?? ''}|${c.escala}|${c.colisao ?? ''}`;
    let pegada = this._pegadas.get(chave);
    if (pegada === undefined) {
      const posicao = obj.position.clone();
      const giro = obj.rotation.y;
      obj.position.set(0, 0, 0);
      obj.rotation.y = 0;
      obj.updateMatrixWorld(true);
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const d = new THREE.Vector3();
      pegada = pegadaNaFaixa(cb => obj.traverse(o => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        const indice = o.geometry.index;
        const n = indice ? indice.count : p.count;
        const vertice = i => (indice ? indice.getX(i) : i);
        for (let i = 0; i + 2 < n; i += 3) {
          a.fromBufferAttribute(p, vertice(i)).applyMatrix4(o.matrixWorld);
          b.fromBufferAttribute(p, vertice(i + 1)).applyMatrix4(o.matrixWorld);
          d.fromBufferAttribute(p, vertice(i + 2)).applyMatrix4(o.matrixWorld);
          cb(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
        }
      }), { colisao: c.colisao });
      obj.position.copy(posicao);
      obj.rotation.y = giro;
      obj.updateMatrixWorld(true);
      this._pegadas.set(chave, pegada);
    }
    if (!pegada) return [];
    const onde = { x: c.position[0], y: c.position[1], z: c.position[2], rotY: c.rotY };
    return pegada.partes.map(parte => colisorDoObjeto({ ...parte, altura: pegada.altura }, onde));
  }

  // Caixa do modelo no referencial dele (sem giro, base na origem), mais
  // `zTopo`: o menor z local que já está no alto — onde a escada termina de
  // subir e começa o patamar. Medida uma vez por modelo.
  _caixaLocal(obj, url, c) {
    const chave = `caixa|${url}|${c.no ?? ''}|${c.escala}`;
    if (this._pegadas.has(chave)) return this._pegadas.get(chave);
    const posicao = obj.position.clone();
    const giro = obj.rotation.y;
    obj.position.set(0, 0, 0);
    obj.rotation.y = 0;
    obj.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const pontos = [];
    obj.traverse(o => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        pontos.push(v.x, v.y, v.z);
      }
    });
    obj.position.copy(posicao);
    obj.rotation.y = giro;
    obj.updateMatrixWorld(true);

    let caixa = null;
    if (pontos.length) {
      caixa = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity, zTopo: Infinity };
      for (let i = 0; i < pontos.length; i += 3) {
        caixa.x0 = Math.min(caixa.x0, pontos[i]);
        caixa.x1 = Math.max(caixa.x1, pontos[i]);
        caixa.y0 = Math.min(caixa.y0, pontos[i + 1]);
        caixa.y1 = Math.max(caixa.y1, pontos[i + 1]);
        caixa.z0 = Math.min(caixa.z0, pontos[i + 2]);
        caixa.z1 = Math.max(caixa.z1, pontos[i + 2]);
      }
      for (let i = 0; i < pontos.length; i += 3) {
        if (pontos[i + 1] > caixa.y1 - 0.05) caixa.zTopo = Math.min(caixa.zTopo, pontos[i + 2]);
      }
    }
    this._pegadas.set(chave, caixa);
    return caixa;
  }

  // Porta de kit: abre e fecha com a tecla de interagir, tocando as animações
  // que vêm no modelo (`door|door|open` / `door|door|close` e as da maçaneta,
  // no Building Kit da Kenney). Aberta, a folha deixa de colidir.
  _registrarPortaKit(obj, gltf, url, c, colisores) {
    const mixer = new THREE.AnimationMixer(obj);
    // Os clipes vêm com sufixo de camada ("door|door|open|Animation Base
    // Layer"): vale o nome exato ou o nome seguido de "|".
    const acoes = nomes => nomes
      .map(nome => gltf.animations.find(a => a.name === nome || a.name.startsWith(`${nome}|`)))
      .filter(Boolean)
      .map(clipe => {
        const acao = mixer.clipAction(clipe);
        acao.setLoop(THREE.LoopOnce, 1);
        acao.clampWhenFinished = true;
        return acao;
      });
    const abrir = acoes(['door|door|open', 'handle|door|open']);
    const fechar = acoes(['door|door|close', 'handle|door|close']);
    if (!abrir.length) console.warn(`[cena] ${url} não tem animação de abrir; a porta só libera a passagem.`);

    // Ponto de interação no meio da folha.
    const caixa = this._caixaLocal(obj, url, c);
    const lx = caixa ? (caixa.x0 + caixa.x1) / 2 : 0;
    const lz = caixa ? (caixa.z0 + caixa.z1) / 2 : 0;
    const cos = Math.cos(c.rotY);
    const sin = Math.sin(c.rotY);
    const porta = {
      def: { id: `kit-porta-${this.portasKit.length}`, label: 'Porta', locked: false },
      aberta: false,
      mundo: { x: c.position[0] + lx * cos + lz * sin, y: c.position[1], z: c.position[2] - lx * sin + lz * cos },
      mixer,
      alternar: () => {
        porta.aberta = !porta.aberta;
        for (const a of porta.aberta ? fechar : abrir) a.stop();
        for (const a of porta.aberta ? abrir : fechar) a.reset().play();
        return true;
      },
    };
    for (const s of colisores) s.porta = porta;
    this.portasKit.push(porta);
  }

  _addLamp(x, z) {
    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), poleMat);
    pole.position.y = 2.5;
    group.add(pole);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c9, emissive: 0xfff2c9, emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), bulbMat);
    bulb.position.y = 5;
    group.add(bulb);
    const light = new THREE.PointLight(0xffdca0, 0, 10, 2);
    light.position.y = 4.9;
    light.castShadow = false;
    group.add(light);
    group.position.set(x, 0, z);
    this.scene.add(group);
    // Participa do mesmo ciclo dia/noite dos postes de rua procedurais.
    this.streetLamps.push({ bulb, light });
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
    // 2048 combinado com a câmera de sombra estreitada em render.js: o mapa
    // passa a valer ~5 cm por texel em vez de ~18 cm.
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = 140;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.moonAmbient = new THREE.AmbientLight(0x445577, 0.32);
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
    this.sun.intensity = 0.2 + dayFactor * 1.3;
    this.hemi.intensity = 0.35 + dayFactor * 0.55;

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
    // Guardados pra o pipeline de render montar o mapa de ambiente sem
    // recalcular o ciclo do dia por conta própria.
    this.skyColor = skyColor;
    this.groundColor = new THREE.Color(0x3a3a2f).lerp(new THREE.Color(0x6b6558), dayFactor);
    this.dayFactor = dayFactor;
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

  _buildHomeBuilding() {
    const { group, doors } = buildBuilding(this.interior.origin);
    this.homeBuilding = group;
    this.doors = doors;

    // Mobília: a geometria entra no mesmo grupo (e herda a translação); os
    // volumes de colisão vão pro Interior, que os translada por conta.
    const props = buildApartmentProps(THREE);
    group.add(props.group);
    this.interior.addSolids(props.solids);
    // Móveis com modelo do Blender chegam depois; até lá (ou se falharem)
    // ficam as caixas. Os materiais novos nascem com o ambiente cheio, então
    // o loop precisa redosar o interior quando eles entram.
    carregarModelosMoveis(props.group, apartmentBoxes(), loadGLTF)
      .then(n => { if (n > 0) this.homeMaterialsDirty = true; });
    this.homeAnchors = props.anchors.map(a => ({
      ...a,
      x: a.x + this.interior.origin.x,
      z: a.z + this.interior.origin.z,
    }));

    this._buildHomeLights(group);
    this.scene.add(group);
    // O interior recebe só uma fração do mapa de ambiente: ver
    // RenderPipeline.applyEnvIntensity. O valor fica guardado aqui pra o
    // pipeline aplicar assim que o ambiente existir.
    this.homeEnvIntensity = 0.2;
    this.cityEnvIntensity = 0.45;
  }

  // Luz interna. Sem isto o prédio é uma caixa fechada iluminada só pelo sol
  // lá fora, e o jogador anda no escuro — é requisito de jogabilidade, não de
  // acabamento. Sem sombra de propósito: cada luz pontual com sombra custa
  // seis mapas, e são sete lâmpadas.
  _buildHomeLights(group) {
    const N = 3.2;   // altura de um pavimento
    const pontos = [
      // térreo
      { x: 5.5,  y: 2.55,       z: 6.0,  cor: 0xffe6c0, i: 0.9, d: 11 },
      { x: 13.6, y: 2.55,       z: 1.9,  cor: 0xfff0d4, i: 0.7, d: 8 },
      // caixa de escada (vão duplo: uma luz alta cobre o lance inteiro)
      { x: 13.6, y: N + 2.4,    z: 6.0,  cor: 0xfff0d4, i: 1.0, d: 12 },
      // andar
      { x: 5.5,  y: N + 2.55,   z: 10.0, cor: 0xffe6c0, i: 0.8, d: 11 },
      { x: 1.7,  y: N + 2.5,    z: 1.9,  cor: 0xffdcb0, i: 0.85, d: 7 },  // quarto
      { x: 4.4,  y: N + 2.5,    z: 1.9,  cor: 0xdfefff, i: 0.7, d: 5 },   // banheiro
      { x: 2.8,  y: N + 2.5,    z: 5.9,  cor: 0xffe6c0, i: 0.95, d: 9 },  // sala
    ];
    this.homeLights = [];
    for (const p of pontos) {
      const luz = new THREE.PointLight(p.cor, p.i, p.d, 2);
      luz.position.set(p.x, p.y, p.z);
      luz.castShadow = false;
      group.add(luz);
      this.homeLights.push(luz);
    }
  }

  /** Move as folhas das portas. Chamado pelo loop do jogo. */
  updateBuilding(dt) {
    if (this.doors) updateDoors(this.doors, dt);
    for (const p of this.portasKit) p.mixer.update(dt);
  }

  /** Altura do chão sob o jogador — rua, laje ou degrau da escada. */
  supportAt(x, z, feetY) {
    // Pisos e escadas de kit somam-se ao prédio inicial; fora de tudo, a rua.
    return Math.max(this.interior.supportAt(x, z, feetY), apoioEm(this.superficiesKit, x, z, feetY));
  }

  /** Altura livre acima da cabeça (laje, cobertura ou piso de kit). */
  ceilingAt(x, z, feetY) {
    return Math.min(this.interior.ceilingAt(x, z, feetY), tetoEm(this.superficiesKit, x, z, feetY));
  }

  /**
   * Porta mais próxima do jogador que esteja no mesmo pavimento e ao alcance.
   * O filtro por pavimento evita o prompt da porta do saguão aparecer pra quem
   * está no corredor logo acima dela.
   */
  nearestDoor(pos, maxDist = 2.2) {
    let melhor = null;
    let menor = maxDist;
    for (const p of this.doors?.values() ?? []) {
      const alvoY = p.level * 3.2;
      if (Math.abs(pos.y - alvoY) > 1.6) continue;
      const d = Math.hypot(
        pos.x - (p.ponto.x + this.interior.origin.x),
        pos.z - (p.ponto.z + this.interior.origin.z),
      );
      if (d < menor) { menor = d; melhor = p; }
    }
    // Portas de kit: mesmo filtro de pavimento, pela altura da base da porta.
    for (const p of this.portasKit) {
      if (Math.abs(pos.y - p.mundo.y) > 1.6) continue;
      const d = Math.hypot(pos.x - p.mundo.x, pos.z - p.mundo.z);
      if (d < menor) { menor = d; melhor = p; }
    }
    return melhor;
  }

  /**
   * Objeto do apartamento mais próximo e ao alcance. O raio é menor que o de
   * NPC porque a mobília é densa: com 3,2 m dois móveis disputariam o prompt.
   */
  nearestAnchor(pos, maxDist = 1.5) {
    if (!this.homeAnchors) return null;
    let melhor = null;
    let menor = maxDist;
    for (const a of this.homeAnchors) {
      if (Math.abs(pos.y - (a.y > 3 ? 3.2 : 0)) > 1.6) continue;
      const d = Math.hypot(pos.x - a.x, pos.z - a.z);
      if (d < menor) { menor = d; melhor = a; }
    }
    return melhor;
  }

  /**
   * O jogador está num lugar fechado, onde a câmera tem de ficar curta? No
   * prédio inicial, embaixo de um piso de kit (até 4 m acima) ou em cima de
   * um piso de kit.
   */
  dentroDeConstrucao(pos) {
    if (this.interior.containsXZ(pos.x, pos.z)) return true;
    if (this.superficiesKit.length === 0) return false;
    if (tetoEm(this.superficiesKit, pos.x, pos.z, pos.y) - pos.y < 4) return true;
    return apoioEm(this.superficiesKit, pos.x, pos.z, pos.y, 0.05) > 0.05;
  }

  /** O jogador está dentro da pegada do prédio inicial? */
  insideHome(x, z) {
    return this.interior.containsXZ(x, z);
  }

  // Resolve colisão circular do jogador contra todas as AABBs de edifícios.
  // A cidade continua sendo 2D; o prédio inicial acrescenta o eixo vertical.
  resolveCollision(pos, radius, height = 1.7) {
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
    for (const s of this.objetosSolidos) {
      if (s.porta?.aberta) continue;   // folha de porta de kit aberta
      empurrarParaFora(pos, radius, height, s);
    }
    this.interior.resolve(pos, radius, height);
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
    // As paredes do interior também travam a câmera — sem isso ela atravessa
    // o prédio inteiro e mostra o lado de fora enquanto o jogador está dentro.
    closest = Math.min(closest, this.interior.raycast(origin, dir, closest));
    // Objetos do catálogo (paredes de kit, porta fechada, móveis) e as lajes
    // dos pisos de kit também seguram a câmera.
    for (const s of this.objetosSolidos) {
      if (s.porta?.aberta) continue;
      const t = raioContraColisor(origin, dir, s);
      if (t !== null && t < closest) closest = t;
    }
    for (const piso of this.superficiesKit) {
      if (piso.tipo !== 'piso') continue;
      const t = raioContraPiso(origin, dir, piso);
      if (t !== null && t < closest) closest = t;
    }
    // A fronteira do prédio também limita: a porta é um buraco legítimo na
    // parede, e sem isto a câmera de quem está na rua entra por ela.
    return Math.min(closest, this.interior.boundaryDistance(origin, dir, closest));
  }
}
