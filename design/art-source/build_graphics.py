import json, os, re, base64, subprocess
import art, studio_art as st

R = "out/graphics"
M = []


def save(path, svg):
    full = os.path.join(R, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "w").write(svg)
    return full


def sized(svg, w, h):
    svg = re.sub(r'^<svg ([^>]*?)width="[^"]*" height="[^"]*"', r'<svg \1', svg, count=1)
    return svg.replace("<svg ", f'<svg width="{w}" height="{h}" ', 1)


def png(svgfile, out, w, h, transparent=False, jpg=False):
    M.append(dict(svg=svgfile, out=os.path.join(R, out), w=w, h=h, transparent=transparent, jpg=jpg))


tmp = "out/_svg"
os.makedirs(tmp, exist_ok=True)


def tsvg(name, svg):
    p = os.path.join(tmp, name + ".svg"); open(p, "w").write(svg); return p


# ---------- 1-4 icons ----------
play = art.icon_full(512)
save("icons/svg/app-icon.svg", play)
png(tsvg("play", play), "icons/google-play-icon-512.png", 512, 512)
fg = art.adaptive_fg(432); bg = art.adaptive_bg(432); mono = art.mono_icon(432)
save("icons/svg/adaptive-foreground.svg", fg); save("icons/svg/adaptive-background.svg", bg); save("icons/svg/monochrome.svg", mono)
png(tsvg("fg", fg), "icons/android-adaptive/ic_launcher_foreground-432.png", 432, 432, transparent=True)
png(tsvg("bg", bg), "icons/android-adaptive/ic_launcher_background-432.png", 432, 432)
png(tsvg("mono", mono), "icons/android-adaptive/ic_launcher_monochrome-432.png", 432, 432, transparent=True)
reg = art.icon_full(512, rounded=0.22)
save("icons/svg/app-icon-rounded.svg", reg)
png(tsvg("reg512", reg), "icons/web/icon-512.png", 512, 512, transparent=True)
png(tsvg("reg192", sized(reg, 192, 192)), "icons/web/icon-192.png", 192, 192, transparent=True)
mk = art.icon_maskable(512)
save("icons/svg/icon-maskable.svg", mk)
png(tsvg("mask", mk), "icons/web/icon-maskable-512.png", 512, 512)
png(tsvg("apple", sized(play, 180, 180)), "icons/web/apple-touch-icon-180.png", 180, 180)
fav = art.favicon_svg()
save("icons/web/favicon.svg", fav)
png(tsvg("fav32", sized(fav, 32, 32)), "icons/web/favicon-32.png", 32, 32, transparent=True)
png(tsvg("fav48", sized(play, 48, 48)), "icons/web/_preview-48.png", 48, 48)

# ---------- 6 logos ----------
for name, var, stacked in (("cozy-acres-logo-full-colour", "full", False), ("cozy-acres-logo-on-light", "light", False),
                           ("cozy-acres-logo-on-dark", "dark", False), ("cozy-acres-logo-stacked-square", "full", True)):
    svg, vb = art.logo_svg(var, stacked)
    save(f"logo/{name}.svg", svg)
    h = round(2000 * vb[3] / vb[2])
    png(tsvg(name, sized(svg, 2000, h)), f"logo/{name}-2000w.png", 2000, h, transparent=True)

# ---------- 5 feature graphic ----------
lg, lh = art.logo_group("full", 46, 0, 340)
lg = lg.replace(f'y="0"', f'y="{(500-lh)/2-40:.0f}"', 1)
tag_d, _, _ = art.text_path("Grow your own cozy farm", 26, 216, (500 - lh) / 2 - 40 + lh + 30, fname="Fredoka-SemiBold.ttf", anchor="middle")
tagline = f'<path d="{tag_d}" fill="#fff" stroke="{art.OUT}" stroke-width="6" stroke-linejoin="round" paint-order="stroke"/>'
fgph = art.scene(1024, 500, 680, 315, 0.39, 238, sun=(0.2, -0.05),
                 clouds=[(0.12, 0.12, 0.7), (0.55, 0.08, 0.5), (0.9, 0.16, 0.55)], big_animals=True,
                 overlay=f'<rect x="0" y="0" width="420" height="500" fill="url(#fade)"/>' + lg + tagline)
fgph = fgph.replace('</defs>', '<linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#fff2d6" stop-opacity=".45"/><stop offset="1" stop-color="#fff2d6" stop-opacity="0"/></linearGradient></defs>', 1)
save("store/feature-graphic-1024x500.svg", fgph)
png(tsvg("fgph", fgph), "store/feature-graphic-1024x500.png", 1024, 500)
png(tsvg("fgph", fgph), "store/feature-graphic-1024x500.jpg", 1024, 500, jpg=True)

# ---------- 7 splash ----------
sp = art.splash()
save("marketing/splash-1080x1920.svg", sp)
png(tsvg("splash", sp), "marketing/splash-1080x1920.png", 1080, 1920)

# ---------- 8 OG ----------
lg2, lh2 = art.logo_group("full", 60, 120, 470)
btn = art.candy_button(150, 140 + lh2, 290, 84, "Play now")
og = art.scene(1200, 630, 830, 410, 0.49, 300, sun=(0.18, -0.05),
               clouds=[(0.1, 0.1, 0.7), (0.6, 0.08, 0.55), (0.9, 0.2, 0.5)], big_animals=True,
               overlay='<rect width="560" height="630" fill="url(#fade)"/>' + lg2 + btn)
og = og.replace('</defs>', '<linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#fff2d6" stop-opacity=".5"/><stop offset="1" stop-color="#fff2d6" stop-opacity="0"/></linearGradient></defs>', 1)
save("marketing/og-image-1200x630.svg", og)
png(tsvg("og", og), "marketing/og-image-1200x630.png", 1200, 630)

# ---------- 9 hero ----------
hero = art.scene(2400, 1200, 1600, 840, 0.9, 560, sun=(0.25, -0.1),
                 clouds=[(0.15, 0.15, 1), (0.62, 0.1, 0.8), (0.85, 0.25, 0.7)], fireflies=10)
save("marketing/hero-2400x1200.svg", hero)
png(tsvg("hero", hero), "marketing/hero-2400x1200.png", 2400, 1200)
png(tsvg("hero", hero), "marketing/hero-2400x1200.jpg", 2400, 1200, jpg=True)
herom = art.scene(1080, 1350, 540, 1010, 0.68, 760, sun=(0.75, -0.05),
                  clouds=[(0.2, 0.12, 0.8), (0.8, 0.3, 0.6)], fireflies=8)
save("marketing/hero-mobile-1080x1350.svg", herom)
png(tsvg("herom", herom), "marketing/hero-mobile-1080x1350.png", 1080, 1350)
png(tsvg("herom", herom), "marketing/hero-mobile-1080x1350.jpg", 1080, 1350, jpg=True)

# ---------- 10 spots ----------
for k, fn in (("harvest", "01-swipe-to-harvest"), ("animals", "02-raise-animals"), ("goods", "03-make-goods"),
              ("friends", "04-friends-and-gifts"), ("market", "05-shared-market"), ("leaderboard", "06-leaderboards")):
    s = art.spot(k)
    save(f"illustrations/features/{fn}.svg", s)
    png(tsvg("spot" + k, s), f"illustrations/features/{fn}-512.png", 512, 512, transparent=True)

# ---------- 11 404 ----------
lc = art.lost_chicken()
save("illustrations/404-lost-chicken.svg", lc)
png(tsvg("lc", lc), "illustrations/404-lost-chicken-800.png", 800, 800, transparent=True)

json.dump(M, open("out/_m1.json", "w"))
subprocess.run(["node", "render.cjs", "out/_m1.json"], check=True)

# ---------- studio ----------
M.clear()
SR = "out/studio-brand"
os.makedirs(SR, exist_ok=True)
for name, var, sq in (("josh-makes-games-logo-full-colour", "full", False), ("josh-makes-games-logo-on-light", "light", False),
                      ("josh-makes-games-logo-on-dark", "dark", False), ("josh-makes-games-logo-square", "full", True),
                      ("josh-makes-games-logo-square-on-dark", "dark", True)):
    svg, (W, H) = st.wordmark(var, sq)
    open(f"{SR}/{name}.svg", "w").write(svg)
    w = 2000; h = round(2000 * H / W)
    M.append(dict(svg=tsvg(name, sized(svg, w, h)), out=f"{SR}/{name}-2000w.png", w=w, h=h, transparent=True))
fv = st.favicon()
open(f"{SR}/favicon.svg", "w").write(fv)
for s in (32, 180, 192, 512):
    M.append(dict(svg=tsvg(f"sfav{s}", sized(fv, s, s)), out=f"{SR}/favicon-{s}.png", w=s, h=s, transparent=True))
cs = st.coming_soon_cover()
open(f"{SR}/coming-soon-cover.svg", "w").write(cs)
M.append(dict(svg=tsvg("cs", cs), out=f"{SR}/coming-soon-cover-1024x500.png", w=1024, h=500))
json.dump(M, open("out/_m2.json", "w"))
subprocess.run(["node", "render.cjs", "out/_m2.json"], check=True)
b64 = base64.b64encode(open("out/graphics/store/feature-graphic-1024x500.jpg", "rb").read()).decode()
ogs = st.og("data:image/jpeg;base64," + b64)
open(f"{SR}/studio-og-image-1200x630.svg", "w").write(ogs)
json.dump([dict(svg=tsvg("sog", ogs), out=f"{SR}/studio-og-image-1200x630.png", w=1200, h=630)], open("out/_m3.json", "w"))
subprocess.run(["node", "render.cjs", "out/_m3.json"], check=True)
print("done")
