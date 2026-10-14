# Handover for Opus: review the game so far and plan what comes next (15 Oct 2026)

You are picking up Cozy Acres from a long run of Sonnet sessions. Two jobs, in this order:

1. **Audit** what has been built up to and including 1.15.0 (section 4 says what to check and where).
2. **Propose a large-scale plan** for future improvements and content (section 6 gives the constraints and a starting
   point; your plan should replace or sharpen it, not just agree with it).

Read `CLAUDE.md` first (rules, commands, repo map), then `BALANCE.md` (every number and why). This file does not repeat them.

## 1. The project in one paragraph

Cozy Acres is a mobile-first 3D farming and village builder that runs in the browser and installs as an offline PWA
(Three.js + TypeScript + Vite, about 38,000 lines of TypeScript in 262 source files, 37 JSON data files). Optional online
play (friends, gifts, market, leaderboards, farm visits, Ask a friend, cloud saves) runs on Supabase. An Android Trusted
Web Activity wraps the live site and is in Google Play closed testing; web deploys reach it without a new build.
Owner: Josh Makes Games. Repo `JLA92-bit/Cozy-Farm`, work on `main`; pushing deploys through GitHub Pages.
Live game: https://cozyacres.joshmakesgames.app/play/ . Admin dashboard: `/admin/` (see `ADMIN.md`).

## 2. State of play

| Item | Value |
| --- | --- |
| Game version | **1.15.0 "Looking After the Farm"**, pushed 14 Oct 2026 (commit 2a0e99b on `main`) |
| Working tree | clean, `main` = `origin/main` |
| Content size | 31 crops, 8 trees, 8 animals, 114 recipes, 315 placeable buildings/decor, 68 achievements, levels authored to 100 |
| Levels | endless (`maxLevel` 999, authored content to `authoredMax` 100, Level Markers to 300) |
| Android | versionCode 4 (frame version 1.6.0), closed test sent for review 6-7 Oct; next build must be 5+ |
| Supabase | `supabase/schema.sql` (3,200+ lines, one re-runnable file). **The owner must run the whole file after each release that adds server work.** 1.15.0 added the `upkeep` game setting; confirm it has been run |

## 3. What was built since the last handover (1.8.0), newest first

Each line says what a player gets and where the code is. Balance reasoning is in `BALANCE.md` by version.

- **1.15.0 Upkeep.** From level 12 animals age and fall unwell; untreated ones wander off but can be brought back for a fee;
  workshops and animal homes wear down and need repair. Slow by design (about 25 played days to "weathered", 60 to
  "broken"). Days away or offline count at 25% for up to 14 days and can never cost an animal. Treating needs the **Vet's
  Cottage** and repairing needs the **Carpenter's Workshop** (level 10; KayKit hex models `bld/vet`, `bld/lumbermill_red`).
  Remote strength dial 0-2 (Dashboard > 1.9 settings). Code: `src/systems/Upkeep.ts`, `src/data/upkeep.json`,
  `src/ui/panels/CarePanel.ts`, `UpkeepUI.ts`, `AnimalPanel.ts`, `ProductionPanel.ts`, `src/online/GameConfig.ts`.
- **1.14.0 The Grand Estate.** Levels 81-100 content, about 90 decor pieces in sets, 4 crops, 12 dishes, Farmhouse 13-14;
  **Master Board** (3 weekly challenges, streak plaques) and the gem-only **Boutique**; a boat per Boat Visitor theme;
  new CC0 asset packs through `scripts/fetch-assets.sh` + `ADD_ONLY=... node scripts/build-assets.mjs`.
  Code: `Master.ts`, `MasterPanel.ts`, `master.json`, `scripts/build-assets.mjs`.
- **1.13.0 Endless levels.** Owner's rule: no top level, no prestige. Levels past 60 are worked out in `src/data/index.ts`;
  every level 61-300 gives a Level Marker decoration (`Endless.ts`, `models/ranks.ts`).
- **1.12.0 Leaderboard trophies** (`Ranks.ts`): big-number decor for 1st/2nd/3rd/Top 10 on each board, needs 6+ farmers.
- **1.11.0 The Master Farm** (levels 51-60), **1.10.0** (crops 41-47, Rabbit Hutch, animal names/pats/hearts in `Animals.ts`,
  Boat Visitors, Farm look), **1.9.x** (festival cycle, Wild Woods island, Museum, expeditions, Help Wanted, fishing
  extras, Almanac; **seasons were built then removed in 1.9.2** because unavailable plants felt difficult),
  **1.8.5-1.8.9** (Skills, Village Restoration square, Pier, Kitchen, Workshop crafting, Beehive/Duck/Juice/Kiln/Stable
  buildings, layered placement, boats, Marlow Pike's fish stall, path/fence line placement).
- Also done: "Select many" storing works like swipe-harvesting (same kind only), haze/fog pushed far out, helping friends
  while visiting fixed, trophies enlarged.

## 4. Audit checklist (what to verify, most valuable first)

Nothing below is known to be broken. It is a list of where the risk is.

1. **Save safety (highest risk).** Every release added optional state fields repaired in `src/systems/Save.ts`
   `withDefaults`. Read the repair rules for: `animals[].born/sickAt/sickDays`, `building.wear`, `state.upkeep`,
   `state.master`, `state.boutique`, `state.endless`, `state.ranks`. Try loading an old (pre-1.8) save, a cloud save and a
   corrupt one. Look for anything that can throw during load or silently drop data. Check `FarmSnapshot.ts` (visit and
   friend views) still copes with the new animal fields.
2. **Economy at the top end.** `npm run simulate-economy` predates endless levels, Master rewards and the Boutique gem
   sink. Check that coins/hour, order rewards and Farmhouse costs still make sense at levels 60-100 and that nothing is a
   runaway source (Master claims, trophies, markers, boat visits). `BALANCE.md` states the intended margins.
3. **Upkeep (newest, least exercised).** Logic in `Upkeep.ts` was tested in headless Chromium only for single steps.
   Review: the away catch-up maths (`check()` and `step(rate, days)`), the wander/return guarantees, treat/repair gating
   when the vet/carpenter is missing or still under construction, existing farms with no vet at level 12+, interaction
   with the Animals skill and Happy Herd, and the `gameConfig.upkeep` dial offline.
4. **Performance and size.** Service worker precaches about 10 MB (780 entries) after the 1.14 asset packs. Check first
   load, memory on low-end phones, draw calls with 700+ decor pieces (Farmhouse 14 allows 720), and `GpuGuard` behaviour.
5. **Server side.** `supabase/schema.sql`: row-level security on every table, `admin_guard()` on every admin function,
   account-deletion cascade, the `game_config` allow-list (now `market_day`, `weather`, `upkeep`), rate limits on gifts,
   Ask a friend and reward codes. Check Edge Function `send-push`.
6. **Dead and duplicate code.** Seasons were removed in 1.9.2 (look for leftovers), `VillagerLooks18.ts` duplicates
   `villagers.json`, two keepsake model files, `PLAN-1.9.md` is partly obsolete, and `CLAUDE.md` section 8 to-dos are
   out of date.
7. **Test coverage.** There is no automated test suite. The only checks are `tsc`, `validate-data`, the economy simulator
   and ad-hoc headless-browser scripts (`tools/shot.mjs`, `playtest.mjs`, `perf.mjs`). Judge whether a small
   regression suite (save fixtures, smoke boot on Low/Medium/High, panel opens) is worth adding before more features.
8. **Accessibility and text.** Hyphens only (no em dashes) in all player text; check contrast and tap-target sizes on
   the newer panels (`CarePanel`, `MasterPanel`, Boutique), and that nothing relies on colour alone.

Not yet looked at by anyone: the new Vet's Cottage and Carpenter's Workshop standing on a real farm (only seen on a
contact sheet and in panels), and the boat-visitor boats (scaled down to fit the east berth; never confirmed visually on
a boat day).

## 5. Rules and decisions that must survive any plan

- **No prestige, no reset, ever.** Always more levels and more to unlock (owner's rule, 13 Oct).
- **No romance or marriage.** Villagers are friends only. Audience is 13+ (names and gift notes are unmoderated).
- **Cozy first.** Seasons were removed because things becoming unavailable felt punishing. Upkeep is the deliberate,
  slow exception; anything that takes something away needs a recoverable window and must never fire while the player is away.
- **Never push or deploy without the owner's explicit "yes push".** Say in 2 lines what goes live and wait.
- Never touch the keystore, passwords or `.jks`; do not change `android/twa-manifest.json`, `ANDROID_*` variables or the
  package name unless asked. Admin email is never committed. Supabase player data is for support only.
- Text: hyphens, never em dashes. Keep the brand "Cozy Acres". When addressing the user's school use `<School Name>`.
- Systems never call UI directly (typed event bus). All balance numbers live in `src/data/*.json`; run `validate-data`
  after editing them and `npm run build` after code. Every new save field is optional with a repair rule.
- The owner likes small, reviewable releases (one version, one theme) and a plain-language summary of what goes live.

## 6. Plan for the future (starting point - improve it)

The game is content-rich but the foundations have not grown with it. Suggested order: **foundations, then depth, then
reach, then content cadence in parallel throughout.**

### Phase A - Foundations (1.16, one release)
- Automated regression suite in CI: tsc, `validate-data`, save-fixture load tests (old, cloud, corrupt), headless boot
  on Low/Medium/High, open-every-panel smoke test. Block the deploy on failure.
- Save versioning with a migration log instead of only defensive defaults; export/import backup in Settings.
- Extend `simulate-economy` to levels 60-300, Master, Boutique and upkeep costs; add a balance report to CI output.
- Perf budget: asset size cap, lazy-load late-game decor models, instancing for repeated decor, a low-end profile.
- Error telemetry through the existing `logEvent` channel (uncaught errors, save repair counts, GPU events) with a
  dashboard page.
- Clean-up: remove season leftovers, unify villager looks, refresh `CLAUDE.md` section 8.

### Phase B - Depth for the middle and late game (1.17 to 1.20)
- **Upkeep follow-through:** vet and carpenter levels (faster, cheaper, preventive care), Animals-skill perks that cut
  sickness, a Barn/Farmhouse "care round" quick action, and a gentle similar upkeep for fields (scarecrow/fertiliser
  wear) only if the first month of play data says players enjoy it. Use the Upkeep strength dial to tune live.
- **Estate projects:** long multi-week goals (build a wing of the Farmhouse, a clock tower, a market hall) paid in goods,
  coins and Master tokens, so level 60+ players always have a visible next target without prestige.
- **Specialisation, not reset:** optional "Masteries" per workshop/animal line (already seeded by Mastery plaques) giving
  permanent flavour bonuses; no loss, no reset.
- **Automation tier:** helpers (sprinklers, auto-feeders exist) extended to hired farmhands with schedules, so large
  farms stay playable on short sessions.
- **Second island / Farm annexe:** a second buildable plot (orchard island or hill farm) gated by level and Estate
  projects; the Wild Woods and Village Square already prove the multi-scene pattern (`scenes/`).
- **Fishing and Foraging depth:** aquarium/pond building, fish breeding, a collection goal with Museum tie-in.

### Phase C - Social and live play (1.21 to 1.24)
- Co-operative **Village Projects**: friends contribute goods to a shared build with named contributor plaques.
- Neighbourhoods (small groups of 5-20) with a shared weekly goal and a chat-free emote/gift system (keeps moderation
  risk low for a 13+ audience).
- Real-date events built on `cycle.json` and the `game_config` dial (egg hunt, lights festival exist) with
  non-punishing catch-up; seasonal-feeling decor only as cosmetics, never availability pressure.
- Trading improvements: market price history, wishlists, fair-price hints, anti-abuse limits.
- Leaderboard variety (weekly, friends-only, per-skill) alongside the trophies already built.

### Phase D - Reach and platform (parallel, owner-driven)
- Google Play: finish the 12-testers-for-14-days closed test, apply for production, add the Play badge to the website.
- iOS via Capacitor with native push, offline bundle and Sign in with Apple (a plain web wrapper risks App Store 4.2).
- Accessibility pass (reduced motion, colour-blind safe cues, larger text option, screen-reader labels on panels).
- Localisation scaffolding: move player text into keyed JSON, start with one extra language.
- Audio and polish: ambient mixes per weather/time, haptics, a photo mode with frames and share cards.

### Phase E - Content cadence (every release, about 20 levels at a time)
- Per batch: 4 crops, 10-12 dishes, 1 or 2 animals or workshops, 40-90 decor pieces in two or three themed sets, a
  Farmhouse level or two, a Master Challenge or two, one new mini-feature. Raise `authoredMax`, run `validate-data`
  (it insists every level up to `authoredMax` unlocks something).
- Sources: more CC0 packs via the asset pipeline (candidates listed in the scratchpad `MODEL-REVIEW.md` of the last
  session if it still exists; otherwise rescan KayKit, Kenney and Quaternius). Recolour existing animals (koala,
  giraffe, parrot models exist unused) for new stock without new art.
- Story: a second villager arc per six villagers, friend-only heart events at 12/14, a letter series per release.
  More villagers are fine; keep them friends only.

### Open questions for the owner (ask before building)
1. Monetisation: is there any plan beyond gems earned in play? If so, set hard rules now (no pay-to-win, no
   timers that sell speed-ups past the current gem speed-up, 13+ appropriate).
2. How many hours a week of play should the late game ask for? (It sets the pace of Estate projects and upkeep.)
3. Appetite for a second island/farm versus deepening the existing one.
4. Is a small automated test suite acceptable before the next feature release, even if it slows 1.16?

## 7. How to work in this repo (short form)

```bash
npm install
npm run dev              # http://localhost:5173 (use --port N to avoid clashes)
npx tsc --noEmit
npm run validate-data    # after any src/data/*.json edit
npm run build
bash scripts/pages/build.sh   # game + admin + website into dist/ (before any push)
node tools/shot.mjs <url> <out-prefix> 844x390 --actions <script.mjs>   # headless screenshot/driver
```

Handy facts: debug handles are `window.__game`, `window.__ui`, `window.__scene`, `window.__upkeep`. Playwright reports panel
buttons as "not stable", so tests click through the DOM or use `force: true`. Use explicit placements in tests (avoid
whole-map scans) and `buildings.remove(uid)` rather than resetting uids. Never `pkill -f`; kill by port. Only GitHub is
reachable for asset downloads from the cloud environment. Panels: `Panel` with `ui.register(id, opener)` and
`ui.onBuildingTap`; world bubbles via `addBubbleProvider`; one-time tips via `hints.firstTime` and the `INTROS` /
`CROP_TIPS` tables in `src/systems/Hints.ts` (add an entry for every new building or crop). New server work is appended
to `supabase/schema.sql` as a marked section.

## 8. Housekeeping

- Last handover: `HANDOVER-OPUS.md` of 7 Oct (1.8.0). This replaces it.
- Everything in 1.8.5 to 1.15.0 is pushed and live. Open owner tasks: run the full `schema.sql` in Supabase, recruit
  closed testers, change the GitHub default branch to `main`, delete the old draft Play app, and decide the open
  questions in section 6.
