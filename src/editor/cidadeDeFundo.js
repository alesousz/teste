// Cidade de referência no editor de mapa, como a vizinhança em volta do lote
// no The Sims: asfalto, calçadas e faixas, terreno dos quarteirões, fonte da
// praça, postes e o prédio inicial — as mesmas funções que o jogo usa.
//
// Não é peça da cena: não dá pra clicar, mover nem apagar. O que é editável
// (prédios, marcos, árvores, bancos) vem de scene.js como peça.
import * as THREE from 'three';
import { CONFIG, CITY, HOME_ORIGIN } from '../data.js';
import { criarAsfalto, criarChaoDaRua } from '../streetGround.js';
import { criarTerrenoDosQuarteiroes, criarFonte, criarPostesDaRua } from '../cityLook.js';
import { buildBuilding } from '../building.js';

// Mesmo tamanho do asfalto do jogo (World._buildGround).
export const TAMANHO_DA_CIDADE = CONFIG.GRID_SIZE * CONFIG.CELL + 40;

export function criarCidadeDeFundo() {
  const grupo = new THREE.Group();
  grupo.name = 'cidade-de-fundo';
  grupo.add(criarAsfalto(TAMANHO_DA_CIDADE), criarChaoDaRua(), criarTerrenoDosQuarteiroes(CITY.blocks, CONFIG.BLOCK_SIZE));
  for (const bloco of CITY.blocks) {
    if (bloco.type === 'plaza') grupo.add(criarFonte(bloco.cx, bloco.cz));
  }
  // No editor é sempre dia: as luzes dos postes só custariam desempenho.
  const { grupo: postes, postes: lista } = criarPostesDaRua(CONFIG.GRID_SIZE, CONFIG.CELL);
  for (const p of lista) p.light.removeFromParent();
  grupo.add(postes);
  grupo.add(buildBuilding(HOME_ORIGIN).group);
  grupo.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return grupo;
}
