# Ecos da Cidade

Um RPG 3D para navegador, ambientado numa cidade moderna qualquer. Não há
missão para dominar a cidade, roubar carros ou escalar um império do crime —
o jogo é sobre chegar a um lugar novo, observar e se conectar com pequenas
histórias que normalmente passam despercebidas no ritmo do dia a dia.

Pense nele como um primo contemplativo do GTA: mesma ideia de cidade viva e
explorável em terceira pessoa, sentido oposto — sem violência, sem caos,
sem pressa. Um ciclo de dia e noite real, NPCs com rotinas próprias,
conversas com consequência leve, e fragmentos de memória escondidos pela
cidade para fotografar.

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

- **Uma cidade gerada por blocos**: praça central com fonte, dois parques
  arborizados e quarteirões urbanos com prédios de alturas e cores variadas
  (com colisão real — nada de atravessar paredes).
- **Ciclo de dia e noite** contínuo: o sol se move, o céu muda de cor,
  janelas dos prédios acendem e os postes de luz ligam sozinhos à noite.
- **Cinco NPCs com rotina própria**: um vendedor ambulante na praça, uma
  mulher que perdeu um livro no parque, um rapaz grudado no celular, uma
  musicista de rua e um corredor no parque — cada um com diálogo próprio.
- **Missões pequenas e humanas**: nada de "mate 10 inimigos". São conversas,
  favores e reencontros — inclusive uma que só acontece se você voltar a
  falar com alguém depois que a noite cair.
- **Fragmentos de memória**: pontos de luz dourada espalhados pela cidade.
  Aproxime-se e pressione `F` para "fotografar" — a captura vira uma
  miniatura real da cena, guardada no diário.
- **Diário e minimapa**: acompanhe missões ativas, veja sua galeria de
  fotos e se oriente pela cidade num minimapa circular com rotação.
- **Progresso salvo automaticamente** (e ao pausar) via `localStorage` —
  dá para fechar o navegador e continuar de onde parou.

## Estrutura do projeto

```
index.html          Estrutura da página e overlay de UI
style.css            Estilo do HUD, menus, diário e diálogo
src/
  data.js            Configuração do mundo, layout da cidade, NPCs,
                      diálogos, missões e colecionáveis (fonte de verdade)
  world.js            Geração da cidade em three.js, iluminação e ciclo dia/noite
  player.js           Personagem, controle em terceira pessoa e câmera
  npc.js              NPCs com IA simples de vagar e props temáticos
  interactions.js     Sistemas de missão, diálogo e colecionáveis
  ui.js               HUD, minimapa, diálogo, diário e telas de menu
  save.js             Persistência em localStorage
  main.js             Loop principal do jogo e entrada (teclado/mouse)
vendor/
  three.module.js     three.js (build ESM), incluso localmente
```

Todo o conteúdo do jogo (layout da cidade, textos de diálogo, missões,
posições de colecionáveis) fica centralizado em `src/data.js` — é o
primeiro lugar para expandir a história ou adicionar novos personagens.

## Por que não usar um CDN para o three.js?

O three.js vem versionado em `vendor/three.module.js` (build oficial da
versão 0.160.0, minificada) em vez de carregado via CDN, para que o jogo
funcione de forma previsível em qualquer ambiente — inclusive redes
restritas ou hospedagem offline — sem depender de terceiros em runtime.
