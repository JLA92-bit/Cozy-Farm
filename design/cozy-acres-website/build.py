#!/usr/bin/env python3
"""Tiny static-site builder for cozyacres.joshmakesgames92.com (no dependencies).

  python3 build.py            -> writes ./public

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
OUT = os.path.join(ROOT, "public")

SITE = {
    "support_email": "support@joshmakesgames92.com",          # confirm this mailbox exists
    "play_url": "https://play.google.com/store/apps/details?id=YOUR.PACKAGE.ID",
    "delete_endpoint": "/api/delete-data",            # POST {"code": "..."} -> 200 / 404 / 429
    "studio_url": "https://joshmakesgames92.com/",
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


def changelog(n):
    data = json.load(open(os.path.join(SRC, "data", "changelog.json"), encoding="utf-8"))
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
    body = fill(body, data)
    if leaderboard() and 'data-leaderboard="/leaderboard.json" hidden' in body:
        body = body.replace('data-leaderboard="/leaderboard.json" hidden', 'data-leaderboard="/leaderboard.json"')
    return meta, body


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(os.path.join(SRC, "assets"), os.path.join(OUT, "assets"))
    shutil.copytree(os.path.join(SRC, "static"), OUT, dirs_exist_ok=True)
    for name in ("changelog.json", "leaderboard.json"):
        shutil.copy(os.path.join(SRC, "data", name), os.path.join(OUT, name))
    for fn in sorted(os.listdir(os.path.join(SRC, "pages"))):
        meta, out = render(read("pages", fn))
        dest = os.path.join(OUT, meta.get("out", "index.html"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(out)
        print("built", os.path.relpath(dest, ROOT))


if __name__ == "__main__":
    main()
