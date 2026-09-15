import zlib, struct, os

# Encodeur PNG en Python pur, comme mkicons.py : aucune dépendance à
# installer pour régénérer des icônes.

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

# L'icône reprend l'objet de l'app, le disque de fonte de 45 lb, avec les
# couleurs de gvt.js (DISQUES[0]) : l'ancienne, « GVT » bleu ciel sur marine,
# datait d'avant le thème du code des disques et ne lui ressemblait plus.
FOND  = (0x13, 0x13, 0x15, 255)   # surface sombre du thème
DISQUE = (0x1F, 0x4F, 0xD8, 255)  # DISQUES[0].couleur
FONCE = (0x16, 0x3A, 0x9F, 255)   # DISQUES[0].fonce
ACIER = (0xD9, 0xDC, 0xE1, 255)   # manchon d'acier

import math

def couleur(rr, ang):
    """Couleur à la distance rr du centre (1 = bord du disque), angle en degrés."""
    if rr > 1.0: return FOND
    if rr > 0.93: return FONCE                                 # tranche
    if rr > 0.86:                                              # 24 crans
        return FONCE if abs((ang % 15.0) - 7.5) > 6.3 else DISQUE
    if 0.58 < rr <= 0.62: return FONCE                         # nervure
    if rr > 0.30: return DISQUE
    if rr > 0.15: return ACIER                                 # manchon
    return FOND                                                # trou

SOUS = 4

def icon(size, rayon):
    R = size * rayon
    c = size / 2
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(SOUS):
                for sx in range(SOUS):
                    dx = x + (sx + .5) / SOUS - c
                    dy = y + (sy + .5) / SOUS - c
                    col = couleur(math.hypot(dx, dy) / R, math.degrees(math.atan2(dy, dx)) % 360)
                    for i in range(3): acc[i] += col[i]
            n = SOUS * SOUS
            row.append(tuple(round(v / n) for v in acc) + (255,))
        rows.append(row)
    return rows

# Lancer depuis workout/gvt/ :  python ../tools/mkicons-gvt.py
# Masquable : le disque tient dans la zone sûre (rayon 40 % de l'icône).
for name, size, rayon in [
    ('icons/icon-192.png',          192, 0.44),
    ('icons/icon-512.png',          512, 0.44),
    ('icons/icon-maskable-512.png', 512, 0.36),
    ('icons/apple-touch-icon.png',  180, 0.40),
]:
    write_png(name, size, size, icon(size, rayon))
    print(name, os.path.getsize(name), 'octets')
