// Cena que o jogo usa, nesta ordem:
//   1. Modo Viver (?viver=1): a cena que o editor acabou de mandar pro teste;
//   2. o rascunho do editor de mapa nesta máquina — é o que deixa você
//      construir, abrir o jogo normal e ver o que fez sem publicar nada;
//   3. src/data/scene.js, o que está publicado (e o que outra máquina vê).
//
// data.js e world.js leem daqui; o editor lê scene.js direto ("Carregar cena
// atual do jogo"), que é como se volta pro publicado.
import { SCENE } from './scene.js';
import { lerCenaEmTeste, validarCena } from './cenaEmTeste.js';

const CHAVE_RASCUNHO = 'editor-rascunho';

function cenaDoEditor() {
  // Nos testes em Node não há location (nem localStorage).
  if (typeof location === 'undefined') return null;
  try {
    return lerCenaEmTeste(localStorage, location.search);
  } catch {
    return null;   // armazenamento bloqueado: partida normal
  }
}

function rascunhoDoEditor() {
  if (typeof location === 'undefined') return null;
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO);
    return bruto ? validarCena(JSON.parse(bruto)) : null;
  } catch {
    return null;
  }
}

const emTeste = cenaDoEditor();
const rascunho = emTeste ? null : rascunhoDoEditor();

/** `{ spawn }` no Modo Viver; null numa partida normal. */
export const MODO_VIVER = emTeste ? { spawn: emTeste.spawn ?? null } : null;

/** A partida está usando o rascunho local do editor em vez do publicado? */
export const USANDO_RASCUNHO = !!rascunho;

export const CENA = emTeste ?? rascunho ?? SCENE;
