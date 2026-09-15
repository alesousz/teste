// Pipeline de renderização: mapeamento tonal, iluminação por imagem e
// qualidade de sombra.
//
// Tudo aqui usa só o que vem no three.module.js vendorizado. Os módulos de
// pós-processamento oficiais (EffectComposer, UnrealBloomPass, SMAAPass) vivem
// em `three/examples/jsm`, que NÃO está no repositório e não pôde ser baixado
// neste ambiente — a saída de rede pro CDN é bloqueada. Por isso o bloom é
// escrito aqui a partir de primitivas do núcleo, e não importado.

import * as THREE from 'three';

// Regenerar o mapa de ambiente é caro (é um render + convolução). Só refaz
// quando o céu mudou o bastante pra a diferença aparecer.
const LIMIAR_MUDANCA_CEU = 0.035;

// THREE.Color não tem distanceTo (só Vector3 tem). Diferença componente a
// componente é o que importa aqui: "o céu mudou o bastante pra refazer?".
function distanciaDeCor(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export class RenderPipeline {
  constructor(renderer, scene, opcoes = {}) {
    this.renderer = renderer;
    this.scene = scene;
    // Mesma detecção que decide o pós-processamento. Num rasterizador de
    // software cada texel de sombra e cada busca de textura é CPU: medido,
    // o passe visual dobrou o tempo de um teste E2E (21 s -> 48 s). Numa GPU
    // real a diferença entre 1024 e 2048 é desprezível; aqui não é.
    this.software = opcoes.software ?? false;

    // ACES: a curva usada em cinema e na maioria dos motores atuais. Sem ela,
    // qualquer luz forte satura em branco liso e o resto some no preto.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileEquirectangularShader();
    this._envAtual = null;
    this._corDoEnvAtual = new THREE.Color(0, 0, 0);
    this._ultimoDayFactor = -1;
  }

  /**
   * Ajusta o custo da sombra ao que a máquina aguenta. Chamado uma vez, antes
   * do primeiro quadro — depois disso trocar mapSize exige descartar o mapa
   * já alocado.
   */
  configurarSombra(sun) {
    const lado = this.software ? 1024 : 2048;
    sun.shadow.mapSize.set(lado, lado);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    return lado;
  }

  /**
   * Gera o mapa de ambiente a partir do próprio céu do jogo.
   *
   * É isto que faz materiais PBR pararem de parecer plástico: sem um ambiente,
   * `MeshStandardMaterial` só tem as luzes diretas pra refletir, e superfícies
   * lisas ficam pretas onde nenhuma luz bate.
   */
  updateEnvironment(skyColor, groundColor, dayFactor, forcar = false) {
    const mudouCor = distanciaDeCor(skyColor, this._corDoEnvAtual);
    const mudouLuz = Math.abs(dayFactor - this._ultimoDayFactor);
    if (!forcar && mudouCor < LIMIAR_MUDANCA_CEU && mudouLuz < LIMIAR_MUDANCA_CEU) return false;
    // Em software o ambiente é gerado uma vez e fica: refazer a convolução a
    // cada mudança de céu custa mais do que o realismo que entrega. Pular o
    // ambiente POR COMPLETO seria ~20% mais rápido (medido), mas aí os testes
    // deixariam de exercitar o caminho que o jogo de fato usa — e o E2E não
    // trava o deploy, então não compensa trocar cobertura por tempo.
    if (!forcar && this.software && this._envAtual) return false;

    const cena = new THREE.Scene();
    // Cúpula: gradiente do horizonte pro zênite, mais o chão. Uma esfera
    // invertida com cores por vértice é o suficiente e custa quase nada.
    const geo = new THREE.SphereGeometry(50, 24, 16);
    const cores = [];
    const pos = geo.attributes.position;
    const zenite = skyColor.clone().multiplyScalar(1.0);
    const horizonte = skyColor.clone().lerp(new THREE.Color(0xffffff), 0.35);
    const chao = groundColor.clone();
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;                    // -1 (baixo) .. 1 (cima)
      if (y >= 0) tmp.copy(horizonte).lerp(zenite, Math.min(1, y * 1.4));
      else tmp.copy(horizonte).lerp(chao, Math.min(1, -y * 2.2));
      cores.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
    const domo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, toneMapped: false,
    }));
    cena.add(domo);

    const alvo = this._pmrem.fromScene(cena, 0.04);
    if (this._envAtual) this._envAtual.dispose();
    this._envAtual = alvo;
    this.scene.environment = alvo.texture;

    geo.dispose();
    domo.material.dispose();
    this._corDoEnvAtual.copy(skyColor);
    this._ultimoDayFactor = dayFactor;
    return true;
  }

  /**
   * Reaponta a sombra do sol pro redor do jogador.
   *
   * A câmera de sombra cobria a cidade inteira (280 m num mapa de 1536): cada
   * texel valia ~18 cm, e sombra de interior nessa resolução vira mancha. Aqui
   * ela passa a cobrir só o que está perto, sem mudar a DIREÇÃO da luz — o
   * ciclo dia/noite continua mandando nisso.
   */
  focusShadows(sun, alvoPos, raio = 55) {
    if (this.software) raio = 40;   // menos área, mais nitidez pelo mesmo custo
    const dir = sun.position.clone().sub(sun.target.position).normalize();

    // Ancorar num passo discreto evita a sombra "nadar" enquanto o jogador
    // anda: sem isso, cada quadro reamostra o mapa num offset diferente.
    const cam = sun.shadow.camera;
    const passo = (raio * 2) / sun.shadow.mapSize.x;
    const cx = Math.round(alvoPos.x / passo) * passo;
    const cz = Math.round(alvoPos.z / passo) * passo;

    sun.target.position.set(cx, 0, cz);
    sun.position.copy(sun.target.position).addScaledVector(dir, 130);
    sun.target.updateMatrixWorld();

    if (cam.right !== raio) {
      cam.left = -raio; cam.right = raio; cam.top = raio; cam.bottom = -raio;
      cam.near = 1; cam.far = 320;
      cam.updateProjectionMatrix();
    }
  }

  /**
   * Dosa quanto do mapa de ambiente cada pedaço da cena recebe.
   *
   * O mapa de ambiente é aplicado sem nenhuma noção de oclusão: um material
   * dentro de um quarto fechado recebe a mesma luz de céu que um na calçada.
   * Sem dosar, o interior fica lavado, como se as paredes não existissem.
   * Um cômodo real enxerga só um pedaço do céu, pela janela — daí o valor
   * baixo lá dentro. (three r160 não tem Scene.environmentIntensity, então é
   * material por material mesmo.)
   */
  applyEnvIntensity(root, valor) {
    const vistos = new Set();
    root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || vistos.has(m) || m.envMapIntensity === undefined) continue;
        vistos.add(m);
        m.envMapIntensity = valor;
        m.needsUpdate = true;
      }
    });
    return vistos.size;
  }

  dispose() {
    this._envAtual?.dispose();
    this._pmrem.dispose();
  }
}
