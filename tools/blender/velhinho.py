import os, sys, math
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import RAIZ, caixa, cilindro, exportar_glb, limpar_cena, materiais, unir, material_pbr

def config_pivo_and_parent(obj, parent, px, py, pz):
    pivo_world = Vector((px, -pz, py))
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.transform.translate(value=-pivo_world)
    bpy.ops.object.mode_set(mode='OBJECT')
    
    obj.parent = parent
    if parent:
        parent_world = Vector((0,0,0))
        p = parent
        while p:
            parent_world += p.location
            p = p.parent
        obj.location = pivo_world - parent_world
    else:
        obj.location = pivo_world
    
    # Ensure no matrix_parent_inverse
    obj.matrix_parent_inverse.identity()

def main():
    limpar_cena()
    M = materiais()
    try:
        M['pele_velhinho'] = material_pbr('pele_velhinho', 0xfad6b1, 0.7)
        M['cabelo_branco'] = material_pbr('cabelo_branco', 0xeeeeee, 0.9)
        M['camisa_simples'] = material_pbr('camisa_simples', 0x5e839e, 0.9)
        M['calca_simples'] = material_pbr('calca_simples', 0x4a3b2c, 0.9)
        M['olho'] = material_pbr('olho', 0x111111, 0.1)
    except:
        pass

    mat_pele = M.get('pele_velhinho', M['madeira'])
    mat_cabelo = M.get('cabelo_branco', M['vidro'])
    mat_camisa = M.get('camisa_simples', M['tecido'])
    mat_calca = M.get('calca_simples', M['tecidoQuente'])
    mat_madeira = M['madeiraEsc']
    mat_olho = M.get('olho', M['metalEsc'])

    # IMPORTANT: Do not set ANY rotation until all objects are created and parented.

    # 1. Torso Group
    p_torso = [
        caixa('torso', mat_camisa, -0.25, 0.25, 0.6, 1.25, -0.15, 0.15, raio=0.06),
        caixa('cabeca', mat_pele, -0.12, 0.12, 1.15, 1.45, 0.15, 0.45, raio=0.05),
        caixa('nariz', mat_pele, -0.03, 0.03, 1.25, 1.35, 0.45, 0.5, raio=0.01),
        caixa('olho_l', mat_olho, -0.08, -0.04, 1.32, 1.36, 0.42, 0.46, raio=0.005),
        caixa('olho_r', mat_olho, 0.04, 0.08, 1.32, 1.36, 0.42, 0.46, raio=0.005),
        caixa('cabelo_back', mat_cabelo, -0.13, 0.13, 1.2, 1.4, 0.05, 0.15, raio=0.02),
        caixa('cabelo_l', mat_cabelo, -0.15, -0.11, 1.25, 1.4, 0.15, 0.3, raio=0.02),
        caixa('cabelo_r', mat_cabelo,  0.11,  0.15, 1.25, 1.4, 0.15, 0.3, raio=0.02),
        caixa('barba', mat_cabelo, -0.13, 0.13, 1.05, 1.25, 0.35, 0.5, raio=0.04)
    ]
    torso = unir(p_torso, 'Personagem_Velhinho')
    config_pivo_and_parent(torso, None, 0, 0.6, 0)
    torso["footprint"] = "1x1"

    # 2. Pernas
    perna_l = unir([
        caixa('p_l', mat_calca, -0.2, -0.05, 0.15, 0.65, -0.1, 0.1, raio=0.03),
        caixa('s_l', mat_madeira, -0.22, -0.03, 0.0, 0.15, -0.2, 0.15, raio=0.03)
    ], 'Perna_L')
    config_pivo_and_parent(perna_l, torso, -0.12, 0.6, 0)

    perna_r = unir([
        caixa('p_r', mat_calca,  0.05,  0.2, 0.15, 0.65, -0.1, 0.1, raio=0.03),
        caixa('s_r', mat_madeira,  0.03,  0.22, 0.0, 0.15, -0.2, 0.15, raio=0.03)
    ], 'Perna_R')
    config_pivo_and_parent(perna_r, torso, 0.12, 0.6, 0)

    # 3. Braços
    braco_l = unir([
        caixa('b_l', mat_camisa, -0.35, -0.25, 0.65, 1.15, 0.1, 0.3, raio=0.03),
        caixa('m_l', mat_pele, -0.33, -0.27, 0.55, 0.65, 0.15, 0.25, raio=0.02)
    ], 'Braco_L')
    config_pivo_and_parent(braco_l, torso, -0.3, 1.15, 0.2)

    braco_r = unir([
        caixa('b_r', mat_camisa, 0.25, 0.35, 0.65, 1.15, 0.1, 0.3, raio=0.03),
        caixa('m_r', mat_pele, 0.27, 0.33, 0.55, 0.65, 0.15, 0.25, raio=0.02)
    ], 'Braco_R')
    config_pivo_and_parent(braco_r, torso, 0.3, 1.15, 0.2)
    
    # 4. Bengala conectada à mão direita
    bengala = unir([
        cilindro('beng', mat_madeira, 0.3, 0.2, 0.0, 0.6, 0.015),
        caixa('cabo', mat_madeira, 0.28, 0.32, 0.6, 0.65, 0.15, 0.35, raio=0.01)
    ], 'Bengala')
    config_pivo_and_parent(bengala, braco_r, 0.3, 0.6, 0.2)
    
    
    # ==========================
    # AGORA QUE TUDO ESTÁ PARENTADO CORRETAMENTE COM LOCATION LOCAL, APLICAMOS ROTAÇÕES!
    # ==========================
    
    torso.rotation_euler = (math.radians(25), 0, 0)
    
    # Como as pernas estão parentadas ao torso (que rotacionou +25), precisamos aplicar -25 para elas ficarem retas apontando pro chão.
    perna_l.rotation_euler = (math.radians(-25), 0, 0)
    perna_r.rotation_euler = (math.radians(-25), 0, 0)
    
    # Braço L relaxado aponta pro chão (-25 para anular o torso)
    braco_l.rotation_euler = (math.radians(-25), 0, 0)
    
    # Braço R segurando a bengala aponta um pouco pra frente (-10 no total localmente)
    braco_r.rotation_euler = (math.radians(-10), 0, 0)

    # Bengala
    # Ela está parentada ao braço R, que está em -10. O Torso está em +25.
    # Total no espaço do mundo: +25 - 10 = +15 graus inclinada para frente.
    # Queremos que ela aponte reto pro chão, então compensamos:
    bengala.rotation_euler = (math.radians(-15), 0, 0)


    # 5. Animação
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 60

    def kf(obj, frame, rot_x):
        obj.rotation_euler = (math.radians(rot_x), 0, 0)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)

    base_loc = torso.location.copy()
    
    torso.location = base_loc
    torso.keyframe_insert(data_path="location", frame=1)
    torso.location = (base_loc.x, base_loc.y, base_loc.z - 0.05)
    torso.keyframe_insert(data_path="location", frame=15)
    torso.location = base_loc
    torso.keyframe_insert(data_path="location", frame=30)
    torso.location = (base_loc.x, base_loc.y, base_loc.z - 0.05)
    torso.keyframe_insert(data_path="location", frame=45)
    torso.location = base_loc
    torso.keyframe_insert(data_path="location", frame=60)
    
    kf(perna_l, 1, -25)
    kf(perna_l, 15, -45) 
    kf(perna_l, 30, -25)
    kf(perna_l, 45, -5)  
    kf(perna_l, 60, -25)

    kf(perna_r, 1, -25)
    kf(perna_r, 15, -5)  
    kf(perna_r, 30, -25)
    kf(perna_r, 45, -45) 
    kf(perna_r, 60, -25)

    kf(braco_l, 1, -25)
    kf(braco_l, 15, -5)
    kf(braco_l, 30, -25)
    kf(braco_l, 45, -45)
    kf(braco_l, 60, -25)

    kf(braco_r, 1, -10)
    kf(braco_r, 15, -25)
    kf(braco_r, 30, 0)
    kf(braco_r, 45, 10)
    kf(braco_r, 60, -10)
    
    # Manter bengala reta (compensando o ombro e torso ao longo da animação)
    kf(bengala, 1, -15)
    kf(bengala, 15, 0)
    kf(bengala, 30, -25)
    kf(bengala, 45, -35)
    kf(bengala, 60, -15)

    for obj in [torso, perna_l, perna_r, braco_l, braco_r, bengala]:
        if obj.animation_data and obj.animation_data.action:
            track = obj.animation_data.nla_tracks.new()
            track.strips.new(obj.animation_data.action.name, 1, obj.animation_data.action)

    exportar_glb(os.path.join(RAIZ, 'assets', 'props', 'velhinho.glb'))

if __name__ == "__main__":
    main()
