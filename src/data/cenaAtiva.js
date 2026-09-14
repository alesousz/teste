// Cena que o jogo usa: a de src/data/scene.js ou, no Modo Viver, a que o
// editor de mapa acabou de gravar (ver cenaEmTeste.js). data.js e world.js
// leem daqui; o editor lê scene.js direto ("Carregar cena atual do jogo").
import { SCENE } from './scene.js';
import { lerCenaEmTeste } from './cenaEmTeste.js';

function cenaDoEditor() {
  // Nos testes em Node não há location (nem localStorage).
  if (typeof location === 'undefined') return null;
  try {
    return lerCenaEmTeste(localStorage, location.search);
  } catch {
    return null;   // armazenamento bloqueado: partida normal
  }
}

const doEditor = cenaDoEditor();

/** `{ spawn }` no Modo Viver; null numa partida normal. */
export const MODO_VIVER = doEditor ? { spawn: doEditor.spawn ?? null } : null;

export const CENA = doEditor ?? SCENE;
