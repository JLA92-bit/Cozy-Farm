# Cozy Acres 1.8.5 plan (draft for approval)

Source: the 1.8 design brief (Claude Doc "Cozy Acres 1.8 Village Friends - Design Brief") checked against the code on `main` (1.8.1). Nothing here is built. Size guide: S = under a day, M = a few days, L = a week or more of agent work.

## 1. What 1.8.5 is

The brief says 1.8.5 = **Village Restoration + Skills**. Most of the brief's level 20-50 content (new workshops, animals, crops) is tied to those two systems, so it is easy to over-scope. This plan splits the work so each release is small enough to test and ship safely.

| Release | Contents | Size |
| --- | --- | --- |
| **1.8.5** | Skills (Farming, Animals, Fishing, Cooking) + Village Restoration with the 3 rooms that need no new mechanics (Pantry, Barn Room, Treasury) | L |
| **1.8.6** | The 3 rooms that do (Pier, Kitchen, Workshop) + Crafting skill + finale festival | L |
| **1.8.7+** | New content from the brief: Beehive house, Juice press, Pottery kiln, Ducks, Horses, Blueberry, Peas, Lavender, mastery plaques | M each |

Why this split: Pier needs a new fishing spot and fish, Kitchen needs a new workshop with 8 recipes and a model, Workshop needs crafted helpers (sprinklers, auto-feeder) which are new mechanics. Pantry (seeds in Rosa's shop), Barn Room (+10% animal speed) and Treasury (trucks +15%, market day) reuse what exists.

## 2. What already exists that 1.8.5 builds on (checked in code)

- `qualityBoosts` in `src/systems/Quality.ts`: a hook for "perks and skills" to add silver/gold chance. Farming skill plugs in here.
- `src/systems/Perks.ts` and the `hasPerk()` pattern; `Production.ts` already applies a time multiplier (Bram's perk), `Fishing.ts` has `freePerDay`, `Economy.ts` has the merchant price hook. Skill and room perks follow the same pattern.
- Ask a friend: `askButton(item, qty, reason)` in `HelpPanel.ts`. Bundles can use it with a new reason.
- `stats` on the save (`game.incStat`, e.g. `collect_<product>`, `orders_completed`) for lifetime counts used by the head start.
- Panels use `Panel` + `h()`; `VillagePanel.ts` and `BookPages18.ts` are the models for new screens.
- Welcome: `Welcome18Panel.ts` is built to take new cards (brief: "Restoration and Skills get the same cards when 1.8.5 arrives").

## 3. Phase A: Skills (build first, no server work)

**Data (new `src/data/skills.json`, validated by `scripts/validate-data.mjs`)**
- 4 skills x levels 1-10, XP curve, per-level effect, and two perk choices at levels 5 and 10 (names and effects from the brief).

**Save (`src/systems/State.ts`, `Save.ts` `withDefaults`)**
- New optional field `skills`: per skill `{ xp, perks: string[] }` plus `headStart: boolean`. Missing = zero, with a repair rule in `withDefaults` (project rule).

**Code**
- `src/systems/Skills.ts`: listens to existing events/stats (harvest, `animal:collected`, fish caught, goods made), adds XP, levels up, applies effects.
- Effects wired to existing hooks:
  - Farming +1% gold per level: `qualityBoosts`.
  - Cooking +1% speed per level: next to Bram's multiplier in `Production.ts`.
  - Animals +1% product speed per level: animal timers (`Timers.ts` / `Animals.ts`).
  - Fishing "easier reel": a difficulty constant in `Fishing.ts` / `FishingPanel.ts`.
- Level 5 and 10 perks (brief list). The risky ones: Quick Grower and Big Harvest (crop timing and doubles), Seed Saver, Happy Herd, Breeder (extra home space), Head Chef (extra queue slot). Each is small but touches core systems, so each gets a test.
- Head start (once per farm): starting levels from lifetime stats, capped at 5, perk choice waiting. Follow the `Welcome18.ts` pattern (quiet, once, flagged).

**UI**
- Four skill rings on the Me screen (`CharacterPanel.ts`), a Skills page with the perk choice, a level-up toast, a Village Guide page (`guide-skills.json`), and a Welcome card.

**Needs checking before building:** whether crop and animal speed changes should apply to things already growing (the timers derive from start time, so a change could shift existing timers). Plan: apply to new plantings only, or confirm it is safe.

**Balance:** `BALANCE.md` and `npm run simulate-economy` must show no meaningful income jump (skills add speed and quality, which compound). Quality income is the main risk.

Size: M-L.

## 4. Phase B: Village Restoration (3 rooms)

**Data (new `src/data/restoration.json`)**
- Rooms, bundles (item + quantity, optional minimum star), opening level, reward id, celebration text. Pantry (level 10), Barn Room (level 15), Treasury (level 32), as in the brief.

**Save**
- New optional `restoration`: per room, per bundle, items given so far and done flags. Partial bundles keep what was given. `withDefaults` repair rule.

**Code**
- `src/systems/Restoration.ts`: give items (normal first unless the bundle asks for stars), progress, room completion event on the bus, rewards:
  - Pantry: Rosa sells rare seeds (new shop entries, needs a small shop hook).
  - Barn Room: animals produce 10% faster (same hook as the Animals skill).
  - Treasury: trucks pay 15% more (`Economy.ts` truck rewards) and the weekly village market day. The Calendar already has the Saturday label; the market day itself needs a defined effect (decision below).
- Ask a friend: "Ask friends" beside Give, new help reason `bundle` (`Help.ts`, `HelpPanel.ts`, and the server-side reason check if there is one).

**UI**
- First version: a Village Square panel (rooms, bundle boards, progress, Give, Ask friends), opened from the Village screen. Plus a visible "square" model at the farm edge that rebuilds in stages as rooms finish.
- The brief wants a second 3D scene for the square. That is the biggest single piece (it needs the hide-own-farm pattern from `Visit.ts` plus new models and picking). Recommended: ship the panel and the farm-edge model in 1.8.5, the full scene in 1.8.6 with the other rooms.

**Server and dashboard**
- Publish two numbers on the profile (rooms done, bundles done) so the dashboard can show restoration progress. That needs a marked, re-runnable section appended to `supabase/schema.sql`, the profile sync field (`src/online/Profile.ts`), an admin view, and a re-check of `store/data-safety.md` (aggregate progress numbers only). Josh must run the SQL in Supabase before the dashboard view works.

Size: L (the panel and data are M, the farm-edge model and Treasury/market day push it up).

## 5. Release rules for every phase (from CLAUDE.md)

1. Build, `npm run validate-data` after data edits, `npm run build`, `npx tsc --noEmit`, `bash scripts/pages/build.sh`.
2. Test Low, Medium and High (the 1.8.1 GPU check is now in; do not let new effects reintroduce blank screens, and keep new shaders simple).
3. Load an old save (pre-1.8 and a 1.8.1 save) and confirm nothing is lost; run `tools/playtest.mjs`.
4. Bump `package.json` and the newest `src/data/changelog.json` entry together; update CLAUDE.md (version, Recent changes, to-dos).
5. Two lines on what goes live, then wait for "yes push". Nothing is pushed without that.
6. Suggested order: Skills first (self-contained, no SQL), then Restoration, each pushed separately as 1.8.5 and a 1.8.5.1/1.8.6.

## 6. Decisions needed from Josh

1. **Split:** OK with 1.8.5 = Skills + 3 restoration rooms, and 1.8.6 = the other 3 rooms + Crafting + festival? (Or one bigger release, which I would not recommend.)
2. **Square:** panel plus farm-edge model in 1.8.5, full 3D square scene later?
3. **Market day:** what should it do? The brief only says "weekly village market day". Suggestion: Saturdays, villagers' items sell at +10% at the stall, plus one special order.
4. **Skill perks:** keep all 16 perks from the brief, or trim the riskiest (Big Harvest, Breeder, Head Chef) for now?
5. **Head start for skills:** up to level 5 from lifetime stats, as in the brief?
6. **Restoration head start:** the brief says barn stock "counts straight away". Simpler: players just give items. OK?
7. **Do you want Skills to ship before or after the Pixel 10 feedback on 1.8.1?** Suggest waiting for that feedback first.
8. **Supabase:** confirm the 1.8 `schema.sql` has been run, since Phase B adds another section to it.

## 7. Risks

- Skills compound with star quality and Bram's perk; income could rise faster than intended (balance sim needed).
- Skill perks touch timers; retroactive changes to growing crops need a decision.
- A second 3D scene is the largest unknown; deferred on purpose.
- More players on Medium/High means any new transparent or shader-heavy square effects need the same blank-frame safety (the GPU check covers a white screen but not a half-broken one).
- Restoration is long-term (the brief says 2-3 months of play for all six rooms), so tuning bundle sizes needs real player data from the dashboard.
