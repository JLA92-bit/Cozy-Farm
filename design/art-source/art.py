"""Cozy Acres brand art generator: returns SVG strings for every brand asset."""
import math, random, re, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------- palette ----------------
SKY = "#8fd3f4"; GRASS = "#7cc85a"; CREAM = "#fff6df"; CREAM2 = "#f7e6bd"
WOOD = "#c98a4b"; WOODD = "#8a5528"; INK = "#3b2a1a"; OUT = "#2d1e10"
GREEN = "#6cc644"; GREEND = "#3f8f22"; BLUE = "#3fa9f5"; BLUED = "#1f6fb8"
YEL = "#ffc93c"; YELD = "#c98f0a"; RED = "#f25f5c"; PURPLE = "#a77bf3"
GOLD = "#ffcd3c"; GEM = "#4fe0d0"


def hx(c):
    c = c.lstrip("#"); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    a, b = hx(a), hx(b)
    return "#%02x%02x%02x" % tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def shade(c, t):
    """t>0 lighten toward white-ish warm, t<0 darken toward outline brown."""
    return mix(c, "#fffbe8", t) if t >= 0 else mix(c, "#2d1e10", -t)


def pts(p):
    return " ".join("%.1f,%.1f" % (x, y) for x, y in p)


def poly(p, fill, stroke=None, sw=0, extra=""):
    s = f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"' if stroke else ""
    return f'<polygon points="{pts(p)}" fill="{fill}"{s} {extra}/>'


# ---------------- text to path ----------------
_fonts = {}


def font(name):
    if name not in _fonts:
        _fonts[name] = TTFont(os.path.join(HERE, "fonts", name))
    return _fonts[name]


def text_path(text, size, x=0, y=0, fname="LilitaOne.ttf", tracking=0.0, anchor="start"):
    """Return (path_d, advance_width, glyph_boxes) for text with baseline at y."""
    f = font(fname); gs = f.getGlyphSet(); cmap = f.getBestCmap(); hmtx = f["hmtx"]
    upm = f["head"].unitsPerEm; s = size / upm
    names = [cmap.get(ord(ch), ".notdef") for ch in text]
    total = sum(hmtx[n][0] * s for n in names) + tracking * size * (len(names) - 1)
    if anchor == "middle": x -= total / 2
    elif anchor == "end": x -= total
    d = []; cx = x; boxes = []
    for ch, n in zip(text, names):
        pen = SVGPathPen(gs)
        gs[n].draw(TransformPen(pen, (s, 0, 0, -s, cx, y)))
        d.append(pen.getCommands())
        adv = hmtx[n][0] * s
        boxes.append((ch, cx, cx + adv))
        cx += adv + tracking * size
    return " ".join(d), total, boxes


def cap_height(size, fname="LilitaOne.ttf"):
    f = font(fname)
    os2 = f["OS/2"]
    ch = getattr(os2, "sCapHeight", 0) or int(f["head"].unitsPerEm * 0.7)
    return ch * size / f["head"].unitsPerEm


# ---------------- primitives ----------------
def rng(seed):
    return random.Random(seed)


LIGHT = (-0.55, -0.83)  # light from upper left


def facet_blob(cx, cy, rx, ry, n, seed, base, jitter=0.12, sw=3, stroke=OUT, center_shift=(-0.18, -0.25), contrast=0.28):
    """Low-poly faceted blob: triangle fan shaded by facing direction."""
    r = rng(seed)
    vs = []
    for i in range(n):
        a = 2 * math.pi * i / n + r.uniform(-0.15, 0.15)
        k = 1 + r.uniform(-jitter, jitter)
        vs.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k))
    c = (cx + center_shift[0] * rx, cy + center_shift[1] * ry)
    out = []
    if stroke:
        out.append(poly(vs, base, stroke, sw))
    for i in range(n):
        a, b = vs[i], vs[(i + 1) % n]
        mx, my = (a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy
        L = math.hypot(mx, my) or 1
        d = (mx * LIGHT[0] + my * LIGHT[1]) / L
        out.append(poly([c, a, b], shade(base, d * contrast), base, 0.6))
    return "".join(out), vs


def island_shape(rx, ry, n, seed, jitter=0.07):
    r = rng(seed)
    vs = []
    for i in range(n):
        a = 2 * math.pi * i / n + r.uniform(-0.08, 0.08)
        k = 1 + r.uniform(-jitter, jitter)
        vs.append((math.cos(a) * rx * k, math.sin(a) * ry * k))
    return vs


def tile(rx, ry, depth, seed, n=18, grass=GRASS, beach=True, water_ring=True, sw=4):
    """A chunky low-poly island tile centred at (0,0). Returns svg."""
    top = island_shape(rx, ry, n, seed)
    o = []
    if water_ring:
        ring = [(x * 1.13, y * 1.18 + depth * 1.1) for x, y in top]
        o.append(poly(ring, "#ffffff", extra='opacity="0.35"'))
    if beach:
        bch = [(x * 1.07, y * 1.1 + depth * 0.75) for x, y in top]
        o.append(poly(bch, "#f3d9a0", OUT, sw))
        # beach facets
        for i in range(n):
            a, b = bch[i], bch[(i + 1) % n]
            if (a[1] + b[1]) / 2 > depth * 0.4:
                o.append(poly([a, b, (b[0] * 0.95, b[1] - depth * 0.2), (a[0] * 0.95, a[1] - depth * 0.2)], "#e8c886", extra='opacity="0.6"'))
    # cliff quads (front half)
    for i in range(n):
        a, b = top[i], top[(i + 1) % n]
        if a[1] + b[1] < -ry * 0.25:
            continue
        ex, ey = b[0] - a[0], b[1] - a[1]
        nx, ny = ey, -ex
        L = math.hypot(nx, ny) or 1
        facing = (nx * 0.6 + ny * -0.2) / L  # light from left
        earth = shade("#a8693a", facing * 0.25 - 0.05)
        q = [a, b, (b[0], b[1] + depth), (a[0], a[1] + depth)]
        o.append(poly(q, earth, OUT, sw))
        band = [a, b, (b[0], b[1] + depth * 0.28), (a[0], a[1] + depth * 0.28)]
        o.append(poly(band, shade("#5aa83f", facing * 0.2), OUT, sw * 0.5))
    # top grass faceted
    o.append(poly(top, grass, OUT, sw))
    r = rng(seed + 7)
    c = (-rx * 0.12, -ry * 0.2)
    for i in range(n):
        a, b = top[i], top[(i + 1) % n]
        t = r.uniform(-0.06, 0.1)
        o.append(poly([c, a, b], shade(grass, t), shade(grass, t), 0.8))
    o.append(poly(top, "none", OUT, sw))
    return "".join(o), top


def cloud(x, y, s=1.0, tint="#ffe2c4", op=1.0):
    parts = [(-60, 0, 38), (-20, -22, 50), (30, -12, 42), (68, 4, 30), (0, 6, 40)]
    o = [f'<g transform="translate({x},{y}) scale({s})" opacity="{op}">']
    for cx, cy, r in parts:
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#fffaf0"/>')
    o.append(f'<rect x="-98" y="10" width="196" height="36" fill="#fffaf0"/>')
    o.append(f'<rect x="-98" y="26" width="196" height="20" fill="{tint}" opacity="0.8"/>')
    o.append('<rect x="-110" y="46" width="230" height="40" fill="url(#skyclip)" opacity="0"/>')
    o.append('</g>')
    return "".join(o)


def cloud_flat(x, y, s=1.0, tint="#ffe2c4", op=1.0, cid="c"):
    """Puffy cloud with flat bottom via clipPath."""
    parts = [(-62, 4, 36), (-22, -20, 50), (30, -10, 42), (70, 8, 30), (2, 6, 42)]
    circ = "".join(f'<circle cx="{cx}" cy="{cy}" r="{r}"/>' for cx, cy, r in parts)
    return (f'<g transform="translate({x},{y}) scale({s})" opacity="{op}">'
            f'<clipPath id="cl{cid}"><rect x="-120" y="-100" width="240" height="128"/></clipPath>'
            f'<g clip-path="url(#cl{cid})"><g fill="#fffaf0">{circ}</g>'
            '</g></g>')


# ---------------- scene objects (local units) ----------------
def house(x, y, s=1.0, glow=True):
    def P(*a):
        return [(x + px * s, y + py * s) for px, py in a]
    sw = 3
    o = []
    # side wall
    o.append(poly(P((75, 0), (165, -30), (165, -125), (75, -95)), "#e6c992", OUT, sw))
    # front wall gable
    o.append(poly(P((-75, 0), (75, 0), (75, -95), (0, -152), (-75, -95)), "#fff1d0", OUT, sw))
    # timber trims
    o.append(poly(P((-75, -95), (75, -95), (75, -88), (-75, -88)), WOOD))
    # chimney
    o.append(poly(P((112, -150), (140, -160), (140, -205), (112, -196)), "#b0563a", OUT, sw))
    o.append(poly(P((106, -196), (146, -210), (146, -218), (106, -204)), "#8f4430", OUT, sw))
    # roof
    o.append(poly(P((-4, -158), (92, -190), (184, -124), (84, -90)), "#e2493f", OUT, sw))
    o.append(poly(P((84, -90), (184, -124), (188, -114), (88, -80)), "#b83430", OUT, sw))
    o.append(poly(P((-90, -86), (-4, -160), (6, -150), (-78, -80)), "#e2493f", OUT, sw))
    # roof shingle lines
    for k in (0.3, 0.6):
        a = (x + (-4 + (84 + 4) * k) * s, y + (-158 + 68 * k) * s)
        b = (x + (92 + (184 - 92) * k) * s, y + (-190 + 66 * k) * s)
        o.append(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="#c23d35" stroke-width="{3*s:.1f}"/>')
    # windows
    win = "#ffd36b" if glow else "#bfe6f7"
    if glow:
        o.append(f'<circle cx="{x}" cy="{y-40*s}" r="{70*s}" fill="url(#warm)" opacity="0.55"/>')
    for wx in (-58, 30):
        o.append(f'<rect x="{x+wx*s}" y="{y-74*s}" width="{28*s}" height="{28*s}" rx="{4*s}" fill="{win}" stroke="{OUT}" stroke-width="{sw}"/>')
        o.append(f'<line x1="{x+(wx+14)*s}" y1="{y-74*s}" x2="{x+(wx+14)*s}" y2="{y-46*s}" stroke="{WOODD}" stroke-width="{2.5*s}"/>')
    o.append(f'<circle cx="{x}" cy="{y-120*s}" r="{11*s}" fill="{win}" stroke="{OUT}" stroke-width="{sw}"/>')
    o.append(poly(P((95, -52), (118, -60), (118, -84), (95, -76)), win, OUT, sw))
    o.append(poly(P((135, -65), (152, -71), (152, -95), (135, -89)), win, OUT, sw))
    # door
    o.append(f'<path d="M{x-14*s},{y} v{-40*s} a{14*s},{14*s} 0 0 1 {28*s},0 v{40*s} z" fill="{WOOD}" stroke="{OUT}" stroke-width="{sw}"/>')
    o.append(f'<circle cx="{x+8*s}" cy="{y-22*s}" r="{2.5*s}" fill="{OUT}"/>')
    # flower boxes
    o.append(f'<rect x="{x-62*s}" y="{y-46*s}" width="{36*s}" height="{8*s}" fill="{WOODD}" stroke="{OUT}" stroke-width="2"/>')
    for i, c in enumerate((RED, YEL, PURPLE, RED)):
        o.append(f'<circle cx="{x+(-58+i*9)*s}" cy="{y-49*s}" r="{4*s}" fill="{c}"/>')
    return "".join(o)


def smoke(x, y, s=1.0):
    o = []
    for i, (dx, dy, r) in enumerate([(0, 0, 12), (10, -26, 16), (-2, -58, 20), (16, -94, 24)]):
        o.append(f'<circle cx="{x+dx*s}" cy="{y+dy*s}" r="{r*s}" fill="#fffaf0" opacity="{0.85-i*0.17:.2f}"/>')
    return "".join(o)


def barn(x, y, s=1.0):
    def P(*a):
        return [(x + px * s, y + py * s) for px, py in a]
    sw = 3; o = []
    o.append(poly(P((80, 0), (185, -32), (185, -122), (80, -90)), "#b23a33", OUT, sw))
    o.append(poly(P((-80, 0), (80, 0), (80, -90), (52, -138), (0, -160), (-52, -138), (-80, -90)), "#d9453e", OUT, sw))
    # roof
    o.append(poly(P((0, -166), (105, -198), (160, -172), (55, -142)), "#7b4b37", OUT, sw))
    o.append(poly(P((55, -142), (160, -172), (192, -120), (86, -88)), "#5f3a2b", OUT, sw))
    o.append(poly(P((-86, -86), (-56, -142), (0, -168), (6, -158), (-48, -134), (-76, -84)), "#7b4b37", OUT, sw))
    # white trims + door
    o.append(f'<rect x="{x-38*s}" y="{y-74*s}" width="{76*s}" height="{74*s}" fill="#b23a33" stroke="{CREAM}" stroke-width="{6*s}"/>')
    o.append(f'<path d="M{x-38*s},{y-74*s} L{x+38*s},{y} M{x+38*s},{y-74*s} L{x-38*s},{y} M{x},{y-74*s} V{y}" stroke="{CREAM}" stroke-width="{5*s}"/>')
    o.append(f'<rect x="{x-38*s}" y="{y-74*s}" width="{76*s}" height="{74*s}" fill="none" stroke="{OUT}" stroke-width="2"/>')
    o.append(f'<rect x="{x-16*s}" y="{y-128*s}" width="{32*s}" height="{28*s}" fill="#ffd36b" stroke="{CREAM}" stroke-width="{5*s}"/>')
    o.append(f'<polyline points="{pts(P((-80,-90),(-52,-138),(0,-160),(52,-138),(80,-90)))}" fill="none" stroke="{CREAM}" stroke-width="{5*s}" stroke-linejoin="round"/>')
    # hay bale peeking
    return "".join(o)


def windmill(x, y, s=1.0, rot=18):
    def P(*a):
        return [(x + px * s, y + py * s) for px, py in a]
    sw = 3; o = []
    o.append(poly(P((-44, 0), (44, 0), (24, -190), (-24, -190)), "#f7e6bd", OUT, sw))
    o.append(poly(P((6, 0), (44, 0), (24, -190), (4, -190)), "#e3c88f"))
    o.append(poly(P((-44, 0), (44, 0), (24, -190), (-24, -190)), "none", OUT, sw))
    o.append(f'<path d="M{x-14*s},{y} v{-30*s} a{14*s},{14*s} 0 0 1 {28*s},0 v{30*s} z" fill="{WOOD}" stroke="{OUT}" stroke-width="{sw}"/>')
    o.append(f'<rect x="{x-9*s}" y="{y-120*s}" width="{18*s}" height="{22*s}" rx="{3*s}" fill="#ffd36b" stroke="{OUT}" stroke-width="{sw}"/>')
    o.append(poly(P((-34, -186), (34, -186), (20, -228), (0, -238), (-20, -228)), "#b83430", OUT, sw))
    hx_, hy_ = x, y - 200 * s
    blades = []
    for k in range(4):
        a = rot + 90 * k
        blades.append(f'<g transform="rotate({a} {hx_} {hy_})">'
                      f'<rect x="{hx_-4*s}" y="{hy_-150*s}" width="{8*s}" height="{150*s}" fill="{WOODD}" stroke="{OUT}" stroke-width="2"/>'
                      f'<rect x="{hx_+4*s}" y="{hy_-146*s}" width="{30*s}" height="{110*s}" fill="{CREAM}" stroke="{OUT}" stroke-width="{sw}"/>'
                      + "".join(f'<line x1="{hx_+4*s}" y1="{hy_-(146-22*i)*s}" x2="{hx_+34*s}" y2="{hy_-(146-22*i)*s}" stroke="{WOOD}" stroke-width="2"/>' for i in range(1, 5))
                      + '</g>')
    o.append("".join(blades))
    o.append(f'<circle cx="{hx_}" cy="{hy_}" r="{11*s}" fill="{WOOD}" stroke="{OUT}" stroke-width="{sw}"/>')
    return "".join(o)


def tree(x, y, s=1.0, seed=1, fruit=RED, base="#5fb043"):
    o = [poly([(x - 9 * s, y), (x + 9 * s, y), (x + 6 * s, y - 50 * s), (x - 6 * s, y - 50 * s)], "#8a5528", OUT, 3)]
    blob, vs = facet_blob(x, y - 78 * s, 56 * s, 50 * s, 9, seed, base, sw=3)
    o.append(blob)
    if fruit:
        r = rng(seed + 3)
        for _ in range(5):
            a = r.uniform(0, 2 * math.pi); d = r.uniform(0.2, 0.75)
            fx, fy = x + math.cos(a) * 44 * s * d, y - 78 * s + math.sin(a) * 38 * s * d
            o.append(f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="{6*s:.1f}" fill="{fruit}" stroke="{OUT}" stroke-width="1.5"/>')
            o.append(f'<circle cx="{fx-2*s:.1f}" cy="{fy-2*s:.1f}" r="{1.8*s:.1f}" fill="#fff" opacity=".7"/>')
    return "".join(o)


def pine(x, y, s=1.0):
    o = [f'<rect x="{x-6*s}" y="{y-22*s}" width="{12*s}" height="{22*s}" fill="{WOODD}" stroke="{OUT}" stroke-width="3"/>']
    for i, (w, h, yy) in enumerate([(46, 50, 18), (38, 46, 50), (28, 40, 80)]):
        top = (x, y - (yy + h) * s)
        L = (x - w * s, y - yy * s); R = (x + w * s, y - yy * s)
        o.append(poly([top, L, R], "#3f9a4a", OUT, 3))
        o.append(poly([top, (x, y - yy * s), R], "#2f7c3c"))
        o.append(poly([top, L, R], "none", OUT, 3))
    return "".join(o)


def bush(x, y, s=1.0, seed=3, flowers=True):
    b, _ = facet_blob(x, y - 16 * s, 30 * s, 20 * s, 7, seed, "#58aa45", sw=3)
    o = [b]
    if flowers:
        r = rng(seed)
        for _ in range(4):
            o.append(f'<circle cx="{x+r.uniform(-20,20)*s:.1f}" cy="{y-r.uniform(8,28)*s:.1f}" r="{3.5*s:.1f}" fill="{r.choice([RED, YEL, CREAM, PURPLE])}"/>')
    return "".join(o)


def flower(x, y, c, s=1.0):
    return (f'<line x1="{x}" y1="{y}" x2="{x}" y2="{y-12*s}" stroke="#3f8f22" stroke-width="{2*s}"/>'
            + "".join(f'<circle cx="{x+math.cos(a)*4*s:.1f}" cy="{y-12*s+math.sin(a)*4*s:.1f}" r="{3.2*s:.1f}" fill="{c}"/>' for a in [0, 1.26, 2.51, 3.77, 5.03])
            + f'<circle cx="{x}" cy="{y-12*s}" r="{2.2*s}" fill="{YEL if c != YEL else "#e08a1e"}"/>')


def rock(x, y, s=1.0, seed=5):
    b, _ = facet_blob(x, y - 10 * s, 18 * s, 12 * s, 6, seed, "#a9a196", sw=2.5)
    return b


def wheat_tuft(x, y, s=1.0, c1="#f2c14e", c2="#d99a2b"):
    o = []
    for dx, h, ang in ((-6, 30, -10), (0, 36, 0), (6, 30, 10)):
        tx = x + dx * s + math.sin(math.radians(ang)) * h * s; ty = y - h * s
        o.append(f'<line x1="{x+dx*s*0.4:.1f}" y1="{y}" x2="{tx:.1f}" y2="{ty:.1f}" stroke="{c2}" stroke-width="{2.4*s:.1f}" stroke-linecap="round"/>')
        o.append(f'<ellipse cx="{tx:.1f}" cy="{ty:.1f}" rx="{3.6*s:.1f}" ry="{8*s:.1f}" fill="{c1}" stroke="{c2}" stroke-width="1.2" transform="rotate({ang} {tx:.1f} {ty:.1f})"/>')
    return "".join(o)


def field(x0, y0, w, h, skew, kind="wheat", rows=4, cols=7, s=1.0):
    """Tilled plot as parallelogram; x0,y0 = back-left corner."""
    p = [(x0, y0), (x0 + w, y0), (x0 + w + skew, y0 + h), (x0 + skew, y0 + h)]
    o = [poly([(a, b + 10) for a, b in p], "#7a4a28", OUT, 3), poly(p, "#9b6a3c", OUT, 3)]
    for r_ in range(rows):
        t = (r_ + 0.5) / rows
        a = (x0 + skew * t, y0 + h * t); b = (x0 + w + skew * t, y0 + h * t)
        o.append(f'<line x1="{a[0]+6:.1f}" y1="{a[1]+4:.1f}" x2="{b[0]-6:.1f}" y2="{b[1]+4:.1f}" stroke="#7d5230" stroke-width="5" stroke-linecap="round"/>')
    for r_ in range(rows):
        t = (r_ + 0.5) / rows
        for c in range(cols):
            u = (c + 0.5) / cols
            px = x0 + skew * t + w * u; py = y0 + h * t + 2
            if kind == "wheat":
                o.append(wheat_tuft(px, py, s))
            elif kind == "carrot":
                o.append(f'<path d="M{px},{py} q-8,-14 -4,-22 M{px},{py} q0,-16 2,-24 M{px},{py} q8,-12 8,-20" stroke="#4fa83a" stroke-width="4" fill="none" stroke-linecap="round"/>'
                         f'<ellipse cx="{px}" cy="{py+1}" rx="5" ry="3" fill="#f08a2c"/>')
            else:
                o.append(f'<path d="M{px},{py} q-10,-6 -12,-16 q8,0 12,12 q2,-12 12,-14 q-2,10 -12,18" fill="#7cc85a" stroke="#3f8f22" stroke-width="1.5"/>')
    return "".join(o)


def fence(x0, y0, x1, y1, n, s=1.0):
    o = []
    for k in (0.35, 0.7):
        o.append(f'<line x1="{x0}" y1="{y0-26*s*k-6}" x2="{x1}" y2="{y1-26*s*k-6}" stroke="{OUT}" stroke-width="{7*s}" stroke-linecap="round"/>'
                 f'<line x1="{x0}" y1="{y0-26*s*k-6}" x2="{x1}" y2="{y1-26*s*k-6}" stroke="{WOOD}" stroke-width="{4*s}" stroke-linecap="round"/>')
    for i in range(n + 1):
        t = i / n; px = x0 + (x1 - x0) * t; py = y0 + (y1 - y0) * t
        o.append(f'<rect x="{px-4*s}" y="{py-36*s}" width="{8*s}" height="{36*s}" rx="{2*s}" fill="{WOOD}" stroke="{OUT}" stroke-width="2.5"/>')
    return "".join(o)


def chicken(x, y, s=1.0, flip=False, body="#fffaf0", sw=2.5):
    f = -1 if flip else 1
    g = [f'<g transform="translate({x},{y}) scale({f*s},{s})">']
    g.append(f'<line x1="-5" y1="-8" x2="-6" y2="0" stroke="#f08a2c" stroke-width="2.6" stroke-linecap="round"/>'
             f'<line x1="5" y1="-8" x2="6" y2="0" stroke="#f08a2c" stroke-width="2.6" stroke-linecap="round"/>')
    g.append(f'<path d="M-24,-26 l-8,-14 l12,6 l2,-10 l8,12 z" fill="{body}" stroke="{OUT}" stroke-width="{sw}" stroke-linejoin="round"/>')
    g.append(f'<ellipse cx="0" cy="-20" rx="21" ry="15" fill="{body}" stroke="{OUT}" stroke-width="{sw}"/>')
    g.append(f'<path d="M-8,-22 q8,8 16,0" fill="none" stroke="#e8d9b8" stroke-width="3" stroke-linecap="round"/>')
    g.append(f'<circle cx="14" cy="-36" r="10" fill="{body}" stroke="{OUT}" stroke-width="{sw}"/>')
    g.append(f'<rect x="4" y="-36" width="20" height="10" fill="{body}"/>')
    g.append(f'<path d="M8,-44 q2,-8 6,-4 q2,-8 6,-2 q4,-4 4,4 z" fill="{RED}" stroke="{OUT}" stroke-width="{sw*0.8}" stroke-linejoin="round"/>')
    g.append(f'<path d="M23,-37 l8,3 l-8,3 z" fill="{YEL}" stroke="{OUT}" stroke-width="{sw*0.7}" stroke-linejoin="round"/>')
    g.append(f'<path d="M22,-31 q2,6 -2,7 q-2,-3 2,-7z" fill="{RED}"/>')
    g.append(f'<circle cx="17" cy="-38" r="2" fill="{OUT}"/>')
    g.append('</g>')
    return "".join(g)


def cow(x, y, s=1.0, flip=False):
    f = -1 if flip else 1
    sw = 2.5
    return (f'<g transform="translate({x},{y}) scale({f*s},{s})">'
            + "".join(f'<rect x="{lx}" y="-18" width="9" height="18" rx="3" fill="#fffaf0" stroke="{OUT}" stroke-width="{sw}"/><rect x="{lx}" y="-5" width="9" height="5" rx="2" fill="{INK}"/>' for lx in (-30, -18, 12, 24))
            + f'<path d="M-36,-40 q-10,6 -8,22" stroke="{OUT}" stroke-width="3" fill="none" stroke-linecap="round"/>'
            f'<rect x="-38" y="-52" width="76" height="38" rx="16" fill="#fffaf0" stroke="{OUT}" stroke-width="{sw}"/>'
            f'<path d="M-24,-52 q10,10 0,22 q-12,2 -14,-10 v-6 q2,-6 14,-6z" fill="#5a3a24"/>'
            f'<ellipse cx="12" cy="-30" rx="10" ry="8" fill="#5a3a24"/>'
            f'<rect x="-38" y="-52" width="76" height="38" rx="16" fill="none" stroke="{OUT}" stroke-width="{sw}"/>'
            f'<ellipse cx="0" cy="-14" rx="7" ry="4" fill="#f7b0a8" stroke="{OUT}" stroke-width="1.5"/>'
            f'<path d="M30,-62 l-4,-8 M46,-62 l4,-8" stroke="{CREAM2}" stroke-width="4" stroke-linecap="round"/>'
            f'<ellipse cx="24" cy="-58" rx="7" ry="4" fill="#fffaf0" stroke="{OUT}" stroke-width="2"/>'
            f'<ellipse cx="54" cy="-58" rx="7" ry="4" fill="#fffaf0" stroke="{OUT}" stroke-width="2"/>'
            f'<rect x="26" y="-66" width="26" height="30" rx="11" fill="#fffaf0" stroke="{OUT}" stroke-width="{sw}"/>'
            f'<rect x="27" y="-48" width="24" height="14" rx="7" fill="#f7b0a8" stroke="{OUT}" stroke-width="2"/>'
            f'<circle cx="34" cy="-41" r="1.6" fill="{OUT}"/><circle cx="44" cy="-41" r="1.6" fill="{OUT}"/>'
            f'<circle cx="33" cy="-56" r="2.2" fill="{OUT}"/><circle cx="45" cy="-56" r="2.2" fill="{OUT}"/>'
            '</g>')


def sheep(x, y, s=1.0, flip=False):
    f = -1 if flip else 1
    puffs = [(-20, -30, 13), (-6, -38, 14), (10, -36, 13), (20, -26, 12), (-22, -18, 11), (0, -20, 15), (14, -16, 11)]
    o = [f'<g transform="translate({x},{y}) scale({f*s},{s})">']
    for lx in (-14, -4, 8, 16):
        o.append(f'<rect x="{lx}" y="-14" width="6" height="14" rx="2" fill="{INK}"/>')
    o.append("".join(f'<circle cx="{cx}" cy="{cy}" r="{r+2.5}" fill="{OUT}"/>' for cx, cy, r in puffs))
    o.append("".join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{CREAM}"/>' for cx, cy, r in puffs))
    o.append(f'<ellipse cx="28" cy="-34" rx="11" ry="13" fill="{INK}" stroke="{OUT}" stroke-width="2"/>'
             f'<ellipse cx="19" cy="-40" rx="7" ry="4" fill="{INK}" transform="rotate(-25 19 -40)"/>'
             f'<circle cx="30" cy="-37" r="2.4" fill="#fff"/><circle cx="26" cy="-46" r="6" fill="{CREAM}"/>')
    o.append('</g>')
    return "".join(o)


def pig(x, y, s=1.0, flip=False):
    f = -1 if flip else 1
    pk = "#f7a7b0"
    return (f'<g transform="translate({x},{y}) scale({f*s},{s})">'
            + "".join(f'<rect x="{lx}" y="-14" width="8" height="14" rx="3" fill="{pk}" stroke="{OUT}" stroke-width="2"/>' for lx in (-20, -8, 6, 16))
            + f'<path d="M-30,-30 q-8,-4 -6,-10" stroke="{OUT}" stroke-width="2.5" fill="none"/>'
            f'<ellipse cx="0" cy="-26" rx="30" ry="18" fill="{pk}" stroke="{OUT}" stroke-width="2.5"/>'
            f'<path d="M14,-46 l4,-10 l8,8z" fill="#ee8e9a" stroke="{OUT}" stroke-width="2" stroke-linejoin="round"/>'
            f'<ellipse cx="30" cy="-26" rx="8" ry="9" fill="#ee8e9a" stroke="{OUT}" stroke-width="2"/>'
            f'<circle cx="28" cy="-27" r="1.6" fill="{OUT}"/><circle cx="32" cy="-25" r="1.6" fill="{OUT}"/>'
            f'<circle cx="20" cy="-34" r="2.2" fill="{OUT}"/>'
            '</g>')


def dock(x, y, s=1.0):
    o = []
    planks = 7
    for i in range(planks):
        t0 = i / planks; t1 = (i + 1) / planks
        def at(t, side):
            return (x + 150 * t * s + side * 26 * s, y + 90 * t * s - side * 6 * s)
        p = [at(t0, -1), at(t0, 1), at(t1 - 0.01, 1), at(t1 - 0.01, -1)]
        o.append(poly(p, WOOD if i % 2 else "#d39a5c", OUT, 2.5))
    for t in (0.3, 0.95):
        for side in (-1, 1):
            px = x + 150 * t * s + side * 26 * s; py = y + 90 * t * s - side * 6 * s
            o.append(f'<rect x="{px-4*s}" y="{py-6*s}" width="{8*s}" height="{26*s}" fill="{WOODD}" stroke="{OUT}" stroke-width="2"/>')
    return "".join(o)


def boat(x, y, s=1.0):
    return (f'<g transform="translate({x},{y}) scale({s}) rotate(-12)">'
            f'<ellipse cx="0" cy="10" rx="62" ry="10" fill="#ffffff" opacity=".35"/>'
            f'<path d="M-56,-8 q56,10 112,0 l-12,18 q-44,10 -88,0 z" fill="{BLUE}" stroke="{OUT}" stroke-width="3" stroke-linejoin="round"/>'
            f'<path d="M-56,-8 q56,10 112,0 q-56,-10 -112,0z" fill="#a8693a" stroke="{OUT}" stroke-width="3"/>'
            f'<path d="M-46,-6 q46,7 92,0 q-46,-6 -92,0z" fill="#7a4a28"/>'
            f'<line x1="-20" y1="-4" x2="20" y2="-4" stroke="{WOOD}" stroke-width="6"/>'
            f'<line x1="-10" y1="-10" x2="-60" y2="16" stroke="{WOODD}" stroke-width="4" stroke-linecap="round"/>'
            f'<line x1="10" y1="-10" x2="62" y2="18" stroke="{WOODD}" stroke-width="4" stroke-linecap="round"/>'
            '</g>')


def haybale(x, y, s=1.0):
    return (f'<g transform="translate({x},{y}) scale({s})">'
            f'<rect x="-22" y="-26" width="44" height="26" rx="6" fill="#f2c14e" stroke="{OUT}" stroke-width="2.5"/>'
            f'<line x1="-8" y1="-26" x2="-8" y2="0" stroke="{YELD}" stroke-width="3"/><line x1="8" y1="-26" x2="8" y2="0" stroke="{YELD}" stroke-width="3"/>'
            '</g>')


def well(x, y, s=1.0):
    return (f'<g transform="translate({x},{y}) scale({s})">'
            f'<rect x="-22" y="-26" width="44" height="26" rx="4" fill="#a9a196" stroke="{OUT}" stroke-width="2.5"/>'
            f'<rect x="-20" y="-60" width="5" height="36" fill="{WOOD}" stroke="{OUT}" stroke-width="1.5"/><rect x="15" y="-60" width="5" height="36" fill="{WOOD}" stroke="{OUT}" stroke-width="1.5"/>'
            f'<path d="M-30,-56 L0,-76 L30,-56z" fill="#e2493f" stroke="{OUT}" stroke-width="2.5" stroke-linejoin="round"/></g>')


def defs(extra=""):
    return ('<defs>'
            '<radialGradient id="warm"><stop offset="0" stop-color="#ffe08a" stop-opacity=".9"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="sunglow"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#ffe38a" stop-opacity=".75"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="fly"><stop offset="0" stop-color="#fffbd0"/><stop offset=".3" stop-color="#fff07a" stop-opacity=".9"/><stop offset="1" stop-color="#ffe14a" stop-opacity="0"/></radialGradient>'
            + extra + '</defs>')


def island_world(seed=11, big_animals=False, fireflies=0):
    """Full farm island in local coordinates (centre 0,0, width ~1500)."""
    rx, ry, depth = 700, 210, 46
    t, top = tile(rx, ry, depth, seed, n=22)
    items = []  # (sort_y, svg)
    # sandy path house -> dock
    path = f'<path d="M60,-70 C40,0 160,40 300,70 S470,120 520,150" stroke="#e8c886" stroke-width="34" fill="none" stroke-linecap="round" opacity=".95"/>' \
           f'<path d="M60,-70 C40,0 160,40 300,70 S470,120 520,150" stroke="#f3d9a0" stroke-width="24" fill="none" stroke-linecap="round"/>'
    items.append((-999, path))
    items.append((-150, pine(-610, -40, 0.9)))
    items.append((-160, tree(-520, -120, 0.95, seed=4, fruit=RED)))
    items.append((-150, windmill(-345, -110, 0.95)))
    items.append((-130, house(0, -70, 1.0)))
    items.append((-129, smoke(126 * 1.0, -70 - 225, 1.0)))
    items.append((-120, barn(300, -60, 0.95)))
    items.append((-150, tree(520, -110, 0.9, seed=9, fruit="#f08a2c")))
    items.append((-140, pine(610, -40, 0.85)))
    items.append((-60, haybale(200, -40, 0.9)))
    items.append((-55, haybale(232, -30, 0.8)))
    items.append((-80, well(-150, -50, 0.9)))
    items.append((-100, tree(-210, -100, 0.7, seed=21, fruit=RED)))
    # fields
    items.append((-30, field(-560, -40, 300, 120, -40, "wheat", rows=4, cols=7)))
    items.append((90, field(-330, 70, 190, 90, -30, "carrot", rows=3, cols=5)))
    items.append((60, field(-110, 50, 160, 80, -24, "sprout", rows=3, cols=4)))
    # animal pen
    items.append((10, fence(170, 20, 470, 20, 6)))
    items.append((40, chicken(220, 60, 0.9)))
    items.append((45, chicken(262, 76, 0.85, flip=True, body="#f2c14e")))
    items.append((48, chicken(300, 52, 0.8)))
    items.append((70, cow(390, 98, 0.95, flip=True)))
    items.append((55, sheep(470, 70, 0.95)))
    items.append((95, pig(560, 120, 0.85)))
    items.append((150, fence(150, 170, 380, 190, 5)))
    # front details
    for i, (fx, fy, c) in enumerate([(-600, 70, RED), (-585, 88, YEL), (-560, 120, CREAM), (-450, 150, PURPLE), (-420, 165, RED),
                                     (-60, 170, YEL), (-30, 180, RED), (100, 160, CREAM), (130, 175, PURPLE), (620, 30, RED), (640, 50, YEL),
                                     (-660, 0, PURPLE), (40, 40, RED), (70, 52, YEL), (-20, -20, CREAM)]):
        items.append((fy, flower(fx, fy, c)))
    items.append((140, bush(-200, 150, 1.0, seed=31)))
    items.append((100, bush(640, 110, 0.9, seed=33)))
    items.append((165, rock(-120, 190, 1.2, seed=8)))
    items.append((120, rock(600, 150, 0.9, seed=12)))
    items.append((20, tree(80, 30, 0.6, seed=41, fruit=RED)))
    if big_animals:
        items.append((210, chicken(470, 215, 1.8, flip=True)))
        items.append((215, sheep(590, 215, 1.6, flip=True)))
    items.sort(key=lambda a: a[0])
    o = [t] + [s for _, s in items]
    # dock + boat at front right
    o.append(dock(560, 190, 1.0))
    o.append(boat(780, 280, 0.95))
    if fireflies:
        r = rng(99)
        for _ in range(fireflies):
            o.append(f'<circle cx="{r.uniform(-650,650):.0f}" cy="{r.uniform(-260,120):.0f}" r="{r.uniform(7,13):.0f}" fill="url(#fly)"/>')
    return "".join(o)


def sky_bg(W, H, horizon, mode="golden"):
    if mode == "golden":
        stops = [(0, "#8fd3f4"), (0.45, "#bfe3ee"), (0.75, "#ffd9a0"), (1, "#ffbf80")]
    elif mode == "dusk":
        stops = [(0, "#5b6fb8"), (0.5, "#b58bc9"), (0.8, "#ffb38a"), (1, "#ffcf8a")]
    else:
        stops = [(0, "#79c8f0"), (0.6, "#8fd3f4"), (1, "#d6f0fb")]
    g = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return (f'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="{horizon}" gradientUnits="userSpaceOnUse">{g}</linearGradient>'
            f'<linearGradient id="sea" x1="0" y1="{horizon}" x2="0" y2="{H}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="#7fc6ec"/><stop offset=".25" stop-color="{BLUE}"/><stop offset="1" stop-color="#2a86d0"/></linearGradient>')


def scene(W, H, ix, iy, iscale, horizon, sun=(0.75, 0.0), mode="golden", clouds=None, big_animals=False,
          fireflies=0, overlay="", seed=11, birds=True):
    """Farm island at sea. ix,iy = island centre in px; iscale = scale."""
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         defs(sky_bg(W, H, horizon, mode)),
         f'<rect width="{W}" height="{horizon+2}" fill="url(#sky)"/>']
    sx, sy = sun
    sxp, syp = W * sx, horizon * (0.55 + sy)
    o.append(f'<circle cx="{sxp}" cy="{syp}" r="{H*0.45}" fill="url(#sunglow)"/>')
    o.append(f'<circle cx="{sxp}" cy="{syp}" r="{H*0.085}" fill="#ffe9a0"/><circle cx="{sxp}" cy="{syp}" r="{H*0.07}" fill="#fff6cf"/>')
    # far hills on horizon
    o.append(f'<path d="M0,{horizon} Q{W*0.12},{horizon-H*0.05} {W*0.25},{horizon} Q{W*0.4},{horizon-H*0.035} {W*0.55},{horizon} Z" fill="#a6c9a0" opacity=".7"/>')
    o.append(f'<path d="M{W*0.6},{horizon} Q{W*0.8},{horizon-H*0.06} {W},{horizon-H*0.01} V{horizon} Z" fill="#a6c9a0" opacity=".6"/>')
    for i, (cx, cy, cs) in enumerate(clouds or []):
        o.append(cloud_flat(W * cx, H * cy, cs * H / 600, cid=f"{i}"))
    if birds:
        for bx, by, bs in ((0.3, 0.14, 1), (0.33, 0.12, 0.8), (0.36, 0.16, 0.7)):
            px, py = W * bx, H * by; k = bs * H / 600 * 8
            o.append(f'<path d="M{px-k},{py-k*0.4} q{k*0.5},{k*0.6} {k},0 q{k*0.5},{-k*0.6} {k},0" stroke="{INK}" stroke-width="{max(1.5,k*0.28):.1f}" fill="none" stroke-linecap="round" opacity=".7"/>')
    o.append(f'<rect y="{horizon}" width="{W}" height="{H-horizon}" fill="url(#sea)"/>')
    # sun reflection + sparkles
    for k in range(6):
        yy = horizon + 6 + k * (H - horizon) * 0.035; ww = W * (0.07 - k * 0.008)
        o.append(f'<rect x="{sxp-ww/2:.0f}" y="{yy:.0f}" width="{ww:.0f}" height="{max(3,H*0.006):.0f}" rx="3" fill="#fff3b8" opacity="{0.6-k*0.08:.2f}"/>')
    r = rng(5)
    for _ in range(int(W * H / 30000) + 6):
        px = r.uniform(0, W); py = r.uniform(horizon + 8, H)
        L = (py - horizon) / (H - horizon + 1) * H * 0.03 + 4
        o.append(f'<path d="M{px:.0f},{py:.0f} h{L:.0f}" stroke="#ffffff" stroke-width="{max(2,L*0.18):.1f}" stroke-linecap="round" opacity=".55"/>')
    o.append(f'<g transform="translate({ix},{iy}) scale({iscale})">{island_world(seed, big_animals, fireflies)}</g>')
    if mode in ("golden", "dusk"):
        o.append(f'<rect width="{W}" height="{H}" fill="#ffb060" opacity=".08"/>')
    o.append(overlay)
    o.append('</svg>')
    return "".join(o)


# ---------------- logo ----------------
def sprout(x, y, s=1.0, sw=None):
    sw = sw or 8 * s
    return (f'<g transform="translate({x},{y}) scale({s})">'
            f'<path d="M0,0 C0,-14 2,-26 0,-40" stroke="{OUT}" stroke-width="{18}" fill="none" stroke-linecap="round"/>'
            f'<path d="M0,-34 C-10,-62 -46,-70 -62,-56 C-50,-30 -18,-26 0,-34Z" fill="{GREEN}" stroke="{OUT}" stroke-width="10" stroke-linejoin="round"/>'
            f'<path d="M0,-38 C8,-74 46,-86 66,-70 C54,-40 20,-32 0,-38Z" fill="{GRASS}" stroke="{OUT}" stroke-width="10" stroke-linejoin="round"/>'
            f'<path d="M0,0 C0,-14 2,-26 0,-40" stroke="{GREEND}" stroke-width="8" fill="none" stroke-linecap="round"/>'
            f'<path d="M-46,-58 C-34,-56 -20,-48 -10,-40" stroke="#a4e07f" stroke-width="5" fill="none" stroke-linecap="round"/>'
            f'<path d="M50,-72 C34,-66 20,-56 10,-44" stroke="#b6ea8f" stroke-width="5" fill="none" stroke-linecap="round"/>'
            '</g>')


def sun_disc(x, y, r, sw=12, rays=True):
    o = [f'<g transform="translate({x},{y})">']
    if rays:
        for k in range(10):
            a = k * 36
            o.append(f'<rect x="-9" y="{-r-34}" width="18" height="26" rx="9" fill="{YEL}" stroke="{OUT}" stroke-width="{sw*0.7}" transform="rotate({a})"/>')
    o.append(f'<circle r="{r}" fill="{YEL}" stroke="{OUT}" stroke-width="{sw}"/>')
    o.append(f'<circle r="{r*0.72}" fill="#ffdb6e"/>')
    o.append(f'<path d="M{-r*0.55},{-r*0.25} a{r*0.6},{r*0.6} 0 0 1 {r*0.45},{-r*0.4}" stroke="#fff3c4" stroke-width="{r*0.12}" fill="none" stroke-linecap="round"/>')
    o.append('</g>')
    return "".join(o)


def wordmark_layers(lines, size, variant="full", sun=True):
    """Builds chunky text layers. lines = [(text, x, y, anchor, fill)]. Returns svg body and bbox."""
    ow = size * 0.16  # outline width
    sh = size * 0.075  # drop depth
    paths = []
    boxes_all = []
    minx, maxx = 1e9, -1e9
    for text, x, y, anchor, fillc in lines:
        d, w, boxes = text_path(text, size, x, y, tracking=0.02, anchor=anchor)
        paths.append((d, fillc))
        boxes_all.append(boxes)
        minx = min(minx, boxes[0][1]); maxx = max(maxx, boxes[-1][2])
    o = []
    if variant == "dark":
        for d, _ in paths:
            o.append(f'<path d="{d}" transform="translate(0,{sh})" fill="{CREAM}" stroke="{CREAM}" stroke-width="{ow+size*0.1}" stroke-linejoin="round"/>')
            o.append(f'<path d="{d}" fill="{CREAM}" stroke="{CREAM}" stroke-width="{ow+size*0.1}" stroke-linejoin="round"/>')
    for d, _ in paths:
        o.append(f'<path d="{d}" transform="translate(0,{sh})" fill="{OUT}" stroke="{OUT}" stroke-width="{ow}" stroke-linejoin="round"/>')
    for d, _ in paths:
        o.append(f'<path d="{d}" fill="{OUT}" stroke="{OUT}" stroke-width="{ow}" stroke-linejoin="round"/>')
    for d, f in paths:
        o.append(f'<path d="{d}" fill="{f}"/>')
    # inner bottom shading for 3D feel
    for d, f in paths:
        o.append(f'<path d="{d}" fill="url(#lgshade)" />')
    return o, boxes_all, ow, sh


def logo_svg(variant="full", stacked=False):
    size = 200
    if variant == "light":
        fills = ["url(#lggreen)", "url(#lgyel)"]
    else:
        fills = ["url(#lgcream)", "url(#lgcream)"]
    capH = cap_height(size)
    if not stacked:
        d1, w1, _ = text_path("Cozy ", size, 0, 0, tracking=0.02)
        lines = [("Cozy", 0, 0, "start", fills[0]), ("Acres", w1, 0, "start", fills[1])]
    else:
        lines = [("Cozy", 0, 0, "middle", fills[0]), ("Acres", 0, size * 0.92, "middle", fills[1])]
    layers, boxes, ow, sh = wordmark_layers(lines, size, variant)
    # sprout on "A"
    A = boxes[0][1] if stacked else boxes[1][0]
    ax = (A[1] + A[2]) / 2
    ay = (lines[0][2] - capH * 0.62 if stacked else lines[1][2] - capH) - ow * 0.2
    extra_back = []
    extra_front = [sprout(ax + 2, ay + 6, 1.15)]
    if variant in ("full", "dark") or stacked:
        if stacked:
            sx_ = boxes[0][-1][2] + 40; sy_ = -capH - 10
        else:
            sx_ = boxes[1][-1][2] - 10; sy_ = -capH - 18
        extra_back.append(sun_disc(sx_, sy_, 46, sw=12))
    minx = min(b[0][1] for b in boxes) - ow - 20
    maxx = max(b[-1][2] for b in boxes) + ow + 20
    top = -capH - 130
    bottom = lines[-1][2] + size * 0.28 + sh
    if variant in ("full", "dark") or stacked:
        maxx = max(maxx, (sx_ + 90) if True else maxx)
    pad = 24
    vb = (minx - pad, top - pad, maxx - minx + 2 * pad, bottom - top + 2 * pad)
    if stacked:
        side = max(vb[2], vb[3])
        cx = vb[0] + vb[2] / 2; cy = vb[1] + vb[3] / 2
        vb = (cx - side / 2, cy - side / 2, side, side)
    df = ('<defs>'
          f'<linearGradient id="lgcream" x1="0" y1="{-capH}" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffdf4"/><stop offset=".55" stop-color="{CREAM}"/><stop offset="1" stop-color="{CREAM2}"/></linearGradient>'
          f'<linearGradient id="lggreen" x1="0" y1="{-capH}" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9ee07a"/><stop offset="1" stop-color="{GREEN}"/></linearGradient>'
          f'<linearGradient id="lgyel" x1="0" y1="{lines[1][2]-capH}" x2="0" y2="{lines[1][2]}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe07a"/><stop offset="1" stop-color="{YEL}"/></linearGradient>'
          '<linearGradient id="lgshade" x1="0" y1="0" x2="0" y2="1"><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#8a5528" stop-opacity=".18"/></linearGradient>'
          '</defs>')
    body = "".join(extra_back) + "".join(layers) + "".join(extra_front)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.1f} {vb[1]:.1f} {vb[2]:.1f} {vb[3]:.1f}">'
            f'<title>Cozy Acres</title>{df}{body}</svg>'), vb


def logo_group(variant="full", x=0, y=0, width=500, stacked=False):
    """Embed a logo inside another svg at x,y (top-left) with given width. Returns (svg, height)."""
    svg, vb = logo_svg(variant, stacked)
    inner = re.sub(r'^<svg[^>]*>', '', svg).replace('</svg>', '')
    # make ids unique-ish
    tag = f"l{abs(hash((variant, x, y, width))) % 10000}"
    for idn in ("lgcream", "lggreen", "lgyel", "lgshade"):
        inner = inner.replace(f'id="{idn}"', f'id="{idn}{tag}"').replace(f'url(#{idn})', f'url(#{idn}{tag})')
    h = width * vb[3] / vb[2]
    return (f'<svg x="{x}" y="{y}" width="{width}" height="{h:.1f}" viewBox="{vb[0]:.1f} {vb[1]:.1f} {vb[2]:.1f} {vb[3]:.1f}">{inner}</svg>'), h


def candy_button(x, y, w, h, label, color=GREEN, dark=GREEND, size=None):
    size = size or h * 0.48
    d, tw, _ = text_path(label, size, x + w / 2, y + h * 0.5 + size * 0.36 - h * 0.04, anchor="middle")
    r = h * 0.3
    return (f'<rect x="{x}" y="{y+h*0.1}" width="{w}" height="{h}" rx="{r}" fill="{OUT}"/>'
            f'<rect x="{x+3}" y="{y+3}" width="{w-6}" height="{h-6+h*0.08}" rx="{r}" fill="{dark}"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h*0.9}" rx="{r}" fill="none" stroke="{OUT}" stroke-width="{h*0.07}"/>'
            f'<rect x="{x+h*0.035}" y="{y+h*0.035}" width="{w-h*0.07}" height="{h*0.83}" rx="{r*0.9}" fill="{color}"/>'
            f'<rect x="{x+h*0.15}" y="{y+h*0.12}" width="{w-h*0.3}" height="{h*0.18}" rx="{h*0.09}" fill="#ffffff" opacity=".35"/>'
            f'<path d="{d}" fill="{OUT}" stroke="{OUT}" stroke-width="{size*0.18}" stroke-linejoin="round" transform="translate(0,{size*0.05})"/>'
            f'<path d="{d}" fill="#fff" stroke="{OUT}" stroke-width="{size*0.14}" stroke-linejoin="round" paint-order="stroke"/>')


# ---------------- app icon ----------------
def icon_house(sw=14):
    """House + chimney + smoke in 512 space. Centre ~ (256, 300)."""
    return (
        # smoke
        f'<circle cx="352" cy="128" r="17" fill="#fffaf0" stroke="{OUT}" stroke-width="{sw*0.75}"/>'
        f'<circle cx="372" cy="98" r="12" fill="#fffaf0" stroke="{OUT}" stroke-width="{sw*0.65}"/>'
        # chimney
        f'<rect x="318" y="150" width="46" height="84" rx="8" fill="#c0623f" stroke="{OUT}" stroke-width="{sw}"/>'
        f'<rect x="310" y="146" width="62" height="22" rx="8" fill="#9a4a30" stroke="{OUT}" stroke-width="{sw}"/>'
        # walls
        f'<rect x="146" y="252" width="220" height="150" rx="16" fill="{CREAM}" stroke="{OUT}" stroke-width="{sw}"/>'
        f'<rect x="153" y="372" width="206" height="23" rx="8" fill="{CREAM2}"/>'
        # roof
        f'<path d="M108,272 L256,148 L404,272 Q412,290 392,292 L120,292 Q100,290 108,272Z" fill="{RED}" stroke="{OUT}" stroke-width="{sw}" stroke-linejoin="round"/>'
        f'<path d="M256,170 L128,276 L384,276Z" fill="#ff7a72" opacity=".0"/>'
        f'<path d="M256,166 L370,264" stroke="#c94440" stroke-width="12" stroke-linecap="round" opacity=".55"/>'
        f'<path d="M150,262 L250,178" stroke="#ff8f88" stroke-width="12" stroke-linecap="round"/>'
        # door
        f'<path d="M226,402 V336 a30,30 0 0 1 60,0 V402Z" fill="{WOOD}" stroke="{OUT}" stroke-width="{sw}" stroke-linejoin="round"/>'
        f'<circle cx="272" cy="368" r="6" fill="{OUT}"/>'
        # window
        f'<rect x="172" y="316" width="40" height="40" rx="8" fill="{YEL}" stroke="{OUT}" stroke-width="{sw*0.85}"/>'
        f'<rect x="300" y="316" width="40" height="40" rx="8" fill="{YEL}" stroke="{OUT}" stroke-width="{sw*0.85}"/>'
    )


def icon_sun(sw=14, cx=112, cy=112, r=50):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{YEL}" stroke="{OUT}" stroke-width="{sw}"/>'
            f'<path d="M{cx-r*0.56},{cy-r*0.28} a{r*0.6},{r*0.6} 0 0 1 {r*0.44},{-r*0.36}" stroke="#fff1b0" stroke-width="10" fill="none" stroke-linecap="round"/>')


def icon_hill(sw=14):
    return (f'<path d="M-40,560 L-40,420 Q120,330 256,370 Q392,410 560,350 L560,560Z" fill="{GRASS}" stroke="{OUT}" stroke-width="{sw}" stroke-linejoin="round"/>'
            f'<path d="M-40,452 Q120,368 256,404 Q392,440 560,384" stroke="#9edc7c" stroke-width="12" fill="none" opacity=".7"/>'
            # tiny sprout and flowers
            f'<g transform="translate(84,420) scale(1.5)"><path d="M0,0 v-22" stroke="{OUT}" stroke-width="16" stroke-linecap="round"/>'
            f'<path d="M0,-18 c-8,-22 -32,-24 -40,-14 c8,16 28,18 40,14z M0,-20 c6,-26 32,-32 42,-20 c-8,18 -30,22 -42,20z" fill="{GREEN}" stroke="{OUT}" stroke-width="10" stroke-linejoin="round"/>'
            f'<path d="M0,0 v-22" stroke="{GREEND}" stroke-width="6" stroke-linecap="round"/></g>'
            f'<circle cx="420" cy="440" r="9" fill="{CREAM}" stroke="{OUT}" stroke-width="5"/>'
            f'<circle cx="448" cy="430" r="9" fill="{RED}" stroke="{OUT}" stroke-width="5"/>')


def icon_sky_defs():
    return ('<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#6cc4ef"/><stop offset=".55" stop-color="{SKY}"/><stop offset="1" stop-color="#d7f1c4"/></linearGradient>')


def icon_full(size=512, rounded=0.0):
    """Full square icon (no transparency unless rounded)."""
    clip = ""
    if rounded:
        clip = f'<clipPath id="rr"><rect width="512" height="512" rx="{512*rounded}"/></clipPath>'
    g_open = '<g clip-path="url(#rr)">' if rounded else '<g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 512 512">'
            f'<defs>{icon_sky_defs()}{clip}</defs>{g_open}'
            f'<rect width="512" height="512" fill="url(#isky)"/>'
            f'<circle cx="420" cy="196" r="22" fill="#fff" opacity=".45"/><circle cx="446" cy="190" r="16" fill="#fff" opacity=".45"/>'
            f'{icon_sun()}{icon_hill()}<g transform="translate(0,-6)">{icon_house()}</g></g></svg>')


def icon_maskable(size=512):
    # art scaled into the centre 80% circle (r=204.8)
    s = 0.78
    tx = 256 - 256 * s; ty = 256 - 270 * s
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 512 512">'
            f'<defs>{icon_sky_defs()}</defs><rect width="512" height="512" fill="url(#isky)"/>'
            f'<path d="M0,512 L0,400 Q140,330 256,360 Q380,392 512,340 L512,512Z" fill="{GRASS}"/>'
            f'<g transform="translate({tx},{ty}) scale({s})">{icon_sun()}<clipPath id="hc"><rect x="-40" y="0" width="600" height="600"/></clipPath>'
            f'<g transform="translate(0,-6)">{icon_house()}</g></g>'
            '</svg>')


def adaptive_fg(size=432):
    # map 512-comp into 432 canvas with house+sun inside centre 288 box (72..360)
    s = 0.64
    tx = 216 - 262 * s; ty = 216 - 268 * s
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 432 432">'
            f'<g transform="translate({tx:.1f},{ty:.1f}) scale({s})">'
            f'<path d="M-200,800 L-200,416 Q120,326 256,366 Q392,406 720,330 L720,800Z" fill="{GRASS}" stroke="{OUT}" stroke-width="14" stroke-linejoin="round"/>'
            f'<path d="M-200,448 Q120,364 256,400 Q392,436 720,364" stroke="#9edc7c" stroke-width="12" fill="none" opacity=".7"/>'
            f'{icon_sun(cx=150, cy=160, r=46)}<g transform="translate(0,-6)">{icon_house()}</g></g></svg>')


def adaptive_bg(size=432):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 432 432">'
            f'<defs>{icon_sky_defs()}</defs><rect width="432" height="432" fill="url(#isky)"/></svg>')


def mono_icon(size=432, color="#000000"):
    s = 0.68
    tx = 216 - 262 * s; ty = 216 - 250 * s
    # silhouette: roof+walls+chimney+sun as white in mask, details black
    shapes_white = (
        '<rect x="318" y="150" width="46" height="84" rx="8"/>'
        '<rect x="310" y="146" width="62" height="22" rx="8"/>'
        '<rect x="146" y="252" width="220" height="150" rx="16"/>'
        '<path d="M108,272 L256,148 L404,272 Q412,290 392,292 L120,292 Q100,290 108,272Z"/>'
        '<circle cx="150" cy="160" r="42"/>'
        '<circle cx="352" cy="128" r="17"/><circle cx="372" cy="98" r="12"/>'
    )
    shapes_black = (
        '<rect x="104" y="292" width="304" height="14"/>'
        '<path d="M232,402 V338 a24,24 0 0 1 48,0 V402Z"/>'
        '<rect x="178" y="322" width="28" height="28" rx="5"/>'
        '<rect x="306" y="322" width="28" height="28" rx="5"/>'
        '<rect x="300" y="236" width="80" height="12"/>'
    )
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 432 432">'
            f'<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="432" height="432"><rect width="432" height="432" fill="#000"/>'
            f'<g transform="translate({tx:.1f},{ty:.1f}) scale({s})"><g fill="#fff">{shapes_white}</g><g fill="#000">{shapes_black}</g></g></mask></defs>'
            f'<rect width="432" height="432" fill="{color}" mask="url(#m)"/></svg>')


def favicon_svg():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            f'<defs>{icon_sky_defs()}<clipPath id="rr"><rect width="512" height="512" rx="120"/></clipPath></defs>'
            f'<g clip-path="url(#rr)"><rect width="512" height="512" fill="url(#isky)"/>'
            f'<circle cx="110" cy="110" r="62" fill="{YEL}" stroke="{OUT}" stroke-width="22"/>'
            f'<path d="M-40,560 L-40,430 Q120,350 256,384 Q392,418 560,360 L560,560Z" fill="{GRASS}" stroke="{OUT}" stroke-width="22"/>'
            f'<rect x="136" y="250" width="240" height="160" rx="18" fill="{CREAM}" stroke="{OUT}" stroke-width="22"/>'
            f'<path d="M96,276 L256,138 L416,276 Q424,296 400,298 L112,298 Q88,296 96,276Z" fill="{RED}" stroke="{OUT}" stroke-width="22" stroke-linejoin="round"/>'
            f'<path d="M222,410 V346 a34,34 0 0 1 68,0 V410Z" fill="{WOOD}" stroke="{OUT}" stroke-width="20"/>'
            f'</g><rect x="11" y="11" width="490" height="490" rx="110" fill="none" stroke="{OUT}" stroke-width="22"/></svg>')


# ---------------- emoji embedding ----------------
def emoji(name, x, y, size, rot=0):
    p = os.path.join(HERE, "emoji", name + ".svg")
    s = open(p).read()
    m = re.search(r'viewBox="([^"]+)"', s)
    vb = m.group(1) if m else "0 0 32 32"
    inner = re.sub(r'^.*?<svg[^>]*>', '', s, flags=re.S).replace('</svg>', '')
    t = f' transform="rotate({rot} {x+size/2} {y+size/2})"' if rot else ""
    return f'<g{t}><svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="{vb}">{inner}</svg></g>'


def emoji_shadow(x, y, size):
    return f'<ellipse cx="{x+size/2}" cy="{y+size*0.95}" rx="{size*0.36}" ry="{size*0.07}" fill="{OUT}" opacity=".18"/>'


# ---------------- spot illustrations (512 transparent) ----------------
def spot_base(seed, inner, top_color=GRASS):
    t, _ = tile(200, 78, 40, seed, n=14, grass=top_color, beach=False, water_ring=False, sw=5)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{defs()}'
            f'<ellipse cx="256" cy="420" rx="210" ry="34" fill="{OUT}" opacity=".12"/>'
            f'<g transform="translate(256,350)">{t}</g>{inner}</svg>')


def sparkle(x, y, r, c="#fff3a0"):
    return (f'<path d="M{x},{y-r} Q{x+r*0.18},{y-r*0.18} {x+r},{y} Q{x+r*0.18},{y+r*0.18} {x},{y+r} Q{x-r*0.18},{y+r*0.18} {x-r},{y} Q{x-r*0.18},{y-r*0.18} {x},{y-r}Z" '
            f'fill="{c}" stroke="{OUT}" stroke-width="3" stroke-linejoin="round"/>')


def spot(kind):
    if kind == "harvest":
        inner = (f'<g transform="translate(256,350)">{field(-150,-60,250,104,-40,"wheat",rows=3,cols=6,s=1.5)}</g>'
                 + emoji("sheaf_of_rice", 300, 150, 150, 10)
                 + f'<path d="M110,170 Q230,90 360,140" stroke="{OUT}" stroke-width="30" fill="none" stroke-linecap="round"/>'
                 f'<path d="M110,170 Q230,90 360,140" stroke="#fffaf0" stroke-width="18" fill="none" stroke-linecap="round"/>'
                 f'<path d="M340,108 L392,152 L326,172Z" fill="#fffaf0" stroke="{OUT}" stroke-width="7" stroke-linejoin="round"/>'
                 + sparkle(108, 120, 22) + sparkle(420, 250, 16))
        return spot_base(101, inner)
    if kind == "animals":
        inner = (emoji_shadow(90, 210, 150) + emoji("cow", 90, 205, 150)
                 + emoji_shadow(250, 190, 150) + emoji("pig", 258, 192, 140)
                 + f'<g transform="translate(200,380)">{chicken(0,0,2.2)}</g>'
                 + emoji("sheaf_of_rice", 370, 120, 70, -10) + sparkle(400, 230, 14) + emoji("red_heart", 220, 100, 70, -8))
        return spot_base(102, inner)
    if kind == "goods":
        inner = (f'<g transform="translate(256,320)"><rect x="-150" y="-30" width="300" height="34" rx="10" fill="{WOOD}" stroke="{OUT}" stroke-width="6"/>'
                 f'<rect x="-150" y="-6" width="300" height="10" rx="4" fill="{WOODD}"/>'
                 f'<rect x="-130" y="2" width="16" height="44" fill="{WOODD}" stroke="{OUT}" stroke-width="5"/><rect x="114" y="2" width="16" height="44" fill="{WOODD}" stroke="{OUT}" stroke-width="5"/></g>'
                 + emoji("bread", 78, 170, 150, -6) + emoji("glass_of_milk", 230, 122, 140) + emoji("jar", 336, 170, 110)
                 + emoji("strawberry", 380, 260, 60, 15) + sparkle(120, 140, 18))
        return spot_base(103, inner)
    if kind == "friends":
        inner = (emoji_shadow(150, 170, 200) + emoji("wrapped_gift", 150, 160, 200)
                 + emoji("red_heart", 320, 110, 110, 12) + emoji("love_letter", 50, 200, 110, -14)
                 + sparkle(380, 270, 18) + sparkle(120, 130, 14) )
        return spot_base(104, inner)
    if kind == "market":
        aw = "".join(f'<path d="M{150+i*36},150 h36 v40 a18,18 0 0 1 -36,0z" fill="{RED if i%2==0 else CREAM}" stroke="{OUT}" stroke-width="6" stroke-linejoin="round"/>' for i in range(6))
        inner = (f'<rect x="160" y="182" width="12" height="160" fill="{WOOD}" stroke="{OUT}" stroke-width="6"/>'
                 f'<rect x="340" y="182" width="12" height="160" fill="{WOOD}" stroke="{OUT}" stroke-width="6"/>'
                 f'<path d="M140,150 L180,96 H332 L372,150Z" fill="{RED}" stroke="{OUT}" stroke-width="6" stroke-linejoin="round"/>'
                 f'<path d="M190,104 H322 L340,146 H172Z" fill="#ff8f88"/>'
                 + aw +
                 f'<rect x="140" y="280" width="232" height="56" rx="10" fill="{WOOD}" stroke="{OUT}" stroke-width="6"/>'
                 f'<rect x="150" y="290" width="212" height="12" rx="6" fill="#e0a86a"/>'
                 + emoji("basket", 170, 216, 84) + emoji("carrot", 254, 222, 70, 20) + emoji("ear_of_corn", 300, 214, 74, -15)
                 + emoji("coin", 70, 250, 90, -10) + emoji("coin", 380, 200, 70, 12))
        return spot_base(105, inner)
    if kind == "leaderboard":
        def step(x, w, h, c, n):
            return (f'<rect x="{x}" y="{350-h}" width="{w}" height="{h}" rx="10" fill="{c}" stroke="{OUT}" stroke-width="6"/>'
                    f'<rect x="{x+8}" y="{358-h}" width="{w-16}" height="10" rx="5" fill="#fff" opacity=".35"/>')
        inner = (step(116, 96, 80, "#cfd8e3", 2) + step(208, 96, 120, YEL, 1) + step(300, 96, 60, "#e8a36b", 3)
                 + emoji("2nd_place_medal", 128, 196, 72) + emoji("3rd_place_medal", 312, 222, 72)
                 + emoji_shadow(186, 70, 140) + emoji("trophy", 186, 70, 140)
                 + sparkle(140, 120, 18) + sparkle(390, 150, 22))
        return spot_base(106, inner)
    raise ValueError(kind)


# ---------------- 404 chicken ----------------
def lost_chicken(size=800):
    t, _ = tile(300, 110, 52, 77, n=16, beach=False, water_ring=False, sw=6)
    sign = (f'<g transform="translate(650,480)"><rect x="-8" y="-120" width="16" height="130" fill="{WOODD}" stroke="{OUT}" stroke-width="6"/>'
            f'<rect x="-80" y="-170" width="160" height="80" rx="14" fill="{WOOD}" stroke="{OUT}" stroke-width="7" transform="rotate(-6)"/>'
            f'<rect x="-68" y="-160" width="136" height="12" rx="6" fill="#e0a86a" transform="rotate(-6)"/></g>')
    d, w, _ = text_path("404", 52, 650, 430, anchor="middle")
    signtxt = (f'<g transform="rotate(-6 650 410)"><path d="{d}" fill="{OUT}" stroke="{OUT}" stroke-width="10" stroke-linejoin="round" transform="translate(0,4)"/>'
               f'<path d="{d}" fill="{CREAM}" stroke="{OUT}" stroke-width="8" stroke-linejoin="round" paint-order="stroke"/></g>')
    plot = f'<g transform="translate(400,560)">{field(-190,-70,250,110,-40,"none",rows=3,cols=5)}</g>'
    q, _, _ = text_path("?", 120, 0, 0, anchor="middle")
    bubble = (f'<g transform="translate(250,250)"><path d="M-70,-90 h140 a40,40 0 0 1 40,40 v70 a40,40 0 0 1 -40,40 h-50 l-40,40 l4,-40 h-54 a40,40 0 0 1 -40,-40 v-70 a40,40 0 0 1 40,-40z" fill="#fffaf0" stroke="{OUT}" stroke-width="9" stroke-linejoin="round"/>'
              f'<path d="{q}" transform="translate(0,58)" fill="{YEL}" stroke="{OUT}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/></g>')
    feathers = (f'<path d="M520,330 q20,-10 30,10 q-20,10 -30,-10z" fill="#fffaf0" stroke="{OUT}" stroke-width="4" transform="rotate(20 535 335)"/>'
                f'<path d="M150,470 q20,-10 30,10 q-20,10 -30,-10z" fill="#fffaf0" stroke="{OUT}" stroke-width="4" transform="rotate(-30 165 475)"/>')
    sweat = f'<path d="M500,410 q-12,18 0,24 q12,-6 0,-24z" fill="{SKY}" stroke="{OUT}" stroke-width="4"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 800 800">{defs()}'
            f'<ellipse cx="400" cy="700" rx="320" ry="44" fill="{OUT}" opacity=".12"/>'
            f'<g transform="translate(400,560)">{t}</g>{plot}{sign}{signtxt}'
            + bush(120, 560, 1.6, seed=5) + flower(690, 580, RED, 1.6) + flower(660, 600, YEL, 1.6) + flower(250, 640, PURPLE, 1.6)
            + f'<g transform="translate(380,575)">{chicken(0,0,5.0,flip=False)}</g>'
            + bubble + feathers + '</svg>')


# ---------------- splash ----------------
def splash(W=1080, H=1920):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         defs('<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc4ef"/><stop offset=".55" stop-color="#8fd3f4"/><stop offset="1" stop-color="#e3f5fb"/></linearGradient>'),
         f'<rect width="{W}" height="{H}" fill="url(#sk)"/>',
         f'<circle cx="190" cy="250" r="300" fill="url(#sunglow)"/>', sun_disc(190, 250, 80, sw=12),
         cloud_flat(780, 220, 1.5, cid="a"), cloud_flat(330, 520, 1.0, cid="b", op=.9), cloud_flat(900, 640, 0.8, cid="c", op=.8),
         cloud_flat(120, 900, 0.7, cid="d", op=.6)]
    # far hills
    o.append(f'<path d="M0,1430 Q260,1300 560,1400 Q820,1330 1080,1380 V1920 H0Z" fill="#a8dc8a" stroke="{OUT}" stroke-width="5"/>')
    o.append(f'<path d="M0,1430 Q260,1300 560,1400 Q820,1330 1080,1380" fill="none" stroke="#c5ecae" stroke-width="10" opacity=".7"/>')
    for x, y in ((140, 1390), (240, 1366), (930, 1372)):
        o.append(pine(x, y, 0.6))
    # main hill low-poly
    pts_ = [(0, 1560), (160, 1500), (360, 1480), (560, 1500), (760, 1470), (930, 1500), (1080, 1520), (1080, 1920), (0, 1920)]
    o.append(poly(pts_, GRASS, OUT, 6))
    r = rng(3)
    for i in range(7):
        a, b = pts_[i], pts_[i + 1]
        c = ((a[0] + b[0]) / 2 + r.uniform(-60, 60), 1720 + r.uniform(-60, 60))
        o.append(poly([a, b, c], shade(GRASS, r.uniform(-0.03, 0.06)), "none"))
    o.append(poly(pts_, "none", OUT, 6))
    # farmhouse etc
    o.append(f'<g transform="translate(700,1495) scale(1.15)">{house(0,0,1.0,glow=False)}{smoke(126,-225,1)}</g>')
    o.append(tree(470, 1495, 1.2, seed=4))
    o.append(tree(1000, 1520, 1.0, seed=9, fruit="#f08a2c"))
    o.append(fence(60, 1600, 420, 1580, 6, 1.3))
    o.append(chicken(300, 1660, 1.6))
    o.append(chicken(380, 1690, 1.4, flip=True, body="#f2c14e"))
    o.append(sheep(860, 1700, 1.5, flip=True))
    for fx, fy, c in ((120, 1720, RED), (160, 1760, YEL), (560, 1780, CREAM), (620, 1740, PURPLE), (980, 1780, RED), (1020, 1820, YEL), (240, 1840, CREAM)):
        o.append(flower(fx, fy, c, 1.8))
    o.append('</svg>')
    return "".join(o)
