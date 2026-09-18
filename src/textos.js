// A voz do jogo: o que ele fala com quem está jogando. Dicas do tutorial,
// dicas da tela de carregamento, a conversa que abre a partida, os recados
// que aparecem quando o jogador age, o estado do compromisso no HUD e o que
// cada painel diz quando está vazio.
//
// Ficava tudo escrito em código, espalhado por phone.js, ui.js, main.js,
// schedule.js e data.js. Agora é conteúdo: src/data/textos.json, escrito na
// aba Textos do editor. Módulo puro, como regras.js e animacoes.js — o jogo,
// o editor e os testes leem as mesmas regras.
//
// O que NÃO está aqui, de propósito: nome do jogo, créditos e a tela de
// criação de personagem (o problema deles é duplicação, não autoria — o nome
// está copiado em cinco lugares e duas telas precisam montá-lo); o
// vocabulário dos painéis ("Proximidade", "Tudo"), que mora também dentro do
// index.html e só se move inteiro; e as mensagens de save, que relatam o
// estado de um arquivo em vez de contar história.

import { applyPronouns } from './phone.js';

const texto = (v, padrao = '') => (typeof v === 'string' ? v : padrao);
const mapa = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const lista = v => (Array.isArray(v) ? v : null);

/** Assuntos da aba, na ordem em que aparecem — por ONDE o jogador lê. */
export const GRUPOS = [
  { id: 'primeiros_minutos', rotulo: 'Os primeiros minutos' },
  { id: 'carregamento', rotulo: 'A tela de carregamento' },
  { id: 'acao', rotulo: 'O que o jogo fala quando você age' },
  { id: 'compromisso', rotulo: 'O compromisso do dia' },
  { id: 'vazio', rotulo: 'Quando o painel está vazio' },
];

/**
 * Os acontecimentos que o JOGO sabe avisar. O id de um passo do tutorial tem
 * que ser um destes: id digitado à mão vira passo que ninguém cumpre, e o
 * tutorial trava ali pra sempre sem o jogo quebrar — ninguém descobriria
 * testando. Por isso na aba isso é uma lista, não um campo de texto.
 */
export const ACONTECIMENTOS = [
  { id: 'moveu', rotulo: 'O jogador andou', onde: 'primeiro WASD da partida' },
  { id: 'olhou', rotulo: 'O jogador olhou em volta', onde: 'primeiro movimento de mouse' },
  { id: 'interagiu', rotulo: 'O jogador mexeu em alguma coisa', onde: 'porta ou móvel do apartamento' },
  { id: 'leu_mensagem', rotulo: 'O jogador leu uma mensagem no celular', onde: 'precisa de mensagem na conversa de abertura' },
  { id: 'saiu_do_apartamento', rotulo: 'O jogador abriu a porta do apartamento', onde: 'porta ap101' },
  { id: 'desceu_a_escada', rotulo: 'O jogador desceu a escada', onde: 'escada do corredor' },
  { id: 'saiu_do_predio', rotulo: 'O jogador saiu do prédio', onde: 'portão da entrada' },
];

export const ID_DE_ACONTECIMENTO = new Set(ACONTECIMENTOS.map(a => a.id));

/**
 * Onde o jogo aperta. Medido no navegador, não chutado: nada corta em lugar
 * nenhum — o texto comprido quebra linha e empurra a caixa —, então passar
 * do limite é AVISO, e o aviso diz o que acontece na tela.
 */
export const CAIXAS = {
  prompt: { caracteres: 75, oQueAcontece: 'numa tela de 1280 o recado passa da largura confortável' },
  // 16 caracteres cabem numa linha da caixa de 121 px — mas o texto de
  // fábrica "Agora — vá até lá!" já tem 18 e quebra em duas, e sempre foi
  // assim. Então o aviso é da TERCEIRA linha em diante, que é quando a caixa
  // começa a empurrar o resto do HUD pra baixo.
  hud: { caracteres: 32, oQueAcontece: 'a caixa do HUD tem 121 px e cabem 16 caracteres por linha: passa de duas linhas e empurra o resto pra baixo' },
  dica: { caracteres: 145, oQueAcontece: 'a caixa da tela de carregamento tem 371 px e cabem 3 linhas' },
};

/**
 * Os recados de chave fixa. O autor reescreve o texto; a chave é do código.
 *
 *   chave    — o id que o código pede                buracos — o que dá pra citar
 *   grupo    — em que seção da aba aparece           tecla   — a ação que o código
 *   rotulo   — como o autor lê                                 põe NA FRENTE (e que
 *   padrao   — o texto de hoje, verbatim                       por isso não se escreve)
 *   onde     — em que momento aparece na tela        caixa   — qual limite medido vale
 *   marcacao — é desenhado como HTML (sinal de < quebra o painel)
 */
export const ESQUEMA = [
  // --- O que o jogo fala quando você age -----------------------------------
  {
    chave: 'prompt.porta.abrir', grupo: 'acao', rotulo: 'Na porta fechada',
    padrao: 'Abrir: {porta}', buracos: ['porta'], tecla: 'interact', caixa: 'prompt',
    onde: 'Encostado numa porta fechada.', exemplo: { porta: 'Apartamento 101' },
  },
  {
    chave: 'prompt.porta.fechar', grupo: 'acao', rotulo: 'Na porta aberta',
    padrao: 'Fechar: {porta}', buracos: ['porta'], tecla: 'interact', caixa: 'prompt',
    onde: 'Encostado numa porta aberta.', exemplo: { porta: 'Apartamento 101' },
  },
  {
    chave: 'prompt.porta.trancada', grupo: 'acao', rotulo: 'Na porta trancada',
    padrao: '{porta} — trancada', buracos: ['porta'], tecla: null, caixa: 'prompt',
    onde: 'Encostado numa porta que não abre. Este é o único recado sem tecla na frente.',
    exemplo: { porta: 'Apartamento 102' },
  },
  {
    chave: 'prompt.objeto', grupo: 'acao', rotulo: 'Perto de um móvel',
    padrao: '{objeto}', buracos: ['objeto'], tecla: 'interact', caixa: 'prompt',
    onde: 'Perto de uma peça com texto escrito no editor de mapa.', exemplo: { objeto: 'A cômoda' },
  },
  {
    chave: 'prompt.npc', grupo: 'acao', rotulo: 'Perto de uma pessoa',
    padrao: 'Falar com {pessoa}', buracos: ['pessoa'], tecla: 'interact', caixa: 'prompt',
    onde: 'Perto de um NPC.', exemplo: { pessoa: 'Seu Ivo' },
  },
  {
    chave: 'prompt.item', grupo: 'acao', rotulo: 'Perto de uma coisa no chão',
    padrao: 'Pegar {item}', buracos: ['item'], tecla: 'interact', caixa: 'prompt',
    onde: 'Perto de um item largado no mapa.', exemplo: { item: 'um café' },
  },
  {
    chave: 'prompt.dormir', grupo: 'acao', rotulo: 'Na cama',
    padrao: 'Dormir (recuperar energia e avançar o dia)', buracos: [], tecla: 'interact', caixa: 'prompt',
    onde: 'No ponto de dormir da casa.', exemplo: {},
  },
  {
    chave: 'prompt.boneco', grupo: 'acao', rotulo: 'Perto do boneco de treino',
    padrao: 'Socar o boneco de treino', buracos: [], tecla: 'attack', caixa: 'prompt',
    onde: 'Perto do boneco de treino.', exemplo: {},
  },
  {
    chave: 'prompt.foto', grupo: 'acao', rotulo: 'Perto de um fragmento',
    padrao: 'Fotografar este instante', buracos: [], tecla: 'photo', caixa: 'prompt',
    onde: 'Perto de um fragmento de memória.', exemplo: {},
  },
  {
    chave: 'prompt.esquiva', grupo: 'acao', rotulo: 'Quando o boneco vai revidar',
    padrao: 'Esquivar do contra-ataque!', buracos: [], tecla: 'dodge', caixa: 'prompt',
    onde: 'Durante o aviso de contra-ataque. Aparece piscando, em laranja.', exemplo: {},
  },
  {
    chave: 'toast.item.pegou', grupo: 'acao', rotulo: 'Pegou uma coisa',
    padrao: 'Você pegou: {item}', buracos: ['item'], tecla: null, caixa: null,
    onde: 'Logo depois de pegar algo do chão.', exemplo: { item: 'um café' },
  },
  {
    chave: 'toast.item.usou', grupo: 'acao', rotulo: 'Usou um item',
    padrao: 'Usou: {item}', buracos: ['item'], tecla: null, caixa: null,
    onde: 'Ao usar um item pelo menu.', exemplo: { item: 'Café' },
  },
  {
    chave: 'toast.item.descartou', grupo: 'acao', rotulo: 'Descartou um item',
    padrao: 'Descartou: {item}', buracos: ['item'], tecla: null, caixa: null,
    onde: 'Ao descartar um item pelo menu.', exemplo: { item: 'Café' },
  },
  {
    chave: 'toast.fragmento', grupo: 'acao', rotulo: 'Fotografou um fragmento',
    padrao: 'Fragmento capturado.', buracos: [], tecla: null, caixa: null,
    onde: 'Logo depois da foto.', exemplo: {},
  },
  {
    chave: 'toast.diario', grupo: 'acao', rotulo: 'O diário mudou',
    padrao: 'Diário atualizado', buracos: [], tecla: null, caixa: null,
    onde: 'Quando alguma coisa entra no diário.', exemplo: {},
  },
  {
    chave: 'toast.mensagem', grupo: 'acao', rotulo: 'Chegou mensagem no celular',
    padrao: 'Nova mensagem — {contato}', buracos: ['contato'], tecla: null, caixa: null,
    onde: 'Quando uma mensagem chega e o celular está fechado.', exemplo: { contato: 'Mãe' },
  },
  {
    chave: 'alvo.nome', grupo: 'acao', rotulo: 'Nome do boneco de treino',
    padrao: 'Boneco de Treino', buracos: [], tecla: null, caixa: null,
    onde: 'Em cima da barra de vida do alvo, durante a briga.', exemplo: {},
  },

  // --- O compromisso do dia -------------------------------------------------
  {
    chave: 'compromisso.comeca', grupo: 'compromisso', rotulo: 'Antes da hora',
    padrao: 'Começa às {hora}', buracos: ['hora'], tecla: null, caixa: 'hud',
    onde: 'Caixa do compromisso no HUD, antes de abrir.', exemplo: { hora: '08:00' },
  },
  {
    chave: 'compromisso.agora', grupo: 'compromisso', rotulo: 'Dentro do horário',
    padrao: 'Agora — vá até lá!', buracos: [], tecla: null, caixa: 'hud',
    onde: 'Caixa do compromisso no HUD, com a janela aberta.', exemplo: {},
  },
  {
    chave: 'compromisso.cumprido', grupo: 'compromisso', rotulo: 'Já cumpriu hoje',
    padrao: 'Cumprido hoje', buracos: [], tecla: null, caixa: 'hud',
    onde: 'Caixa do compromisso no HUD, depois de marcar presença.', exemplo: {},
  },
  {
    chave: 'compromisso.faltou', grupo: 'compromisso', rotulo: 'Perdeu a janela',
    padrao: 'Faltou hoje', buracos: [], tecla: null, caixa: 'hud',
    onde: 'Caixa do compromisso no HUD, depois do horário.', exemplo: {},
  },
  {
    chave: 'compromisso.dispensado', grupo: 'compromisso', rotulo: 'Perdeu a vaga',
    padrao: 'Dispensado(a)', buracos: [], tecla: null, caixa: 'hud',
    onde: 'Caixa do compromisso no HUD, depois de faltar demais.', exemplo: {},
  },
  {
    chave: 'compromisso.comecou', grupo: 'compromisso', rotulo: 'Aviso de que abriu',
    padrao: 'Começou agora: {compromisso}. Vai até {hora}.', buracos: ['compromisso', 'hora'],
    tecla: null, caixa: null,
    onde: 'Recado na hora em que a janela abre.', exemplo: { compromisso: 'Turno no Mercado', hora: '14:00' },
  },
  {
    chave: 'compromisso.fechando', grupo: 'compromisso', rotulo: 'Aviso de que está fechando',
    padrao: 'Falta {minutos} min pra fechar: {compromisso}.', buracos: ['minutos', 'compromisso'],
    tecla: null, caixa: null,
    onde: 'Recado pouco antes de a janela fechar.', exemplo: { minutos: 30, compromisso: 'Turno no Mercado' },
  },
  {
    chave: 'compromisso.cumpriu_pago', grupo: 'compromisso', rotulo: 'Cumpriu e recebeu',
    padrao: 'Você cumpriu: {compromisso}. Ganhou R${dinheiro}.', buracos: ['compromisso', 'dinheiro'],
    tecla: null, caixa: null,
    onde: 'Na virada do dia, quando o compromisso paga.', exemplo: { compromisso: 'Turno no Mercado', dinheiro: 40 },
  },
  {
    chave: 'compromisso.cumpriu', grupo: 'compromisso', rotulo: 'Cumpriu, sem pagamento',
    padrao: 'Você cumpriu: {compromisso}.', buracos: ['compromisso'], tecla: null, caixa: null,
    onde: 'Na virada do dia, quando o compromisso não paga.', exemplo: { compromisso: 'Aula de Engenharia' },
  },
  {
    chave: 'compromisso.faltou_dia', grupo: 'compromisso', rotulo: 'Faltou (primeiras vezes)',
    padrao: 'Você faltou: {compromisso}.', buracos: ['compromisso'], tecla: null, caixa: null,
    onde: 'Na virada do dia. O aviso da penúltima falta e a despedida ao perder a vaga são de cada compromisso, e ficam na aba Rotina.',
    exemplo: { compromisso: 'Turno no Mercado' },
  },

  // --- Quando o painel está vazio -------------------------------------------
  {
    chave: 'vazio.hud.missao_ativa', grupo: 'vazio', rotulo: 'Etiqueta da missão no HUD',
    padrao: 'MISSÃO ATIVA', buracos: [], tecla: null, caixa: null, marcacao: true,
    onde: 'Em cima do objetivo, no canto da tela.', exemplo: {},
  },
  {
    chave: 'vazio.hud.sem_missao', grupo: 'vazio', rotulo: 'Sem missão no HUD',
    padrao: 'SEM MISSÕES ATIVAS', buracos: [], tecla: null, caixa: null, marcacao: true,
    onde: 'Mesma caixa, quando não há objetivo nenhum.', exemplo: {},
  },
  {
    chave: 'vazio.missoes', grupo: 'vazio', rotulo: 'Diário › Missões vazio',
    padrao: 'Nenhuma missão iniciada ainda.', buracos: [], tecla: null, caixa: null, marcacao: true,
    onde: 'Aba Missões do diário, antes da primeira missão.', exemplo: {},
  },
  {
    chave: 'vazio.itens', grupo: 'vazio', rotulo: 'Mochila vazia',
    padrao: 'Nenhum item guardado ainda.', buracos: [], tecla: null, caixa: null, marcacao: true,
    onde: 'Menu de itens, sem nada no bolso.', exemplo: {},
  },
  {
    chave: 'vazio.pessoas', grupo: 'vazio', rotulo: 'Diário › Pessoas vazio',
    padrao: 'Você ainda não conversou com ninguém.', buracos: [], tecla: null, caixa: null, marcacao: true,
    onde: 'Aba Pessoas do diário, antes da primeira conversa.', exemplo: {},
  },
  {
    chave: 'vazio.pessoas_log', grupo: 'vazio', rotulo: 'Ficha de pessoa sem histórico',
    padrao: 'Nada anotado ainda.', buracos: [], tecla: null, caixa: null, marcacao: true,
    onde: 'Dentro da ficha de alguém, sem nenhuma anotação.', exemplo: {},
  },
  {
    chave: 'vazio.celular', grupo: 'vazio', rotulo: 'Conversa vazia no celular',
    padrao: 'Nenhuma mensagem ainda.', buracos: [], tecla: null, caixa: null, marcacao: true,
    onde: 'Celular, numa conversa sem mensagem.', exemplo: {},
  },
];

export const CAMPO_POR_CHAVE = Object.fromEntries(ESQUEMA.map(c => [c.chave, c]));
export const PADROES = Object.fromEntries(ESQUEMA.map(c => [c.chave, c.padrao]));

/** O tutorial de fábrica: o mesmo de hoje, com {tecla} no lugar da função. */
export const TUTORIAL_PADRAO = [
  { id: 'moveu', acao: '', texto: 'W A S D para andar pelo apartamento.' },
  { id: 'olhou', acao: '', texto: 'Mova o mouse para olhar em volta.' },
  { id: 'interagiu', acao: 'interact', texto: '{tecla} perto de alguma coisa para dar uma olhada nela.' },
  { id: 'leu_mensagem', acao: 'phone', texto: '{tecla} abre o celular.' },
  { id: 'saiu_do_apartamento', acao: 'interact', texto: '{tecla} na porta para sair do apartamento.' },
  { id: 'desceu_a_escada', acao: '', texto: 'A escada fica no fim do corredor. Desça até o térreo.' },
  { id: 'saiu_do_predio', acao: 'interact', texto: '{tecla} no portão para sair do prédio.' },
];

export const DICAS_PADRAO = [
  'Faltar ao compromisso do dia tem consequência: primeiro vem o aviso, depois a demissão ou a expulsão do curso.',
  'Dormir em casa recupera a energia toda e avança para a manhã seguinte.',
  'Fragmentos de memória brilham em dourado. Chegue perto e pressione a tecla de foto.',
  'Ficar exausto deixa você mais lento e sem poder correr. Um café resolve por um tempo.',
  'Alguns NPCs só têm certas conversas depois que a noite cai.',
  'A bússola no topo mostra sua casa e o compromisso do dia; os pontos dourados são fragmentos.',
  'O peso e o valor dos itens são só informação — não existe limite de carga.',
  'O jogo salva sozinho a cada 20 segundos e quando você pausa.',
];

export const ABERTURA_PADRAO = {
  contato: 'Mãe',
  mensagens: [
    // O possessivo entra dentro da variação ("meu filho" / "minha filha"), e
    // não fora dela: senão a versão feminina sai como "meu filha".
    { id: 'pais_1', espera: 14, texto: 'Oi, {{m:meu filho|f:minha filha|x:meu bem}}. Chegou bem? Estava esperando notícia.' },
    { id: 'pais_2', espera: 4.5, texto: 'Come alguma coisa direito hoje, viu. Café puro não é almoço.' },
    { id: 'pais_3', espera: 5, texto: 'Qualquer coisa você liga, a hora que for. Um beijo, {{m:querido|f:querida|x:amor}}.' },
  ],
};

const MAX_PASSOS = 20;
const MAX_DICAS = 40;
const MAX_MENSAGENS = 20;
const MAX_ESPERA = 120;

/** Os buracos escritos num molde, na ordem. */
export const buracosDe = molde => [...String(molde ?? '').matchAll(/\{(\w+)\}/g)].map(m => m[1]);

/**
 * Troca os buracos pelos valores. Buraco que ninguém sabe preencher fica
 * LITERAL de propósito: o autor vê "{pessoa}" na tela, com as chaves e tudo,
 * em vez de um buraco silencioso no meio da frase.
 */
export function preencher(molde, valores = {}, { sexo } = {}) {
  const comPronome = applyPronouns(molde, sexo);
  return comPronome.replace(/\{(\w+)\}/g, (inteiro, nome) => (
    Object.prototype.hasOwnProperty.call(valores, nome) && valores[nome] !== undefined
      ? String(valores[nome])
      : inteiro
  ));
}

/** O que o JOGO usa: t('toast.item.pegou', { item: 'um café' }). */
export function criarTexto(textos, { sexo } = {}) {
  const prontos = textos?.recados ? textos : normalizarTextos(textos);
  return (chave, valores = {}) => preencher(
    prontos.recados[chave] ?? PADROES[chave] ?? '',
    valores,
    { sexo },
  );
}

function normalizarPasso(bruto, indice) {
  const p = mapa(bruto);
  const id = texto(p.id);
  if (!ID_DE_ACONTECIMENTO.has(id)) return null;   // passo que ninguém cumpre não entra
  const padrao = TUTORIAL_PADRAO.find(x => x.id === id);
  return {
    id,
    acao: texto(p.acao, padrao?.acao ?? ''),
    texto: texto(p.texto).trim() || padrao?.texto || '',
    ordem: indice,
  };
}

/**
 * O que o JOGO usa. Tudo com padrão de fábrica no lugar do que faltar: nada
 * do que o autor esquecer vira tela vazia.
 */
export function normalizarTextos(bruto) {
  const lido = mapa(bruto);

  const recados = {};
  const crus = mapa(lido.recados);
  for (const campo of ESQUEMA) {
    const v = texto(crus[campo.chave]).trim();
    recados[campo.chave] = v || campo.padrao;
  }

  const passos = lista(lido.tutorial);
  const tutorial = (passos ? passos.slice(0, MAX_PASSOS).map(normalizarPasso).filter(Boolean) : TUTORIAL_PADRAO.map((p, i) => ({ ...p, ordem: i })));

  const dicasCruas = lista(lido.dicas);
  const dicas = dicasCruas
    ? dicasCruas.slice(0, MAX_DICAS).map(d => texto(d).trim()).filter(Boolean)
    : [...DICAS_PADRAO];

  const a = mapa(lido.abertura);
  const mensagensCruas = lista(a.mensagens);
  const abertura = {
    contato: texto(a.contato).trim() || ABERTURA_PADRAO.contato,
    // O padrão de fábrica só vale quando o autor não escreveu lista nenhuma.
    // Casar por POSIÇÃO com a lista dele misturaria a conversa de fábrica com
    // a dele: mensagem em branco some, não vira a mensagem de fábrica.
    mensagens: (mensagensCruas ? mensagensCruas.slice(0, MAX_MENSAGENS) : ABERTURA_PADRAO.mensagens)
      .map((m, i) => {
        const msg = mapa(m);
        const padrao = mensagensCruas ? null : ABERTURA_PADRAO.mensagens[i];
        const espera = Number(msg.espera);
        return {
          id: texto(msg.id).trim() || padrao?.id || `msg_${i + 1}`,
          espera: Number.isFinite(espera) ? Math.min(MAX_ESPERA, Math.max(0, espera)) : (padrao?.espera ?? 5),
          texto: texto(msg.texto).trim() || padrao?.texto || '',
        };
      })
      .filter(m => m.texto),
  };

  return { recados, tutorial, dicas, abertura };
}

/**
 * O que o AUTOR lê. Mesmo formato dos problemas da rotina, das regras e das
 * animações. `publicado` é o arquivo que está no ar: é comparando com ele que
 * dá pra avisar sobre id trocado, que é o erro que só aparece em save antigo.
 */
export function validarTextos(bruto, { publicado = null, acoesDeTecla = null } = {}) {
  const lido = mapa(bruto);
  const problemas = [];
  const anotar = (nivel, campo, mensagem, onde) => problemas.push({
    nivel, tipo: 'texto', campo, mensagem, onde: onde ?? ondeFica(campo),
  });
  const erro = (campo, mensagem, onde) => anotar('erro', campo, mensagem, onde);
  const aviso = (campo, mensagem, onde) => anotar('aviso', campo, mensagem, onde);

  // --- Recados de chave fixa ------------------------------------------------
  const crus = mapa(lido.recados);
  for (const chave of Object.keys(crus)) {
    if (!CAMPO_POR_CHAVE[chave]) {
      erro(chave, `O recado "${chave}" não existe no jogo e vai ser ignorado. Confira o nome.`, `recado ${chave}`);
    }
  }

  for (const campo of ESQUEMA) {
    const valor = texto(crus[campo.chave]);
    if (crus[campo.chave] !== undefined && !valor.trim()) {
      aviso(campo.chave, `"${campo.rotulo}" ficou em branco: o jogo vai usar o texto de fábrica.`);
      continue;
    }
    if (!valor) continue;

    const escritos = buracosDe(valor);
    for (const buraco of escritos) {
      if (buraco === 'tecla' && campo.tecla) {
        erro(campo.chave, `Não escreva a tecla aqui: neste recado o jogo já põe a tecla e o travessão na frente sozinho, e escrever de novo faz o jogador ler a tecla duas vezes.`);
      } else if (!campo.buracos.includes(buraco)) {
        const possiveis = campo.buracos.length ? campo.buracos.map(b => `{${b}}`).join(', ') : 'nenhum';
        erro(campo.chave, `"${campo.rotulo}" usa {${buraco}}, que não existe aqui: o jogador vai ler a palavra "{${buraco}}" na tela, com as chaves e tudo. Aqui só existe: ${possiveis}.`);
      }
    }
    for (const buraco of campo.buracos) {
      if (!escritos.includes(buraco)) {
        erro(campo.chave, `"${campo.rotulo}" ficou sem {${buraco}}: o jogador não vai saber de que ${buraco} o jogo está falando.`);
      }
    }
    if (campo.marcacao && /[<>]/.test(valor)) {
      erro(campo.chave, `Este texto é desenhado como marcação, e um sinal de < ou > come o resto da frase na tela. Escreva sem eles.`);
    }
    const caixa = campo.caixa ? CAIXAS[campo.caixa] : null;
    if (caixa && valor.length > caixa.caracteres) {
      aviso(campo.chave, `${valor.length} caracteres: acima de ${caixa.caracteres}, ${caixa.oQueAcontece}.`);
    }
  }

  // --- Tutorial -------------------------------------------------------------
  const passos = lista(lido.tutorial);
  if (passos) {
    if (!passos.length) {
      aviso('tutorial', 'O tutorial está sem passo nenhum: ninguém vai ver dica nenhuma nos primeiros minutos. O jogo abre normal — só decida se é isso mesmo que você quer.', 'tutorial');
    }
    const vistos = new Set();
    passos.forEach((bruto, i) => {
      const p = mapa(bruto);
      const id = texto(p.id);
      const onde = `passo ${i + 1}`;
      if (!ID_DE_ACONTECIMENTO.has(id)) {
        erro(`tutorial_${i}`, `O passo "${id || '(sem nada)'}" não existe no jogo: nenhum acontecimento cumpre ele e o tutorial para neste passo. Escolha um dos ${ACONTECIMENTOS.length} que o jogo sabe avisar.`, onde);
        return;
      }
      if (vistos.has(id)) {
        erro(`tutorial_${i}`, `O passo "${id}" está na lista duas vezes: a segunda nunca vai acontecer.`, onde);
      }
      vistos.add(id);

      const t = texto(p.texto).trim();
      if (!t) {
        aviso(`tutorial_${i}`, 'Dica em branco: o jogo vai usar a de fábrica.', onde);
        return;
      }
      const acao = texto(p.acao);
      const citaTecla = buracosDe(t).includes('tecla');
      if (citaTecla && !acao) {
        erro(`tutorial_${i}`, 'Este passo usa {tecla} mas não está ligado a ação nenhuma: o jogador vai ler um travessão no lugar da tecla. Escolha a ação na lista ao lado.', onde);
      }
      if (!citaTecla && acao) {
        aviso(`tutorial_${i}`, 'Este passo tem uma ação escolhida mas não usa {tecla}: a tecla não vai aparecer em lugar nenhum da dica.', onde);
      }
      // 'phone' é ação de verdade, com tecla fixa (M): ela não está no mapa de
      // teclas remapeáveis, e cobrá-la de estar acusaria o arquivo publicado.
      if (acao && acao !== 'phone' && acoesDeTecla && !acoesDeTecla.has(acao)) {
        erro(`tutorial_${i}`, `A ação "${acao}" não existe no jogo. Escolha uma da lista.`, onde);
      }
      // Tecla escrita à mão: passa a mentir no dia em que o jogador remapeia.
      if (!citaTecla && /(?:^|\s)(?:tecla\s+)?["']?[A-Z]["']?(?:\s|,|\.|$)/.test(t) && acao) {
        aviso(`tutorial_${i}`, 'Parece que a tecla está escrita à mão aqui. Se o jogador trocar a tecla nas configurações, a dica passa a mentir — escreva {tecla} no lugar da letra e o jogo põe a certa toda vez.', onde);
      }
    });

    // A dependência cruzada: o passo do celular só se cumpre se chegar mensagem.
    const querMensagem = passos.some(p => texto(mapa(p).id) === 'leu_mensagem');
    const mensagens = lista(mapa(lido.abertura).mensagens);
    if (querMensagem && mensagens && !mensagens.filter(m => texto(mapa(m).texto).trim()).length) {
      erro('tutorial_leu_mensagem', 'O passo do celular espera que o jogador leia uma mensagem, mas a conversa que abre o jogo está sem mensagem nenhuma: a mensagem nunca chega, o passo nunca se cumpre e o tutorial trava aqui pra sempre.', 'tutorial');
    }
  }

  // --- Dicas da tela de carregamento ---------------------------------------
  const dicas = lista(lido.dicas);
  if (dicas) {
    const limpas = dicas.map(d => texto(d).trim()).filter(Boolean);
    if (!limpas.length) {
      aviso('dicas', 'Sem nenhuma dica, a caixa da tela de carregamento fica vazia durante todo o carregamento — e é a única coisa pra ler enquanto o jogo abre.', 'dicas');
    }
    const vistas = new Set();
    limpas.forEach((d, i) => {
      if (vistas.has(d)) {
        aviso(`dica_${i}`, 'Esta dica está escrita duas vezes: ela vai aparecer duas vezes na mesma volta da rotação.', `dica ${i + 1}`);
      }
      vistas.add(d);
      if (d.length > CAIXAS.dica.caracteres) {
        aviso(`dica_${i}`, `${d.length} caracteres: acima de ${CAIXAS.dica.caracteres}, ${CAIXAS.dica.oQueAcontece}.`, `dica ${i + 1}`);
      }
    });
  }

  // --- A conversa que abre o jogo ------------------------------------------
  const a = mapa(lido.abertura);
  const anterior = publicado ? mapa(publicado.abertura) : null;
  if (anterior && texto(a.contato).trim() && texto(a.contato).trim() !== texto(anterior.contato).trim()) {
    aviso('abertura_contato', `Você mudou o nome do contato de "${texto(anterior.contato)}" para "${texto(a.contato)}": quem já tem jogo salvo vai abrir o celular com DUAS conversas, a antiga com o nome velho e a nova vazia. O texto das mensagens pode mudar à vontade; o nome do contato, não.`, 'conversa de abertura');
  }
  const mensagens = lista(a.mensagens);
  if (mensagens) {
    const idsAntes = new Set((lista(anterior?.mensagens) ?? []).map(m => texto(mapa(m).id)));
    const vistos = new Set();
    mensagens.forEach((bruto, i) => {
      const m = mapa(bruto);
      const id = texto(m.id).trim();
      const onde = `mensagem ${i + 1}`;
      if (!texto(m.texto).trim()) {
        aviso(`abertura_${i}`, 'Mensagem sem texto: ela não vai chegar.', onde);
      }
      if (!id) {
        erro(`abertura_${i}`, 'Mensagem sem id: o celular usa o id pra não entregar a mesma mensagem duas vezes.', onde);
      } else if (vistos.has(id)) {
        erro(`abertura_${i}`, `O id "${id}" está repetido: a segunda mensagem vai ser ignorada pelo celular.`, onde);
      } else {
        vistos.add(id);
        if (idsAntes.size && !idsAntes.has(id)) {
          aviso(`abertura_${i}`, `O id "${id}" é novo: quem já tem jogo salvo vai receber esta mensagem de novo, como se fosse a primeira vez. Se foi só o texto que mudou, devolva o id de antes.`, onde);
        }
      }
      const espera = Number(m.espera);
      if (m.espera !== undefined && !Number.isFinite(espera)) {
        aviso(`abertura_${i}`, 'A espera precisa ser um número de segundos.', onde);
      } else if (Number.isFinite(espera) && espera > MAX_ESPERA) {
        aviso(`abertura_${i}`, `${espera}s de espera: acima de ${MAX_ESPERA}s o jogo vai usar ${MAX_ESPERA}s.`, onde);
      }
    });
  }

  return problemas;
}

/** Onde o problema mora, pro autor achar o campo. */
export function ondeFica(chave) {
  const campo = CAMPO_POR_CHAVE[chave];
  if (!campo) return `recado ${chave}`;
  const grupo = GRUPOS.find(g => g.id === campo.grupo);
  return `${grupo?.rotulo ?? campo.grupo} › ${campo.rotulo}`;
}

/** Só os erros — o que faz o jogador ler coisa errada na tela. */
export const errosDosTextos = problemas => problemas.filter(p => p.nivel === 'erro');

/** O rascunho do editor serve como textos? */
export function serveComoTextos(lido) {
  if (!lido || typeof lido !== 'object' || Array.isArray(lido)) return false;
  return ['recados', 'tutorial', 'dicas', 'abertura'].some(secao => lido[secao] !== undefined);
}
