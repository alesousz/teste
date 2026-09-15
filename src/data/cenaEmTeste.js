// Cena do Modo Viver: o editor de mapa grava a cena em edição no localStorage
// e abre o jogo com ?viver=1; o jogo usa essa cena no lugar de
// src/data/scene.js, com o personagem onde a câmera do editor olhava.
//
// Tudo que vem do localStorage é dado NÃO CONFIÁVEL (escrito à mão, por uma
// versão velha do editor, pela metade): passa por validarCena antes de entrar.
// Sem DOM: roda nos testes em Node.

export const CHAVE_CENA_EM_TESTE = 'ecos-cena-em-teste';
const MAX_ITENS = 5000;

const numero = v => typeof v === 'number' && Number.isFinite(v);
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Cena limpa `{ items, cidade?, spawn? }` ou null se qualquer peça estiver
 * malformada — melhor não jogar do que jogar uma cena pela metade.
 */
export function validarCena(dado) {
  if (!objeto(dado) || !Array.isArray(dado.items) || dado.items.length > MAX_ITENS) return null;
  const items = [];
  for (const it of dado.items) {
    if (!objeto(it) || typeof it.typeId !== 'string' || !it.typeId || it.typeId.length > 200) return null;
    if (!Array.isArray(it.position) || it.position.length !== 3 || !it.position.every(numero)) return null;
    if (it.rotY !== undefined && !numero(it.rotY)) return null;
    if (it.props !== undefined && it.props !== null && !objeto(it.props)) return null;
    if (it.modelo !== undefined && !objeto(it.modelo)) return null;
    items.push({
      typeId: it.typeId,
      position: [...it.position],
      rotY: it.rotY ?? 0,
      ...(it.props ? { props: it.props } : {}),
      ...(it.modelo ? { modelo: it.modelo } : {}),
    });
  }
  const cena = { items };
  if (dado.cidade === 'fixa') cena.cidade = 'fixa';
  const s = dado.spawn;
  if (objeto(s) && numero(s.x) && numero(s.y) && numero(s.z)) cena.spawn = { x: s.x, y: s.y, z: s.z };
  return cena;
}

/** Cena do Modo Viver, ou null fora dele (sem ?viver=1, sem cena gravada ou cena inválida). */
export function lerCenaEmTeste(armazenamento, busca) {
  if (new URLSearchParams(busca).get('viver') !== '1') return null;
  try {
    const bruto = armazenamento.getItem(CHAVE_CENA_EM_TESTE);
    return bruto ? validarCena(JSON.parse(bruto)) : null;
  } catch {
    return null;
  }
}
