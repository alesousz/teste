// Retorno de interação dos objetos da cena. Uma linha curta por objeto — o
// suficiente pra a interação ter resposta, sem virar sistema de pensamento do
// personagem.
//
// A chave é o `props.interacao` da peça na cena (src/data/scene.js), que o
// editor de mapa deixa escolher em qualquer móvel. Peça sem interação não
// mostra prompt nenhum.
export const OBSERVACOES = {
  // Apartamento do jogador
  cama: 'A cama ainda está desarrumada. Dá pra deixar assim.',
  janela_quarto: 'Lá fora a cidade já está acordada. O barulho entra mesmo com a janela fechada.',
  abajur: 'O abajur pisca uma vez antes de acender direito.',
  armario: 'Roupa suficiente pra uma semana, se você não for exigente.',
  box_banho: 'O chuveiro pinga. Sempre pingou.',
  vaso: 'Tudo em ordem por aqui.',
  pia: 'A água sai gelada primeiro.',
  sofa: 'O sofá afunda de um lado só.',
  tv: 'O monitor liga com um estalo e não mostra nada de útil.',
  porta_retratos: 'Uma foto antiga, de antes da mudança.',
  mural_fotos: 'Recortes, bilhetes, um ímã torto. As coisas que você não jogou fora.',
  mesa: 'A mesa balança se você apoiar o cotovelo.',
  bancada: 'Louça de ontem, ainda na pia.',
  geladeira: 'Quase vazia. Precisa fazer compras.',
  maquina_lavar: 'A máquina do condomínio, que todo mundo usa e ninguém limpa.',

  // Áreas comuns do prédio
  caixa_correio: 'Nada na sua caixa hoje.',
  banco_saguao: 'O banco do saguão, onde ninguém nunca senta.',
  planta_saguao: 'A samambaia da portaria, viva por teimosia.',
  mesa_salao: 'O salão de festas, reservado pelo grupo do prédio com um mês de antecedência.',
  bancada_salao: 'A pia do salão. Alguém deixou um copo aqui desde o último aniversário.',
  carro_garagem: 'O fusca do vizinho do 102. Ele diz que ainda pega.',
  portao_garagem: 'O portão range quando alguém chega de madrugada.',
};
