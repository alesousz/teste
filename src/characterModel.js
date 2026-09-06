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
};
const FADE_SECONDS = 0.25;

/**
 * Instancia um clone independente (esqueleto próprio) do personagem
 * masculino ou feminino do pack "Universal Base Characters" (Quaternius,
 * CC0), com animação real (idle/andar/correr/conversar) via
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
  let current = 'idle';
  if (actions.idle) actions.idle.setEffectiveWeight(1);

  return {
    group,
    setState(state) {
      if (state === current || !actions[state]) return;
      if (actions[current]) actions[current].fadeOut(FADE_SECONDS);
      const next = actions[state];
      // fadeIn() só agenda uma rampa que multiplica o peso-base da action;
      // como o peso-base fica em 0 (definido no setup), é preciso restaurá-lo
      // para 1 aqui, senão o efetivo fica 0*rampa=0 e o personagem "trava"
      // na pose de bind (T-pose) em vez de assumir a nova animação.
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.reset().setEffectiveTimeScale(1).fadeIn(FADE_SECONDS).play();
      current = state;
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}
