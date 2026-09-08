import { validateSave, SaveStatus, saveErrorMessage } from './saveSchema.js';

const KEY = 'ecos-da-cidade-save-v1';
// Save que não pôde ser carregado é movido pra cá antes de a chave principal
// ser reaproveitada por uma partida nova. É a estratégia de preservação mais
// simples possível: uma chave, sempre a última quarentena, sem histórico.
const QUARANTINE_KEY = 'ecos-da-cidade-save-v1.corrompido';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Lê o save e diz em que estado ele está — o ponto de entrada que o jogo deve
 * usar. Diferente de loadSave(), NÃO confunde "não existe save" com "existe
 * mas não dá pra ler": os dois devolviam null antes, e era isso que fazia um
 * save corrompido virar partida nova silenciosamente.
 *
 * @returns {{status: string, save?: object, message?: string}}
 */
export function readSave() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // localStorage indisponível (modo privado, cota, permissão): do ponto de
    // vista do jogo é o mesmo que não haver save.
    return { status: SaveStatus.EMPTY };
  }

  if (!raw) return { status: SaveStatus.EMPTY };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: SaveStatus.UNREADABLE, message: saveErrorMessage(SaveStatus.UNREADABLE) };
  }

  return validateSave(parsed);
}

/**
 * Move o conteúdo bruto da chave principal pra chave de quarentena, sem
 * interpretá-lo. Chamado antes de sobrescrever um save que não pôde ser
 * carregado, pra que o dado original não se perca.
 * @returns {boolean} true se havia algo pra preservar
 */
export function quarantineSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    localStorage.setItem(QUARANTINE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

// Só pra teste e diagnóstico: devolve o conteúdo bruto posto em quarentena.
export function readQuarantinedSave() {
  try { return localStorage.getItem(QUARANTINE_KEY); } catch { return null; }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
