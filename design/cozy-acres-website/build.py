#!/usr/bin/env python3
"""Tiny static-site builder for the Cozy Acres website (no dependencies).

  python3 build.py            -> writes ./public

Environment (all optional; the deploy workflow sets them):
  SITE_BASE=/Cozy-Farm/       path the site is served from (default "/"). Every root-absolute
                              path ("/assets/..", "/play/", data-*, manifest, CSS url(), site.js)
                              is rewritten to start with it.
  SITE_URL=https://...        full address of the site, no trailing slash (canonical, og:url, sitemap)
  STUDIO_URL=https://...      studio homepage
  OUT_DIR=path                write here instead of ./public
  SITE_CHANGELOG=path         changelog to use instead of src/data/changelog.json. The game's own
                              src/data/changelog.json ({"releases": [...]}) works: it is converted
                              to the site's {"updates": [...]} shape (deploy.yml uses this).

Pages live in src/pages. Inside a page you can use:
  <!--meta {...} -->                     page title, description, path, out file
  <!-- @include NAME -->                 src/partials/NAME.html
  <!-- @component NAME {json} -->        src/components/NAME.html with {{fields}} filled
  <!-- @changelog N -->                  latest N update cards from data/changelog.json
  <!-- @leaderboard -->                  rows from data/leaderboard.json
  {{site variable}}                      values from SITE below
"""
import html, json, os, re, shutil, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
CHANGELOG = os.path.abspath(os.environ.get("SITE_CHANGELOG") or os.path.join(SRC, "data", "changelog.json"))
OUT = os.path.abspath(os.environ.get("OUT_DIR") or os.path.join(ROOT, "public"))

BASE = (os.environ.get("SITE_BASE") or "/").strip("/")
BASE = "/" + BASE + "/" if BASE else "/"   # always "/" or "/x/y/"

SITE = {
    "site_url": (os.environ.get("SITE_URL") or "https://cozyacres.joshmakesgames.app").rstrip("/"),  # no trailing slash
    "support_email": "joshmakesgames92@gmail.com",
    "play_url": "https://play.google.com/store/apps/details?id=YOUR.PACKAGE.ID",
    "delete_endpoint": "/api/delete-data",            # POST {"code": "..."} -> 200 / 404 / 429
    "studio_url": os.environ.get("STUDIO_URL") or "https://joshmakesgames.app/",  # studio homepage
    "game_url": BASE + "play/",                       # the web game ("Play now")
    "head_extra": "",
}

E = html.escape


def read(*p):
    with open(os.path.join(SRC, *p), encoding="utf-8") as f:
        return f.read()


def fill(tpl, data):
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(data.get(m.group(1), m.group(0))), tpl)


def component(name, data):
    safe = {k: (v if k.endswith("_html") else E(str(v))) for k, v in data.items()}
    return fill(read("components", name + ".html"), safe)


def fmt_date(iso):
    try:
        d = datetime.date.fromisoformat(iso)
        return f"{d.day} {d.strftime('%B %Y')}"
    except ValueError:
        return iso


def vkey(v):
    return tuple(int(x) for x in re.findall(r"\d+", v))


def load_changelog():
    """The site's {"updates": [...]} data. Also accepts the game's {"releases": [...]} file."""
    data = json.load(open(CHANGELOG, encoding="utf-8"))
    if "updates" in data:
        return data
    ups = []
    for r in data.get("releases", []):
        u = {"version": r["version"], "name": r.get("title", ""), "date": r.get("date", "")}
        ded = r.get("dedication") or {}
        if ded.get("text"):
            u["note"] = ded["text"]
            u["heart"] = ded.get("icon") == "heart"
        u["highlights"] = [h["text"] if isinstance(h, dict) else h for h in r.get("highlights", [])]
        ups.append(u)
    return {"updates": ups}


def rebase(text):
    """Point root-absolute paths ("/x") at BASE ("/Cozy-Farm/x"). No-op when BASE is "/"."""
    if BASE == "/":
        return text
    b = BASE
    text = re.sub(r'((?:href|src|action|poster|content|data-[\w-]+)=")/(?!/)', lambda m: m.group(1) + b, text)
    text = re.sub(r'url\((["\']?)/(?!/)', lambda m: "url(" + m.group(1) + b, text)  # CSS
    text = re.sub(r'("(?:src|start_url|scope|id)":\s*")/(?!/)', lambda m: m.group(1) + b, text)  # manifest
    text = re.sub(r'(["\'])/assets/', lambda m: m.group(1) + b + "assets/", text)  # site.js
    return text


def changelog(n):
    data = load_changelog()
    ups = sorted(data["updates"], key=lambda u: vkey(u["version"]), reverse=True)[:n]
    out = []
    for i, u in enumerate(ups):
        note = ""
        if u.get("note"):
            heart = '<img src="/assets/icons/red_heart.svg" alt="" width="22" height="22">' if u.get("heart") else ""
            note = f'<p class="update-card__note">{heart}<span>{E(u["note"])}</span></p>'
        items = "".join(f"<li>{E(h)}</li>" for h in u.get("highlights", []))
        out.append(component("update-card", {"modifier": "update-card--latest" if i == 0 else "", "version": u["version"],
                                             "date": u["date"], "date_label": fmt_date(u["date"]), "name": u["name"],
                                             "note_html": note, "items_html": items}))
    return "\n".join(out)


def leaderboard():
    data = json.load(open(os.path.join(SRC, "data", "leaderboard.json"), encoding="utf-8"))
    rows = []
    for i, f in enumerate(data.get("farmers", [])[:5]):
        r = i + 1
        if r <= 3:
            badge = (f'<img class="lb-row__medal" src="/assets/icons/{["1st","2nd","3rd"][i]}_place_medal.svg" '
                     f'alt="{["Gold","Silver","Bronze"][i]} medal, rank {r}" width="32" height="32">')
        else:
            badge = f'<span class="lb-row__rank" aria-label="Rank {r}">{r}</span>'
        rows.append(component("leaderboard-row", {"rank": r, "avatar": f.get("avatar", "cow_face"), "name": f["name"],
                                                  "level": f["level"], "badge_html": badge}))
    return "\n".join(rows)


def render(page_src):
    m = re.match(r"<!--meta (\{.*?\}) -->\s*", page_src, re.S)
    meta = json.loads(m.group(1)); body = page_src[m.end():]
    for _ in range(3):  # nested includes
        body = re.sub(r"<!-- @include ([\w-]+) -->", lambda mm: read("partials", mm.group(1) + ".html"), body)
    body = re.sub(r"<!-- @component ([\w-]+) (\{.*?\}) -->", lambda mm: component(mm.group(1), json.loads(mm.group(2))), body)
    body = re.sub(r"<!-- @changelog (\d+) -->", lambda mm: changelog(int(mm.group(1))), body)
    body = body.replace("<!-- @leaderboard -->", leaderboard())
    data = dict(SITE); data.update({k: E(v) for k, v in meta.items()})
    body = rebase(fill(body, data))
    lb_attr = 'data-leaderboard="' + BASE + 'leaderboard.json"'
    if leaderboard() and lb_attr + " hidden" in body:
        body = body.replace(lb_attr + " hidden", lb_attr)
    return meta, body


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(os.path.join(SRC, "assets"), os.path.join(OUT, "assets"))
    shutil.copytree(os.path.join(SRC, "static"), OUT, dirs_exist_ok=True)
    for name in ("sitemap.xml", "robots.txt"):  # static files that mention the site address
        path = os.path.join(OUT, name)
        with open(path, encoding="utf-8") as f:
            txt = f.read().replace("{{site_url}}", SITE["site_url"])
        with open(path, "w", encoding="utf-8") as f:
            f.write(txt)
    for rel in ("manifest.webmanifest", os.path.join("assets", "css", "cozy.css"), os.path.join("assets", "js", "site.js")):
        path = os.path.join(OUT, rel)  # static files with root-absolute paths
        with open(path, encoding="utf-8") as f:
            txt = f.read()
        with open(path, "w", encoding="utf-8") as f:
            f.write(rebase(txt))
    raw = json.load(open(CHANGELOG, encoding="utf-8"))
    if "updates" in raw:
        shutil.copy(CHANGELOG, os.path.join(OUT, "changelog.json"))
    else:  # the game's changelog: write it in the shape site.js reads
        with open(os.path.join(OUT, "changelog.json"), "w", encoding="utf-8") as f:
            json.dump(load_changelog(), f, indent=2, ensure_ascii=False)
            f.write("\n")
    shutil.copy(os.path.join(SRC, "data", "leaderboard.json"), os.path.join(OUT, "leaderboard.json"))
    for fn in sorted(os.listdir(os.path.join(SRC, "pages"))):
        meta, out = render(read("pages", fn))
        dest = os.path.join(OUT, meta.get("out", "index.html"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(out)
        print("built", os.path.relpath(dest, ROOT))


if __name__ == "__main__":
    main()
