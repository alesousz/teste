// Modelos .glb de móveis, gerados no Blender pelos scripts de tools/blender/.
//
// O modelo só troca a APARÊNCIA: a colisão e os pontos de interação
// continuam vindo da tabela de src/apartmentProps.js, e cada script do
// Blender falha se a peça sair do AABB declarado lá. As caixas montadas por
// buildApartmentProps ficam no lugar até o arquivo chegar — e pra sempre,
// se ele não carregar.
//
// Sem import de three nem do GLTFLoader aqui: quem chama injeta o
// carregador, então isto roda nos testes em Node.

export const MODELOS_MOVEIS = [
  { tag: 'sofa', url: 'assets/props/sofa.glb' },
];

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
 * Carrega os modelos e troca os que chegarem. Devolve quantos foram trocados.
 *   grupoMoveis — grupo de buildApartmentProps (subgrupos nomeados por tag);
 *   caixas      — apartmentBoxes();
 *   carregar    — url → Promise<{ scene }> (ex.: GLTFLoader).
 */
export async function carregarModelosMoveis(grupoMoveis, caixas, carregar, modelos = MODELOS_MOVEIS) {
  const porTag = new Map(caixas.map(c => [c.tag, c]));
  const trocados = await Promise.all(modelos.map(async ({ tag, url }) => {
    const grupo = grupoMoveis.getObjectByName(tag);
    const caixa = porTag.get(tag);
    if (!grupo || !caixa) return false;
    try {
      const gltf = await carregar(url);
      encaixarModelo(grupo, gltf.scene, caixa);
      return true;
    } catch (err) {
      console.warn(`[móveis] ${url} não carregou; mantendo a versão em caixas.`, err);
      return false;
    }
  }));
  return trocados.filter(Boolean).length;
}
