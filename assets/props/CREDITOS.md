# Origem dos modelos em assets/props

Modelos feitos no projeto ficam soltos nesta pasta. Pacotes de terceiros ficam
cada um na sua subpasta, com um `indice.json` que o editor de mapa lê
(regerar com `node tools/gerar-indices-props.mjs` depois de copiar arquivos).

## Feitos no projeto

Gerados pelos scripts de `tools/blender/` (rodar de novo o script regera o arquivo):

| Arquivo | Script |
|---|---|
| `moveis.glb` | `tools/blender/moveis.py` |
| `fusca.glb` | `tools/blender/fusca.py` |
| `itens.glb` | `tools/blender/itens.py` |
| `velhinho.glb` | `tools/blender/velhinho.py` |

## De terceiros

Os dois pacotes são da Quaternius, licença **CC0 1.0** (domínio público): uso
livre, inclusive comercial, sem exigência de crédito — fica registrado aqui
mesmo assim. Licenças conferidas nas páginas oficiais em 13/09/2026.

### `quaternius-animals/` — Ultimate Animated Animal Pack

- Página: https://quaternius.com/packs/ultimateanimatedanimals.html
- 12 animais: `Alpaca`, `Bull`, `Cow`, `Deer`, `Donkey`, `Fox`, `Horse`, `Husky`,
  `Shiba_Inu`, `Stag`, `White_Horse`, `Wolf`.
- Alteração: só nomes de arquivo, espaço trocado por `_`
  (`Shiba Inu.glb`, `White Horse.glb`). Modelos e animações como vieram.

### `quaternius-house-interior/` — Ultimate House Interior Pack

- Página: https://quaternius.com/packs/ultimatehomeinterior.html
  (o site oferece FBX, OBJ e Blend; os `.glb` daqui têm o padrão de nome do
  Poly Pizza, que distribui o mesmo pacote:
  https://poly.pizza/bundle/Ultimate-House-Interior-Pack-2SXnFbwFzm).
- 82 dos 123 modelos do pacote. Os sufixos como `-Rlyhe93NNe` distinguem
  variantes do mesmo objeto.
- Alterações: nomes de arquivo com espaço trocado por `_`. Os modelos vêm numa
  escala ~2x maior que a do jogo (porta com 4,2 m, cadeira com 1,77 m), então o
  `indice.json` declara `escala: 0.5`; o arquivo em si não foi mexido.

### `quaternius-stylized-nature/` — Ultimate Stylized Nature Pack

- Página: https://quaternius.com/packs/ultimatestylizednature.html
  (os `.glb` daqui têm o padrão de nome do Poly Pizza:
  https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr).
- 12 arquivos com 55 variações: bétulas, árvores mortas, bordos, palmeiras,
  pinheiros, árvores comuns, arbustos, flores, grama e pedras. O pacote completo
  tem 63 modelos.
- Cada arquivo é uma fileira de variações (um nó raiz com um filho por versão);
  o `indice.json` declara `variacoes: true` e o editor mostra cada filho como um
  item. Já vêm em tamanho real (escala 1).
- Alteração: nomes de arquivo com espaço trocado por `_`.
