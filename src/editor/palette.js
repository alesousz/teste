import * as THREE from 'three';
import { NPC_DEFS } from '../data.js';
import * as SkeletonUtils from '../../vendor/jsm/utils/SkeletonUtils.js';

// Paleta de itens do editor — agora usando as peças reais do jogo (marcos,
// NPCs de verdade) em vez de placeholders genéricos, pra o que você desenha
// aqui poder alimentar o jogo de verdade depois.

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
}

function labelSprite(text) {
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  sprite.scale.set(6, 1.5, 1);
  return sprite;
}

function buildLandmark(w, d, h, color, roofColor, label) {
  const g = new THREE.Group();
  const body = box(w, h, d, color);
  body.position.y = h / 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) / 1.7, h * 0.5, 4), new THREE.MeshStandardMaterial({ color: roofColor }));
  roof.position.y = h + h * 0.25;
  roof.rotation.y = Math.PI / 4;
  const sprite = labelSprite(label);
  sprite.position.y = h + h * 0.6 + 1.2;
  g.add(body, roof, sprite);
  return g;
}

// Tipos embutidos que o jogo sabe carregar de src/data/scene.js: marcos,
// prédio, NPC e fragmento em data.js; árvore, banco e poste em
// World._buildProps (esses vão pro chão, a altura é ignorada). Itens vindos
// de .glb não estão aqui: eles levam `modelo` na cena e o jogo os carrega
// por World._buildSceneModels, com altura e giro.
export const TIPOS_QUE_O_JOGO_LE = new Set([
  'landmark_home_operario', 'landmark_home_nobre', 'landmark_job_mercado', 'landmark_school',
  'building', 'npc', 'fragment', 'tree', 'bench', 'lamp',
]);

const NPC_COLOR_BY_ID = Object.fromEntries(NPC_DEFS.map(n => [n.id, n.color]));
const NPC_NAME_BY_ID = Object.fromEntries(NPC_DEFS.map(n => [n.id, n.name]));

export const PALETTE = [
  {
    id: 'landmark_home_operario',
    key: '1', category: 'Estruturas',
    name: 'Casa (Op.)',
    footprint: { w: 10, d: 9 },
    build: () => buildLandmark(10, 9, 4.5, 0xc9a876, 0x7a4a34, 'CASA'),
  },
  {
    id: 'landmark_home_nobre',
    key: '2', category: 'Estruturas',
    name: 'Casa (Nobre)',
    footprint: { w: 16, d: 13 },
    build: () => buildLandmark(16, 13, 6.5, 0xf3ead9, 0x5a4636, 'CASA'),
  },
  {
    id: 'landmark_job_mercado',
    key: '3', category: 'Estruturas',
    name: 'Mercado',
    footprint: { w: 18, d: 12 },
    build: () => buildLandmark(18, 12, 5, 0xd97b4a, 0xb03a3a, 'MERCADO'),
  },
  {
    id: 'landmark_school',
    key: '4', category: 'Estruturas',
    name: 'Escola',
    footprint: { w: 26, d: 18 },
    build: () => buildLandmark(26, 18, 9, 0xdfe6ee, 0x3a5a7a, 'ESCOLA'),
  },
  {
    id: 'npc',
    key: '5', category: 'Personagens',
    name: 'NPC',
    footprint: { w: 1, d: 1 },
    defaultProps: () => ({ npcId: NPC_DEFS[0].id }),
    propFields: [
      { key: 'npcId', label: 'Personagem', type: 'select', options: NPC_DEFS.map(n => ({ value: n.id, label: n.name })) },
    ],
    build: (props) => {
      const npcId = props?.npcId ?? NPC_DEFS[0].id;
      const g = new THREE.Group();
      const color = NPC_COLOR_BY_ID[npcId] ?? 0x3f6fb0;
      const body = box(0.5, 1.6, 0.3, color);
      body.position.y = 0.8;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshStandardMaterial({ color: 0xe0b295 }));
      head.position.y = 1.75;
      const sprite = labelSprite(NPC_NAME_BY_ID[npcId] ?? npcId);
      sprite.position.y = 2.6;
      sprite.scale.set(3, 0.75, 1);
      g.add(body, head, sprite);
      return g;
    },
  },
  {
    id: 'building',
    key: '6', category: 'Estruturas',
    name: 'Prédio',
    footprint: { w: 6, d: 6 },
    defaultProps: () => ({ w: 6, d: 6, h: 8, color: '#b9c4cc' }),
    propFields: [
      { key: 'w', label: 'Largura', type: 'number', min: 2, max: 30, step: 1 },
      { key: 'd', label: 'Profundidade', type: 'number', min: 2, max: 30, step: 1 },
      { key: 'h', label: 'Altura', type: 'number', min: 2, max: 40, step: 1 },
      { key: 'color', label: 'Cor', type: 'color' },
    ],
    build: (props) => {
      const p = { w: 6, d: 6, h: 8, color: '#b9c4cc', ...props };
      const m = box(p.w, p.h, p.d, p.color);
      m.position.y = p.h / 2;
      return m;
    },
  },
  {
    id: 'tree',
    key: '7', category: 'Natureza',
    name: 'Árvore',
    footprint: { w: 2, d: 2 },
    build: () => {
      const g = new THREE.Group();
      const trunk = box(0.4, 2.0, 0.4, 0x5b3d26);
      trunk.position.y = 1.0;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x3d6b3f }));
      leaves.position.y = 3.0;
      g.add(trunk, leaves);
      return g;
    },
  },
  {
    id: 'bench',
    key: '8', category: 'Decoração',
    name: 'Banco',
    footprint: { w: 2, d: 1 },
    build: () => {
      const g = new THREE.Group();
      const seat = box(1.8, 0.1, 0.6, 0x6b4f3a);
      seat.position.y = 0.5;
      const back = box(1.8, 0.6, 0.08, 0x6b4f3a);
      back.position.set(0, 0.8, -0.26);
      g.add(seat, back);
      return g;
    },
  },
  {
    id: 'lamp',
    key: '9', category: 'Decoração',
    name: 'Poste de Luz',
    footprint: { w: 1, d: 1 },
    build: () => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), new THREE.MeshStandardMaterial({ color: 0x2c2f33 }));
      pole.position.y = 2.5;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), new THREE.MeshStandardMaterial({ color: 0xfff2c9, emissive: 0xfff2c9, emissiveIntensity: 0.5 }));
      bulb.position.y = 5;
      g.add(pole, bulb);
      return g;
    },
  },
  {
    id: 'fragment',
    key: '0', category: 'Itens',
    name: 'Fragmento',
    footprint: { w: 1, d: 1 },
    defaultProps: () => ({ note: '' }),
    propFields: [
      { key: 'note', label: 'Nota (texto do diário)', type: 'text' },
    ],
    build: () => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe58a, emissiveIntensity: 0.9 }));
      m.position.y = 1.4;
      return m;
    },
  },
];

// `url`, `escala` e `variasPecas` descrevem de onde o item veio: o editor
// grava isso na cena exportada, e o jogo carrega o mesmo nó do mesmo arquivo
// (src/sceneModels.js).
export function addDynamicProps(gltfScene, { categoria = null, url = null, escala = 1, variasPecas = false } = {}) {
  gltfScene.children.forEach((child, index) => {
    if (child) {
      const box = new THREE.Box3().setFromObject(child);
      const w = box.max.x - box.min.x;
      const d = box.max.z - box.min.z;
      
      const nameLower = child.name.toLowerCase();
      let category = null;
      const tem = (...palavras) => palavras.some(p => nameLower.includes(p));
      if (tem('cama', 'criado', 'guarda')) category = 'Quarto';
      // Banheiro antes de cozinha: "pia_banheiro" também contém "pia".
      else if (tem('banho', 'banheiro', 'vaso', 'espelho', 'chuveiro')) category = 'Banheiro';
      else if (tem('geladeira', 'pia', 'fogao', 'armario')) category = 'Cozinha';
      else if (tem('sofa', 'tv', 'estante', 'poltrona', 'mesinha', 'monitor', 'tapete', 'mural', 'retrato')) category = 'Sala';
      else if (tem('abajur', 'luminaria')) category = 'Iluminação';
      else if (tem('caixa_correio', 'extintor')) category = 'Decoração';
      else if (tem('celular', 'dinheiro', 'cartao', 'cigarro', 'fone')) category = 'Itens';
      else if (nameLower.includes('banco') || nameLower.includes('cadeira') || nameLower.includes('mesa') || nameLower.includes('bancada')) category = 'Superfícies';
      else if (nameLower.includes('veiculo') || nameLower.includes('carro') || nameLower.includes('fusca')) category = 'Veículos';
      else if (nameLower.includes('personagem') || nameLower.includes('velhinho')) category = 'Personagens';
      else if (['alpaca','bull','cow','deer','donkey','fox','horse','husky','shiba','stag','wolf'].some(a => nameLower.includes(a))) category = 'Animais';
      // Nomes em inglês dos pacotes da Quaternius. A ordem importa: "table_lamp"
      // é luminária, não mesa; "bathroom_toilet_paper" é banheiro.
      else if (/light|lamp|chandelier/.test(nameLower)) category = 'Iluminação';
      else if (/bath|toilet|towel/.test(nameLower)) category = 'Banheiro';
      else if (/bed|night_stand|drawer/.test(nameLower)) category = 'Quarto';
      else if (/kitchen|fridge|oven|plate|stool|washing/.test(nameLower)) category = 'Cozinha';
      else if (/couch|fireplace|shelf|rug|curtain/.test(nameLower)) category = 'Sala';
      else if (/plant|cactus/.test(nameLower)) category = 'Plantas';
      else if (/door|window|column/.test(nameLower)) category = 'Portas e janelas';
      else if (/chair|table/.test(nameLower)) category = 'Superfícies';
      if (!category) category = categoria || 'Outros';

      // Id repetido sobrescreveria o item anterior no catálogo sem aviso.
      if (PALETTE.some(p => p.id === child.name)) {
        console.warn(`Item "${child.name}" já existe no catálogo; a cópia de outro arquivo foi ignorada.`);
        return;
      }
      
      const nomeLimpo = child.name.charAt(0).toUpperCase() + child.name.slice(1).replace(/_/g, ' ');
      
      PALETTE.push({
        id: child.name,
        key: '-',
        category: category,
        name: nomeLimpo,
        footprint: { w: Math.max(1, Math.ceil(w)), d: Math.max(1, Math.ceil(d)) },
        modelo: url ? { url, no: variasPecas ? child.name : null, escala } : null,
        build: () => {
          let clone;
          try {
            clone = SkeletonUtils.clone(child);
          } catch (e) {
            clone = child.clone();
          }
          clone.traverse(o => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          return clone;
        }
      });
    }
  });
}

export function paletteById(id) {
  return PALETTE.find(p => p.id === id);
}
