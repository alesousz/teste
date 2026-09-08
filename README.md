# Ecos da Cidade

Um RPG 3D para navegador, ambientado numa cidade moderna qualquer. Não há
missão para dominar a cidade, roubar carros ou escalar um império do crime —
o jogo é sobre viver uma vida ali dentro: acordar, cumprir uma rotina,
sustentar relações, e se conectar com pequenas histórias que normalmente
passam despercebidas no dia a dia.

Pense nele como um cruzamento entre GTA (cidade viva, terceira pessoa, mundo
aberto) e The Sims em formato de RPG narrativo: você cria um personagem que
nasce numa origem específica — isso muda quem é sua família, onde mora,
quanto dinheiro tem e que compromisso (emprego ou escola) precisa cumprir
todo dia, com consequência real se você faltar. Um ciclo de dia e noite
real, necessidades simples (energia, dinheiro), NPCs com rotinas próprias,
conversas com consequência, e fragmentos de memória escondidos pela cidade
para fotografar nas horas livres.

## Como jogar

Não há build nem dependências para instalar — é HTML/JS puro com o
[three.js](https://threejs.org/) já incluso em `vendor/`. Basta servir os
arquivos estáticos (abrir `index.html` direto do disco não funciona por
causa das regras de CORS dos módulos ES).

```bash
npm install   # opcional, só traz o http-server como conveniência
npm run dev   # sobe em http://localhost:8080
```

Ou, sem Node, com qualquer servidor estático:

```bash
python3 -m http.server 8080
```

Depois é só abrir `http://localhost:8080` no navegador.

## Controles

| Ação                     | Tecla                          |
|---------------------------|---------------------------------|
| Mover                     | `W A S D`                      |
| Correr                    | `Shift`                         |
| Olhar ao redor            | Mouse (clique na tela para travar o cursor) |
| Interagir / conversar     | `E`                              |
| Fotografar fragmento      | `F`                              |
| Abrir diário de missões   | `Tab`                            |
| Pausar                    | `Esc` (ou mover o mouse para fora do cursor travado) |

## O que existe para explorar

- **Criação de personagem**: nome, sexo (afeta pronomes usados por NPCs
  próximos, como a família) e origem — hoje duas: **Bairro Operário**
  (começa com R$60, mora numa casa simples e tem um turno fixo no mercado)
  ou **Bairro Nobre** (começa com R$250, mora numa casa grande e tem aula
  numa escola nova). A origem decide sua casa, sua família e seu compromisso
  diário — os personagens da "outra" origem existem no mundo, mas te tratam
  como um estranho educado, não como família.
- **Rotina com compromisso fixo**: seu emprego ou escola tem horário
  (08:00–14:00). Aparecer dentro da janela conta como presença e paga ao
  final do dia; faltar gera aviso e, depois de faltas demais, demissão ou
  expulsão — com diálogo de família e chefe/professora reagindo ao seu
  histórico.
- **Necessidades simples**: uma barra de Energia (drena com o tempo
  acordado, restaura dormindo em casa) e Dinheiro (ganho trabalhando,
  gasto em pequenas coisas como um café que recupera energia). Ficar
  exausto deixa você mais lento e sem poder correr.
- **Dormir avança o dia**: interaja com o ponto de descanso perto de casa
  pra recuperar energia total e pular pra manhã seguinte — processando o
  resultado do dia anterior (pagamento ou falta).
- **Uma cidade gerada por blocos**: praça central com fonte, dois parques
  arborizados, marcos fixos (as duas casas, o mercado, a escola) e
  quarteirões urbanos com prédios de alturas e cores variadas (com colisão
  real — nada de atravessar paredes).
- **Ciclo de dia e noite** contínuo: o sol se move, o céu muda de cor,
  janelas dos prédios acendem e os postes de luz ligam sozinhos à noite.
- **NPCs com rotina própria**: família, chefe/professora, um vendedor
  ambulante na praça, uma mulher que perdeu um livro no parque, um rapaz
  grudado no celular, uma musicista de rua e um corredor no parque — cada
  um com diálogo próprio.
- **Missões pequenas e humanas** além da rotina obrigatória: nada de "mate
  10 inimigos". São conversas, favores e reencontros — inclusive uma que só
  acontece se você voltar a falar com alguém depois que a noite cair.
- **Fragmentos de memória**: pontos de luz dourada espalhados pela cidade.
  Aproxime-se e pressione `F` para "fotografar" — a captura vira uma
  miniatura real da cena, guardada no diário.
- **Diário e minimapa**: acompanhe missões ativas, veja sua galeria de
  fotos e se oriente pela cidade num minimapa circular com rotação.
- **Progresso salvo automaticamente** (e ao pausar) via `localStorage` —
  dá para fechar o navegador e continuar de onde parou, incluindo seu
  personagem, necessidades e histórico da rotina.

## Estrutura do projeto

```
index.html          Estrutura da página e overlay de UI
style.css            Estilo do HUD, menus, diário e diálogo
src/
  data.js            Configuração do mundo, layout da cidade, marcos
                      (casas/mercado/escola), origens, NPCs, diálogos,
                      missões e colecionáveis (fonte de verdade)
  world.js            Geração da cidade em three.js, iluminação e ciclo dia/noite
  player.js           Personagem, controle em terceira pessoa e câmera
  npc.js              NPCs com IA simples de vagar e props temáticos
  interactions.js     Sistemas de missão e diálogo (lógica pura, sem three.js)
  collectibles.js     Colecionáveis: fragmentos, livro e itens pelo mundo
  gameState.js        Flags, relacionamentos por NPC e estado do mundo
  inventory.js        Inventário e uso de itens
  needs.js            Necessidades simplificadas (energia, fome, dinheiro)
  schedule.js         Rotina/compromisso fixo (presença, pagamento, demissão)
  ui.js               HUD, criação de personagem, bússola, diálogo, diário e menus
  save.js             Persistência em localStorage
  main.js             Loop principal do jogo e entrada (teclado/mouse)
vendor/
  three.module.js     three.js (build ESM), incluso localmente
tests/
  unit/               Testes de lógica pura em Node (sem navegador)
  e2e/                Testes de ponta a ponta no navegador (Playwright)
```

Todo o conteúdo do jogo (layout da cidade, textos de diálogo, missões,
posições de colecionáveis) fica centralizado em `src/data.js` — é o
primeiro lugar para expandir a história ou adicionar novos personagens.

## Testes

```bash
npm install        # só na primeira vez
npm run test:unit  # lógica pura em Node — rápido (segundos)
npm run test:e2e   # jogo real no navegador via Playwright — lento (minutos)
npm test           # os dois, em sequência
```

São duas camadas com propósitos diferentes:

- **`tests/unit/`** — roda no Node puro, sem navegador, usando o runner
  nativo (`node --test`). Cobre o que é lógica de dados e regra de jogo:
  `GameState` (flags, relacionamentos, migração de saves antigos),
  `NeedsSystem`, `InventorySystem`, `ObligationSystem`, `save.js`,
  `QuestSystem`/`DialogueSystem` (com árvores de diálogo sintéticas) e
  invariantes de `data.js` — por exemplo, que todo curso aponta para uma
  obrigação que existe e que nenhum prédio gerado vaza para fora do
  quarteirão. É a camada que dá retorno em segundos.

- **`tests/e2e/`** — sobe o jogo de verdade num Chromium headless e
  interage com ele. Cobre o que só existe integrado: boot, criação de
  personagem, save/load através do `localStorage` real, combate, bússola,
  diário e menus. Cada teste inicializa o jogo inteiro (cidade procedural
  + WebGL por software), então é naturalmente lento — os testes rodam em
  série de propósito (`workers: 1`), porque em paralelo eles competem por
  CPU e derrubam uns aos outros por timeout.

Ambas as camadas rodam no CI (`.github/workflows/test.yml`) a cada push na
`main` e em cada pull request.

Um caso específico merece nota: `tests/e2e/compass.spec.js` existe porque o
sinal do `bearingTo()` da bússola já foi revertido várias vezes ao aplicar
arquivos de UI gerados fora do repositório. O teste falha automaticamente se
isso acontecer de novo, em vez de depender de alguém reparar à mão.

Pelo mesmo motivo existe `tests/unit/dialogueEditorVocabulary.test.js`: o
vocabulário de condições e efeitos de diálogo é definido em dois lugares — o
`switch` de `DialogueSystem` (`src/interactions.js`, que é a fonte de verdade)
e a lista declarativa que o editor usa (`src/dialogue-editor/vocabulary.js`).
Esse teste lê o fonte do motor e falha se os dois divergirem, inclusive nos
campos de cada tipo. Ao acrescentar um tipo novo ao motor, atualize a lista do
editor — o teste diz exatamente o que falta.

## Por que não usar um CDN para o three.js?

O three.js vem versionado em `vendor/three.module.js` (build oficial da
versão 0.160.0, minificada) em vez de carregado via CDN, para que o jogo
funcione de forma previsível em qualquer ambiente — inclusive redes
restritas ou hospedagem offline — sem depender de terceiros em runtime.
