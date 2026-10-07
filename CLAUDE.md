# Cozy Acres - Project guide for Claude

Last updated: 7 October 2026 (game version 1.8.1). Owner: Josh Makes Games.

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
| Current game version | **1.8.1** (1.8.0 "Village Friends" + blank-screen fix) (`package.json` and the newest entry in `src/data/changelog.json` must match) |
| Hosting | GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main` |
| Backend | Supabase (`supabase/schema.sql`, Edge Function `supabase/functions/send-push`) |
| Android app | Trusted Web Activity built with Bubblewrap (`android/`) |
| Licence | All rights reserved. Third-party art is CC0/MIT etc. (`CREDITS.md`) |

**1.8.0 added:** six villagers (Rosa, Old Tom, Juniper, Pip, Hazel, Bram) with hearts, daily gifts, letters, keepsakes and perks; silver/gold starred items; a mailbox with daily visits and finds; Ask a friend; fertiliser; weather; new Book pages (Calendar, Letters, Village Guide); and a one-off welcome flow with a head start for pre-1.8 farmers.

---

## 2. Repo map

```
src/core      renderer (Renderer.ts), camera, touch input, game loop, asset loader
src/world     terrain, environment (sky, weather visuals), farm view, characters, villagers, effects
src/systems   game state + event bus, farming, animals, production, economy, progression, save, audio,
              Village, VillageRewards, Perks, Mail, Help (Ask a friend), Weather, Quality (silver/gold),
              Welcome18, Daily18, AdminGifts, Settings
src/scenes    Boot, FarmScene, Interaction, Player, Visit
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

**GPU safety net (added in 1.8.1, needs confirming on a real Pixel 10 Pro).** The Pixel 10 Pro (Imagination PowerVR) showed a white 3D view on Medium/High, probably from shadow maps. Now: `src/core/Renderer.ts` detects PowerVR/Imagination (`WEBGL_debug_renderer_info`) and defaults the new `settings.shadows` to off there; `src/scenes/GpuGuard.ts` reads pixels after the first frames and, if the frame is blank, turns shadows off, then drops to Low and saves it, and handles `webglcontextlost`/`restored`; Settings > Graphics has a Shadows switch. GPU info and fallbacks go to the admin dashboard via `logEvent` (kinds `gpu_info`, `gpu_fallback`, `gpu_context_lost`, `gpu_context_back`, `gpu_blank_low`; only when signed in online). If a phone still shows white: Settings > Graphics > Low. The `onBeforeCompile`/`ShaderMaterial` GLSL in `Terrain.ts` and `FarmView.ts` was reviewed and looks valid (no strict-compiler problems found), but it was not tested on PowerVR.

**Other rough edges (not fixed):**
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
- **Debug in the browser:** `window.__game`, `window.__ui`, `window.__scene`.
- **Playwright** reports panel buttons as "not stable"; tests use `force: true` or DOM clicks.

---

## 8. Open to-dos

- [ ] **Confirm the 1.8.1 white-screen fix on the Pixel 10 Pro** (section 6). If still white, check the `gpu_info` events for the GPU string.
- [ ] Make sure the latest `supabase/schema.sql` (1.8 game events, letters, Ask a friend) has been run in Supabase.
- [ ] Change GitHub default branch to `main` (Settings > General).
- [ ] Delete the old draft Play app locked to `com.cozyacres.joshmakesgames`.
- [ ] Recruit 15-20 closed testers (13+). Each joins the Google Group first, then uses the opt-in link.
- [ ] Optional: update `.github/workflows/android.yml` (Node 24 actions, `actions/setup-java@v5`) to clear deprecation warnings. `ubuntu-latest` moves to Ubuntu 26 from 19 October 2026, so check the next Android build still passes.
- [ ] After 14 days: apply for production, add the official Google Play badge to the website (`design/cozy-acres-website/src/assets/img/google-play-badge.png` is a placeholder), and add the Play link to the site.
- [ ] Ideas for 1.8.5+ (not started): Village Restoration (community bundles), Skills, new workshops and animals, level 20-50 map, village market day (Saturdays; only a placeholder label exists in the Calendar). Design brief: https://claude.ai/code/artifact/e5fdf6a6-b0a8-4bb5-946d-58ca740c01c1
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

- 2026-10-07: Game 1.8.1: blank-screen fix for PowerVR phones (shadows default off, blank-frame fallback, Shadows switch, context-loss handling, GPU events). CLAUDE.md added to the repo.
- 2026-10-07: Game 1.8.0 "Village Friends" released (villagers, hearts, letters, perks, mailbox, Ask a friend, silver/gold items, fertiliser, weather, welcome flow). Pixel 10 white screen diagnosed (shadows); fix still to do.
- 2026-10-06: Game 1.7.0 (admin dashboard, gifts that arrive by themselves, feedback, play statistics).
- 2026-10-06: Google Play setup: new app `app.joshmakesgames.cozyacres`, minSdk 24, versionCode 4 uploaded, assetlinks with both fingerprints, closed test sent for review.
