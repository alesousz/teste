# Peças comuns aos scripts de modelagem: primitivas nos EIXOS DO JOGO,
# materiais PBR com texturas procedurais, conferência de medidas, exportação
# .glb e imagens de conferência.
#
# Eixos: tudo aqui recebe coordenadas como no three.js — x largura, y pra
# cima, z profundidade — e converte pro Blender (z pra cima) por dentro:
#   jogo (x, y, z)  →  Blender (x, -z, y)
# O exportador glTF desfaz essa conversão, então o que se escreve aqui é
# exatamente o que o jogo recebe. Isso deixa cada peça transcrita direto da
# montagem em caixas de src/apartmentProps.js, sem inverter lados de cabeça.
#
# Tudo é feito com bmesh e dados diretos, sem bpy.ops de edição: operadores
# dependem de contexto de janela e se comportam diferente em --background.

import json
import math
import os
import shutil
import subprocess
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Quanto a geometria pode passar do envelope (arredondamento numérico).
ENVELOPE_FOLGA = 1e-4

# Arestas com ângulo maior que isso ficam vivas; as demais, suavizadas.
ANGULO_ARESTA_VIVA = math.radians(50)


def argumentos():
    """Lê `-- --chave valor` do fim da linha de comando do Blender."""
    extras = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    i = 0
    while i < len(extras):
        if extras[i].startswith('--'):
            chave = extras[i][2:]
            tem_valor = i + 1 < len(extras) and not extras[i + 1].startswith('--')
            out[chave] = extras[i + 1] if tem_valor else True
            i += 2 if tem_valor else 1
        else:
            i += 1
    return out


def limpar_cena():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATERIAIS.clear()


# ---------------------------------------------------------------------------
# Medidas do jogo
# ---------------------------------------------------------------------------

def _node():
    achado = shutil.which('node')
    if achado:
        return achado
    portatil = os.path.join(os.environ.get('USERPROFILE', ''), 'node', 'node-v24.19.0-win-x64', 'node.exe')
    if os.path.exists(portatil):
        return portatil
    sys.exit('Node.js não encontrado: ele é usado pra ler as medidas dos móveis direto do jogo.')


def caixas_do_jogo():
    """AABBs de src/apartmentProps.js e folgas de altura de src/propModels.js.

    As medidas moram no JS; copiá-las pra cá criaria duas fontes de verdade.
    """
    def url(rel):
        return 'file:///' + os.path.join(RAIZ, rel).replace('\\', '/')

    codigo = (
        f"const a = await import('{url('src/apartmentProps.js')}');"
        f"const p = await import('{url('src/propModels.js')}');"
        "console.log(JSON.stringify({ caixas: a.apartmentBoxes(), extra: p.ALTURA_EXTRA }));"
    )
    saida = subprocess.run(
        [_node(), '--input-type=module', '-e', codigo],
        capture_output=True, text=True, encoding='utf-8', check=True,
    )
    dados = json.loads(saida.stdout)
    return {c['tag']: c for c in dados['caixas']}, dados['extra']


# ---------------------------------------------------------------------------
# Texturas procedurais (todas repetíveis nas bordas)
# ---------------------------------------------------------------------------

def _hex_srgb(hexa):
    return np.array([(hexa >> 16) & 255, (hexa >> 8) & 255, hexa & 255], dtype=np.float32) / 255


def _imagem(nome, rgb, cor=True):
    tamanho = rgb.shape[0]
    rgba = np.ones((tamanho, tamanho, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    img = bpy.data.images.new(nome, tamanho, tamanho, alpha=False)
    img.colorspace_settings.name = 'sRGB' if cor else 'Non-Color'
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def textura_trama(nome, tamanho=256, periodo=8):
    """Mapa de normais de uma trama de tecido (fios alternados em x e y)."""
    n = np.arange(tamanho)
    fase = (n % (2 * periodo)) / (2 * periodo) * 2 * math.pi
    fio = 0.5 + 0.5 * np.sin(fase * 2)
    celula = (n // periodo) % 2
    xx, yy = np.meshgrid(n, n)
    cruza = (celula[xx] ^ celula[yy]).astype(np.float32)
    altura = cruza * fio[xx] + (1 - cruza) * fio[yy]
    altura = altura + np.random.default_rng(7).normal(0, 0.08, altura.shape)

    dx = (np.roll(altura, -1, axis=1) - np.roll(altura, 1, axis=1)) * 0.5
    dy = (np.roll(altura, -1, axis=0) - np.roll(altura, 1, axis=0)) * 0.5
    normal = np.dstack([-dx, -dy, np.ones_like(altura)])
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return _imagem(nome, normal * 0.5 + 0.5, cor=False)


def textura_madeira(nome, cor, tamanho=256, semente=1):
    """Veios longos ao longo de u, ondulados, com poros finos."""
    rng = np.random.default_rng(semente)
    u = np.arange(tamanho) / tamanho
    uu, vv = np.meshgrid(u, u)
    onda = 0.035 * np.sin(2 * math.pi * (2 * uu + rng.random())) + 0.02 * np.sin(2 * math.pi * (5 * uu + rng.random()))
    # Veio largo quase apagado e fios finos: com contraste alto a madeira
    # vira faixas regulares e lê como tijolo.
    veio = np.sin(2 * math.pi * (6 * vv + onda))
    veio_fino = np.sin(2 * math.pi * (41 * vv + 3 * onda))
    tom = 0.94 + 0.03 * veio + 0.025 * veio_fino + rng.normal(0, 0.012, uu.shape)
    return _imagem(nome, _hex_srgb(cor)[None, None, :] * tom[..., None])


def textura_granulada(nome, cor, tamanho=256, semente=3, contraste=0.12, pintas=0.02):
    """Granito, cortiça: ruído fino com pintas escuras e claras."""
    rng = np.random.default_rng(semente)
    tom = 1 + rng.normal(0, contraste * 0.4, (tamanho, tamanho))
    marca = rng.random((tamanho, tamanho))
    tom[marca < pintas] *= 0.55
    tom[marca > 1 - pintas] *= 1.3
    return _imagem(nome, _hex_srgb(cor)[None, None, :] * tom[..., None])


# ---------------------------------------------------------------------------
# Materiais
# ---------------------------------------------------------------------------

def _srgb_para_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def cor_linear(hexa):
    """0xRRGGBB (sRGB, como no three.js) → RGBA linear, como o Blender guarda."""
    r, g, b = _hex_srgb(hexa)
    return (_srgb_para_linear(r), _srgb_para_linear(g), _srgb_para_linear(b), 1.0)


def material_pbr(nome, cor, rugosidade, metalico=0.0, normal=None, forca_normal=1.0,
                 textura_cor=None, emissao=None, forca_emissao=0.0, opacidade=1.0):
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    # O exportador marca doubleSided quando não há culling. Só o vidro
    # precisa das duas faces; nas peças fechadas isso só dobra o custo e suja
    # a sombra.
    mat.use_backface_culling = opacidade >= 1.0
    nos = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nos.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = cor_linear(cor)
    bsdf.inputs['Roughness'].default_value = rugosidade
    bsdf.inputs['Metallic'].default_value = metalico
    if textura_cor is not None:
        tex = nos.new('ShaderNodeTexImage')
        tex.image = textura_cor
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal is not None:
        tex = nos.new('ShaderNodeTexImage')
        tex.image = normal
        mapa = nos.new('ShaderNodeNormalMap')
        mapa.inputs['Strength'].default_value = forca_normal
        links.new(tex.outputs['Color'], mapa.inputs['Color'])
        links.new(mapa.outputs['Normal'], bsdf.inputs['Normal'])
    if emissao is not None:
        bsdf.inputs['Emission Color'].default_value = cor_linear(emissao)
        bsdf.inputs['Emission Strength'].default_value = forca_emissao
    if opacidade < 1.0:
        bsdf.inputs['Alpha'].default_value = opacidade
        for attr, valor in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            if hasattr(mat, attr):
                try:
                    setattr(mat, attr, valor)
                except TypeError:
                    pass
    return mat


_MATERIAIS = {}


def materiais():
    """A paleta de src/apartmentProps.js, agora com textura onde faz diferença.

    Criada uma vez por cena: peças que usam o mesmo nome dividem o material,
    e o .glb sai com um material por nome em vez de um por peça.
    """
    if _MATERIAIS:
        return _MATERIAIS
    trama = textura_trama('trama_tecido')
    M = _MATERIAIS
    M['madeira'] = material_pbr('madeira', 0x8a6242, 0.62, textura_cor=textura_madeira('veio_madeira', 0x8a6242, semente=1))
    M['madeiraEsc'] = material_pbr('madeiraEsc', 0x5b4232, 0.58, textura_cor=textura_madeira('veio_madeira_escura', 0x5b4232, semente=2))
    M['tecido'] = material_pbr('tecido', 0x5f6f80, 0.92, normal=trama, forca_normal=0.18)
    M['tecidoClaro'] = material_pbr('tecidoClaro', 0xe6e1d6, 0.9, normal=trama, forca_normal=0.18)
    M['tecidoQuente'] = material_pbr('tecidoQuente', 0x9c5f4e, 0.95, normal=trama, forca_normal=0.18)
    M['metal'] = material_pbr('metal', 0xb8bec6, 0.3, metalico=0.9)
    M['metalEsc'] = material_pbr('metalEsc', 0x3a3f45, 0.45, metalico=0.6)
    M['ceramica'] = material_pbr('ceramica', 0xf3f2ee, 0.12)
    M['ceramicaSombra'] = material_pbr('ceramicaSombra', 0xc9c8c2, 0.2)
    M['pedra'] = material_pbr('pedra', 0x6f7276, 0.35, metalico=0.05,
                              textura_cor=textura_granulada('granito', 0x6f7276, contraste=0.25, pintas=0.04))
    M['vidro'] = material_pbr('vidro', 0xcfe3e8, 0.05, opacidade=0.25)
    M['espelho'] = material_pbr('espelho', 0xdfe7ea, 0.03, metalico=1.0)
    M['tela'] = material_pbr('tela', 0x15181d, 0.2, metalico=0.1)
    M['luz'] = material_pbr('luz', 0xffe7bd, 0.6, emissao=0xffd9a0, forca_emissao=0.55)
    M['led'] = material_pbr('led', 0x2f8a3a, 0.4, emissao=0x39d353, forca_emissao=0.8)
    M['vermelho'] = material_pbr('vermelho', 0xb0342a, 0.35, metalico=0.3)
    M['papel'] = material_pbr('papel', 0xd9cfc0, 0.9)
    M['plastico'] = material_pbr('plastico', 0xcfc6b4, 0.55)
    M['cortica'] = material_pbr('cortica', 0xa97c52, 0.95, textura_cor=textura_granulada('cortica', 0xa97c52, contraste=0.3, pintas=0.08))
    M['fotoA'] = material_pbr('fotoA', 0x7fa6c4, 0.4)
    M['fotoB'] = material_pbr('fotoB', 0xc48e6a, 0.4)
    M['fotoC'] = material_pbr('fotoC', 0x8fae7e, 0.4)
    return M


# Quantos metros um ciclo de textura cobre, por material (o resto não tem textura).
ESCALA_UV = {'tecido': 0.08, 'tecidoClaro': 0.08, 'tecidoQuente': 0.08,
             'madeira': 0.9, 'madeiraEsc': 0.9, 'pedra': 0.35, 'cortica': 0.15}


# ---------------------------------------------------------------------------
# Primitivas (coordenadas do jogo)
# ---------------------------------------------------------------------------

def _para_blender(x, y, z):
    return Vector((x, -z, y))


def _objeto(nome, bm, material):
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > ANGULO_ARESTA_VIVA:
            e.smooth = False
    malha = bpy.data.meshes.new(nome)
    bm.to_mesh(malha)
    bm.free()
    malha.materials.append(material)
    obj = bpy.data.objects.new(nome, malha)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def caixa(nome, material, x0, x1, y0, y1, z0, z1, raio=0.0, segmentos=2):
    """Caixa entre dois cantos; `raio` arredonda as arestas pra dentro."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    escala = Matrix.Diagonal(Vector((x1 - x0, z1 - z0, y1 - y0, 1.0)))
    centro = Matrix.Translation(_para_blender((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    bm.transform(centro @ escala)
    raio = min(raio, 0.49 * min(x1 - x0, y1 - y0, z1 - z0))
    if raio > 1e-5:
        bmesh.ops.bevel(
            bm, geom=list(bm.verts) + list(bm.edges), offset=raio, offset_type='OFFSET',
            segments=segmentos, profile=0.5, affect='EDGES', clamp_overlap=True,
        )
    return _objeto(nome, bm, material)


def cilindro(nome, material, x, z, y0, y1, raio, raio_topo=None, lados=24, escala_z=1.0):
    """Cilindro em pé (eixo y do jogo); `escala_z` achata em elipse."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=lados,
        radius1=raio, radius2=raio if raio_topo is None else raio_topo, depth=y1 - y0,
    )
    bm.transform(Matrix.Translation(_para_blender(x, (y0 + y1) / 2, z)) @ Matrix.Diagonal(Vector((1, escala_z, 1, 1))))
    return _objeto(nome, bm, material)


def girar(objs, eixo, graus, pivo):
    """Gira as malhas em torno de um eixo do jogo ('x', 'y' ou 'z') passando por `pivo`."""
    c, s = math.cos(math.radians(graus)), math.sin(math.radians(graus))
    px, py, pz = pivo
    for obj in objs if isinstance(objs, (list, tuple)) else [objs]:
        for v in obj.data.vertices:
            x, y, z = v.co.x - px, v.co.z - py, -v.co.y - pz
            if eixo == 'x':
                y, z = y * c - z * s, y * s + z * c
            elif eixo == 'y':
                x, z = x * c + z * s, -x * s + z * c
            else:
                x, y = x * c - y * s, x * s + y * c
            v.co = _para_blender(x + px, y + py, z + pz)


def unir(partes, nome):
    """Junta as peças numa malha só, uma chamada de desenho por material."""
    materiais_unidos = []
    bm = bmesh.new()
    for obj in partes:
        obj.data.transform(obj.matrix_basis)
        antes = len(bm.faces)
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        indice = {}
        for i, m in enumerate(obj.data.materials):
            if m not in materiais_unidos:
                materiais_unidos.append(m)
            indice[i] = materiais_unidos.index(m)
        for f in bm.faces[antes:]:
            f.material_index = indice.get(f.material_index, 0)
    for obj in partes:
        malha = obj.data
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(malha)

    malha = bpy.data.meshes.new(nome)
    bm.to_mesh(malha)
    bm.free()
    for m in materiais_unidos:
        malha.materials.append(m)
    obj = bpy.data.objects.new(nome, malha)
    bpy.context.scene.collection.objects.link(obj)
    projetar_uv(obj)
    return obj


def projetar_uv(obj):
    """Projeção em caixa: cada face usa o plano do eixo dominante da normal,
    na escala do material dela."""
    nomes = [m.name for m in obj.data.materials]
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        escala = ESCALA_UV.get(nomes[f.material_index] if nomes else '', 1.0)
        n = f.normal
        eixo = max(range(3), key=lambda k: abs(n[k]))
        for laco in f.loops:
            co = laco.vert.co
            if eixo == 0:
                laco[uv].uv = (co.y / escala, co.z / escala)
            elif eixo == 1:
                laco[uv].uv = (co.x / escala, co.z / escala)
            else:
                laco[uv].uv = (co.x / escala, co.y / escala)
    bm.to_mesh(obj.data)
    bm.free()


# ---------------------------------------------------------------------------
# Conferência, exportação e imagens
# ---------------------------------------------------------------------------

def conferir_envelope(obj, caixa_jogo, extra=0.0):
    """Lista o que sair do AABB de colisão (origem no centro da base).

    x e z são estritos; em y a peça começa no piso e pode subir `extra`
    acima da caixa (cabeceira, torneira — sempre encostadas na parede).
    """
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    jogo = np.column_stack([co[:, 0], co[:, 2], -co[:, 1]])
    mn, mx = jogo.min(axis=0), jogo.max(axis=0)

    meia_x = (caixa_jogo['maxX'] - caixa_jogo['minX']) / 2
    meia_z = (caixa_jogo['maxZ'] - caixa_jogo['minZ']) / 2
    altura = caixa_jogo['maxY'] - caixa_jogo['minY']
    limites = ((-meia_x, meia_x), (0.0, altura + extra), (-meia_z, meia_z))

    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f'  {obj.name:<20} medidas {(mx - mn).round(3).tolist()} de {[round(2 * meia_x, 3), round(altura, 3), round(2 * meia_z, 3)]}'
          f'  triângulos {tris}')
    erros = []
    for k, (lo, hi) in enumerate(limites):
        if mn[k] < lo - ENVELOPE_FOLGA or mx[k] > hi + ENVELOPE_FOLGA:
            erros.append(f'{obj.name} eixo {"xyz"[k]}: [{mn[k]:.4f}, {mx[k]:.4f}] fora de [{lo:.4f}, {hi:.4f}]')
    if abs(mn[1]) > 0.01:
        erros.append(f'{obj.name}: base em y={mn[1]:.4f}, deveria encostar em 0')
    return erros, tris


def exportar_glb(caminho):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=caminho,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )
    print(f'EXPORTADO {caminho} ({os.path.getsize(caminho)} bytes)')


def renderizar_comodos(objetos, caixas, pasta, amostras=24, so=None):
    """Uma imagem por ambiente, com cada peça no lugar real da planta.

    Serve pra conferir orientação (o sofá virado pra TV, as portas do
    armário pro lado livre) e acabamento, sem abrir o jogo. `so` limita a
    uma lista de ambientes.
    """
    os.makedirs(pasta, exist_ok=True)
    cena = bpy.context.scene
    for tag, obj in objetos.items():
        c = caixas[tag]
        obj.location = _para_blender((c['minX'] + c['maxX']) / 2, c['minY'], (c['minZ'] + c['maxZ']) / 2)

    sol = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sol.data.energy = 3.0
    sol.rotation_euler = (math.radians(40), math.radians(10), math.radians(35))
    cena.collection.objects.link(sol)

    mundo = bpy.data.worlds.new('mundo')
    mundo.use_nodes = True
    mundo.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.44, 0.47, 1)
    mundo.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    cena.world = mundo

    cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    cam.data.lens = 28
    cena.collection.objects.link(cam)
    cena.camera = cam
    alvo = bpy.data.objects.new('alvo', None)
    cena.collection.objects.link(alvo)
    restr = cam.constraints.new('TRACK_TO')
    restr.target = alvo
    restr.track_axis = 'TRACK_NEGATIVE_Z'
    restr.up_axis = 'UP_Y'

    cena.render.engine = 'CYCLES'
    cena.cycles.device = 'CPU'
    cena.cycles.samples = amostras
    cena.render.resolution_x = 760
    cena.render.resolution_y = 480

    piso_mat = material_pbr('piso_previa', 0xb9b2a6, 0.8)
    for comodo in sorted({caixas[t]['room'] for t in objetos}):
        if so and comodo not in so:
            continue
        tags = [t for t in objetos if caixas[t]['room'] == comodo]
        for t, o in objetos.items():
            o.hide_render = t not in tags
        x0 = min(caixas[t]['minX'] for t in tags)
        x1 = max(caixas[t]['maxX'] for t in tags)
        z0 = min(caixas[t]['minZ'] for t in tags)
        z1 = max(caixas[t]['maxZ'] for t in tags)
        piso_y = min(caixas[t]['minY'] for t in tags)
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        extensao = max(x1 - x0, z1 - z0, 1.2)

        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
        bm.transform(Matrix.Translation(_para_blender(cx, piso_y - 0.001, cz))
                     @ Matrix.Diagonal(Vector((x1 - x0 + 3, z1 - z0 + 3, 1, 1))))
        piso = _objeto('piso', bm, piso_mat)

        alvo.location = _para_blender(cx, piso_y + 0.5, cz)
        for k, (ox, oz) in enumerate(((0.75, 1.0), (-0.75, -1.0))):
            d = extensao * 1.25 + 1.0
            cam.location = _para_blender(cx + ox * d, piso_y + 0.85 * d, cz + oz * d)
            cena.render.filepath = os.path.join(pasta, f'{comodo}_{k + 1}.png')
            bpy.ops.render.render(write_still=True)
            print(f'PRÉVIA {cena.render.filepath}')

        bpy.data.objects.remove(piso)
