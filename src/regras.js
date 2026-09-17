// Regras do mundo — os números que decidem como o jogo se comporta: quanto
// dura o dia, quão rápido o jogador anda, quão longe a câmera fica, quanto
// um soco tira. Ficavam num literal em data.js; agora são conteúdo, lido de
// src/data/regras.json e escrito na aba Regras do editor de conteúdo.
//
// Este módulo é puro de propósito (sem DOM, sem three, sem rede): o editor,
// os testes e o jogo usam exatamente as mesmas regras. Mesma divisão da
// rotina (src/rotina.js):
//   normalizarRegras — devolve o que o JOGO usa, com padrão e limite em tudo,
//                      pra nenhum número esquisito virar partida travada;
//   validarRegras    — olha o que o AUTOR escreveu e devolve problemas pra
//                      ele ler; não conserta nada.
// Um arquivo com problema ainda carrega: o jogo continua jogável e o editor
// mostra em vermelho o que precisa de conserto.
//
// O que NÃO está aqui, de propósito: GRID_SIZE, BLOCK_SIZE e ROAD_WIDTH.
// Não são regra do mundo — são resto do gerador procedural de cidade, e
// morrem no dia em que a cidade virar desenho no editor de mapa. Ver
// MALHA_DO_GERADOR lá embaixo.

const eNumero = v => typeof v === 'number' && Number.isFinite(v);

/** 3.2 -> "3,2": o autor lê vírgula, não ponto. */
export function num(v, casas = 2) {
  if (!eNumero(v)) return '?';
  const r = Math.round(v * 10 ** casas) / 10 ** casas;
  return String(r).replace('.', ',');
}

/** Medidas do Building Kit que as conferências usam como chão duro. */
export const MEDIDAS_DO_KIT = {
  ALTURA_PAREDE: 2.4,   // src/editor/construcao.js
  LARGURA_PORTA: 0.88,  // o vão mais estreito do kit
  COMODO: 8,            // um cômodo de 4 × 2 m de módulo, pra dar escala
};

/**
 * A malha da cidade sorteada. Fica em código porque não é regra do mundo:
 * é o parâmetro de um gerador que vai embora quando a cidade virar desenho.
 * normalizarRegras nunca emite essas chaves — arquivo publicado, merge ou
 * palpite escrito à mão não conseguem mexer nelas.
 */
export const MALHA_DO_GERADOR = { GRID_SIZE: 5, BLOCK_SIZE: 40, ROAD_WIDTH: 10 };

export const TEXTO_DA_MALHA = 'O tamanho da cidade não se escreve aqui: hoje ele é '
  + 'parâmetro do gerador que sorteia quarteirões. Quando a cidade virar desenho no '
  + 'editor de mapa — rua por rua, quarteirão por quarteirão — esses números deixam '
  + 'de existir em vez de virar campo.';

/** Assuntos da aba, na ordem em que aparecem. */
export const GRUPOS = [
  { id: 'dia', rotulo: 'O dia' },
  { id: 'corpo', rotulo: 'O corpo do jogador' },
  { id: 'camera', rotulo: 'A câmera' },
  { id: 'alcance', rotulo: 'Alcance' },
  { id: 'pulo', rotulo: 'Pulo e gravidade' },
  { id: 'briga', rotulo: 'Briga' },
];

const ROTULO_DE_GRUPO = Object.fromEntries(GRUPOS.map(g => [g.id, g.rotulo]));

const inteiro = v => Math.max(0, Math.floor(v));
const alturaDoPulo = r => (r.GRAVITY > 0 ? (r.JUMP_SPEED ** 2) / (2 * r.GRAVITY) : Infinity);

/**
 * A tabela que manda em tudo: o formulário da aba, as conferências e o teste
 * saem daqui. Campo novo no jogo entra nesta lista e aparece sozinho na aba
 * (tests/unit/regras.test.js cobra isso).
 *
 *   chave  — o nome no CONFIG          padrao — o valor de fábrica, o de hoje
 *   grupo  — em que cartão aparece     min/max — o que o jogo aguenta
 *   rotulo — como o autor lê           dica   — o que o número faz, em uma linha
 *   frase  — a consequência calculada, recontada a cada tecla
 */
export const ESQUEMA = [
  {
    chave: 'DAY_LENGTH_SECONDS', grupo: 'dia', rotulo: 'Duração do dia', unidade: 's',
    padrao: 480, min: 60, max: 7200,
    dica: 'Quanto tempo de relógio real dura um dia inteiro do jogo, da meia-noite à meia-noite.',
    frase: v => `O dia inteiro dura ${num(v / 60, 1)} min de relógio real. Um dia acordado quase zera a energia, e a fome só zera depois de 1 dia e meio.`,
  },
  {
    chave: 'PLAYER_SPEED_WALK', grupo: 'corpo', rotulo: 'Velocidade andando', unidade: 'm/s',
    padrao: 3.2, min: 0.5, max: 20,
    dica: 'A velocidade normal, sem segurar nada.',
    frase: v => `Atravessar um cômodo de ${num(MEDIDAS_DO_KIT.COMODO, 0)} m leva ${num(MEDIDAS_DO_KIT.COMODO / v, 1)} s.`,
  },
  {
    chave: 'PLAYER_SPEED_RUN', grupo: 'corpo', rotulo: 'Velocidade correndo', unidade: 'm/s',
    padrao: 6.5, min: 0.5, max: 20,
    dica: 'A velocidade segurando Shift.',
    frase: (v, r) => `Correndo, o jogador é ${num(v / r.PLAYER_SPEED_WALK, 1)}× mais rápido que andando.`,
  },
  {
    chave: 'PLAYER_SPEED_CROUCH', grupo: 'corpo', rotulo: 'Velocidade agachado', unidade: 'm/s',
    padrao: 1.8, min: 0.2, max: 20,
    dica: 'A velocidade agachado, segurando Ctrl.',
  },
  {
    chave: 'PLAYER_RADIUS', grupo: 'corpo', rotulo: 'Largura do corpo (raio)', unidade: 'm',
    padrao: 0.38, min: 0.2, max: 0.44,
    dica: 'Metade da largura do jogador. É o que decide em que vão ele passa.',
    frase: v => `O corpo fica com ${num(v * 2)} m de largura. A porta mais estreita do kit tem ${num(MEDIDAS_DO_KIT.LARGURA_PORTA)} m.`,
    erroAcima: v => `Um corpo de ${num(v * 2)} m de largura não passa na porta de ${num(MEDIDAS_DO_KIT.LARGURA_PORTA)} m do kit: o jogador não entra mais em casa nenhuma.`,
  },
  {
    chave: 'PLAYER_HEIGHT', grupo: 'corpo', rotulo: 'Altura do corpo', unidade: 'm',
    padrao: 1.7, min: 1.2, max: 2.3,
    dica: 'A altura usada na colisão — é ela que decide se ele cabe embaixo do teto.',
    frase: v => `Sobra ${num(MEDIDAS_DO_KIT.ALTURA_PAREDE - v)} m de folga embaixo do teto de ${num(MEDIDAS_DO_KIT.ALTURA_PAREDE)} m do kit.`,
    erroAcima: v => `Um corpo de ${num(v)} m não cabe embaixo do teto de ${num(MEDIDAS_DO_KIT.ALTURA_PAREDE)} m do kit: dentro de casa o jogador é empurrado pra baixo do chão.`,
  },
  {
    chave: 'CAM_DIST_OUTDOOR', grupo: 'camera', rotulo: 'Câmera na rua', unidade: 'm',
    padrao: 6.5, min: 2, max: 15,
    dica: 'Quanto a câmera fica atrás do jogador a céu aberto.',
  },
  {
    chave: 'CAM_DIST_INDOOR', grupo: 'camera', rotulo: 'Câmera dentro do prédio', unidade: 'm',
    padrao: 2.5, min: 0.5, max: 6,
    dica: 'A mesma distância, mas com teto em cima: 6,5 m não cabe num quarto.',
    frase: v => (v > 4 ? `${num(v)} m é mais que um cômodo de 4 m: a câmera vai atravessar a parede.` : `Cabe num cômodo de 4 m sem atravessar a parede.`),
  },
  {
    chave: 'CAM_DIST_LERP', grupo: 'camera', rotulo: 'Velocidade da troca de câmera', unidade: '',
    padrao: 4.5, min: 0.5, max: 20,
    dica: 'Quão rápido a câmera desliza entre a distância da rua e a de dentro. Quanto maior, mais seco.',
    frase: v => `A troca leva por volta de ${num(3 / v, 1)} s.`,
  },
  {
    chave: 'INTERACT_RADIUS', grupo: 'alcance', rotulo: 'Alcance pra falar e pegar', unidade: 'm',
    padrao: 3.2, min: 0.5, max: 12,
    dica: 'De que distância o E funciona, em NPC, porta e coisa largada no chão.',
    frase: v => `Fala a ${num(v)} m. A presença no compromisso conta um pouco mais longe, a ${num(v + 3)} m.`,
  },
  {
    chave: 'PHOTO_RADIUS', grupo: 'alcance', rotulo: 'Alcance da foto', unidade: 'm',
    padrao: 3.5, min: 0.5, max: 15,
    dica: 'De que distância dá pra fotografar um ponto de interesse.',
  },
  {
    chave: 'GRAVITY', grupo: 'pulo', rotulo: 'Gravidade', unidade: 'm/s²',
    padrao: 18, min: 1, max: 60,
    dica: 'O quanto puxa pra baixo. A Terra tem 9,8 — jogo de plataforma costuma usar mais.',
    frase: (v, r) => `Com essa gravidade o pulo sobe ${num(alturaDoPulo({ ...r, GRAVITY: v }))} m.`,
  },
  {
    chave: 'JUMP_SPEED', grupo: 'pulo', rotulo: 'Impulso do pulo', unidade: 'm/s',
    padrao: 6.5, min: 0, max: 20,
    dica: 'A velocidade pra cima no instante do pulo. 0 tira o pulo do jogo.',
    frase: (v, r) => `O pulo sobe ${num(alturaDoPulo({ ...r, JUMP_SPEED: v }))} m — a parede do kit tem ${num(MEDIDAS_DO_KIT.ALTURA_PAREDE)} m.`,
  },
  {
    chave: 'PUNCH_RANGE', grupo: 'briga', rotulo: 'Alcance do soco', unidade: 'm',
    padrao: 1.8, min: 0.5, max: 6,
    dica: 'De que distância o soco acerta.',
  },
  {
    chave: 'PUNCH_DAMAGE', grupo: 'briga', rotulo: 'Dano do soco', unidade: '',
    padrao: 12, min: 1, max: 999,
    dica: 'Quanto o primeiro soco tira.',
    frase: (v, r) => `Derrubar o boneco de treino leva ${inteiro(Math.ceil(r.DUMMY_MAX_HP / v))} socos.`,
  },
  {
    chave: 'PUNCH_COMBO_DAMAGE', grupo: 'briga', rotulo: 'Dano do segundo soco', unidade: '',
    padrao: 18, min: 1, max: 999,
    dica: 'Quanto o soco do combo tira, quando sai dentro da janela.',
    frase: (v, r) => `Soco + combo tiram ${num(r.PUNCH_DAMAGE + v, 0)} de uma vez.`,
  },
  {
    chave: 'PUNCH_COMBO_WINDOW', grupo: 'briga', rotulo: 'Janela do combo', unidade: 's',
    padrao: 0.4, min: 0.05, max: 3,
    dica: 'Quanto tempo depois do primeiro soco o segundo ainda conta como combo.',
  },
  {
    chave: 'PLAYER_MAX_STAMINA', grupo: 'briga', rotulo: 'Estamina máxima', unidade: '',
    padrao: 100, min: 10, max: 999,
    dica: 'O tamanho da barra amarela.',
    frase: (v, r) => `Dá pra dar ${inteiro(v / r.PUNCH_STAMINA_COST)} socos seguidos sem esperar.`,
  },
  {
    chave: 'PUNCH_STAMINA_COST', grupo: 'briga', rotulo: 'Estamina por soco', unidade: '',
    padrao: 15, min: 0, max: 999,
    dica: 'Quanto cada soco gasta. Também é o ponto em que a barra fica amarela.',
    frase: (v, r) => (v > 0 ? `Dá pra dar ${inteiro(r.PLAYER_MAX_STAMINA / v)} socos seguidos.` : 'Socar não gasta estamina.'),
  },
  {
    chave: 'DODGE_STAMINA_COST', grupo: 'briga', rotulo: 'Estamina por esquiva', unidade: '',
    padrao: 30, min: 0, max: 999,
    dica: 'Quanto cada esquiva gasta.',
    frase: (v, r) => (v > 0 ? `Dá pra esquivar ${inteiro(r.PLAYER_MAX_STAMINA / v)} vezes seguidas.` : 'Esquivar não gasta estamina.'),
  },
  {
    chave: 'STAMINA_REGEN_RATE', grupo: 'briga', rotulo: 'Estamina que volta por segundo', unidade: '/s',
    padrao: 25, min: 0, max: 500,
    dica: 'Quanto a barra amarela recupera a cada segundo parado de brigar.',
    frase: (v, r) => (v > 0 ? `A barra cheia volta em ${num(r.PLAYER_MAX_STAMINA / v, 1)} s.` : 'A estamina não volta sozinha nunca.'),
  },
  {
    chave: 'PLAYER_MAX_HP', grupo: 'briga', rotulo: 'Vida máxima do jogador', unidade: '',
    padrao: 100, min: 1, max: 999,
    dica: 'O tamanho da barra vermelha.',
    frase: (v, r) => `Aguenta ${inteiro(v / Math.max(1, r.DUMMY_COUNTER_DAMAGE))} contra-ataques do boneco antes de cair.`,
  },
  {
    chave: 'PLAYER_KO_RECOVER_DELAY', grupo: 'briga', rotulo: 'Tempo caído até levantar', unidade: 's',
    padrao: 2, min: 0, max: 30,
    dica: 'Quanto tempo o jogador fica no chão depois de ser nocauteado.',
  },
  {
    chave: 'DUMMY_MAX_HP', grupo: 'briga', rotulo: 'Vida do boneco de treino', unidade: '',
    padrao: 100, min: 1, max: 999,
    dica: 'Quanto o boneco aguenta antes de cair.',
    frase: (v, r) => `Leva ${inteiro(Math.ceil(v / r.PUNCH_DAMAGE))} socos pra derrubar.`,
  },
  {
    chave: 'DUMMY_RESPAWN_DELAY', grupo: 'briga', rotulo: 'Tempo até o boneco voltar', unidade: 's',
    padrao: 1.4, min: 0, max: 60,
    dica: 'Quanto tempo depois de cair o boneco fica de pé de novo.',
  },
  {
    chave: 'DUMMY_COUNTER_CHANCE', grupo: 'briga', rotulo: 'Chance de contra-ataque', unidade: '0 a 1',
    padrao: 0.3, min: 0, max: 1,
    dica: 'Com que frequência o boneco revida em vez de só apanhar.',
    frase: v => `A cada 10 socos, o boneco revida umas ${num(v * 10, 0)} vezes.`,
  },
  {
    chave: 'DUMMY_COUNTER_DAMAGE', grupo: 'briga', rotulo: 'Dano do contra-ataque', unidade: '',
    padrao: 8, min: 0, max: 999,
    dica: 'Quanto o revide do boneco tira do jogador.',
    frase: (v, r) => (v > 0 ? `O jogador aguenta ${inteiro(r.PLAYER_MAX_HP / v)} desses.` : 'O revide não machuca.'),
  },
  {
    chave: 'COUNTER_TELEGRAPH_DURATION', grupo: 'briga', rotulo: 'Aviso antes do contra-ataque', unidade: 's',
    padrao: 0.8, min: 0.1, max: 5,
    dica: 'O tempo que o jogador tem pra apertar a esquiva depois do boneco avisar.',
    frase: v => `${num(v)} s pra reagir.`,
  },
];

export const CAMPO_POR_CHAVE = Object.fromEntries(ESQUEMA.map(c => [c.chave, c]));
export const PADROES = Object.fromEntries(ESQUEMA.map(c => [c.chave, c.padrao]));

/** Onde o problema mora, pro autor achar o campo: "Briga › Dano do soco". */
export function ondeFica(chave) {
  const campo = CAMPO_POR_CHAVE[chave];
  return campo ? `${ROTULO_DE_GRUPO[campo.grupo] ?? campo.grupo} › ${campo.rotulo}` : `regra ${chave}`;
}

/** A frase de consequência de um campo, já com os outros valores em volta. */
export function fraseDoCampo(chave, valor, regras) {
  const campo = CAMPO_POR_CHAVE[chave];
  if (!campo?.frase) return '';
  const completas = { ...PADROES, ...normalizarRegras(regras), [chave]: valor };
  try {
    return campo.frase(valor, completas);
  } catch {
    return '';
  }
}

/**
 * O que o JOGO usa. Lista branca: só sai daqui chave do ESQUEMA, cada uma
 * presa na faixa. Chave desconhecida — inclusive as três da malha — some.
 */
export function normalizarRegras(bruto) {
  const lido = bruto && typeof bruto === 'object' ? bruto : {};
  const saida = {};
  for (const campo of ESQUEMA) {
    const v = lido[campo.chave];
    saida[campo.chave] = eNumero(v) ? Math.min(campo.max, Math.max(campo.min, v)) : campo.padrao;
  }
  return saida;
}

/** Distância de edição curta, só pra sugerir o nome certo num erro de digitação. */
function distancia(a, b) {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length];
}

function parecidaCom(chave) {
  let melhor = null;
  let menor = Infinity;
  for (const conhecida of Object.keys(CAMPO_POR_CHAVE)) {
    const d = distancia(chave.toUpperCase(), conhecida);
    if (d < menor) { menor = d; melhor = conhecida; }
  }
  return menor <= 3 ? melhor : null;
}

/**
 * O que o AUTOR lê. Devolve [{nivel, tipo, campo, mensagem, onde}] — mesmo
 * formato dos problemas da rotina, pro painel do editor desenhar igual.
 * Erro = o jogo fica impossível de jogar como está escrito.
 * Aviso = continua jogável, mas provavelmente não é o que você quis.
 */
export function validarRegras(bruto) {
  const lido = bruto && typeof bruto === 'object' ? bruto : {};
  const r = normalizarRegras(lido);
  const problemas = [];
  const anotar = (nivel, campo, mensagem) => problemas.push({
    nivel, tipo: 'regra', campo, mensagem, onde: ondeFica(campo),
  });
  const erro = (campo, mensagem) => anotar('erro', campo, mensagem);
  const aviso = (campo, mensagem) => anotar('aviso', campo, mensagem);

  // 1. O que está escrito no arquivo faz sentido como número?
  for (const chave of Object.keys(lido)) {
    if (CAMPO_POR_CHAVE[chave]) continue;
    if (chave in MALHA_DO_GERADOR) {
      erro(chave, `"${chave}" não é uma regra do mundo e o valor escrito aqui vai ser ignorado. ${TEXTO_DA_MALHA}`);
    } else {
      const palpite = parecidaCom(chave);
      erro(chave, `A regra "${chave}" não existe no jogo e vai ser ignorada.${palpite ? ` Confira o nome — talvez você quisesse ${palpite}.` : ''}`);
    }
  }

  for (const campo of ESQUEMA) {
    const v = lido[campo.chave];
    if (v === undefined) continue;
    if (!eNumero(v)) {
      aviso(campo.chave, `"${campo.rotulo}" não está com um número escrito: o jogo vai usar o valor de fábrica, ${num(campo.padrao)}.`);
      continue;
    }
    if (v > campo.max) {
      if (campo.erroAcima) erro(campo.chave, campo.erroAcima(v));
      else aviso(campo.chave, `"${campo.rotulo}" está em ${num(v)}, fora do limite (${num(campo.min)} a ${num(campo.max)}): o jogo vai usar ${num(campo.max)}.`);
    } else if (v < campo.min) {
      aviso(campo.chave, `"${campo.rotulo}" está em ${num(v)}, fora do limite (${num(campo.min)} a ${num(campo.max)}): o jogo vai usar ${num(campo.min)}.`);
    }
  }

  // 2. Cada número cabe sozinho. Agora: eles combinam entre si?
  if (r.PUNCH_STAMINA_COST > r.PLAYER_MAX_STAMINA) {
    erro('PUNCH_STAMINA_COST', `Socar custa ${num(r.PUNCH_STAMINA_COST, 0)} de estamina, mas o máximo é ${num(r.PLAYER_MAX_STAMINA, 0)}: o jogador nunca consegue socar.`);
  }
  if (r.DODGE_STAMINA_COST > r.PLAYER_MAX_STAMINA) {
    erro('DODGE_STAMINA_COST', `Esquivar custa ${num(r.DODGE_STAMINA_COST, 0)} de estamina, mas o máximo é ${num(r.PLAYER_MAX_STAMINA, 0)}: o jogador nunca consegue esquivar.`);
  }
  if (r.DUMMY_COUNTER_DAMAGE >= r.PLAYER_MAX_HP) {
    erro('DUMMY_COUNTER_DAMAGE', `Um contra-ataque do boneco tira ${num(r.DUMMY_COUNTER_DAMAGE, 0)} e o jogador tem ${num(r.PLAYER_MAX_HP, 0)} de vida: ele cai no primeiro golpe.`);
  }
  if (r.PLAYER_SPEED_RUN <= r.PLAYER_SPEED_WALK) {
    aviso('PLAYER_SPEED_RUN', `Correr (${num(r.PLAYER_SPEED_RUN)} m/s) não é mais rápido que andar (${num(r.PLAYER_SPEED_WALK)} m/s): segurar Shift não muda nada.`);
  }
  if (r.PLAYER_SPEED_CROUCH > r.PLAYER_SPEED_WALK) {
    aviso('PLAYER_SPEED_CROUCH', `Agachado (${num(r.PLAYER_SPEED_CROUCH)} m/s) anda mais rápido que em pé (${num(r.PLAYER_SPEED_WALK)} m/s).`);
  }
  if (r.CAM_DIST_INDOOR > r.CAM_DIST_OUTDOOR) {
    aviso('CAM_DIST_INDOOR', `A câmera fica mais longe dentro de casa (${num(r.CAM_DIST_INDOOR)} m) do que na rua (${num(r.CAM_DIST_OUTDOOR)} m): dentro do quarto ela atravessa a parede.`);
  }
  if (r.PUNCH_COMBO_DAMAGE <= r.PUNCH_DAMAGE) {
    aviso('PUNCH_COMBO_DAMAGE', `O segundo soco do combo tira ${num(r.PUNCH_COMBO_DAMAGE, 0)} e o primeiro tira ${num(r.PUNCH_DAMAGE, 0)}: encadear soco vira desvantagem.`);
  }
  if (r.STAMINA_REGEN_RATE === 0 && r.PUNCH_STAMINA_COST > 0) {
    aviso('STAMINA_REGEN_RATE', `A estamina não volta sozinha: depois de ${inteiro(r.PLAYER_MAX_STAMINA / r.PUNCH_STAMINA_COST)} socos o jogador não soca mais pelo resto da partida.`);
  }
  if (r.COUNTER_TELEGRAPH_DURATION < 0.25) {
    aviso('COUNTER_TELEGRAPH_DURATION', `O aviso do contra-ataque dura ${num(r.COUNTER_TELEGRAPH_DURATION)} s: não dá tempo humano de apertar a esquiva.`);
  }
  if (r.DAY_LENGTH_SECONDS < 120) {
    aviso('DAY_LENGTH_SECONDS', `Com ${num(r.DAY_LENGTH_SECONDS, 0)} s o dia inteiro passa em ${num(r.DAY_LENGTH_SECONDS / 60, 1)} min: dá pra chegar no trabalho, mas não pra viver o dia.`);
  }
  if (r.INTERACT_RADIUS < 1) {
    aviso('INTERACT_RADIUS', `Com ${num(r.INTERACT_RADIUS)} m o jogador precisa encostar no NPC pra conversar, e registrar presença no compromisso fica difícil.`);
  }
  const altura = alturaDoPulo(r);
  if (altura > MEDIDAS_DO_KIT.ALTURA_PAREDE) {
    aviso('JUMP_SPEED', `Esse pulo sobe ${num(altura)} m: o jogador passa por cima das paredes de ${num(MEDIDAS_DO_KIT.ALTURA_PAREDE)} m do kit.`);
  }
  if (r.GRAVITY < 5) {
    aviso('GRAVITY', `Com gravidade ${num(r.GRAVITY)} o jogador desce flutuando: um pulo leva ${num((2 * r.JUMP_SPEED) / r.GRAVITY, 1)} s pra terminar.`);
  }

  return problemas;
}

/** Só os erros — o que impede o jogo de rodar como escrito. */
export const errosDasRegras = problemas => problemas.filter(p => p.nivel === 'erro');

/**
 * O rascunho do editor serve como regras? Basta ser um objeto com pelo menos
 * uma chave conhecida; qualquer número esquisito lá dentro o normalizar
 * conserta, e o autor vê o aviso. Se não servir, o jogo usa o publicado.
 */
export function serveComoRegras(lido) {
  if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return false;
  return Object.keys(lido).some(chave => chave in CAMPO_POR_CHAVE);
}
