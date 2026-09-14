// Texto do arquivo src/data/scene.js a partir de uma cena. O editor de mapa
// baixa o arquivo pronto com isto (botão "Baixar scene.js") e o script
// tools/fixar-cidade.mjs grava com isto — os dois escrevem igual.
//
// Sem three.js e sem DOM: roda nos testes em Node.

const CABECALHO = `// Cena da cidade: marcos, prédios, NPCs, fragmentos, natureza, decoração e
// peças de construção, no formato que o editor de mapa (editor.html) lê e
// escreve. Não edite à mão: abra o editor, mude o que quiser e use
// "Baixar scene.js" pra trocar este arquivo.
//
// \`cidade: 'fixa'\` quer dizer que os prédios da cidade estão todos aqui (e dá
// pra mexer neles no editor). Sem isso, data.js sorteia os prédios a cada
// carregamento, como era antes.
`;

// Ordem estável das chaves: diff pequeno quando só uma peça muda.
const ORDEM = ['typeId', 'position', 'rotY', 'props', 'modelo'];

function ordenado(item) {
  const saida = {};
  for (const k of ORDEM) if (item[k] !== undefined) saida[k] = item[k];
  for (const k of Object.keys(item).sort()) if (!(k in saida) && item[k] !== undefined) saida[k] = item[k];
  return saida;
}

/** Conteúdo do src/data/scene.js pra `{ cidade, items }`. */
export function textoDoScene({ cidade, items }) {
  const linhas = items.map(it => `    ${JSON.stringify(ordenado(it))},`);
  return `${CABECALHO}export const SCENE = {\n`
    + (cidade ? `  cidade: ${JSON.stringify(cidade)},\n` : '')
    + `  items: [\n${linhas.join('\n')}\n  ],\n};\n`;
}
