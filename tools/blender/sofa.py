# Sofá de dois lugares da sala do apartamento 201.
#
# Roda sem abrir janela:
#   blender --background --factory-startup --python tools/blender/sofa.py
#   (acrescente  -- --preview caminho.png  pra renderizar uma imagem de conferência)
#
# As medidas NÃO são livres: o jogo colide com o AABB declarado em
# src/apartmentProps.js (tag 'sofa'), e o modelo precisa caber dentro dele,
# senão o jogador atravessa estofado ou esbarra no ar. O envelope abaixo é
# a mesma caixa, e o script falha se a geometria sair dela.
#
# Eixos: o Blender usa Z pra cima; o exportador glTF converte pra Y pra cima.
# No jogo o encosto fica no lado de z MENOR (virado pra TV, em z maior), o
# que aqui no Blender é o lado de y MAIOR. A origem fica no centro da base,
# rente ao piso — quem carrega só posiciona no centro do AABB.

import math
import os
import sys

# O Blender não põe a pasta do script no caminho de importação.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from comum import (  # noqa: E402
    argumentos, caixa_arredondada, cilindro_afunilado, conferir_envelope,
    exportar_glb, limpar_cena, material_pbr, projetar_uv, renderizar_previa,
    textura_trama, unir,
)

# Envelope = AABB 'sofa' de src/apartmentProps.js: 1,50 x 0,85 x 0,82 m.
LARGURA = 1.50
PROFUNDIDADE = 0.85
ALTURA = 0.82

HX = LARGURA / 2
HY = PROFUNDIDADE / 2


def construir():
    limpar_cena()

    trama = textura_trama('trama_tecido', tamanho=256, periodo=8)
    tecido = material_pbr('tecido', cor=0x5f6f80, rugosidade=0.92, normal=trama, forca_normal=0.18)
    almofada = material_pbr('tecido_quente', cor=0x9c5f4e, rugosidade=0.95, normal=trama, forca_normal=0.18)
    madeira = material_pbr('madeira_escura', cor=0x5b4232, rugosidade=0.55)

    partes = []

    # Pés: quatro troncos afunilados, recuados das quinas.
    for sx in (-1, 1):
        for sy in (-1, 1):
            partes.append(cilindro_afunilado(
                'pe', madeira,
                x=sx * (HX - 0.10), y=sy * (HY - 0.09),
                z0=0.0, z1=0.11, raio_base=0.016, raio_topo=0.024,
            ))

    # Estrutura: a caixa que segura tudo, logo acima dos pés.
    partes.append(caixa_arredondada(
        'base', tecido,
        x0=-HX + 0.01, x1=HX - 0.01, y0=-HY + 0.03, y1=HY - 0.01,
        z0=0.11, z1=0.31, raio=0.03,
    ))

    # Braços: mais altos que o assento, arredondados por cima.
    for sx in (-1, 1):
        xa, xb = sorted((sx * (HX - 0.005), sx * (HX - 0.155)))
        partes.append(caixa_arredondada(
            'braco', tecido,
            x0=xa, x1=xb, y0=-HY + 0.01, y1=HY - 0.005,
            z0=0.11, z1=0.62, raio=0.055,
        ))

    # Encosto fixo, atrás das almofadas.
    partes.append(caixa_arredondada(
        'encosto', tecido,
        x0=-HX + 0.15, x1=HX - 0.15, y0=HY - 0.13, y1=HY - 0.005,
        z0=0.31, z1=ALTURA - 0.005, raio=0.05,
    ))

    # Almofadas de assento: duas, com uma fresta entre elas.
    for sx in (-1, 1):
        xa, xb = sorted((sx * 0.006, sx * (HX - 0.16)))
        partes.append(caixa_arredondada(
            'assento', tecido,
            x0=xa, x1=xb, y0=-HY + 0.015, y1=HY - 0.14,
            z0=0.30, z1=0.45, raio=0.055, segmentos=4,
        ))

    # Almofadas de encosto: inclinadas pra trás, apoiadas no encosto fixo.
    for sx in (-1, 1):
        xa, xb = sorted((sx * 0.006, sx * (HX - 0.16)))
        obj = caixa_arredondada(
            'almofada_encosto', tecido,
            x0=xa, x1=xb, y0=HY - 0.30, y1=HY - 0.13,
            z0=0.45, z1=0.78, raio=0.06, segmentos=4,
        )
        inclinar(obj, graus=-9, pivo_y=HY - 0.13, pivo_z=0.45)
        partes.append(obj)

    # Almofadas soltas nas pontas, na cor quente que já existia no jogo.
    for sx in (-1, 1):
        obj = caixa_arredondada(
            'almofada_solta', almofada,
            x0=-0.17, x1=0.17, y0=-0.06, y1=0.06,
            z0=-0.17, z1=0.17, raio=0.05, segmentos=4,
        )
        obj.rotation_euler = (math.radians(-12), 0.0, math.radians(sx * -8))
        obj.location = (sx * (HX - 0.34), HY - 0.37, 0.64)
        partes.append(obj)

    sofa = unir(partes, 'sofa')
    # Um ciclo da textura a cada 8 cm: 16 fios por ciclo dão fios de 5 mm,
    # que é a trama de um tecido de sofá vista a um ou dois metros.
    projetar_uv(sofa, escala=0.08)
    return sofa


def inclinar(obj, graus, pivo_y, pivo_z):
    """Gira a malha em torno do eixo x passando por (pivo_y, pivo_z)."""
    ang = math.radians(graus)
    c, s = math.cos(ang), math.sin(ang)
    for v in obj.data.vertices:
        y, z = v.co.y - pivo_y, v.co.z - pivo_z
        v.co.y = pivo_y + y * c - z * s
        v.co.z = pivo_z + y * s + z * c


def main():
    args = argumentos()
    sofa = construir()
    conferir_envelope(sofa, (-HX, HX), (-HY, HY), (0.0, ALTURA))

    raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    destino = os.path.join(raiz, 'assets', 'props', 'sofa.glb')
    exportar_glb(destino)

    if args.get('preview'):
        renderizar_previa(args['preview'], alvo=(0.0, 0.0, 0.40), distancia=2.6)


main()
