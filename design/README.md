# Cozy Acres - brand pack and websites

Made in Claude Design, reviewed and saved here. Status:
- Done: the game's own PWA icons and favicon now use these designs (public/icons, public/favicon.svg).
  Contact email everywhere: joshmakesgames92@gmail.com. Domain: joshmakesgames.app. The game site is
  https://cozyacres.joshmakesgames.app (website at /, game at /play/) and the studio homepage is
  https://joshmakesgames.app/ (build.py SITE settings; switching over step by step: ../DOMAIN.md).
- Updated with the second Claude Design pack: "Coming soon" store links instead of the Play badge, the redesigned
  studio homepage (hero, My games, About me, contact) and style updates. The studio wordmark "Josh Makes Games"
  matches the joshmakesgames.app domain.
- Open: the top-farmers strip still shows sample data; when the Play listing is live, swap the Google Play
  "Coming soon" link for the official badge (store/checklist.md).

## Domains
    joshmakesgames.app                   -> studio/website  (studio homepage, separate repo, see ../DOMAIN.md)
    cozyacres.joshmakesgames.app         -> cozy-acres-website/public (built into dist/ by the deploy)
    cozyacres.joshmakesgames.app/play/   -> the game (dist/play/)
    /.well-known/assetlinks.json         -> written by the deploy from the ANDROID_PACKAGE and
                                            ANDROID_CERT_SHA256 repo variables (see ../android/README.md)

## cozy-acres-graphics
- icons/google-play-icon-512.png - Play Store icon (512, full square, no transparency)
- icons/android-adaptive/ - foreground (art inside the centre 288), background, monochrome (432 each)
- icons/web/ - icon-192, icon-512, icon-maskable-512, apple-touch-icon-180, favicon-32.png, favicon.svg
- icons/svg/ - SVG sources for every icon
- store/feature-graphic-1024x500 (.png, .jpg, .svg)
- logo/ - full colour, on light, on dark, stacked square (SVG + 2000px transparent PNG). Text is converted to outlines, so no font is needed.
- marketing/ - splash 1080x1920, OG image 1200x630, hero 2400x1200 and 1080x1350
- illustrations/features/ - 6 feature spots (512 transparent PNG + SVG)
- illustrations/404-lost-chicken (800 transparent PNG + SVG)

## cozy-acres-website
- public/ is a preview build. The live site is built and deployed together with the game by
  .github/workflows/deploy.yml (scripts/pages/build.sh): website at the site root, game at /play/.
- Base path: `SITE_BASE=/Cozy-Farm/ SITE_URL=https://jla92-bit.github.io/Cozy-Farm python3 build.py`
  rewrites every root-absolute path (links, images, data-*, manifest, CSS url(), site.js). With no
  environment the site is built for https://cozyacres.joshmakesgames.app at "/".
- To change shared parts, edit src/ and run `python3 build.py` (no dependencies). Components:
  src/partials/header.html, footer.html, nav-links.html and src/components/button, feature-card, update-card, leaderboard-row.
- What's new: the deploy uses the game's own src/data/changelog.json (SITE_CHANGELOG), converted to the site's
  format, so the site always lists the real releases. src/data/changelog.json here is only for local previews.
  The 3 newest versions show automatically.
- Top farmers: public/leaderboard.json currently holds SAMPLE data. Point it at your live feed ({"farmers":[{"name","level","avatar"}]}).
  The section hides itself if the file is empty or missing.
- Delete my data: the form POSTs {"code":"..."} to /api/delete-data. Reply 200 for success, 404 for unknown code, 429 for too many tries.

### Fill these in before going live
- SITE settings at the top of build.py: Google Play URL (package id), delete endpoint. (Site and studio URLs are set.)
- assets/img/google-play-badge.png is a placeholder. Download the official badge from Google's badge page and drop it in with the same name.
- assets/img/screenshots/screenshot-1..5.png are placeholders (1080x1920 portrait) and their alt text is in index.html.
- Privacy policy: replace every [bracketed] item, and check it matches what your game and server actually do. It is a starting draft, not legal advice.
- Support FAQ: two answers are marked [Answer: ...].
- changelog.json: the 1.2.0 date (2026-10-01) is a guess, set the real one.

## studio
- brand/ - studio logo (full colour, on light, on dark, square, square on dark: SVG + 2000px PNG), favicons, 1200x630 OG image, coming-soon cover.
- website/ - single static page for https://joshmakesgames.app (its own repo later, see ../DOMAIN.md step 7).
  Links to the game site are set; replace the Google Play package id.

## art-source
Python + Playwright generators for every graphic (python3 build_graphics.py, then outputs land in out/).
Fonts: Lilita One and Fredoka (SIL Open Font License). Icons: Fluent Emoji (MIT, Microsoft).
