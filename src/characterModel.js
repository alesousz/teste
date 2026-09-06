import * as THREE from 'three';
import { clone as cloneSkeleton } from '../vendor/jsm/utils/SkeletonUtils.js';
import { getCharacterTemplates } from './assets.js';

// Nomes de clipe na Universal Animation Library (Quaternius, CC0) — o rig
// dela usa exatamente os mesmos nomes de osso do Universal Base Characters,
// então os clipes funcionam direto nos nossos personagens sem retargeting.
const STATE_CLIPS = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  run: 'Sprint_Loop',
  talk: 'Idle_Talking_Loop',
  jump: 'Jump_Loop',
};
// Clipes de um disparo só (não fazem loop): tocam uma vez e devolvem o
// controle pro estado de locomoção corrente via callback.
const ONE_SHOT_CLIPS = {
  attack: 'Punch_Jab',
};
const FADE_SECONDS = 0.25;
const ONE_SHOT_FADE_SECONDS = 0.08;

/**
 * Instancia um clone independente (esqueleto próprio) do personagem
 * masculino ou feminino do pack "Universal Base Characters" (Quaternius,
 * CC0), com animação real (idle/andar/correr/pular/socar) via
 * AnimationMixer, em vez de pose fixa.
 */
export function buildHumanoid({ variant = 'male' } = {}) {
  const templates = getCharacterTemplates();
  const template = templates?.[variant] ?? templates?.male;
  const group = cloneSkeleton(template);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const mixer = new THREE.AnimationMixer(group);
  const actions = {};
  for (const [state, clipName] of Object.entries(STATE_CLIPS)) {
    const clip = THREE.AnimationClip.findByName(templates.clips, clipName);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.play();
    action.setEffectiveWeight(0);
    actions[state] = action;
  }
  const oneShotActions = {};
  for (const [name, clipName] of Object.entries(ONE_SHOT_CLIPS)) {
    const clip = THREE.AnimationClip.findByName(templates.clips, clipName);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    oneShotActions[name] = action;
  }

  let current = 'idle';
  let locked = false;
  if (actions.idle) actions.idle.setEffectiveWeight(1);

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

  return {
    group,
    setState(state) {
      if (locked || state === current || !actions[state]) return;
      crossFadeTo(actions[state]);
      current = state;
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
