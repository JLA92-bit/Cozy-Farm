# Cozy Acres - brand pack and websites

Made in Claude Design, reviewed and saved here. Status:
- Done: domains updated to cozyacres.joshmakesgames92.com (game site) and joshmakesgames92.com (studio);
  the game's own PWA icons and favicon now use these designs (public/icons, public/favicon.svg).
- Open: studio wordmark reads "Josh Makes Games" (no 92); placeholders below (screenshots, official Play
  badge, Play package id, privacy policy brackets, support FAQ answers, changelog date); the delete-data
  form needs a real endpoint (Supabase); top-farmers strip still uses sample data; privacy policy must
  mention Google sign-in once that ships.

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

## cozy-acres-website (cozyacres.joshmakesgames92.com)
- public/ is ready to upload as static files. Your game itself lives at /play/ (not included).
- To change shared parts, edit src/ and run `python3 build.py` (no dependencies). Components:
  src/partials/header.html, footer.html, nav-links.html and src/components/button, feature-card, update-card, leaderboard-row.
- What's new: edit src/data/changelog.json (or replace public/changelog.json on the server). The 3 newest versions show automatically.
- Top farmers: public/leaderboard.json currently holds SAMPLE data. Point it at your live feed ({"farmers":[{"name","level","avatar"}]}).
  The section hides itself if the file is empty or missing.
- Delete my data: the form POSTs {"code":"..."} to /api/delete-data. Reply 200 for success, 404 for unknown code, 429 for too many tries.

### Fill these in before going live
- SITE settings at the top of build.py: support email, Google Play URL (package id), delete endpoint, studio URL.
- assets/img/google-play-badge.png is a placeholder. Download the official badge from Google's badge page and drop it in with the same name.
- assets/img/screenshots/screenshot-1..5.png are placeholders (1080x1920 portrait) and their alt text is in index.html.
- Privacy policy: replace every [bracketed] item, and check it matches what your game and server actually do. It is a starting draft, not legal advice.
- Support FAQ: two answers are marked [Answer: ...].
- changelog.json: the 1.2.0 date (2026-10-01) is a guess, set the real one.

## studio (joshmakesgames92.com)
- brand/ - studio logo (full colour, on light, on dark, square, square on dark: SVG + 2000px PNG), favicons, 1200x630 OG image, coming-soon cover.
- website/ - single static page. Replace [studio-email] and the Google Play package id.

## art-source
Python + Playwright generators for every graphic (python3 build_graphics.py, then outputs land in out/).
Fonts: Lilita One and Fredoka (SIL Open Font License). Icons: Fluent Emoji (MIT, Microsoft).
