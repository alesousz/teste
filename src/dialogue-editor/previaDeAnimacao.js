// Prévia da aba Animações: o boneco do jogo, num canvas pequeno, fazendo o
// clipe que o autor clicou. É a parte "igual ao Mixamo" da aba — escolher
// animação lendo nome numa lista não funciona, é preciso ver.
//
// Fica separado de animacoesAba.js de propósito: aqui mora todo o three, e
// lá mora a decisão do que vai pro arquivo. Assim a aba roda nos testes em
// Node, com uma prévia de mentira no lugar desta.

import * as THREE from 'three';
import { clone as cloneSkeleton } from '../../vendor/jsm/utils/SkeletonUtils.js';
import { preloadCharacterAssets } from '../assets.js';

const COR_DE_FUNDO = 0x14161c;

/**
 * Monta a prévia num canvas. Devolve o controle da prévia; enquanto os
 * arquivos não carregam, `tocar` só guarda o pedido e toca quando chegarem.
 */
export async function criarPrevia(canvas, { variante = 'male' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COR_DE_FUNDO);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);

  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x30302a, 1.5));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(2.5, 4, 3);
  scene.add(sol);

  // Chão só pra dar noção de apoio: sem ele o boneco parece flutuar.
  const chao = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 32),
    new THREE.MeshStandardMaterial({ color: 0x22252e, roughness: 1 }),
  );
  chao.rotation.x = -Math.PI / 2;
  scene.add(chao);

  const templates = await preloadCharacterAssets();

  const suporte = new THREE.Group();
  scene.add(suporte);
  let modelo = null;
  let mixer = null;
  let acaoAtual = null;
  let clipePedido = null;
  let varianteAtual = variante;
  let giro = 0.6;          // o boneco fica meio de lado: lê melhor que de frente
  let rodando = true;

  /**
   * A caixa do personagem inteiro, na pose em que ele foi modelado. É medida
   * malha por malha porque a caixa pronta de um SkinnedMesh acompanha os
   * ossos: no meio de uma animação ela encolhe, e o enquadramento pularia a
   * cada clipe trocado.
   */
  function medirNaPoseDeRepouso(raiz) {
    const caixa = new THREE.Box3();
    raiz.updateWorldMatrix(true, true);
    raiz.traverse(o => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      caixa.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    return caixa;
  }

  // Enquadramento medido, não chutado: o tamanho do personagem vem do
  // arquivo, e um número escrito à mão aqui deixaria o boneco minúsculo (ou
  // cortado) no dia em que alguém trocar o modelo.
  let alturaDoModelo = 1.7;
  let centroDoModelo = new THREE.Vector3(0, 0.85, 0);

  function montarModelo(qual) {
    if (modelo) {
      suporte.remove(modelo);
      mixer?.stopAllAction();
    }
    const base = templates[qual] ?? templates.male;
    // Mesmo clone do jogo: `.clone()` comum num SkinnedMesh deixa o boneco
    // preso ao esqueleto do original — os dois se mexem juntos, e a caixa
    // medida sai do tamanho errado.
    modelo = cloneSkeleton(base);
    modelo.position.y = 0;
    suporte.add(modelo);
    mixer = new THREE.AnimationMixer(modelo);
    acaoAtual = null;

    const caixa = medirNaPoseDeRepouso(modelo);
    if (caixa.isEmpty()) return;
    const tamanho = caixa.getSize(new THREE.Vector3());
    alturaDoModelo = Math.max(0.2, tamanho.y);
    centroDoModelo = caixa.getCenter(new THREE.Vector3());
    chao.position.y = caixa.min.y;
    chao.scale.setScalar(Math.max(0.4, alturaDoModelo * 0.55));
  }

  function tocar(nomeDoClipe) {
    clipePedido = nomeDoClipe;
    if (!mixer || !nomeDoClipe) return false;
    const clip = THREE.AnimationClip.findByName(templates.clips, nomeDoClipe);
    if (!clip) return false;
    const nova = mixer.clipAction(clip);
    nova.reset();
    nova.setLoop(THREE.LoopRepeat, Infinity);   // na prévia tudo repete, até o gesto
    nova.setEffectiveWeight(1);
    nova.play();
    if (acaoAtual && acaoAtual !== nova) acaoAtual.crossFadeTo(nova, 0.2, false);
    acaoAtual = nova;
    return true;
  }

  montarModelo(varianteAtual);

  function ajustarTamanho() {
    const l = canvas.clientWidth || 260;
    const a = canvas.clientHeight || 320;
    renderer.setSize(l, a, false);
    camera.aspect = l / a || 1;
    camera.updateProjectionMatrix();

    // Distância que faz o personagem inteiro caber em pé, com uma folga —
    // num canvas estreito o que aperta é a largura, por isso os dois eixos.
    const folga = 1.25;
    const meioFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const porAltura = (alturaDoModelo / 2) / Math.tan(meioFov);
    const porLargura = porAltura / Math.max(0.35, camera.aspect);
    const distancia = Math.max(porAltura, porLargura) * folga;

    const alvoY = centroDoModelo.y;
    camera.position.set(0, alvoY + alturaDoModelo * 0.08, distancia);
    camera.lookAt(0, alvoY, 0);
    camera.updateProjectionMatrix();
  }
  ajustarTamanho();
  const aoRedimensionar = () => ajustarTamanho();
  window.addEventListener('resize', aoRedimensionar);

  const relogio = new THREE.Clock();
  function quadro() {
    if (!rodando) return;
    requestAnimationFrame(quadro);
    const dt = relogio.getDelta();
    suporte.rotation.y = giro;
    mixer?.update(dt);
    renderer.render(scene, camera);
  }
  quadro();

  return {
    tocar,
    /** Troca o corpo sem perder o clipe que estava tocando. */
    definirVariante(qual) {
      if (qual === varianteAtual) return;
      varianteAtual = qual;
      montarModelo(qual);
      ajustarTamanho();
      if (clipePedido) tocar(clipePedido);
    },
    /** Arrastar o mouse no canvas gira o boneco. */
    girar(delta) {
      giro += delta;
    },
    get tocando() { return clipePedido; },
    destruir() {
      rodando = false;
      window.removeEventListener('resize', aoRedimensionar);
      mixer?.stopAllAction();
      renderer.dispose();
    },
  };
}
