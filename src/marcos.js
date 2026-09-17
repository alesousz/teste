// Marcos: os prédios com nome que o resto do jogo aponta — a casa onde se
// dorme, o mercado do turno, a escola da aula. A bússola aponta pra eles e a
// rotina ancora compromisso neles ("na frente do Mercado").
//
// Cada marco é uma peça da cena e carrega as próprias medidas: criar uma
// padaria é colocar a peça, dar um id e um nome. O `kind` é a identidade que
// a rotina e as casas citam — mudar ele quebra quem aponta, por isso a
// conferência da rotina avisa quando o marco citado não está no mapa.
//
// Sem three.js: roda nos testes em Node.

/** Os quatro marcos que o jogo já tinha, com as medidas originais. */
export const MARCOS_PADRAO = {
  home_operario: { w: 10, d: 9, h: 4.5, color: '#c9a876', roofColor: '#7a4a34', label: 'CASA' },
  home_nobre: { w: 16, d: 13, h: 6.5, color: '#f3ead9', roofColor: '#5a4636', label: 'CASA' },
  job_mercado: { w: 18, d: 12, h: 5, color: '#d97b4a', roofColor: '#b03a3a', label: 'MERCADO' },
  school: { w: 26, d: 18, h: 9, color: '#dfe6ee', roofColor: '#3a5a7a', label: 'ESCOLA' },
};

// Cenas escritas antes de o marco virar peça com medidas próprias usavam um
// typeId por marco. Continuam abrindo: viram `marco` com as medidas de fábrica.
export const TIPO_ANTIGO = {
  landmark_home_operario: 'home_operario',
  landmark_home_nobre: 'home_nobre',
  landmark_job_mercado: 'job_mercado',
  landmark_school: 'school',
};

export const TIPO_DE_MARCO = 'marco';

export const ehMarco = typeId => typeId === TIPO_DE_MARCO || typeId in TIPO_ANTIGO;

const numero = (v, padrao, min, max) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return padrao;
  return Math.min(Math.max(v, min), max);
};

const cor = (v, padrao) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : padrao);

export const LIMITES_DO_MARCO = { MIN: 2, MAX: 60, ALTURA_MAX: 40 };

/**
 * Peça da cena → marco pronto pro jogo: identidade, nome e medidas. Devolve
 * null pra peça que não é marco.
 */
export function marcoDaPeca(item) {
  if (!item || !ehMarco(item.typeId)) return null;
  const p = item.props ?? {};
  const kind = (item.typeId === TIPO_DE_MARCO ? p.kind : TIPO_ANTIGO[item.typeId]) || '';
  if (!kind) return null;
  const padrao = MARCOS_PADRAO[kind] ?? MARCOS_PADRAO.job_mercado;
  const { MIN, MAX, ALTURA_MAX } = LIMITES_DO_MARCO;
  return {
    kind,
    label: (typeof p.label === 'string' && p.label.trim()) || padrao.label,
    w: numero(p.w, padrao.w, MIN, MAX),
    d: numero(p.d, padrao.d, MIN, MAX),
    h: numero(p.h, padrao.h, MIN, ALTURA_MAX),
    color: cor(p.color, padrao.color),
    roofColor: cor(p.roofColor, padrao.roofColor),
    x: item.position[0],
    z: item.position[2],
  };
}

/** Marcos da cena, por kind. Dois com o mesmo id: vale o último colocado. */
export function marcosDaCena(itens) {
  const porKind = {};
  for (const item of itens) {
    const marco = marcoDaPeca(item);
    if (marco) porKind[marco.kind] = marco;
  }
  return porKind;
}

/**
 * Problemas dos marcos, no mesmo formato da conferência da rotina
 * ({ nivel, onde, mensagem }) — id repetido e id vazio passam despercebidos
 * até alguém apontar pro marco errado.
 */
export function problemasDosMarcos(itens) {
  const problemas = [];
  const vistos = new Set();
  for (const item of itens) {
    if (!ehMarco(item.typeId)) continue;
    const kind = item.typeId === TIPO_DE_MARCO ? (item.props?.kind ?? '') : TIPO_ANTIGO[item.typeId];
    const onde = `marco ${kind || '(sem id)'}`;
    if (!kind) {
      problemas.push({ nivel: 'erro', onde, mensagem: 'Marco sem id: a rotina e a bússola não têm como apontar pra ele.' });
      continue;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(kind)) {
      problemas.push({ nivel: 'aviso', onde, mensagem: `Id "${kind}" foge do padrão (minúsculas, números e _), o que atrapalha na hora de citar.` });
    }
    if (vistos.has(kind)) {
      problemas.push({ nivel: 'erro', onde, mensagem: `Já existe outro marco com o id "${kind}": quem aponta pra ele cai num dos dois, sem regra.` });
    }
    vistos.add(kind);
  }
  return problemas;
}
