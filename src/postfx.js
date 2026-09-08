// Pós-processamento escrito sobre primitivas do núcleo do three.
//
// POR QUE NÃO EffectComposer/UnrealBloomPass/SMAAPass: esses módulos vivem em
// `three/examples/jsm`, que não está vendorizado no projeto, e a saída de rede
// pro CDN é bloqueada neste ambiente (403 no proxy). Em vez de adicionar uma
// dependência de CDN — contra o princípio declarado no README — a cadeia é
// montada aqui com WebGLRenderTarget + ShaderMaterial, que são do núcleo.
//
// A cadeia:
//   cena  -> alvo HDR com MSAA        (serrilhado resolvido pelo próprio MSAA)
//         -> extração de brilho (½ res)
//         -> borrão separável, dois níveis
//         -> composição: base + bloom, mapeamento tonal ACES, sRGB
//
// O mapeamento tonal acontece AQUI, no fim, e não no renderer: enquanto a
// imagem circula pelos alvos ela precisa continuar em HDR linear, senão o
// bloom extrai brilho de uma imagem que já foi comprimida.

import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG_BRILHO = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float limiar;
  uniform float suavidade;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // smoothstep em vez de corte seco: sem isso a borda do brilho cintila
    // quando a luminância oscila em torno do limiar.
    float peso = smoothstep(limiar, limiar + suavidade, luma);
    gl_FragColor = vec4(c * peso, 1.0);
  }
`;

const FRAG_BORRAO = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 direcao;      // (1/w, 0) ou (0, 1/h)
  varying vec2 vUv;
  void main() {
    // Gaussiana de 9 amostras aproveitando filtragem linear: 5 buscas cobrem
    // 9 texels.
    const float p0 = 0.2270270270;
    const float p1 = 0.3162162162;
    const float p2 = 0.0702702703;
    const float o1 = 1.3846153846;
    const float o2 = 3.2307692308;
    vec3 soma = texture2D(tDiffuse, vUv).rgb * p0;
    soma += texture2D(tDiffuse, vUv + direcao * o1).rgb * p1;
    soma += texture2D(tDiffuse, vUv - direcao * o1).rgb * p1;
    soma += texture2D(tDiffuse, vUv + direcao * o2).rgb * p2;
    soma += texture2D(tDiffuse, vUv - direcao * o2).rgb * p2;
    gl_FragColor = vec4(soma, 1.0);
  }
`;

const FRAG_COMPOSICAO = /* glsl */`
  uniform sampler2D tBase;
  uniform sampler2D tBloomA;
  uniform sampler2D tBloomB;
  uniform float intensidade;
  uniform float exposicao;
  varying vec2 vUv;

  // ACES exatamente como o three implementa em ACESFilmicToneMapping
  // (matrizes de entrada/saída + RRTAndODTFit), e não a aproximação curta de
  // Narkowicz. Copiado do vendor/three.module.js de propósito: com a curva
  // aproximada, ligar e desligar o pós mudava visivelmente a cor das luzes
  // quentes da cidade — e as duas versões precisam parecer a mesma cena.
  // Nomes próprios: o three injeta o chunk de mapeamento tonal dele em TODO
  // material quando renderer.toneMapping != NoToneMapping, inclusive em
  // ShaderMaterial. Usar os nomes originais colide ("function already has a
  // body") e o shader não compila.
  vec3 ajusteRRTODT(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }

  vec3 acesLocal(vec3 color) {
    const mat3 entrada = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 saida = mat3(
      vec3( 1.60475, -0.10208, -0.00327),
      vec3(-0.53108,  1.10813, -0.07276),
      vec3(-0.07367, -0.00605,  1.07602)
    );
    color *= exposicao / 0.6;
    color = entrada * color;
    color = ajusteRRTODT(color);
    color = saida * color;
    return clamp(color, 0.0, 1.0);
  }

  // Curva sRGB de verdade (com o trecho linear perto do preto), não pow(1/2.2):
  // a diferença aparece justamente nas sombras, que é onde esta cena vive.
  vec3 paraSRGB(vec3 v) {
    return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92,
               vec3(lessThanEqual(v, vec3(0.0031308))));
  }

  void main() {
    vec3 base = texture2D(tBase, vUv).rgb;
    vec3 bloom = texture2D(tBloomA, vUv).rgb * 0.65 + texture2D(tBloomB, vUv).rgb * 0.35;
    vec3 cor = base + bloom * intensidade;
    cor = acesLocal(cor);
    // O alvo intermediário é NoColorSpace, então a conversão é manual aqui.
    cor = paraSRGB(cor);
    gl_FragColor = vec4(cor, 1.0);
  }
`;

function alvo(w, h, extra = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
    depthBuffer: false,
    ...extra,
  });
}

export class PostFX {
  constructor(renderer, largura, altura, opcoes = {}) {
    this.renderer = renderer;
    // Decidido pelo chamador. Importa saber antes de alocar: os seis alvos
    // custam memória de vídeo que não faz sentido reservar em quem não vai
    // usar a cadeia.
    this.enabled = opcoes.enabled ?? true;
    this.intensidade = opcoes.intensidade ?? 0.55;
    this.exposicao = opcoes.exposicao ?? 1.0;

    this._quadCena = new THREE.Scene();
    this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quadGeo = new THREE.PlaneGeometry(2, 2);
    this._quad = new THREE.Mesh(this._quadGeo, null);
    this._quad.frustumCulled = false;
    this._quadCena.add(this._quad);

    this._matBrilho = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG_BRILHO,
      uniforms: { tDiffuse: { value: null }, limiar: { value: opcoes.limiar ?? 0.75 }, suavidade: { value: 0.45 } },
      depthTest: false, depthWrite: false,
    });
    this._matBorrao = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG_BORRAO,
      uniforms: { tDiffuse: { value: null }, direcao: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
    });
    this._matComposicao = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG_COMPOSICAO,
      uniforms: {
        tBase: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
        intensidade: { value: this.intensidade }, exposicao: { value: this.exposicao },
      },
      depthTest: false, depthWrite: false,
    });

    if (this.enabled) this.setSize(largura, altura);
  }

  setSize(w, h) {
    if (!this.enabled) { this._w = w; this._h = h; return; }
    const dispose = a => a?.dispose();
    [this._cena, this._brilho, this._pingA, this._pongA, this._pingB, this._pongB].forEach(dispose);
    // MSAA no alvo principal: é ele que resolve o serrilhado. Renderizar pra
    // um alvo sem `samples` jogaria fora o antialiasing do canvas.
    this._cena = alvo(w, h, { depthBuffer: true, samples: 4 });
    this._brilho = alvo(w / 2, h / 2);
    this._pingA = alvo(w / 2, h / 2);
    this._pongA = alvo(w / 2, h / 2);
    this._pingB = alvo(w / 4, h / 4);
    this._pongB = alvo(w / 4, h / 4);
    this._w = w; this._h = h;
  }

  _passe(material, destino) {
    this._quad.material = material;
    this.renderer.setRenderTarget(destino);
    this.renderer.clear();
    this.renderer.render(this._quadCena, this._quadCam);
  }

  _borrar(origem, ping, pong, escala) {
    this._matBorrao.uniforms.tDiffuse.value = origem.texture;
    this._matBorrao.uniforms.direcao.value.set(1 / (this._w * escala), 0);
    this._passe(this._matBorrao, ping);
    this._matBorrao.uniforms.tDiffuse.value = ping.texture;
    this._matBorrao.uniforms.direcao.value.set(0, 1 / (this._h * escala));
    this._passe(this._matBorrao, pong);
    return pong;
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    // A cena precisa chegar aos alvos em HDR linear: o mapeamento tonal é
    // aplicado só na composição.
    const tonemapAnterior = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this._cena);
    r.clear();
    r.render(scene, camera);
    r.toneMapping = tonemapAnterior;

    this._matBrilho.uniforms.tDiffuse.value = this._cena.texture;
    this._passe(this._matBrilho, this._brilho);

    const nivelA = this._borrar(this._brilho, this._pingA, this._pongA, 0.5);
    const nivelB = this._borrar(nivelA, this._pingB, this._pongB, 0.25);

    this._matComposicao.uniforms.tBase.value = this._cena.texture;
    this._matComposicao.uniforms.tBloomA.value = nivelA.texture;
    this._matComposicao.uniforms.tBloomB.value = nivelB.texture;
    this._matComposicao.uniforms.intensidade.value = this.intensidade;
    this._matComposicao.uniforms.exposicao.value = this.exposicao;
    this._passe(this._matComposicao, null);
  }

  dispose() {
    for (const a of [this._cena, this._brilho, this._pingA, this._pongA, this._pingB, this._pongB]) a?.dispose();
    this._matBrilho.dispose();
    this._matBorrao.dispose();
    this._matComposicao.dispose();
    this._quadGeo.dispose();
  }
}

/**
 * O renderizador é software (SwiftShader/llvmpipe/Mesa)?
 *
 * Passes de tela cheia em rasterizador de software custam caro e não trazem
 * nada — quem cai nesse caminho já está lutando pra manter quadro. É a mesma
 * escala de qualidade que qualquer motor faz; a consequência honesta é que a
 * cadeia de pós NÃO é exercitada pelos testes automatizados, que rodam
 * justamente em software.
 */
export function rendererEhSoftware(renderer) {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (!info) return false;
    const nome = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '');
    return /swiftshader|llvmpipe|software|mesa offscreen/i.test(nome);
  } catch {
    return false;
  }
}
