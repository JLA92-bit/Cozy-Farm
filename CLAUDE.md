# Cozy Acres - Project guide for Claude

Last updated: 25 October 2026 (game version 1.33.3 local on branch `ios-app`; 1.33.2 pushed (with the cloud session's 1.32.1); Android versionCode 6 uploaded, next build 7; iPhone app in `ios/`). Owner: Josh Makes Games. Latest handover: `HANDOVER-2026-10-25.md` (state, risks, the iPhone plan for the Mac session and a ready prompt).

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
| Current game version | **1.33.6** (local, needs schema.sql run); 1.33.5 local; 1.33.4 and 1.33.3 pushed (schema.sql run needed); 1.33.2, 1.33.1 and 1.33.0 pushed (schema.sql run needed for 1.33.0 and 1.33.1); 1.32.1 (Android sign-in fix from the cloud session, merged and pushed); 1.32.0 pushed (deploy run 73); 1.30.0 "Come On In" (needs schema.sql run); 1.20.1 to 1.28.5 were pushed on 17-21 Oct; `package.json` and the newest entry in `src/data/changelog.json` must match |
| Hosting | GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main` |
| Backend | Supabase (`supabase/schema.sql`, Edge Function `supabase/functions/send-push`) |
| Android app | Capacitor app with the game inside (`android/`, from 1.32; the old TWA is in `android-twa/`) |
| iPhone app | Capacitor iOS (`ios/`, built on the owner's Mac; `ios/README.md`, `npm run build:ios`) |
| Licence | All rights reserved. Third-party art is CC0/MIT etc. (`CREDITS.md`) |

**Leaderboard fair play (local, 17 Oct, server and dashboard only, no game version):** `upsert_profile` caps XP, farm value and charm with time-refilled allowances (token buckets in `profiles.lb_*_budget`), keeps the level within `level_for_xp(total_xp)` (the XP table is in SQL; `validate-data` checks it against `levels.json`, so re-generate it if the XP curve changes) and weekly XP within the XP gained; notes `lb_flag`, hides big jumps and new accounts past level 60 (`lb_hidden`). Dashboard Leaderboards page shows the flag. ONLINE.md "Leaderboard fair play".

**1.33.6 (local, 27 Oct): ghost taps and gem history.** A Samsung S23 Ultra sent a late second click after a tap on a building, pressing the gem Finish button that had just popped up under the finger: `markFresh` in `ui/dom.ts` (Panel.open, WorldUI.showPopup) ignores real clicks on anything shown less than 450 ms ago, and `gemButton` (dom.ts) needs a second tap ("Tap again") for every gem spend (popup, workshop, Farmhouse; the stall slot too; the Boutique already had two taps). `game.spend(coins, gems, on)` names what gems went on; Events.ts logs `gems_spent`; dashboard Support tab "Gems spent" (`admin_player_gems`, schema section `gem spending`). Needs `schema.sql` re-run.

**1.33.5 (local, 27 Oct): farm safety** (ONLINE.md "Farm safety", ADMIN.md backups). A player who lost their phone's farm and signed in again had their account's profile overwritten by the new phone's fresh farm (name Farmer, low stats; level kept by the server): `holdProfile` is now counted and also covers `ensureOnline`'s first publish, the app holds until its launch link is known, signed-in devices until the first cloud check. Choosing the smaller farm needs a second yes. Server: `cloud save history` (a replaced cloud farm is kept 180 days, last 5; Settings > Your farm > Earlier cloud farms; Support tab card) and `daily farm copies` (every online game sends its whole save once a day, `device_saves`; backups now daily 14 days then weekly to 60, source `device`). Privacy page and data-safety updated. **Needs `schema.sql` re-run.**

**1.33.4 (pushed 26 Oct): app sign-in, second try.** In the app, linking Google to the new anonymous account fails when that Google account already has a farm; the automatic second browser trip (no tap) could be stopped on its way back, leaving the player on Settings, not signed in. Now the app says "That account already has a farm" and the next tap signs straight in (`SWITCH_KEY`); a return handled twice is ignored (`handled`). Sign-in steps are kept on the device (`signInStep`, Settings > Online play > Sign-in steps, app only) for support screenshots. Needs an app build.

**1.33.3 (pushed 25 Oct): update prompt in the store apps** (`src/ui/UpdatePrompt.ts`, plugin `@capawesome/capacitor-app-update`): when the store has a newer version, a card offers Update or Later (once a day per version; Android uses Google's in-app update screen when allowed; iPhone needs `APP_STORE_URL` with the app id). Dashboard 1.9 page "Minimum app version" sets game_config `app_min` ({android, ios}; schema.sql `admin_set_game_config` accepts it): below it a full-screen "Time to update". Raise it only once the build is live in that store. Debug `__update.card()`, `__update.must()`. Needs `schema.sql` re-run and an app build.

**1.33.2 (pushed 25 Oct):** the Furniture Catalogue search no longer closes the phone keyboard after each letter (the search box stays in the page; only the hint redraws).

**1.33.1 (pushed 25 Oct): word filter** (ONLINE.md "Word filter"): `src/data/wordfilter.json`, `systems/WordFilter.ts` (Decor's sign filter moved here), server section `word filter` (`is_friendly()` in `upsert_profile` and `send_gift`; validate-data checks the lists match). Refused when typed (name, gift notes and codes, room names, signs); other players' unkind names show as "Farmer" (SupabaseBackend `nm()`, FarmSnapshot, HomeShare, Coop). Needs `schema.sql` re-run.

**1.33.0 (pushed 25 Oct): reports and blocks** (App Store 1.2; ONLINE.md "Reports and blocks", ADMIN.md "Reports"). Server section `reports and blocks` (`player_blocks`, `player_reports`, `block_player`/`unblock_player`/`my_blocks`/`report_player`, `blocked_between` (own pairs only), `assert_not_blocked` in `send_gift`, `farm_help_add`, `fill_help`, `coffee_visit`; it replaces the select policies on gifts, listings, farm_snapshots, farm_help, home_snapshots; admin `admin_reports`, `admin_report_set`, `admin_reports_open`, `admin_player_reports`). Tested on PGlite (Postgres 17 in Node, scratch only). Game: `systems/Blocks.ts`, `ui/panels/SafetyPanel.ts` (Report/Block on player cards, gifts, visit banner; Blocked list in Friends; blocked players nameless on boards), icons `flag`, `no_entry`. Dashboard Reports page (`admin/src/views/reports.ts`, badge) and a card on the player Support tab. Also: landscape phones wrap the side shortcuts above the dock. **Needs `schema.sql` re-run.** Regression checks on a Mac: `HEADED=1 node tests/regression.mjs` (headless Chrome 155 there cannot touch-scroll).

**iPhone app (25 Oct, Mac session, branch `ios-app`):** `ios/` (Capacitor 8, Swift Package Manager, iPhone only, URL scheme for the sign-in link, `ITSAppUsesNonExemptEncryption` false), icon and splash from `scripts/ios-icons.mjs`, `npm run build:ios` (`build:app` stays Android only for the Linux CI), `Native.ts` `isIosApp`/`isAndroidApp`/`storeUrl`/`APP_STORE_URL` (empty until the App Store page exists; the newer-save screen says TestFlight). Runs in the iOS Simulator. Sign in with Apple is built behind `APPLE_SIGN_IN` (off; setup steps in ios/README.md; token revoke on account deletion still to do). App Store listing, age rating and privacy answers: `store/app-store.md`; screenshots `store/screenshots/ios-*.png` (1320 x 2868). Still to do: Apple membership, TestFlight, submission.

**1.32.1 (local, 25 Oct): app sign-in fix.** Android could close the game while Google was open, so the deep link started the app afresh and `appUrlOpen` never fired (player back on the loading screen, not signed in). `launchLink()` (`App.getLaunchUrl`) is read by the first `connect()` and by `startCloud`; the sign-in intent and Supabase auth storage (PKCE verifier, session) also go to `durable` (`@capacitor/preferences`, `src/core/Native.ts`) in the app. Needs an app build (versionCode 6). Web unchanged.

**1.32.0 (pushed 25 Oct, deploy run 73): the Android app moves from TWA to Capacitor** (`android/README.md`). Testers would not take a TWA. `npm run build:app` (`CAP_BUILD=1`: base `/`, `dist-app/`, PWA plugin disabled) then `cap sync`; `capacitor.config.ts` (appId `app.joshmakesgames.cozyacres`, system bars hidden, `--safe-area-inset-*` CSS vars, used by `--safe-*` in styles.css); `src/core/Native.ts` (`isNative`, `SITE_URL`, `PLAY_URL`, `AUTH_RETURN`, `openExternal`, `onDeepLink`); Google sign-in in the app goes through the system browser and the deep link `app.joshmakesgames.cozyacres://auth` (`toGoogle`/`completeRedirect` in SupabaseBackend, `onDeepLink` in CloudSave), which must be in Supabase's redirect URLs; gift links use `SITE_URL`; push reports `'app'` (not in the app yet: FCM to do; the TWA had them through Chrome); no install button or SW update pill in the app; newer-save Update opens Play. Icons/splash `scripts/app-icons.py`. Workflow `.github/workflows/android.yml` (Java 21, SDK 36, same keystore secrets, versionCode from 5). Built and signed locally (debug and release). Game updates reach app players only through new app builds.

**1.31.2 (pushed 25 Oct, deploy run 72): dashboard Needs tab.** Player page tab Needs (`admin/src/views/needs.ts`, ADMIN.md "Needs"): today's requests, every unfinished project bundle by bundle (incl. the Old Mine entrance, now in `PROJECT_GROUPS`; `WAITS_FOR`/`AFTER_FESTIVAL` in `admin/src/gamedata.ts` for locks), next pickaxe, upgrades (coins), quests (status only); tick and gift in one press via `admin_give`. Game: developer gift items may be `silver__<id>`/`gold__<id>` (`giftItemKey` in `systems/AdminGifts.ts`, shown with a star in the gift popup); debug `__adminGift`. No server change. 111 regression checks.

**1.31.1 (pushed 25 Oct, deploy run 71):** the mine jetty moved west along the north beach (`MineGate` x -11; it stood beside the fishing dock at `DOCK.x` 5). Game only.

**1.31.0 (pushed 25 Oct, deploy run 70): The Old Mine** (`PLAN-1.31.md`, BALANCE.md "1.31"). An island across the water to the north (`MINE_AT` (0, 0, -130); floors drawn at `UNDER` (1400, 0, 0)), from level 18; Bram's restoration room `mine_entrance` opens it. `mine.json` (60 floors in 3 layers workings/caverns/deeps, rocks, drops, 4 pickaxes, carts, pools, geodes, chests on lift floors, Bram letters), `systems/Mine.ts` (floors seeded by farm seed + day + floor, 60 swings a day, ladder under a rock, lift every 5, state `mine` with `repairMine`), new skill `mining` (perks strong_arm, prospector, gem_sense, second_wind; bonus cart_luck), Smelter (18) and Jeweller (26), 35 items, Museum shelves deep/ancient/relics, wildlife set `underground` (place `mine`), 4 decor, 9 home pieces. 3D: `world/MineView.ts` (island, floors per layer palette, lantern light, `Environment.cave`), `models/mine.ts`, `MineGate.ts` (north beach), `scenes/Mine.ts` (ui `mine`, back climbs up then rows home), `MinePanel.ts` (lift, Bram's forge). Models `mine/*` (KayKit Dungeon Remastered, Kenney Tower Defense/Platformer/Graveyard; `ADD_ONLY='mine/*'`). Bram's bottom letter puts a home piece in storage (`letters.bottom.piece`). Swings save with `saves.saveSoon()` (debounced; hiding the app still saves at once). Boat theme `collectors` (Collector's Cruise) gives every mine find a repeat use. Place banners in rows (`.visit-banner.rows`, `.row-extra`: woods and mine island) and toasts sit under any banner (`ui/BannerSpace.ts` sets `--banner-bottom`). Debug `__mine`. Game only, no server change. 110 regression checks.

**1.30.5 (pushed 24 Oct):** fix: the phone's back in Photo mode left the home (or square, woods, visit) under it and kept the photo screen over nothing. Photo mode pushes its own history entry; `photoOwnsBack()` is checked first by every scene's popstate listener; closing with its button pops the entry again. 100 regression checks.

**1.30.4 (pushed 23 Oct, deploy run 68):** Photo mode (`ui/PhotoMode.ts`, Settings > Take photos; `openPhotoMode({ caption, onClose })`) from a camera button in the home and a friend's home (`controls.photo`, people shown while it is open); "Hang at home" keeps a small JPEG in `home.photos` (`PHOTO_MAX` 6, `validPhoto` <= 20,000 chars, `addPhoto/removePhoto`), shown on frames as `show: "photo:<id>"` (`Pictures.photoTexture`, cropped to the frame); hung photos go in the shared home while it stays under 190,000 bytes. `.photo-ui` is `sq-keep` (it was hidden in the home, square and woods). 99 regression checks.

**1.30.3 (pushed 23 Oct, deploy run 67):** fix: in a friend's home their farmer was added again on every room change (`guestRoom` emptied `life.extras` before `life.start`, so the old one was never removed); one switch at a time. 98 regression checks.

**1.30.2 (pushed 23 Oct, deploy run 66):** home charm, `Timers.homeCharm` (each placed piece price / `home.json` `charm.coinsPer` 300, no cap; added in `farmCharm`, so HUD, bonuses, leaderboard and visits). Piece size `HomeItem.s` (0.5-1.5, `SCALE_*` in `systems/Home.ts`; `matrixFor` scales, clamps take `k`, `HomeView.fits`, `controls.resize`, riders carried). Decorate hides people (`HomeLife.setHidden`; mode remembered in localStorage `cozy-acres-home-mode`). Pieces built in code get real catalogue previews (`piece:<id>` thumbs in `Thumbs.ts`). 97 regression checks.

**1.30.1 (pushed 23 Oct, deploy run 65):** the home opens at level 15 (`home.json` `level`, was 30). Game only.

**1.30.0 (pushed 23 Oct, deploy run 64): Come On In.** Patterned rugs (`patterned` pieces, item `pat`, `HomeView.addRugTop`). People: `world/home/HomePeople.ts` (`HomeNav` 0.2 m grid round floor pieces, A*, seats from `seat` pieces; `HomeChar` walk/sit/settle), `scenes/HomeLife.ts` (farmer, villagers dropping in), Relax/Decorate switch. Friends: server section `1.30 home visits and coffee` (`home_snapshots`, `publish_home`, `home_coffee`, `coffee_visit`, `my_coffee_visits`; tested on local PG16), `online/HomeShare.ts` (snapshot, `sanitizeHome` via `repairHome`, publish every 5 min and on leaving, coffee poll every 10 min sends a letter), backends `publishHome/getHome/coffeeVisit/myCoffeeVisits`, `HomeView.source` (a friend's home, read only), `enterGuestHome` from the visit banner (`visitBannerHooks`, `visitEndHooks`, `visitedFarm` in Visit.ts). Privacy page and data-safety.md updated. **Needs `schema.sql` re-run and the Play Data safety form checked.** 92 regression checks.

**1.29.2 (pushed 23 Oct, deploy run 63):** small pieces go on any shelf: `FurnitureGeo.shelfLevels` finds a piece's flat places from its model (`levels`), `HomeView.surfaceHit` takes the shelf the pointer ray meets first (wall shelves, inside bookcases), `clampOnto` keeps them on it; `moveCarrying` in `scenes/Home.ts` carries riders in the base's own frame (wall shelves moving along or between walls; `home.move` takes `carry` false). 90 regression checks.

**1.29.1 (pushed 23 Oct, deploy run 62):** a picked colour on a one-finish (KayKit) piece is drawn with `FurnitureGeo.tintMaterial` (the colour, with the texture only for light and shade); multiplied over the texture it came out much darker than the swatch. `materialFor` picks it. 89 regression checks.

**1.29.0 (pushed 23 Oct, deploy run 61): Home Sweet Home, inside the Farmhouse (level 30, 15 from 1.30.1, `PLAN-1.29.md`).** Data: `home.json` (9 rooms by Farmhouse level, sizes 4/5.5/7 m, 16 wall and 12 floor patterns, palette, starter pieces, `maxItems` 120 a room, `lookItems` 600 across saved looks) and `furniture.json` (257 pieces: kinds floor/surface/wall/rug/ceiling, `top` surfaces, `lamp`, `picture`, `craft` items, `gift` villager + `hearts`, `colours`). State `home` (rooms, storage, known, uid, gifts; `repairHome` in Save.ts). `systems/Home.ts` (place/move with riders/store/duplicate, undo/redo, styles, colours, looks, enlarge, catalogue picks, craft at the Carpenter, `sendGifts`). 3D in `world/home/`: `HomeView` (room at `HOME_ORIGIN` z -1400, cutaway walls by camera azimuth, furniture in a `BatchSet`, 3 fixed point lights + night fill, picking), `HomeStyle` (canvas patterns), `FurnitureGeo` (per-part vertex colours; Kenney Furniture Kit parts are named materials), `ProcFurniture` (pieces built in code), `Pictures`. `scenes/Home.ts` (enter/leave, drag, `controls`; ui `home`; door bubble on the Farmhouse), `ui/home/` (HomeUI bars and sheets, Catalogue). Models `kf/*` (Kenney Furniture Kit), `kk/*`, `kr/*` (KayKit), loaded only inside. Env `indoors` hides rain, birds and butterflies. Debug: `__home`. Perf: `node tools/stress-home.mjs` (Grand room, 120 pieces).

**1.28.5 (20 Oct): account locks.** Dashboard player page Lock account / Change lock / Unlock now (duration or date or no end, a reason the player sees; preview in the dialog), lock history on the Support tab, Players filter `locked`. Server section `account locks` (`account_locks` table, `active_lock`, `assert_not_locked` called at the top of send_gift, list_item, buy_listing, help_farm, like_farm, ask_help, fill_help, coop_start, coop_give, publish_farm, claim_reward_code; `my_lock`, `admin_lock_player/unlock_player/player_locks/locked_players`, `expire_account_locks` (pg_cron every 10 min); a lock hides from leaderboards, unlock/expiry restores). Game: `src/online/Lock.ts` (full-screen `.lock-screen` notice with reason and countdown, kept in localStorage `cozy-acres-lock`, server clock skew, rechecks every 5 min and on the `cozy-account-locked` event from SupabaseBackend). Also fixed: a stray `.tray-item .tray-item .tray-item` at the end of `styles.css` swallowed any rule appended after it. Needs `schema.sql` re-run. 79 regression checks.

**Admin player deep dive (17 Oct, dashboard and server only, no game version):** the player page is tabbed (`admin/src/views/player.ts`, game names and icons from `admin/src/gamedata.ts`, which imports `src/data/*.json`; icons load from `../play/assets/icons/`), new SQL section `admin player deep dive` (`admin_player_deep`, `admin_player_save` (logs "view save"), `admin_letter_to`, `admin_push_to`, `admin_clear_lb_flag`) and `admin_players` has more filters, sorts and columns. Needs `schema.sql` re-run. ADMIN.md "Player page".

**1.28.4 (17 Oct):** the Halloween look removed altogether (see 1.20.1 below). Regression check "nothing invisible covers the farm" kept.

**1.28.3 (17 Oct, hotfix):** the Halloween vignette (`.hw-vignette`, full screen) swallowed every touch because `#ui-root > * { pointer-events: auto }` beats a class rule; overlays that are direct children of `#ui-root` need `pointer-events: none !important` (now on the vignette, spider, ribbon and `.toast-stack`). Regression check "nothing invisible covers the farm".

**1.28.2 (local, 17 Oct):** visits fix. `publish_farm` refused farms over 1,200 pieces, so big farms stopped updating for visitors; limits now 3,000 pieces / 256 KB, `fitSnapshot` drops decor then paths to fit, refusals return null and go to `farm_share_refusals`. Workshops can be helped (`tend` on a busy workshop, `helpButton`, `Neighbours.applyHelp` shortens the queue). Visit logs `farm_visit` etc. Dashboard page Visits & help (`admin/src/views/visits.ts`, `admin_visits_overview`, `admin_player_visits`, section `1.28.2 visits and help`). ONLINE.md "Shared farms and visits". 76 regression checks.

**1.28.1 (local, 17 Oct):** fixes from a code review plus QoL. Co-op: `coop_give` takes an idempotency key `p_key` (client `state.coop.pending` retries on poll), `coop_before_delete` trigger refunds givers when a host deletes their account, claims keep snapshot fields (`project` set null), claims polled every 15 min even with no friends, toast when a friend starts a project. Leaderboard: XP/level never lowered by a stale save, value/charm budgets use high-water marks (`lb_value_max`, `lb_charm_max`). Farmhands keep wage money from seeds, no round on re-task, next-round time. Wild pick spheres only when visible, farm-edge visitor hints; Halloween decor hidden on visits; Square `refreshEstate()` every 20 s. Needs `schema.sql` re-run. 74 regression checks.

**1.28.0 (local, 17 Oct):** Together, co-op Village Projects (ONLINE.md "Village Projects"). Server: section `1.28 co-op village projects` in `schema.sql` (tables `coop_projects`, `coop_gifts`, `coop_claims`; functions `coop_start/set_friends/list/give/cancel/claim`, internal `coop_catalog/enabled/refund/cleanup/view`; game_config `coop`; dashboard switch on the 1.9 page). Client: `coop.json` (validate-data checks it against `coop_catalog`), `online/Coop.ts` (cleaning), `OnlineBackend.coop*` in both backends (practice bots join and host), `systems/Coop.ts`, `CoopPanel.ts` (ui `coop`, a Village card), decor `coop_plaque/footbridge/garden/fireworks` (`models/coop.ts`), state `coop.plaques`. Privacy policy and `store/data-safety.md` updated. Debug: `__coop`, `__online`.

**1.27.0 (local, 17 Oct):** The Treehouse and the Wildlife Album. Album: `wildlife.json` (17 species, 4 sets), `src/systems/Wildlife.ts` (seeded daily presence by hours/weather/festival, `photograph`, set rewards; state `wildlife`), farm-edge visitors `src/world/Wild.ts` (`FarmWildlife`, `farmEdgeSpot`) + `scenes/WildlifeApply.ts` (ui.extraPick), woods visitors in `WoodsView.buildWild` (tap kind `wild`), `ui/Photo.ts` (flash + toast), Book page `WildlifePage.ts`; new procedural animals in `models/woods.ts` (`WILD_PROC`). Treehouse: `woods.json` `treehouse` (3 stages + 6 furnishings, rooms `treehouse_*`), `src/systems/Treehouse.ts`, `TreehousePanel.ts` (ui `treehouse`), `WoodsView.buildTreehouse` (tap kind `treehouse`), camp finds +2. Debug: `__wildlife`, `__woods.treehouse`.

**1.26.0 (local, 17 Oct):** Estate Projects. `estate.json` (the Clock Tower, level 70; the Lighthouse, level 80; 4 stages each, restoration rooms `estate_<project>_<stage>` merged into `ROOM`), `src/systems/Estate.ts` (locks after `restoration.festival`, `clockTowerBuilt`, `lighthouseBoatDays` used by `BoatVisit.isBoatDay`), finale `Restoration.estateFinale` (`restoration.estate`, decor `clock_tower_model`/`lighthouse_model`), `EstatePanel.ts` (ui `estate`, a Village card). 3D: `models/estate.ts`, `SquareView.buildEstate/refreshEstate` (live clock hands, beam at night), hourly chime in `scenes/Square.ts`. A procedural model must never be empty (an empty builder broke the square once).

**1.25.0 (local, 17 Oct):** Helping Hands. Farmhands: `farmhands.json`, `src/systems/Farmhands.ts` (rounds every 10 min while open via `setInterval`; chores call `farming.plant`, `animals.feedAll`, `production.queue`; remembers `lastCrop`/`lastRecipe` from `crop:harvested`/`production:queued`; wage paid on the first working round of a day; rests when `cycleNow().festival`), state `farmhands` with save repair, `FarmhandsPanel.ts` (ui `farmhands`, a card on the Farmhouse screen). Mastery lines: `mastery.json` `lines`, `src/systems/MasteryEffects.ts` (hooks in `Farming.plant/harvest`, `Production.duration/queue`, a `qualityBoosts` entry), `mastery.pick`, picker in `MasteryPanel.ts`, state `mastery.picks`. Debug: `__farmhands`, `__mastery`.

**1.24.0 (local, 17 Oct):** Tea and Flowers. Crops `tea_leaf` (104) and `rose` (112); workshops `tea_house` (106) and `florist` (112), procedural models in `models/teahouse.ts`; 17 recipes. Items with `"bouquet": true` are loved by every villager (`village.taste`; `validate-data` counts them as used). Best-friend arcs: `villagers.json` `arc` per villager (5 letters by `day`), `VillageRewards.arcs()` from `daily()` (one arc at a time, one letter a day; state `friends[id].arc` {day, sent, last}), shown on the villager page. Debug: `__village`.

**1.23.0 (local, 17 Oct):** The Ancient Grove, woods phase 4. A fourth region `grove` (feature `oak`, trail `trail_grove` at level 40, forage incl. new `acorn` and `moonflower`). The Elder Oak: `woods.json` `grove.stages` are restoration rooms `grove_<stage>` (merged into `ROOM`), opened in order by level and `growDays` after the stage before (finish times in `state.restoration.grove`); `src/systems/Grove.ts` has the locks and perks (forage star boost via `qualityBoosts`, `grovePans`, `critterVisitsPerDay` (critter `seenN`), `groveDigs`, `canopyGlows`); finale `Restoration.oakFinale` (`restoration.oak`, decor `elder_oak_sapling`). 3D: `elderOakGeometry(stage)` in `models/woods.ts`, `WoodsView.buildOak/refreshOak`, tap kind `oak`. Lodge recipes acorn bread and moonflower tea. Debug: `__woods.grove`.

**1.22.0 (local, 17 Oct):** Orchard Days, levels 101-120 (`authoredMax` 120): crops rice, garlic, sweet potato, cranberry; peach, plum and olive trees (procedural fruit in `ProcModels.ts`); 12 dishes; 4 decor (`proc:fruit_crates`, `orchard_ladder`, `olive_jars`, `fruit_cart` in `models/Decor.ts`); Farmhouse 15; Master challenge `forage`. Leaderboard fair play (its own commit before it): `upsert_profile` token buckets and `level_for_xp` in `schema.sql`, flags on the dashboard (ONLINE.md); needs `schema.sql` run in Supabase.

**1.21.0 (local, 17 Oct):** Woodcraft, woods phase 3. The Woodcraft Lodge (`woodcraft_lodge`, a farm workshop with `room: trail_hollow`; `Buildings.canBuy` and `ShopPanel` say "Restore the Hollow Bridge in the Wild Woods" for `trail_` rooms), 12 recipes and items with icons. Camping (`woods.json` `camp`, `Woods.campStatus/pitchTent/wakeUp`, state `woods.camp`, campsite `CAMP_AT` in `WoodsView.buildCamp`, tap kind `camp`). Woods weather (`woods.json` `weather`: rain fills mushroom spots, mist rarer digs and pans, sun berries and flowers; in `Woods.spotsFor`, `dig`, `pan`, and the banner text). Debug: `__buildings`.

**1.20.1 Spooky season: REMOVED in 1.28.4 (owner: a failed trial, more hassle than it was worth).** It added a full-screen Halloween look for October; its vignette blocked every touch on the farm (1.28.3 hotfix), so `world/Halloween.ts`, `scenes/HalloweenApply.ts`, `ui/halloween.css`, the FarmLook `halloween`, the Environment `mood` light, villager costumes and the Settings row were all deleted. Don't bring back seasonal overlays without the owner asking; any overlay that is a direct child of `#ui-root` needs `pointer-events: none !important`.

**1.20.0 (pushed 16 Oct, deploy run 54):** Woodland Friends (woods phase 2) and Care and Craft. Critters: `woods.json` `critters` (6 families, a feeding stump each in the glade or a region), `src/systems/Critters.ts` (feed, present in the family's hours, one visit a day, a heart every 3 visits up to 5, gifts, rare gifts for the Museum's `woodland` shelf), state `woods.critters`/`note`/`notesDone`; Wren the ranger (`woods.json` `wren`, cabin and character in Whispering Pines, one field note a day; a woods resident, not a seventh villager); screens `CritterPanel.ts` (ui `critter`, `wren`, and the Collection Book tab "Critter Journal"); 3D in `WoodsView` (`buildStump`, `buildWren`; hedgehog, squirrel and owl are procedural in `models/woods.ts`). Care and Craft: Vet's Cottage and Carpenter's Workshop levels 2-3 (`upkeep.json` `care`, `Buildings.upgradeInfo`), cheaper care, vet check-ups (`b.checkupUntil`), carpenter fresh paint (`b.paintUntil`), the care round on the Farmhouse (`upkeep.carePlan`/`careRound`), free skill bonuses at level 7 (`skills.json` `bonus`: Hardy Stock, Sturdy Joints; `hasSkillBonus`). Every item has a use: `validate-data` fails for an item nothing wants (recipe, bundle, Museum, feed, treat, boat wish, villager favourite; seeds, fertiliser, bait and event tokens are spent in code); 27 new recipes for fish, woods forage and creek finds, Museum shelves `creek` and `aquarium` (rare sea life is never cooked), boat themes `picnic` and `crafts`, and boats ask for what the farm can make or has in its Collection Book (`canSupply` in `BoatVisit.ts`), picking only a theme it can fill 3 wishes from. Debug: `__woods.critters`, `__upkeep`, `__boat`.

**Also in 1.20.0:** fix for decor vanishing and leaving only its shadow (Water Tower, Lookout Tower...). three.js works out a `BatchedMesh`'s bounds once, at its first draw, and never grows them, so decor placed later was culled whenever those bounds were off screen. `BatchPool.ts` now sets `frustumCulled = false` on each batch (pieces are still culled one by one) and clears the bounds on every change. Regression check: "decor placed later is drawn when the camera looks at it".

**1.19.0 (pushed 19 Oct):** the Deep Woods, phase 1 of the woods plan in `ROADMAP.md`. Three regions round the glade (`woods.json` `regions`: Mossy Hollow, Crystal Creek, Whispering Pines), each opened by a trail (`woods.json` `trails`, restoration rooms `trail_<region>` merged into `ROOM`). `Woods.ts`: region forage (spot ids `REGION_IDS * k + i`), fireflies (night only, kept in the daily `picked` list), panning (`woods.panned`), taps (`woods.taps`, ms of last emptying). `WoodsView.buildRegions`: islands, footbridges (broken until restored), trail signs, streams, pools, tapped pines, fireflies. Woods banner has a region bar (camera). 23 new items with icons from `scripts/icon-variants.mjs`. Next phases: critters and Wren (1.20), Woodcraft Lodge (1.21), Elder Oak (1.22), treehouse (1.23).

**1.18.0 (pushed 18 Oct):** Willowmere Manor, the long project behind the village square (owner: the six rooms were finished far too fast). 8 wings in `manor.json`, opened in order after the Village Festival and by level; wings are restoration rooms with ids `manor_<wing>` (merged into `ROOM`, not `ROOMS`), so `Restoration.ts` gives and saves them; `src/systems/Manor.ts` holds the open rules and the permanent effects (woods forage/digs, festival coins, workshop/expedition/grow/animal speed, order coins), the finale is `Restoration.manorFinale` (`state.restoration.manor`, decor `willowmere`). Screens: `ManorPanel.ts` (ui `manor`, a Village card) and the room screen for each wing. 3D: `SquareView.buildManor` (square island radius 31, the manor behind the lots, pieces appear per wing, scaffolding on the current one). About 4.7M coins of goods, roughly 8 months for an engaged player (BALANCE.md). Also fixed: coins given to bundles were dropped on load.

**1.17.0 (pushed 17 Oct):** late-game pace (owner asked Claude to decide). XP per level is flat past 60 (`levels.json` `endless.xpPerLevel` 0) and Master claims, the Master week, boat visits and festival prizes pay a share of the current level as XP from level 60 (`endless.lateXp`, `Endless.lateXp()`); about 2.4 days a level, level 100 around day 187 for an engaged player (BALANCE.md table). Trophy-group charm capped at 500 (`economy.json` `charm.trophyMax`, `Timers.farmCharm`, used by `Buildings.charm` and `FarmSnapshot`). Hazel's one-off letter to farms past 60 (`state.endless.road`). The economy simulator runs to `authoredMax` + 20 with Master, boats and festivals.

**1.16.0 (pushed 16 Oct):** performance. Decor of any size is batched: fences and paths stay instanced per model (`InstancePool`), every other static decor shares one `THREE.BatchedMesh` per material (`src/world/BatchPool.ts`, `FarmView.isPooled`/`place`); glowing, themed-animated, lettered and gate decor stay standalone. Glow sprites are hidden by day. Boot reads the save first and preloads only models for buildings unlocked by the next level, placed or stored (`Boot.coreModels`); the rest load on demand (all model access is async except crops, trees, animals and `PROC_DEPENDENCIES`, which stay preloaded). Worst-case 720 decor of 283 kinds: 1,109 draw calls before, about 344-433 after; a new farm loads 4.6 MB instead of 7.2 MB. Budget check: `npm run test:perf` (720 decor, max 520 calls with shadows).

**1.15.1 (pushed 15 Oct):** fixes from the Opus audit (`HANDOVER-OPUS.md`). Saves: an unreadable save is copied to `cozy-acres-save-unreadable` before anything is written, and a save from a newer version stops the boot with an "Update now" screen (`NewerSaveError`) instead of being replaced. Upkeep: a grace day after time away, full return window, dial 0 heals. Master: unknown challenge ids are dropped, "Pat your animals" counts `animal_pats`, side-bar entries are guarded. Four money-losing recipes repriced. Regression checks: `npm run test:regression`.

**1.15.0 added (pushed 15 Oct):** upkeep from level 12: animals age and fall unwell, workshops and animal homes wear (`Upkeep.ts`, `upkeep.json`, `CarePanel.ts`, `UpkeepUI.ts`); the Vet's Cottage and Carpenter's Workshop (level 10) treat and repair; remote dial `game_config` `upkeep` 0-2.

**1.14.0 added (pushed 14 Oct):** new CC0 asset packs (KayKit Restaurant/Halloween/Furniture; Kenney Holiday, Minigolf, Watercraft, Hexagon, Pirate, Suburban, Commercial, Castle) fetched by `scripts/fetch-assets.sh` and built with `ADD_ONLY='group/*,...' node scripts/build-assets.mjs` (new atlases are added to the manifest too); levels 81-100 content (`authoredMax` 100); the Master Board (`master.json`, `Master.ts`: weekly challenges and the gem-only Boutique, `MasterPanel.ts`, side entry from level 50); a boat per Boat Visitor theme. Balance: `BALANCE.md`.

**1.13.0 added (pushed 14 Oct):** NO TOP LEVEL (owner's rule: no prestige, always levels and always more to unlock). `levels.json`: `maxLevel` 999, `endless` rules, `authoredMax` (now 80); levels past 60 are worked out in `src/data/index.ts`; every level 61-300 gives a Level Marker (`Endless.ts`, `marker_<n>` decor from `models/ranks.ts`); 12 dishes, 6 decor, Farmhouse 11-12. To add content for the next levels: write it, raise `authoredMax`, run `validate-data`. Balance: `BALANCE.md`.

**1.12.0 added (pushed 14 Oct):** leaderboard trophies (`Ranks.ts`, `models/ranks.ts`, `rank_<board>_<1|2|3|10>` decor, earned from real board ranks with 6+ farmers, once, kept in storage; Leaders panel shows them). Balance: `BALANCE.md`.

**1.11.0 added (pushed 11 Oct):** the level cap is now 60 (`levels.json` `maxLevel`; players at 50 carry on), mushroom and giant pumpkin crops, 7 dishes, Farmhouse levels 9-10 (a fourth workshop of each kind at 10), six decor pieces incl. the Grand Master Statue. Balance: `BALANCE.md`.

**1.10.0 added (pushed 11 Oct):** four crops (levels 41-47), 13 recipes, Rabbit Hutch and bunnies, animal names/pats/hearts (`Animals.ts`), 14 decor pieces, Boat Visitors (`boatvisits.json`, `BoatVisit.ts`, `world/BoatVisitor.ts`, `BoatVisitPanel.ts`: two days a week, east berth, 10am-5pm) and a cosmetic Farm look setting (`world/FarmLook.ts`). Balance: `BALANCE.md`.

**1.9.x added:** (1.9.2 REMOVED the seasons again: no seasonal crops, badge, tints, Glass Frame or season Collection pages; a Glass Frame in an old save is refunded 900 coins in `Save.ts`.) A festival cycle (`cycle.json`, `FestivalCycle.ts`: a shared 28-day cycle, a festival every 7th day, four in turn), 16 extra fish (`extra` in `fish.json`, a separate 8% chance), Lucky Bait and order-aware fishing (1.9.1), Festival Days (`festivals.json`, `Festivals.ts`, `ui/panels/FestivalPanel.ts`: Egg Hunt, Fishing Derby, Harvest Fair, Feast of Lights), the Wild Woods island (`woods.json`, `Woods.ts`, `world/WoodsView.ts`, `scenes/Woods.ts`, `WoodsGate.ts` on the south beach; forage, dig spots, Foraging skill), Museum (`museum.json`, `Museum.ts`) and expedition board (`expeditions.json`, `Expeditions.ts`) in the woods, Help Wanted (`HelpWanted.ts`), heart events at 2/6/10 (`stories` in `villagers.json`), pet finds (`PetFinds.ts`), 9 new Collection Book pages + Master Collector + Almanac page (`AlmanacPage.ts`), dashboard page "1.9 Year" and server game settings (`online/GameConfig.ts`, `game_config` table). Villager routines are light (`schedules.json`, `Schedules.ts`: villagers appear in the Wild Woods by time of day and each villager page says where they are; they do not move on the farm or in the square). Not built from `PLAN-1.9.md`: the four real-date token events are not merged into the festivals, no decorations/buildings/recipes book pages, Museum is in the woods not a seventh square lot. Balance: `BALANCE.md`.

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
android/      the Capacitor Android project (README, upload-key maker); android-twa/ the retired TWA
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
npm run test:regression # builds, then checks saves, upkeep, the Master board and decor batching in headless Chromium (tests/regression.mjs); runs in CI and blocks the deploy
node tools/phone-sweep.mjs <dir>  # after vite build: every panel at 4 phone sizes, reports overflow and tiny buttons
node tools/stress-home.mjs [url] --budget N  # after vite build + preview: a Grand room with 120 pieces, draw calls
npm run test:perf       # builds, then fills a farm with 720 decor and fails above 520 draw calls (tools/stress-decor.mjs)
```

Testing helpers: `node tools/shot.mjs`, `node tools/perf.mjs`, `node tools/playtest.mjs` (see README).

---

## 4. How changes ship

| You changed... | What happens |
| --- | --- |
| Anything in the game, website or admin | Push to `main`. The deploy workflow publishes the website and web game in a few minutes. |
| The game, for Android app players (1.32+) | The game is inside the app: run **Actions > Build Android app** with the next versionCode, then upload the `.aab` in Play Console (Play reviews it). Batch game updates into app builds. |
| Database (new tables/functions) | Paste the latest `supabase/schema.sql` into Supabase SQL Editor and run it (safe to re-run). |
| Online features or data collected | Update `store/data-safety.md`, the privacy policy and the Play Data safety form. |

When bumping the game version, update **both** `package.json` and the newest entry in `src/data/changelog.json`. `validate-data` checks they match.

---

## 5. Google Play status

| Item | Value |
| --- | --- |
| Package name (permanent) | `app.joshmakesgames.cozyacres` |
| Latest versionCode uploaded | **6** (Capacitor app, closed track "Alpha", 25 Oct). Next build must use **7+**. |
| minSdkVersion | 24 (needed for Play automatic protection) |
| Play app signing SHA-256 | `65:7E:42:04:98:23:2C:E0:E9:CE:5E:FD:5F:72:45:92:6D:DE:DB:4A:40:76:E5:51:F9:3E:2E:09:73:DA:4F:10` |
| Upload key SHA-256 | `4F:81:15:23:BD:6C:CD:E9:3F:78:77:6D:84:76:77:49:FD:C1:04:80:85:41:26:CD:FD:B9:28:F7:DA:96:79:8A` |
| Tester opt-in link | `https://play.google.com/apps/testing/app.joshmakesgames.cozyacres` |

**Production access refused (25 Oct 2026):** Google says the app "requires more testing". Plan: move to an organisation account (Australia: Pty Ltd or sole trader + D-U-N-S), see `store/organisation-account.md`; first ask Play support in writing whether converting/transferring removes the testing requirement.

**Where it's up to (before 25 Oct):** internal testing works. App content, store listing and graphics are done. The closed test (bundle 4) is running; on 21 Oct it had 2 days of the 14 left (5 active players test on real phones). Next: keep **12+ opted in for 14 days in a row**, log feedback in `store/test-log.md`, then apply for production (`store/checklist.md` section 6). The admin dashboard has a closed test tracker.

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
5. **(TWA only, retired in 1.32) `ANDROID_CERT_SHA256` must hold both fingerprints.** If it's wrong, every TWA player sees a browser bar at the top of the app. After changing it, re-run the deploy and check `/.well-known/assetlinks.json`. Phones cache the result, so reinstall to re-test.
6. **Play Console menus move often.** App signing is now under **Protected with Play > Play Store protection > Manage Play app signing**. Use the Console search box when a path doesn't match.
7. **Target audience is 13+.** Don't tick under-13 groups (gift notes and names are unmoderated free text).
8. **Don't write a literal em dash in code or text.** Use a hyphen.
9. **Test graphics changes on Low, Medium and High.** New phone GPUs can break effects that work everywhere else.
10. **No romance or marriage in the game, ever** (owner's rule). Villagers are friends only.
11. **The admin email is never committed.** `admin_users` is filled in SQL only. Every admin function calls `admin_guard()` and logs to `admin_log`.
12. **Never push or deploy without the owner's explicit OK.** Say in 2 lines what goes live and wait for "yes push".
13. **Player data from Supabase is for support only** and must not be shared.

## 7a. Owner decisions (15 Oct 2026)

- **Monetisation:** nothing until after the Play production launch. Then likely paid building unlocks and speed-ups. **No loot boxes, ever** (13+ audience).
- **Late game pace:** levels 60+ should ask about 2-3 hours a week (three short check-ins a day). Tune upkeep, Estate projects and the XP curve to that.
- **Expansion:** deepen the current farm first; a second plot only after the 1.16 performance work.
- **Tests:** `npm run test:regression` may run in the deploy workflow and block a deploy that fails it.
- **XP curve past 60:** flatten it (about 2-2.5 days of regular play per level from 80); show the before/after tables before shipping.
- **Push:** `PUSH_CRON_SECRET` is set up, so `send-push` may require it. The full `schema.sql` has been run since 1.15.0.



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

- [x] 1.20.1 to 1.28.5 pushed and live (17-21 Oct), and the owner ran the latest `schema.sql` (account locks work). `send-push` redeployed with `PUSH_CRON_SECRET` (owner, 21 Oct). Still to do: the real-phone pass on Low, Medium and High (rule 9) with `store/phone-checklist.md`.
- [x] Supabase is up to date with the latest `schema.sql` (owner, 21 Oct). Rule for later: after every server change, run the whole latest `supabase/schema.sql` in Supabase, then `notify pgrst, 'reload schema';` ("Could not find the function ... in the schema cache" means it has not run through). Tested first on a local Postgres 16 with a stub `auth` schema (HANDOVER-2026-10-21.md section 5).
- [ ] **Push 1.30.0**, then run the whole `schema.sql` in Supabase and `notify pgrst, 'reload schema';`; update the Play Data safety form (home pictures and coffee visits). Test inside the Farmhouse on a real phone. Test inside the Farmhouse on a real phone (`store/phone-checklist.md`). Later: friends visiting the home (server), characters inside.
- [ ] Next releases: `ROADMAP.md` release plan (re-sequenced 20 Oct; the 1.17-1.28 plan is built; next: 2.0 The Market Stall after the Play production launch, or more content).
- [ ] Change GitHub default branch to `main` (Settings > General).
- [ ] Delete the old draft Play app locked to `com.cozyacres.joshmakesgames`.
- [ ] Recruit 15-20 closed testers (13+). Each joins the Google Group first, then uses the opt-in link.
- [ ] Optional: update `.github/workflows/android.yml` (Node 24 actions, `actions/setup-java@v5`) to clear deprecation warnings. `ubuntu-latest` moves to Ubuntu 26 from 19 October 2026, so check the next Android build still passes.
- [ ] After 14 days: apply for production, add the official Google Play badge to the website (`design/cozy-acres-website/src/assets/img/google-play-badge.png` is a placeholder), and add the Play link to the site.
- [ ] **iPhone app (next, on the owner's Mac):** Capacitor iOS, Sign in with Apple, report and block players (server), TestFlight. Plan in `HANDOVER-2026-10-25.md` section 5; the owner is enrolling in the Apple Developer Program (A$149 a year). The Mac session owns `ios/`; pull before starting, never edit the same files from both sessions at once.
- [ ] App testers who never signed in start a fresh farm in the Capacitor app (the TWA's save stays in Chrome). Offered: a first-start "Played before? Sign in" prompt.
- [ ] Notifications in the app: Firebase (Android) and APNs (iPhone), plus `send-push`.

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

- 2026-10-27: 1.33.6 (local): ghost taps on Samsung (late second click) ignored, gem spends need a second tap, dashboard Gems spent card.
- 2026-10-27: 1.33.5 (local): farm safety (profile hold fix, confirm before keeping the smaller farm, earlier cloud farms kept 180 days, a whole copy of every farm daily); 1.33.4 pushed 26 Oct.
- 2026-10-25: 1.33.2 pushed (with 1.32.1 merged); versionCode 6 uploaded; 1.33.3 (local): update prompt in the store apps and a minimum app version on the dashboard.
- 2026-10-25: 1.33.2 (local): catalogue search keeps the keyboard; merged the cloud session's 1.32.1 (Android sign-in survives Android closing the game); Sign in with Apple behind a switch; App Store listing pack and screenshots.
- 2026-10-25: Mac session: iPhone app (`ios/`, runs in the Simulator); 1.33.0 pushed: reports and blocks, landscape side-button fix; 1.33.1 pushed: word filter.
- 2026-10-25: 1.32.1 (local): Google sign-in in the Android app works when Android closed the game while the browser was open (launch link, durable sign-in storage).
- 2026-10-25: 1.32.0 pushed (deploy run 73), versionCode 5 uploaded to Play's closed track; `HANDOVER-2026-10-25.md` hands the iPhone app to a session on the owner's Mac.
- 2026-10-25: 1.31.2 pushed (deploy run 72); 1.32.0 (local): the Android app moves from TWA to Capacitor (game inside the app; sign-in via browser + deep link; notifications not in the app yet).
- 2026-10-25: Google refused production access (more testing); organisation account plan for Australia in `store/organisation-account.md`.
- 2026-10-25: 1.31.1 pushed (deploy run 71); 1.31.2 (local): dashboard Needs tab (gift what a player is missing in one press), silver and gold items in developer gifts.
