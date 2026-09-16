// Objetos do catálogo do editor colocados na cena do jogo (src/data/scene.js).
//
// Cada item que veio de um arquivo .glb carrega a origem do modelo:
//   { typeId, position: [x, y, z], rotY, modelo: { url, no, escala } }
// `no` é o nome do nó dentro do arquivo (arquivos com várias peças, como
// moveis.glb) ou null (arquivo de um objeto só: vale o primeiro filho da cena).
//
// Sem three.js: aqui só se valida e agrupa por arquivo, pra que cada .glb seja
// baixado uma vez só não importa quantas cópias a cena tenha. Quem carrega,
// clona e posiciona é o World.

const PREFIXO = 'assets/props/';

/**
 * Papel de uma peça de kit de construção, vindo do índice do pacote:
 *   piso   — sustenta o jogador e é teto pra quem está embaixo;
 *   escada — rampa do chão ao topo, sem colisão lateral;
 *   porta  — abre e fecha com a tecla de interagir;
 *   luz    — lustre/plafon: acende o ambiente em volta.
 */
export const PAPEIS = ['piso', 'escada', 'porta', 'luz'];

// Propriedades da PEÇA (não do modelo) que o jogo usa, definidas no editor:
//   interacao — id em data/observacoes.js: o objeto passa a responder ao E;
//   rotulo    — o nome que aparece no prompt ("Porta do 101", "Geladeira");
//   portaId   — nome fixo de uma porta, pro roteiro do jogo achar ela.
const TEXTO = (v, max) => v === undefined || (typeof v === 'string' && v.length <= max);

function propsValidas(props) {
  if (props === undefined || props === null) return true;
  if (typeof props !== 'object' || Array.isArray(props)) return false;
  return TEXTO(props.interacao, 60) && TEXTO(props.rotulo, 60) && TEXTO(props.portaId, 60);
}

function modeloValido(item) {
  const m = item.modelo;
  const escala = m.escala ?? 1;
  return typeof m.url === 'string'
    && m.url.startsWith(PREFIXO) && m.url.endsWith('.glb') && !m.url.includes('..')
    && (m.no === null || m.no === undefined || typeof m.no === 'string')
    && (m.colisao === undefined || typeof m.colisao === 'boolean')
    && (m.papel === undefined || PAPEIS.includes(m.papel))
    && Number.isFinite(escala) && escala > 0
    && propsValidas(item.props)
    && Array.isArray(item.position) && item.position.length === 3 && item.position.every(Number.isFinite);
}

/**
 * @returns {{ porArquivo: Map<string, object[]>, invalidos: object[] }}
 *   porArquivo — url → cópias a colocar ({ typeId, no, escala, position, rotY });
 *   invalidos  — itens com `modelo` que não passaram na validação.
 */
export function modelosDaCena(itens) {
  const porArquivo = new Map();
  const invalidos = [];
  for (const item of itens) {
    if (!item.modelo) continue;
    if (!modeloValido(item)) {
      invalidos.push(item);
      continue;
    }
    const { url, no = null, escala = 1, colisao, papel } = item.modelo;
    if (!porArquivo.has(url)) porArquivo.set(url, []);
    porArquivo.get(url).push({
      typeId: item.typeId,
      no,
      escala,
      position: item.position,
      rotY: Number.isFinite(item.rotY) ? item.rotY : 0,
      // Só quando o pacote forçou: sem isso vale a regra automática.
      ...(typeof colisao === 'boolean' ? { colisao } : {}),
      ...(papel ? { papel } : {}),
      ...(item.props?.interacao ? { interacao: item.props.interacao } : {}),
      ...(item.props?.rotulo ? { rotulo: item.props.rotulo } : {}),
      ...(item.props?.portaId ? { portaId: item.props.portaId } : {}),
    });
  }
  return { porArquivo, invalidos };
}
