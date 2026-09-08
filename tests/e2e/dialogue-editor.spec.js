import { test, expect } from '@playwright/test';

// A-03: o editor de diálogos precisa oferecer o mesmo vocabulário que o motor
// aceita — e, acima de tudo, jamais trocar por outro um tipo que ele não
// conhece. Os testes unitários cobrem as funções puras; estes cobrem o que só
// aparece no navegador: o que o <select> mostra e o que sai no "Exportar JSON".

const DRAFT_KEY = 'dialogue-editor-draft';

const SEMENTE = {
  almeida: {
    startRules: [
      { if: [{ type: 'flag', flag: 'ja_conheceu', value: true }], node: 'ret' },
      { if: [{ type: 'relationship', npc: 'marina', operator: '>=', value: 3 }], node: 'amigo' },
      { if: [{ type: 'algumTipoNovo', foo: 'bar', lista: [1, 2] }], node: 'ret' },
      { if: [{ type: 'not', of: { type: 'hasMetPlayer' } }], node: 'novo' },
    ],
    startDefault: 'novo',
    nodes: {
      novo: {
        text: 'Oi.',
        options: [
          { label: 'Marcar flag', next: null, effect: { type: 'setFlag', flag: 'ja_conheceu', value: true } },
          { label: 'Ajudar', next: null, effect: { type: 'changeRelationship', npc: 'almeida', amount: 1, note: 'Você ajudou com a caixa' } },
          { label: 'Estranho', next: null, effect: { type: 'algumEfeitoNovo', foo: 'bar' } },
          { label: 'Nada', next: null },
        ],
      },
      ret: { text: 'De novo?', options: [] },
      amigo: { text: 'Amigo!', options: [] },
    },
  },
};

async function abrirComRascunho(page, semente = SEMENTE) {
  await page.goto('/dialogue-editor.html');
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [DRAFT_KEY, semente]);
  await page.reload();
  await page.waitForSelector('#start-rules-list .condition-row');
}

async function exportar(page) {
  await page.click('#btn-export');
  const texto = await page.inputValue('#export-output');
  await page.click('#btn-close-export');
  return JSON.parse(texto);
}

const condType = i => `#start-rules-list .rule-row[data-ri="${i}"] select[data-act="cond-type"]`;
const optEffect = i => `#options-list .option-row[data-oi="${i}"] select[data-act="opt-effect"]`;

test('abre um diálogo com flag/relationship/setFlag/changeRelationship e exporta sem perder nada', async ({ page }) => {
  await abrirComRascunho(page);

  // Cada condição aparece como ela mesma, não como o primeiro tipo da lista.
  await expect(page.locator(condType(0))).toHaveValue('flag');
  await expect(page.locator(condType(1))).toHaveValue('relationship');
  await expect(page.locator(condType(3))).toHaveValue('hasMetPlayer'); // o `not` vira a caixinha "negar"
  await expect(page.locator('#start-rules-list .rule-row[data-ri="3"] [data-act="cond-negate"]')).toBeChecked();

  // Os parâmetros de cada tipo chegam nos campos certos.
  await expect(page.locator('[data-act="cond-flag"][data-ri="0"]')).toHaveValue('ja_conheceu');
  await expect(page.locator('[data-act="cond-flag-kind"][data-ri="0"]')).toHaveValue('true');
  await expect(page.locator('[data-act="cond-npc"][data-ri="1"]')).toHaveValue('marina');
  await expect(page.locator('[data-act="cond-operator"][data-ri="1"]')).toHaveValue('>=');
  await expect(page.locator('[data-act="cond-relvalue"][data-ri="1"]')).toHaveValue('3');

  await expect(page.locator(optEffect(0))).toHaveValue('setFlag');
  await expect(page.locator('[data-act="opt-effect-flag"][data-oi="0"]')).toHaveValue('ja_conheceu');
  await expect(page.locator(optEffect(1))).toHaveValue('changeRelationship');
  await expect(page.locator('[data-act="opt-effect-npc"][data-oi="1"]')).toHaveValue('almeida');
  await expect(page.locator('[data-act="opt-effect-amount"][data-oi="1"]')).toHaveValue('1');
  await expect(page.locator('[data-act="opt-effect-note"][data-oi="1"]')).toHaveValue('Você ajudou com a caixa');

  // Só abrir e exportar não pode mudar uma vírgula.
  expect(await exportar(page)).toEqual(SEMENTE);
});

test('tipo desconhecido: aparece como desconhecido, não como outro tipo, e sobrevive ao export', async ({ page }) => {
  await abrirComRascunho(page);

  // O bug do A-03: o select não tinha <option> pro tipo, o navegador marcava o
  // primeiro ("Missão concluída") e o editor mentia sobre o que estava no dado.
  await expect(page.locator(condType(2))).toHaveValue('algumTipoNovo');
  await expect(page.locator(condType(2)).locator('option:checked')).toContainText('desconhecido');
  await expect(page.locator('#start-rules-list .rule-row[data-ri="2"] .unknown-payload')).toContainText('"foo":"bar"');

  await expect(page.locator(optEffect(2))).toHaveValue('algumEfeitoNovo');
  await expect(page.locator(optEffect(2)).locator('option:checked')).toContainText('desconhecido');

  // Opção sem efeito continua sendo "(Nenhum)" — não se confunde com desconhecido.
  await expect(page.locator(optEffect(3))).toHaveValue('');

  expect(await exportar(page)).toEqual(SEMENTE);
});

test('sair de um tipo desconhecido exige confirmação; recusar não altera o dado', async ({ page }) => {
  await abrirComRascunho(page);
  page.on('dialog', d => d.dismiss()); // o autor diz "não, deixa como está"

  await page.selectOption(condType(2), 'isNight');
  await expect(page.locator(condType(2))).toHaveValue('algumTipoNovo', { timeout: 5000 });

  await page.selectOption(optEffect(2), 'startQuest');
  await expect(page.locator(optEffect(2))).toHaveValue('algumEfeitoNovo');

  expect(await exportar(page)).toEqual(SEMENTE);
});

test('criar e editar os tipos novos grava exatamente o formato que o motor lê', async ({ page }) => {
  await abrirComRascunho(page);

  // Condição: parte de "missão concluída" e vira uma comparação de relacionamento.
  await page.click('#start-rules-list .rule-row[data-ri="3"] [data-act="add-cond"]');
  const novaCond = '#start-rules-list .rule-row[data-ri="3"] .condition-row:nth-child(2) select[data-act="cond-type"]';
  await page.selectOption(novaCond, 'relationship');
  await page.selectOption('[data-act="cond-npc"][data-ri="3"][data-ci="1"]', 'diego');
  await page.selectOption('[data-act="cond-operator"][data-ri="3"][data-ci="1"]', '<');
  await page.fill('[data-act="cond-relvalue"][data-ri="3"][data-ci="1"]', '-2');

  // Efeito: opção sem efeito ganha um setFlag com valor de texto.
  await page.selectOption(optEffect(3), 'setFlag');
  await page.fill('[data-act="opt-effect-flag"][data-oi="3"]', 'capitulo');
  await page.selectOption('[data-act="opt-effect-flag-kind"][data-oi="3"]', 'text');
  await page.fill('[data-act="opt-effect-flag-text"][data-oi="3"]', 'dois');

  const saida = await exportar(page);

  expect(saida.almeida.startRules[3].if).toEqual([
    { type: 'not', of: { type: 'hasMetPlayer' } },
    { type: 'relationship', npc: 'diego', operator: '<', value: -2 },
  ]);
  // value tem que ser número, não "-2": o motor compara com > e <.
  expect(typeof saida.almeida.startRules[3].if[1].value).toBe('number');

  expect(saida.almeida.nodes.novo.options[3].effect).toEqual({ type: 'setFlag', flag: 'capitulo', value: 'dois' });
  // E `true` tem que ser booleano, não a string "true": o motor compara com ===.
  expect(saida.almeida.nodes.novo.options[0].effect.value).toBe(true);

  // Nada fora do que foi editado pode ter mudado.
  expect(saida.almeida.startRules.slice(0, 3)).toEqual(SEMENTE.almeida.startRules.slice(0, 3));
  expect(saida.almeida.nodes.novo.options[2].effect).toEqual({ type: 'algumEfeitoNovo', foo: 'bar' });
});

test('trocar entre tipos conhecidos preserva os campos que os dois usam', async ({ page }) => {
  await abrirComRascunho(page, {
    almeida: {
      startRules: [{ if: [{ type: 'questDone', quest: 'livro_esquecido' }], node: 'a' }],
      startDefault: 'a',
      nodes: { a: { text: 'oi', options: [] } },
    },
  });

  await page.selectOption(condType(0), 'questActive');
  const saida = await exportar(page);
  expect(saida.almeida.startRules[0].if[0]).toEqual({ type: 'questActive', quest: 'livro_esquecido' });
});
