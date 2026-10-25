"""
1.32 Android app icons and splash screens, made from the game's own icons (public/icons). Run again after the icon
changes:  python3 scripts/app-icons.py   (needs Pillow). Writes into android/app/src/main/res.

- ic_launcher / ic_launcher_round: the rounded icon (icon-512.png), for old launchers.
- ic_launcher_foreground: the full-bleed icon (icon-maskable-512.png) at 75% of the 108dp adaptive layer, so a
  launcher's mask (circle, squircle...) only ever trims sky and grass, never the square edge of the picture.
- splash: the rounded icon on the game's sky blue (#8fd3f4, capacitor.config.ts backgroundColor).
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
ICON = Image.open(ROOT / 'public/icons/icon-512.png').convert('RGBA')
MASKABLE = Image.open(ROOT / 'public/icons/icon-maskable-512.png').convert('RGBA')
SKY = (143, 211, 244, 255)

DENSITY = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

for name, k in DENSITY.items():
    folder = RES / f'mipmap-{name}'
    folder.mkdir(parents=True, exist_ok=True)
    legacy = round(48 * k)
    small = ICON.resize((legacy, legacy), Image.LANCZOS)
    small.save(folder / 'ic_launcher.png')
    small.save(folder / 'ic_launcher_round.png')
    layer = round(108 * k)
    fg = Image.new('RGBA', (layer, layer), (0, 0, 0, 0))
    inner = round(layer * 0.75)
    fg.paste(MASKABLE.resize((inner, inner), Image.LANCZOS), ((layer - inner) // 2, (layer - inner) // 2))
    fg.save(folder / 'ic_launcher_foreground.png')

# every splash.png the template made, same sizes
for splash in RES.glob('drawable*/splash.png'):
    w, h = Image.open(splash).size
    img = Image.new('RGBA', (w, h), SKY)
    side = round(min(w, h) * 0.38)
    img.alpha_composite(ICON.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
    img.convert('RGB').save(splash)

(RES / 'values/ic_launcher_background.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#8FD3F4</color>\n</resources>\n')
print('icons and splash screens written to', RES)
