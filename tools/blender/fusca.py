import os, sys, math
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import RAIZ, caixa, cilindro, exportar_glb, girar, limpar_cena, materiais, unir, material_pbr

def curvas_de_animacao(obj):
    """F-curves da ação do objeto, na API antiga (action.fcurves) ou na de
    camadas do Blender 4.4+ (layers → strips → channelbags)."""
    acao = obj.animation_data.action if obj.animation_data else None
    if acao is None:
        return []
    if hasattr(acao, 'fcurves') and len(acao.fcurves) > 0:
        return list(acao.fcurves)
    curvas = []
    for camada in getattr(acao, 'layers', []):
        for faixa in camada.strips:
            for bolsa in getattr(faixa, 'channelbags', []):
                curvas.extend(bolsa.fcurves)
    if not curvas:
        print(f'AVISO: {obj.name} sem f-curves encontradas; interpolação não ajustada')
    return curvas


def main():
    limpar_cena()
    M = materiais()

    try:
        M['vermelho_fusca'] = material_pbr('vermelho_fusca', 0x9e1a1a, 0.3, metalico=0.5)
        M['cromo'] = material_pbr('cromo', 0xdddddd, 0.1, metalico=0.9)
        M['borracha'] = material_pbr('borracha', 0x111111, 0.9)
        M['farol'] = material_pbr('farol', 0xffffff, 0.3, emissao=0xffffe0, forca_emissao=1.5)
        M['lanterna'] = material_pbr('lanterna', 0xff0000, 0.3, emissao=0xff0000, forca_emissao=1.0)
    except:
        pass
        
    corpo_mat = M.get('vermelho_fusca', M['metalEsc'])
    cromo_mat = M.get('cromo', M['metal'])
    pneu_mat = M.get('borracha', M['metalEsc'])
    vidro_mat = M['vidro']
    farol_mat = M.get('farol', M['luz'])
    lanterna_mat = M.get('lanterna', M['vermelho'])

    # Corpo
    p_chassis = [
        # Base/Assoalho
        caixa('base', corpo_mat, -0.6, 0.6, 0.25, 0.35, -1.8, 1.8, raio=0.04),
        
        # Capô (frente inclinada e arredondada)
        caixa('capo', corpo_mat, -0.5, 0.5, 0.35, 0.7, -1.9, -0.7, raio=0.17),
        
        # Traseira (tampa do motor)
        caixa('traseira', corpo_mat, -0.5, 0.5, 0.35, 0.8, 0.7, 1.9, raio=0.18),
        
        # Cabine (teto de vidro arredondado)
        caixa('cabine_vidro', vidro_mat, -0.55, 0.55, 0.7, 1.45, -0.9, 1.0, raio=0.2),
        
        # Teto metálico
        caixa('teto', corpo_mat, -0.55, 0.55, 1.4, 1.5, -0.8, 0.9, raio=0.04),

        # Paralamas dianteiros (curvos)
        caixa('paralama_fl', corpo_mat, -0.85, -0.5, 0.25, 0.75, -1.7, -0.7, raio=0.17),
        caixa('paralama_fr', corpo_mat,  0.5,  0.85, 0.25, 0.75, -1.7, -0.7, raio=0.17),
        
        # Paralamas traseiros (curvos)
        caixa('paralama_bl', corpo_mat, -0.85, -0.5, 0.25, 0.75,  0.7,  1.7, raio=0.17),
        caixa('paralama_br', corpo_mat,  0.5,  0.85, 0.25, 0.75,  0.7,  1.7, raio=0.17),

        # Para-choques
        caixa('parachoque_f', cromo_mat, -0.8, 0.8, 0.35, 0.45, -2.0, -1.9, raio=0.04),
        caixa('parachoque_b', cromo_mat, -0.8, 0.8, 0.35, 0.45,  1.9,  2.0, raio=0.04),
        
        # Faróis
        caixa('farol_l', farol_mat, -0.75, -0.55, 0.6, 0.8, -1.8, -1.6, raio=0.09),
        caixa('farol_r', farol_mat,  0.55,  0.75, 0.6, 0.8, -1.8, -1.6, raio=0.09),
        
        # Lanternas traseiras
        caixa('lanterna_l', lanterna_mat, -0.7, -0.55, 0.55, 0.7, 1.6, 1.75, raio=0.06),
        caixa('lanterna_r', lanterna_mat,  0.55,  0.7, 0.55, 0.7, 1.6, 1.75, raio=0.06),
    ]
    chassis = unir(p_chassis, 'Veiculo_Fusca')
    chassis["footprint"] = "2x4"
    
    rodas = []
    def criar_roda(nome, rx, ry, rz):
        pneu = cilindro(nome+'_pneu', pneu_mat, 0, 0, -0.15, 0.15, 0.3, lados=16)
        calota = cilindro(nome+'_calota', cromo_mat, 0, 0, -0.16, 0.16, 0.15, lados=12)
        girar([pneu, calota], 'z', 90, (0, 0, 0))
        roda = unir([pneu, calota], nome)

        # A malha fica centrada na origem e o OBJETO vai pro lugar da roda:
        # a animação gira em torno da origem do objeto, então ela precisa ser
        # o centro do eixo. Deslocar a malha (e deixar a origem no centro do
        # carro) fazia a roda orbitar o carro em vez de girar.
        roda.location = Vector((rx, -rz, ry))  # jogo (x, y, z) → Blender (x, -z, y)
        roda.parent = chassis
        rodas.append(roda)

    criar_roda('Roda_FL', -0.7, 0.3, -1.2)
    criar_roda('Roda_FR',  0.7, 0.3, -1.2)
    criar_roda('Roda_BL', -0.7, 0.3,  1.2)
    criar_roda('Roda_BR',  0.7, 0.3,  1.2)

    door_l = caixa('Porta_L', corpo_mat, -0.65, -0.5, 0.35, 0.8, -0.7, 0.7, raio=0.04)
    door_r = caixa('Porta_R', corpo_mat, 0.5, 0.65, 0.35, 0.8, -0.7, 0.7, raio=0.04)
    
    def config_porta(porta, px, py, pz):
        pivo = Vector((px, py, pz))
        bpy.context.view_layer.objects.active = porta
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.transform.translate(value=-pivo)
        bpy.ops.object.mode_set(mode='OBJECT')
        porta.location += pivo
        porta.parent = chassis

    # Pivo das portas: X = lado, Y = altura, Z = frente (dobradiça)
    # Z game = -0.7 -> Z blender = 0.7 (porque Vector(x, -z, y))
    # Y game = 0.5 -> Z blender = 0.5
    # X game = -0.6 -> X blender = -0.6
    config_porta(door_l, -0.6, 0.7, 0.5)
    config_porta(door_r, 0.6, 0.7, 0.5)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 60
    
    door_l.rotation_euler = (0, 0, 0)
    door_l.keyframe_insert(data_path="rotation_euler", frame=1)
    door_l.rotation_euler = (0, 0, math.radians(-50))
    door_l.keyframe_insert(data_path="rotation_euler", frame=30)
    door_l.rotation_euler = (0, 0, 0)
    door_l.keyframe_insert(data_path="rotation_euler", frame=60)
    
    door_r.rotation_euler = (0, 0, 0)
    door_r.keyframe_insert(data_path="rotation_euler", frame=1)
    door_r.rotation_euler = (0, 0, math.radians(50))
    door_r.keyframe_insert(data_path="rotation_euler", frame=30)
    door_r.rotation_euler = (0, 0, 0)
    door_r.keyframe_insert(data_path="rotation_euler", frame=60)
    
    for w in rodas:
        w.rotation_mode = 'XYZ'
        w.rotation_euler = (0, 0, 0)
        w.keyframe_insert(data_path="rotation_euler", frame=1)
        w.rotation_euler = (math.radians(-360), 0, 0)
        w.keyframe_insert(data_path="rotation_euler", frame=60)

    # Giro da roda em velocidade constante: com a interpolação padrão (Bézier)
    # ela acelera e freia a cada volta e o laço da animação "engasga".
    for w in rodas:
        for fc in curvas_de_animacao(w):
            for ponto in fc.keyframe_points:
                ponto.interpolation = 'LINEAR'

    for obj in [door_l, door_r] + rodas:
        if obj.animation_data and obj.animation_data.action:
            track = obj.animation_data.nla_tracks.new()
            track.strips.new(obj.animation_data.action.name, 1, obj.animation_data.action)

    exportar_glb(os.path.join(RAIZ, 'assets', 'props', 'fusca.glb'))

if __name__ == "__main__":
    main()
