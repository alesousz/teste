import * as THREE from 'three';

// Paleta de itens do editor — geometria simples por enquanto (placeholder),
// já pensada pro tema da nossa cidade moderna (nada de masmorra/fantasia).
// `build()` retorna um THREE.Object3D novo a cada chamada.

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
}

export const PALETTE = [
  {
    id: 'building_small',
    key: '1',
    name: 'Prédio Pequeno',
    footprint: { w: 6, d: 6 },
    build: () => {
      const m = box(6, 8, 6, 0xb9c4cc);
      m.position.y = 4;
      return m;
    },
  },
  {
    id: 'building_tall',
    key: '2',
    name: 'Prédio Alto',
    footprint: { w: 8, d: 8 },
    build: () => {
      const m = box(8, 24, 8, 0x9fb3c8);
      m.position.y = 12;
      return m;
    },
  },
  {
    id: 'tree',
    key: '3',
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
    key: '4',
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
    key: '5',
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
    id: 'npc_marker',
    key: '6',
    name: 'Marcador de NPC',
    footprint: { w: 1, d: 1 },
    build: () => {
      const g = new THREE.Group();
      const body = box(0.5, 1.6, 0.3, 0x3f6fb0);
      body.position.y = 0.8;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshStandardMaterial({ color: 0xe0b295 }));
      head.position.y = 1.75;
      g.add(body, head);
      return g;
    },
  },
  {
    id: 'landmark_home',
    key: '7',
    name: 'Marco: Casa',
    footprint: { w: 10, d: 9 },
    build: () => {
      const g = new THREE.Group();
      const m = box(10, 4.5, 9, 0xc9a876);
      m.position.y = 2.25;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(6, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x7a4a34 }));
      roof.position.y = 5.75;
      roof.rotation.y = Math.PI / 4;
      g.add(m, roof);
      return g;
    },
  },
  {
    id: 'fragment',
    key: '8',
    name: 'Fragmento de Memória',
    footprint: { w: 1, d: 1 },
    build: () => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe58a, emissiveIntensity: 0.9 }));
      m.position.y = 1.4;
      return m;
    },
  },
];

export function paletteById(id) {
  return PALETTE.find(p => p.id === id);
}
