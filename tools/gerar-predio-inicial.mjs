// Gera o prédio inicial em peças do Building Kit e móveis da Quaternius,
// direto em src/data/scene.js — o mesmo formato que o editor de mapa escreve,
// então tudo que sai daqui dá pra mexer no editor depois.
//
// Usa as ferramentas do editor (src/editor/construcao.js): as paredes correm
// nas linhas pares da grade de 2 m, piso e telha são placas de 2 × 2 m e as
// portas trocam um trecho de parede, igualzinho a construir na mão.
//
// Roda quantas vezes quiser: tudo que estiver dentro do terreno é trocado.
//
// Uso: node tools/gerar-predio-inicial.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulo = caminho => import(pathToFileURL(join(RAIZ, caminho)).href);
const { SCENE } = await modulo('src/data/scene.js');
const { textoDoScene } = await modulo('src/data/formatoCena.js');
const { trechosDaLinha, trechosDoComodo, celulasDoRetangulo, centroDaCelula, telhasDoComodo, posicaoDaFolha } =
  await modulo('src/editor/construcao.js');

// --- Catálogo: mesmo mapeamento que o editor faz (nome do arquivo → modelo) ---

const PROPS = join(RAIZ, 'assets/props');
const catalogo = new Map();
for (const arquivo of ['fusca.glb', 'moveis.glb', 'itens.glb', 'velhinho.glb']) {
  catalogo.set(arquivo.replace(/\.glb$/, ''), { url: `assets/props/${arquivo}`, escala: 1 });
}
for (const pasta of JSON.parse(readFileSync(join(PROPS, 'pacotes.json'), 'utf8'))) {
  const indice = JSON.parse(readFileSync(join(PROPS, pasta, 'indice.json'), 'utf8'));
  for (const arquivo of indice.modelos) {
    const papel = Object.entries(indice.papeis ?? {}).find(([re]) => new RegExp(re, 'i').test(arquivo))?.[1];
    catalogo.set(arquivo.replace(/\.glb$/, ''), {
      url: `assets/props/${pasta}/${arquivo}`,
      escala: indice.escalas?.[arquivo] ?? indice.escala ?? 1,
      ...(papel ? { papel } : {}),
    });
  }
}

const itens = [];
const r3 = v => Math.round(v * 1000) / 1000;

/** Uma peça na cena, com a origem do modelo que o jogo usa pra carregar. */
function por(typeId, x, y, z, rotY = 0, props) {
  const modelo = catalogo.get(typeId);
  if (!modelo) throw new Error(`"${typeId}" não está em assets/props`);
  itens.push({
    typeId,
    position: [r3(x), r3(y), r3(z)],
    rotY: r3(rotY),
    ...(props ? { props } : {}),
    modelo: { url: modelo.url, no: null, escala: modelo.escala, ...(modelo.papel ? { papel: modelo.papel } : {}) },
  });
}

// --- Paredes, pisos e telhado ---------------------------------------------------

// `trocas`: o que entra no lugar da parede comum naquele trecho —
// { x, z, tipo, folha, portaId, rotulo }. `tipo` é a peça do kit (vão, janela)
// e `folha` a porta que vai no vão.
function erguer(trechos, y, trocas = []) {
  const mapa = new Map(trocas.map(t => [`${t.x},${t.z}`, t]));
  for (const t of trechos) {
    const troca = mapa.get(`${t.x},${t.z}`);
    if (troca?.tipo === 'nada') continue;   // vão largo: a peça vem depois, inteira
    por(troca?.tipo ?? 'Wall', t.x, y, t.z, t.rotY);
    if (!troca?.folha) continue;
    const [fx, , fz] = posicaoDaFolha([t.x, y, t.z], t.rotY);
    por(troca.folha, fx, y, fz, t.rotY, {
      ...(troca.portaId ? { portaId: troca.portaId } : {}),
      ...(troca.rotulo ? { rotulo: troca.rotulo } : {}),
    });
  }
}

const linha = (a, b, y, trocas) => erguer(trechosDaLinha(a, b), y, trocas);
const contorno = (r, y, trocas) => erguer(trechosDoComodo([r.x0, r.z0], [r.x1, r.z1]), y, trocas);

const celulas = r => celulasDoRetangulo([r.x0 + 0.5, r.z0 + 0.5], [r.x1 - 0.5, r.z1 - 0.5]);
const dentroDe = (r, [i, j]) => {
  const [x, z] = centroDaCelula([i, j]);
  return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
};

function assoalho(r, y, vazios = []) {
  for (const c of celulas(r)) {
    if (vazios.some(v => dentroDe(v, c))) continue;   // vão da escada
    const [x, z] = centroDaCelula(c);
    por('Floor', x, y, z);
  }
}

function telhado(r, y, vazios = []) {
  const cobertas = celulas(r).filter(c => !vazios.some(v => dentroDe(v, c)));
  for (const telha of telhasDoComodo(cobertas)) por(telha.typeId, telha.x, y, telha.z, telha.rotY);
}

// --- O terreno ------------------------------------------------------------------

const LOTE = { x0: -14, x1: 14, z0: -64, z1: -34 };      // muro
const PREDIO = { x0: -10, x1: 6, z0: -58, z1: -46 };     // 16 x 12, dois andares
const GARAGEM = { x0: 6, x1: 12, z0: -50, z1: -42 };
const ANDAR = 2.4;            // altura de um pavimento no kit
const PISO = 0.1;             // espessura da placa: o chão do andar fica em y + 0.1
const TERREO = 0;
const ALTO = ANDAR;
const TOPO = 2 * ANDAR;
const yTerreo = TERREO + PISO;
const yAlto = ALTO + PISO;
// Vão da escada: o 1º andar não tem piso por cima do lance.
const VAO_ESCADA = { x0: -10, x1: -6, z0: -58, z1: -52 };

const janela = (x, z, tipo = 'Wall_Window_Square') => ({ x, z, tipo });
const vao = (x, z) => ({ x, z, tipo: 'Wall_Doorway_Square' });
const porta = (x, z, portaId, rotulo, folha = 'Wooden_Door') =>
  ({ x, z, tipo: 'Wall_Doorway_Square', folha, portaId, rotulo });

// Muro do terreno, com o portão de pedestre e o vão do portão da garagem.
contorno(LOTE, TERREO, [
  porta(-5, -34, 'portao', 'Portão da rua', 'Grey_Door'),
  { x: 7, z: -34, tipo: 'nada' },
  { x: 9, z: -34, tipo: 'nada' },
]);
por('Wall_Doorway_Wide', 8, TERREO, -34, Math.PI / 2);

// Calçada interna: do portão até a porta do prédio, e a entrada da garagem.
for (let z = -45; z <= -35; z += 2) por('Floor', -5, TERREO, z);
for (let z = -41; z <= -35; z += 2) { por('Floor', 7, TERREO, z); por('Floor', 9, TERREO, z); }

// --- Térreo: saguão, salão de festas, área de serviço e garagem -----------------

assoalho(PREDIO, TERREO);
assoalho(GARAGEM, TERREO);

contorno(PREDIO, TERREO, [
  porta(-5, -46, 'entrada', 'Sair do prédio'),
  janela(-9, -46), janela(1, -46), janela(3, -46),
  janela(-5, -58), janela(-1, -58), janela(3, -58),
  janela(-10, -53), janela(-10, -57),
  janela(6, -53), janela(6, -57),
  porta(6, -47, 'garagem', 'Porta da garagem'),
]);
// Saguão | escada | salão, e a área de serviço ao lado do saguão.
linha([-10, -50], [6, -50], TERREO, [
  vao(-9, -50),
  porta(-3, -50, 'salao', 'Salão de festas'),
]);
linha([-6, -58], [-6, -50], TERREO);
linha([-2, -50], [-2, -46], TERREO, [porta(-2, -49, 'servico', 'Área de serviço')]);

// Garagem: paredes e portão largo na frente.
linha([6, -50], [12, -50], TERREO);
linha([12, -50], [12, -42], TERREO);
linha([6, -42], [12, -42], TERREO, [{ x: 7, z: -42, tipo: 'nada' }, { x: 9, z: -42, tipo: 'nada' }]);
por('Wall_Doorway_Wide', 8, TERREO, -42, Math.PI / 2);
telhado(GARAGEM, ALTO);

// Escada do saguão até o patamar do 1º andar (sobe no +z do modelo).
por('Stairs_Closed', -8, TERREO, -54);

// --- 1º andar: corredor e dois apartamentos ---------------------------------------

assoalho(PREDIO, ALTO, [VAO_ESCADA]);
contorno(PREDIO, ALTO, [
  janela(-9, -46), janela(-5, -46), janela(-1, -46), janela(3, -46),
  janela(-5, -58), janela(-1, -58), janela(3, -58),
  janela(-10, -51), janela(-10, -57),
  janela(6, -57), janela(6, -53), janela(6, -49),
]);
linha([-10, -50], [6, -50], ALTO, [
  vao(-9, -50),
  porta(-3, -50, 'ap101', 'Apartamento 101'),
  porta(3, -50, 'ap102', 'Apartamento 102'),
]);
linha([-6, -58], [-6, -50], ALTO);     // vão da escada | apê 101
linha([0, -58], [0, -50], ALTO);       // apê 101 | apê 102
// Apê 101: quarto e banheiro ao fundo, sala e cozinha na frente.
linha([-6, -54], [0, -54], ALTO, [
  porta(-5, -54, null, 'Quarto'),
  porta(-1, -54, null, 'Banheiro'),
]);
linha([-2, -58], [-2, -54], ALTO);
// Apê 102, espelhado.
linha([0, -54], [6, -54], ALTO, [
  porta(1, -54, null, 'Banheiro'),
  porta(5, -54, null, 'Quarto'),
]);
linha([2, -58], [2, -54], ALTO);

telhado(PREDIO, TOPO);

// --- Móveis ------------------------------------------------------------------------

const Q = Math.PI / 2;
const movel = (typeId, x, z, rotY = 0, props, y = yAlto) => por(typeId, x, y, z, rotY, props);
const luz = (x, z, y) => por('Light_Ceiling', x, y, z);

// Saguão: caixa de correio, banco e planta.
movel('Shelf_Small', -9.5, -47.2, Q, { rotulo: 'Caixas de correio', texto: 'Nada na sua caixa hoje.' }, yTerreo);
movel('Couch_Small', -7.5, -46.6, Math.PI, { rotulo: 'Banco do saguão', texto: 'O banco do saguão, onde ninguém nunca senta.' }, yTerreo);
movel('Houseplant-bfLOqIV5uP', -2.6, -46.6, 0, { rotulo: 'Samambaia', texto: 'A samambaia da portaria, viva por teimosia.' }, yTerreo);
luz(-6, -48, ANDAR - 0.05);

// Salão de festas: mesas, cadeiras e uma cozinha pequena.
movel('Table_Round_Large', -2, -53, 0, { rotulo: 'Mesa do salão', texto: 'O salão de festas, reservado pelo grupo do prédio com um mês de antecedência.' }, yTerreo);
movel('Chair', -3.4, -53, Q, undefined, yTerreo);
movel('Chair', -0.6, -53, -Q, undefined, yTerreo);
movel('Table_Round_Small', 3, -53, 0, undefined, yTerreo);
movel('Chair', 3, -54.2, 0, undefined, yTerreo);
movel('Chair', 3, -51.8, Math.PI, undefined, yTerreo);
movel('Kitchen_Sink', 5.4, -56.5, -Q, { rotulo: 'Pia do salão', texto: 'A pia do salão. Alguém deixou um copo aqui desde o último aniversário.' }, yTerreo);
movel('Oven', 5.4, -55.4, -Q, undefined, yTerreo);
movel('Kitchen_Fridge', 5.3, -54.2, -Q, undefined, yTerreo);
movel('Houseplant-dveIJ0xNpX', -5.3, -57.3, 0, undefined, yTerreo);
movel('Trashcan', -5.4, -50.7, 0, undefined, yTerreo);
luz(-2, -53, ANDAR - 0.05);
luz(3, -55, ANDAR - 0.05);

// Área de serviço do condomínio.
movel('Washing_Machine', 5.3, -49.4, -Q, { rotulo: 'Máquina de lavar', texto: 'A máquina do condomínio, que todo mundo usa e ninguém limpa.' }, yTerreo);
movel('Trashcan_Large', 5.4, -47.8, -Q, undefined, yTerreo);
luz(0, -48, ANDAR - 0.05);

// Garagem: o fusca do vizinho.
movel('fusca', 9, -46.5, 0, { rotulo: 'Fusca do 102', texto: 'O fusca do vizinho do 102. Ele diz que ainda pega.' }, TERREO);
movel('Trashcan_Small', 11.3, -49.2, 0, undefined, yTerreo);

// Escada, patamar e corredor.
luz(-8, -51, ANDAR - 0.05);
luz(-6, -48, TOPO - 0.05);
luz(2, -48, TOPO - 0.05);
movel('Houseplant-f6GPjbEgg0', -9.4, -46.7);

// Apê 101 — quarto (onde o jogador acorda).
movel('Bed_King', -4.2, -56.4, 0, { rotulo: 'Sua cama', texto: 'A cama ainda está desarrumada. Dá pra deixar assim.' });
movel('Night_Stand', -5.6, -56.6, 0);
movel('Table_Lamp', -5.6, -56.6, 0, { rotulo: 'Abajur', texto: 'O abajur pisca uma vez antes de acender direito.' }, yAlto + 0.41);
// Longe da porta do quarto (vão em x = -5): encostada na parede do banheiro.
movel('Drawer-T4uDbyP90C', -2.5, -56.2, -Q, { rotulo: 'Cômoda', texto: 'Roupa suficiente pra uma semana, se você não for exigente.' });
movel('Rug', -3.4, -55, 0);
luz(-4, -56, TOPO - 0.05);
// Apê 101 — banheiro.
movel('Toilet', -1.4, -57.3, Q, { rotulo: 'Vaso', texto: 'Tudo em ordem por aqui.' });
movel('Bathtub', -0.6, -56, 0, { rotulo: 'Box', texto: 'O chuveiro pinga. Sempre pingou.' });
movel('Bathroom_Sink', -1.6, -55.8, -Q, { rotulo: 'Pia do banheiro', texto: 'A água sai gelada primeiro.' });
movel('Towel_Rack', -0.4, -54.7, Math.PI);
luz(-1, -56, TOPO - 0.05);
// Apê 101 — sala e cozinha.
// Encostados nas paredes: o caminho do quarto até a porta do apê passa no meio.
movel('Couch_Medium', -5.3, -52, Q, { rotulo: 'Sofá', texto: 'O sofá afunda de um lado só.' });
movel('Table_Round_Small', -4.2, -51.2, 0, { rotulo: 'Mesa', texto: 'A mesa balança se você apoiar o cotovelo.' });
movel('Shelf_Large', -4.6, -50.3, 0, { rotulo: 'Estante', texto: 'A estante tem mais caixa de mudança do que livro.' });
movel('Kitchen_Fridge', -0.6, -53.2, Math.PI, { rotulo: 'Geladeira', texto: 'Quase vazia. Precisa fazer compras.' });
movel('Kitchen_Sink', -0.6, -52, Math.PI, { rotulo: 'Pia da cozinha', texto: 'Louça de ontem, ainda na pia.' });
movel('Oven', -0.6, -50.9, Math.PI);
movel('Round_Rug', -3, -51.6, 0);
luz(-3, -52, TOPO - 0.05);

// Apê 102 — o vizinho.
movel('Bed_Single', 1.2, -56.6, 0);
movel('Night_Stand-7cobkfclNv', 2.2, -56.8, 0);
movel('Drawer', 3.6, -54.5, Math.PI);
movel('Toilet', 4.6, -57.3, -Q);
movel('Bathroom_Sink', 5.4, -55, -Q);
movel('Couch_Small', 3.2, -52.6, 0);
movel('Table_Round_Small', 3.2, -51.4, 0);
movel('Kitchen_Fridge', 5.4, -53.2, -Q);
movel('Kitchen_Sink', 5.4, -52, -Q);
movel('Houseplant-VtJh4Irl4w', 0.6, -51, 0);
luz(2, -56, TOPO - 0.05);
luz(4, -52, TOPO - 0.05);

// Onde o jogador acorda: ao lado da cama, olhando pra porta do quarto.
itens.push({ typeId: 'spawn', position: [-3.2, r3(yAlto), -55.2], rotY: 0 });

// --- Grava ---------------------------------------------------------------------------

const dentroDoLote = it => it.position[0] >= LOTE.x0 && it.position[0] <= LOTE.x1
  && it.position[2] >= LOTE.z0 && it.position[2] <= LOTE.z1;
const antigos = SCENE.items.filter(it => !dentroDoLote(it));
writeFileSync(join(RAIZ, 'src/data/scene.js'), textoDoScene({ cidade: SCENE.cidade, items: [...antigos, ...itens] }));

const conta = {};
for (const it of itens) conta[it.typeId] = (conta[it.typeId] ?? 0) + 1;
console.log(`${itens.length} peças no terreno do prédio inicial (${SCENE.items.length - antigos.length} trocadas).`);
console.log(Object.entries(conta).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '));
