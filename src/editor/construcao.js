// Ferramentas de construção do editor, como no The Sims: paredes seguindo a
// grade, piso pintado, portas e janelas que trocam uma parede e telhado que
// cobre um cômodo fechado.
//
// Tudo no módulo do Building Kit (Kenney): a parede comum tem 2 m e a larga
// 4 m; piso e telha são placas de 2 × 2 m. Por isso as paredes correm nas
// linhas pares da grade (x ou z = 0, 2, 4...) e cada placa ocupa uma célula
// com centro nas coordenadas ímpares.
//
// Convenções do kit (medidas nos arquivos):
//   - a parede corre ao longo do z LOCAL, centrada na origem: giro 0 = parede
//     ao longo do z do mundo; giro 90° = ao longo do x;
//   - a folha da porta fica 0,45 m pra trás no z local do vão;
//   - telhas: a mureta de Roof_Flat_Side fica no +x local; Roof_Flat_Corner
//     tem mureta no +x e no +z; Roof_Flat_Corner_Inn só no canto (+x, +z).
//
// Sem three.js: roda nos testes em Node.

export const MODULO = 2;
export const ALTURA_PAREDE = 2.4;
const MAX_CELULAS = 400;

const MEIO_GIRO = Math.PI / 2;
const limpo = v => { const r = Math.round(v * 1000) / 1000; return r === 0 ? 0 : r; };
const chave = (x, z) => `${limpo(x)},${limpo(z)}`;

/** Ponto da grade de paredes mais perto (múltiplos de 2). */
export function pontoDaGrade(x, z) {
  return [limpo(Math.round(x / MODULO) * MODULO), limpo(Math.round(z / MODULO) * MODULO)];
}

/** Célula [i, j] que contém o ponto; o centro dela é (2i+1, 2j+1). */
export function celulaDoPonto(x, z) {
  return [Math.floor(x / MODULO), Math.floor(z / MODULO)];
}

export function centroDaCelula([i, j]) {
  return [i * MODULO + MODULO / 2, j * MODULO + MODULO / 2];
}

// --- Paredes -----------------------------------------------------------------

/** Trecho de parede de 2 m: centro e giro. */
const trecho = (x, z, aoLongoDeX) => ({ x: limpo(x), z: limpo(z), rotY: aoLongoDeX ? MEIO_GIRO : 0 });

export const chaveDoTrecho = t => chave(t.x, t.z);

/**
 * Trechos de uma parede reta entre dois pontos da grade. Segue o eixo em que
 * o mouse andou mais, como arrastar parede no The Sims.
 */
export function trechosDaLinha(a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const aoLongoDeX = Math.abs(dx) >= Math.abs(dz);
  const [de, ate] = aoLongoDeX ? [a[0], b[0]] : [a[1], b[1]];
  const lista = [];
  for (let v = Math.min(de, ate); v < Math.max(de, ate) - 1e-6; v += MODULO) {
    lista.push(aoLongoDeX ? trecho(v + 1, a[1], true) : trecho(a[0], v + 1, false));
  }
  return lista;
}

/** Trechos das quatro paredes de um cômodo com cantos opostos em a e b. */
export function trechosDoComodo(a, b) {
  if (a[0] === b[0] || a[1] === b[1]) return trechosDaLinha(a, b);
  const c = [b[0], a[1]];
  const d = [a[0], b[1]];
  return [...trechosDaLinha(a, c), ...trechosDaLinha(c, b), ...trechosDaLinha(d, b), ...trechosDaLinha(a, d)];
}

/** Comprimento, em metros, de uma parede do kit que ocupa trechos da grade (0 se não ocupa). */
export function comprimentoDaParede(typeId) {
  if (!/^Wall/.test(typeId) || /^Wall_Corner/.test(typeId)) return 0;
  if (/_Wide/.test(typeId)) return 4;
  if (/^Wall_Half/.test(typeId)) return 1;
  return 2;
}

/** Chaves dos trechos de 2 m que uma parede já colocada ocupa. */
export function trechosDaPeca({ typeId, position, rotY = 0 }) {
  const comprimento = comprimentoDaParede(typeId);
  if (comprimento < MODULO) return [];
  const dx = Math.sin(rotY);
  const dz = Math.cos(rotY);
  const n = comprimento / MODULO;
  const lista = [];
  for (let k = 0; k < n; k++) {
    const d = (k - (n - 1) / 2) * MODULO;
    lista.push(chave(position[0] + dx * d, position[2] + dz * d));
  }
  return lista;
}

// --- Portas e janelas ----------------------------------------------------------

export const ehAbertura = typeId => /^Wall_(Doorway|Window)/.test(typeId);
export const ehFolhaDePorta = typeId => /door/i.test(typeId) && !/^Wall_/.test(typeId);
export const ehTelhado = typeId => /^Roof_Flat/.test(typeId);

/** Folha que acompanha um vão de porta (os vãos largos, de 4 m, ficam abertos). */
export function folhaDoVao(typeId) {
  if (typeId === 'Wall_Doorway_Square') return 'Wooden_Door';
  if (typeId === 'Wall_Doorway_Round') return 'Wooden_Door_Rounded';
  return null;
}

export function posicaoDaFolha(position, rotY) {
  return [limpo(position[0] - 0.45 * Math.sin(rotY)), position[1], limpo(position[2] - 0.45 * Math.cos(rotY))];
}

/** Folhas de porta dentro do vão de uma parede (pra sair junto com ela). */
export function folhasNaParede(parede, pecas) {
  const comprimento = comprimentoDaParede(parede.typeId);
  if (!comprimento) return [];
  const dx = Math.sin(parede.rotY ?? 0);
  const dz = Math.cos(parede.rotY ?? 0);
  return pecas.filter(p => {
    if (!ehFolhaDePorta(p.typeId) || Math.abs(p.position[1] - parede.position[1]) > 0.5) return false;
    const rx = p.position[0] - parede.position[0];
    const rz = p.position[2] - parede.position[2];
    const ao = rx * dx + rz * dz;
    const lado = rx * dz - rz * dx;
    return Math.abs(lado) < 0.3 && Math.abs(ao) <= comprimento / 2;
  });
}

/**
 * Trocar uma parede por uma porta ou janela, clicando nela.
 *   typeId — peça escolhida no catálogo (Wall_Doorway_*, Wall_Window_*);
 *   alvo   — parede sob o mouse {uuid, typeId, position, rotY};
 *   ponto  — [x, z] onde o mouse aponta (escolhe o trecho numa parede larga);
 *   pecas  — peças do mesmo andar.
 * Devolve { remover: [peças], colocar: [{typeId, position, rotY}] } ou null
 * quando não encaixa (peça larga sem duas paredes em linha, por exemplo).
 */
export function trocaDeAbertura(typeId, alvo, ponto, pecas) {
  const comprimento = comprimentoDaParede(typeId);
  const doAlvo = trechosDaPeca(alvo);
  if (!ehAbertura(typeId) || comprimento < MODULO || !doAlvo.length) return null;
  const rotY = alvo.rotY ?? 0;
  const dx = Math.round(Math.sin(rotY));
  const dz = Math.round(Math.cos(rotY));
  if (Math.abs(dx) + Math.abs(dz) !== 1) return null;   // só giros de 90°

  // Trecho do alvo mais perto do mouse.
  const centros = doAlvo.map(k => k.split(',').map(Number));
  const perto = centros.reduce((m, c) =>
    Math.hypot(c[0] - ponto[0], c[1] - ponto[1]) < Math.hypot(m[0] - ponto[0], m[1] - ponto[1]) ? c : m);
  let centro = perto;
  let precisa = [chave(perto[0], perto[1])];
  if (comprimento === 4) {
    const s = Math.sign((ponto[0] - perto[0]) * dx + (ponto[1] - perto[1]) * dz) || 1;
    centro = [perto[0] + dx * s, perto[1] + dz * s];
    precisa = [precisa[0], chave(perto[0] + dx * 2 * s, perto[1] + dz * 2 * s)];
  }

  // Cada trecho precisa estar ocupado, e as peças que saem não podem deixar
  // buraco fora do vão novo.
  const remover = [];
  for (const k of precisa) {
    const dona = pecas.find(p => trechosDaPeca(p).includes(k));
    if (!dona) return null;
    if (!remover.includes(dona)) remover.push(dona);
  }
  const ocupados = remover.flatMap(trechosDaPeca);
  if (ocupados.length !== precisa.length || !ocupados.every(k => precisa.includes(k))) return null;

  const y = alvo.position[1];
  const posicao = [limpo(centro[0]), y, limpo(centro[1])];
  if (remover.length === 1 && remover[0].typeId === typeId) return null;   // já é essa peça

  for (const parede of [...remover]) {
    for (const folha of folhasNaParede(parede, pecas)) if (!remover.includes(folha)) remover.push(folha);
  }
  const colocar = [{ typeId, position: posicao, rotY }];
  const folha = folhaDoVao(typeId);
  if (folha) colocar.push({ typeId: folha, position: posicaoDaFolha(posicao, rotY), rotY });
  return { remover, colocar };
}

// --- Piso ----------------------------------------------------------------------

export const chaveDaCelula = ([i, j]) => `${i},${j}`;

/** Células de um retângulo arrastado entre dois pontos quaisquer. */
export function celulasDoRetangulo(a, b) {
  const [i0, j0] = celulaDoPonto(a[0], a[1]);
  const [i1, j1] = celulaDoPonto(b[0], b[1]);
  const lista = [];
  for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) {
    for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) {
      lista.push([i, j]);
      if (lista.length >= MAX_CELULAS) return lista;
    }
  }
  return lista;
}

// --- Telhado ---------------------------------------------------------------------

/**
 * Células do cômodo em volta de `inicial`, sem atravessar paredes (`paredes`:
 * Set de chaves de trecho). null se não fecha antes de `limite` células.
 */
export function preencherComodo(inicial, paredes, limite = MAX_CELULAS) {
  const visto = new Set([chaveDaCelula(inicial)]);
  const fila = [inicial];
  const celulas = [];
  while (fila.length) {
    const [i, j] = fila.shift();
    celulas.push([i, j]);
    if (celulas.length > limite) return null;
    const vizinhos = [
      [[i + 1, j], chave(2 * i + 2, 2 * j + 1)],
      [[i - 1, j], chave(2 * i, 2 * j + 1)],
      [[i, j + 1], chave(2 * i + 1, 2 * j + 2)],
      [[i, j - 1], chave(2 * i + 1, 2 * j)],
    ];
    for (const [cel, parede] of vizinhos) {
      const k = chaveDaCelula(cel);
      if (visto.has(k) || paredes.has(parede)) continue;
      visto.add(k);
      fila.push(cel);
    }
  }
  return celulas;
}

// Giro que leva o +x local (mureta) pra cada lado de fora.
const GIRO_DO_LADO = { px: 0, nz: MEIO_GIRO, nx: Math.PI, pz: 3 * MEIO_GIRO };
// Giro que leva o canto (+x, +z) local pra cada canto do mundo.
const GIRO_DO_CANTO = { 'px,pz': 0, 'px,nz': MEIO_GIRO, 'nx,nz': Math.PI, 'nx,pz': 3 * MEIO_GIRO };

/**
 * Telhas planas cobrindo as células: miolo, lado (mureta de um lado), canto
 * (dois lados) e canto de dentro (cômodo em L). Faixas de uma célula só de
 * largura não têm peça certa no kit: ficam com a mureta de um ou dois lados.
 */
export function telhasDoComodo(celulas) {
  const tem = new Set(celulas.map(chaveDaCelula));
  const dentro = (i, j) => tem.has(`${i},${j}`);
  return celulas.map(([i, j]) => {
    const [x, z] = centroDaCelula([i, j]);
    const fora = {
      px: !dentro(i + 1, j), nx: !dentro(i - 1, j), pz: !dentro(i, j + 1), nz: !dentro(i, j - 1),
    };
    const lados = Object.keys(fora).filter(k => fora[k]);
    const peca = (typeId, rotY) => ({ typeId, x, z, rotY });
    const cantoLivre = ['px', 'nx'].flatMap(a => ['pz', 'nz'].map(b => `${a},${b}`)).find(c => {
      const [a, b] = c.split(',');
      return fora[a] && fora[b];
    });
    if (lados.length === 0) {
      const diagonais = { 'px,pz': [1, 1], 'px,nz': [1, -1], 'nx,nz': [-1, -1], 'nx,pz': [-1, 1] };
      const vazio = Object.keys(diagonais).find(c => !dentro(i + diagonais[c][0], j + diagonais[c][1]));
      return vazio ? peca('Roof_Flat_Corner_Inn', GIRO_DO_CANTO[vazio]) : peca('Roof_Flat_Center', 0);
    }
    if (lados.length === 1) return peca('Roof_Flat_Side', GIRO_DO_LADO[lados[0]]);
    if (lados.length === 4) return peca('Roof_Flat_Square', 0);
    if (cantoLivre) return peca('Roof_Flat_Corner', GIRO_DO_CANTO[cantoLivre]);
    return peca('Roof_Flat_Side', GIRO_DO_LADO[lados[0]]);   // faixa estreita
  });
}
