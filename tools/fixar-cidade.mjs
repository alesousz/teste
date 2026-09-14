// Fixa a cidade em src/data/scene.js: sorteia os prédios e a natureza dos
// parques UMA vez, com as mesmas regras que o jogo usava a cada carregamento,
// e grava tudo como peças da cena — a partir daí dá pra mexer em cada prédio
// no editor de mapa e a cidade é a mesma em toda partida.
//
// Roda uma vez só: se a cena já está com `cidade: 'fixa'`, não faz nada.
// A semente é opcional; a mesma semente dá a mesma cidade.
//
// Uso: node tools/fixar-cidade.mjs [semente]

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulo = caminho => import(pathToFileURL(join(RAIZ, caminho)).href);

const { SCENE } = await modulo('src/data/scene.js');
if (SCENE.cidade === 'fixa') {
  console.error('src/data/scene.js já está com a cidade fixa; nada a fazer.');
  process.exit(1);
}
const { gerarCidade, BUILDING_COLOR_PALETTE, CONFIG } = await modulo('src/data.js');
const { textoDoScene } = await modulo('src/data/formatoCena.js');

// mulberry32: pequeno, rápido e igual em qualquer máquina.
function sorteador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const semente = Number(process.argv[2] ?? 20260914);
const sortear = sorteador(semente);
const cidade = gerarCidade(sortear, { fixa: false });

const r2 = v => Math.round(v * 100) / 100;
const hex = n => `#${n.toString(16).padStart(6, '0')}`;
const novos = [];
for (const bloco of cidade.blocks) {
  for (const b of bloco.lots) {
    if (b.kind || b.custom) continue;   // marcos e prédios da cena já estão lá
    novos.push({
      typeId: 'building', position: [r2(b.cx), 0, r2(b.cz)], rotY: 0,
      props: { w: r2(b.w), d: r2(b.d), h: r2(b.h), color: hex(BUILDING_COLOR_PALETTE[b.colorIdx]), estilo: 'cidade', semente: b.winSeed },
    });
  }
  if (bloco.type === 'park') {
    // Mesmas regras de World._addParkProps: 8 a 12 árvores e 3 bancos.
    const lado = CONFIG.BLOCK_SIZE;
    const arvores = 8 + Math.floor(sortear() * 5);
    for (let i = 0; i < arvores; i++) {
      const x = bloco.cx + (sortear() - 0.5) * (lado - 6);
      const z = bloco.cz + (sortear() - 0.5) * (lado - 6);
      novos.push({ typeId: 'tree', position: [r2(x), 0, r2(z)], rotY: 0 });
    }
    for (let i = 0; i < 3; i++) {
      const x = bloco.cx + (sortear() - 0.5) * (lado - 10);
      const z = bloco.cz + (sortear() - 0.5) * (lado - 10);
      novos.push({ typeId: 'bench', position: [r2(x), 0, r2(z)], rotY: r2(sortear() * Math.PI) });
    }
  }
}

writeFileSync(join(RAIZ, 'src/data/scene.js'), textoDoScene({ cidade: 'fixa', items: [...SCENE.items, ...novos] }));
const contar = t => novos.filter(n => n.typeId === t).length;
console.log(`Cidade fixa com a semente ${semente}: ${contar('building')} prédios, ${contar('tree')} árvores e ${contar('bench')} bancos gravados em src/data/scene.js.`);
