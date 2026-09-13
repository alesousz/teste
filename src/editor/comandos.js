// Comandos de edição da cena, pro Historico.
//
// Cada comando guarda "fotos" das peças (uuid, tipo, posição, giro,
// propriedades) em vez de referências aos objetos 3D: apagar e desfazer
// recria a MESMA peça, com o mesmo uuid, e nada depende de uma malha que já
// saiu da cena.
//
// O `alvo` é quem de fato mexe na cena (o editor). Ele precisa oferecer:
//   criarItem(foto)                → põe a peça na cena
//   removerItem(uuid)              → tira a peça
//   transformarItem(uuid, { position, rotY })
//   alterarProps(uuid, props)
// Sem three.js: roda nos testes em Node com um alvo falso.

const copiar = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Foto independente de uma peça — mudar a peça depois não muda a foto. */
export function fotografar(item) {
  return {
    uuid: item.uuid,
    typeId: item.typeId,
    position: [...item.position],
    rotY: item.rotY ?? 0,
    props: copiar(item.props),
  };
}

const plural = (n, um, varios) => (n === 1 ? um : `${n} ${varios}`);

export function comandoColocar(alvo, fotos, descricao = `Colocar ${plural(fotos.length, 'peça', 'peças')}`) {
  const lista = fotos.map(f => ({ ...f, position: [...f.position], props: copiar(f.props) }));
  return {
    descricao,
    uuids: lista.map(f => f.uuid),
    fazer: () => { for (const f of lista) alvo.criarItem(f); },
    desfazer: () => { for (const f of [...lista].reverse()) alvo.removerItem(f.uuid); },
  };
}

export function comandoRemover(alvo, fotos, descricao = `Apagar ${plural(fotos.length, 'peça', 'peças')}`) {
  const colocar = comandoColocar(alvo, fotos, descricao);
  return { descricao, uuids: colocar.uuids, fazer: colocar.desfazer, desfazer: colocar.fazer };
}

/**
 * Mover e girar. `mudancas`: [{ uuid, antes: { position, rotY }, depois: { position, rotY } }].
 */
export function comandoTransformar(alvo, mudancas, descricao = `Mover ${plural(mudancas.length, 'peça', 'peças')}`) {
  const lista = mudancas.map(m => ({
    uuid: m.uuid,
    antes: { position: [...m.antes.position], rotY: m.antes.rotY },
    depois: { position: [...m.depois.position], rotY: m.depois.rotY },
  }));
  return {
    descricao,
    uuids: lista.map(m => m.uuid),
    fazer: () => { for (const m of lista) alvo.transformarItem(m.uuid, m.depois); },
    desfazer: () => { for (const m of lista) alvo.transformarItem(m.uuid, m.antes); },
  };
}

export function comandoAlterarProps(alvo, uuid, antes, depois, descricao = 'Alterar propriedades') {
  const a = copiar(antes);
  const d = copiar(depois);
  return {
    descricao,
    uuids: [uuid],
    fazer: () => alvo.alterarProps(uuid, copiar(d)),
    desfazer: () => alvo.alterarProps(uuid, copiar(a)),
  };
}
