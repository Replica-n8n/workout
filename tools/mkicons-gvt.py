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

COLS, LIGNES = 3, 2                  # les six séries d'un mouvement principal
FAITES = 5                           # cinq cochées, la sixième reste à faire

def dans_carre_arrondi(x, y, l, t, cote, r):
    if not (l <= x < l + cote and t <= y < t + cote):
        return False
    cx = min(max(x, l + r), l + cote - r)
    cy = min(max(y, t + r), t + cote - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def icon(size, pad_ratio):
    pad = size * pad_ratio
    usable = size - 2 * pad
    gap = usable * 0.13
    cote = (usable - (COLS - 1) * gap) / COLS
    # La grille est plus large que haute : on la recentre verticalement.
    hauteur = LIGNES * cote + (LIGNES - 1) * gap
    top0 = (size - hauteur) / 2
    r = cote * 0.26
    trait = cote * 0.15

    cases = []
    for i in range(COLS * LIGNES):
        l = pad + (i % COLS) * (cote + gap)
        t = top0 + (i // COLS) * (cote + gap)
        cases.append((l, t, i < FAITES))

    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            px = BG
            for (l, t, pleine) in cases:
                if dans_carre_arrondi(x + 0.5, y + 0.5, l, t, cote, r):
                    if pleine:
                        px = SKY
                    else:
                        # Case vide : seul le contour est peint.
                        dedans = dans_carre_arrondi(
                            x + 0.5, y + 0.5, l + trait, t + trait,
                            cote - 2 * trait, max(r - trait, 1)
                        )
                        px = BG if dedans else SKY
                    break
            row.append(px)
        rows.append(row)
    return rows

# Lancer depuis workout/gvt/ :  python ../tools/mkicons-gvt.py
for name, size, pad in [
    ('icons/icon-192.png',          192, 0.14),
    ('icons/icon-512.png',          512, 0.14),
    ('icons/icon-maskable-512.png', 512, 0.24),
    ('icons/apple-touch-icon.png',  180, 0.14),
]:
    write_png(name, size, size, icon(size, pad))
    print(name, os.path.getsize(name), 'octets')
