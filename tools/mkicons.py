import zlib, struct, os

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

BG   = (0x14, 0x15, 0x18, 255)
BAR  = (0xE2, 0x58, 0x2F, 255)
SEQ  = [8, 1, 7, 2, 6, 3, 5, 4]      # la séquence du Croisé, 8 séries

def icon(size, pad_ratio, bg=BG):
    pad = int(size * pad_ratio)
    usable = size - 2 * pad
    n = len(SEQ)
    bar_h = usable * 0.74 / n
    gap   = usable * 0.26 / (n - 1)
    bars = []
    for i, v in enumerate(SEQ):
        top = pad + i * (bar_h + gap)
        bars.append((top, top + bar_h, pad, pad + usable * v / max(SEQ)))
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            px = bg
            for (t, b, l, r) in bars:
                if t <= y < b and l <= x < r:
                    px = BAR
                    break
            row.append(px)
        rows.append(row)
    return rows

# Lancer depuis workout/la-cour/ :  python ../tools/mkicons.py
for name, size, pad in [
    ('icons/icon-192.png',          192, 0.16),
    ('icons/icon-512.png',          512, 0.16),
    ('icons/icon-maskable-512.png', 512, 0.26),
    ('icons/apple-touch-icon.png',  180, 0.16),
]:
    write_png(name, size, size, icon(size, pad))
    print(name, os.path.getsize(name), 'octets')
