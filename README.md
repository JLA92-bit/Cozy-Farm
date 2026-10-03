# Cozy Acres

A cozy, mobile-first 3D farming and village builder that runs in the browser. Plant and swipe-harvest crops,
raise animals, run bakeries and dairies, fill orders and delivery trucks, decorate your farm to raise its
Charm, and customise your farmer. Built with Three.js + TypeScript + Vite, installable as an offline PWA.

- Chunky low-poly look from **KayKit** and **Kenney** CC0 packs (see [CREDITS.md](CREDITS.md)), shared palette
  atlases and instancing so a big farm stays at roughly 130 draw calls.
- No real-money purchases. Saves live in `localStorage` with export/import.
- Online play (friends, gifts, shared market, leaderboards) works in a local **Practice mode** out of the box,
  and with real players once you connect a free Supabase project: see [ONLINE.md](ONLINE.md).

## Quick start

```bash
npm install
npm run dev        # local play at http://localhost:5173 (use your LAN IP to try it on a phone)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

The built assets in `public/assets` are committed, so you do not need to run the asset pipeline to play.

## Controls

| Action | Touch | Mouse |
| --- | --- | --- |
| Pan the camera | One-finger drag | Drag |
| Zoom | Pinch | Mouse wheel |
| Interact | Tap | Click |
| Plant | Tap an empty field, pick a seed, then tap or **swipe across** fields (or drag a seed from the tray) | same |
| Harvest | Tap a ripe field or **swipe across** ripe fields | same |
| Animals | Tap a home: collects what is ready and re-feeds from the barn in one tap; tap again to open it | same |
| Move a building | **Long-press** it, drag, then tick | Hold and drag |
| Build mode | Hammer button: tap any building to move, rotate or store it | same |
| Place from the shop | Drag the ghost (green = OK, red = blocked), rotate, tick | same |

Other buttons: Shop, Build, Barn (inventory and storage), Quests, Awards, Book (collection), Me (character),
Settings (gear), and Leaders on the side (who is leading by level, farm value, Charm and this week's XP). Tap the level badge for the unlock path. Tap the goal card for the next thing to do.

**Debug panel:** tap the level badge 5 times quickly. It can add currency/XP, skip time, finish timers, grant
crates, show FPS and reset the save.

## How the game is organised

```
src/core      renderer, camera rig, touch input, game loop (idle throttling, pause when hidden), asset loader
src/world     terrain, environment (day/night, clouds, birds), farm view (instanced buildings, crops, animals),
              procedural fallback models, characters (recolourable), pathfinding, villagers, effects, thumbnails
src/systems   Game state + event bus, Buildings, Land, Farming, Animals, Production, Economy (orders, truck,
              stall, merchant), Progression (unlocks, achievements, quests, daily, crates, events), Goals,
              Save, Offline, Audio, Settings
src/scenes    boot sequence, FarmScene (3D side), Interaction (tap/swipe/build modes), Player
src/online    online play: backend contract, local practice backend, Supabase backend, profile sync
src/ui        HUD, panels, world popups/bubbles, tutorial, feedback (toasts, floating numbers, flying coins)
src/data      every balance number, as JSON
```

Systems never call the UI directly: they emit events on the typed event bus (`src/systems/Game.ts`) and
achievements, quests, sounds and effects listen.

## Editing game data

All balance lives in `src/data/*.json`; no code changes are needed to rebalance:

| File | What it controls |
| --- | --- |
| `crops.json` | crops (level, seed cost, grow time, yield, XP, models per growth stage) and fruit trees |
| `animals.json` | animals, their home, feed, product, production time, XP, price growth |
| `items.json` | every item's name, sell price and icon |
| `recipes.json` | production recipes per building (inputs, output, time, XP, unlock level) |
| `buildings.json` | every placeable (size, price, build time, model, charm, caps), farmhouse levels and upgrade costs |
| `levels.json` | XP needed per level, level-up rewards, order-board slots |
| `economy.json` | starting resources, orders, truck, stall, merchant, charm bonuses, gem speed-up price |
| `achievements.json`, `quests.json`, `rewards.json` | awards, quest templates, daily calendar and crate tables |
| `events.json` | seasonal events (dates, token, quests) |
| `cosmetics.json` | skin tones, hair and outfit colours, hats, accessories, pets and how they unlock |
| `land.json` | map size, expansions, obstacles |
| `tutorial.json` | tutorial steps |

Run `npm run validate-data` after editing. It checks references (items, buildings, models) and that every level
from 2 to 50 unlocks something. CI runs it before every deploy. See [BALANCE.md](BALANCE.md) for the
progression design.

## Assets

```bash
npm run fetch-assets   # clone the CC0 source packs into .asset-cache/ (git, sparse)
npm run assets         # rebuild public/assets: meshopt GLBs, shared atlases, MP3 audio, fonts, icons, manifest
```

`scripts/build-assets.mjs` lists exactly which source files are used. Credits for everything are in
[CREDITS.md](CREDITS.md) and in-game under Settings > Credits.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`:

1. In the repository settings, open **Pages** and set **Source** to **GitHub Actions** (one time).
2. Push to `main`. The workflow sets `BASE_PATH=/<repo-name>/`, so asset URLs and the service worker work under
   the Pages subpath. For a custom domain, build with `BASE_PATH=/`.
3. Optional, for real online play: add the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` repository variables
   as described in [ONLINE.md](ONLINE.md) and re-run the deploy.

## Testing helpers

- `node tools/shot.mjs <url> <prefix> 375x667 390x844 768x1024 [--clear] [--actions file.mjs]`: screenshots in
  headless Chromium at phone/tablet sizes and prints console errors.
- `node tools/perf.mjs <url> [cpuThrottle]`: builds a busy 100-building farm and reports draw calls,
  triangles and frame time.
- `node tools/playtest.mjs <url>`: plays the tutorial and about an hour of farming through the real UI and reports
  progression and any errors.

## License

Code: MIT. Third-party assets: see [CREDITS.md](CREDITS.md) (CC0, MIT, Apache-2.0, OFL).
