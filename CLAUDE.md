# Cozy Acres - Project guide for Claude

Last updated: 8 October 2026 (game version 1.9.0 "A Year in the Valley" built locally; live is 1.8.8, 1.8.9 and 1.9.0 are committed but not pushed). Owner: Josh Makes Games.

Read this first in any new session. It covers what the project is, where things live, how to build and ship, where the Google Play launch is up to, and the rules that have caught us out before.

---

## 1. What this is

Cozy Acres is a mobile-first 3D farming and village builder that runs in the browser. It's built with **Three.js + TypeScript + Vite** and installs as an offline PWA. Optional online play (friends, gifts, shared market, leaderboards, farm visits, Ask a friend) runs on **Supabase**, with Google sign-in for cloud saves.

| Item | Value |
| --- | --- |
| Repo | https://github.com/JLA92-bit/Cozy-Farm (work on `main`) |
| Website | https://cozyacres.joshmakesgames.app/ |
| Game | https://cozyacres.joshmakesgames.app/play/ |
| Admin dashboard | https://cozyacres.joshmakesgames.app/admin/ (see `ADMIN.md`) |
| Current game version | **1.9.0 "A Year in the Valley"** (local, not pushed; live is 1.8.8) (`package.json` and the newest entry in `src/data/changelog.json` must match) |
| Hosting | GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main` |
| Backend | Supabase (`supabase/schema.sql`, Edge Function `supabase/functions/send-push`) |
| Android app | Trusted Web Activity built with Bubblewrap (`android/`) |
| Licence | All rights reserved. Third-party art is CC0/MIT etc. (`CREDITS.md`) |

**1.9.0 added (local until pushed):** four seasons on a shared 28-day calendar (`seasons.json`, `Seasons.ts`; seasonal crops only plantable in season, in-season bonus, HUD pill, Hazel letter), Glass Frame (`glass_frame`, an onField 2x2 that ignores seasons), 16 seasonal fish (`season` in `fish.json`), season look (grass/sky/mote tints in `Terrain.ts`/`Environment.ts`, vertex colours only), Festival Days (`festivals.json`, `Festivals.ts`, `ui/panels/FestivalPanel.ts`: Egg Hunt, Fishing Derby, Harvest Fair, Feast of Lights), the Wild Woods island (`woods.json`, `Woods.ts`, `world/WoodsView.ts`, `scenes/Woods.ts`, `WoodsGate.ts` on the south beach; forage, dig spots, Foraging skill), Museum (`museum.json`, `Museum.ts`) and expedition board (`expeditions.json`, `Expeditions.ts`) in the woods, Help Wanted (`HelpWanted.ts`), heart events at 2/6/10 (`stories` in `villagers.json`), pet finds (`PetFinds.ts`), 9 new Collection Book pages + Master Collector + Almanac page (`AlmanacPage.ts`), dashboard page "1.9 Year" and server game settings (`online/GameConfig.ts`, `game_config` table). Not built from `PLAN-1.9.md`: villager schedules, the four real-date events were not folded into festivals, no decorations/buildings/recipes book pages, Museum is in the woods not a seventh square lot. Balance: `BALANCE.md`.

**1.8.5 added:** five skills (Farming, Animals, Fishing, Cooking, and Crafting once the Workshop is rebuilt; level 1-10, 20 perks, head start for old farms; `src/systems/Skills.ts`, `SkillEffects.ts`, `skills.json`, Me > Skills) and Village Restoration (an island village square across the water with six lots, all rebuilt with bundles: Pantry, Barn Room, Pier, Kitchen, Workshop, Treasury; `src/systems/Restoration.ts`, `RestorationEffects.ts`, `restoration.json`, 3D scene `src/world/SquareView.ts` + `src/scenes/Square.ts`, room screens `SquarePanel.ts`, the signpost/jetty on the farm's east beach `SquareGate.ts`). Rewards: Rosa's rare seeds (new item `rare_seed`, seed tray toggle), animals 10% faster, trucks +15%, Saturday market day (orders and stall +10%), the Pier (second fishing spot on the west beach, `FishSpots.ts`, `FarmPier.ts`, nine fish with `spot: "pier"`), the Village Kitchen workshop (`building.room`, 8 recipes), Bram's forge crafting (`crafting.json`, `Crafting.ts`, `HelperEffects.ts`: sprinkler, auto-feeder, quality fertiliser) and, when all six rooms are done, the village festival (golden Village Hero statue, bunting, Hazel's letter; `restoration.festival`). Dashboard page "1.8.5 Square". Design: `PLAN-1.8.5.md`, balance: `BALANCE.md`.

**1.8.0 added:** six villagers (Rosa, Old Tom, Juniper, Pip, Hazel, Bram) with hearts, daily gifts, letters, keepsakes and perks; silver/gold starred items; a mailbox with daily visits and finds; Ask a friend; fertiliser; weather; new Book pages (Calendar, Letters, Village Guide); and a one-off welcome flow with a head start for pre-1.8 farmers.

---

## 2. Repo map

```
src/core      renderer (Renderer.ts), camera, touch input, game loop, asset loader
src/world     terrain, environment (sky, weather visuals), farm view, characters, villagers, effects,
              SquareView/SquareGate (the village square island and the way to it)
src/systems   game state + event bus, farming, animals, production, economy, progression, save, audio,
              Village, VillageRewards, Perks, Mail, Help (Ask a friend), Weather, Quality (silver/gold),
              Welcome18, Daily18, AdminGifts, Settings, Skills (+SkillEffects, SkillMath), Restoration (+RestorationEffects)
src/scenes    Boot, FarmScene, Interaction, Player, Visit, Square (going to the village square), GpuGuard
src/online    Supabase backend, practice backend, profile sync, Google sign-in, cloud saves
src/notify    phone notifications (web push)
src/ui        HUD, panels (src/ui/panels: Village, Mail, Help, Welcome18, BookPages18, Settings...), popups
src/data      ALL balance numbers as JSON: crops, animals, items, recipes, buildings, levels, economy,
              villagers.json, guide-*.json (help/mail/quality/villager guides), changelog.json ...
admin/        admin dashboard (its own Vite app)
android/      twa-manifest.json, upload-key maker, assetlinks template, README
store/        Play listing text, data safety answers, tester kit, test log, screenshots
supabase/     schema.sql + Edge Functions
scripts/      asset pipeline, data validator, economy simulator, Pages build
tools/        screenshot, performance and playtest scripts
design/       website source and graphics
```

Systems never call the UI directly: they emit events on the typed event bus (`src/systems/Game.ts`).

Key docs: `README.md`, `ONLINE.md` (Supabase, sign-in, notifications, game events, letters, Ask a friend), `ADMIN.md`, `BALANCE.md`, `android/README.md`, `store/checklist.md`, `store/data-safety.md`, `CLOUDFLARE.md` (parked), `DOMAIN.md`.

---

## 3. Commands

```bash
npm install
npm run dev             # local play at http://localhost:5173
npm run build           # type-check + production build
npm run typecheck
npm run validate-data   # run after ANY edit to src/data/*.json (CI runs it too)
npm run simulate-economy
```

Testing helpers: `node tools/shot.mjs`, `node tools/perf.mjs`, `node tools/playtest.mjs` (see README).

---

## 4. How changes ship

| You changed... | What happens |
| --- | --- |
| Anything in the game, website or admin | Push to `main`. The deploy workflow publishes it in a few minutes. Players get it on their next app open. **No new Android build needed.** |
| App name, icon, colours, notifications flag, or Google raises the target SDK | Run **Actions > Build Android app (TWA)** with the next versionCode, then upload the `.aab` in Play Console. |
| Database (new tables/functions) | Paste the latest `supabase/schema.sql` into Supabase SQL Editor and run it (safe to re-run). |
| Online features or data collected | Update `store/data-safety.md`, the privacy policy and the Play Data safety form. |

When bumping the game version, update **both** `package.json` and the newest entry in `src/data/changelog.json`. `validate-data` checks they match.

---

## 5. Google Play status

| Item | Value |
| --- | --- |
| Package name (permanent) | `app.joshmakesgames.cozyacres` |
| Latest versionCode uploaded | **4** (version name 1.6.0 - the app frame's name; the game itself updates via the website). Next build must use **5+**. |
| minSdkVersion | 24 (needed for Play automatic protection) |
| Play app signing SHA-256 | `65:7E:42:04:98:23:2C:E0:E9:CE:5E:FD:5F:72:45:92:6D:DE:DB:4A:40:76:E5:51:F9:3E:2E:09:73:DA:4F:10` |
| Upload key SHA-256 | `4F:81:15:23:BD:6C:CD:E9:3F:78:77:6D:84:76:77:49:FD:C1:04:80:85:41:26:CD:FD:B9:28:F7:DA:96:79:8A` |
| Tester opt-in link | `https://play.google.com/apps/testing/app.joshmakesgames.cozyacres` |

**Where it's up to:** internal testing works. App content, store listing and graphics are done. The closed test release (bundle 4) was sent for review on 6-7 October. Next: once approved, invite testers, keep **12+ opted in for 14 days in a row**, log feedback in `store/test-log.md`, then apply for production (`store/checklist.md` section 6). The admin dashboard has a closed test tracker.

**GitHub settings (Settings > Secrets and variables > Actions):**
- Secrets: `ANDROID_KEYSTORE_BASE64`, `BUBBLEWRAP_KEYSTORE_PASSWORD`, `BUBBLEWRAP_KEY_PASSWORD`
- Variables: `ANDROID_PACKAGE` = `app.joshmakesgames.cozyacres`; `ANDROID_CERT_SHA256` = app signing key, then upload key, comma separated, no spaces
- Supabase and VAPID variables as per `ONLINE.md`
- Cloudflare secrets were **removed** (that deploy was failing). Don't re-add them until the Cloudflare move is picked up again.

---

## 6. Known issues

**GPU safety net (added in 1.8.1, confirmed working on a Pixel 10 Pro by Josh).** The Pixel 10 Pro (Imagination PowerVR) showed a white 3D view on Medium/High, probably from shadow maps. Now: `src/core/Renderer.ts` detects PowerVR/Imagination (`WEBGL_debug_renderer_info`) and treats an unset `settings.shadows` as off there (a player's own choice always wins); `src/scenes/GpuGuard.ts` reads pixels once the boot screen is gone and, if 9 spread-out pixels are all white or transparent, turns shadows off, then drops to Low and saves it (it checks once per quality: `settings.gpuChecked`; picking a quality or the Shadows switch stops it for good), and handles `webglcontextlost`/`restored`; Settings > Graphics has a Shadows switch. GPU info and fallbacks go to the admin dashboard via `logEvent` (kinds `gpu_info`, `gpu_fallback`, `gpu_context_lost`, `gpu_context_back`, `gpu_blank_low`; only when signed in online). If a phone still shows white: Settings > Graphics > Low. The `onBeforeCompile`/`ShaderMaterial` GLSL in `Terrain.ts` and `FarmView.ts` was reviewed and looks valid (no strict-compiler problems found), but it was not tested on PowerVR.

**Other rough edges (not fixed):**
- 1.8.5: skills, the square, Pier, Kitchen, Workshop and festival were tested in headless Chromium, not yet on real phones. The welcome flow was not extended for them.
- 1.8.5: the dashboard page "1.8.5 Square" needs the `1.8.5 skills and village restoration` section of `supabase/schema.sql` run in Supabase.
- Market day is every Saturday in the player's local time (not a server calendar).
- Old players get six 2-heart tip letters at once on their first 1.8 boot (head start). Could be spread over days.
- Practice-mode demo neighbour "Old Tom" (`src/online/LocalBackend.ts`) shares a name with villager Old Tom.
- `src/world/VillagerLooks18.ts` and the welcome's look table duplicate `villagers.json` `look` (`look` wins; they are fallbacks only).
- `help_received` stat also counts older neighbour help, so the `help_arrived` event overcounts slightly.
- Ask a friend: if a claim response is lost, those items are lost (chosen over double delivery).

---

## 7. Rules learned the hard way

1. **Always edit `main`.** Builds and deploys only run from `main`. The GitHub default branch was once a `claude/...` branch, so web edits landed in the wrong place.
2. **Never commit the keystore, passwords or any `.jks` file.** `.gitignore` blocks them.
3. **versionCode always goes up.** Google never accepts the same number twice. To reuse an uploaded bundle on another track, use **Add from library**, not upload.
4. **Check the bundle before uploading.** The artifact name ends in the versionCode (`cozy-acres-android-5`). If in doubt, inspect it with bundletool (`dump manifest`).
5. **`ANDROID_CERT_SHA256` must hold both fingerprints.** If it's wrong, every player sees a browser bar at the top of the app. After changing it, re-run the deploy and check `/.well-known/assetlinks.json`. Phones cache the result, so reinstall to re-test.
6. **Play Console menus move often.** App signing is now under **Protected with Play > Play Store protection > Manage Play app signing**. Use the Console search box when a path doesn't match.
7. **Target audience is 13+.** Don't tick under-13 groups (gift notes and names are unmoderated free text).
8. **Don't write a literal em dash in code or text.** Use a hyphen.
9. **Test graphics changes on Low, Medium and High.** New phone GPUs can break effects that work everywhere else.
10. **No romance or marriage in the game, ever** (owner's rule). Villagers are friends only.
11. **The admin email is never committed.** `admin_users` is filled in SQL only. Every admin function calls `admin_guard()` and logs to `admin_log`.
12. **Never push or deploy without the owner's explicit OK.** Say in 2 lines what goes live and wait for "yes push".
13. **Player data from Supabase is for support only** and must not be shared.

## 7b. Code gotchas

- **Save changes:** every new state field must be optional or get a default and a repair rule in `withDefaults` (`src/systems/Save.ts`).
- **`supabase/schema.sql` is one re-runnable file.** Append new server work as a marked `-- ===== section =====` with grants like the others. Account deletion must cascade (tables reference `profiles`/`auth.users`). After running, `notify pgrst, 'reload schema';`.
- **Two keepsake model files:** `src/world/models/keepsakes.ts` (villagers, `KEEPSAKE_PROC`) and `FoundingSign.ts` (`FOUNDING_PROC`). Don't add another file that differs only by case.
- **Gift rules live only in `village.giveGift`** (love 40, like 20, neutral 8, dislike -20, birthday x3, stars x1.25/x1.5).
- **Economy:** only the barn pays star prices; orders, truck, stall and market take normal items first at normal price (`BALANCE.md`).
- **Gift codes** are client-side and capped at 500 coins; bigger amounts use server reward codes or dashboard gifts.
- **Pre-push checks:** `npx tsc --noEmit`, `npm run validate-data`, `bash scripts/pages/build.sh` (builds game, admin and website into `dist/`).
- **Layered placement (1.8.6):** `game.occB` holds the main object on a tile, `occP` the path under it, `occD` an `onField` item (scarecrow, sign, sprinkler...) standing on a field tile. Use `game.canPlace`/`tileFree(x, z, uid, type)`, `buildingAt` (main), `pathAt`, `overlayAt`. `FarmView.liftFor` raises objects onto fields (0.17) and paths (0.045).
- **Debug in the browser:** `window.__game`, `window.__ui`, `window.__scene`.
- **Playwright** reports panel buttons as "not stable"; tests use `force: true` or DOM clicks.

---

## 8. Open to-dos

- [ ] **Review and push 1.8.5** (built and committed locally; nothing is pushed until Josh says "yes push"). Run the whole `supabase/schema.sql` in Supabase afterwards for the new dashboard page.
- [ ] 1.8.6 content from the 1.8 design brief is all built (Beehive House, Ducks, Juice Press, Blueberries, Pottery Kiln, Horses, Peas and Lavender, Mastery plaques). Beehive to Blueberries are pushed; Kiln, Horses, Peas/Lavender and Mastery are committed locally until Josh says "yes push".
- [ ] Make sure the latest `supabase/schema.sql` (1.8 game events, letters, Ask a friend) has been run in Supabase.
- [ ] Change GitHub default branch to `main` (Settings > General).
- [ ] Delete the old draft Play app locked to `com.cozyacres.joshmakesgames`.
- [ ] Recruit 15-20 closed testers (13+). Each joins the Google Group first, then uses the opt-in link.
- [ ] Optional: update `.github/workflows/android.yml` (Node 24 actions, `actions/setup-java@v5`) to clear deprecation warnings. `ubuntu-latest` moves to Ubuntu 26 from 19 October 2026, so check the next Android build still passes.
- [ ] After 14 days: apply for production, add the official Google Play badge to the website (`design/cozy-acres-website/src/assets/img/google-play-badge.png` is a placeholder), and add the Play link to the site.
- [ ] 1.9 "A Year in the Valley" is planned in `PLAN-1.9.md` (seasons, festival days in the square, the Wild Woods and Museum, living villagers, Almanac and a fuller Collection Book; one deploy at the end, not built yet). Design brief: https://claude.ai/code/artifact/e5fdf6a6-b0a8-4bb5-946d-58ca740c01c1
- [ ] Later: iOS. A plain web wrapper risks App Store guideline 4.2 rejection. Capacitor with native features (push, offline bundle, Sign in with Apple) is the likely route. Meanwhile iPhone players can **Add to Home Screen** from Safari.

---

## 9. Working with Claude on this project

- **Default model: Claude Sonnet 5.5 (medium effort).** Use **Haiku 4.5** for tiny edits, and **Opus 5.5** only for large cross-cutting changes or bugs Sonnet fails twice on.
- One task per session. Use `/clear` between unrelated tasks.
- Give exact files and outcomes, e.g. "Add a blueberry crop unlocking at level 12 in `src/data/crops.json`, modelled on strawberries."
- After editing `src/data`, run `npm run validate-data`. After code changes, run `npm run build`.
- Match the spelling style already in the game text and keep the brand name "Cozy Acres". Use hyphens, not em dashes.
- Commit straight to `main` with a clear message, unless asked to open a pull request.

---

## 10. Keeping this file current

At the end of every task, check this file is still accurate. Update it only when something a future session needs has changed (version, versionCode, Play status, features, commands, rules, known issues, to-dos). Add one dated line to "Recent changes" and keep only the 10 newest. Keep this file short: no long explanations or code dumps.

## 11. Recent changes

- 2026-10-08: 1.9.0 (local): seasons, festivals, Wild Woods, Museum, expeditions, Help Wanted, collection pages, dashboard page and settings. Run the `1.9 a year in the valley` section of `supabase/schema.sql` after pushing.
- 2026-10-08: 1.8.9 (local): placing paths and fences continues in a line (`Interaction.nextInRun`): the next ghost sits beside the last piece and keeps its direction.
- 2026-10-08: 1.8.8 (local): boats (`world/Boats.ts`): the travelling merchant sails to the dock, climbs the new dock steps (Terrain.ts), sets up his cart and roams the farm (`Visitors.ts`); Marlow Pike arrives and leaves by boat (`PikeStall.ts`). `walkableOpen` lets arrivals cross unbought land.
- 2026-10-08: 1.8.7 (local): Marlow Pike's fish stall on the north beach (`PikeStall.ts`, `systems/FishStall.ts`, `fishstall.json`, `FishStallPanel.ts`): buy fish at 4-6x barn price, small daily stock.
- 2026-10-08: One-time tips (toasts via `hints.firstTime`, `src/systems/Hints.ts`) for the 1.8.5/1.8.6 buildings, new crops, layered placement and Mastery. Add an entry to `INTROS`/`CROP_TIPS` for any new building or crop.
- 2026-10-08: 1.8.6: Pottery Kiln, Horses and Stable (horse model from `scripts/make-horse.mjs`), Peas and Lavender, Mastery plaques (Me > Mastery). Local until pushed. Beehive House uses id `beehive_house` (decor `beehive` already existed); `validate-data` now rejects duplicate building ids.
- 2026-10-08: 1.8.5 pushed (live). 1.8.6 started: Village Hero title on the farmer screen, Beehive House workshop (level 20, `models/beehive.ts`, 4 recipes).
- 2026-10-07: 1.8.5 second half built locally: Pier, Kitchen, Workshop (Crafting skill, helpers), village festival. Still not pushed.
- 2026-10-07: Game 1.8.5 "The Village Square" built and committed locally (skills, village restoration with a 3D square, rare seeds, market day, dashboard page). Not pushed until Josh approves.
- 2026-10-07: Game 1.8.1: blank-screen fix for PowerVR phones (shadows default off, blank-frame fallback, Shadows switch, context-loss handling, GPU events). CLAUDE.md added to the repo.
