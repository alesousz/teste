// Cena da cidade — landmarks, NPCs, fragmentos e prédios/decoração
// customizados, no mesmo formato que o editor de mapa (dialogue-editor.html
// tem seu par em src/data/dialogues.json) exporta e lê. Isso permite editar
// visualmente o layout do jogo em vez de mexer direto no código.
//
// O conteúdo abaixo reproduz EXATAMENTE as posições que já existiam
// hardcoded em data.js antes dessa integração — abrir o editor de mapa,
// carregar esta cena, mover algo e exportar de volta aqui é o fluxo
// esperado daqui pra frente.
export const SCENE = {
  items: [
    { typeId: 'landmark_home_operario', position: [-100, 0, 0], rotY: 0 },
    { typeId: 'landmark_job_mercado', position: [-50, 0, -50], rotY: 0 },
    { typeId: 'landmark_home_nobre', position: [100, 0, 0], rotY: 0 },
    { typeId: 'landmark_school', position: [50, 0, 50], rotY: 0 },

    { typeId: 'npc', position: [-6, 0, 5], rotY: 0, props: { npcId: 'almeida' } },
    { typeId: 'npc', position: [-47, 0, 46], rotY: 0, props: { npcId: 'marina' } },
    { typeId: 'npc', position: [8, 0, -7], rotY: 0, props: { npcId: 'diego' } },
    { typeId: 'npc', position: [0, 0, 10], rotY: 0, props: { npcId: 'busker' } },
    { typeId: 'npc', position: [45, 0, -44], rotY: 0, props: { npcId: 'runner' } },
    { typeId: 'npc', position: [-100, 0, 7.5], rotY: 0, props: { npcId: 'mae_operaria' } },
    { typeId: 'npc', position: [-50, 0, -41], rotY: 0, props: { npcId: 'seu_ivo' } },
    { typeId: 'npc', position: [100, 0, 9.5], rotY: 0, props: { npcId: 'mae_nobre' } },
    { typeId: 'npc', position: [50, 0, 62], rotY: 0, props: { npcId: 'professora' } },

    { typeId: 'fragment', position: [3, 0, 3], rotY: 0, props: { note: 'A luz da fonte da praça ao entardecer.' } },
    { typeId: 'fragment', position: [-50, 0, 42], rotY: 0, props: { note: 'Uma árvore solitária no meio do concreto.' } },
    { typeId: 'fragment', position: [54, 0, -53], rotY: 0, props: { note: 'Risos distantes num banco de parque.' } },
    { typeId: 'fragment', position: [-10, 0, -12], rotY: 0, props: { note: 'Um reflexo de neon numa poça d\'água.' } },
    { typeId: 'fragment', position: [44, 0, -42], rotY: 0, props: { note: 'O silêncio raro entre duas buzinas.' } },
  ],
};
