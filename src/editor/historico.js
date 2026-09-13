// Histórico do editor de mapa: desfazer e refazer.
//
// Cada ação é um comando { descricao, fazer(), desfazer() }. `executar` faz e
// empilha; fazer algo novo depois de desfazer descarta o que dava pra refazer
// (é o comportamento de qualquer editor). Ação em várias peças vira um `lote`,
// que volta inteiro num Ctrl+Z só.
//
// Sem three.js e sem DOM: roda nos testes em Node.

export class Historico {
  constructor({ limite = 200, aoMudar = () => {} } = {}) {
    this.limite = limite;
    this._aoMudar = aoMudar;
    this._feitos = [];
    this._desfeitos = [];
  }

  /** Faz o comando e guarda. */
  executar(cmd) {
    cmd.fazer();
    this.registrar(cmd);
    return cmd;
  }

  /**
   * Guarda um comando cujo efeito já aconteceu — arrastar uma peça: ela já
   * está no lugar novo quando o mouse solta.
   */
  registrar(cmd) {
    this._feitos.push(cmd);
    if (this._feitos.length > this.limite) this._feitos.shift();
    this._desfeitos = [];
    this._aoMudar();
    return cmd;
  }

  desfazer() {
    const cmd = this._feitos.pop();
    if (!cmd) return null;
    cmd.desfazer();
    this._desfeitos.push(cmd);
    this._aoMudar();
    return cmd;
  }

  refazer() {
    const cmd = this._desfeitos.pop();
    if (!cmd) return null;
    cmd.fazer();
    this._feitos.push(cmd);
    this._aoMudar();
    return cmd;
  }

  /** Esquece tudo (carregar outra cena não se desfaz). */
  limpar() {
    this._feitos = [];
    this._desfeitos = [];
    this._aoMudar();
  }

  get podeDesfazer() { return this._feitos.length > 0; }
  get podeRefazer() { return this._desfeitos.length > 0; }
  /** Descrição do que o próximo Ctrl+Z desfaz, pra dica do botão. */
  get proximoDesfazer() { return this._feitos.at(-1)?.descricao ?? null; }
  get proximoRefazer() { return this._desfeitos.at(-1)?.descricao ?? null; }
}

/** Vários comandos como um só: faz na ordem e desfaz na ordem inversa. */
export function lote(descricao, comandos) {
  return {
    descricao,
    fazer: () => { for (const c of comandos) c.fazer(); },
    desfazer: () => { for (const c of [...comandos].reverse()) c.desfazer(); },
  };
}
