import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Phone,
  Tutorial,
  TUTORIAL_STEPS,
  PARENTS_MESSAGES,
  PARENTS_CONTACT,
  PHONE_DEFAULT_KEY,
  applyPronouns,
  escapeHtml,
} from '../../src/phone.js';

// A lógica do celular é testada sem DOM nenhum: `view: null` desliga a
// renderização e sobra só o estado — que é justamente o que precisa de teste.
function novoCelular(opts = {}) {
  return new Phone({ view: null, ...opts });
}

describe('Phone — mensagens e não lidas', () => {
  test('começa vazio, fechado e sem pendências', () => {
    const p = novoCelular();
    assert.equal(p.isOpen, false);
    assert.equal(p.unreadCount, 0);
    assert.deepEqual(p.messages, []);
    assert.deepEqual(p.conversations, []);
  });

  test('pushMessage enfileira como não lida e devolve a mensagem guardada', () => {
    const p = novoCelular();
    const m = p.pushMessage({ id: 'a1', from: 'Mãe', text: 'Oi', at: '07:40' });
    assert.equal(m.id, 'a1');
    assert.equal(m.read, false);
    assert.equal(p.unreadCount, 1);
    assert.equal(p.getConversation('Mãe').length, 1);
  });

  test('pushMessage gera id quando falta e recusa mensagem sem texto', () => {
    const p = novoCelular();
    const m = p.pushMessage({ from: 'Mãe', text: 'sem id' });
    assert.equal(typeof m.id, 'string');
    assert.ok(m.id.length > 0);
    assert.equal(p.pushMessage(null), null);
    assert.equal(p.pushMessage({ from: 'Mãe' }), null);
    assert.equal(p.pushMessage({ from: 'Mãe', text: 42 }), null);
    assert.equal(p.messages.length, 1, 'mensagem inválida não entra na fila');
  });

  test('mensagem com id repetido não duplica a conversa', () => {
    const p = novoCelular();
    p.pushMessage({ id: 'pais_1', from: 'Mãe', text: 'Oi' });
    assert.equal(p.pushMessage({ id: 'pais_1', from: 'Mãe', text: 'Oi' }), null);
    assert.equal(p.messages.length, 1);
  });

  test('unreadCount conta por mensagem e markAllRead zera', () => {
    const p = novoCelular();
    p.pushMessage({ from: 'Mãe', text: 'um' });
    p.pushMessage({ from: 'Mãe', text: 'dois' });
    p.pushMessage({ from: 'Vizinho', text: 'três' });
    assert.equal(p.unreadCount, 3);

    assert.equal(p.markAllRead(), true);
    assert.equal(p.unreadCount, 0);
    assert.equal(p.markAllRead(), false, 'nada a marcar = nenhuma mudança');
  });

  test('onMessageRead dispara uma vez por mensagem que passa a lida', () => {
    const lidas = [];
    const p = novoCelular({ onMessageRead: m => lidas.push(m.id) });
    p.pushMessage({ id: 'a', from: 'Mãe', text: 'um' });
    p.pushMessage({ id: 'b', from: 'Mãe', text: 'dois' });
    p.markAllRead();
    p.markAllRead();
    assert.deepEqual(lidas, ['a', 'b']);
  });

  test('conversations agrupa por contato e conta não lidas de cada um', () => {
    const p = novoCelular();
    p.pushMessage({ from: 'Mãe', text: 'um' });
    p.pushMessage({ from: 'Vizinho', text: 'dois' });
    p.pushMessage({ from: 'Mãe', text: 'três' });
    const [mae, vizinho] = p.conversations;
    assert.equal(mae.from, 'Mãe');
    assert.equal(mae.messages.length, 2);
    assert.equal(mae.unread, 2);
    assert.equal(mae.last.text, 'três');
    assert.equal(vizinho.unread, 1);
  });
});

describe('Phone — abrir, fechar e leitura', () => {
  test('toggle/open/close mudam isOpen e chamam os callbacks uma vez', () => {
    let abriu = 0, fechou = 0;
    const p = novoCelular({ onOpen: () => abriu++, onClose: () => fechou++ });
    assert.equal(p.toggle(), true);
    assert.equal(p.isOpen, true);
    assert.equal(p.open(), false, 'abrir aberto não faz nada');
    assert.equal(p.toggle(), false);
    assert.equal(p.isOpen, false);
    assert.equal(p.close(), false, 'fechar fechado não faz nada');
    assert.equal(abriu, 1);
    assert.equal(fechou, 1);
  });

  test('abrir marca como lida a conversa que está na tela, e só ela', () => {
    const p = novoCelular();
    p.pushMessage({ from: 'Mãe', text: 'um' });
    p.pushMessage({ from: 'Vizinho', text: 'dois' });
    p.open();
    assert.equal(p.unreadCount, 1, 'a conversa não aberta continua pendente');
    p.selectConversation('Vizinho');
    assert.equal(p.unreadCount, 0);
  });

  test('mensagem que chega com a conversa aberta na tela já nasce lida e sem aviso', () => {
    const avisos = [];
    const p = novoCelular({ onNotify: m => avisos.push(m.id) });
    p.pushMessage({ id: 'a', from: 'Mãe', text: 'um' });
    p.open();
    p.pushMessage({ id: 'b', from: 'Mãe', text: 'dois' });
    assert.equal(p.unreadCount, 0);
    assert.deepEqual(avisos, ['a'], 'só a que chegou com o celular fechado avisa');
  });

  test('selectConversation ignora contato inexistente', () => {
    const p = novoCelular();
    p.pushMessage({ from: 'Mãe', text: 'um' });
    assert.equal(p.selectConversation('Ninguém'), false);
    assert.equal(p.selected, 'Mãe');
  });

  test('moveSelection circula pelas conversas nos dois sentidos', () => {
    const p = novoCelular();
    p.pushMessage({ from: 'Mãe', text: 'um' });
    p.pushMessage({ from: 'Vizinho', text: 'dois' });
    assert.equal(p.selected, 'Mãe');
    p.moveSelection(1);
    assert.equal(p.selected, 'Vizinho');
    p.moveSelection(1);
    assert.equal(p.selected, 'Mãe', 'passa do fim e volta ao começo');
    p.moveSelection(-1);
    assert.equal(p.selected, 'Vizinho');
  });
});

describe('Phone — temporizador (update)', () => {
  test('mensagem agendada só chega depois do tempo pedido', () => {
    const p = novoCelular();
    p.scheduleMessage({ id: 'x', from: 'Mãe', text: 'oi' }, 10);
    p.update(4);
    assert.equal(p.messages.length, 0);
    p.update(5.9);
    assert.equal(p.messages.length, 0, 'faltando 0,1s ainda não chegou');
    p.update(0.2);
    assert.equal(p.messages.length, 1);
    assert.equal(p.unreadCount, 1);
  });

  test('update com dt inválido ou parado não move o relógio', () => {
    const p = novoCelular();
    p.scheduleMessage({ from: 'Mãe', text: 'oi' }, 1);
    p.update(0);
    p.update(-5);
    p.update(NaN);
    p.update(undefined);
    assert.equal(p.messages.length, 0);
    p.update(1);
    assert.equal(p.messages.length, 1);
  });

  test('as mensagens dos pais chegam na ordem escrita e com intervalo entre elas', () => {
    const p = novoCelular();
    assert.equal(p.startParentsConversation(), true);
    assert.equal(p.startParentsConversation(), false, 'não reenvia');

    const primeira = PARENTS_MESSAGES[0].delay;
    p.update(primeira - 0.5);
    assert.equal(p.messages.length, 0, 'não chega antes da hora');
    p.update(0.5);
    assert.equal(p.messages.length, 1);
    assert.equal(p.messages[0].from, PARENTS_CONTACT);

    p.update(PARENTS_MESSAGES[1].delay);
    assert.equal(p.messages.length, 2);
    p.update(PARENTS_MESSAGES[2].delay);
    assert.equal(p.messages.length, 3);
    assert.deepEqual(p.messages.map(m => m.id), PARENTS_MESSAGES.map(m => m.id));
    assert.equal(p.unreadCount, 3);
  });

  test('um update longo entrega tudo que venceu, na ordem', () => {
    const p = novoCelular();
    p.startParentsConversation();
    p.update(600);
    assert.deepEqual(p.messages.map(m => m.id), PARENTS_MESSAGES.map(m => m.id));
    assert.equal(p.pending.length, 0);
  });

  test('carimbo de hora vem do jogo quando a mensagem não traz um', () => {
    const p = novoCelular({ getTimeLabel: () => '07:42' });
    p.pushMessage({ from: 'Mãe', text: 'oi' });
    assert.equal(p.messages[0].at, '07:42');
    p.pushMessage({ from: 'Mãe', text: 'oi de novo', at: '23:10' });
    assert.equal(p.messages[1].at, '23:10');
  });
});

describe('Phone — texto por sexo do personagem', () => {
  // O possessivo mora dentro da variação — é o que impede o "meu filha".
  const texto = 'Oi, {{m:meu filho|f:minha filha|x:meu bem}}.';

  test('applyPronouns escolhe a variante dos três sexos', () => {
    assert.equal(applyPronouns(texto, 'm'), 'Oi, meu filho.');
    assert.equal(applyPronouns(texto, 'f'), 'Oi, minha filha.');
    assert.equal(applyPronouns(texto, 'x'), 'Oi, meu bem.');
  });

  test('sexo desconhecido cai no masculino, igual ao DialogueSystem', () => {
    assert.equal(applyPronouns(texto, undefined), 'Oi, meu filho.');
    assert.equal(applyPronouns(texto, 'z'), 'Oi, meu filho.');
  });

  test('texto sem a sintaxe passa intacto e nulo vira string vazia', () => {
    assert.equal(applyPronouns('Bom dia.', 'f'), 'Bom dia.');
    assert.equal(applyPronouns(null, 'f'), '');
  });

  test('messageText resolve a mensagem guardada com o sexo do celular', () => {
    for (const [sexo, esperado] of [['m', 'meu filho'], ['f', 'minha filha'], ['x', 'meu bem']]) {
      const p = novoCelular({ sex: sexo });
      const m = p.pushMessage({ from: 'Mãe', text: texto });
      assert.equal(p.messageText(m), `Oi, ${esperado}.`);
      assert.equal(p.messages[0].text, texto, 'o texto guardado continua com a sintaxe crua');
    }
  });

  test('setSex muda a leitura das mensagens já recebidas', () => {
    const p = novoCelular({ sex: 'm' });
    const m = p.pushMessage({ from: 'Mãe', text: texto });
    p.setSex('f');
    assert.equal(p.messageText(m), 'Oi, minha filha.');
  });

  test('as mensagens dos pais funcionam nos três sexos, sem sobrar sintaxe', () => {
    for (const sexo of ['m', 'f', 'x']) {
      const p = novoCelular({ sex: sexo });
      p.startParentsConversation();
      p.update(600);
      assert.equal(p.messages.length, PARENTS_MESSAGES.length);
      for (const m of p.messages) {
        const texto = p.messageText(m);
        assert.ok(texto.length > 0);
        assert.ok(!texto.includes('{{'), `sobrou sintaxe de pronome em "${texto}"`);
        assert.ok(!texto.includes('|f:'), `sobrou sintaxe de pronome em "${texto}"`);
      }
    }
  });
});

describe('escapeHtml', () => {
  test('escapa o que quebraria a marcação', () => {
    assert.equal(escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(3), '3');
  });
});

describe('Tutorial — ordem dos passos', () => {
  const ordem = ['moveu', 'olhou', 'interagiu', 'leu_mensagem', 'saiu_do_apartamento', 'desceu_a_escada', 'saiu_do_predio'];

  test('os passos estão na ordem combinada', () => {
    assert.deepEqual(TUTORIAL_STEPS.map(s => s.id), ordem);
  });

  test('avança um passo de cada vez, na ordem', () => {
    const t = new Tutorial();
    for (const id of ordem) {
      assert.equal(t.currentStep.id, id);
      assert.equal(t.advance(id), true);
    }
    assert.equal(t.isDone, true);
    assert.equal(t.currentStep, null);
    assert.equal(t.currentHint, null);
  });

  test('evento fora de ordem não adianta nem atrasa nada', () => {
    const t = new Tutorial();
    assert.equal(t.advance('saiu_do_predio'), false);
    assert.equal(t.advance('leu_mensagem'), false);
    assert.equal(t.currentStep.id, 'moveu');
    assert.equal(t.advance('moveu'), true);
    assert.equal(t.currentStep.id, 'olhou');
  });

  test('não regride: repetir um passo já cumprido não volta atrás', () => {
    const t = new Tutorial();
    t.advance('moveu');
    t.advance('olhou');
    assert.equal(t.currentStep.id, 'interagiu');
    assert.equal(t.advance('moveu'), false);
    assert.equal(t.advance('olhou'), false);
    assert.equal(t.currentStep.id, 'interagiu');
  });

  test('depois de concluído, nenhum evento reabre o tutorial', () => {
    const t = new Tutorial();
    for (const id of ordem) t.advance(id);
    for (const id of ordem) assert.equal(t.advance(id), false);
    assert.equal(t.isDone, true);
    assert.equal(t.currentHint, null);
  });

  test('onChange avisa só quando o passo muda de verdade', () => {
    let n = 0;
    const t = new Tutorial({ onChange: () => n++ });
    t.advance('errado');
    assert.equal(n, 0);
    t.advance('moveu');
    assert.equal(n, 1);
  });

  test('finish encerra o tutorial de uma vez', () => {
    const t = new Tutorial();
    assert.equal(t.finish(), true);
    assert.equal(t.isDone, true);
    assert.equal(t.finish(), false);
  });
});

describe('Tutorial — dicas citam a tecla real', () => {
  test('a dica usa o rótulo que o jogo informa, e acompanha o remapeamento', () => {
    let tecla = 'E';
    const t = new Tutorial({ getKeyLabel: acao => (acao === 'interact' ? tecla : null) });
    t.advance('moveu');
    t.advance('olhou');
    assert.ok(t.currentHint.startsWith('E '), t.currentHint);
    tecla = 'G';
    assert.ok(t.currentHint.startsWith('G '), 'remapear a tecla muda a dica na hora');
  });

  test('sem rótulo utilizável, cai no padrão em vez de mostrar travessão', () => {
    const semNada = new Tutorial();
    const semTecla = new Tutorial({ getKeyLabel: () => '—' });
    for (const t of [semNada, semTecla]) {
      t.advance('moveu');
      t.advance('olhou');
      assert.ok(t.currentHint.startsWith('E '), t.currentHint);
      assert.ok(!t.currentHint.includes('—'));
    }
  });

  test('a dica do celular cita a tecla do celular', () => {
    const t = new Tutorial({ getKeyLabel: acao => (acao === 'phone' ? 'M' : 'E') });
    t.advance('moveu');
    t.advance('olhou');
    t.advance('interagiu');
    assert.equal(t.currentStep.id, 'leu_mensagem');
    assert.ok(t.currentHint.startsWith('M '), t.currentHint);
    assert.equal(PHONE_DEFAULT_KEY, 'KeyM');
  });

  test('os passos sem tecla configurável têm dica própria e sem tecla vazia', () => {
    const t = new Tutorial();
    assert.ok(t.currentHint.includes('W A S D'));
    t.advance('moveu');
    assert.ok(t.currentHint.toLowerCase().includes('mouse'));
  });
});

describe('Tutorial — persistência', () => {
  test('serialize/deserialize preserva o passo atual', () => {
    const t = new Tutorial();
    t.advance('moveu');
    t.advance('olhou');
    const outro = new Tutorial();
    outro.deserialize(t.serialize());
    assert.equal(outro.currentStep.id, 'interagiu');
    assert.equal(outro.isDone, false);
  });

  test('tutorial concluído não reaparece depois de recarregar', () => {
    const t = new Tutorial();
    for (const s of TUTORIAL_STEPS) t.advance(s.id);
    const outro = new Tutorial();
    outro.deserialize(t.serialize());
    assert.equal(outro.isDone, true);
    assert.equal(outro.currentHint, null);
    assert.equal(outro.advance('moveu'), false);
  });

  test('deserialize com dado ausente ou inválido não lança e mantém o padrão', () => {
    for (const entrada of [null, undefined, 42, 'texto', [], { step: 'passo_que_nao_existe' }, { index: -3 }, { index: 'dois' }, { done: 'sim' }]) {
      const t = new Tutorial();
      assert.doesNotThrow(() => t.deserialize(entrada), `entrada: ${JSON.stringify(entrada)}`);
      assert.equal(t.currentStep.id, 'moveu', `entrada: ${JSON.stringify(entrada)}`);
      assert.equal(t.isDone, false);
    }
  });

  test('save de uma versão com outros passos: id desconhecido não corrompe o progresso', () => {
    const t = new Tutorial();
    t.advance('moveu');
    t.deserialize({ step: 'passo_de_outra_versao', done: false });
    assert.equal(t.currentStep.id, 'olhou', 'ficou como estava');
  });
});

describe('Phone — persistência', () => {
  test('serialize/deserialize devolve mensagens, leitura e conversa aberta', () => {
    const p = novoCelular({ sex: 'f' });
    p.startParentsConversation();
    p.update(600);
    p.open();
    p.close();

    const outro = novoCelular({ sex: 'f' });
    outro.deserialize(p.serialize());
    assert.equal(outro.messages.length, PARENTS_MESSAGES.length);
    assert.equal(outro.unreadCount, 0, 'o que já tinha sido lido continua lido');
    assert.equal(outro.selected, PARENTS_CONTACT);
    assert.equal(outro.parentsStarted, true);
    assert.equal(outro.isOpen, false, 'o celular nunca volta aberto');
  });

  test('mensagem ainda não entregue continua agendada depois de recarregar', () => {
    const p = novoCelular();
    p.startParentsConversation();
    p.update(2);

    const outro = novoCelular();
    outro.deserialize(p.serialize());
    assert.equal(outro.messages.length, 0);
    assert.equal(outro.pending.length, PARENTS_MESSAGES.length);
    outro.update(600);
    assert.equal(outro.messages.length, PARENTS_MESSAGES.length);
    assert.equal(outro.startParentsConversation(), false, 'não reenvia a conversa depois do save');
  });

  test('o tutorial concluído continua concluído no save do celular', () => {
    const p = novoCelular();
    for (const s of TUTORIAL_STEPS) p.advanceTutorial(s.id);
    assert.equal(p.currentHint, null);

    const outro = novoCelular();
    outro.deserialize(p.serialize());
    assert.equal(outro.tutorial.isDone, true);
    assert.equal(outro.currentHint, null);
    assert.equal(outro.advanceTutorial('moveu'), false);
  });

  test('deserialize com dado ausente ou inválido não lança e mantém o padrão', () => {
    for (const entrada of [null, undefined, 0, 'save', [], { messages: 'nada' }, { pending: 7 }]) {
      const p = novoCelular();
      assert.doesNotThrow(() => p.deserialize(entrada), `entrada: ${JSON.stringify(entrada)}`);
      assert.deepEqual(p.messages, []);
      assert.deepEqual(p.pending, []);
      assert.equal(p.parentsStarted, false);
      assert.equal(p.unreadCount, 0);
      assert.equal(p.tutorial.currentStep.id, 'moveu');
    }
  });

  test('entradas quebradas dentro das listas são descartadas, o resto entra', () => {
    const p = novoCelular();
    p.deserialize({
      messages: [
        { id: 'ok', from: 'Mãe', text: 'vale', at: '08:00', read: true },
        null,
        { from: 'Mãe' },
        { from: 'Mãe', text: 99 },
        'lixo',
      ],
      pending: [
        { remaining: 3, msg: { from: 'Mãe', text: 'ainda vem' } },
        { remaining: 'logo', msg: { from: 'Mãe', text: 'inválida' } },
        { remaining: 3 },
        null,
      ],
    });
    assert.equal(p.messages.length, 1);
    assert.equal(p.messages[0].id, 'ok');
    assert.equal(p.messages[0].read, true);
    assert.equal(p.pending.length, 1);
    p.update(3);
    assert.equal(p.messages.length, 2);
  });

  test('parentsStarted e selected inválidos caem no padrão sem lançar', () => {
    const p = novoCelular();
    p.deserialize({ parentsStarted: 'sim', selected: 'Ninguém' });
    assert.equal(p.parentsStarted, false);
    assert.equal(p.selected, null);
  });

  test('ids automáticos do save não são reemitidos', () => {
    const p = novoCelular();
    p.pushMessage({ from: 'Mãe', text: 'um' });
    p.pushMessage({ from: 'Mãe', text: 'dois' });

    const outro = novoCelular();
    outro.deserialize(p.serialize());
    const nova = outro.pushMessage({ from: 'Mãe', text: 'três' });
    const ids = outro.messages.map(m => m.id);
    assert.equal(new Set(ids).size, ids.length, `ids repetidos: ${ids.join(', ')}`);
    assert.equal(outro.messages.length, 3);
    assert.ok(nova);
  });

  test('serialize não devolve referência viva pro estado interno', () => {
    const p = novoCelular();
    p.pushMessage({ id: 'a', from: 'Mãe', text: 'um' });
    const dados = p.serialize();
    dados.messages[0].text = 'mexido';
    dados.messages.push({ id: 'b', from: 'X', text: 'intruso' });
    assert.equal(p.messages.length, 1);
    assert.equal(p.messages[0].text, 'um');
  });
});

describe('Phone — view opcional', () => {
  test('a lógica anda sem DOM e a view recebe o estado quando existe', () => {
    const pintadas = [];
    const view = {
      render: state => pintadas.push(state),
      notify: () => pintadas.push('aviso'),
    };
    const p = new Phone({ view });
    p.pushMessage({ from: 'Mãe', text: 'oi' });
    assert.ok(pintadas.includes('aviso'));
    const ultimo = pintadas.filter(x => x !== 'aviso').pop();
    assert.equal(ultimo.unreadCount, 1);
    assert.equal(ultimo.conversations[0].from, 'Mãe');
    assert.equal(ultimo.thread[0].text, 'oi');
    assert.equal(typeof ultimo.hint, 'string');
  });

  test('viewState entrega o texto já resolvido pro sexo do personagem', () => {
    const p = novoCelular({ sex: 'f' });
    p.pushMessage({ from: 'Mãe', text: 'Tudo bem, {{m:filho|f:filha|x:criatura}}?' });
    const estado = p.viewState();
    assert.equal(estado.thread[0].text, 'Tudo bem, filha?');
    assert.equal(estado.conversations[0].preview, 'Tudo bem, filha?');
  });
});

describe('Phone — casos de borda do save', () => {
  test('mensagem sem id no save não rouba o id automático de outra', () => {
    const p = novoCelular();
    p.deserialize({
      messages: [
        { from: 'Mãe', text: 'sem id' },
        { id: 'msg_1', from: 'Mãe', text: 'com id automático antigo' },
      ],
    });
    const ids = p.messages.map(m => m.id);
    assert.equal(new Set(ids).size, ids.length, `ids repetidos: ${ids.join(', ')}`);
  });

  test('duas mensagens vencendo no mesmo update chegam ambas, na ordem', () => {
    const p = novoCelular();
    p.scheduleMessage({ id: 'a', from: 'Mãe', text: 'um' }, 1);
    p.scheduleMessage({ id: 'b', from: 'Mãe', text: 'dois' }, 2);
    p.update(5);
    assert.deepEqual(p.messages.map(m => m.id), ['a', 'b']);
    assert.equal(p.pending.length, 0);
  });
});
