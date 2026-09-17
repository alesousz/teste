import * as THREE from 'three';
import { clone as cloneSkeleton } from '../vendor/jsm/utils/SkeletonUtils.js';
import { getCharacterTemplates } from './assets.js';
import { CONJUNTO_DE_FABRICA } from './animacoes.js';

// Quais animações cada personagem usa não está mais escrito aqui: vem de um
// CONJUNTO (src/data/animacoes.json, aba Animações do editor). O de fábrica
// fica em animacoes.js e é o que vale quando ninguém escolheu nada.
//
// Os nomes são os da Universal Animation Library (Quaternius, CC0) — o rig
// dela usa exatamente os mesmos nomes de osso do Universal Base Characters,
// então os clipes funcionam direto nos nossos personagens sem retargeting.
const FADE_SECONDS = 0.25;
const ONE_SHOT_FADE_SECONDS = 0.08;

/**
 * Instancia um clone independente (esqueleto próprio) do personagem
 * masculino ou feminino do pack "Universal Base Characters" (Quaternius,
 * CC0), com animação real via AnimationMixer, em vez de pose fixa.
 *
 * `clipes` é o conjunto de animação: {estados:{idle,walk,...}, gestos:{...}}.
 * Trocar ele em tempo de jogo (trocarConjunto) é o que faz um NPC passar a
 * andar diferente do meio de uma missão em diante.
 */
export function buildHumanoid({ variant = 'male', clipes = CONJUNTO_DE_FABRICA } = {}) {
  const templates = getCharacterTemplates();
  const template = templates?.[variant] ?? templates?.male;
  const group = cloneSkeleton(template);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const mixer = new THREE.AnimationMixer(group);
  let actions = {};
  let oneShotActions = {};
  let current = 'idle';
  let locked = false;
  // Quais clipes este boneco está usando agora — o que o conjunto pediu, já
  // com o de fábrica no lugar do que faltou. Serve pra conferir de fora (no
  // jogo e nos testes) que a troca de conjunto pegou mesmo.
  let clipesEmUso = { estados: {}, gestos: {} };

  function acharClipe(nome) {
    return nome ? THREE.AnimationClip.findByName(templates.clips, nome) : null;
  }

  /**
   * Monta as actions de um conjunto. Os estados já entram tocando com peso 0
   * (o crossfade só rampeia peso; ver crossFadeTo), e os gestos entram
   * parados, pra tocar uma vez quando alguém pedir.
   */
  function montarAcoes(conjunto) {
    const estados = { ...CONJUNTO_DE_FABRICA.estados, ...(conjunto?.estados ?? {}) };
    const gestos = { ...CONJUNTO_DE_FABRICA.gestos, ...(conjunto?.gestos ?? {}) };
    clipesEmUso = { estados: { ...estados }, gestos: { ...gestos } };
    const novasActions = {};
    for (const [state, clipName] of Object.entries(estados)) {
      const clip = acharClipe(clipName) ?? acharClipe(CONJUNTO_DE_FABRICA.estados[state]);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(0);
      novasActions[state] = action;
    }
    const novosGestos = {};
    for (const [name, clipName] of Object.entries(gestos)) {
      const clip = acharClipe(clipName) ?? acharClipe(CONJUNTO_DE_FABRICA.gestos[name]);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      novosGestos[name] = action;
    }
    return { novasActions, novosGestos };
  }

  // fadeIn() só agenda uma rampa que multiplica o peso-base da action; se
  // esse peso-base ficar em 0 (como no setup acima), o efetivo sempre dá
  // 0*rampa=0 e o personagem trava na pose de bind (T-pose) em vez de
  // assumir a nova animação. Por isso sempre restauramos o peso pra 1 aqui
  // antes de iniciar qualquer fade-in.
  function crossFadeTo(action) {
    for (const a of Object.values(actions)) {
      if (a !== action) a.fadeOut(FADE_SECONDS);
    }
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.reset().setEffectiveTimeScale(1).fadeIn(FADE_SECONDS).play();
  }

  ({ novasActions: actions, novosGestos: oneShotActions } = montarAcoes(clipes));
  if (actions.idle) actions.idle.setEffectiveWeight(1);

  return {
    group,
    /** Os clipes que este boneco está usando e o estado em que ele está. */
    emUso() {
      return { estado: current, ...clipesEmUso };
    },
    setState(state) {
      if (locked || state === current || !actions[state]) return;
      crossFadeTo(actions[state]);
      current = state;
    },
    /**
     * Troca o conjunto inteiro sem recriar o personagem: as actions velhas
     * saem do mixer e as novas entram já no mesmo estado em que ele estava,
     * então a troca aparece como uma transição e não como um solavanco.
     * Durante um gesto a troca espera o gesto acabar — trocar no meio de um
     * soco deixaria o personagem travado na pose.
     */
    trocarConjunto(novoConjunto) {
      if (locked) return false;
      const estadoAtual = current;
      for (const a of [...Object.values(actions), ...Object.values(oneShotActions)]) {
        a.stop();
        mixer.uncacheAction(a.getClip(), group);
      }
      ({ novasActions: actions, novosGestos: oneShotActions } = montarAcoes(novoConjunto));
      current = null;
      if (actions[estadoAtual]) {
        actions[estadoAtual].setEffectiveWeight(1);
        actions[estadoAtual].play();
        current = estadoAtual;
      } else if (actions.idle) {
        actions.idle.setEffectiveWeight(1);
        current = 'idle';
      }
      return true;
    },
    // Toca uma animação de disparo único (soco, etc.) por cima da
    // locomoção, bloqueia trocas de estado enquanto ela dura, e ao final
    // devolve o controle chamando onFinish — quem chamar deve então pedir
    // o próximo estado de locomoção via setState().
    playOnce(name, onFinish) {
      const action = oneShotActions[name];
      if (!action) { onFinish?.(); return; }
      locked = true;
      for (const a of Object.values(actions)) a.fadeOut(ONE_SHOT_FADE_SECONDS);
      action.enabled = true;
      action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(ONE_SHOT_FADE_SECONDS).play();
      const onEvent = (e) => {
        if (e.action !== action) return;
        mixer.removeEventListener('finished', onEvent);
        action.fadeOut(FADE_SECONDS);
        // O soco zerou o peso da animação de locomoção corrente; forçamos
        // o próximo setState a reativá-la mesmo se for "o mesmo" estado.
        current = null;
        locked = false;
        onFinish?.();
      };
      mixer.addEventListener('finished', onEvent);
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}
