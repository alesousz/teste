import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ESQUEMA, CAMPO_POR_CHAVE, PADROES, MALHA_DO_GERADOR, MEDIDAS_DO_KIT,
  normalizarRegras, validarRegras, errosDasRegras, serveComoRegras, fraseDoCampo, ondeFica,
} from '../../src/regras.js';
import { CONFIG, REGRAS_PROBLEMAS, REGRAS_SAO_RASCUNHO } from '../../src/data.js';
import { FAIXA } from '../../src/objectCollision.js';

const publicado = JSON.parse(readFileSync(new URL('../../src/data/regras.json', import.meta.url), 'utf8'));

/** Um problema de um campo, pelo nível. */
const de = (problemas, campo, nivel) => problemas.find(p => p.campo === campo && (!nivel || p.nivel === nivel));

describe('normalizar: o que o jogo usa', () => {
  test('arquivo vazio vira o jogo de fábrica', () => {
    assert.deepEqual(normalizarRegras({}), PADROES);
    assert.deepEqual(normalizarRegras(null), PADROES);
    assert.deepEqual(normalizarRegras('nada disso'), PADROES);
  });

  test('campo ausente, texto, null e NaN caem no valor de fábrica', () => {
    const r = normalizarRegras({
      PLAYER_SPEED_WALK: 'rápido', GRAVITY: null, JUMP_SPEED: NaN, PUNCH_DAMAGE: undefined,
    });
    assert.equal(r.PLAYER_SPEED_WALK, PADROES.PLAYER_SPEED_WALK);
    assert.equal(r.GRAVITY, PADROES.GRAVITY);
    assert.equal(r.JUMP_SPEED, PADROES.JUMP_SPEED);
    assert.equal(r.PUNCH_DAMAGE, PADROES.PUNCH_DAMAGE);
  });

  test('valor fora da faixa é preso no limite, não vira o padrão', () => {
    const r = normalizarRegras({ PLAYER_SPEED_RUN: 40, PLAYER_RADIUS: -3 });
    assert.equal(r.PLAYER_SPEED_RUN, CAMPO_POR_CHAVE.PLAYER_SPEED_RUN.max);
    assert.equal(r.PLAYER_RADIUS, CAMPO_POR_CHAVE.PLAYER_RADIUS.min);
  });

  test('dia de 0 segundo vira o mínimo: com 0 a fome e o relógio virariam Infinity no primeiro quadro', () => {
    const r = normalizarRegras({ DAY_LENGTH_SECONDS: 0 });
    assert.equal(r.DAY_LENGTH_SECONDS, CAMPO_POR_CHAVE.DAY_LENGTH_SECONDS.min);
    assert.ok(Number.isFinite(100 / (r.DAY_LENGTH_SECONDS * 1.5)));
  });

  test('a malha da cidade não sai do arquivo: escrever GRID_SIZE ali não muda nada', () => {
    const r = normalizarRegras({ GRID_SIZE: 7, BLOCK_SIZE: 99, ROAD_WIDTH: 2 });
    assert.equal('GRID_SIZE' in r, false);
    assert.equal('BLOCK_SIZE' in r, false);
    assert.equal('ROAD_WIDTH' in r, false);
    // E depois da mesclagem em data.js o jogo continua com a malha do código.
    assert.equal(CONFIG.GRID_SIZE, MALHA_DO_GERADOR.GRID_SIZE);
    assert.equal(CONFIG.BLOCK_SIZE, MALHA_DO_GERADOR.BLOCK_SIZE);
    assert.equal(CONFIG.ROAD_WIDTH, MALHA_DO_GERADOR.ROAD_WIDTH);
  });

  test('chave inventada não entra no jogo', () => {
    assert.equal('PLAYER_FLY' in normalizarRegras({ PLAYER_FLY: 10 }), false);
  });
});

describe('conferência: o que o autor lê', () => {
  test('cada conferência cruzada tem a sua mensagem, no campo certo', () => {
    const casos = [
      [{ PUNCH_STAMINA_COST: 120 }, 'PUNCH_STAMINA_COST', 'erro', /nunca consegue socar/],
      [{ DODGE_STAMINA_COST: 120 }, 'DODGE_STAMINA_COST', 'erro', /nunca consegue esquivar/],
      [{ DUMMY_COUNTER_DAMAGE: 100 }, 'DUMMY_COUNTER_DAMAGE', 'erro', /cai no primeiro golpe/],
      [{ PLAYER_SPEED_RUN: 3 }, 'PLAYER_SPEED_RUN', 'aviso', /Shift não muda nada/],
      [{ PLAYER_SPEED_CROUCH: 4 }, 'PLAYER_SPEED_CROUCH', 'aviso', /mais rápido que em pé/],
      // A câmera de dentro só passa a de fora se a de fora for encurtada.
      [{ CAM_DIST_INDOOR: 5, CAM_DIST_OUTDOOR: 3 }, 'CAM_DIST_INDOOR', 'aviso', /atravessa a parede/],
      [{ PUNCH_COMBO_DAMAGE: 10 }, 'PUNCH_COMBO_DAMAGE', 'aviso', /vira desvantagem/],
      [{ STAMINA_REGEN_RATE: 0 }, 'STAMINA_REGEN_RATE', 'aviso', /não volta sozinha/],
      [{ COUNTER_TELEGRAPH_DURATION: 0.15 }, 'COUNTER_TELEGRAPH_DURATION', 'aviso', /tempo humano/],
      [{ DAY_LENGTH_SECONDS: 60 }, 'DAY_LENGTH_SECONDS', 'aviso', /não pra viver o dia/],
      [{ INTERACT_RADIUS: 0.5 }, 'INTERACT_RADIUS', 'aviso', /encostar no NPC/],
      [{ JUMP_SPEED: 12 }, 'JUMP_SPEED', 'aviso', /por cima das paredes/],
      [{ GRAVITY: 2 }, 'GRAVITY', 'aviso', /desce flutuando/],
    ];
    for (const [regras, campo, nivel, mensagem] of casos) {
      const p = de(validarRegras(regras), campo, nivel);
      assert.ok(p, `${campo} devia dar ${nivel}`);
      assert.match(p.mensagem, mensagem);
      assert.equal(p.onde, ondeFica(campo));
    }
  });

  test('corpo largo ou alto demais é erro, com o motivo do kit escrito', () => {
    const largo = de(validarRegras({ PLAYER_RADIUS: 0.5 }), 'PLAYER_RADIUS', 'erro');
    assert.match(largo.mensagem, /não entra mais em casa nenhuma/);
    assert.match(largo.mensagem, new RegExp(String(MEDIDAS_DO_KIT.LARGURA_PORTA).replace('.', ',')));

    const alto = de(validarRegras({ PLAYER_HEIGHT: 2.5 }), 'PLAYER_HEIGHT', 'erro');
    assert.match(alto.mensagem, /não cabe embaixo do teto/);
  });

  test('valor fora da faixa sem consequência de kit é só aviso, dizendo o que o jogo vai usar', () => {
    const p = de(validarRegras({ PLAYER_SPEED_RUN: 40 }), 'PLAYER_SPEED_RUN', 'aviso');
    assert.match(p.mensagem, /fora do limite/);
    assert.match(p.mensagem, /vai usar 20/);
  });

  test('erro de digitação no nome da regra é acusado, com palpite do nome certo', () => {
    const p = de(validarRegras({ PLAYER_SPPED_WALK: 3 }), 'PLAYER_SPPED_WALK', 'erro');
    assert.match(p.mensagem, /não existe no jogo/);
    assert.match(p.mensagem, /PLAYER_SPEED_WALK/);
  });

  test('a malha escrita no arquivo é acusada, e a mensagem diz onde isso se resolve', () => {
    const p = de(validarRegras({ GRID_SIZE: 7 }), 'GRID_SIZE', 'erro');
    assert.match(p.mensagem, /não é uma regra do mundo/);
    assert.match(p.mensagem, /editor de mapa/);
  });

  test('texto no lugar de número vira aviso, não erro: o jogo usa o de fábrica', () => {
    const p = de(validarRegras({ GRAVITY: 'forte' }), 'GRAVITY', 'aviso');
    assert.match(p.mensagem, /valor de fábrica/);
  });

  test('errosDasRegras separa o que trava o jogo do que só é estranho', () => {
    // Gravidade 2 dá dois avisos de uma vez: o jogador flutua e, com o mesmo
    // impulso de sempre, o pulo passa por cima das paredes do kit.
    const problemas = validarRegras({ PUNCH_STAMINA_COST: 120, GRAVITY: 2 });
    assert.equal(errosDasRegras(problemas).length, 1);
    assert.deepEqual(problemas.map(p => p.nivel), ['erro', 'aviso', 'aviso']);
  });

  test('o arquivo de fábrica não tem erro nem aviso', () => {
    assert.deepEqual(validarRegras(PADROES), []);
  });
});

describe('esquema e arquivo publicado', () => {
  test('o esquema cobre exatamente as regras do jogo — regra nova não nasce invisível', () => {
    const doConfig = Object.keys(CONFIG)
      .filter(k => !(k in MALHA_DO_GERADOR) && !['CELL', 'WORLD_HALF'].includes(k));
    assert.deepEqual(doConfig.sort(), Object.keys(CAMPO_POR_CHAVE).sort());
  });

  test('todo campo tem rótulo, dica, faixa que contém o padrão e um grupo conhecido', () => {
    const grupos = new Set(ESQUEMA.map(c => c.grupo));
    for (const campo of ESQUEMA) {
      assert.ok(campo.rotulo && campo.dica, campo.chave);
      assert.ok(campo.min <= campo.padrao && campo.padrao <= campo.max, `${campo.chave}: padrão fora da faixa`);
      assert.ok(grupos.has(campo.grupo), campo.chave);
      assert.ok(ondeFica(campo.chave).includes(campo.rotulo));
    }
  });

  test('o arquivo publicado está limpo e é o que o jogo está jogando', () => {
    assert.deepEqual(validarRegras(publicado), []);
    assert.equal(REGRAS_SAO_RASCUNHO, false, 'em Node o jogo lê sempre o publicado');
    assert.deepEqual(REGRAS_PROBLEMAS, []);
    for (const campo of ESQUEMA) assert.equal(CONFIG[campo.chave], publicado[campo.chave], campo.chave);
  });

  test('a frase de consequência conta com os outros campos em volta', () => {
    assert.match(fraseDoCampo('JUMP_SPEED', 6.5, PADROES), /sobe 1,17 m/);
    assert.match(fraseDoCampo('PUNCH_DAMAGE', 12, PADROES), /9 socos/);
    assert.match(fraseDoCampo('PLAYER_RADIUS', 0.38, PADROES), /0,76 m de largura/);
    // Com o dobro de vida, a conta do "aguenta quantos golpes" dobra junto.
    assert.match(fraseDoCampo('PLAYER_MAX_HP', 200, PADROES), /25 contra-ataques/);
    assert.equal(fraseDoCampo('PHOTO_RADIUS', 3.5, PADROES), '', 'campo sem frase não inventa uma');
  });
});

describe('rascunho', () => {
  test('serve como regras quando tem pelo menos uma chave conhecida', () => {
    assert.equal(serveComoRegras({ GRAVITY: 20 }), true);
    assert.equal(serveComoRegras({}), false);
    assert.equal(serveComoRegras({ QUALQUER_COISA: 1 }), false);
    assert.equal(serveComoRegras([PADROES]), false);
    assert.equal(serveComoRegras(null), false);
  });
});

describe('o que depende das regras no resto do jogo', () => {
  test('o vão mínimo da colisão segue a largura do corpo, por construção', () => {
    assert.equal(FAIXA.VAO_MINIMO, 2 * CONFIG.PLAYER_RADIUS);
  });

  test('CELL e WORLD_HALF continuam derivados depois da mesclagem', () => {
    assert.equal(CONFIG.CELL, CONFIG.BLOCK_SIZE + CONFIG.ROAD_WIDTH);
    assert.equal(CONFIG.WORLD_HALF, (CONFIG.GRID_SIZE * CONFIG.CELL) / 2);
  });
});
