import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarRotina, validarRotina, errosDaRotina, resolverLocal,
  janelasPorNpc, serveComoRotina, descreverLocal, ANCORAS,
  horaParaTexto, textoParaHora, dentroDaJanela, paradaAgora,
} from '../../src/rotina.js';

// A rotina é escrita à mão na aba Rotina do editor. Estes testes são a rede
// de segurança dessa autoria: o que o autor digita errado tem que virar
// mensagem pra ele, nunca partida quebrada.

const rotinaBoa = () => ({
  obligations: {
    turno: {
      id: 'turno', type: 'job', label: 'Turno no Mercado',
      local: { marco: 'job_mercado', ancora: 'frente', margem: 3 },
      npc: 'seu_ivo', startHour: 8, endHour: 14,
      payPerDay: 40, missPenaltyMoney: 10, maxMisses: 3,
      warningMessage: 'penúltimo aviso', endMessage: 'dispensado',
    },
  },
  homes: {
    casa: { id: 'casa', kind: 'home_operario', local: { marco: 'home_operario', ancora: 'lado', margem: 3 } },
  },
  origins: {
    operario: { id: 'operario', label: 'Operário', startMoney: 60, home: 'casa', obligation: 'turno', familyNpc: 'mae' },
  },
  courses: {
    medicina: { id: 'medicina', label: 'Medicina', glyph: 'stethoscope', age: 18, startMoney: 60, obligation: 'turno' },
  },
});

const mundoDeTeste = {
  npcs: new Set(['seu_ivo', 'mae']),
  marcos: new Set(['job_mercado', 'home_operario']),
};

describe('resolverLocal — o lugar sai do mapa, não de coordenada digitada', () => {
  const mundo = {
    marco: kind => (kind === 'mercado' ? { x: 10, z: 20, w: 18, d: 12 } : null),
    npc: id => (id === 'ivo' ? { x: 1, z: 2 } : null),
  };

  test('âncora "frente" põe o ponto à frente da fachada, fora da caixa', () => {
    assert.deepEqual(resolverLocal({ marco: 'mercado', ancora: 'frente', margem: 3 }, mundo), { x: 10, z: 29 });
  });

  test('âncora "lado" põe o ponto ao lado', () => {
    assert.deepEqual(resolverLocal({ marco: 'mercado', ancora: 'lado', margem: 3 }, mundo), { x: 22, z: 20 });
  });

  test('âncora "centro" é o centro do marco', () => {
    assert.deepEqual(resolverLocal({ marco: 'mercado', ancora: 'centro' }, mundo), { x: 10, z: 20 });
  });

  test('âncora ausente vale "frente" (padrão)', () => {
    assert.deepEqual(resolverLocal({ marco: 'mercado', margem: 3 }, mundo), { x: 10, z: 29 });
  });

  test('marco que não existe no mapa devolve null em vez de NaN', () => {
    assert.equal(resolverLocal({ marco: 'nao_existe' }, mundo), null);
  });

  test('local por NPC e por ponto solto também resolvem', () => {
    assert.deepEqual(resolverLocal({ npc: 'ivo' }, mundo), { x: 1, z: 2 });
    assert.deepEqual(resolverLocal({ x: 5, z: 6 }, mundo), { x: 5, z: 6 });
  });

  test('lixo no lugar do local devolve null, não explode', () => {
    for (const lixo of [null, undefined, 'mercado', 42, {}, { x: 'a', z: 'b' }, { marco: '' }]) {
      assert.equal(resolverLocal(lixo, mundo), null, `deveria ser null pra ${JSON.stringify(lixo)}`);
    }
  });

  test('descreverLocal dá uma frase legível pra cada forma', () => {
    assert.equal(descreverLocal({ marco: 'mercado', ancora: 'lado' }, k => 'Mercado'), 'Ao lado de Mercado');
    assert.equal(descreverLocal({ npc: 'ivo' }), 'Onde ivo está');
    assert.equal(descreverLocal({}), 'sem local');
  });
});

describe('normalizarRotina — nada do que o autor digita vira partida quebrada', () => {
  test('rotina válida passa intacta no que importa', () => {
    const r = normalizarRotina(rotinaBoa());
    assert.equal(r.obligations.turno.startHour, 8);
    assert.equal(r.obligations.turno.endHour, 14);
    assert.equal(r.obligations.turno.payPerDay, 40);
    assert.equal(r.courses.medicina.obligation, 'turno');
  });

  test('horário invertido vira uma janela mínima cumprível em vez de impossível', () => {
    const bruta = rotinaBoa();
    bruta.obligations.turno.startHour = 14;
    bruta.obligations.turno.endHour = 8;
    const ob = normalizarRotina(bruta).obligations.turno;
    assert.ok(ob.endHour > ob.startHour, 'a janela precisa ficar aberta');
    assert.equal(ob.endHour, 14.5);
  });

  test('problema aponta o item exato: tipo, id e campo', () => {
    const bruta = rotinaBoa();
    bruta.courses.medicina.obligation = 'sumiu';
    const [erro] = errosDaRotina(validarRotina(bruta, mundoDeTeste));
    assert.equal(erro.tipo, 'course');
    assert.equal(erro.id, 'medicina');
    assert.equal(erro.campo, 'obligation');
    assert.equal(erro.onde, 'curso medicina');
  });

  test('horaParaTexto e textoParaHora fecham o círculo', () => {
    for (const h of [0, 8, 8.5, 13.25, 23.75, 24]) assert.equal(textoParaHora(horaParaTexto(h)), h);
    assert.equal(horaParaTexto(8.5), '08:30');
    assert.equal(textoParaHora('08:30'), 8.5);
    for (const lixo of ['', null, undefined, 'oito', '8', '99:99']) assert.equal(textoParaHora(lixo), null, `${lixo}`);
  });

  test('valores negativos ou absurdos são presos nos limites', () => {
    const bruta = rotinaBoa();
    Object.assign(bruta.obligations.turno, { payPerDay: -100, missPenaltyMoney: -5, maxMisses: 0, startHour: -3, endHour: 99 });
    const ob = normalizarRotina(bruta).obligations.turno;
    assert.equal(ob.payPerDay, 0);
    assert.equal(ob.missPenaltyMoney, 0);
    assert.equal(ob.maxMisses, 1);
    assert.equal(ob.startHour, 0);
    assert.equal(ob.endHour, 24);
  });

  test('texto faltando ganha um padrão em português, nunca "undefined" na tela', () => {
    const bruta = rotinaBoa();
    delete bruta.obligations.turno.warningMessage;
    delete bruta.obligations.turno.endMessage;
    delete bruta.obligations.turno.label;
    const ob = normalizarRotina(bruta).obligations.turno;
    assert.equal(ob.label, 'turno');
    assert.ok(ob.warningMessage.includes('turno'));
    assert.ok(ob.endMessage.includes('turno'));
    assert.doesNotMatch(`${ob.warningMessage}${ob.endMessage}`, /undefined|null/);
  });

  test('curso apontando pra compromisso inexistente cai no primeiro que existe', () => {
    const bruta = rotinaBoa();
    bruta.courses.medicina.obligation = 'compromisso_apagado';
    const c = normalizarRotina(bruta).courses.medicina;
    assert.equal(c.obligation, 'turno');
  });

  test('rótulo e horário do curso saem do compromisso, não são campo separado', () => {
    const bruta = rotinaBoa();
    bruta.obligations.turno.label = 'Estágio na Farmácia';
    bruta.obligations.turno.startHour = 9;
    bruta.obligations.turno.endHour = 17;
    const c = normalizarRotina(bruta).courses.medicina;
    assert.equal(c.obligationLabel, 'Estágio na Farmácia');
    assert.equal(c.startHour, 9);
    assert.equal(c.endHour, 17);
  });

  test('origem apontando pra casa inexistente cai numa casa que existe', () => {
    const bruta = rotinaBoa();
    bruta.origins.operario.home = 'mansao_que_nao_existe';
    assert.equal(normalizarRotina(bruta).origins.operario.home, 'casa');
  });

  test('a chave do mapa manda: o id normalizado é sempre a chave', () => {
    const bruta = rotinaBoa();
    bruta.obligations.turno.id = 'outro_id';
    assert.equal(normalizarRotina(bruta).obligations.turno.id, 'turno');
  });

  test('rotina vazia ou lixo devolve as cinco seções vazias sem lançar', () => {
    for (const lixo of [null, undefined, 42, 'texto', [], {}]) {
      const r = normalizarRotina(lixo);
      assert.deepEqual(Object.keys(r).sort(), ['agendas', 'courses', 'homes', 'obligations', 'origins']);
    }
  });

  test('hora com minuto quebrado é preservada: o relógio do jogo mostra minuto', () => {
    const bruta = rotinaBoa();
    bruta.obligations.turno.startHour = 8.25;
    assert.equal(normalizarRotina(bruta).obligations.turno.startHour, 8.25);
  });
});

describe('janelasPorNpc — o NPC abre quando qualquer compromisso dele abre', () => {
  test('um NPC que atende dois compromissos usa a união das janelas', () => {
    const janelas = janelasPorNpc({
      manha: { npc: 'ivo', startHour: 8, endHour: 12 },
      tarde: { npc: 'ivo', startHour: 14, endHour: 18 },
    });
    assert.deepEqual(janelas.ivo, { startHour: 8, endHour: 18 });
  });

  test('compromisso sem NPC não entra na tabela', () => {
    assert.deepEqual(janelasPorNpc({ a: { npc: null, startHour: 1, endHour: 2 } }), {});
  });
});

describe('validarRotina — o que o autor precisa ler', () => {
  test('rotina boa não tem erro nenhum', () => {
    assert.deepEqual(errosDaRotina(validarRotina(rotinaBoa(), mundoDeTeste)), []);
  });

  const comErro = (mexer, campo) => {
    const bruta = rotinaBoa();
    mexer(bruta);
    const erros = errosDaRotina(validarRotina(bruta, mundoDeTeste));
    assert.ok(erros.some(e => e.campo === campo), `esperava erro em "${campo}", veio ${JSON.stringify(erros)}`);
    return erros;
  };

  test('compromisso que termina antes de começar é erro, com as horas na mensagem', () => {
    const erros = comErro(r => { r.obligations.turno.startHour = 14; r.obligations.turno.endHour = 8; }, 'horario');
    assert.match(erros[0].mensagem, /08:00.*14:00|14:00.*08:00/);
  });

  test('NPC que não existe no mapa é erro, não silêncio', () => {
    const erros = comErro(r => { r.obligations.turno.npc = 'fantasma'; }, 'npc');
    assert.match(erros[0].mensagem, /fantasma/);
  });

  test('marco que não está no mapa é erro', () => {
    comErro(r => { r.obligations.turno.local = { marco: 'castelo' }; }, 'local');
  });

  test('compromisso sem lugar escolhido é erro', () => {
    comErro(r => { r.obligations.turno.local = {}; }, 'local');
  });

  test('curso sem compromisso é erro', () => {
    comErro(r => { r.courses.medicina.obligation = 'nao_existe'; }, 'obligation');
  });

  test('origem apontando pra casa inexistente é erro', () => {
    comErro(r => { r.origins.operario.home = 'nao_existe'; }, 'home');
  });

  test('limite de faltas zero é erro', () => {
    comErro(r => { r.obligations.turno.maxMisses = 0; }, 'maxMisses');
  });

  test('id que não bate com a chave é erro', () => {
    comErro(r => { r.obligations.turno.id = 'outro'; }, 'id');
  });

  test('compromisso sem NPC é só aviso: o jogo funciona, o lugar é que não fecha', () => {
    const bruta = rotinaBoa();
    bruta.obligations.turno.npc = '';
    const problemas = validarRotina(bruta, mundoDeTeste);
    assert.deepEqual(errosDaRotina(problemas), []);
    assert.ok(problemas.some(p => p.nivel === 'aviso' && p.campo === 'npc'));
  });

  test('compromisso que nenhum curso nem origem usa vira aviso', () => {
    const bruta = rotinaBoa();
    bruta.obligations.orfao = { ...bruta.obligations.turno, id: 'orfao', label: 'Bico esquecido' };
    const problemas = validarRotina(bruta, mundoDeTeste);
    assert.ok(problemas.some(p => p.nivel === 'aviso' && /Bico esquecido/.test(p.mensagem)));
  });

  test('sem curso nenhum, a criação de personagem ficaria vazia: erro', () => {
    const bruta = rotinaBoa();
    bruta.courses = {};
    assert.ok(errosDaRotina(validarRotina(bruta, mundoDeTeste)).some(e => /curso/i.test(e.mensagem)));
  });

  test('validar sem conhecer a cena não inventa erro de referência', () => {
    const bruta = rotinaBoa();
    bruta.obligations.turno.npc = 'alguem_que_o_teste_nao_conhece';
    assert.deepEqual(errosDaRotina(validarRotina(bruta)), []);
  });

  test('lixo no lugar da rotina não lança, só acusa o que falta', () => {
    for (const lixo of [null, undefined, [], 'texto']) {
      const erros = errosDaRotina(validarRotina(lixo));
      assert.ok(erros.length >= 3, `esperava acusar as seções vazias pra ${JSON.stringify(lixo)}`);
    }
  });
});

describe('serveComoRotina — o rascunho do editor só entra no jogo se tiver cara de rotina', () => {
  test('rotina completa serve', () => {
    assert.equal(serveComoRotina(rotinaBoa()), true);
  });

  test('rascunho sem seção, vazio ou corrompido não serve (o jogo usa o publicado)', () => {
    assert.equal(serveComoRotina(null), false);
    assert.equal(serveComoRotina({}), false);
    assert.equal(serveComoRotina({ obligations: {}, homes: {}, origins: {}, courses: {} }), false);
    const semCurso = rotinaBoa();
    semCurso.courses = {};
    assert.equal(serveComoRotina(semCurso), false);
    const listaNoLugar = rotinaBoa();
    listaNoLugar.obligations = [];
    assert.equal(serveComoRotina(listaNoLugar), false);
  });
});

describe('ANCORAS', () => {
  test('toda âncora tem valor e rótulo em português', () => {
    assert.ok(ANCORAS.length >= 3);
    for (const a of ANCORAS) assert.ok(a.value && a.label);
  });
});

describe('agenda: o dia de cada pessoa', () => {
  const agendaBoa = () => ({
    obligations: { turno: { id: 'turno', label: 'Turno', startHour: 8, endHour: 14, local: { marco: 'job_mercado' } } },
    homes: { casa: { id: 'casa', kind: 'home_operario', local: { marco: 'home_operario' } } },
    origins: {}, courses: { eng: { id: 'eng', label: 'Eng', obligation: 'turno' } },
    agendas: {
      ivo: {
        id: 'ivo', npc: 'ivo',
        paradas: [
          { id: 'dia', label: 'No mercado', de: 7, ate: 20, local: { marco: 'job_mercado' }, raio: 2 },
          { id: 'noite', label: 'Em casa', de: 20, ate: 7, local: { marco: 'home_operario' }, raio: 0, animacoes: 'sentado' },
        ],
      },
    },
  });

  test('janela normal e janela que atravessa a meia-noite', () => {
    assert.equal(dentroDaJanela(9, 8, 12), true);
    assert.equal(dentroDaJanela(12, 8, 12), false, 'a hora do fim já é da próxima parada');
    assert.equal(dentroDaJanela(23, 22, 6), true);
    assert.equal(dentroDaJanela(3, 22, 6), true);
    assert.equal(dentroDaJanela(12, 22, 6), false);
    assert.equal(dentroDaJanela(8, 8, 8), false, 'janela vazia nunca acontece');
  });

  test('a parada de agora é a primeira da lista que pega a hora', () => {
    const { agendas } = normalizarRotina(agendaBoa());
    assert.equal(paradaAgora(agendas.ivo, 10).label, 'No mercado');
    assert.equal(paradaAgora(agendas.ivo, 23).label, 'Em casa');
    assert.equal(paradaAgora(agendas.ivo, 3).label, 'Em casa');
    assert.equal(paradaAgora(null, 10), null);
  });

  test('parada sem nada escrito ganha padrão e não quebra o dia', () => {
    const { agendas } = normalizarRotina({ agendas: { x: { paradas: [{}] } } });
    const p = agendas.x.paradas[0];
    assert.equal(p.id, 'parada_1');
    assert.equal(p.raio, 0);
    assert.equal(p.animacoes, '');
    assert.deepEqual(p.local, { marco: '', ancora: 'frente', margem: 3 });
  });

  test('agenda de quem não está no mapa é erro', () => {
    const problemas = validarRotina(agendaBoa(), { npcs: new Set(['outro']), marcos: new Set(['job_mercado', 'home_operario']) });
    const p = problemas.find(x => x.tipo === 'agenda' && x.campo === 'npc');
    assert.equal(p.nivel, 'erro');
    assert.match(p.mensagem, /não está no mapa/);
  });

  test('parada que começa e termina na mesma hora é erro, com o nome dela', () => {
    const bruta = agendaBoa();
    bruta.agendas.ivo.paradas[0].ate = 7;
    const p = validarRotina(bruta).find(x => x.campo === 'parada_0');
    assert.equal(p.nivel, 'erro');
    assert.match(p.mensagem, /"No mercado" começa e termina/);
    assert.match(p.mensagem, /nunca acontece/);
  });

  test('duas paradas na mesma hora avisam qual vale', () => {
    const bruta = agendaBoa();
    bruta.agendas.ivo.paradas.push({ label: 'Na praça', de: 10, ate: 12, local: { marco: 'job_mercado' } });
    const p = validarRotina(bruta).find(x => x.campo === 'parada_2');
    assert.equal(p.nivel, 'aviso');
    assert.match(p.mensagem, /vale "No mercado"/);
  });

  test('conjunto de animação que não existe é erro na parada', () => {
    const problemas = validarRotina(agendaBoa(), { conjuntos: new Set(['normal']) });
    const p = problemas.find(x => x.campo === 'parada_1');
    assert.equal(p.nivel, 'erro');
    assert.match(p.mensagem, /"sentado", que não existe/);
    // Sem a lista de conjuntos (testes sem cena), não há o que conferir.
    assert.equal(validarRotina(agendaBoa()).some(x => /conjunto de animação/.test(x.mensagem)), false);
  });

  test('agenda vazia avisa, mas não é erro: a pessoa só fica onde está', () => {
    const bruta = agendaBoa();
    bruta.agendas.ivo.paradas = [];
    const p = validarRotina(bruta).find(x => x.tipo === 'agenda');
    assert.equal(p.nivel, 'aviso');
    assert.match(p.mensagem, /fica o dia inteiro/);
  });

  test('parada sem lugar escolhido é erro', () => {
    const bruta = agendaBoa();
    bruta.agendas.ivo.paradas[0].local = {};
    const p = validarRotina(bruta).find(x => x.tipo === 'agenda' && x.campo === 'local');
    assert.equal(p.nivel, 'erro');
    assert.match(p.mensagem, /"No mercado"/);
  });
});

test('duas agendas pra mesma pessoa é erro: o jogo só segue uma', () => {
  const bruta = {
    agendas: {
      ivo_dia: { id: 'ivo_dia', npc: 'ivo', paradas: [{ label: 'A', de: 8, ate: 12, local: { marco: 'job_mercado' } }] },
      ivo_noite: { id: 'ivo_noite', npc: 'ivo', paradas: [{ label: 'B', de: 20, ate: 8, local: { marco: 'job_mercado' } }] },
    },
  };
  const p = validarRotina(bruta).find(x => x.id === 'ivo_noite' && x.campo === 'npc');
  assert.equal(p.nivel, 'erro');
  assert.match(p.mensagem, /já tem a agenda "ivo_dia"/);
});
