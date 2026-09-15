// Modelos .glb dos móveis, gerados no Blender por tools/blender/moveis.py.
//
// O modelo só troca a APARÊNCIA: a colisão e os pontos de interação
// continuam vindo da tabela de src/apartmentProps.js, e o script do Blender
// falha se uma peça sair do AABB declarado lá. As caixas montadas por
// buildApartmentProps ficam no lugar até o arquivo chegar — e pra sempre,
// pra qualquer peça que ele não trouxer ou se ele não carregar.
//
// Sem import de three nem do GLTFLoader aqui: quem chama injeta o
// carregador, então isto roda nos testes em Node (e o script do Blender lê
// ALTURA_EXTRA daqui pelo Node também).

/** Um arquivo pra todas as peças: uma requisição, materiais compartilhados. */
export const ARQUIVO_MOVEIS = 'assets/props/moveis.glb';

/**
 * Quanto a aparência de cada peça pode subir acima da altura de colisão.
 * Só pra partes encostadas na parede, onde o jogador nunca passa por cima:
 * a cabeceira e o travesseiro da cama, as torneiras.
 */
export const ALTURA_EXTRA = {
  cama: 0.20,
  pia_banheiro: 0.25,
  bancada: 0.30,
};

/**
 * Põe `modelo` no lugar das peças do grupo do móvel. A origem do modelo é o
 * centro da base, rente ao piso (convenção dos scripts do Blender).
 */
export function encaixarModelo(grupoMovel, modelo, caixa) {
  modelo.position.set((caixa.minX + caixa.maxX) / 2, caixa.minY, (caixa.minZ + caixa.maxZ) / 2);
  modelo.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  // Não descarta geometria nem material das caixas: são compartilhados com
  // o resto do apartamento.
  grupoMovel.clear();
  grupoMovel.add(modelo);
}

/**
 * Carrega o arquivo e troca cada peça que ele trouxer. Devolve quantas trocou.
 *   grupoMoveis — grupo de buildApartmentProps (subgrupos nomeados por tag);
 *   caixas      — apartmentBoxes();
 *   carregar    — url → Promise<{ scene }> (ex.: GLTFLoader).
 */
export async function carregarModelosMoveis(grupoMoveis, caixas, carregar, url = ARQUIVO_MOVEIS) {
  let gltf;
  try {
    gltf = await carregar(url);
  } catch (err) {
    console.warn(`[móveis] ${url} não carregou; mantendo a versão em caixas.`, err);
    return 0;
  }
  // Procura tudo antes de mexer: encaixar tira o nó de dentro de gltf.scene.
  const pares = caixas
    .map(caixa => ({
      caixa,
      grupo: grupoMoveis.getObjectByName(caixa.tag),
      modelo: gltf.scene.getObjectByName(caixa.tag),
    }))
    .filter(p => p.grupo && p.modelo);
  for (const { caixa, grupo, modelo } of pares) encaixarModelo(grupo, modelo, caixa);
  return pares.length;
}
