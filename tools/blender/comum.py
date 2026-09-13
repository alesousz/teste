# Peças comuns aos scripts de móveis: primitivas arredondadas, materiais PBR,
# conferência de medidas, exportação .glb e imagem de conferência.
#
# Tudo é feito com bmesh e dados diretos, sem bpy.ops de edição: operadores
# dependem de contexto de janela e se comportam diferente em --background.

import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

# Quanto a geometria pode passar do envelope (arredondamento numérico).
ENVELOPE_FOLGA = 1e-4


def argumentos():
    """Lê `-- --chave valor` do fim da linha de comando do Blender."""
    extras = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {}
    i = 0
    while i < len(extras):
        if extras[i].startswith('--'):
            chave = extras[i][2:]
            valor = extras[i + 1] if i + 1 < len(extras) and not extras[i + 1].startswith('--') else True
            out[chave] = valor
            i += 2 if valor is not True else 1
        else:
            i += 1
    return out


def limpar_cena():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _srgb_para_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def cor_linear(hexa):
    """0xRRGGBB (sRGB, como no three.js) → RGBA linear, como o Blender guarda."""
    r, g, b = (hexa >> 16) & 255, (hexa >> 8) & 255, hexa & 255
    return (_srgb_para_linear(r / 255), _srgb_para_linear(g / 255), _srgb_para_linear(b / 255), 1.0)


def textura_trama(nome, tamanho=256, periodo=8):
    """Mapa de normais de uma trama de tecido, repetível nas bordas.

    Fios alternados em x e y formam um relevo de altura; as normais saem do
    gradiente desse relevo. `tamanho` precisa ser múltiplo de 2*periodo pra
    emendar sem costura.
    """
    n = np.arange(tamanho)
    fase = (n % (2 * periodo)) / (2 * periodo) * 2 * math.pi
    fio = 0.5 + 0.5 * np.sin(fase * 2)                      # perfil do fio
    celula_x = (n // periodo) % 2
    celula_y = (n // periodo) % 2
    xx, yy = np.meshgrid(n, n)
    cruza = (celula_x[xx] ^ celula_y[yy]).astype(np.float32)  # tabuleiro: qual fio passa por cima
    altura = cruza * fio[xx] + (1 - cruza) * fio[yy]
    rng = np.random.default_rng(7)
    altura = altura + rng.normal(0, 0.08, altura.shape)       # irregularidade do fio

    dx = (np.roll(altura, -1, axis=1) - np.roll(altura, 1, axis=1)) * 0.5
    dy = (np.roll(altura, -1, axis=0) - np.roll(altura, 1, axis=0)) * 0.5
    normal = np.dstack([-dx, -dy, np.ones_like(altura)])
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)

    rgba = np.ones((tamanho, tamanho, 4), dtype=np.float32)
    rgba[..., :3] = normal * 0.5 + 0.5

    img = bpy.data.images.new(nome, tamanho, tamanho, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def material_pbr(nome, cor, rugosidade, metalico=0.0, normal=None, forca_normal=1.0):
    mat = bpy.data.materials.new(nome)
    mat.use_nodes = True
    nos = mat.node_tree.nodes
    bsdf = nos.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = cor_linear(cor)
    bsdf.inputs['Roughness'].default_value = rugosidade
    bsdf.inputs['Metallic'].default_value = metalico
    if normal is not None:
        tex = nos.new('ShaderNodeTexImage')
        tex.image = normal
        mapa = nos.new('ShaderNodeNormalMap')
        mapa.inputs['Strength'].default_value = forca_normal
        links = mat.node_tree.links
        links.new(tex.outputs['Color'], mapa.inputs['Color'])
        links.new(mapa.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def _objeto(nome, bm, material):
    malha = bpy.data.meshes.new(nome)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(malha)
    bm.free()
    malha.materials.append(material)
    obj = bpy.data.objects.new(nome, malha)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def caixa_arredondada(nome, material, x0, x1, y0, y1, z0, z1, raio, segmentos=3):
    """Caixa entre dois cantos com todas as arestas arredondadas.

    O arredondamento corta pra dentro, então a peça nunca sai dos cantos dados.
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    escala = Matrix.Diagonal(Vector((x1 - x0, y1 - y0, z1 - z0, 1.0)))
    centro = Matrix.Translation(Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)))
    bm.transform(centro @ escala)
    raio = min(raio, 0.49 * min(x1 - x0, y1 - y0, z1 - z0))
    bmesh.ops.bevel(
        bm, geom=list(bm.verts) + list(bm.edges), offset=raio, offset_type='OFFSET',
        segments=segmentos, profile=0.5, affect='EDGES', clamp_overlap=True,
    )
    return _objeto(nome, bm, material)


def cilindro_afunilado(nome, material, x, y, z0, z1, raio_base, raio_topo, lados=12):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=lados,
        radius1=raio_base, radius2=raio_topo, depth=z1 - z0,
    )
    bm.transform(Matrix.Translation(Vector((x, y, (z0 + z1) / 2))))
    return _objeto(nome, bm, material)


def unir(partes, nome):
    """Junta as peças numa malha só, uma chamada de desenho por material."""
    materiais = []
    bm = bmesh.new()
    for obj in partes:
        obj.data.transform(obj.matrix_basis)
        antes = len(bm.faces)
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        indice = {}
        for i, m in enumerate(obj.data.materials):
            if m not in materiais:
                materiais.append(m)
            indice[i] = materiais.index(m)
        for f in bm.faces[antes:]:
            f.material_index = indice.get(f.material_index, 0)
    for obj in partes:
        malha = obj.data
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(malha)

    malha = bpy.data.meshes.new(nome)
    bm.to_mesh(malha)
    bm.free()
    for m in materiais:
        malha.materials.append(m)
    obj = bpy.data.objects.new(nome, malha)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def projetar_uv(obj, escala):
    """Projeção em caixa: cada face usa o plano do eixo dominante da normal.

    `escala` é quantos metros um ciclo da textura cobre.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
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


def conferir_envelope(obj, faixa_x, faixa_y, faixa_z):
    """Falha (código de saída 1) se algum vértice sair da caixa de colisão."""
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    mn, mx = co.min(axis=0), co.max(axis=0)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f'[{obj.name}] min {mn.round(4).tolist()} max {mx.round(4).tolist()} '
          f'medidas {(mx - mn).round(4).tolist()} triângulos {tris}')
    erros = []
    for k, (lo, hi) in enumerate((faixa_x, faixa_y, faixa_z)):
        if mn[k] < lo - ENVELOPE_FOLGA or mx[k] > hi + ENVELOPE_FOLGA:
            erros.append(f'eixo {"xyz"[k]}: [{mn[k]:.4f}, {mx[k]:.4f}] fora de [{lo}, {hi}]')
    if erros:
        print('ENVELOPE VIOLADO: ' + '; '.join(erros))
        sys.exit(1)
    print('ENVELOPE OK')


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


def renderizar_previa(caminho, alvo, distancia):
    """Imagem de conferência: piso, duas luzes e câmera de 3/4 pela frente."""
    cena = bpy.context.scene

    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4.0)
    piso = _objeto('piso', bm, material_pbr('piso', 0xb9b2a6, 0.8))
    piso.data.polygons.foreach_set('use_smooth', [False])

    ponto = bpy.data.objects.new('alvo', None)
    ponto.location = alvo
    cena.collection.objects.link(ponto)

    cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    ang = math.radians(-35)
    cam.location = (distancia * math.sin(-ang), -distancia * math.cos(ang), alvo[2] + distancia * 0.45)
    restr = cam.constraints.new('TRACK_TO')
    restr.target = ponto
    restr.track_axis = 'TRACK_NEGATIVE_Z'
    restr.up_axis = 'UP_Y'
    cena.collection.objects.link(cam)
    cena.camera = cam

    sol = bpy.data.objects.new('sol', bpy.data.lights.new('sol', 'SUN'))
    sol.data.energy = 3.0
    sol.rotation_euler = (math.radians(50), 0, math.radians(30))
    cena.collection.objects.link(sol)

    area = bpy.data.objects.new('preenchimento', bpy.data.lights.new('preenchimento', 'AREA'))
    area.data.energy = 150
    area.data.size = 2.0
    area.location = (-1.8, -1.6, 1.8)
    area.constraints.new('TRACK_TO').target = ponto
    cena.collection.objects.link(area)

    mundo = bpy.data.worlds.new('mundo')
    mundo.use_nodes = True
    mundo.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.37, 0.40, 1)
    mundo.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    cena.world = mundo

    cena.render.engine = 'CYCLES'
    cena.cycles.device = 'CPU'
    cena.cycles.samples = 48
    cena.render.resolution_x = 900
    cena.render.resolution_y = 600
    cena.render.filepath = os.path.abspath(caminho)
    bpy.ops.render.render(write_still=True)
    print(f'PRÉVIA {caminho}')
