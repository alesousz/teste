// Gera assets/props/<pasta>/indice.json pra cada pasta de pacote.
//
// O editor de mapa lê esses índices em vez de uma lista de arquivos escrita à
// mão: copiou modelos pra uma pasta, roda isto e eles aparecem no catálogo.
// Os campos que descrevem o pacote (pacote, licença, categoria, escala) são
// preservados de uma execução pra outra; só a lista `modelos` é refeita.
//
// Uso: node tools/gerar-indices-props.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'props');

const PADRAO = { pacote: '', licenca: '', categoria: 'Outros', escala: 1 };

let problemas = 0;
const pacotes = [];
for (const pasta of readdirSync(RAIZ).sort()) {
  const dir = join(RAIZ, pasta);
  if (!statSync(dir).isDirectory()) continue;

  const modelos = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.glb')).sort();
  if (modelos.length === 0) continue;

  const comEspaco = modelos.filter(f => f.includes(' '));
  if (comEspaco.length) {
    // Espaço em URL dá problema de carregamento; melhor falhar aqui do que
    // o item sumir do catálogo sem aviso.
    console.error(`ERRO ${pasta}: nomes com espaço (troque por _): ${comEspaco.join(', ')}`);
    problemas++;
    continue;
  }

  const caminho = join(dir, 'indice.json');
  const anterior = existsSync(caminho) ? JSON.parse(readFileSync(caminho, 'utf8')) : {};
  const { modelos: _, ...meta } = anterior;
  const indice = { ...PADRAO, ...meta, modelos };
  writeFileSync(caminho, JSON.stringify(indice, null, 2) + '\n');
  console.log(`${pasta}: ${modelos.length} modelos (escala ${indice.escala}, categoria "${indice.categoria}")`);
  pacotes.push(pasta);
}

// Lista das pastas pro editor: hospedagem estática não lista diretório, então
// sem isto o editor precisaria saber os nomes das pastas no código.
writeFileSync(join(RAIZ, 'pacotes.json'), JSON.stringify(pacotes, null, 2) + '\n');
console.log(`pacotes.json: ${pacotes.length} pastas`);

if (problemas) process.exit(1);
