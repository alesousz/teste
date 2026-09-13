import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from comum import (
    RAIZ, caixa, cilindro, exportar_glb, girar, limpar_cena, material_pbr, materiais, unir
)

# Cada item é um objeto independente com origem no centro da base, rente ao
# chão: o editor usa cada nó sozinho e o posiciona pela origem.

def gerar_itens():
    limpar_cena()
    M = materiais()
    # Materiais lisos pros itens de bolso: nesta escala a textura de cortiça
    # ou de tecido não aparece e só somava ~260 KB ao arquivo.
    M['chip'] = material_pbr('chip', 0xd4af37, 0.3, metalico=1.0)
    M['filtro'] = material_pbr('filtro', 0xc8894a, 0.9)
    M['espuma'] = material_pbr('espuma', 0x2a2a2a, 0.95)
    objetos = {}

    print("Modelando o Celular...")
    p_celular = [
        caixa('corpo', M['metalEsc'], -0.035, 0.035, 0.0, 0.008, -0.075, 0.075, raio=0.003),
        caixa('tela', M['tela'], -0.032, 0.032, 0.008, 0.009, -0.07, 0.07),
    ]
    objetos['celular'] = unir(p_celular, 'celular')

    print("Modelando o Dinheiro...")
    p_dinheiro = [
        caixa('papel', M['fotoC'], -0.033, 0.033, 0.0, 0.015, -0.078, 0.078, raio=0.002), # Nota verde
        caixa('cinta', M['papel'], -0.034, 0.034, 0.0, 0.016, -0.01, 0.01),
    ]
    objetos['dinheiro'] = unir(p_dinheiro, 'dinheiro')

    print("Modelando o Cartão de Crédito...")
    p_cartao = [
        caixa('plastico', M['vermelho'], -0.043, 0.043, 0.0, 0.001, -0.027, 0.027, raio=0.002),
        caixa('chip', M['chip'], -0.03, -0.02, 0.001, 0.0015, -0.01, 0.0),
    ]
    objetos['cartao'] = unir(p_cartao, 'cartao')

    print("Modelando o Cigarro...")
    p_cigarro = [
        cilindro('papel', M['papel'], 0, 0, 0.0, 0.06, 0.004, lados=12),
        cilindro('filtro', M['filtro'], 0, 0, 0.06, 0.08, 0.004, lados=12),
    ]
    cigarro = unir(p_cigarro, 'cigarro')
    # Deitado no chão. O pivô sai de duas condições sobre o cilindro em pé
    # (y 0..0,08, raio 0,004): depois do giro de 90° em x, y_final = py+pz-z
    # tem de começar em 0 (py+pz = 0,004) e z_final = y+pz-py tem de ficar
    # centrado (pz-py = -0,04). Daí py = 0,022 e pz = -0,018.
    girar(cigarro, 'x', 90, (0, 0.022, -0.018))
    objetos['cigarro'] = cigarro

    print("Modelando o Fone de Ouvido...")
    p_fone = [
        # Em pé, apoiado nas conchas: a base delas fica em y = 0.
        # Arco
        caixa('arco_topo', M['plastico'], -0.09, 0.09, 0.15, 0.17, -0.02, 0.02, raio=0.005),
        caixa('arco_esq', M['plastico'], -0.09, -0.07, 0.04, 0.16, -0.02, 0.02, raio=0.005),
        caixa('arco_dir', M['plastico'], 0.07, 0.09, 0.04, 0.16, -0.02, 0.02, raio=0.005),
        # Conchas externas
        caixa('concha_esq', M['metal'], -0.09, -0.06, 0.0, 0.06, -0.03, 0.03, raio=0.008),
        caixa('concha_dir', M['metal'], 0.06, 0.09, 0.0, 0.06, -0.03, 0.03, raio=0.008),
        # Espumas
        caixa('espuma_esq', M['espuma'], -0.06, -0.04, 0.0, 0.06, -0.03, 0.03, raio=0.005),
        caixa('espuma_dir', M['espuma'], 0.04, 0.06, 0.0, 0.06, -0.03, 0.03, raio=0.005),
    ]
    objetos['fone'] = unir(p_fone, 'fone_ouvido')

    caminho = os.path.join(RAIZ, 'assets', 'props', 'itens.glb')
    exportar_glb(caminho)

gerar_itens()

