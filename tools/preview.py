#!/usr/bin/env python3
"""Renders layout ops (from tools/dump_ops.js) to PNGs with Pillow.

Mirrors the Kotlin renderer: template ops first, then link labels drawn the
way the Supernote host shows a text link (underlined text inside its box),
then optional ✓ marks so you can see what a synced page looks like.

  python3 tools/preview.py ops.json outdir [--marks]
"""
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
_fonts = {}

def font(size, bold=False):
    k = (size, bold)
    if k not in _fonts:
        _fonts[k] = ImageFont.truetype(FONT_B if bold else FONT, max(1, int(size)))
    return _fonts[k]

def gray(g):
    g = 0 if g is None else int(g)
    return (g, g, g)

def draw_ops(d, ops):
    for o in ops:
        t = o['op']
        if t == 'line':
            c = gray(o.get('gray', 0)); w = int(o['w'])
            if o.get('dash'):
                x1, y1, x2, y2 = o['x1'], o['y1'], o['x2'], o['y2']
                L = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
                n = max(1, int(L / 14)); seg = 1 / n
                for i in range(0, n, 2):
                    a, b = i * seg, min(1, (i + 1) * seg)
                    d.line([(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a), (x1 + (x2 - x1) * b, y1 + (y2 - y1) * b)], fill=c, width=w)
            else:
                d.line([(o['x1'], o['y1']), (o['x2'], o['y2'])], fill=c, width=w)
        elif t == 'rect':
            fill = gray(o['fill']) if o.get('fill') is not None else None
            lw = int(o.get('lw') or 0)
            d.rectangle([o['x'], o['y'], o['x'] + o['w'], o['y'] + o['h']], fill=fill, outline=(0, 0, 0) if lw else None, width=lw)
        elif t == 'text':
            f = font(o['size'], o.get('bold'))
            anchor = {'left': 'la', 'center': 'ma', 'right': 'ra'}[o.get('align', 'left')]
            d.text((o['x'], o['y']), o['text'], font=f, fill=gray(o.get('gray', 0)), anchor=anchor)
        elif t == 'circle':
            r = o['r']
            d.ellipse([o['cx'] - r, o['cy'] - r, o['cx'] + r, o['cy'] + r], outline=(0, 0, 0), width=int(o['lw']))

def draw_link(d, text, rect, size, bold=False):
    f = font(size, bold)
    l, t, r, b = rect['left'], rect['top'], rect['right'], rect['bottom']
    # text vertically centred in box, left-padded like the host
    x = l + 10
    d.text((x, (t + b) / 2), text, font=f, fill=(0, 0, 0), anchor='lm')
    tw = d.textlength(text, font=f)
    d.line([(x, b - 4), (x + tw, b - 4)], fill=(0, 0, 0), width=max(1, size // 14))
    # faint box so the tappable area is visible in previews
    d.rectangle([l, t, r, b], outline=(200, 200, 200), width=1)

def main():
    src, outdir = sys.argv[1], sys.argv[2]
    show_marks = '--marks' in sys.argv
    os.makedirs(outdir, exist_ok=True)
    data = json.load(open(src))
    W, H = data['W'], data['H']
    for p in data['pages']:
        im = Image.new('RGB', (W, H), 'white')
        d = ImageDraw.Draw(im)
        draw_ops(d, p['ops'])
        for lk in p['links']:
            draw_link(d, lk['text'], lk['rect'], lk['fontSize'], lk.get('bold'))
        if show_marks:
            for i, (k, m) in enumerate(sorted(p['marks'].items())):
                if i % 3 == 0:
                    draw_link(d, '✓', m, m['fontSize'])
        path = os.path.join(outdir, f"{p['key']}.png")
        im.save(path)
        print(path, len(p['ops']), 'ops', len(p['links']), 'links', len(p['marks']), 'marks')

if __name__ == '__main__':
    main()
