# Móveis e objetos do prédio inicial, num único assets/props/moveis.glb.
#
# Roda sem abrir janela:
#   blender --background --factory-startup --python tools/blender/moveis.py
#   (acrescente  -- --previa pasta  pra renderizar uma imagem por ambiente,
#    e  --comodos quarto,sala  pra só alguns)
#
# Cada peça é um objeto com o nome da tag de src/apartmentProps.js e a origem
# no centro da base. As medidas vêm da própria tabela do jogo (via Node): o
# construtor recebe largura, altura e profundidade e desenha dentro delas,
# em coordenadas do jogo (ver comum.py). O script falha se alguma peça sair
# da caixa de colisão ou se faltar alguma tag.
#
# A orientação de cada peça segue a montagem em caixas do JS — o comentário
# de cada construtor diz pra que lado fica a frente.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from comum import (  # noqa: E402
    RAIZ, argumentos, caixa, caixas_do_jogo, cilindro, conferir_envelope,
    exportar_glb, girar, limpar_cena, materiais, renderizar_comodos, unir,
)

CONSTRUTORES = {}


def movel(tag):
    def registrar(fn):
        CONSTRUTORES[tag] = fn
        return fn
    return registrar


def quatro_pes(M, mat, meia_x, meia_z, recuo_x, recuo_z, lado, y0, y1, raio=0.004):
    """Quatro pés quadrados de `lado`, recuados das quinas."""
    pes = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * (meia_x - recuo_x), sz * (meia_z - recuo_z)
            pes.append(caixa('pe', mat, cx - lado / 2, cx + lado / 2, y0, y1, cz - lado / 2, cz + lado / 2, raio=raio))
    return pes


# --- Quarto -----------------------------------------------------------------

@movel('cama')
def cama(M, w, h, d):
    """Cabeceira no lado de z menor (parede da janela)."""
    hw, hd = w / 2, d / 2
    p = quatro_pes(M, M['madeiraEsc'], hw, hd, 0.05, 0.05, 0.05, 0.0, 0.08, raio=0.006)
    p.append(caixa('estrado', M['madeiraEsc'], -hw + 0.01, hw - 0.01, 0.08, 0.26, -hd + 0.06, hd - 0.01, raio=0.015))
    p.append(caixa('colchao', M['tecidoClaro'], -hw + 0.03, hw - 0.03, 0.26, 0.47, -hd + 0.08, hd - 0.03, raio=0.05, segmentos=3))
    p.append(caixa('edredom', M['tecidoQuente'], -hw + 0.015, hw - 0.015, 0.40, 0.52, -hd + 0.62, hd - 0.015, raio=0.05, segmentos=3))
    p.append(caixa('lencol_dobrado', M['tecidoClaro'], -hw + 0.02, hw - 0.02, 0.44, 0.53, -hd + 0.56, -hd + 0.68, raio=0.04, segmentos=3))
    p.append(caixa('travesseiro', M['tecidoClaro'], -hw + 0.14, hw - 0.14, 0.46, 0.60, -hd + 0.12, -hd + 0.44, raio=0.06, segmentos=4))
    p.append(caixa('cabeceira', M['madeiraEsc'], -hw, hw, 0.0, 0.75, -hd, -hd + 0.06, raio=0.02))
    return p


@movel('criado_mudo')
def criado_mudo(M, w, h, d):
    """Gavetas no lado de z maior."""
    hw, hd = w / 2, d / 2
    p = quatro_pes(M, M['madeiraEsc'], hw, hd, 0.04, 0.04, 0.03, 0.0, 0.06)
    p.append(caixa('corpo', M['madeira'], -hw, hw, 0.06, h, -hd, hd - 0.03, raio=0.012))
    for y0, y1 in ((0.10, 0.27), (0.30, h - 0.04)):
        p.append(caixa('gaveta', M['madeiraEsc'], -hw + 0.03, hw - 0.03, y0, y1, hd - 0.03, hd - 0.012, raio=0.006))
        ym = (y0 + y1) / 2
        p.append(caixa('puxador', M['metal'], -0.05, 0.05, ym - 0.01, ym + 0.01, hd - 0.012, hd, raio=0.004))
    return p


@movel('abajur')
def abajur(M, w, h, d):
    return [
        cilindro('base', M['metalEsc'], 0, 0, 0.0, 0.025, 0.07, raio_topo=0.06),
        cilindro('haste', M['metal'], 0, 0, 0.025, 0.21, 0.01, lados=12),
        cilindro('cupula', M['luz'], 0, 0, 0.19, h, 0.095, raio_topo=0.065, lados=32),
    ]


@movel('guarda_roupa')
def guarda_roupa(M, w, h, d):
    """Portas no lado de z menor (centro do quarto)."""
    hw, hd = w / 2, d / 2
    p = [
        caixa('rodape', M['madeiraEsc'], -hw + 0.02, hw - 0.02, 0.0, 0.06, -hd + 0.05, hd, raio=0.004),
        caixa('corpo', M['madeira'], -hw, hw, 0.06, h, -hd + 0.035, hd, raio=0.01),
    ]
    for x0, x1 in ((-hw + 0.015, -0.004), (0.004, hw - 0.015)):
        p.append(caixa('porta', M['madeiraEsc'], x0, x1, 0.09, h - 0.03, -hd + 0.012, -hd + 0.035, raio=0.006))
    for x in (-0.035, 0.035):
        p.append(caixa('puxador', M['metal'], x - 0.008, x + 0.008, 1.00, 1.30, -hd, -hd + 0.012, raio=0.004))
    return p


@movel('tapete')
def tapete(M, w, h, d):
    hw, hd = w / 2, d / 2
    return [
        caixa('base', M['tecidoQuente'], -hw, hw, 0.0, 0.012, -hd, hd, raio=0.006),
        caixa('centro', M['tecidoClaro'], -hw + 0.12, hw - 0.12, 0.004, 0.016, -hd + 0.12, hd - 0.12, raio=0.004),
        caixa('faixa', M['tecidoQuente'], -hw + 0.20, hw - 0.20, 0.006, 0.018, -hd + 0.20, hd - 0.20, raio=0.003),
    ]


# --- Banheiro ---------------------------------------------------------------

@movel('box_banho')
def box_banho(M, w, h, d):
    """Vidros nos lados de x e z maiores; os outros dois são parede."""
    hw, hd = w / 2, d / 2
    return [
        caixa('base', M['ceramica'], -hw, hw, 0.0, 0.10, -hd, hd, raio=0.02),
        cilindro('ralo', M['metal'], 0, 0, 0.10, 0.103, 0.035),
        caixa('vidro_leste', M['vidro'], hw - 0.01, hw, 0.10, h - 0.03, -hd, hd - 0.01),
        caixa('vidro_sul', M['vidro'], -hw, hw - 0.01, 0.10, h - 0.03, hd - 0.01, hd),
        caixa('perfil_leste', M['metal'], hw - 0.02, hw, h - 0.03, h, -hd, hd, raio=0.004),
        caixa('perfil_sul', M['metal'], -hw, hw - 0.02, h - 0.03, h, hd - 0.02, hd, raio=0.004),
        caixa('montante', M['metal'], hw - 0.03, hw, 0.10, h, hd - 0.03, hd, raio=0.004),
        cilindro('chuveiro', M['metal'], -hw + 0.22, -hd + 0.22, h - 0.14, h - 0.11, 0.09, lados=32),
        caixa('braco_chuveiro', M['metal'], -hw, -hw + 0.22, h - 0.11, h - 0.095, -hd + 0.21, -hd + 0.23, raio=0.005),
        caixa('registro', M['metal'], -hw, -hw + 0.04, 1.05, 1.13, -hd + 0.40, -hd + 0.48, raio=0.01),
    ]


@movel('vaso')
def vaso(M, w, h, d):
    """Caixa acoplada no lado de x menor (parede oeste)."""
    hw, hd = w / 2, d / 2
    return [
        caixa('caixa_acoplada', M['ceramica'], -hw, -hw + 0.17, 0.38, h - 0.012, -hd + 0.08, hd - 0.08, raio=0.03),
        cilindro('botao', M['metal'], -hw + 0.085, 0, h - 0.012, h, 0.025),
        cilindro('pedestal', M['ceramica'], 0.06, 0, 0.0, 0.34, 0.13, raio_topo=0.17, escala_z=0.8, lados=32),
        cilindro('bacia', M['ceramica'], 0.08, 0, 0.30, 0.40, 0.19, raio_topo=0.215, escala_z=0.85, lados=32),
        cilindro('assento', M['ceramica'], 0.08, 0, 0.40, 0.425, 0.215, escala_z=0.85, lados=32),
        cilindro('tampa', M['ceramica'], 0.08, 0, 0.425, 0.445, 0.205, escala_z=0.83, lados=32),
    ]


@movel('pia_banheiro')
def pia_banheiro(M, w, h, d):
    """Coluna e torneira no lado de x maior (parede leste)."""
    hw = w / 2
    hd = d / 2
    return [
        cilindro('coluna', M['ceramica'], hw - 0.13, 0, 0.0, h - 0.14, 0.10, raio_topo=0.12, lados=32),
        caixa('cuba', M['ceramica'], -hw, hw, h - 0.15, h, -hd, hd, raio=0.05, segmentos=3),
        cilindro('bojo', M['ceramicaSombra'], -0.03, 0, h - 0.002, h + 0.001, 0.17, escala_z=1.6, lados=40),
        cilindro('ralo', M['metal'], -0.03, 0, h + 0.001, h + 0.003, 0.022),
        cilindro('torneira', M['metal'], hw - 0.09, 0, h, h + 0.20, 0.017, lados=16),
        caixa('bica', M['metal'], hw - 0.24, hw - 0.09, h + 0.17, h + 0.20, -0.014, 0.014, raio=0.008),
        cilindro('manopla', M['metal'], hw - 0.09, 0, h + 0.20, h + 0.23, 0.024, lados=16),
    ]


@movel('espelho')
def espelho(M, w, h, d):
    """Colado na parede leste, refletindo pro lado de x menor."""
    hw, hd = w / 2, d / 2
    return [
        caixa('moldura', M['metalEsc'], -hw + 0.012, hw, 0.0, h, -hd, hd, raio=0.004),
        caixa('vidro', M['espelho'], -hw, -hw + 0.012, 0.025, h - 0.025, -hd + 0.025, hd - 0.025),
    ]


# --- Sala e cozinha ---------------------------------------------------------

@movel('sofa')
def sofa(M, w, h, d):
    """Encosto no lado de z menor, assento virado pra TV (z maior)."""
    hw, hd = w / 2, d / 2
    p = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            p.append(cilindro('pe', M['madeiraEsc'], sx * (hw - 0.10), sz * (hd - 0.09), 0.0, 0.11, 0.016, raio_topo=0.024, lados=12))
    p.append(caixa('base', M['tecido'], -hw + 0.01, hw - 0.01, 0.11, 0.31, -hd + 0.01, hd - 0.03, raio=0.03))
    for sx in (-1, 1):
        xa, xb = sorted((sx * (hw - 0.005), sx * (hw - 0.155)))
        p.append(caixa('braco', M['tecido'], xa, xb, 0.11, 0.62, -hd + 0.005, hd - 0.01, raio=0.055))
    p.append(caixa('encosto', M['tecido'], -hw + 0.15, hw - 0.15, 0.31, h - 0.005, -hd + 0.005, -hd + 0.13, raio=0.05))
    for sx in (-1, 1):
        xa, xb = sorted((sx * 0.006, sx * (hw - 0.16)))
        p.append(caixa('assento', M['tecido'], xa, xb, 0.30, 0.45, -hd + 0.14, hd - 0.015, raio=0.055, segmentos=4))
        encosto = caixa('almofada_encosto', M['tecido'], xa, xb, 0.45, 0.78, -hd + 0.13, -hd + 0.30, raio=0.06, segmentos=4)
        girar(encosto, 'x', -9, (0, 0.45, -hd + 0.13))
        p.append(encosto)
    for sx in (-1, 1):
        cx, cy, cz = sx * (hw - 0.34), 0.64, -hd + 0.37
        almofada = caixa('almofada_solta', M['tecidoQuente'], cx - 0.17, cx + 0.17, cy - 0.17, cy + 0.17, cz - 0.06, cz + 0.06,
                         raio=0.05, segmentos=4)
        girar(almofada, 'x', -12, (cx, cy, cz))
        girar(almofada, 'y', sx * -8, (cx, cy, cz))
        p.append(almofada)
    return p


@movel('mesinha_centro')
def mesinha_centro(M, w, h, d):
    hw, hd = w / 2, d / 2
    p = [
        caixa('tampo', M['madeira'], -hw, hw, h - 0.035, h, -hd, hd, raio=0.012),
        caixa('prateleira', M['madeira'], -hw + 0.07, hw - 0.07, 0.09, 0.11, -hd + 0.07, hd - 0.07, raio=0.004),
    ]
    return p + quatro_pes(M, M['madeiraEsc'], hw, hd, 0.06, 0.06, 0.044, 0.0, h - 0.035, raio=0.005)


@movel('rack_tv')
def rack_tv(M, w, h, d):
    """Encostado na parede de z maior; portas no lado de z menor."""
    hw, hd = w / 2, d / 2
    p = quatro_pes(M, M['metalEsc'], hw, hd, 0.08, 0.06, 0.03, 0.0, 0.07)
    p.append(caixa('corpo', M['madeiraEsc'], -hw, hw, 0.07, h, -hd + 0.027, hd, raio=0.01))
    for x0, x1 in ((-hw + 0.02, -0.25), (0.25, hw - 0.02)):
        p.append(caixa('porta', M['madeira'], x0, x1, 0.10, h - 0.03, -hd + 0.012, -hd + 0.027, raio=0.005))
        cx = (x0 + x1) / 2
        p.append(caixa('puxador', M['metal'], cx - 0.06, cx + 0.06, h - 0.075, h - 0.06, -hd, -hd + 0.012, raio=0.004))
    p.append(caixa('prateleira', M['madeira'], -0.24, 0.24, 0.27, 0.29, -hd + 0.012, -hd + 0.03, raio=0.003))
    return p


@movel('monitor')
def monitor(M, w, h, d):
    """Monitor de tubo antigo, tela no lado de z menor (virada pro sofá)."""
    hw, hd = w / 2, d / 2
    return [
        caixa('pe', M['plastico'], -0.14, 0.14, 0.0, 0.03, -0.02, hd - 0.03, raio=0.01),
        caixa('carcaca', M['plastico'], -hw + 0.07, hw - 0.07, 0.06, h - 0.05, -hd + 0.12, hd, raio=0.05, segmentos=3),
        caixa('moldura', M['plastico'], -hw, hw, 0.03, h, -hd + 0.008, -hd + 0.13, raio=0.02),
        caixa('tela', M['tela'], -hw + 0.055, hw - 0.055, 0.085, h - 0.055, -hd + 0.001, -hd + 0.012, raio=0.015),
        caixa('led', M['led'], hw - 0.07, hw - 0.06, 0.045, 0.055, -hd, -hd + 0.008),
    ]


@movel('porta_retratos')
def porta_retratos(M, w, h, d):
    """Foto virada pro lado de z menor, pezinho na frente."""
    hw, hd = w / 2, d / 2
    return [
        caixa('moldura', M['madeira'], -hw, hw, 0.0, h, hd - 0.02, hd, raio=0.004),
        caixa('foto', M['fotoA'], -hw + 0.025, hw - 0.025, 0.03, h - 0.025, hd - 0.026, hd - 0.019),
        caixa('pe', M['madeira'], -0.015, 0.015, 0.0, 0.09, -hd, hd - 0.02, raio=0.003),
    ]


@movel('mesa_jantar')
def mesa_jantar(M, w, h, d):
    hw, hd = w / 2, d / 2
    p = [caixa('tampo', M['madeira'], -hw, hw, h - 0.04, h, -hd, hd, raio=0.012)]
    for sz in (-1, 1):
        z = sz * (hd - 0.08)
        p.append(caixa('saia', M['madeira'], -hw + 0.08, hw - 0.08, h - 0.12, h - 0.04, z - 0.01, z + 0.01))
    for sx in (-1, 1):
        x = sx * (hw - 0.08)
        p.append(caixa('saia', M['madeira'], x - 0.01, x + 0.01, h - 0.12, h - 0.04, -hd + 0.08, hd - 0.08))
    return p + quatro_pes(M, M['madeiraEsc'], hw, hd, 0.08, 0.08, 0.056, 0.0, h - 0.04, raio=0.006)


def cadeira(M, w, h, d):
    """Encosto no lado de z maior: as cadeiras ficam ao sul da mesa."""
    hw, hd = w / 2, d / 2
    p = [
        caixa('assento', M['madeira'], -hw, hw, 0.42, 0.46, -hd, hd, raio=0.01),
        caixa('almofada', M['tecido'], -hw + 0.03, hw - 0.03, 0.46, 0.49, -hd + 0.03, hd - 0.05, raio=0.015, segmentos=3),
    ]
    for sx in (-1, 1):
        x = sx * (hw - 0.04)
        p.append(caixa('pe_frente', M['madeiraEsc'], x - 0.018, x + 0.018, 0.0, 0.42, -hd + 0.022, -hd + 0.058, raio=0.004))
        p.append(caixa('pe_tras', M['madeiraEsc'], x - 0.018, x + 0.018, 0.0, h, hd - 0.058, hd - 0.022, raio=0.004))
    for y0, y1 in ((0.60, 0.68), (0.76, 0.86)):
        p.append(caixa('ripa', M['madeira'], -hw + 0.04, hw - 0.04, y0, y1, hd - 0.05, hd - 0.03, raio=0.006))
    return p


movel('cadeira_oeste')(cadeira)
movel('cadeira_leste')(cadeira)


@movel('bancada')
def bancada(M, w, h, d):
    """Frente no lado de x menor; parede no de x maior."""
    hw, hd = w / 2, d / 2
    p = [
        caixa('rodape', M['madeiraEsc'], -hw + 0.07, hw, 0.0, 0.08, -hd, hd),
        caixa('corpo', M['madeira'], -hw + 0.03, hw, 0.08, h - 0.04, -hd, hd, raio=0.006),
        caixa('tampo', M['pedra'], -hw, hw, h - 0.04, h, -hd, hd, raio=0.006),
    ]
    passo = d / 3
    for i in range(3):
        z0, z1 = -hd + i * passo + 0.012, -hd + (i + 1) * passo - 0.012
        p.append(caixa('porta', M['madeiraEsc'], -hw + 0.012, -hw + 0.03, 0.10, h - 0.07, z0, z1, raio=0.005))
        zm = (z0 + z1) / 2
        p.append(caixa('puxador', M['metal'], -hw, -hw + 0.012, h - 0.12, h - 0.105, zm - 0.07, zm + 0.07, raio=0.004))
    p.append(caixa('cuba_borda', M['metal'], -hw + 0.10, hw - 0.10, h, h + 0.003, -hd + 0.30, -hd + 0.90, raio=0.002))
    p.append(caixa('cuba_fundo', M['metalEsc'], -hw + 0.13, hw - 0.13, h + 0.003, h + 0.0045, -hd + 0.33, -hd + 0.87))
    p.append(cilindro('torneira', M['metal'], hw - 0.10, -hd + 0.60, h, h + 0.26, 0.018, lados=16))
    p.append(caixa('bica', M['metal'], hw - 0.30, hw - 0.10, h + 0.23, h + 0.26, -hd + 0.585, -hd + 0.615, raio=0.01))
    return p


@movel('armario_aereo')
def armario_aereo(M, w, h, d):
    """Portas no lado de x menor, puxadores embaixo (fica acima da cabeça)."""
    hw, hd = w / 2, d / 2
    p = [caixa('corpo', M['madeira'], -hw + 0.022, hw, 0.0, h, -hd, hd, raio=0.008)]
    for z0, z1 in ((-hd + 0.01, -0.004), (0.004, hd - 0.01)):
        p.append(caixa('porta', M['madeiraEsc'], -hw + 0.006, -hw + 0.022, 0.015, h - 0.015, z0, z1, raio=0.004))
    for z in (-0.03, 0.03):
        p.append(caixa('puxador', M['metal'], -hw, -hw + 0.006, 0.03, 0.15, z - 0.006, z + 0.006, raio=0.003))
    return p


@movel('geladeira')
def geladeira(M, w, h, d):
    """Portas no lado de x menor; freezer em cima."""
    hw, hd = w / 2, d / 2
    p = [
        caixa('pes', M['metalEsc'], -hw + 0.06, hw - 0.04, 0.0, 0.02, -hd + 0.04, hd - 0.04),
        caixa('corpo', M['metal'], -hw + 0.045, hw, 0.02, h, -hd, hd, raio=0.02),
    ]
    for y0, y1 in ((0.03, 1.18), (1.22, h - 0.02)):
        p.append(caixa('porta', M['metalEsc'], -hw + 0.018, -hw + 0.045, y0, y1, -hd + 0.015, hd - 0.015, raio=0.012))
    for y0, y1 in ((0.75, 1.10), (1.30, 1.60)):
        p.append(caixa('puxador', M['metal'], -hw, -hw + 0.018, y0, y1, hd - 0.13, hd - 0.10, raio=0.006))
    return p


@movel('mural_fotos')
def mural_fotos(M, w, h, d):
    """Pendurado na parede de z menor, fotos viradas pro lado de z maior."""
    hw, hd = w / 2, d / 2
    p = [
        caixa('moldura', M['madeiraEsc'], -hw, hw, 0.0, h, -hd, hd - 0.015, raio=0.006),
        caixa('cortica', M['cortica'], -hw + 0.03, hw - 0.03, 0.03, h - 0.03, hd - 0.017, hd - 0.012),
    ]
    larg = (w - 0.20) / 3
    cores = ('fotoA', 'fotoB', 'fotoC', 'fotoC', 'fotoA', 'fotoB')
    inclinacoes = (-3.0, 2.0, -1.5, 3.5, -2.5, 1.5)
    k = 0
    for i in range(3):
        for j in range(2):
            x0, y0 = -hw + 0.05 + i * (larg + 0.05), 0.06 + j * 0.32
            x1, y1 = x0 + larg, y0 + 0.26
            foto = [
                caixa('papel', M['papel'], x0, x1, y0, y1, hd - 0.012, hd - 0.009),
                caixa('imagem', M[cores[k]], x0 + 0.012, x1 - 0.012, y0 + 0.012, y1 - 0.03, hd - 0.009, hd - 0.007),
                caixa('pino', M['vermelho'], (x0 + x1) / 2 - 0.006, (x0 + x1) / 2 + 0.006, y1 - 0.022, y1 - 0.01, hd - 0.009, hd - 0.002, raio=0.003),
            ]
            girar(foto, 'z', inclinacoes[k], ((x0 + x1) / 2, (y0 + y1) / 2, 0))
            p += foto
            k += 1
    return p


# --- Corredor e saguão ------------------------------------------------------

@movel('luminaria_corredor')
def luminaria_corredor(M, w, h, d):
    return [
        cilindro('base', M['metalEsc'], 0, 0, h - 0.02, h, 0.08, lados=32),
        cilindro('aro', M['metalEsc'], 0, 0, 0.015, h - 0.02, 0.21, raio_topo=0.22, lados=40),
        cilindro('difusor', M['luz'], 0, 0, 0.0, 0.02, 0.20, lados=40),
    ]


@movel('extintor')
def extintor(M, w, h, d):
    """Preso na parede de z maior; bico pro lado de z menor."""
    hd = d / 2
    return [
        caixa('suporte', M['metalEsc'], -0.045, 0.045, 0.06, 0.50, hd - 0.025, hd, raio=0.004),
        cilindro('corpo', M['vermelho'], 0, 0, 0.0, 0.46, 0.085, lados=32),
        cilindro('cinta', M['metalEsc'], 0, 0, 0.30, 0.33, 0.088, lados=32),
        cilindro('ombro', M['vermelho'], 0, 0, 0.46, 0.50, 0.085, raio_topo=0.045, lados=32),
        cilindro('valvula', M['metal'], 0, 0, 0.50, 0.55, 0.022, lados=16),
        caixa('bico', M['metalEsc'], -0.012, 0.012, 0.525, 0.545, -0.085, -0.02, raio=0.005),
        cilindro('manopla', M['metal'], 0, 0, 0.55, 0.585, 0.03, lados=16),
    ]


@movel('banco_saguao')
def banco_saguao(M, w, h, d):
    """Encosto no lado de x menor (parede oeste)."""
    hw, hd = w / 2, d / 2
    p = []
    for z in (-hd + 0.18, hd - 0.18):
        p.append(caixa('poste', M['metalEsc'], -hw, -hw + 0.04, 0.0, h, z - 0.02, z + 0.02, raio=0.004))
        p.append(caixa('perna', M['metalEsc'], hw - 0.06, hw - 0.02, 0.0, 0.40, z - 0.02, z + 0.02, raio=0.004))
        p.append(caixa('travessa', M['metalEsc'], -hw + 0.04, hw - 0.02, 0.36, 0.40, z - 0.02, z + 0.02, raio=0.004))
    vao = (w - 0.07) / 3
    for k in range(3):
        x0 = -hw + 0.07 + k * vao + 0.006
        p.append(caixa('ripa_assento', M['madeira'], x0, x0 + vao - 0.012, 0.40, 0.45, -hd, hd, raio=0.008))
    for y0, y1 in ((0.52, 0.62), (0.66, 0.76), (0.79, h)):
        p.append(caixa('ripa_encosto', M['madeira'], -hw + 0.04, -hw + 0.07, y0, y1, -hd, hd, raio=0.008))
    return p


@movel('caixa_correio')
def caixa_correio(M, w, h, d):
    """Na parede oeste; portinholas no lado de x maior."""
    hw, hd = w / 2, d / 2
    p = [caixa('corpo', M['metalEsc'], -hw, hw - 0.02, 0.0, h, -hd, hd, raio=0.008)]
    larg = (d - 0.12) / 3
    for i in range(3):
        for j in range(2):
            z0, y0 = -hd + 0.03 + i * (larg + 0.03), 0.06 + j * 0.40
            p.append(caixa('portinhola', M['metal'], hw - 0.02, hw - 0.008, y0, y0 + 0.32, z0, z0 + larg, raio=0.004))
            p.append(caixa('fenda', M['tela'], hw - 0.008, hw, y0 + 0.25, y0 + 0.265, z0 + larg * 0.2, z0 + larg * 0.8))
            p.append(caixa('plaqueta', M['papel'], hw - 0.008, hw, y0 + 0.15, y0 + 0.19, z0 + larg * 0.3, z0 + larg * 0.7))
            p.append(caixa('fechadura', M['metalEsc'], hw - 0.008, hw, y0 + 0.06, y0 + 0.085, z0 + larg - 0.06, z0 + larg - 0.035))
    return p


# ---------------------------------------------------------------------------

def main():
    args = argumentos()
    caixas, extra = caixas_do_jogo()

    faltando = sorted(set(caixas) - set(CONSTRUTORES))
    sobrando = sorted(set(CONSTRUTORES) - set(caixas))
    if faltando or sobrando:
        sys.exit(f'Tags fora de sincronia com o jogo — sem modelo: {faltando}; sem caixa no jogo: {sobrando}')

    limpar_cena()
    M = materiais()
    objetos, erros, total = {}, [], 0
    print('Peças:')
    for tag, construir in CONSTRUTORES.items():
        c = caixas[tag]
        dims = (c['maxX'] - c['minX'], c['maxY'] - c['minY'], c['maxZ'] - c['minZ'])
        obj = unir(construir(M, *dims), tag)
        e, tris = conferir_envelope(obj, c, extra.get(tag, 0.0))
        erros += e
        total += tris
        objetos[tag] = obj
    print(f'Total: {len(objetos)} peças, {total} triângulos')

    if erros:
        print('ENVELOPE VIOLADO:\n  ' + '\n  '.join(erros))
        sys.exit(1)
    print('ENVELOPE OK')

    exportar_glb(os.path.join(RAIZ, 'assets', 'props', 'moveis.glb'))

    if args.get('previa'):
        so = args['comodos'].split(',') if isinstance(args.get('comodos'), str) else None
        renderizar_comodos(objetos, caixas, args['previa'], so=so)


main()
