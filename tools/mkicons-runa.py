import zlib, struct, math, os

# Encodeur PNG en Python pur, comme mkicons.py et mkicons-runa n'a donc
# aucune dependance a installer. Lance depuis la racine du depot :
#     python tools/mkicons-runa.py

def write_png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(v for px in row for v in px) for row in rows)
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)   # RGBA, 8 bits
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))

BG   = (0x10, 0x12, 0x15)
VERT = (0x6e, 0xe7, 0xa0)

# La marque : une boucle fermee avec son point de depart. C'est le sujet de
# l'app (repartir d'ou l'on est parti), et ca se trace sans police, donc
# sans dependance.
RAYON      = 0.30
EPAISSEUR  = 0.058     # demi-epaisseur de l'anneau
DEPART     = 0.088     # rayon de la pastille de depart
ANGLE_DEP  = math.radians(58)
TROU       = (math.radians(30), math.radians(86))   # l'anneau s'interrompt ici

SS = 4   # suréchantillonnage : les bords d'un cercle sans lissage bavent


def couvre(x, y, echelle):
    """Le motif est decrit dans une boite 0..1 ; `echelle` le retrecit vers
    le centre pour la variante maskable, dont Android rogne les bords."""
    dx = (x - 0.5) / echelle
    dy = (y - 0.5) / echelle
    d = math.hypot(dx, dy)

    ax, ay = math.cos(ANGLE_DEP) * RAYON, -math.sin(ANGLE_DEP) * RAYON
    if math.hypot(dx - ax, dy - ay) <= DEPART:
        return True

    if abs(d - RAYON) <= EPAISSEUR:
        ang = math.atan2(-dy, dx) % (2 * math.pi)
        if TROU[0] <= ang <= TROU[1]:
            return False
        return True
    return False


def rendu(taille, echelle):
    rows = []
    for py in range(taille):
        row = []
        for px in range(taille):
            n = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / taille
                    y = (py + (sy + 0.5) / SS) / taille
                    if couvre(x, y, echelle):
                        n += 1
            a = n / (SS * SS)
            row.append(tuple(round(BG[i] + (VERT[i] - BG[i]) * a) for i in range(3)) + (255,))
        rows.append(row)
    return rows


ICONES = os.path.join(os.path.dirname(__file__), '..', 'runa', 'icons')
os.makedirs(ICONES, exist_ok=True)

for nom, taille, echelle in [
    ('icon-192.png', 192, 1.0),
    ('icon-512.png', 512, 1.0),
    ('apple-touch-icon.png', 180, 1.0),
    # Android rogne une icone maskable jusqu'a un cercle de 40 % de rayon :
    # le motif doit tenir dedans, sur un fond qui va jusqu'au bord.
    ('icon-maskable-512.png', 512, 0.72),
]:
    chemin = os.path.join(ICONES, nom)
    write_png(chemin, taille, taille, rendu(taille, echelle))
    print('ecrit', os.path.relpath(chemin), taille, 'px')
