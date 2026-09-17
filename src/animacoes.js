// Conjuntos de animação: quais das animações do pacote cada personagem usa
// pra ficar parado, andar, correr, conversar, pular e brigar.
//
// A ideia é a do Mixamo: o autor vê a lista de animações, clica e o boneco
// faz. Só que aqui elas ficam guardadas em CONJUNTOS nomeados ("normal",
// "formal", "apressado"), e um personagem aponta pra um conjunto. Trocar o
// conjunto troca o jeito da pessoa se mexer inteiro, de uma vez — é assim que
// uma missão faz um NPC passar a andar diferente do meio da história em
// diante, sem tocar em código.
//
// Módulo puro (sem three, sem DOM): o jogo, o editor e os testes leem as
// mesmas regras. O dado vive em src/data/animacoes.json, escrito na aba
// Animações do editor de conteúdo.

/** Como o clipe se comporta: em loop (segura o estado) ou de um disparo só. */
export const EM_LOOP = 'loop';
export const UMA_VEZ = 'unica';

/**
 * As animações do pacote (Universal Animation Library, Quaternius, CC0), com
 * nome em português. A lista é conferida contra o .glb no teste — animação
 * que não está no arquivo não pode aparecer no editor, e vice-versa.
 */
export const CLIPES = [
  // Parado
  { nome: 'Idle_Loop', rotulo: 'Parado', grupo: 'Parado', tipo: EM_LOOP },
  { nome: 'Idle_Talking_Loop', rotulo: 'Parado conversando', grupo: 'Parado', tipo: EM_LOOP },
  { nome: 'Idle_Torch_Loop', rotulo: 'Parado segurando tocha', grupo: 'Parado', tipo: EM_LOOP },
  { nome: 'A_TPose', rotulo: 'Pose de boneco (T)', grupo: 'Parado', tipo: UMA_VEZ },
  // Andar e correr
  { nome: 'Walk_Loop', rotulo: 'Andando', grupo: 'Andar e correr', tipo: EM_LOOP },
  { nome: 'Walk_Formal_Loop', rotulo: 'Andando formal (empertigado)', grupo: 'Andar e correr', tipo: EM_LOOP },
  { nome: 'Jog_Fwd_Loop', rotulo: 'Trotando', grupo: 'Andar e correr', tipo: EM_LOOP },
  { nome: 'Sprint_Loop', rotulo: 'Correndo', grupo: 'Andar e correr', tipo: EM_LOOP },
  { nome: 'Push_Loop', rotulo: 'Empurrando algo', grupo: 'Andar e correr', tipo: EM_LOOP },
  { nome: 'Crouch_Idle_Loop', rotulo: 'Agachado parado', grupo: 'Andar e correr', tipo: EM_LOOP },
  { nome: 'Crouch_Fwd_Loop', rotulo: 'Agachado andando', grupo: 'Andar e correr', tipo: EM_LOOP },
  // Pular
  { nome: 'Jump_Start', rotulo: 'Início do pulo', grupo: 'Pular', tipo: UMA_VEZ },
  { nome: 'Jump_Loop', rotulo: 'No ar', grupo: 'Pular', tipo: EM_LOOP },
  { nome: 'Jump_Land', rotulo: 'Aterrissando', grupo: 'Pular', tipo: UMA_VEZ },
  // Briga
  { nome: 'Punch_Jab', rotulo: 'Soco direto', grupo: 'Briga', tipo: UMA_VEZ },
  { nome: 'Punch_Cross', rotulo: 'Soco cruzado', grupo: 'Briga', tipo: UMA_VEZ },
  { nome: 'Hit_Chest', rotulo: 'Levando soco no peito', grupo: 'Briga', tipo: UMA_VEZ },
  { nome: 'Hit_Head', rotulo: 'Levando soco na cara', grupo: 'Briga', tipo: UMA_VEZ },
  { nome: 'Roll', rotulo: 'Rolando (esquiva)', grupo: 'Briga', tipo: UMA_VEZ },
  { nome: 'Death01', rotulo: 'Caindo desmaiado', grupo: 'Briga', tipo: UMA_VEZ },
  // Sentar
  { nome: 'Sitting_Enter', rotulo: 'Sentando', grupo: 'Sentar', tipo: UMA_VEZ },
  { nome: 'Sitting_Idle_Loop', rotulo: 'Sentado', grupo: 'Sentar', tipo: EM_LOOP },
  { nome: 'Sitting_Talking_Loop', rotulo: 'Sentado conversando', grupo: 'Sentar', tipo: EM_LOOP },
  { nome: 'Sitting_Exit', rotulo: 'Levantando da cadeira', grupo: 'Sentar', tipo: UMA_VEZ },
  // Mãos
  { nome: 'Interact', rotulo: 'Mexendo em algo', grupo: 'Mãos', tipo: UMA_VEZ },
  { nome: 'PickUp_Table', rotulo: 'Pegando algo da mesa', grupo: 'Mãos', tipo: UMA_VEZ },
  { nome: 'Fixing_Kneeling', rotulo: 'Consertando ajoelhado', grupo: 'Mãos', tipo: UMA_VEZ },
  // Água e veículo
  { nome: 'Swim_Idle_Loop', rotulo: 'Boiando', grupo: 'Água e veículo', tipo: EM_LOOP },
  { nome: 'Swim_Fwd_Loop', rotulo: 'Nadando', grupo: 'Água e veículo', tipo: EM_LOOP },
  { nome: 'Driving_Loop', rotulo: 'Dirigindo', grupo: 'Água e veículo', tipo: EM_LOOP },
  // Arma de fogo
  { nome: 'Pistol_Idle_Loop', rotulo: 'Parado com pistola', grupo: 'Arma de fogo', tipo: EM_LOOP },
  { nome: 'Pistol_Aim_Neutral', rotulo: 'Mirando à frente', grupo: 'Arma de fogo', tipo: UMA_VEZ },
  { nome: 'Pistol_Aim_Up', rotulo: 'Mirando pra cima', grupo: 'Arma de fogo', tipo: UMA_VEZ },
  { nome: 'Pistol_Aim_Down', rotulo: 'Mirando pra baixo', grupo: 'Arma de fogo', tipo: UMA_VEZ },
  { nome: 'Pistol_Shoot', rotulo: 'Atirando', grupo: 'Arma de fogo', tipo: UMA_VEZ },
  { nome: 'Pistol_Reload', rotulo: 'Recarregando', grupo: 'Arma de fogo', tipo: UMA_VEZ },
  // Arma branca
  { nome: 'Sword_Idle', rotulo: 'Parado com espada', grupo: 'Arma branca', tipo: EM_LOOP },
  { nome: 'Sword_Attack', rotulo: 'Golpe de espada', grupo: 'Arma branca', tipo: UMA_VEZ },
  // Magia
  { nome: 'Spell_Simple_Enter', rotulo: 'Começando a conjurar', grupo: 'Magia', tipo: UMA_VEZ },
  { nome: 'Spell_Simple_Idle_Loop', rotulo: 'Conjurando', grupo: 'Magia', tipo: EM_LOOP },
  { nome: 'Spell_Simple_Shoot', rotulo: 'Lançando a magia', grupo: 'Magia', tipo: UMA_VEZ },
  { nome: 'Spell_Simple_Exit', rotulo: 'Terminando de conjurar', grupo: 'Magia', tipo: UMA_VEZ },
  // Outros
  { nome: 'Dance_Loop', rotulo: 'Dançando', grupo: 'Outros', tipo: EM_LOOP },
];

export const CLIPE_POR_NOME = Object.fromEntries(CLIPES.map(c => [c.nome, c]));
export const GRUPOS_DE_CLIPE = [...new Set(CLIPES.map(c => c.grupo))];

/**
 * Os estados de locomoção: o personagem está sempre em um deles, e o clipe
 * fica em loop enquanto o estado durar. Por isso estado quer clipe de loop.
 */
export const ESTADOS = [
  { chave: 'idle', rotulo: 'Parado', dica: 'O que ele faz sem fazer nada. É a animação que mais aparece.' },
  { chave: 'walk', rotulo: 'Andando', dica: 'O passo normal, o tempo todo que ele se desloca.' },
  { chave: 'run', rotulo: 'Correndo', dica: 'Segurando Shift, ou o NPC apressado.' },
  { chave: 'talk', rotulo: 'Conversando', dica: 'Enquanto a caixa de diálogo está aberta.' },
  { chave: 'jump', rotulo: 'No ar', dica: 'Do impulso até encostar no chão de novo.' },
  { chave: 'crouchIdle', rotulo: 'Agachado parado', dica: 'Segurando Ctrl, sem andar.' },
  { chave: 'crouchWalk', rotulo: 'Agachado andando', dica: 'Segurando Ctrl e andando.' },
];

/**
 * Gestos: tocam uma vez por cima da locomoção e devolvem o controle. Por isso
 * gesto quer clipe que termina — um clipe de loop travaria o personagem nele.
 */
export const GESTOS = [
  { chave: 'attack', rotulo: 'Soco', dica: 'O primeiro soco.' },
  { chave: 'attackCross', rotulo: 'Soco do combo', dica: 'O segundo, quando sai dentro da janela.' },
  { chave: 'hit', rotulo: 'Levando golpe', dica: 'Quando ele apanha.' },
  { chave: 'dodge', rotulo: 'Esquiva', dica: 'A rolada pra escapar do contra-ataque.' },
];

export const CHAVES_DE_ESTADO = ESTADOS.map(e => e.chave);
export const CHAVES_DE_GESTO = GESTOS.map(g => g.chave);

/** O jeito de se mexer que o jogo sempre teve. Todo conjunto parte daqui. */
export const CONJUNTO_DE_FABRICA = {
  estados: {
    idle: 'Idle_Loop',
    walk: 'Walk_Loop',
    run: 'Sprint_Loop',
    talk: 'Idle_Talking_Loop',
    jump: 'Jump_Loop',
    crouchIdle: 'Crouch_Idle_Loop',
    crouchWalk: 'Crouch_Fwd_Loop',
  },
  gestos: {
    attack: 'Punch_Jab',
    attackCross: 'Punch_Cross',
    hit: 'Hit_Chest',
    dodge: 'Roll',
  },
};

export const ID_PADRAO = 'normal';

const texto = (v, padrao = '') => (typeof v === 'string' ? v : padrao);
const mapa = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Id de conjunto aceitável: sem espaço, minúsculo, é o que o resto cita. */
export const idLimpo = v => texto(v).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');

/**
 * O que o JOGO usa. Todo conjunto sai daqui completo: clipe que não existe no
 * pacote ou estado esquecido caem no de fábrica, pra nenhum personagem ficar
 * em T-pose por causa de um nome digitado errado.
 */
export function normalizarAnimacoes(bruto) {
  const lido = mapa(bruto);
  const conjuntos = {};

  for (const [chave, cru] of Object.entries(mapa(lido.conjuntos))) {
    const id = idLimpo(chave);
    if (!id) continue;
    const c = mapa(cru);
    const escolher = (valor, padrao) => (CLIPE_POR_NOME[texto(valor)] ? valor : padrao);
    conjuntos[id] = {
      id,
      label: texto(c.label, id),
      estados: Object.fromEntries(CHAVES_DE_ESTADO
        .map(k => [k, escolher(mapa(c.estados)[k], CONJUNTO_DE_FABRICA.estados[k])])),
      gestos: Object.fromEntries(CHAVES_DE_GESTO
        .map(k => [k, escolher(mapa(c.gestos)[k], CONJUNTO_DE_FABRICA.gestos[k])])),
    };
  }

  // Sempre sobra pelo menos um conjunto inteiro: sem isso, um arquivo vazio
  // deixaria todo mundo sem animação nenhuma.
  if (!conjuntos[ID_PADRAO]) {
    conjuntos[ID_PADRAO] = {
      id: ID_PADRAO,
      label: 'Normal',
      estados: { ...CONJUNTO_DE_FABRICA.estados },
      gestos: { ...CONJUNTO_DE_FABRICA.gestos },
    };
  }

  const padrao = conjuntos[idLimpo(lido.padrao)] ? idLimpo(lido.padrao) : ID_PADRAO;
  return { padrao, conjuntos };
}

/**
 * Os clipes de um personagem. Id vazio, desconhecido ou apagado cai no
 * conjunto padrão — trocar de roupa não pode deixar ninguém sem andar.
 */
export function clipesDoConjunto(animacoes, id) {
  const a = animacoes?.conjuntos ? animacoes : normalizarAnimacoes(animacoes);
  return a.conjuntos[idLimpo(id)] ?? a.conjuntos[a.padrao] ?? a.conjuntos[ID_PADRAO];
}

/** Lista pro select do editor de mapa e do editor de conteúdo. */
export function opcoesDeConjunto(animacoes) {
  const a = animacoes?.conjuntos ? animacoes : normalizarAnimacoes(animacoes);
  return Object.values(a.conjuntos).map(c => ({ value: c.id, label: c.label || c.id }));
}

/**
 * O que o AUTOR lê. Mesmo formato dos problemas da rotina e das regras.
 * `usados` são os ids citados por personagens e efeitos, pra apontar
 * personagem que aponta pro vazio. O aviso de "ninguém usa este conjunto" só
 * sai com `conferirUso`: só o editor enxerga tudo que cita um conjunto
 * (personagens, diálogos e missões); o jogo enxerga só os personagens, e
 * avisaria errado sobre um conjunto que uma missão troca lá na frente.
 */
export function validarAnimacoes(bruto, { usados = new Map(), conferirUso = false } = {}) {
  const lido = mapa(bruto);
  const problemas = [];
  const anotar = (nivel, id, campo, mensagem) => problemas.push({
    nivel, tipo: 'animacao', id, campo, mensagem,
    onde: id ? `conjunto ${id}` : 'animações',
  });
  const erro = (id, campo, mensagem) => anotar('erro', id, campo, mensagem);
  const aviso = (id, campo, mensagem) => anotar('aviso', id, campo, mensagem);

  const conjuntos = mapa(lido.conjuntos);
  if (!Object.keys(conjuntos).length) {
    erro(null, null, 'Não existe nenhum conjunto de animação: todo mundo vai se mexer do jeito de fábrica.');
  }

  for (const [chave, cru] of Object.entries(conjuntos)) {
    const c = mapa(cru);
    const id = idLimpo(chave);
    if (!id) { erro(null, null, `"${chave}" não serve como id de conjunto: use letras, números e _.`); continue; }
    if (id !== chave) aviso(id, null, `O id "${chave}" tem caractere que o resto do jogo não cita bem; vale como "${id}".`);
    if (!texto(c.label).trim()) aviso(id, 'label', 'Este conjunto está sem nome: na lista ele vai aparecer só pelo id.');

    for (const estado of ESTADOS) {
      const nome = texto(mapa(c.estados)[estado.chave]);
      if (!nome) { aviso(id, estado.chave, `"${estado.rotulo}" está vazio: vai usar a animação de fábrica.`); continue; }
      const clipe = CLIPE_POR_NOME[nome];
      if (!clipe) { erro(id, estado.chave, `A animação "${nome}" não está no pacote: "${estado.rotulo}" vai usar a de fábrica.`); continue; }
      if (clipe.tipo !== EM_LOOP) {
        aviso(id, estado.chave, `"${clipe.rotulo}" não repete: em "${estado.rotulo}" ela toca uma vez e o personagem congela na última pose.`);
      }
    }

    for (const gesto of GESTOS) {
      const nome = texto(mapa(c.gestos)[gesto.chave]);
      if (!nome) { aviso(id, gesto.chave, `"${gesto.rotulo}" está vazio: vai usar a animação de fábrica.`); continue; }
      const clipe = CLIPE_POR_NOME[nome];
      if (!clipe) { erro(id, gesto.chave, `A animação "${nome}" não está no pacote: "${gesto.rotulo}" vai usar a de fábrica.`); continue; }
      if (clipe.tipo === EM_LOOP) {
        erro(id, gesto.chave, `"${clipe.rotulo}" repete pra sempre: em "${gesto.rotulo}" o personagem entra nela e nunca volta a andar.`);
      }
    }
  }

  const padrao = idLimpo(lido.padrao);
  if (padrao && !conjuntos[padrao] && !conjuntos[lido.padrao]) {
    erro(null, 'padrao', `O conjunto padrão "${lido.padrao}" não existe: todo mundo sem conjunto vai se mexer do jeito de fábrica.`);
  }

  const idsExistentes = new Set(Object.keys(conjuntos).map(idLimpo));
  for (const [id, quem] of usados) {
    if (!idsExistentes.has(idLimpo(id))) {
      erro(null, null, `${quem.join(', ')} usa o conjunto "${id}", que não existe. Crie ele ou escolha outro.`);
    }
  }
  for (const id of conferirUso ? idsExistentes : []) {
    if (id === padrao || id === ID_PADRAO) continue;
    if (![...usados.keys()].some(u => idLimpo(u) === id)) {
      aviso(id, null, 'Ninguém usa este conjunto: nenhum personagem aponta pra ele e nenhuma missão troca pra ele.');
    }
  }

  return problemas;
}

/** Só os erros — o que deixa alguém sem se mexer direito. */
export const errosDasAnimacoes = problemas => problemas.filter(p => p.nivel === 'erro');

/** O rascunho do editor serve? Precisa ter conjuntos com cara de conjunto. */
export function serveComoAnimacoes(lido) {
  if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return false;
  const conjuntos = lido.conjuntos;
  if (!conjuntos || typeof conjuntos !== 'object' || Array.isArray(conjuntos)) return false;
  return Object.values(conjuntos).some(c => c && typeof c === 'object' && (c.estados || c.gestos));
}
