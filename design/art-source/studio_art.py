"""Josh Makes Games - studio brand art."""
from art import text_path, OUT
S_INK = "#26222e"; S_CORAL = "#f25f5c"; S_CORALD = "#c8413f"; S_CREAM = "#fff8ec"; S_YEL = "#ffc93c"; S_BLUE = "#3fa9f5"; S_MINT = "#7cc85a"
FB = "Fredoka-Bold.ttf"


def mark(x=0, y=0, s=1.0, mono=None, outline=S_INK):
    """Gamepad with a heart d-pad, box 0..220 x 0..160."""
    body = mono or S_CORAL
    heart = S_CREAM if not mono else "none"
    b1 = S_YEL if not mono else S_CREAM
    b2 = S_BLUE if not mono else S_CREAM
    knock = ""
    g = [f'<g transform="translate({x},{y}) scale({s})">']
    p = ("M54,14 H166 a46,46 0 0 1 46,46 v8 c0,48 -10,78 -40,78 c-22,0 -30,-24 -50,-24 H92 "
         "c-20,0 -28,24 -50,24 C12,146 8,116 8,68 V60 a46,46 0 0 1 46,-46Z")
    g.append(f'<path d="{p}" transform="translate(0,8)" fill="{outline}"/>')
    g.append(f'<path d="{p}" fill="{body}" stroke="{outline}" stroke-width="10" stroke-linejoin="round"/>')
    if not mono:
        g.append(f'<path d="M40,40 Q60,26 90,26" stroke="#ff9a97" stroke-width="10" fill="none" stroke-linecap="round"/>')
    hp = "M70,98 C46,82 38,70 40,58 C42,46 58,42 70,56 C82,42 98,46 100,58 C102,70 94,82 70,98Z"
    if mono:
        g.append(f'<path d="{hp}" fill="{S_CREAM if mono != S_CREAM else S_INK}"/>')
    else:
        g.append(f'<path d="{hp}" fill="{heart}" stroke="{outline}" stroke-width="7" stroke-linejoin="round"/>')
    for cx, cy, c in ((160, 54, b1), (182, 76, b2)):
        if mono:
            g.append(f'<circle cx="{cx}" cy="{cy}" r="12" fill="{S_CREAM if mono != S_CREAM else S_INK}"/>')
        else:
            g.append(f'<circle cx="{cx}" cy="{cy}" r="12" fill="{c}" stroke="{outline}" stroke-width="6"/>')
    g.append('</g>')
    return "".join(g)


def wordmark(variant="full", square=False):
    ink = S_INK if variant in ("full", "light") else S_CREAM
    size = 120
    if not square:
        d, w, _ = text_path("Josh Makes Games", size, 270, 128, fname=FB, tracking=0.0)
        W = 270 + w + 30; H = 190
        mk = mark(20, 12, 1.05, mono=S_INK if variant == "light" else None,
                  outline=S_INK if variant != "dark" else S_INK)
        extra = ""
        if variant == "dark":
            extra = f'<path d="M54,14 H166 a46,46 0 0 1 46,46 v8 c0,48 -10,78 -40,78 c-22,0 -30,-24 -50,-24 H92 c-20,0 -28,24 -50,24 C12,146 8,116 8,68 V60 a46,46 0 0 1 46,-46Z" transform="translate(20,12) scale(1.05)" fill="none" stroke="{S_CREAM}" stroke-width="22" stroke-linejoin="round"/>'
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H}"><title>Josh Makes Games</title>'
                f'{extra}{mk}<path d="{d}" fill="{ink}"/></svg>'), (W, H)
    # square: mark on top, two lines below
    d1, w1, _ = text_path("Josh Makes", 120, 400, 560, fname=FB, anchor="middle")
    d2, w2, _ = text_path("Games", 120, 400, 690, fname=FB, anchor="middle")
    extra = ""
    if variant == "dark":
        extra = f'<path d="M54,14 H166 a46,46 0 0 1 46,46 v8 c0,48 -10,78 -40,78 c-22,0 -30,-24 -50,-24 H92 c-20,0 -28,24 -50,24 C12,146 8,116 8,68 V60 a46,46 0 0 1 46,-46Z" transform="translate(180,90) scale(2)" fill="none" stroke="{S_CREAM}" stroke-width="16" stroke-linejoin="round"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><title>Josh Makes Games</title>'
            f'{extra}{mark(180, 90, 2.0, mono=S_INK if variant == "light" else None)}'
            f'<path d="{d1}" fill="{ink}"/><path d="{d2}" fill="{S_CORAL if variant != "light" else ink}"/></svg>'), (800, 800)


def favicon():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            f'<rect x="0" y="0" width="512" height="512" rx="120" fill="{S_CREAM}"/>'
            f'<rect x="10" y="10" width="492" height="492" rx="112" fill="none" stroke="{S_INK}" stroke-width="20"/>'
            f'{mark(36, 110, 2.0)}</svg>')


def og(feature_png_datauri):
    d1, _, _ = text_path("Josh Makes Games", 62, 80, 262, fname=FB)
    d2, _, _ = text_path("Cozy couch games for your phone", 36, 80, 322, fname="Fredoka-SemiBold.ttf")
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="4" fill="{S_INK}" opacity=".07"/>' for x in range(20, 1200, 40) for y in range(20, 630, 40))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">'
            f'<rect width="1200" height="630" fill="{S_CREAM}"/>{dots}'
            f'{mark(80, 70, 0.8)}'
            f'<path d="{d1}" fill="{S_INK}"/><path d="{d2}" fill="{S_CORALD}"/>'
            f'<rect x="80" y="372" width="300" height="10" rx="5" fill="{S_YEL}"/>'
            f'<g transform="rotate(4 920 420)"><rect x="702" y="288" width="460" height="256" rx="28" fill="{S_INK}"/>'
            f'<rect x="690" y="276" width="460" height="256" rx="28" fill="#fff" stroke="{S_INK}" stroke-width="8"/>'
            f'<clipPath id="fc"><rect x="706" y="292" width="428" height="210" rx="18"/></clipPath>'
            f'<image href="{feature_png_datauri}" x="706" y="292" width="428" height="210" preserveAspectRatio="xMidYMid slice" clip-path="url(#fc)"/></g>'
            + "".join(f'<circle cx="{x}" cy="{y}" r="10" fill="{c}" stroke="{S_INK}" stroke-width="5"/>' for x, y, c in ((110, 480, S_CORAL), (150, 500, S_YEL), (190, 476, S_BLUE), (230, 498, S_MINT)))
            + '</svg>')


def coming_soon_cover(W=1024, H=500):
    d, _, _ = text_path("Coming soon", 80, W / 2, H / 2 + 120, fname=FB, anchor="middle")
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="5" fill="#ffffff" opacity=".12"/>' for x in range(16, W, 48) for y in range(16, H, 48))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<rect width="{W}" height="{H}" fill="{S_INK}"/>{dots}'
            f'{mark(W/2-110, 70, 1.0, mono=S_CREAM)}'
            f'<path d="{d}" fill="{S_CREAM}"/></svg>')
