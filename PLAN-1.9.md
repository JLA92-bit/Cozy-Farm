# Cozy Acres 1.9 plan: A Year in the Valley

Status (8 Oct 2026): plan only, nothing built. This replaces the first draft. Inspiration: Stardew Valley's seasons, festivals, foraging, museum and living village, kept cozy, mobile-friendly and with no combat, no romance and no marriage (owner's rule).

Size guide: S = under a day, M = a few days, L = a week or more of agent work.

## 1. What 1.9 is

1.9 is one big release, built in stages but deployed once. It gives the valley a year to live through: four seasons with real teeth, festival days that turn the village square into a playable event, a wild woods to forage in with a museum that rewards every find, and villagers who live their own days. The Almanac and a much fuller Collection Book tie it together. Four existing 1.8 ideas that were never built (dashboard controls, selectable paths, welcome flow, tidy-ups) ride along.

There is no staged deploy. Each stage below is built, tested and committed locally in order; one push at the end ships 1.9.0 as a single update with one big "What's new" card. A check-in with Josh after any stage is possible whenever wanted.

| Pillar | What the player gets | Size |
| --- | --- | --- |
| A. A Real Year | Seasons, in-season crops, greenhouse, seasonal fish and forage, farm look per season | L |
| B. Festival Days | A playable festival in the square once every season | L |
| C. The Wild Woods | Foraging, dig spots, the Museum, expedition board | L |
| D. Neighbours | Villager schedules, heart events, Help Wanted board, a pet | L |
| E. Almanac and Collection | A year-at-a-glance page and a Collection Book with about 12 pages | M |
| F. Dashboard and polish | The dashboard controls promised in the 1.8 brief, carry-overs | M |

## 2. What already exists (checked in code)

- `src/data/events.json`: four real-date events (Spring Blossom, Summer Fair, Harvest Festival, Winter Wonderland) with tokens, quests and decorations; `Progression.ts` picks the current one by local date; `Boot.ts` drifts seasonal particles.
- `src/systems/Weather.ts`: sunny, rain, mist per local day; rain makes crops 5% faster.
- The village square scene (`SquareView.ts`, `Square.ts`): six rebuilt lots, villagers standing in it, bunting and a golden statue after the festival, a camera, taps and labels. This is the stage for festivals.
- Villagers (`Village.ts`, `VillageRewards.ts`, `Villagers.ts`, `villagers.json`): six villagers with hearts, gifts, letters, story cards at 4 and 8 hearts, keepsakes, perks; they already walk the farm.
- Daily finds and the mailbox (`Daily18.ts`), Ask a friend, Mail.
- Collection Book (`Progression.ts` `BOOK_PAGES`, claim flow in `ProgressionPanels.ts`), Book pages (`BookPages18.ts`).
- Fishing with two spots (`FishSpots.ts`), skills with perks, restoration rooms, mastery plaques, crafting, one-time tips (`Hints.ts`), layered placement (`occP` / `occD`).
- Decor greenhouse (2x2, level 22) exists as a plain decoration.

## 3. Pillar A: A Real Year (seasons with teeth)

**Calendar.** A shared in-game year of 28 real days: Spring, Summer, Autumn, Winter, 7 days each, every season starting on a Monday. The calendar is counted from a fixed epoch (a Monday) in UTC, so every player and the dashboard see the same season on the same day and nothing needs saving. Day 7 of each season (Sunday) is the festival. Saturday stays market day. The four old real-date events become the four season festivals (the tokens, quests and decorations are kept and move onto the festival Sunday and the days before it).

**Crops.** Each of the 21 crops grows in two seasons and can only be planted then. Every season has at least 12 crops open, so nobody is ever stuck, and the first crops (wheat, corn) are open year-round. A crop already planted keeps growing when the season ends (no crop dies; this is the cozy version). The seed tray shows an In season tag and sorts available crops first, and the locked ones show when they return.

**Greenhouse.** The decor greenhouse becomes a working building: a 2x2 production-style building with 4 plots that ignore seasons. A new unlock for the late game. (Old decor greenhouses stay as decor; the new building has its own id.)

**Fish and forage.** Two extra dock and two extra pier fish per season that bite only then (extra species, nothing year-round disappears). Seasonal forage for Pillar C.

**Look.** Ground and tree tints per season through vertex colours (no new shaders: the shader code in `Terrain.ts` and `FarmView.ts` is the area that caused the 1.8.0 white screen). Autumn leaves, winter snow dusting and bare-ish trees, spring blossom, summer bloom. Particles reuse `Effects.ts`.

**Code.** `src/data/seasons.json` (dates, tints, crop seasons, fish seasons, festival days, season quests), `src/systems/Seasons.ts` plus a small `SeasonEffects.ts` (like `SkillEffects.ts`), a HUD season badge, a Hazel letter on the first day of each season (one letter), `Farming.canPlant` season rule, shop and seed tray changes. Save: one optional field for the greenhouse and nothing else (the season is derived from the clock).

**Risks.** Players returning after weeks see several seasons pass (fine, crops keep growing); season boundary at UTC midnight shows different local times (show the season change at local midnight of the player's day, still the same season everywhere that day); balance (in-season crops get a small growth and quality bonus, tune with `npm run simulate-economy`).

## 4. Pillar B: Festival Days

Four festivals, one per season, on the season's Sunday. On a festival day the square button on the farm shows a flag, and entering the square shows the festival: bunting, stalls, the villagers dressed up and standing in set places, a festival board, and one mini-game. Each lasts the whole day and can be played any time that day.

| Season | Festival | Mini-game | Prize |
| --- | --- | --- | --- |
| Spring | Egg Hunt | Find hidden eggs across the square and the farm edge in a time limit | Spring ribbon, decoration, seeds |
| Summer | Fishing Derby | One timed cast session at the square pier, biggest fish wins | Summer ribbon, rare bait, decoration |
| Autumn | Harvest Fair | Show a crop and a good for judging by the villagers (quality counts: silver and gold score more) | Autumn ribbon, decoration, a gem |
| Winter | Feast of Lights | Everyone brings a dish to the feast table; the more variety, the more hearts with every villager | Winter ribbon, lantern decoration |

Ribbons go on a ribbon wall in the Almanac. The mini-games are short (under two minutes), have a skip-free retry, and are forgiving on touch. Rewards are generous but one-off per festival; a missed festival returns next year (4 weeks later), and the Almanac shows what was missed.

**Code.** `src/data/festivals.json` (rules, prizes, texts), `src/systems/Festivals.ts` (state machine, scoring), `src/scenes/FestivalScene.ts` reusing `SquareView` with a festival layer (stalls, props, villager positions), mini-game panels in `src/ui/panels/Festival*.ts`. Save: ribbons earned and the festival days already played, optional with repair rules. Events logged to the dashboard.

## 5. Pillar C: The Wild Woods (foraging, the Museum, expeditions)

**The Woods.** A new area reached from the farm (a path and signpost like the one to the square, a second small scene). It has forage spots that refill daily (seasonal forage: spring greens and blossoms, summer berries and shells, autumn mushrooms and nuts, winter roots and holly), a few dig spots (tap to dig) that give clay, minerals, fossils and rare artifacts, and a quiet pond. Foraged items are quality items (silver and gold chances, boosted by a new Foraging skill: the sixth skill, levels 1-10, 4 perks).

**The Museum.** A seventh lot in the village square (a new restoration room, the Museum, unlocked by a bundle of one of each of a set of finds). Donate fish, gold goods, minerals, fossils and artifacts; each shelf that fills pays a reward. Donated pieces show in the Museum 3D lot (shelves fill up) and count in the Collection Book.

**Expedition board.** A noticeboard at the Woods where villagers go out on timed expeditions (2, 6 or 12 hours) and return with ore, gems, minerals and artifacts. It replaces Stardew's mines with an idle, combat-free version that fits mobile. Each villager is better at some expeditions (Bram finds ore, Pip finds shiny things); sending someone you are close to takes a little less time.

**Code.** `src/data/woods.json` (spots, forage tables by season, dig tables, artifacts, museum shelves), `src/systems/Woods.ts`, `Museum.ts`, `Expeditions.ts`, a new Foraging skill in `skills.json`, `src/scenes/Woods.ts` and `src/world/WoodsView.ts` (real KayKit and Kenney models: trees, rocks, mushrooms, a pond), panels `MuseumPanel.ts` and `ExpeditionPanel.ts`. Save: forage day state, finds, museum donations, expeditions in progress, optional with repair rules. Server: none (per player).

## 6. Pillar D: Neighbours (living villagers)

- **Schedules.** Each villager has a daily routine (home, the square, the Pier, the market, the Woods) driven by time of day, weather and season, so a player can go looking for someone and find them somewhere different. They still visit the farm. Data in `villagers.json` (`schedule`), logic in `Villagers.ts`.
- **Heart events.** A short picture-card event at 2, 4, 6, 8 and 10 hearts (the 4 and 8 heart stories exist; add 2, 6 and 10, and let some events have a small choice that changes the reply and a few friendship points). No romance, ever.
- **Help Wanted board.** A daily board of three villager requests ("bring me 3 blueberries", "a gold-star cake"), refreshed each day, paying coins, gems and friendship, built on the existing order and bundle code. Seasonal requests join in.
- **A pet.** A dog or cat (chosen once, changeable) that follows the player on the farm, finds a small item most days, and can be petted. Pets in `cosmetics.json` are only costumes today; this adds a real companion.
- **Birthday festival cameo.** Birthdays get a small square scene with the villager and a cake.

Size: L. Save: pet choice, request state, event choices, all optional.

## 7. Pillar E: Almanac and the fuller Collection Book

**Almanac** (new Book page): the year on one screen. Four season panels with crops, fish and forage in season, the festival and its ribbon, birthdays, the market day, and "this season you have found X of Y". It also shows the ribbon wall.

**Collection Book pages (data-driven, same claim flow, rewards in `rewards.json`):** Crops, Fruit, Animal goods, Goods, Animals, Styles, Fish (existing 7) plus Foraged, Minerals and Fossils, Artifacts, Decorations, Buildings and Recipes, Villagers (portraits, keepsakes, events seen), Mastery plaques, Ribbons and Festivals, and Seasonal finds (four pages). About 12 more. A final Master Collector reward when all are done.

**Checks needed first:** how many entries a page can hold before the grid is slow on Low (paging or lazy rendering), and a one-off backfill for old saves (decorations, buildings and recipes from `state.buildings` and `stats`).

## 8. Pillar F: Dashboard controls and polish

- From the 1.8 brief, not yet built: schedule the market day and special events, set the weather for special days, send a letter to everyone (confirm the form exists). A small server config table and a marked section in `supabase/schema.sql` (safe to re-run), a client fetch with an offline default so the game never depends on it, an admin view, and a dashboard page "1.9 Year" (season share, festival play rates, woods and museum progress, help board completion).
- Paths under objects selectable (a "path under this" button on the object card).
- Welcome flow card covering the square, skills and 1.9.
- Spread the six head-start tip letters over days; rename the practice-mode "Old Tom"; fix the `help_received` over-count; unify the villager look tables.
- Update `CLAUDE.md`, `BALANCE.md`, `ADMIN.md`, `store/data-safety.md` if anything new is collected.

## 9. Build order (internal; one deploy at the end)

1. Calendar and Seasons core (A: clock, data, crop season rule, seed tray, HUD badge, tests).
2. Greenhouse building, seasonal fish and the look per season.
3. Festival framework in the square, then the four festivals one by one.
4. The Woods scene, forage, dig spots, Foraging skill.
5. Museum lot and expedition board.
6. Villager schedules, heart events, Help Wanted, pet.
7. Almanac and the new Collection Book pages, backfill.
8. Dashboard controls and the carry-over jobs.
9. One-time tips for every new feature (`INTROS` and `CROP_TIPS` in `Hints.ts`), the 1.9.0 changelog card with sections, docs, balance pass.
10. Full test pass, then the single push.

Each stage ends with: `npx tsc --noEmit`, `npm run validate-data`, `npm run build`, a headless test, Low / Medium / High, an old-save load, and a local commit.

## 10. Release rules (from CLAUDE.md)

`npm run simulate-economy` must not move income more than a few percent; test Low, Medium and High with the blank-frame guard; load an old save and a 1.8.6 save; bump `package.json` and `changelog.json` together to 1.9.0; two lines on what goes live, then wait for "yes push". Run the new `supabase/schema.sql` section in Supabase when 1.9 ships.

## 11. Decisions needed from Josh

1. **Season length:** 7 real days each (a 28-day year, recommended) or longer?
2. **Season rule:** crops only plantable in season (recommended, with the greenhouse as the way round it), or gentle bonuses only?
3. **Shared clock:** one worldwide calendar from a fixed epoch (recommended) or each farm starts its own year when it was created?
4. **Old events:** fold the four real-date events into the season festivals (recommended)?
5. **Foraging skill:** a sixth skill (recommended)?
6. **Museum:** a seventh square lot (recommended)?
7. **Expeditions:** keep them idle and timer-based (recommended), or drop them from 1.9?
8. **Pet:** dog and cat choice at launch?
9. **Heart events:** add 2, 6 and 10 heart events now?
10. **Dashboard controls:** include them in 1.9 (needs a Supabase section)?

## 12. Risks

- This is the biggest release so far. The build order keeps every stage shippable-looking and tested, and the single deploy is gated on Josh's "yes push".
- New tints and the Woods scene are the same area as the 1.8.0 white-screen bug: vertex colours only, no new shaders, merge static meshes for draw calls (Medium was 326 before it was merged in the square).
- A hard season rule can frustrate players; every season keeps 12 or more crops open and the greenhouse is the escape.
- Villager schedules can break existing farm walkers and the daily finds code; keep schedules additive and test the mailbox and visit flows.
- Collection pages with hundreds of entries on low-end phones: page the grid.
- Balance: seasonal fish, forage, expeditions and festival prizes all add income and gems; budget them in `BALANCE.md` and the simulator before release.
