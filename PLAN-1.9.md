# Cozy Acres 1.9 plan: Seasons and the Almanac

Status (8 Oct 2026): plan only, nothing built. Everything in the 1.8 design brief is live except the items below. Size guide: S = under a day, M = a few days, L = a week or more of agent work.

## 1. What 1.9 is

1.9 gives the farm a year. Four seasons change how the farm looks and what is best to grow, a new Almanac shows the whole year at a glance, and the Collection Book grows from 7 pages to a full record of everything the player has found, grown, built and befriended. A small set of carry-over jobs from 1.8 rides along.

| Release | Contents | Size |
| --- | --- | --- |
| 1.9.0 | Seasons: look, in-season crops, seasonal fish and orders, hemisphere setting | L |
| 1.9.1 | Almanac page and the fuller Collection Book (new pages and rewards) | M |
| 1.9.2 | Dashboard controls (events, market day, weather days, letters) and polish carry-overs | M |

Each release is pushed separately and only after "yes push".

## 2. What already exists (checked in code)

- `src/data/events.json`: four real-calendar events (Spring Blossom 15 Mar - 30 Apr, Summer Fair 15 Jun - 31 Aug, Harvest Festival 20 Sep - 10 Nov, Winter Wonderland 1 Dec - 10 Jan) with tokens, quests and decorations. `Progression.ts` (seasonal events section) picks the current one by local date.
- `src/scenes/Boot.ts` already drifts leaves, snow or petals during an event (`SEASON` colour table, `Effects.ts`).
- `src/systems/Weather.ts`: sunny, rain, mist per local day from the farm seed (rain = crops 5% faster).
- `Progression.ts` collection: `collectionEntries()` and `BOOK_PAGES` (Crops, Fruit, Animal goods, Goods, Animals, Styles, Fish), page rewards in `rewards.json`, claim flow in `ProgressionPanels.ts`.
- Book pages from 1.8 (`BookPages18.ts`): Calendar, Letters, Village Guide.
- `qualityBoosts` (Quality.ts), `plantGrowthMult` (Weather.ts) and `cropGrowMult` (SkillEffects.ts) are the hooks seasons plug into, so no core rewrite is needed.
- Hints: `hints.firstTime` one-time tips (Hints.ts). Every new feature gets one.

## 3. Phase A: Seasons (1.9.0)

**Decision: seasons follow the real calendar** (local date, like the events), not an in-game clock. Players already see events that way, nothing needs saving, and a returning player always finds the farm "in the right season". Spring Mar-May, Summer Jun-Aug, Autumn Sep-Nov, Winter Dec-Feb. A Settings switch "Southern hemisphere" flips the four seasons by six months. The four existing events stay as the festivals inside each season.

**Data (new `src/data/seasons.json`, validated by `scripts/validate-data.mjs`)**
- Season dates and names, ground and foliage tints, particle colours, sky tint, weather odds per season (more rain in spring, more mist in autumn, snow flurries only visual in winter).
- Per crop: its two "in season" seasons. All 21 crops get a pair (for example wheat summer and autumn, strawberry spring and summer, pumpkin autumn and winter, lavender spring and summer).
- Seasonal fish: two dock fish and two pier fish per season that only bite then.
- Season quests (3 per season) and a season reward (a decoration, kept forever).

**Rules (kept gentle, never a lockout)**
- Any crop can be planted in any season. A crop planted in season grows 10% faster and has +5% silver and +3% gold chance. Out of season is exactly today's game. Existing balance and the economy simulator stay valid.
- Seasonal fish are extra species, not replacements, so no year-round fish disappears.
- Orders and the truck lean towards in-season crops (weighted, never required).
- Skills and perks stack with the season bonus (add to `qualityBoosts` and the grow multiplier).

**Look (the risky part, GPU-safe)**
- Ground and tree tints through the existing vertex palette, not new shaders (the Terrain and FarmView `onBeforeCompile` code is the area that caused the Pixel white screen in 1.8.0, so no new GLSL).
- Tree colours: autumn orange, winter bare-ish (lower leaf scale), spring blossom. Particles reuse `Effects.ts`.
- Test on Low, Medium and High and with the GPU guard.

**Code**
- `src/systems/Seasons.ts` (current season, hemisphere, in-season check, effects); `SeasonEffects.ts` small and import-light like `SkillEffects.ts`.
- Save: one optional field for the hemisphere, repair rule in `Save.ts` `withDefaults`.
- UI: a season badge in the HUD (icon and name), the crop picker shows an "In season" tag, the seed tray sorts in-season crops first, season intro letter from Hazel on the first day of each season (one letter, no spam).

Size: L.

## 4. Phase B: Almanac and the fuller Collection Book (1.9.1)

**Almanac (new Book page)**: the year on one screen. Four season panels with what is in season (crops, fish, events), villager birthdays, the Saturday market day, and a "this season you have found X of Y" line. It replaces nothing: the Calendar page stays for dated things.

**Collection Book pages (data-driven, same claim flow, new rewards in `rewards.json`)**
- Seasonal finds: one page per season (seasonal fish, event decorations, season reward). 4 pages.
- Decorations: every decoration type the player has ever placed (`game.discover` already records it).
- Buildings and workshops: every building built, and every recipe made once (goods page already exists, this adds recipes).
- Villagers: portraits, keepsakes and letters collected.
- Mastery: plaques earned (1.8.6).
- Fish by spot: Dock and Pier sections.
- Each page shows found / total, new entries get the "New" dot, a completed page pays gems or a crate once. A final "Master Collector" reward when every page is done.

**Needs checking first**: how many entries a page can hold before the grid gets slow on Low (paging or lazy rendering), and that old saves already have the right `collection` keys (they do for items, animals and cosmetics; decorations and recipes need a one-off backfill from `state.buildings` and `stats`).

Size: M.

## 5. Phase C: Dashboard controls and polish (1.9.2)

**From the 1.8 brief, not yet built or checked:**
- Schedule events and the village market day from the dashboard (today events are fixed dates in `events.json` and market day is every Saturday).
- Send a letter to every player's mailbox (the 1.8 letters-to-everyone feature exists; confirm it has a dashboard form).
- Set the weather for special days.
- Needs a small server config table and a marked section in `supabase/schema.sql`, a client fetch with an offline default (the game must work with no config), an admin view, and the dashboard page "1.9 Seasons" (season spread, in-season harvest share, Almanac and Collection completion).
- Re-check `store/data-safety.md` (aggregate counts only).

**Carry-overs from 1.8.5 and 1.8.6**
- Paths under objects cannot be selected until the object is moved off them: add a second tap or a "path under this" button on the object card.
- Welcome flow card for the square, skills, and 1.9 (letters cover it today).
- Spread the six head-start tip letters over days (old known issue).
- Practice-mode neighbour "Old Tom" rename; `help_received` over-count; duplicated villager look tables.
- Update `CLAUDE.md`, `BALANCE.md`, `ADMIN.md`.

Size: M.

## 6. Release rules for every phase (from CLAUDE.md)

1. `npx tsc --noEmit`, `npm run validate-data` after data edits, `npm run build`, `bash scripts/pages/build.sh`, `npm run simulate-economy` (season bonuses must not move income more than a few percent).
2. Test Low, Medium and High, and that the blank-frame guard still passes with the new tints.
3. Load an old save and a 1.8.6 save, confirm nothing is lost; run `tools/playtest.mjs`.
4. Bump `package.json` and the newest `src/data/changelog.json` entry together (1.9.0, 1.9.1, 1.9.2) with highlights and sections.
5. A one-time tip for every new feature (`INTROS` and `CROP_TIPS` in `Hints.ts`).
6. Two lines on what goes live, then wait for "yes push".

## 7. Decisions needed from Josh

1. **Season clock:** real calendar (recommended) or an in-game clock where a season lasts, say, 7 real days?
2. **Hemisphere:** a Settings switch (recommended) or follow the device's guess?
3. **How strict:** gentle bonuses only (recommended, no lockouts), or some crops only growable in season?
4. **Season look:** how strong should the farm change be (light tint, or full autumn trees and bare winter trees)?
5. **Seasonal fish:** add four extra species per season (recommended), or leave fish alone in 1.9?
6. **Collection pages:** the list in section 4, or trim it?
7. **Dashboard controls:** do you want these in 1.9.2, or later?
8. **Release split:** three releases as above, or seasons and Almanac together?

## 8. Risks

- New tints on the terrain and trees are the same area as the 1.8.0 white-screen bug; stay on vertex colours and keep the guard test.
- A season change at midnight local time while the game is open: the HUD badge and tints must refresh without a reload (Boot's day-tick already handles quests and events, hook there).
- Players near a season boundary can see two seasons in a week; bonuses are small so it feels fair.
- Collection pages with hundreds of entries on Low-end phones: page or lazy-render the grid.
- Balance: seasonal fish and in-season bonuses add income; tune against `npm run simulate-economy` and `BALANCE.md`.
