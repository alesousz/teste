import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Interior, planoDoPredio, BODY_HEIGHT, STEP_UP } from '../../src/interior.js';
import { HOME_ORIGIN, CONFIG } from '../../src/data.js';
import { AP, UNITS, ROOMS, DOORS, STAIRS, LANDING, LOBBY, CORRIDOR, SPAWN } from '../../src/data/apartment.js';

const it = new Interior(HOME_ORIGIN);
const O = HOME_ORIGIN;
const L = (x, z) => ({ x: x + O.x, z: z + O.z });   // planta local -> mundo

describe('planta do prédio — consistência geométrica', () => {
  test('nenhuma unidade invade o vão da caixa de escada', () => {
    for (const u of UNITS) {
      assert.ok(u.x1 <= 11.25 + 1e-9,
        `${u.id} avança sobre a caixa de escada — o lance ficaria sem pé-direito`);
    }
  });

  test('o lance de escada é contínuo entre o piso plano e o patamar', () => {
    assert.equal(STAIRS.z1, LANDING.z0, 'topo da escada precisa encostar no patamar');
    assert.equal(STAIRS.yHigh, AP.FLOOR_H, 'a escada precisa subir exatamente um pavimento');
  });

  test('a escada ocupa a largura inteira da caixa (sem fresta pra cair)', () => {
    assert.equal(STAIRS.x0, LOBBY.x1 + 0.5, 'começa na face interna da parede da escada');
    assert.equal(STAIRS.x1, AP.W - AP.SHELL, 'termina na face interna da fachada leste');
  });

  // Achado durante a integração: o vão de 0,85 m do banheiro era menor que o
  // diâmetro de colisão do jogador (0,90 m), e o banheiro ficava inacessível
  // sem nenhum aviso — a porta existia, e não dava pra passar.
  test('toda porta é mais larga que o diâmetro de colisão do jogador', () => {
    const diametro = CONFIG.PLAYER_RADIUS * 2;
    for (const d of DOORS) {
      assert.ok(d.w > diametro + 0.1,
        `a porta "${d.id}" tem ${d.w} m de vão e o jogador ocupa ${diametro} m — não passa`);
    }
  });

  test('inclinação da escada é caminhável', () => {
    const graus = Math.atan2(STAIRS.yHigh - STAIRS.yLow, STAIRS.z1 - STAIRS.z0) * 180 / Math.PI;
    assert.ok(graus > 15 && graus < 40, `inclinação de ${graus.toFixed(1)}° fora do razoável`);
  });

  test('o jogador nasce dentro do quarto do próprio apartamento', () => {
    const dentro = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    assert.ok(dentro(ROOMS.quarto, SPAWN.x, SPAWN.z));
    assert.ok(dentro(UNITS[0], SPAWN.x, SPAWN.z));
    assert.equal(UNITS[0].player, true);
  });

  test('toda porta da planta corresponde a um vão real na parede', () => {
    const { solids } = planoDoPredio();
    for (const d of DOORS) {
      if (d.exterior) continue;
      const y = d.level * AP.FLOOR_H + 1.0;   // altura do peito, dentro do vão
      const bloqueia = solids.some(s =>
        d.x > s.minX && d.x < s.maxX &&
        d.z > s.minZ && d.z < s.maxZ &&
        y > s.minY && y < s.maxY);
      assert.ok(!bloqueia, `a porta "${d.id}" está tapada por parede`);
    }
  });
});

describe('suporte vertical — pisos, rampa e o vão da escada', () => {
  test('o andar de cima sustenta quem está nele', () => {
    const p = L(SPAWN.x, SPAWN.z);
    assert.equal(it.supportAt(p.x, p.z, AP.FLOOR_H), AP.FLOOR_H);
  });

  test('quem está no térreo NÃO é puxado pra laje de cima', () => {
    const p = L(5, 6);
    assert.equal(it.supportAt(p.x, p.z, 0), 0, 'a laje acima não pode servir de chão');
  });

  // O defeito real encontrado na primeira simulação: a faixa da parede entre
  // corredor e patamar é a soleira da porta, e estava sem piso — um buraco de
  // meio metro exatamente onde o jogador passa.
  test('a soleira da porta do patamar tem piso (regressão do buraco na laje)', () => {
    for (let x = LOBBY.x1; x <= LANDING.x1; x += 0.05) {
      const p = L(x, 10.5);
      assert.equal(it.supportAt(p.x, p.z, AP.FLOOR_H), AP.FLOOR_H,
        `sem piso em x=${x.toFixed(2)} na passagem corredor→patamar`);
    }
  });

  test('a rampa da escada sobe continuamente, sem degrau maior que o passo', () => {
    let anterior = null;
    for (let z = STAIRS.z0; z <= STAIRS.z1; z += 0.1) {
      const p = L(13.6, z);
      const y = it.supportAt(p.x, p.z, anterior ?? 0);
      if (anterior !== null) {
        assert.ok(Math.abs(y - anterior) <= STEP_UP,
          `salto de ${(y - anterior).toFixed(2)} m em z=${z.toFixed(1)}`);
      }
      anterior = y;
    }
    assert.ok(Math.abs(anterior - AP.FLOOR_H) < 0.05, 'a escada precisa terminar no nível do andar');
  });

  test('o vão da escada não tem piso no andar de cima (é ele que dá o pé-direito)', () => {
    const p = L(13.6, 6.0);   // sobre o meio do lance
    assert.ok(it.supportAt(p.x, p.z, AP.FLOOR_H) < AP.FLOOR_H,
      'se houvesse laje aqui, o lance teria ~1 m de altura livre');
  });

  test('o teto sobre a escada é a cobertura, não a laje do andar', () => {
    const p = L(13.6, 6.0);
    assert.equal(it.ceilingAt(p.x, p.z, 1.5), AP.ROOF_Y);
  });
});

describe('colisão — o corpo do jogador contra as paredes', () => {
  test('parede empurra o jogador pra fora, no eixo mais curto', () => {
    const p = { ...L(11.5, 5.0), y: 0 };   // dentro da parede da escada, no térreo
    it.resolve(p, CONFIG.PLAYER_RADIUS, BODY_HEIGHT);
    const lx = p.x - O.x;
    assert.ok(lx <= 11.25 - CONFIG.PLAYER_RADIUS + 1e-6 || lx >= 11.75 + CONFIG.PLAYER_RADIUS - 1e-6,
      `continuou dentro da parede (x local ${lx.toFixed(2)})`);
  });

  test('a laje do andar de cima não bloqueia quem anda no térreo', () => {
    const p = { ...L(5, 6), y: 0 };
    const antes = { x: p.x, z: p.z };
    it.resolve(p, CONFIG.PLAYER_RADIUS, BODY_HEIGHT);
    assert.equal(p.x, antes.x);
    assert.equal(p.z, antes.z);
  });

  test('a cobertura impede sair pelo teto', () => {
    const p = L(5, 6);
    assert.equal(it.ceilingAt(p.x, p.z, AP.FLOOR_H), AP.ROOF_Y);
  });
});

// ---------------------------------------------------------------------------
// O teste que mais importa: o percurso dos primeiros minutos, andado de ponta
// a ponta com a mesma física do jogo. Foi ele que revelou o buraco na laje.
// ---------------------------------------------------------------------------
describe('percurso jogável — do quarto até a rua', () => {
  const ROTA = [
    ['quarto (nascimento)', SPAWN.x, SPAWN.z],
    ['porta do quarto', 1.7, 3.9],
    ['sala e cozinha', 2.8, 6.0],
    ['porta do 201', 2.6, 8.6],
    ['corredor', 6.0, 9.6],
    ['porta do patamar', 11.5, 10.5],
    ['patamar', 13.6, 10.2],
    ['topo da escada', 13.6, 8.6],
    ['meio da escada', 13.6, 6.0],
    ['base da escada', 13.6, 3.4],
    ['piso plano da escada', 13.6, 2.0],
    ['porta do saguão', 11.5, 1.9],
    ['saguão', 8.0, 4.0],
    ['frente da porta da rua', 5.8, 1.2],
    ['soleira', 5.8, 0.2],
    ['rua', 5.8, -3.0],
  ];

  test('o jogador chega da cama até a calçada sem travar nem cair', () => {
    const dt = 1 / 60;
    const raio = CONFIG.PLAYER_RADIUS;
    const pos = { ...L(ROTA[0][1], ROTA[0][2]), y: AP.FLOOR_H };
    let vy = 0;

    const caminharAte = alvo => {
      let travado = 0;
      for (let i = 0; i < 1500; i++) {
        const dx = alvo.x - pos.x, dz = alvo.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.15) return null;
        const antes = { x: pos.x, z: pos.z };
        const s = Math.min(CONFIG.PLAYER_SPEED_WALK * dt, d);
        pos.x += (dx / d) * s;
        pos.z += (dz / d) * s;

        vy -= CONFIG.GRAVITY * dt;
        pos.y += vy * dt;
        const chao = it.supportAt(pos.x, pos.z, pos.y, STEP_UP);
        if (pos.y <= chao) { pos.y = chao; vy = 0; }
        const teto = it.ceilingAt(pos.x, pos.z, pos.y);
        if (pos.y + BODY_HEIGHT > teto) { pos.y = teto - BODY_HEIGHT; if (vy > 0) vy = 0; }
        it.resolve(pos, raio, BODY_HEIGHT);

        if (pos.y < -0.5) return 'caiu pra fora do mundo';
        travado = Math.hypot(pos.x - antes.x, pos.z - antes.z) < s * 0.25 ? travado + 1 : 0;
        if (travado > 45) return 'preso na geometria';
      }
      return 'não alcançou o ponto';
    };

    for (const [nome, lx, lz] of ROTA.slice(1)) {
      const erro = caminharAte(L(lx, lz));
      assert.equal(erro, null, `${nome}: ${erro}`);
    }

    assert.ok(pos.y < 0.05, 'precisa terminar no nível da rua');
    assert.ok(pos.z - O.z < 0, 'precisa ter saído da pegada do prédio');
  });
});
