# Cozy Acres roadmap (from 1.16, October 2026)

This is the long-term plan for Cozy Acres. It follows the 1.15 audit and the owner's decisions of 15 Oct 2026 (CLAUDE.md section 7a). Each release has one theme, is small enough to review, and ships with tests for what it changes (`npm run test:regression`, `npm run test:perf`). Numbers are starting points: tune them in `src/data/*.json` with `validate-data` and `simulate-economy`.

## Guardrails (never change without the owner)

- **No prestige or reset, ever.** Always more levels and more to unlock.
- **Friends only:** no romance or marriage.
- **Audience is 13+:** no loot boxes, no chat, free text stays short and is only seen by friends.
- **Cozy first:**
  - nothing is lost while the player is away;
  - anything that takes something away gives a recoverable window and a grace day after a break;
  - nothing becomes unavailable on a schedule (the 1.9 seasons were removed for this reason).
- **Late game asks about 2-3 hours a week** (three 10-15 minute check-ins a day). Timers, upkeep and goals past level 60 are tuned to that.
- **Deepen the current farm before adding a second one.**
- **Money:**
  - nothing until after the Play production launch;
  - after it, paid building unlocks and speed-ups are allowed, within the rules in "2.0 The Market Stall" below;
  - no loot boxes.
- **Every release runs on the cheapest phone you test on:** draw calls stay inside `npm run test:perf` (720 decor, at most 520 calls).

## Release plan

Re-sequenced on 20 Oct 2026: Willowmere Manor and the Deep Woods (owner's requests) took 1.18 and 1.19, so the rest moved up.

| Version | Theme | Size | Status |
| --- | --- | --- | --- |
| 1.17 | The Long Road (late-game pace) | ~1 week | done |
| 1.18 | Willowmere Manor | ~1.5 weeks | done |
| 1.19 | The Deep Woods (woods phase 1) | ~1.5 weeks | done |
| 1.20 | Woodland Friends (woods phase 2) and Care and Craft | ~1.5 weeks | done (local) |
| 1.21 | Woodcraft (woods phase 3: the Lodge, camping, woods weather) | ~1 week | done (local) |
| 1.22 | Server-side leaderboard checks, then Orchard Days (levels 101-120) | ~1.5 weeks + schema | |
| 1.23 | The Ancient Grove (woods phase 4) | ~1 week | |
| 1.24 | The Tea House and the Florist (new workshops, villager arcs) | ~1 week | |
| 1.25 | Helping Hands (farmhands and masteries) | ~1 week | |
| 1.26 | Estate Projects, trimmed to 2-3 (the Clock Tower, the Lighthouse), as follow-ons to the Manor | ~1 week | |
| 1.27 | The Treehouse (woods phase 5) and Wildlife Album | ~1.5 weeks | |
| 1.28 | Together (co-op Village Projects) | ~1.5 weeks + schema | |
| 2.0 | The Market Stall (purchases), after Play production | ~2 weeks + Play setup | needs the Play launch |
| 2.x | Neighbourhoods, second plot, iOS | later | |

### 1.17 The Long Road (late-game pace)

**Built (1.17.0, 17 Oct):** a flat curve at 62,810 XP; late-game XP shares of 20% (Master claim), 30% (Master week), 20% (boat visit) and 30% (3-star festival); a 500-charm cap for trophies; Hazel's letter; and the simulator running to level 120. Result: level 100 around day 187 (it was out of reach in 300 days), about 2.4 days a level. Still to do from this section: the server-side leaderboard plausibility checks.

- **Why:** levels past 60 currently cost +2,500 XP each, so the content for levels 81-100 is about 9 months away for an engaged player.
- **Curve:** hold XP to next level flat past level 60 instead of growing it. With the simulator's player (about 16k XP a day around level 50-60):

  | Curve | L80 | L100 | 60 to 100 | 60 to 150 |
  | --- | --- | --- | --- | --- |
  | Today (+2,500 a level) | 113k | 163k | about 285 days | about 2.7 years |
  | **Flat at 62,810 (recommended)** | 63k | 63k | about 157 days | about 1 year |
  | Gentle (+500, cap 80k) | 73k | 80k | about 182 days | about 1.2 years |

  Flat on its own is about 4 days a level at today's late-game XP rate. To reach the agreed 2-2.5 days, 1.17 also lifts late-game XP:
  - Master Challenges give XP;
  - boat visits and festivals give XP;
  - level 60+ crops and dishes get a little more XP (BALANCE.md).

  Players already past 60 jump a few levels on the update day; a letter from Hazel explains that "the road ahead got shorter".
- **Simulator:** `simulate-economy` runs to level 120 and models the Master Board, Boutique, upkeep costs, boat visits and the 61-100 content. Add a one-line summary to CI.
- **Leaderboards:** server-side plausibility checks in `upsert_profile`. Implausible scores are flagged on the dashboard, never hidden automatically. Checks: level matches total XP on the level table; a cap on XP gained per day since the last update.
- **Charm:** cap the charm that Level Markers and trophies add, so the charm board stays about decorating.
- **Files:** `levels.json`, `src/data/index.ts`, `scripts/simulate-economy.mjs`, `master.json`, `boatvisits.json`, `festivals.json`, `supabase/schema.sql` (new marked section), `admin/`, `BALANCE.md`.
- **Good release when:** BALANCE.md has the new 60-120 table, and the owner has seen the before and after numbers.

### Care and Craft (upkeep follow-through) - built in 1.20

- **Vet's Cottage levels 2-3:**
  - treatment 25% cheaper per level;
  - "check-up" (once a day, one home): its animals can't fall unwell for 3 days.
- **Carpenter levels 2-3:**
  - repairs 25% cheaper per level;
  - "fresh paint": a repaired building wears 30% slower for 10 days.
- **Animals skill perk "Hardy Stock"** (sickness chance x0.6). Crafting perk "Sturdy Joints" (wear x0.75).
- **Care round:** one button on the Farmhouse that treats and repairs everything you can afford, with a total shown first.
- **Gentle field upkeep only if the dashboard shows players like the first month of upkeep.** Example: scarecrows lose shine and protect fewer tiles until polished. Never crop loss.
- **Files:** `upkeep.json`, `Upkeep.ts`, `CarePanel.ts`, `skills.json`, `SkillEffects.ts`, `buildings.json` (`upgrades`), `Hints.ts`.

### 1.19 Estate Projects

- **What:** long goals over several weeks that always show the next target past level 60. Each project has 3-5 stages paid in goods, coins and Master tokens, and places a unique building when done.
- **Projects:**
  - **The Clock Tower:** the village square clock chimes on the hour; shows the real time.
  - **The Farmhouse East Wing:** +1 production slot of your choice and a new interior photo spot.
  - **The Market Hall:** +1 stall slot and a covered market for rainy days.
  - **The Lighthouse Restoration:** Boat Visitors come three days a week instead of two.
  - **The Botanic Glasshouse:** a display for one of every crop; completes a Collection Book page.
  - **The Bandstand:** music plays on festival days; villagers gather there.
- **Pace:** each stage is about 3-5 days of normal play at 2-3 hours a week, never more than 4 projects open at once. No time limit, nothing lost if paused.
- **Build it on the Restoration bundle system** (`Restoration.ts`, `restoration.json`, `SquarePanel.ts`), not a new one. Save field `estate` with a repair rule.

### 1.20 Helping Hands (farmhands and masteries)

- **Farmhands:** hire up to 3 helpers from the village. Each takes one chore with a simple schedule:
  - water and replant one row of fields;
  - feed one animal home;
  - restart one workshop queue.
  - Paid daily in coins; they rest on festival days.
  - They save time but never play for you: nothing is sold or delivered automatically.
- **Mastery lines** (building on Mastery plaques): after a workshop or animal line reaches its plaque, pick one permanent flavour bonus, e.g.:
  - Bakery: +1 bread from every 10 batches;
  - Dairy: gold-star chance +5%;
  - Chickens: double eggs on rainy days.
  - No resets.
- **Files:** `HelperEffects.ts`, `Crafting.ts`, new `Farmhands.ts` + `farmhands.json`, `mastery.json`, `Mastery.ts`.

### 1.21 Orchard Days (content for levels 101-120)

| Kind | New content |
| --- | --- |
| Crops (4) | rice (101), garlic (105), sweet potato (110), raspberry (116) |
| Trees (3) | peach (103), plum (108), olive (114) |
| Dishes (12) | peach cobbler, plum jam, olive oil, garlic bread, raspberry ripple, sweet potato pie, rice pudding, risotto, peach sorbet, plum cake, fried rice, olive focaccia |
| Decor sets | Orchard Market (crates, ladders, fruit carts), Riverside Picnic (blankets, baskets, lanterns), Mediterranean Courtyard (olive pots, tiled benches, fountain) |
| Farmhouse | level 15 (decor 800, fields 140) |
| Master | 2 new challenges: "pick {n} orchard fruit", "fill {n} boat wish lists" |
| Mini-feature | **Fruit Press Festival** day added to the festival cycle (`cycle.json`) |

Raise `authoredMax` to 120. Every new building gets an entry in `Hints.ts` `INTROS`, every new crop in `CROP_TIPS`.

### 1.22 The Tea House and the Florist

- **Tea House workshop (level 106):** tea leaves (new crop at 104) make green tea, mint tea, chai, iced tea and matcha cake. A villager favourite gift line.
- **Florist workshop (level 112):** flowers from the farm's flowerbeds and sunflowers and lavender make bouquets, wreaths, buttonholes and flower crowns.
  - Bouquets are the best gifts for villagers (a new "loves" tier for flowers).
  - Wreaths can be hung on any house door as decor.
- **Villager arcs:** a second arc for each of the six villagers, unlocked at 10 hearts and told in letters over a week:
  - Rosa: writes a cookbook with your recipes.
  - Old Tom: rebuilds his old fishing boat.
  - Juniper: holds her first art show in the square.
  - Pip: plans a treasure hunt across the island.
  - Hazel: restores the village records.
  - Bram: forges a bell for the Clock Tower.
  - Friends-only heart events at 12 and 14 hearts.
- **A new villager:** **Wren**, a travelling botanist who moves into the square once the Botanic Glasshouse is built. Friends only.
- **Files:** `buildings.json`, `recipes.json`, `items.json`, `crops.json`, `villagers.json` (`stories`), `Mail.ts`, `Village.ts`.

### 1.23 Together (co-op Village Projects)

- Friends add goods to a shared build, such as a footbridge between two farms, a community garden or a fireworks night. Every contributor gets a plaque with their name on it, and a decor reward when it's finished.
- Server tables follow the Ask a friend pattern: exactly-once claims, friends only, deleted with the account. Append a marked section to `schema.sql`. Update the Play Data safety answers.
- A `game_config` switch turns it off without a release.

### 1.24 Wildlife Album

- Gentle wildlife visits the Wild Woods and the farm's edges at different times of day and in different weather: deer, fox, rabbit families, ducks. The models exist and are unused: `pet/deer`, `pet/fox`, `pet/penguin`, `pet/panda`, `pet/polar`.
- Tap to take a photo for the **Wildlife Album**, a new Collection Book page with a reward per set.
- **Photo mode:** hide the HUD, add frames and a share card, and save to the phone.
- Penguins and polar bears visit a "Frosty Cove" decor set by boat on festival days as visitors only. Nothing has to be caught before it is gone.

### 2.0 The Market Stall (purchases, only after the Play production launch)

- **Owner's direction:** paid building unlocks and speed-ups, with no loot boxes.
- **Rules to agree before building:**
  1. Everything bought can also be earned in play. Paying only shortens the wait.
  2. Speed-ups cost gems, and gems can be bought or earned. The gem prices for speed-ups don't change when purchases arrive.
  3. Building unlocks sell early access to a building a few levels before it unlocks normally, at most 5 levels early, never past a player's farm size.
  4. Purchases never touch leaderboards, trophies or Master Challenges. A bought speed-up does not count toward any of them.
  5. Clear prices, no countdown pressure, no "limited time" items, and a monthly spending reminder.
  6. Audience 13+: Play's purchase checks apply. Never ask for money in a villager's voice.
- **Technical:** the Android app is a Trusted Web Activity, so purchases go through **Google Play Billing via the Digital Goods API** from the web app. Grant purchases on the server (a Supabase Edge Function verifies with Google) and record them in a new table. Restoring purchases across devices needs sign-in. The website and iPhone versions can't sell until there's a separate plan.
- **Paperwork:** Play Console merchant account, store listing "Contains in-app purchases", Data safety form, privacy policy, `store/data-safety.md`.

### Later (2.x)

- **Neighbourhoods:** groups of 5-20 friends with a shared weekly goal and emotes, no chat.
- **Second plot:** a hill farm or orchard island with its own build grid, gated by an Estate project. Needs its own performance budget, using the multi-scene pattern in `scenes/Woods.ts` and `scenes/Square.ts`.
- **iOS:** Capacitor with native push, an offline bundle and Sign in with Apple.
- **Accessibility pass:**
  - 44 px buttons;
  - a larger-text option;
  - full reduced motion;
  - colour-blind safe cues (sick, worn and ready states have icons as well as colour).
- **Localisation:** keyed player text, starting with one extra language.

## The Deep Woods (owner's request, 18 Oct 2026): from one glade to a whole forest

The Wild Woods today is one island: about 10 forage spots, 4 digs a day, the Museum and the expedition board. Players finish it in a few minutes a day. The plan grows it into a forest with its own long progression, its own residents and activities you can't do anywhere else. Like the Manor, it ties into the rest of the game: woods finds feed the Manor's bundles, and the Manor's Grounds and Foundations rewards give more forage and digs.

**Phase 1 (1.19 The Deep Woods, built 19 Oct):**
- **Three new regions** on islands round the glade, each reached by restoring a trail (a bridge, stepping stones, a rope walk). Trails are bundle projects like the Manor's wings, opening at levels 20, 28 and 36.
  - **Mossy Hollow:** moss, bluebells, puffballs, wild garlic, elderberries and rare morels. At night **fireflies** drift over the hollow; catch them for jars (and later lantern decor).
  - **Crystal Creek:** watercress, river mint, cattails, water lilies and wild strawberries. **Panning for gold:** a few pans a day in the creek bring up gold flakes, agate, jade, river pearls and the odd gem.
  - **Whispering Pines:** pinecones, chestnuts, lingonberries, pine boletes and sloes. **Tree tapping:** taps on the old trees fill with maple sap or pine resin over a few hours, a gentle check-in loop.
- The glade keeps everything it has. A region bar on the woods banner flies the camera between areas.

**Phase 2 (1.20 Woodland Friends, built 20 Oct):** six families (deer, rabbits, hedgehogs, foxes, squirrels, owls), the Woodland Gifts Museum shelf, the Critter Journal and Wren's field notes. Wren is a woods resident for now, not a seventh heart villager.
- **Critter friendships:** a feeding stump in each region. Leave the treat they like (berries for the hedgehogs, chestnuts for the red squirrels, apples for the deer, fish for the fox, mealworms for the owl) and they visit at their time of day.
- Hearts with each critter family bring gifts (rare forage, feathers, shed antlers for the Museum) and a **Critter Journal** page in the Collection Book. Models exist for the deer, fox and rabbits; hedgehog, squirrel and owl are small procedural models.
- **Wren the ranger** (the botanist from 1.22, brought forward) moves into a cabin in Whispering Pines: friends only, gives "field notes" requests and teaches the critters' tastes.

**Phase 3 (1.21 Woodcraft, built 17 Oct):** the Lodge is a farm workshop opened by the Hollow Bridge trail (not a building in the woods), with 12 recipes; maple syrup and the firefly lantern were already added in 1.20 (Sugar Mill, Pottery Kiln). Camping and woods weather as planned.
- **The Woodcraft Lodge**, a workshop in the woods that only takes woods produce:
  - acorn bread, mushroom tea, elderflower cordial, herbal salve, pinecone wreath, birch basket, firefly lantern, maple syrup and maple candy, resin varnish;
  - lodge goods are wanted by Boat Visitors and the Manor's later wings.
- **Camping:** pitch a tent by the campfire before bed and wake to a "camp morning" of extra finds round the camp.
- **Weather in the woods:**
  - rain brings out snails and mushrooms (more mushroom spots);
  - mist makes rare finds a little likelier;
  - nothing is ever only available in one weather (cozy rule).

**Phase 4 (1.22 The Ancient Grove):**
- A fifth area at the heart of the forest: the **Elder Oak**, a huge tree that grows over months as you bring it offerings (woods produce, Lodge goods, gold-star items).
- Each growth stage gives a lasting woods perk:
  - better forage quality;
  - a fifth daily pan;
  - critters visit twice a day;
  - a glowing canopy at night.
- The final stage plants a sapling of the Elder Oak for your own farm.

**Phase 5 (1.23 The Treehouse):**
- Build and decorate your own treehouse in the Pines (multi-stage), with a small woods decor set (log chairs, mushroom lamps, hanging lanterns, moss rugs) usable only up there. A cozy base and a photo spot.

**Ideas bank for the woods:**
- Night-blooming moonflowers.
- A wishing well that takes one coin a day for a tiny surprise.
- Bird watching (a second album next to the Wildlife Album).
- Bark rubbings for the Museum.
- Foraging challenges on the Master Board.
- A woods festival on the 28-day cycle (Lantern Walk).
- Hollow logs with a hidden find once a week.
- A rope swing over the creek (purely for fun).

## Content bank (ideas not yet scheduled)

- **Crops:** cranberry, zucchini, chilli, saffron (rare, slow), cocoa (for the existing chocolate), coffee, kiwi vine, fig tree, almond tree, maple tree (syrup from trees).
- **Animals:** recolour existing models for new stock without new art, e.g.:
  - a woolly alpaca from the sheep;
  - a highland cow;
  - a black-and-white duck;
  - a goose (from the duck model).
- **Workshops:**
  - Preserves Cellar: pickles and aged cheese, with long timers for check-in play.
  - Smokehouse: fish and cheese.
  - Dye Works: coloured yarn and fabric that unlock paint colours for decor.
  - Chocolatier.
- **Decor sets:**
  - Lantern Festival;
  - Cottage Garden (arches, bird baths);
  - Lighthouse Point;
  - Village Fete (bunting, coconut shy, tombola);
  - Autumn Harvest and Winter Lights, as cosmetics only (never availability).
- **Collections:**
  - shells on the beaches;
  - pressed flowers from the Woods;
  - a recipe book page per workshop;
  - a decorations page.
- **Festivals:** add to the 28-day `cycle.json` rotation: Fruit Press Festival, Lantern Night, Sheep Shearing Fair, Kite Day (on windy weather).

## How each content batch ships

1. Write the data: crops, trees, recipes, items, buildings, decor, Farmhouse level, Master challenges.
2. Add tips to `Hints.ts`, and models through `scripts/fetch-assets.sh` and `ADD_ONLY=... node scripts/build-assets.mjs`. New decor is batched automatically.
3. Raise `authoredMax`. Run `npm run validate-data`, `npm run simulate-economy`, `npm run test:regression` and `npm run test:perf`.
4. Bump the version: `package.json` plus a new first entry in `changelog.json`. Update `BALANCE.md` and `CLAUDE.md`.
5. Tell the owner in 2 lines what goes live and wait for "yes push".
