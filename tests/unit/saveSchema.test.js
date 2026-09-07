import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateSave, SaveStatus, SAVE_VERSION, saveErrorMessage } from '../../src/saveSchema.js';

// Um save mínimo e válido, no formato que o jogo grava hoje.
function saveValido(overrides = {}) {
  return {
    version: SAVE_VERSION,
    timestamp: 1757260000000,
    player: { x: 12.5, z: -30, camYaw: 1.2 },
    timeOfDay: 0.42,
    dayCount: 3,
    quests: { boas_vindas: { active: true, done: false, objectives: { talk_almeida: { done: false, count: 0 } } } },
    collectedFragments: ['frag_1'],
    bookCollected: true,
    collectedWorldItems: ['worlditem_1'],
    inventory: { coffee: 2 },
    profile: { name: 'Alex', sex: 'f', courseId: 'engenharia' },
    needs: { energy: 80, hunger: 70, money: 45 },
    obligation: { attendedToday: false, misses: 1, active: true, lastProcessedDay: 2 },
    gameState: { flags: { x: true }, npcs: { marina: { rel: 2, talks: 1, lastDay: 1, lastTime: '08:00', log: [] } } },
    ...overrides,
  };
}

describe('validateSave — ausência de save', () => {
  test('null e undefined são "sem save", não erro', () => {
    assert.equal(validateSave(null).status, SaveStatus.EMPTY);
    assert.equal(validateSave(undefined).status, SaveStatus.EMPTY);
  });

  test('"sem save" não carrega mensagem de erro', () => {
    assert.equal(validateSave(null).message, undefined);
    assert.equal(saveErrorMessage(SaveStatus.EMPTY), null);
  });
});

describe('validateSave — save válido (não pode regredir)', () => {
  test('save completo é aceito e todos os campos sobrevivem intactos', () => {
    const original = saveValido();
    const r = validateSave(original);
    assert.equal(r.status, SaveStatus.OK);
    assert.deepEqual(r.save.player, { x: 12.5, z: -30, camYaw: 1.2 });
    assert.equal(r.save.timeOfDay, 0.42);
    assert.equal(r.save.dayCount, 3);
    assert.deepEqual(r.save.collectedFragments, ['frag_1']);
    assert.equal(r.save.bookCollected, true);
    assert.deepEqual(r.save.collectedWorldItems, ['worlditem_1']);
    assert.deepEqual(r.save.inventory, { coffee: 2 });
    assert.deepEqual(r.save.needs, { energy: 80, hunger: 70, money: 45 });
    assert.deepEqual(r.save.obligation, { attendedToday: false, misses: 1, active: true, lastProcessedDay: 2 });
    assert.deepEqual(r.save.profile, { name: 'Alex', sex: 'f', courseId: 'engenharia' });
    assert.deepEqual(r.save.quests, original.quests);
  });

  test('validar não muta o objeto original', () => {
    const original = saveValido();
    const copia = JSON.parse(JSON.stringify(original));
    validateSave(original);
    assert.deepEqual(original, copia);
  });

  test('save legado sem "version" continua sendo aceito', () => {
    const legado = saveValido();
    delete legado.version;
    const r = validateSave(legado);
    assert.equal(r.status, SaveStatus.OK);
    assert.equal(r.save.version, null, 'versão ausente é registrada como null, não inventada');
    assert.equal(r.save.dayCount, 3);
  });

  test('gameState é repassado como veio, pra não quebrar a migração relationships → npcs', () => {
    const antigo = saveValido({ gameState: { flags: {}, relationships: { seu_ivo: 12, marina: -3 } } });
    const r = validateSave(antigo);
    assert.equal(r.status, SaveStatus.OK);
    assert.deepEqual(r.save.gameState, { flags: {}, relationships: { seu_ivo: 12, marina: -3 } });
  });
});

describe('validateSave — A-01: save incompleto', () => {
  test('objeto vazio {} é inválido, não "jogo novo"', () => {
    const r = validateSave({});
    assert.equal(r.status, SaveStatus.MALFORMED);
    assert.ok(r.message);
  });

  test('save sem a chave player é inválido', () => {
    const semPlayer = saveValido();
    delete semPlayer.player;
    assert.equal(validateSave(semPlayer).status, SaveStatus.MALFORMED);
  });

  test('player null ou de tipo errado é inválido', () => {
    assert.equal(validateSave(saveValido({ player: null })).status, SaveStatus.MALFORMED);
    assert.equal(validateSave(saveValido({ player: 'texto' })).status, SaveStatus.MALFORMED);
    assert.equal(validateSave(saveValido({ player: [] })).status, SaveStatus.MALFORMED);
  });

  test('array e primitivos no lugar do save são inválidos', () => {
    assert.equal(validateSave([]).status, SaveStatus.MALFORMED);
    assert.equal(validateSave('texto').status, SaveStatus.MALFORMED);
    assert.equal(validateSave(42).status, SaveStatus.MALFORMED);
  });
});

describe('validateSave — A-08: tipos inválidos', () => {
  test('posição não numérica invalida o save (nunca chega ao Vector3)', () => {
    const r = validateSave(saveValido({ player: { x: 'abc', z: 'xyz', camYaw: 'nope' } }));
    assert.equal(r.status, SaveStatus.MALFORMED);
  });

  test('NaN e Infinity na posição invalidam o save', () => {
    assert.equal(validateSave(saveValido({ player: { x: NaN, z: 0 } })).status, SaveStatus.MALFORMED);
    assert.equal(validateSave(saveValido({ player: { x: 0, z: Infinity } })).status, SaveStatus.MALFORMED);
  });

  test('string numérica não é coagida — "5" não vira 5', () => {
    assert.equal(validateSave(saveValido({ player: { x: '5', z: '5' } })).status, SaveStatus.MALFORMED);
  });

  test('camYaw inválido é omitido, mas não invalida o save', () => {
    const r = validateSave(saveValido({ player: { x: 1, z: 2, camYaw: 'nope' } }));
    assert.equal(r.status, SaveStatus.OK);
    assert.equal('camYaw' in r.save.player, false, 'omitido para o Player usar seu próprio padrão');
    assert.equal(r.save.player.x, 1);
  });

  test('campos opcionais inválidos são omitidos, não corrigidos por palpite', () => {
    const r = validateSave(saveValido({
      timeOfDay: 'meio-dia',
      dayCount: -7,
      inventory: 'nada',
      needs: { energy: 'cheio', hunger: 70, money: -50 },
      obligation: { attendedToday: 'sim', misses: 2, active: true, lastProcessedDay: null },
      collectedFragments: 'frag_1',
    }));
    assert.equal(r.status, SaveStatus.OK);
    assert.equal('timeOfDay' in r.save, false);
    assert.equal('dayCount' in r.save, false);
    assert.equal('inventory' in r.save, false);
    assert.equal('collectedFragments' in r.save, false);
    assert.deepEqual(r.save.needs, { hunger: 70 }, 'energy e money inválidos saem; hunger válido fica');
    assert.deepEqual(r.save.obligation, { misses: 2, active: true, lastProcessedDay: null });
  });

  test('valores fora de faixa são limitados, não descartados', () => {
    const r = validateSave(saveValido({ timeOfDay: 5, needs: { energy: 999, hunger: -20, money: 10 } }));
    assert.equal(r.save.timeOfDay, 1);
    assert.equal(r.save.needs.energy, 100);
    assert.equal(r.save.needs.hunger, 0);
  });

  test('entradas ruins do inventário saem; as boas ficam', () => {
    const r = validateSave(saveValido({ inventory: { coffee: 2, snack: 'muitos', homeMeal: -1 } }));
    assert.deepEqual(r.save.inventory, { coffee: 2 });
  });

  test('entrada de missão sem objectives é descartada', () => {
    const r = validateSave(saveValido({
      quests: {
        boa: { active: true, done: false, objectives: { a: { done: true } } },
        ruim: 'texto',
        semObjetivos: { active: true, done: false },
      },
    }));
    assert.deepEqual(Object.keys(r.save.quests), ['boa']);
  });

  test('sexo fora do vocabulário é omitido', () => {
    const r = validateSave(saveValido({ profile: { name: 'Alex', sex: 'z', courseId: 'direito' } }));
    assert.equal('sex' in r.save.profile, false);
    assert.equal(r.save.profile.courseId, 'direito');
  });
});

describe('validateSave — A-07: fronteira de versão', () => {
  test('versão futura é rejeitada explicitamente', () => {
    const r = validateSave(saveValido({ version: 99 }));
    assert.equal(r.status, SaveStatus.FUTURE_VERSION);
    assert.match(r.message, /versão mais nova/i);
  });

  test('versão atual é aceita', () => {
    assert.equal(validateSave(saveValido({ version: SAVE_VERSION })).status, SaveStatus.OK);
  });

  test('versão de tipo inválido é malformada, não futura', () => {
    assert.equal(validateSave(saveValido({ version: 'um' })).status, SaveStatus.MALFORMED);
    assert.equal(validateSave(saveValido({ version: 0 })).status, SaveStatus.MALFORMED);
    assert.equal(validateSave(saveValido({ version: -1 })).status, SaveStatus.MALFORMED);
  });

  test('todo status de erro tem mensagem para o jogador', () => {
    for (const s of [SaveStatus.UNREADABLE, SaveStatus.MALFORMED, SaveStatus.FUTURE_VERSION]) {
      assert.ok(saveErrorMessage(s), `faltou mensagem para ${s}`);
    }
  });
});
