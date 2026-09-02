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

BG  = (0x0F, 0x17, 0x2A, 255)
SKY = (0x38, 0xBD, 0xF8, 255)

# Les trois lettres, dessinées en segments épais dans une boîte 0..1.
# Pas de police : une police demanderait une dépendance, et il n'y a que
# trois glyphes à tracer. Les segments qui se rejoignent PARTAGENT leur
# extrémité, sinon les bouts droits laissent une encoche dans chaque angle.
EPAISSEUR = 0.21

LETTRES = {
    'G': [
        ((0.115, 0.115), (0.80, 0.115)),    # barre du haut
        ((0.115, 0.115), (0.115, 0.885)),   # montant gauche
        ((0.115, 0.885), (0.885, 0.885)),   # barre du bas
        ((0.885, 0.515), (0.885, 0.885)),   # montant droit, moitié basse
        ((0.515, 0.515), (0.885, 0.515)),   # la langue du G
    ],
    'V': [
        ((0.085, 0.10), (0.5, 0.885)),
        ((0.915, 0.10), (0.5, 0.885)),
    ],
    'T': [
        ((0.055, 0.115), (0.945, 0.115)),   # barre du haut
        ((0.5, 0.115), (0.5, 0.885)),       # hampe
    ],
}

def sur_segment(px, py, a, b, demi):
    """Distance au segment avec des bouts DROITS : la projection doit tomber
    dans le segment. Des bouts ronds arrondiraient les angles du T."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    long2 = dx * dx + dy * dy
    t = ((px - ax) * dx + (py - ay) * dy) / long2
    if t < 0.0: t = 0.0
    elif t > 1.0: t = 1.0
    cx, cy = ax + t * dx, ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2 <= demi * demi

# 3 sous-échantillons par axe : sans cela les diagonales du V sortent en
# escalier, très visible à 192 px.
SOUS = 3

def icon(size, pad_ratio):
    pad = size * pad_ratio
    utile = size - 2 * pad
    # 3 lettres et 2 gouttières de 10 % d'une lettre.
    lw = utile / 3.2
    gouttiere = 0.10 * lw
    lh = 1.35 * lw
    haut = (size - lh) / 2
    demi = EPAISSEUR / 2

    boites = []
    for i, lettre in enumerate('GVT'):
        gauche = pad + i * (lw + gouttiere)
        boites.append((gauche, gauche + lw, LETTRES[lettre]))

    rows = []
    pas = 1.0 / SOUS
    for y in range(size):
        row = []
        for x in range(size):
            # Rejet par la boîte de la lettre : la grande majorité des pixels
            # est du fond, et ne coûte alors que deux comparaisons.
            couvert = 0
            for (g, d, segments) in boites:
                if x + 1 < g or x > d + 1:
                    continue
                for sy in range(SOUS):
                    py = (y + (sy + 0.5) * pas - haut) / lh
                    if py < 0.0 or py > 1.0:
                        continue
                    for sx in range(SOUS):
                        px = (x + (sx + 0.5) * pas - g) / lw
                        if px < 0.0 or px > 1.0:
                            continue
                        for (a, b) in segments:
                            if sur_segment(px, py, a, b, demi):
                                couvert += 1
                                break
                break
            if couvert == 0:
                row.append(BG)
            elif couvert == SOUS * SOUS:
                row.append(SKY)
            else:
                k = couvert / (SOUS * SOUS)
                row.append(tuple(
                    int(round(BG[i] + (SKY[i] - BG[i]) * k)) for i in range(3)
                ) + (255,))
        rows.append(row)
    return rows

# Lancer depuis workout/gvt/ :  python ../tools/mkicons-gvt.py
for name, size, pad in [
    ('icons/icon-192.png',          192, 0.13),
    ('icons/icon-512.png',          512, 0.13),
    ('icons/icon-maskable-512.png', 512, 0.24),
    ('icons/apple-touch-icon.png',  180, 0.13),
]:
    write_png(name, size, size, icon(size, pad))
    print(name, os.path.getsize(name), 'octets')
