# Plan: 1.31 "The Old Mine"

**Status: plan only (24 Oct 2026), waiting for the owner's answers in section 9.** Nothing is built yet.

Owner's brief: a new place to play, drawing on big cozy games. Inspiration: Stardew Valley's mines (floor by floor,
an elevator every few floors, better pickaxes, geodes for the Museum), Dreamlight Valley's caves (pretty, calm, no
danger), Animal Crossing (fossils and rocks to tap, the Museum). Guardrails: **no monsters or combat, nothing to
lose, no timers that punish, no loot boxes** (nothing random is ever sold for gems or money), 13+.

---

## 1. Why the mine, and why now

- **The ores are already wanted.** Copper ore, iron ore, quartz, topaz and amethyst exist, but they only come from
  woods dig spots and creek panning. The Manor, Estate projects and Village Projects all ask for them, so players
  hit a wall waiting on a few digs a day. The mine becomes their proper home.
- **It works from mid-game.** Unlike levels 121-140, it reaches the players we have now (the woods open at 14).
- **It fills the Museum.** The Minerals and Fossils shelves are short and slow to finish.

## 2. What the player gets

**Getting there.** An old mine entrance in the cliff at the back of the farm, boarded up. At level 18 Bram's letter
asks you to help clear it: a restoration room "The Mine Entrance" (bundle of planks, stone, rope and coins, like the
woods trails). Then a cloud wipe takes you down, like the woods and the square. Back goes up again.

**Floors.** 60 floors in three layers, each a small cave (about 10 by 10 tiles) laid out from a seed (the same floor
looks the same for everyone on a given day, a new layout each day):

| Layer | Floors | Look | New finds |
| --- | --- | --- | --- |
| The Old Workings | 1-20 | timber supports, lanterns, mine-cart rails | coal, copper, iron, quartz, topaz, clay, fossils |
| The Crystal Caverns | 21-40 | glowing crystal clusters, a still underground pool | silver ore, amethyst, jade, ruby, emerald, geodes |
| The Ember Deeps | 41-60 | warm orange glow, old dwarf-style carvings (no lava you can fall in) | gold ore, sapphire, opal, diamond (rare), ancient relics |

**Playing a floor.**
- Tap a rock to swing at it. Small rocks break in 1 swing, big ones in 2-4 depending on your pickaxe. They drop ore,
  stone, gems or fossils, which fly to the barn.
- One rock on each floor hides the **ladder down**. A **lift** every 5 floors remembers how deep you got, so you
  never redo floors.
- Extras: an old **mine cart** to tap for a small bundle of ore, **cracks in the wall** that need a better pickaxe
  (always optional), a **glowing pool** on crystal floors (fish for 3 cave fish), and now and then a **treasure
  chest** on a lift floor (5, 10, 15...), opened once ever.

**The lantern (the daily limit).** Swings use lantern oil: 60 swings a day, refilled each morning. That's about 3-5
floors a day early on, 15-20 minutes of play. It's never needed for anything else. Upgrades (Bram, from bars) raise
it to 80, 100 and 120. **Owner question:** a daily limit like this, or unlimited swings?

**Pickaxes (Bram's forge).** Copper, then iron, then gold, made from bars at the forge. Each one breaks big rocks in
fewer swings and opens the wall cracks of its layer. The Crystal Caverns need the iron pickaxe and the Deeps the gold.

## 3. New workshops and recipes

- **The Smelter** (farm workshop, level 18 with the mine): coal plus ore make bars. Copper bar, iron bar, silver bar,
  gold bar, and a stone brick from stone. 5 recipes.
- **The Jeweller** (farm workshop, level 26): gems and bars make things to sell, give and display. 10 recipes, e.g.
  cut ruby, silver ring, emerald brooch, gem lantern, crystal vase, opal pendant, gold locket, geode bookends,
  diamond tiara (very late), birthstone charm.
- **Geodes** (crystal floors and deeper): Bram cracks them open for a few coins and you get one mineral from a fixed
  list. It is a find, like digging, and is **never sold for gems or money**, so it is not a loot box.
- **Every new item has a use** (`validate-data` enforces this): recipes, the Museum, villager favourites, boat
  wishes, Manor/Estate needs.

## 4. Museum, wildlife, villagers and the home

- **Museum:** two new shelves, "The Deep" (gems: ruby, emerald, sapphire, opal, diamond, silver and gold ore) and
  "Ancient Life" (6 new fossils: trilobite, fossil fish, cave bear tooth, petrified wood, fern slab, crystal shell),
  plus 3 relics on the Old Artifacts shelf (miner's lamp, carved stone, old pick head).
- **Wildlife Album:** 3 cave species to photograph (cave bats, glow worms, a cave salamander). Note: the cave pool fish
  would go in the Collection Book, not the album.
- **Villagers:** Bram's 5-letter mine arc, and each villager gets one mine thing they love (Hazel opals, Juniper
  amethyst...).
- **The home (1.29 tie-in):** 8 new furniture pieces from the mine: crystal lamp, gem display case, mine-cart
  planter, lantern sconce, geode bookends, ore shelf, stone fireplace, crystal chandelier.
- **Farm decor:** crystal garden, gem fountain, mine cart with rails, lantern post (the Holiday pack's track pieces
  and the existing cart, rock and lantern models, plus a few made in code).

## 5. Skill

**Mining, a sixth skill (owner question).** Levels 1-10, earned by breaking rocks. Perks include: 1 rock in 10 breaks
in one swing, more gems, a free lift ride back to the deepest lift each day, and fossils glint. An alternative is to
put mining XP into Foraging and skip the new skill (less work, less to show).

## 6. Pace and balance (to confirm with the simulator)

- **Depth:** an engaged player at 60 swings a day reaches floor 20 in about a week, floor 40 in about 3 weeks and
  floor 60 in about 6 weeks. After that the mine stays a daily source of ore and gems with new layouts.
- **Value:** a full lantern on floors 1-20 is worth about 1,500-2,500 coins of goods a day. That's about the same as
  a woods visit, so it's a second daily loop, not a money machine. Deeper floors pay more, in line with the level it
  takes to get there.
- **Prices** fit the existing gems (quartz 60, topaz 100, amethyst 120, jade 160): ruby 220, emerald 240, sapphire
  260, opal 300, diamond 450. Bars sell for about 1.3 times their ore and coal.
- **Ore for the big projects:** the Manor/Estate ore needs would take days instead of weeks. BALANCE.md gets a "1.31
  The Old Mine" table.

## 7. Technical outline

- **Scene:** `src/scenes/Mine.ts` + `src/world/MineView.ts`, built like the woods (cloud wipe, its own camera bounds,
  back closes it, Photo mode works). One floor is built at a time, so draw calls stay tiny. The cave walls,
  floor and rocks are instanced. The crystals are made in code with an emissive glow, and the layers each have their
  own light colour.
- **Data:** `mine.json` (layers, floor rules, rock tables, lift floors, chests, lantern, pickaxes), new items in
  `items.json` with icons (`scripts/icon-variants.mjs` where possible), recipes, `museum.json` shelves,
  `wildlife.json`, `furniture.json` pieces, `skills.json`.
- **State:** `mine` { deepest, lifts, today { floor, swings, broken[] }, chests[], pickaxe, lantern } with a repair
  rule in `Save.ts` (rule: every new field optional).
- **Systems:** `src/systems/Mine.ts` (floor layout from a seed, swings, drops, ladder, lifts), `MineEffects.ts`
  (skill perks).
- **UI:** a mine banner (floor, layer, swings left as a lantern bar, Up and Lift buttons), a lift sheet, the
  Smelter and Jeweller use the existing workshop screens.
- **No server change, no `schema.sql`.** Nothing new is shared online.
- **Tests:** regression checks for floor layouts being the same for the same day, the lantern limit, lifts remembering
  depth, chests opening once, save repair, and a perf check on the busiest floor (crystal floors). Screenshots of
  each layer at Low, Medium and High (rule 9).

## 8. Build order and size (about 2 weeks)

1. **Mine scene and floors 1-20** with the entrance, ores, ladder, lifts and lantern (about 5 days). Playable on
   its own.
2. **Smelter, bars, pickaxes, Jeweller and the new items and recipes** (about 3 days).
3. **Crystal Caverns and Ember Deeps,** geodes, chests and the cave pool (about 3 days).
4. **Museum shelves, wildlife, villager arc, home furniture, farm decor, the Mining skill,** balance, tests and
   screenshots (about 3 days).

It can ship in two releases if you like: 1.31 (steps 1-2, the first 20 floors) and 1.32 (the deeper layers).

## 9. Questions for the owner

1. **Daily limit:** a lantern with 60 swings a day (upgradable), or unlimited?
2. **Mining skill:** a new sixth skill, or fold it into Foraging?
3. **Opening level:** 18 (just after the woods at 14)?
4. **Release:** one release (about 2 weeks), or two (first 20 floors, then the deeper layers)?
5. **Entrance:** in the cliff at the back of the farm, or across the water like the woods and the square?
