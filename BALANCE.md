# Balance and progression

The numbers live in `src/data/*.json`. This document explains the intent behind them, so they can be tuned
without losing the shape of the curve.

## Goals

- **Player-friendly:** no energy, no real money, nothing is lost by being away. Timers keep running offline and the
  Welcome back screen lists what finished.
- **A reason to come back:** short timers early (30 s wheat), longer timers later (up to 6 h crops,
  2 h recipes) that suit check-in play.
- **Always a next goal:** the goal card suggests the most useful action (harvest, deliver, collect, plant, build
  the next unlocked building, or the next level's unlock).
- **Something new every level:** `npm run validate-data` fails if any level from 2 to 50 unlocks nothing.

## XP curve

`base(L) = round(15 + 12 * (L - 1)^1.6)`. Levels 1-8 use `base(L)` as is, so the first hour is unchanged. From
level 9 on, `xpToNext(L) = base(L) * (1 + 0.115 * (L - 8))`, rounded to 5 (Update 2). About 473k XP to reach
level 50 (it was 112k, which an engaged player reached in about 17 days, see the simulation below).

| Level | XP to next | Cumulative | Active play (playtest) | Engaged player (simulated, 3 check-ins a day) |
| --- | --- | --- | --- | --- |
| 1 | 15 | 0 | first minute | |
| 2 | 27 | 15 | ~2 min | |
| 3 | 51 | 42 | ~6 min | |
| 5 | 125 | 178 | ~30 min | |
| 7 | 226 | 476 | ~1 h | first evening |
| 10 | 515 | 1.4k | ~2.5 h | day 1 |
| 15 | 1.5k | 5.7k | | day 3 |
| 20 | 3.2k | 16k | | day 6 |
| 30 | 9.3k | 73k | | ~2 weeks |
| 40 | 19.8k | 209k | | ~4 weeks |
| 49 | 33.7k | 439k | long-term goal | ~8 weeks |

The active-play times come from `tools/playtest.mjs`, which only plants, harvests and delivers orders. A real
player who also sells, builds and raises animals levels a little faster. The check-in times come from
`scripts/simulate-economy.mjs` (below).

XP sources, roughly in order of size: crops (2-34 XP per field, scaling with grow time), orders (item value / 3,
minimum 5), animal products (3-15), recipes (about item value / 10), obstacles (2-14), quests, achievements and
land expansions. Quest XP scales with level (daily `10 + 8 x level`, weekly `60 + 40 x level`) so quests stay
worth doing on the longer late levels.

Level-up rewards: `25 x level` coins (+100 every 5th level) and 1 gem (5 every 5th level).

## Unlock schedule (highlights)

| Level | Unlocks |
| --- | --- |
| 1 | Wheat, fields, dirt paths |
| 2 | Corn, chickens, Chicken Coop, Feed Mill |
| 3 | Carrot, Roadside Stall, fences, stone paths, cap |
| 4 | Turnip, Bakery (bread), flower beds, hay bales, first land expansion |
| 5 | Sugarcane, Sugar Mill, Farmhouse level 2, pup companion |
| 6 | Apple trees, cows, Cow Pasture, scarecrow, travelling merchant |
| 7 | Tomato, Dairy (cream), lanterns, fishing at the dock, worm bait |
| 8 | Cotton, Truck Depot, corn bread, Fish Shack (fish cake) |
| 9 | Sheep, Sheep Pen, beanie |
| 10 | Strawberry, Loom (yarn), butter, Farmhouse level 3 |
| 11-20 | Cherry/grape/pear/orange trees, pigs, goats, Jam Kitchen, cookies, cheese, fountain, statues |
| 21-30 | Eggplant, pepper, broccoli, watermelon, lemon/banana/coconut trees, cakes, pies, caramel, ice cream |
| 31-50 | Radish, cauliflower, marmalade, socks, salsa, gazebo, tower, golden windmill, chapel, manor, crown |

Every level also adds land expansions every ~1.4 levels, order-board slots (3 to 9) and cosmetics.

## Economy

- **Crops** sell for about 3 x seed cost, yield 2 per field. Longer crops are worth more per harvest but slightly
  less per minute, so short crops reward active play and long crops reward check-ins.
- **Processed goods** sell for about 1.4-1.5 x their ingredients, so production chains are the main money maker
  mid-game. Bread (3 wheat -> 28 coins) is a deliberately generous first recipe to hook players on the Bakery.
  Feed sells for less (1.25-1.8 x) because it is mostly eaten, not sold.
- **Orders** pay 1.8 x item value (+ up to 25% from Charm) and are generated only from items you can currently
  make (the whole chain: a finished building and ingredients you can get). New orders prefer goods the board does
  not already ask for. The first order is always 2 wheat (tutorial).
- **Truck:** 3-5 crates (different goods in each while possible; one more crate every 8 levels), 2 x value per
  crate, plus a 50% bonus and a rare crate for filling all of them (3 x value in total). Crate sizes are 7 cheap,
  4 mid-value or 2 pricey goods (+-30%). 16 h window so a truck that arrives in the evening is still there the
  next morning, 30 min cooldown.
- **Stall:** you set the price (0.5x-1.35x value, default 1.1x). Cheaper listings sell sooner (30 s - 8 min).
  The stall takes any amount, so it must stay clearly below orders (1.8x): it is the outlet for spare goods, not
  the main money maker.
- **Merchant:** visits 2 h out of every 4 h from level 6 with decor at 30% off, crate-only cosmetics, bulk goods
  and gems for coins. Bulk goods cost 1.1 x value (`bulkPriceMult`) so they cannot be flipped at the barn; they
  save time on orders, which pay 1.8 x.
- **Shared market:** from level 6 (`market` in economy.json). Players list barn goods for 0.5x-2.5x their value
  (up to 50 per listing, no fee). Open listing slots: 3 at level 6, then 4/5/6/8 at levels 10/15/22/30. Coins are
  collected from My listings. In practice mode demo neighbours buy your listings priced up to 1.6x value after
  1.5-7 min (cheaper sooner), and their own goods never cost less than 1.1x barn value so they cannot be flipped.
- **Production queue:** a job that has not started yet can be cancelled for a full ingredient refund.
- **Fields** cost 10 coins + 8 per field beyond the 8 you start with. Animals get 25% pricier per animal owned.
- **Gems** are only earned (levels, awards, daily calendar, rocks, some orders, crates, merchant). Finishing a
  timer costs 0.2 gems per minute left (minimum 1).
- **Late-game coin sinks:** farmhouse levels 6-8 cost 40k / 85k / 150k, the trophy decorations cost 2.5k (Stone
  Ring, level 29) up to 50k (Grand Manor, level 48), and land expansions grow 1.32 x each (the last ones cost
  0.5-3.3M). Income at level 40+ is roughly 50-70k coins a day for an engaged player, so there is always a
  next big thing to save for.

## Building caps (farmhouse level)

| Farmhouse | Needs player level | Cost | Fields | Fruit trees | Each animal home | Each production building | Decorations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | - | 14 | 4 | 1 | 1 | 25 |
| 2 | 5 | 800 | 20 | 6 | 1 | 1 | 40 |
| 3 | 10 | 2,500 | 28 | 9 | 2 | 1 | 60 |
| 4 | 16 | 7,000 | 36 | 12 | 2 | 2 | 85 |
| 5 | 22 | 16,000 | 44 | 16 | 2 | 2 | 115 |
| 6 | 29 | 32,000 | 52 | 20 | 3 | 2 | 150 |
| 7 | 36 | 55,000 | 60 | 24 | 3 | 2 | 200 |
| 8 | 44 | 90,000 | 70 | 30 | 3 | 3 | 260 |

**Fields (Update 2).** Players ran out of plantable squares too early, so a new farm starts with 8 fields (was 6)
and every farmhouse level allows more (old caps: 10/16/22/28/34/40/48/56). Why this stays balanced:

- Field price rises by 8 per field, so the extra fields cost real coins: filling farmhouse level 1 (fields 9-14)
  costs 180 coins, level 2 (15-20) 468, level 8 (up to 70) about 15.7k in total. The 70th field costs 498.
- Crop income per field per hour drops as crops get longer (wheat ~600 coins/h when replanted constantly, tomato
  ~145, strawberry ~105, watermelon ~48, cauliflower ~41). A full level 8 farm of cauliflower makes about 2.9k
  coins/h of check-in income, well below production chains and the 90k farmhouse upgrade.
- Early levels are limited by attention, not fields: a level 1-4 player cannot keep 14 wheat fields busy for long,
  so the extra room mostly helps players who plant longer crops between check-ins.
- More fields mostly feed production buildings and orders, which still need the animal and workshop caps.

Existing farms keep every field they own. The higher cap applies at once, and `freeCount` (8) only changes the
price of the next field, which becomes slightly cheaper.

**Getting more fields is always explained:** the Shop Field card shows `owned / cap`; when it is full it says
which farmhouse level adds how many and opens the Farmhouse panel. The Farmhouse panel lists what every level
adds. A tip appears when every field is planted (at most every 6 minutes) and after buying the last allowed field,
and the goal card suggests a new field while one is affordable (1.5 x price) and the farmhouse upgrade once fields
are full.

A 2x2 "Big field" was considered and skipped: a field already is a 2x2 building holding one crop, and a bigger one
would need its own crop layout, harvest yield and plant-hint visuals for little gameplay gain.

Paths, fences and hedges don't count toward the decoration cap.

## Charm

Every placed decoration adds Charm. Every 40 Charm gives +1% crop/tree growth speed (max 20%) and +1% order
coins (max 25%). Villager count is 2 + Charm / 60 (max 8).

## Retention features

- Daily login calendar: 7 days, day 7 gives 5 gems and a rare crate. Missing a single day once a week does not
  reset the streak.
- 3 daily quests (all three give a common crate) and 5 weekly quests (each gives a rare crate, all five an epic
  crate).
- Mystery crates roll an upgrade chance (common to legendary) and contain coins, gems, items, decorations or
  crate-only cosmetics.
- Collection Book pages pay once when every entry on the page is found (`rewards.json` collection.pages):
  Crops, Fruit, Animal goods and Animals give 3 gems and a rare crate; Goods and Styles give 8 gems and an epic
  crate.
- Seasonal events by calendar date (Harvest Festival, Winter Wonderland, Spring Blossom, Summer Fair): harvesting
  drops event tokens (12%) that buy limited decorations and cosmetics, plus 3 event quests.

## Economy simulation (Update 2)

`npm run simulate-economy` (`scripts/simulate-economy.mjs`) reads `src/data/*.json` and plays an engaged player
for 60 days: a 60 min first session, then 3 check-ins a day of 12 min (options: `--days`, `--sessions`,
`--session-min`, `--seed`, `--data <dir>` to compare another data set, `--brief`, `--json`). Timers run between
sessions like the real game. The player harvests and replants (picking crops that fit the time until the next
check-in), feeds animals, keeps every production building busy (orders and the truck first, then the best value
for the gap), fills orders and trucks, sells spare goods at the stall, and buys fields, buildings, animals,
upgrades, farmhouse levels, land (when out of room) and decorations from spare coins. Every tap costs a few
seconds of attention, so a 12 min check-in cannot do everything at once; the first session is calibrated so the
unchanged data lands on the first-hour targets above. Spare gems go on skipping building and upgrade timers.
Daily quests, 4 of 5 weekly quests, the login calendar, crates (rolled like the game) and achievements are
included. It prints the level table with unlocks and how long each took to afford, income and XP per hour by
source, spending by sink, value tables for crops, trees, animals and recipes, and flags.

Treat the output as the shape of the curve. The simulated player is keen but not perfect (it plans truck crates
and order chains a little worse than a focused human), and it decorates conservatively.

### Before (Update 1 data)

| | 2 check-ins/day | 3 check-ins/day | 5 check-ins/day |
| --- | --- | --- | --- |
| Level 10 | day 1.3 | day 0.9 | day 0.7 |
| Level 20 | day 5.3 | day 3.9 | day 2.7 |
| Level 30 | day 9.3 | day 7.3 | day 4.9 |
| Level 40 | day 15.3 | day 11.3 | day 7.9 |
| Level 50 | day 22.9 | day 16.9 | day 11.7 |
| Trucks filled completely | 2 of 117 | 1 of 177 | 5 of 178 |
| Coins banked at day 60 | 320k | 458k | 754k |

Problems found:
- **Levels flew by.** From level 12 on, most levels took a single check-in; max level in 17 days at 3 check-ins
  a day (12 days at 5), against the intended "level 30 in about 2 weeks, 50 as a long-term goal".
- **The truck was nearly impossible.** 4-6 crates of 11 cheap / 6 mid / 3 pricey goods each, with a 6 h window,
  meant check-in players almost never filled one (1 in 177). It still paid per crate, but the bonus and rare crate
  were out of reach.
- **The stall rivalled orders.** It took any amount at up to 1.6x value within 4 minutes, close to the 1.8x of
  orders, so dumping everything at the stall was nearly as good as filling orders.
- **Late coins had little to buy.** At level 40+ income is 50-70k a day, while the top decorations cost 4-12k and
  farmhouse 8 cost 90k, so farmhouse levels were bought the moment they unlocked and coins piled up with only
  land left as a sink.
- **Fine as they were:** the first hour (level 2 at ~3 min, 5 at ~40 min, 7 at ~65 min of play in the sim),
  mid-game affordability (every production building and animal home bought within a day or two of unlocking),
  recipe values (all 1.4-1.6x their ingredients, no dead items, every recipe used), crop and tree values (longer
  ones pay more per check-in, shorter ones more per active minute), and gems (about 900 earned in 60 days, about
  600 spent on skipping timers).
- **Intentional:** Bread (3 wheat -> 28 coins, 3.1x) out-earns later bakery recipes per minute; it is the hook
  for the first Bakery and later recipes win per queue slot during check-ins.

### Changes

- XP to next level from level 9 on: `base(L) * (1 + 0.115 * (L - 8))` (levels 1-8 unchanged).
- Quest XP: daily `10 + 8 x level` (was `3 x level`), weekly `60 + 40 x level` (was `12 x level`).
- Truck: 3-5 crates (was 3-6), crate sizes x1.0 (was x1.6), 2.0x value per crate (was 1.8x), window 16 h
  (was 6 h).
- Stall: up to 1.35x value (was 1.6x), default 1.1x (was 1.2x), sells in 30 s - 8 min (was 20 s - 4 min).
- Farmhouse 6/7/8: 40k / 85k / 150k (was 32k / 55k / 90k). Field caps and field prices are unchanged.
- Trophy decorations: Stone Ring 2.5k (was 1.2k), Grand Fountain 4k (1.5k), Garden Gazebo 6k (2.2k), Lookout
  Tower 12k (4k), Golden Windmill 20k (5k), Village Chapel 35k (8k), Grand Manor 50k (12k). Charm unchanged.

### After

| | 2 check-ins/day | 3 check-ins/day | 5 check-ins/day |
| --- | --- | --- | --- |
| Level 10 | day 1.3 | day 0.9 | day 0.7 |
| Level 20 | day 6.9 | day 5.9 | day 3.9 |
| Level 30 | day 16.9 | day 13.9 | day 9.5 |
| Level 40 | day 36.9 | day 29.3 | day 20.9 |
| Level 50 | level 47 at day 60 | day 54.9 | day 39.9 |
| Trucks filled completely | 9 of 60 | 18 of 68 | 26 of 76 |
| Coins banked at day 60 | 127k | 252k | 462k (saving for the next 819k expansion) |

At 3 check-ins a day: income is about 400 coins/h of real time at levels 6-15, 650 at 16-20, 1.4k at 21-30 and
2.1-2.5k at 36-50; orders are the biggest earner and XP source, the stall roughly matches orders in coins only
because it absorbs everything orders do not ask for (at a lower price per item). Levels 41-50 take 2-3 days each.
About two thirds of truck crates get filled and a full truck about once every 3-4 trucks. The first hour is
identical (level 7 at ~65 min of simulated play).

## Friends and gifts (`economy.json` > `social`)

Gifting is meant to be cozy, not a way to farm coins between accounts. Items and coins leave the
sender's save first (escrow) and are refunded if the send fails.

| Setting | Value | Why |
|---|---|---|
| Gifts per day | 5 | mailbox gifts and gift codes share this count |
| Coins per gift / per day | 500 / 1,000 | small help, never a whole building |
| Items per gift | 20 units, up to 4 kinds | fits one tidy gift card |
| Message | 60 characters | a short note |
| Friends | 30 | keeps the list readable on a phone |
| Mailbox poll | every 25 s while visible | plus on panel open and on return; never on the frame loop |

Received gifts are clamped to the same per-gift caps and to known items. Gift codes can be opened
once per farm (the save remembers claimed nonces) and never by the farm that made them. In practice
mode a demo neighbour sends at most one small thank-you gift a day (`botGift`).

## Fishing (`fish.json`)

Fishing is a calm side activity at the dock, not a second economy: a few casts a day for fun, a collection to
fill, and a steady trickle of common fish for orders and the Fish Shack.

**Unlock.** Fishing opens at level 7 (announced on the level-up card as "Fishing at the dock", together with the
Worm Bait recipe at the Feed Mill). The Fish Shack follows at level 8, with Fish Pie at 9 and Seafood Curry at 11.

**Casts and bait.** Every day brings 5 free casts (they come back at local midnight). After that each cast uses one
Worm Bait. Bait is made at the Feed Mill (1 wheat + 1 corn -> 4 bait in 1 min, about 2.25 coins a cast) or bought
at the dock, 5 for 25 coins. Bait sells for 3 at the barn, so it cannot be flipped. Why this shape:

- Free casts mean nobody is ever locked out, and they are a light reason to drop by every day (the Fish button
  shows a dot while free casts are left).
- Bait is cheap enough that a player who enjoys fishing is never nagged, but it is not free: a common fish is worth
  8-14 coins and about 3 XP, so spamming casts with bought bait earns only a few coins per cast (roughly the same as
  replanting wheat). Fishing never beats farming, orders or production for money.
- Reeling in early (leaving before anything bites) gives the cast back. A missed bite is not the end of a cast:
  the fish nibbles again up to 3 times. Losing a fish costs only that cast.

**The mini-game.** Tap to cast, wait 2-6 s (a couple of small nibbles tease you; tapping too early does nothing
bad), tap within the bite window (1.6 s for easy fish down to 0.95 s for legendary and mythic ones), then reel: hold to slide the
green zone right, let go to drift left, and keep the fish inside it. The catch meter starts at 30%, fills 32% a
second inside the zone and drains 15% a second outside, so an easy fish takes about 2-3 s and a lively one 4-8 s.
The zone is 42% of the bar for difficulty 1 and 22% for difficulty 5. After a lost fish the next reel gets a slightly
bigger zone (+8%, up to twice) until you land one. Junk needs no reeling.

**What bites.** First a rarity tier is rolled (common 61%, uncommon 26%, rare 9%, legendary 3%, mythic 1%, only
tiers with something biting right now count), then a species in it. 12% of casts bring up junk instead (old boot, seaweed, or a
message in a bottle worth `20 + 4 x level` coins with a 25% chance of a gem). Time of day follows the 24 min
day/night clock: morning is the dawn glow (phase 0.88-0.12), day until 0.6, dusk 0.6-0.72, night 0.72-0.88.

| Fish | Rarity | Level | When | Difficulty | Size (cm) | Sells | XP |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sardine | common | 7 | any time | 1 | 10-22 | 8 | 3 |
| Shrimp | common | 7 | any time | 1 | 4-10 | 9 | 3 |
| Crab | common | 7 | any time | 2 | 8-20 | 14 | 4 |
| Mackerel | common | 8 | morning, day | 2 | 20-40 | 20 | 5 |
| Clownfish | uncommon | 9 | day | 2 | 6-11 | 26 | 6 |
| Pufferfish | uncommon | 10 | dusk, night | 3 | 15-35 | 34 | 7 |
| Salmon | uncommon | 11 | morning, dusk | 3 | 45-85 | 42 | 8 |
| Squid | uncommon | 12 | night | 3 | 25-60 | 40 | 8 |
| Moon Jelly | rare | 13 | night | 2 | 10-40 | 55 | 10 |
| Octopus | rare | 15 | dusk, night | 4 | 40-120 | 70 | 12 |
| Lobster | rare | 17 | morning, night | 4 | 25-55 | 85 | 14 |
| Golden Sunfish | legendary | 20 | day | 5 | 120-300 | 240 | 35 |
| Reef Shark | legendary | 24 | night | 5 | 150-320 | 300 | 45 |
| Hermit Crab | uncommon | 13 | day, dusk | 2 | 3-12 | 32 | 7 |
| Sea Snail | common | 14 | morning, day | 1 | 2-6 | 12 | 4 |
| Rainbow Trout | uncommon | 14 | morning, day | 3 | 30-70 | 44 | 8 |
| Pearl Oyster | uncommon | 16 | morning, night | 2 | 7-16 | 46 | 8 |
| Sunset Snapper | uncommon | 18 | dusk | 3 | 30-80 | 50 | 9 |
| Bluegill | common | 19 | dusk, night | 2 | 12-28 | 18 | 5 |
| Sea Turtle | rare | 21 | morning, day | 3 | 50-120 | 95 | 15 |
| Lantern Fish | rare | 22 | night | 3 | 5-15 | 100 | 15 |
| Coral Grouper | rare | 26 | day | 4 | 40-110 | 115 | 17 |
| Moonlight Koi | rare | 28 | dusk, night | 4 | 40-90 | 125 | 18 |
| Ghost Ray | rare | 30 | night | 4 | 80-220 | 140 | 20 |
| Ancient Coelacanth | legendary | 32 | morning, night | 5 | 100-200 | 360 | 55 |
| Crown Jewel Betta | legendary | 36 | day, dusk | 5 | 5-9 | 400 | 60 |
| Kraken | mythic | 40 | night | 5 | 400-1200 | 900 | 140 |
| Leafy Sea Dragon | legendary | 42 | morning, dusk | 5 | 20-45 | 450 | 70 |
| Celestial Koi | mythic | 46 | morning | 5 | 60-120 | 1000 | 160 |

Sizes lean small (`min + range x r^1.6`), so a big one is a treat. A new size record gives +50% XP for that catch.
The legendary fish need the right time of day and about 30 casts on average to hook, then a hard reel: a goal for
dedicated players, not a requirement for anything except the last Fish page entries and the Legend of the Deep award.

**More species (29 in all).** The second wave starts at level 13, so the first week of fishing is exactly as before
(the common tier only grows at 14 and 19, and the early any-time fish keep their odds). Every time of day gets
something new, and the rare end is much deeper: 8 rare, 5 legendary and 2 mythic fish. Prices follow the tiers
(common 8-20, uncommon 26-50, rare 55-140, legendary 240-450, mythic 900-1000) and XP follows price, so a rare fish
is worth about 7-10 ordinary casts and a mythic one about 70-100. More species per tier means each one is a bit
rarer later on: at level 40 each night legendary is roughly 1 in 75 night casts.

**Mythic, the tier above legendary.** Mythic fish only start to bite once the player has landed any legendary fish
(`mythicNeedsLegendary`; a "Something mythic stirs in the deep..." toast announces it, and the Book shows "after a
legendary catch" until then). The Kraken bites only at night from level 40 and the Celestial Koi only in the
morning from level 46, each about 1 in 100+ casts at the right time, then the hardest reel. They have their own
pink-purple colour and rainbow label, a twinkling, glowing reveal card with rainbow confetti, a second burst and a
little camera shake. They are never needed for anything except the Fish page, the gold Fish Collector tier and the
Myth of the Deep award.

**Uses.** Fish sell at the barn, the stall and the market like any item. Orders and the truck only ask for the
common, any-time fish (sardine, shrimp, crab) and only after the player has caught that kind once; truck crates
of raw fish are half the usual size because every fish is its own cast. The first three Fish Shack recipes use only
those three, so they are always makeable. Two later ones turn a time-of-day catch into a better price; they need a
fish that orders never ask for, so they are a sell-only bonus for anglers (the simulation flags them as never asked
for, which is intended):

| Recipe | Level | In | Time | Sells | Value |
| --- | --- | --- | --- | --- | --- |
| Fish Cake | 8 | 3 sardine, 2 wheat (30) | 5 min | 44 | 1.47x |
| Fish Pie | 9 | 2 sardine, 2 carrot, 1 bread (62) | 15 min | 90 | 1.45x |
| Seafood Curry | 11 | 2 shrimp, 1 crab, 2 tomato (74) | 25 min | 108 | 1.46x |
| Sushi Platter | 15 | 1 rainbow trout, 1 seaweed, 1 cabbage (95) | 20 min | 138 | 1.45x |
| Oyster Chowder | 17 | 2 pearl oyster, 1 onion, 1 milk (186) | 40 min | 260 | 1.40x |

**Collection and awards.** The Collection Book has a Fish page (29 fish, old boot and seaweed) showing the biggest
catch and count per kind, and for unknown ones when and from which level they bite. Rare, legendary and mythic
cards get a coloured frame even before they are caught, so there is something to chase. Filling it pays 8 gems
and an epic crate. Awards: Gone Fishing (catch 10 / 100 / 500 fish), Fish Collector (5 / 15 / 29 kinds, gold =
every species), Rare Finds (5 / 25 / 100 rare fish, counted from the catch log so older catches count), Legend of
the Deep (1 / 3 / 10 legendary fish), Myth of the Deep (1 / 3 / 8 mythic fish) and a hidden one for junk. Daily quest: "Catch {n} fish"
(n = 2-3, scaled by level like other quests, from level 7).

**Simulation.** `simulate-economy.mjs` models fishing lightly (free casts every day, bait when orders or the Fish
Shack want fish, 20 s of attention per cast, success by difficulty). Fishing adds about 0-1 XP per real hour and the
level curve is unchanged within the simulation's noise; the simulated player buys the Fish Shack within two days of level 8.

## Star quality (1.8, `economy.json` > `quality`)

Every crop, fruit, animal product, fish and workshop good rolls its own quality when it is made (per unit, so a
field of 3 can give 2 normal + 1 gold). Feed, bait, fertiliser and event tokens never roll. Rewards, gifts,
crates, market and merchant purchases are always normal. Items finished while the game was closed roll when they
are collected, exactly like items collected in play.

| | Chance | Barn price | Friendship from a gift |
| --- | --- | --- | --- |
| Normal | 85% | 1x | 1x |
| Silver | 12% | 1.25x | 1.25x |
| Gold | 3% | 1.5x | 1.5x |
| Fertilised field | silver 22%, gold 8% | | |

Boosts add to the base chances through `qualityBoosts` (gold is capped at 25% and silver + gold at 60%).

**Why it does not break the economy.** An average rolled item is worth `1 + 0.12 x 0.25 + 0.03 x 0.5 = 1.045x`
at the barn. Only the barn pays for stars: orders, the truck, the stall and the market pay their usual price and
take normal items first. Since most income comes from orders and the truck, stars add about 2% to coin income;
their real job is to make good gifts for villagers.

**Star ingredients.** A workshop job made entirely from silver (or gold) ingredients comes out silver (or gold).
Ingredients and goods both gain the same 1.25x / 1.5x, so the 1.4-1.5x value of a recipe is unchanged and there is
nothing to flip; it only turns stars into bigger, better gifts. Jobs made from normal ingredients roll their own
small chance like any other source.

**Fertiliser.** Feed Mill, level 8: 2 wheat + 1 corn (12 coins of crops) -> 2 bags in 2 min, so about 6 coins a
bag. A fertilised field adds +10% silver and +5% gold, worth about +5% of that harvest at the barn: break-even on
the dearer crops, a small loss on wheat. It is a choice for players who want gold gifts, not a money maker.

## Daily rhythm (1.8, `src/systems/Daily18.ts`, `src/systems/Weather.ts`)

- **Villager of the day:** one villager a day, a fresh shuffle every six days so everyone visits once per cycle
  (never the same villager two days running; a villager visits on their birthday). They ask for 2-6 of something
  the farm can make now (half the time a thing they like): `2 + level / 8 (+0-1)`, x0.7 for goods worth over 60,
  x0.45 over 150. They pay like an order on the board: 1.8 x value in coins and the order XP, plus 30 friendship.
  One request a day, so it adds roughly one extra order's worth of income and never competes with the board.
- **Daily finds:** three a day on free tiles you can walk to: a seashell (1), wild petals (2), acorns (2). They are
  gift items with no barn value, so they feed friendship, not coins. 40% of days one of them is a villager's lost
  thing instead: tapping it gives 20 friendship.
- **Weather:** per local day from the farm seed: sunny 65%, rain 20%, mist 15%, never three rainy days in a row.
  Rain: crops planted that day grow 5% faster (on top of Charm), and rare, legendary and mythic fish are 1.25x as
  likely to bite. Mist is only a look. Both are small on purpose: nice to notice, never a reason to wait for rain.

## Skills (1.8.5, `src/data/skills.json`, `src/systems/Skills.ts`, `src/systems/SkillEffects.ts`)

Five skills (Crafting opens with the Workshop) level 1-10 from the game's own stat counters. Level 1 is the plain game (every level above it adds its
bonus), so a fresh farm plays exactly as before. XP: Farming 1 per crop or fruit harvested, Animals 1 per product,
Fishing 8 per fish landed, Cooking 1 per good made. Total XP to reach level 2, 3 ... 10: 50, 150, 400, 1,000,
2,000, 3,500, 6,000, 10,000, 16,000 (`xpLevels`). Rough pace: level 5 after about 1,000 harvests (two to three
weeks of regular play at level 10-15), level 10 after about 16,000 (many months). Farms from before 1.8.5 start at
up to level 5 from their lifetime stats (`headStartMaxLevel`).

What the money-relevant numbers do at the top (all in `values`, tunable without code):

- **Gold crops:** +1% per level above 1 (+9% at level 10), Master Farmer +5%: gold 3% -> 17% (fertiliser adds 5%;
  hard cap 25%). Only the barn pays star prices, so a crop is worth about +6% more at the barn at 17% gold
  (E = 1 + 0.25 silver + 0.5 gold). Orders, truck, stall and market still take normal items first.
- **Speed:** Animals -1% time per level above 1 (-9% at 10), Cooking the same, Quick Grower -10% crop time.
  Output per hour rises by the inverse (about +10% and +11%), but animals need feed and workshops need
  ingredients, so it is throughput, not free coins.
- **Extra capacity:** Breeder +1 space per animal home (a home holds 3 at level 1, so up to +33% output there,
  paid for with animal purchases that get dearer with each animal owned). Head Chef +1 workshop queue place (only
  helps a player who keeps the queue full). Big Harvest +10% crops. Batch Cook +15% goods.
- **Barn prices:** Fishmonger +25% for fish and Chef +10% for goods, at the barn only. Fish are cheap relative to
  other goods, so Fishmonger is a flavour pick, not a money maker.
- **Quality perks:** Prize Animals +8% silver and +4% gold on animal products, Gourmet +5% gold on goods.

Everything is a choice between two perks, so two farms at the same level play differently. If the dashboard shows
income or play time jumping when players reach level 5 or 10, lower the numbers in `values`; no code change needed.

## Village Restoration (1.8.5, `src/data/restoration.json`, `src/systems/Restoration.ts`)

The old village square has six rooms (Pantry, Barn Room, Pier, Kitchen, Workshop, Treasury). Each room has 3-4 bundles
(shopping lists of items or coins). Partly filled bundles keep what was given and every bundle filled adds 30
friendship with the room's villager. Rooms open at a level (Pantry 10, Barn Room 15, Pier 18, Kitchen 22, Workshop 28, Treasury 32). Bundle contents ask for what a farm at the opening level already makes in bulk, so giving uses
up spare stock rather than competing with orders or the truck (normal items go first):

- **Pantry** (4 bundles, 12-30 of cheap crops each, about 360 crops in all). Reward: Rosa's rare seeds, 3 a day at
  60 coins. A rare seed adds +35% silver and +12% gold to that field (same idea as fertiliser, stronger). Worth
  about +20% of that harvest at the barn, which on one field of a 40-50 coin crop is a few coins, so 60 coins is a
  small net cost: it is for players who want gold gifts and bundles, not a money maker.
- **Barn Room** (4 bundles: 24 eggs, 16 milk, 12 wool, 6 truffles + 6 goat milk + 10 eggs). Reward: all animals make
  products 10% sooner (multiplies with the Animals skill; at the top about -19% time, +23% output per animal).
- **Treasury** (3 bundles: 10,000 + 25,000 + 50,000 coins, a coin sink for rich level-32 farms). Reward: trucks
  pay 15% more (crate coins and the bonus), and Saturdays are village market day: orders pay +10% coins and the
  roadside stall +10%. About one day in seven, so roughly +1.5% on those two income streams over a week.

- **Pier** (nine fish species only the Pier gives, fish.json `spot: "pier"`; it uses the same free daily casts as the
  dock). Fish sell for the same kind of money as the dock's, so it adds variety and collection, not income.
- **Kitchen** (Village Kitchen workshop, 8 recipes in recipes.json, building `village_kitchen`, only for sale after
  the room is rebuilt). Recipes are priced like the other level 20-30 goods.
- **Workshop** (Bram's forge, crafting.json): a sprinkler (600 coins + cotton fabric and sugar) makes crops sown within
  3 tiles grow 12% faster (they do not stack); an auto-feeder (2,500 coins + cotton fabric and cheese) feeds 2 hungry
  animals every 20 seconds in homes within 6 tiles, paid for with feed from the barn (so it saves taps, not feed);
  quality fertiliser (2 plain fertiliser + 1 syrup makes 2) gives +25% silver and +12% gold, used before plain
  fertiliser. The Crafting skill (XP 80 per craft, so level 2 after one craft) gives +3% per level above 1 chance
  of an extra craft. Perks: Thrifty Smith, Sturdy Tools, Golden Touch, Tinkerer.
- **Festival:** when all six rooms are done, once: 20,000 coins and 100 gems in Hazel's letter, and a Village Hero
  statue (decor, 25 charm) in storage. The square gets the statue and bunting for good.

Everything here is data: change the numbers in `restoration.json` (bundles, `rewards`, `market`) and the validator
checks them. The first thing to watch on the dashboard (1.8.5 Square page) is how many players finish the first
bundle of each room and how long the Treasury takes.

## Beehive House (1.8.6, building `beehive_house`, level 20, 4,000 coins)

A production workshop (2x2, counts against the same production cap as the others). Four recipes, all cheap farm
ingredients: honey (2 apples, 20 min, sells 150), honeycomb (2 honey, 30 min, 340), beeswax candle (1 honey + 2
cotton, 40 min, 400) and honey butter (1 honey + 1 butter, 25 min, 330). Per hour of the workshop the best is about
600 coins of added value, in line with the Loom, so it adds variety and a use for apples, not a new income tier.

## Ducks (1.8.6, animal `duck`, house `duck_house`, level 24)

Duck House 2,600 coins (4x4, like the Goat Pen), duck 1,500 coins (+25% per duck owned), 3 per house at level 1.
Feed: duck feed from the Feed Mill (3 wheat + 2 carrot make 3, level 24). A duck lays a duck egg (sells 150) 90
minutes after feeding, so about 100 coins an hour per duck minus 10 for feed: between the goat and the pig, as it
should be at level 24. The model is the chick recoloured white (`variant: "duck"` in FarmView).

## Juice Press and Blueberries (1.8.6)

Juice Press (`juice_press`, level 26, 6,500 coins, 2x2): apple juice (3 apples, 25 min, 160), berry juice (4
strawberries, 30 min, 230), grape juice (3 grapes, 35 min, 300, level 27), orange juice (3 oranges, 40 min, 400,
level 28) and blueberry juice (3 blueberries, 45 min, 340, level 30). Juice sells for roughly 1.8x its fruit, below
the jams made from the same fruit, so it is a faster, cheaper alternative rather than a replacement.

Blueberry (crop, level 30, seed 21, 4.5 hours, 2 per harvest, sells 112, xp 28) sits between watermelon and radish
on the same curve (about 25 coins/hour per field like its neighbours). Blueberry muffin (Bakery, level 30) sells 330.

## Pottery Kiln (1.8.6, building `pottery_kiln`, level 34, 9,000 coins)

Four recipes: potter's clay (3 beets make 2, 15 min), clay pot (2 clay, 40 min, sells 260), glazed tile (1 clay +
1 sugar, 45 min, 300, level 35) and blue vase (3 clay + 2 blueberries, 90 min, 560, level 36). Clay sells for 70 so
making it is never worth more than selling beets. The Glazed Tiles path (level 34, 60 coins) is plain decor.

## Horses and the Stable (1.8.6, animal `horse`, house `stable`, level 36)

Stable 4,200 coins (4x4), horse 2,400 coins (+25% per horse owned), 3 per stable at level 1. Horse feed (4 wheat + 2
carrots + 1 apple make 3, Feed Mill, level 36). A horse makes one fertiliser every 2 hours (the same item as the
Feed Mill recipe, so it saves a fertiliser run and feeds the silver/gold seed tray toggle). The real prize is the
truck: each horse in a built stable cuts the wait before the next delivery truck by 10%, up to three horses, so the
1,800 second cooldown drops to 1,260. The truck still stays 16 hours, so this is more crates per week, about +1%
income on a farm that fills every truck. The horse model is built from boxes in `scripts/make-horse.mjs` (the
Kenney pack has no horse).

## Peas and Lavender (1.8.6, crops, level 38)

Pea (seed 26, 6.5 hours, 2 per harvest, sells 142, xp 36) and lavender (seed 30, 8 hours, sells 165, xp 40) follow
the cauliflower curve. Uses: pea soup (Village Kitchen, 4 peas + onion + cream, sells 520), lavender honey (Beehive
House, honey + 2 lavender, 420) and lavender candle (Beehive House, beeswax candle + 3 lavender, 640). They are
the use for the new workshops late in the game, not a separate income tier.

## Mastery plaques (1.8.6, `src/data/mastery.json`, `src/systems/Mastery.ts`)

From level 40, each of the 21 crops (10 gold of that crop) and each of the 10 workshops that make starred goods (6
gold goods from any of its recipes) is a challenge: 31 in all. A challenge pays 1,500 coins, 3 gems and a Mastery
Plaque decoration (8 charm). Gold is 3% base, up to 17% with Farming level 10, the Master Farmer perk and fertiliser,
so a crop takes roughly 50-100 harvested crops and a workshop 40-100 goods: weeks of steady play for the first few,
months for the whole set. All 31 pay about 46,000 coins and 93 gems in total, a small bonus next to level 40+ income.
Progress counts the stats `gold_<item>` kept by Quality.addRolled, so it starts counting when 1.8.6 is installed.

## Marlow Pike's fish stall (1.8.7, `src/data/fishstall.json`, `src/systems/FishStall.ts`)

A fish stall on the north beach by the dock, open once the player can fish (level 7). The player BUYS fish: common x80,
uncommon x65 and rare x50 the barn price, so a sardine (barn 8) costs 640 and a rainbow trout (barn 44) 2,860. Buying is meant to hurt: it is the price of skipping the fishing. He is a night trader, 7 pm to 7 am local time (`hours`); by day he is away and the stall is closed. The stock refreshes each time he opens. Prices are
always well above barn value, so fish cannot be bought and sold for profit. Stock is small: every common species the player can reach (2-5 each), four uncommon species (2-3 each), and a rare one on
50% of nights (1). Legendary and mythic fish are never sold. Pier fish appear once the Pier is rebuilt. The stock is
seeded by the farm seed and the trading night; only that night's purchases are saved. It is a convenience for orders and
bundles (and the Collection Book), not an income source: fishing the same fish is always cheaper in coins and pays XP.

## 1.9 Extra fish, Festivals, Woods, Museum, Expeditions, Help Wanted

- **Extra fish**: 16 extra kinds (marked `extra` in `fish.json`) share a separate 8% chance per non-junk cast. They sell 11-60 coins, about the same as the all-year fish of their tier. Fish Collector medal top tier is 45 kinds.
- **Festivals** (every 7th day, the four in turn): best of any tries counts, prize paid once. 1 star 300 coins; 2 stars 600 coins + 3 gems + decoration; 3 stars 1000 coins + 6 gems + decoration + a small extra (rare seeds / bait / 3 gems). Four per year, so about 4k coins and 40 gems a year at most.
- **Woods** (level 14): up to 14 forage spots a day (all twelve plants, all year) (75% active), sell 9-28 coins each (gold star x1.5); 4 digs a day (6 with Deep Digger). Dig table: 58% mineral (30-120), 20% fossil (70-140), 12% artifact (110-500), 10% clay. About 300-600 coins of finds a day if every spot is used.
- **Museum**: 44 pieces over six shelves. Shelf rewards total 12,800 coins and 43 gems, Curator adds 6,000 coins, 25 gems and a Grand Fountain. Pieces are given away for good, so the cost is their sell value (about 6,000 coins in all).
- **Expeditions** (2 places): 2 h = 3 finds, 6 h = 6, 12 h = 10, weighted to minerals. Roughly the value of the player digging themselves, but no tapping. Friends return sooner (4 hearts x0.85, 8 hearts x0.75).
- **Help Wanted**: 3 requests a day paying 1.6x the barn price of what is asked (3.2x for a gold-star request) plus 12-20 friendship and sometimes a gem. Items must be obtainable now, so it never asks for out-of-season crops.
- **Heart events** 2/6/10: thank-you 100 / 300+1 gem / 600+3 gems, once each per villager (one-off about 6,000 coins and 24 gems across all six).
- **Pet find**: once a day, 45% 60-150 coins, 10% 1 gem, the rest a small item (acorns, shells, petals, bait, a rare seed).

### Fish ratios (1.9 fix)
- Seasonal species were first mixed into the normal tiers, which thinned every everyday common fish by 17-25%. They now have their own 8% chance per non-junk cast (`seasonBonus` in `fish.json`), so sardine, shrimp, crab, mackerel and the other year-round commons are back within about 5% of their 1.8 rates (about 11% of casts each by day at level 20, 13% at night).
- Orders now ask for half as many fish as other goods of the same price, and Help Wanted asks for 1-2 of a fish, because fish cost casts and bait to get.

### Lucky Bait and order-aware fishing (1.9.1)
- A fish needed by an active order or an unfilled Help Wanted request is weighted 1.5x in the catch roll (tier chances scale with it too). Level 20 by day: mackerel goes from about 11% to about 16% of casts while an order wants it.
- Lucky Bait (3 for 120 coins at the fishing screen, `luckyBait` in `fish.json`): weight 4x for needed fish, about 31% for the same mackerel. It is used up only when a needed fish is biting at that moment, and handed back if the line is reeled in before a bite. Sells for 8 coins.

### Seasons removed (1.9.2)
The seasons (seasonal crops, in-season bonus, season look, Glass Frame, season pages) were removed. Crops grow all year at their normal times and quality chances. Anyone who had bought a Glass Frame is refunded 900 coins each when their save loads. The token events are back on their real-date windows.

## 1.10 More to Grow, Bake and Love
- **Crops (levels 41/43/45/47):** sunflower 190, potato 215, pineapple 255, leek 295 coins; grow 9 to 14 hours. Dish items sell about 2.3x their ingredients.
- **Rabbit** (Rabbit Hutch level 21, `rabbit_hutch`, feed `rabbit_feed` from the Feed Mill): angora 130 coins every 70 minutes.
- **Animal friendship** (`src/systems/Animals.ts`): name an animal, pat it once a day; each heart raises the chance of a better quality product (via `qualityBoosts`). Max 5 hearts.
- **Boat Visitors** (`boatvisits.json`, `src/systems/BoatVisit.ts`): level 10, two days a week (from the farm seed), 10 am to 5 pm local. Three goods from the day's theme that the farm can make now; pays 1.9x barn value plus 2 gems, once per visit day. Barn star prices are not used, so it cannot beat the barn by more than the 1.9x bonus on a few items a day.
- **Haze (fog)** is pushed far out (`Environment.ts`): near 100 / far 230 by day, mist 61 / 142 at worst, so the farm stays clear at max zoom.
- **Farm look** (`settings.farmLook`): cosmetic tint and falling particles only, no gameplay effect.

## 1.11 The Master Farm (levels 51-60)
- **Level cap 60** (`levels.json`): xpToNext keeps the ~6% growth (35,700 at 50 up to 60,310 at 59; about 450,000 XP for all ten). Coins 1,275-1,600 per level, 1 gem each, 5 at 55 and 10 at 60. Players already at 50 simply start earning XP towards 51.
- **Crops:** mushroom (L51, sells 340, 16h) and giant pumpkin (L54, sells 400, 18h).
- **Dishes (7):** muffin 520, waffle 610, mushroom soup 1,350, garden wrap 1,500, watermelon juice 1,000, pumpkin spice cake 1,700, Celebration Cake 2,100 (the simulator flagged 2,400 as 2x its bakery peers, so it was cut and made slower).
- **Farmhouse 9 and 10** (player levels 52 and 58, 250k and 400k coins): plots 80/90, trees 34/40, animal homes 3/4, workshops 3/4 (a fourth Bakery at level 10), decor 320/400.
- **Decor:** Old Oak, Camper's Tent, Palm Tree, Little Grove, Ancient Elm and the Grand Master Statue (level 60, 250k).

## 1.12 Leaderboard trophies (`src/systems/Ranks.ts`, `src/world/models/ranks.ts`)
- 16 decorations (`rank_<board>_<place>`, group `trophies`, never sold): for each of the four boards a big gold 1, silver 2, bronze 3 and green Top 10 (ranks 4-10) on a 3x3 podium with a flag in the board's colour. Charm 150/120/100/60 each.
- Earned once and kept for good, into storage. A board needs at least 6 farmers (`MIN_PLAYERS`) so early on a small server nobody is handed first place. Practice mode never counts.
- Checked whenever the Leaders panel loads a board and about once an hour while playing (`ranks.start()`). The rank comes from the real board data but the save is on the player's device, like everything else here, so a modified client could fake one: it is cosmetic only.

## 1.13 Endless levels (`levels.json` `endless`, `src/systems/Endless.ts`, `src/world/models/ranks.ts`)
- **No top level.** `maxLevel` is 999 (the server's limit). Levels 1-60 are the table; every level after that is worked out in `src/data/index.ts`: XP to next = 62,810 at level 60, plus 2,500 per level (about 160,000 at level 100); coins 1,600 + 20 per level up to 5,000; 1 gem a level, 3 every 5th and 8 every 10th.
- **Level Markers:** levels 61 to 300 each hand out a `marker_<level>` decoration into storage (a big number on a stone base, 2x2, Charm 40 + level up to 400). The number and flag colour change every ten levels. A save that is already past some levels is caught up when the game opens (`state.endless.marker`).
- **Authored content** is added in batches: `authoredMax` (now 80) is how far real unlocks go and `validate-data` insists every level up to it unlocks something. 1.13 adds 12 dishes (levels 61-78, margins 1,000 to 1,600 coins an hour like the best earlier dishes), 6 decor pieces and Farmhouse 11 and 12 (player levels 70 and 80, 600k and 900k coins: plots 100/110, trees 44/48, animal homes 4/5, workshops 4/5, decor 480/560).
- **Adding the next batch:** write the crops, dishes, decor and Farmhouse levels at the new levels, raise `authoredMax`, raise `markerTo` if needed, run `npm run validate-data`. Nothing else needs to change.

## 1.14 The Grand Estate (levels 81-100, Master Board)
- **Crops:** avocado L81 (sells 520), celery L84 (560), lettuce L87 (600), golden pumpkin L90 (700); 20 to 26 hours to grow, 2 yield. Real produce models (Food Kit avocado and celery, KayKit lettuce and yellow pumpkin).
- **Dishes (12, levels 82-96):** priced so margin per hour sits at 1,250 to 1,500 coins and creeps up with level, like the earlier late dishes. Ingredient cost is cheap for several (corn dog, rice ball), so they are fast-and-modest rather than rich.
- **Decor sets (about 90 pieces):** Produce Market (82-88), Harvest Night (89-92), Minigolf (93-95), Porch (95-97), Farm Railway (96), Winter (97), Market and Farm Kitchen (98), Little Village houses and dioramas (99-100), Centurion Banner (100). Costs 6,000 to 150,000, Charm 30 to 300.
- **Farmhouse 13 and 14** (player levels 90 and 100, 1.4M and 2.2M coins): plots 120/130, trees 52/56, animal homes 5/6, workshops 5/6, decor 640/720.
- **Master Challenges** (`master.json`, `Master.ts`, from level 50): 3 of 10 challenges a week (same UTC week as the weekly board), counted from the game's own stats since Monday. Targets are the base number plus 1.5% per level past 50. Each claim pays 600 + 40 per level coins and 3 gems. All three: +10 gems and an epic crate, and a week on the streak. Missing a week resets the streak. Streak prizes at 4, 12, 26 and 52 weeks are big-number decorations.
- **Gem Boutique:** 20 gem-only decorations at 20 to 120 gems, six on offer each week (a seeded order, each buyable once). The aim is a gem sink for players who finished everything else.
- **Boat Visitors** each bring a boat of their own (`boat` in `boatvisits.json`: model, scale and where the visitor stands).

## 1.15 Upkeep (`upkeep.json`, `src/systems/Upkeep.ts`)
- **Counted per day.** One full step per local day the game is opened, from player level 12. Days missed while away (or offline) still count at 25% for up to 14 days: animals can fall unwell and buildings wear, but being away alone can never make an animal wander off (sick days are held short of that) and a wanderer always keeps its return window until at least the next played day after you come back. The dashboard setting "Upkeep strength" (0 off, 1 normal, 2 double; `game_config` key `upkeep`) scales chances and wear; run the schema again to allow it.
- **Animals:** 2% a day each to fall unwell (+2% once 60 days old), cut 12% per heart (floor 40%) and multiplied up to x3 by a worn home. About one sick animal every 10 days on a farm of five. Sick animals stop producing (the timer pauses). Treat costs 20% of the animal's price (min 25). Untreated for 4 played days they wander off; bring them back for 60% of the price (min 60) within 6 played days or they are gone.
- **Buildings:** workshops and animal homes wear 1.6 points a day (about 25 days to weathered at 40, 44 to worn at 70, 62 to broken at 100). Weathered: jobs 10% slower, worn 25% slower, broken: no new jobs. Repair costs 30% of the building's cost (more per level) scaled by wear, min 40. Existing farms start with random wear (0-35) and random animal ages (0-45 days).
- **Vet's Cottage and Carpenter's Workshop** (level 10, 1,500 and 1,800 coins, one each, `bld/vet` and `bld/lumbermill_red` from KayKit Medieval Hexagon): treating animals and repairing buildings need the matching building to be built. Tapping either opens a list of everything that needs help (sick animals, wandered animals, worn buildings) with a button each, and a bubble shows when there is something to do. Costs are unchanged by owning them. They unlock at 10, two levels before upkeep starts at 12.

### Upkeep and recipe fixes (1.15.1)
- **Grace day after a break.** The first opened day after time away never makes an animal wander off: every unwell animal is held at no more than 2 sick days (two more opened days to treat it) and every wanderer keeps at least 2 days to be brought back. A day's chance of falling unwell is capped at 50% even after 14 days away. Before this, an animal that was 3 days unwell when the player left wandered off at the moment they came back.
- **Return window.** A wanderer now keeps the full `returnWithinDays` (6); it used to lose one on the day it left.
- **Dial 0 heals.** With the dashboard upkeep strength at 0, unwell animals are well again at once (their product timers carry on) and the game re-checks when the latest settings arrive. Wear does not build up on buildings still under construction.
- **Master "Pat your animals"** counts `animal_pats` (the daily Pat button on each animal), not `animal_pets` (tapping a home with nothing to do, which had no limit).
- **Recipes that lost money** (ingredients worth more than the dish) were repriced to about +25% over their inputs: Pea Soup 520 to 860, Lavender Candle 640 to 1120, Lavender Honey 420 to 600, Blueberry Muffin 330 to 440. Potter's Clay takes 2 beetroot instead of 3 (120 in, 140 out). The simulator's remaining "never asked for" flags for the fish dishes come from its player rarely fishing, not from the game.

## 1.17 The Long Road (late-game pace, `levels.json` `endless`)

- **Flat curve past 60.** `endless.xpPerLevel` is 0: every level past 60 costs 62,810 XP (it used to grow by 2,500 a level, so level 100 needed 162,810 and level 300 662,810).
- **Late-game XP** (`endless.lateXp`, from level 60, a share of the XP to the next level so it stays worth it): each Master claim 20%, finishing the Master week 30%, a boat visit wish list 20%, a festival prize 30% for 3 stars (10% per star).
- **Charm from trophies** (Level Markers, leaderboard trophies, streak plaques; `economy.json` `charm.trophyMax`) adds at most 500 in total. Level Markers alone gave about 4,800 charm by level 100.
- **Result** (`npm run simulate-economy -- --days 300`, engaged player, 3 check-ins a day; the simulator now runs to `authoredMax` + 20 and models the Master Board, boat visits and festivals):

| Reached on day | Level 60 | Level 70 | Level 80 | Level 90 | Level 100 | Level 120 |
| --- | --- | --- | --- | --- | --- | --- |
| Before (1.16) | 91 | 149 | 229 | not in 300 days (87 by day 300) | - | - |
| After (1.17) | 91 | 117 | 140 | 163 | 187 | 231 |

About 2.4 days of regular play per level past 60, matching the owner's 2-3 hours a week target. Farms already past 60 get Hazel's letter "The road ahead got shorter" once (`state.endless.road`) and any level they have now earned straight away.

## 1.18 Willowmere Manor (`manor.json`, `src/systems/Manor.ts`)

The village square's six rooms took most players a few weeks, much quicker than intended. Willowmere is the long project behind it: 8 wings, opened one after another (each needs the one before and a player level), 41 bundles. They mix huge bulk orders (2,000 wheat, 3,000 wheat, 600 apples), mid-sized workshop goods, a few rare woods finds and gold-star goods, and growing coin wages (30k to 1M). Wings are restoration rooms (`state.restoration`, ids `manor_<wing>`), so giving, partial progress, Ask a friend and saving work as in the square.

| Wing | Opens at | Bundles | Value (coins, star goods x2.5 silver / x5 gold) | At about 20k a day spare |
| --- | --- | --- | --- | --- |
| Clearing the Grounds | 30 | 5 | 95k | about 5 days |
| The Foundations | 35 | 5 | 223k | about 11 days |
| The Great Hall | 38 | 5 | 418k | about 3 weeks |
| The Kitchens | 42 | 5 | 421k | about 3 weeks |
| The Library | 48 | 5 | 516k | about 4 weeks |
| The Gardens and Glasshouse | 54 | 5 | 482k | about 3.5 weeks |
| The Stables and Carriage House | 60 | 5 | 733k | about 5 weeks |
| The Grand Ballroom | 66 | 6 | 1.78M | about 3 months |
| **Total** | | **41** | **4.66M** | **about 8 months** |

Woods items (forage, ores, fossils, artifacts) are asked for in small numbers, because the woods only give about 10 forage and 4 digs a day today; the 1.19 woods expansion adds more.

**Rewards (permanent, `manor.json` `effects`):** Grounds: every woods forage spot is full every day. Foundations: +2 digs a day. Great Hall: festival prize coins x1.25. Kitchens: every workshop x0.92 time. Library: expeditions x0.85 time. Gardens: crops and fruit trees x0.92 grow time. Stables: animals x0.92 time. Ballroom: orders pay x1.1 coins, plus the finale (250,000 coins, 300 gems, the Willowmere Manor decor for the farm and Hazel's letter, `state.restoration.manor`).

**Fixed with it:** coins paid part-way into a bundle (the Treasury's chests) were dropped by the save repair on every load; they are kept now.

## 1.19 The Deep Woods (`woods.json` `regions` and `trails`, `src/systems/Woods.ts`)

The woods grow from one glade to four places. Each region is an island round the glade, opened by restoring its trail (a restoration room, ids `trail_<region>`; bundles of rope, forage, lunches and coins).

| Region | Trail opens | Trail cost (about) | Every day once open |
| --- | --- | --- | --- |
| Mossy Hollow | level 20 | 15k coins + rope, 30 woods forage, a crew lunch | about 7 forage (moss, bluebells, puffballs, wild garlic, elderberries, rare morels) and 8 fireflies at night (7 pm to 5 am) |
| Crystal Creek | level 28 | 30k coins + ores, wool goods, a picnic | about 6 forage (watercress, river mint, cattails, water lilies, wild strawberries) and 6 pans (gold flake most often, then quartz, agate, copper, jade, river pearl, topaz, amethyst) |
| Whispering Pines | level 36 | 50k coins + iron, breakfast, blankets, berries | about 7 forage (pinecones, chestnuts, lingonberries, pine boletes, sloes) and 6 taps that hold 2 maple sap or pine resin each, full again 6 hours after they were emptied |

With all three open and three check-ins a day the woods give roughly 30 forage, 8 fireflies, 6 pans, 4 digs and up to about 36 sap or resin a day, against about 10 forage and 4 digs before. Panning makes the Manor's chandelier gems (quartz, topaz, amethyst) far easier to collect. Pans, sap and fireflies grow the Foraging skill (`skills.json`: pans_done 4, sap_collected 3, fireflies_caught 3 XP). The Manor's Grounds reward (every forage spot full) applies to the regions too.

## 1.20 Woodland Friends (`woods.json` `critters` and `wren`, `src/systems/Critters.ts`)

Six critter families, each with a feeding stump. A treat left on a stump waits until the family's hours (never lost), then the family visits once a day; a hello gives one gift. Every 3 visits is a heart, up to 5 (15 visits, so about two weeks of daily treats per family to be best friends). Each heart pays 150 coins x the new heart count (2,250 coins a family, 13,500 for all six). The family's rare gift (one each, for the Museum's new Woodland Gifts shelf: 2,400 coins and 8 gems) has a 4% chance per visit plus 5% per heart already earned, and always comes with the fifth heart.

| Family | Where | Hours | Treats | Rare gift |
| --- | --- | --- | --- | --- |
| Deer | the glade | 5 am to 11 am | apple, pear, carrot | Shed Antler |
| Wild rabbits | Mossy Hollow | 11 am to 5 pm | carrot, watercress, lettuce | Four-Leaf Clover |
| Hedgehogs | Mossy Hollow | 5 pm to 11 pm | elderberry, wild strawberry, blueberry | Banded Snail Shell |
| Foxes | Crystal Creek | 4 pm to 10 pm | sardine, anchovy, smelt, herring | Lost Silver Spoon |
| Red squirrels | Whispering Pines | 6 am to 12 pm | chestnut, hazelnut, pinecone | Golden Acorn |
| Tawny owls | Whispering Pines | 8 pm to 4 am | moss, fern frond, wool | Owl Feather |

The hours cover morning, afternoon, evening and night, so each of the three daily check-ins finds someone. Treats are cheap on purpose (most sell for 8-30 coins): the loop is about the visit, not a coin sink. Visits give Foraging XP (`critter_visits` 5).

**Wren the ranger** lives in a cabin in Whispering Pines (once its trail is restored). One field note a day: 3-5 of a forage item that grows somewhere open to the farm, for its sell price x 4 x the number + 60 coins (about 180-600 a day) and every fifth note a gem. Notes give Foraging XP (`field_notes` 8). Wren is a woods resident, not a seventh heart villager: no gifts, letters or keepsakes yet.

## 1.20 Care and Craft (`upkeep.json` `care`, `src/systems/Upkeep.ts`)

The Vet's Cottage and the Carpenter's Workshop now go to level 3.

| Step | Cost | Time | Player level |
| --- | --- | --- | --- |
| Level 2 | 6,000 | 30 min | 16 |
| Level 3 | 18,000 | 1 h | 24 |

- **Vet:** treatment 25% cheaper per level above the first (50% at level 3). Check-ups from level 2: every animal in one home cannot fall unwell for 3 days; 1 home a day at level 2, 2 at level 3.
- **Carpenter:** repairs 25% cheaper per level above the first. Fresh paint from level 2: a repaired building wears at x0.7 for 10 days (14 at level 3).
- **Free skill bonuses** (`skills.json` `bonus`, no choice, on top of the level 5 and 10 picks): Hardy Stock at Animals level 7 (sickness x0.6) and Sturdy Joints at Crafting level 7 (wear x0.75).
- **Care round** (Farmhouse screen): one button that treats every unwell animal, then repairs worn buildings worst first, while the coins last. The total is shown first.

A check-up lasts 3 days, so daily check-ups keep up to 3 homes (vet level 2) or 6 homes (level 3) well all the time; Hardy Stock cuts sickness in the rest by 40%. Wear is 1.6 a day on average: a building turns weathered (40) after about 25 days and worn (70) after about 44. With a level 3 carpenter's fresh paint and Sturdy Joints, a repaired building turns weathered after about 37 days and worn after about 62. That keeps upkeep a light chore, in line with the 2-3 hours a week target for late game.

## 1.20 Every item has a use (`validate-data` checks it)

Every item must now be wanted somewhere beyond the barn: a recipe or craft ingredient, a bundle, a Museum shelf, animal feed, a critter treat, a boat visitor's wish list or a villager's favourite (or be spent by the game itself: seeds, fertiliser, bait, event tokens). `npm run validate-data` fails for an item with no use, so new items cannot slip through.

**27 new recipes**, priced at each workshop's usual margin over the ingredients' barn price (Fish Shack and Bakery about x1.45, Jam Kitchen x1.48, Loom, Sugar Mill and Beehive x1.5, Pottery Kiln x1.6, Juice Press x1.8, Village Kitchen x1.85), each unlocked no earlier than its ingredients can be had:

| Workshop | New recipes (level) |
| --- | --- |
| Fish Shack | Winter Chowder (12), Flounder Fry (19), Crab Cakes (21), Blossom Sushi (21), Harvest Fish Pie (22), Sunny Fish Skewers (23), Rainbow Fish Tacos (23), Sunset Snapper Grill (24), Grilled Tuna Steak (24), Halibut Supper (24), Maple-Glazed Flounder (36) |
| Village Kitchen | Herb-Crusted Sea Bass (28), Coral Grouper Curry (30), Woodland Mushroom Pie (36) |
| Bakery | Wild Garlic Bread (20), Duck Egg Sponge (24) |
| Jam Kitchen | Pickled Herring (18), Hedgerow Jam (36) |
| Juice Press | Mint Lemonade (28) |
| Loom | Rush Basket (28) |
| Sugar Mill | Maple Syrup (36) |
| Beehive House | Pine Forest Candle (36) |
| Pottery Kiln | Firefly Lantern (34), Woodland Vase (34), Gem Mosaic Tile (35), Gilded Vase (36), Old Boot Planter (41) |

**Not cooked:** the sea turtle, curious seal, dolphin, baby whale, ghost ray, golden crab, kraken and celestial koi go to the Museum's new **Aquarium** shelf (6,000 coins, 15 gems) instead. The creek's gold flakes, agate, jade and river pearls fill **Creek Treasures** (1,500 coins, 6 gems), and the Gilded Vase and Gem Mosaic Tile use them again after that.

**Boats:** the Angler's Cruise now wants every edible fish and fish dish; juices joined the Orchard Cruise, jams and maple syrup the Sweet Tooth Cruise. Two new themes: the **Picnic Cruise** (savoury dishes) and the **Craft Fair Cruise** (pottery, candles, wool goods and the new crafts). Boats now ask for what the farm can make now or has caught, found or made before (its Collection Book), so rarer fish, fish dishes and woods crafts turn up on wish lists; orders keep their old rules (common all-day fish only). A boat day only picks a theme the farm can fill three wishes from, so a young farm never meets a boat it cannot serve. The economy simulator does not model fishing or the woods, so it still lists fish dishes and woods goods as never asked for. Each villager also likes three of the new goods.

## 1.21 Woodcraft (`buildings.json` `woodcraft_lodge`, `woods.json` `camp` and `weather`)

**The Woodcraft Lodge** is a farm workshop (level 22, 6,000 coins) that can only be built once the Hollow Bridge trail is restored in the Wild Woods (`room: trail_hollow`, like the Village Kitchen's room). Its 12 recipes take woods produce (with a little sugar, wheat or butter) and are priced at x1.7 their ingredients' barn value:

| Recipe | Level | Takes | Sells |
| --- | --- | --- | --- |
| Elderberry Cordial | 22 | 3 elderberry, sugar | 190 |
| Hazelnut Brittle | 22 | 3 hazelnut, sugar | 150 |
| Herbal Salve | 23 | 2 fern, 2 moss, wild garlic | 100 |
| Mushroom Tea | 24 | 2 chanterelle, puffball | 120 |
| Bramble Crumble | 25 | 2 blackberry, 2 raspberry, 2 wheat, butter | 330 |
| Holly Wreath | 26 | 3 holly, 2 fern, wild rose | 195 |
| Forest Tea | 28 | 2 river mint, wild rose, bluebell | 125 |
| Chestnut Bread | 36 | 3 chestnut, 2 wheat | 100 |
| Pinecone Wreath | 36 | 4 pinecone, 2 holly | 130 |
| Resin Varnish | 36 | 3 pine resin | 280 |
| Maple Candy | 37 | maple syrup, sugar | 415 |
| Woodland Feast | 40 | woodland pie, elderberry cordial, bramble crumble | 1,845 |

Woods produce is limited each day (roughly 30 forage with every region open), so the Lodge is a way to get more from it rather than a coin engine. Every Lodge good is on a boat wish list (Sweet Tooth, Baker's, Craft Fair, Picnic, Orchard) and each villager likes one.

**Camping:** a campsite in the glade. Pitch the tent from 5 pm to 2 am; from 5 am the next morning a camp morning gives 4 forage from the glade and the open regions, and a 20% chance of a mineral or fossil. Once a night, Foraging XP 10 (`camp_mornings`).

**Woods weather** (the day's weather from `Weather.ts`): rain fills every mushroom spot and makes mushrooms x2 likelier; mist makes fossils and artifacts in digs, and jade, river pearl, topaz, amethyst and agate in pans, x1.4 likelier; sunshine makes berries and flowers x1.4 likelier. Nothing is ever found in only one weather.

## 1.22 Orchard Days (levels 101-120)

New content up to `authoredMax` 120, so every level from 101 to 120 unlocks something.

| Kind | Content |
| --- | --- |
| Crops | rice (101, sells 740), garlic (105, 780), sweet potato (110, 830), cranberry (116, 880); 27-30 h each |
| Trees | peach (103, 30,000 coins, 300 a fruit), plum (108, 38,000, 340), olive (114, 46,000, 380); 6-8 h, 3 fruit |
| Dishes | 12, priced at x2.0 their ingredients' barn value: rice pudding (Dairy, 104, 3,210), garlic bread (Bakery, 106, 3,420), plum jam (Jam Kitchen, 109, 2,130), sweet potato pie (Bakery, 111, 3,730), peach cobbler (Bakery, 113, 2,050), olive oil (Juice Press, 115, 3,040), cranberry sauce (Jam Kitchen, 117, 5,370), mushroom risotto (Village Kitchen, 117, 6,120), fried rice (Village Kitchen, 119, 5,130), olive focaccia (Bakery, 119, 7,620), peach sorbet (Dairy, 120, 1,410), plum cake (Bakery, 120, 2,230) |
| Decor | Fruit Crate Stack (102), Orchard Ladder (107), Olive Oil Jars (112), Market Fruit Cart (118); 52,000-70,000 coins, charm 160-200 |
| Farmhouse | level 15 at player level 110: 3,200,000 coins, 36 h; fields 140, trees 60, decor 800 |
| Master | new challenge "Pick {n} wild forage in the Wild Woods" (base 25) |

Uses: the crops go on the Garden boat, the fruit, olive oil, plum jam and cranberry sauce on the Orchard boat, the dishes on the Baker's, Dairy, Sweet Tooth and Picnic boats, and each villager likes two of the new goods.

## 1.23 The Ancient Grove (`woods.json` `grove`, `src/systems/Grove.ts`)

**The Root Path** (`trail_grove`, level 40, Hazel): iron ore 12, quartz 6, jade 2; morel 3, river pearl 2, pine resin 10, firefly 6; herbal salve 10, pinecone wreath 6, forest tea 10; 80,000 coins. It opens the Ancient Grove island (7 forage spots: acorn, moonflower, hazelnut, moss, chanterelle, rare morel).

**The Elder Oak** grows in 5 stages. Each opens after the one before, its level, and `growDays` since the stage before was finished, so the whole oak takes at least 52 days after the Root Path:

| Stage | Level | Wait | Asks for (gold = gold-star items only) | Lasting bonus |
| --- | --- | --- | --- | --- |
| Waking Roots | 42 | - | water lilies, watercress, maple sap; moss, ferns, acorns; herbal salve, mushroom tea | woods forage +10% silver, +4% gold chance |
| The Green Shoot | 46 | 7 days | acorns, bluebells, moonflowers; elderberry cordial, hazelnut brittle; gold pumpkins and strawberries | +1 pan a day at Crystal Creek |
| Spreading Boughs | 50 | 10 days | chestnuts, pinecones, lingonberries; bramble crumble, holly wreaths, maple candy; gold milk and eggs; 150,000 coins | critter families visit twice a day (a treat each time) |
| The Glowing Canopy | 55 | 14 days | fireflies, moonflowers, gold flakes; firefly lanterns, pine candles, resin varnish; gold cheese and bread; 250,000 coins | the canopy glows at night; +1 dig a day |
| The Elder Crown | 60 | 21 days | 80 acorns, 3 golden acorns, 3 owl feathers; woodland feasts and pies, elderberry cordial; gold apple pies and strawberry cakes; 400,000 coins | finale: Elder Oak Sapling decor (charm 400), 120,000 coins, 150 gems |

New Lodge goods: acorn bread (level 40, 3 acorns and 2 wheat, sells 90) and moonflower tea (level 42, 2 moonflowers, river mint and sugar, sells 220), x1.7 their ingredients like the other Lodge goods. Acorn bread is on the Baker's boat, moonflower tea on the Picnic boat; Pip likes acorn bread, Juniper moonflower tea.

## 1.24 Tea and Flowers (`tea_house`, `florist`, villager `arc`)

New crops: tea leaves (level 104, sells 770) and roses (level 112, sells 850), 27-29 h like the other late crops. Two workshops, each recipe at x2.0 its ingredients' barn value like Orchard Days:

| Workshop | Level, cost | Recipes (level: sells) |
| --- | --- | --- |
| Tea House (3x3) | 106, 150,000 coins | green tea (106: 3,080), mint tea (107: 1,730), honey tea (108: 3,380), chai (110: 3,330), iced tea (113: 3,510), matcha cake (115: 4,930), tea biscuits (118: 1,890), peach iced tea (120: 4,370) |
| Florist (2x2) | 112, 180,000 coins | rose bouquet (112: 8,500), sunflower bouquet (112: 2,280), lavender sachet (113: 1,540), rose buttonhole (114: 1,750), wildflower bouquet (116: 440), flower crown (117: 3,770), rose water (118: 6,800), flower wreath (119: 5,940), moonflower bouquet (120: 5,370) |

**Bouquets** (`"bouquet": true` in items.json) are loved by every villager (`village.taste`), so they give 40 friendship (more with stars and on birthdays). The wildflower bouquet is cheap on purpose: it is made from glade forage and is the everyday gift.

**Best-friend arcs:** at 10 hearts each villager's second story arrives as 5 letters on days 0, 1, 3, 5 and 7 after it starts, at most one letter a day. One arc runs at a time, in villager order. The last letter carries 20,000-30,000 coins, 25-30 gems and a few favourite goods.

## 1.25 Helping Hands (`farmhands.json`, `mastery.json` `lines`)

**Farmhands:** Fern (level 50), Ollie (70) and Mabel (90). Each takes one chore and does it every 10 minutes while the game is open (not offline):

| Chore | What it does |
| --- | --- |
| Replant fields | up to 12 empty fields a round, with the crop last harvested on each, paying the seeds (plain seed: the seed tray's fertiliser and rare-seed switches are not used) |
| Feed animals | the hungry animals of one chosen home, from the barn's feed |
| Run a workshop | restarts the recipe the chosen workshop last made whenever a slot is free and the ingredients are there |

Wage 2,500 coins a hand, paid on the first round they actually work each day (an idle day costs nothing; if the coins are short they wait). Festival days are days off. They never collect, sell or deliver. Late-game income is far above 7,500 a day, so three hands are an easy yes once the farm runs several workshops; they save taps, not decisions.

**Mastery lines:** each mastered crop or workshop takes one line for good:

| Line | Crop | Workshop |
| --- | --- | --- |
| yield | Bumper Crop: 25% chance of +1 at a harvest | Batch Bonus: +10% chance a batch makes double |
| gold | Golden Fields: +6% gold chance | Gold Standard: +5% gold chance for its goods |
| speed | Quick Growth: grows 12% faster | Quick Hands: works 10% faster |

## 1.26 Estate Projects (`estate.json`, `src/systems/Estate.ts`)

Two projects in the village square, after the Village Festival. Stages open in order at the project's level; there is no wait between stages, the bundles are the pace (about 3-5 days of late-game play each):

| Project | Level | Stages (coins) | Reward |
| --- | --- | --- | --- |
| The Clock Tower (Bram) | 70 | Foundations (150,000), The Tower (200,000), The Clockwork (250,000, a gold-star bundle), The Bell and the Face (300,000) | the square's clock shows the real time and chimes on the hour; Clock Tower Model (charm 400), 80,000 coins, 100 gems |
| The Lighthouse (Old Tom) | 80 | The Rocks (150,000), The White Tower (200,000), The Lamp Room (250,000), The Light (300,000, a gold-star bundle) | Boat Visitors 3 days a week instead of 2; the beam at night; Lighthouse Model (charm 400), 80,000 coins, 100 gems |

Every item asked for exists by the project's level (`validate-data` checks it): ores and gems from the woods, glazed tiles and pots, candles, honey, dishes and goods from the workshops.

## 1.27 The Treehouse and the Wildlife Album (`woods.json` `treehouse`, `wildlife.json`)

**Wildlife Album** (from level 14): 17 species in 4 sets. Each is out on a day with its `chance` (seeded, the same on every device), in its hours, and only in its weather or on festival days where given; nothing is missable for good. One photo per species a day; the first puts it in the album (a Collection Book page with hints for the missing ones).

| Set | Species | Full-set reward |
| --- | --- | --- |
| Woodland | red deer, fox (glade), wild rabbit, hedgehog (Mossy Hollow), red squirrel, barn owl (Whispering Pines) | 6,000 coins, 15 gems |
| Waterside | mallard, grey heron, frog (rainy days), river otter (Crystal Creek) | 6,000 coins, 15 gems |
| Farm Edge | brown hare, robin (sunny), peacock butterfly (sunny), badger (night) | 5,000 coins, 10 gems |
| Rare Visitors | penguin and polar bear (farm, festival days), panda (Ancient Grove, 35% of days) | 15,000 coins, 40 gems |

The whole album: Juniper's letter with 20,000 coins and 50 gems.

**The Treehouse** (Whispering Pines): The Platform (level 45), The Cabin (50), The Roof (55), in order, paid in woods produce and Lodge goods (no coins). Then six furnishings, one small bundle each: log chairs, mushroom lamp, hanging lanterns, moss rug, bookshelf, telescope. The finished treehouse adds 2 finds to every camp morning; the telescope lists today's visitors in the album; all six furnishings bring Juniper's letter (30 gems).

## 1.28 Together (`coop.json`, server section "1.28 co-op village projects")

| Project | Level | Needs | Reward for every giver |
| --- | --- | --- | --- |
| The Friendship Footbridge | 20 | wheat 400, bread 80, yarn 30, cheese 30, iron ore 20 | Friendship Footbridge (charm 250) + Friendship Plaque (charm 120) |
| The Community Garden | 25 | strawberry 150, carrot 250, apple 100, honey 30, fertiliser 20 | Community Garden Corner (charm 250) + plaque |
| Fireworks Night | 35 | sugar 120, beeswax candle 40, berry juice 50, cookie 60, copper ore 20 | Fireworks Stand (charm 250) + plaque |

Sized for a host and two or three friends to finish in a few days. One open project per host, 2 starts a week, 50 of an item per gift, 40 gifts a day, 30 days to finish (then everyone is refunded). The decorations are trophies (`cap: none`), so a player who helps with many projects is not short of decor room.

## 1.29 Home Sweet Home (`home.json`, `furniture.json`, `src/systems/Home.ts`)

Inside the Farmhouse, from level 15 (level 30 until 1.30.1). No XP or score; prices are set for spending, not for return.

- **Charm (1.30.2):** every piece standing in a room adds its price / 300 in charm (`home.json` `charm`), no cap
  (owner). That is the same rate as farm decor (about 300-350 coins a charm, e.g. the Market Fruit Cart), so the home
  is no shortcut; 100 charm takes about 30,000 coins of furniture. Storage and saved looks do not count. Leaderboard:
  the server takes up to 1,000 new charm at once and 400 an hour after, so a big home already furnished before the
  update shows its full charm on the board within a few hours; only a jump over 3,000 at once (about 900,000 coins of
  furniture placed) is held off the boards until a developer looks (dashboard Leaderboards page).

- **Furniture:** 229 catalogue pieces from 40 to 4,500 coins (median 700). Buying one of everything once costs about
  200k coins, roughly 3-5 days of income at level 40+ (50-70k a day). Six pieces a day are 25% off; nothing is ever
  taken off sale. A stored piece sells back for half.
- **Rooms:** one more per Farmhouse level (1, 2, 3, 5, 7, 9, 11, 13, 15), nine in all. Enlarging a room: Roomy
  (5.5 m) 15,000, Grand (7 m) 40,000; all nine Grand is 495,000 coins.
- **Handmade (10 pieces):** made at the Carpenter's Workshop from gathered things (pinecones, moss, cotton fabric,
  yarn, shells, clay pots, beeswax candles, owl feathers, resin varnish, golden acorns) plus 100-600 coins. This gives
  those items another use.
- **Villagers' sets (18 pieces):** each villager sends three pieces at 3, 6 and 9 hearts (one letter per villager at
  a time). Once received, a gift piece can be bought again at its catalogue price.
- **Limits:** 120 pieces a room; saved looks share 600 pieces across the home. A fully furnished home with every look
  saved adds about 170 KB to the save, inside the 512 KB cloud save limit.

## 1.31 The Old Mine (`mine.json`, `src/systems/Mine.ts`)

Across the water to the north, from level 18. Bram's crew opens it with one restoration room (`mine_entrance`: timber,
lamps, lunch and 8,000 coins in wages). No danger, nothing to lose, nothing random is ever sold.

- **60 swings a day** (the lantern's oil; Second Wind at Mining 10 adds 15). A floor has 12-16 rocks; the ladder down
  is under one of them, so a floor takes about 7 rocks (12 swings) to clear: about 5 floors a day, more with better
  pickaxes. 60 floors, a lift every 5, so the bottom takes roughly 2-3 weeks of daily visits.
- **Rocks a day and what they are worth** (expected, raw goods at barn price):

  | Layer | Pickaxe | Swings a rock | Rocks a day | Value | Ore a day |
  | --- | --- | --- | --- | --- | --- |
  | Workings 1-20 | Old | 1.6 | 37 | 1,400 | copper 12, iron 6, coal 12 |
  | Workings | Iron | 1.1 | 55 | 2,100 | copper 18, iron 9, coal 18 |
  | Caverns 21-40 | Copper | 1.7 | 35 | 2,500 | iron 8, silver 6, coal 10 |
  | Caverns | Golden | 1.1 | 56 | 4,000 | iron 13, silver 10, coal 16 |
  | Deeps 41-60 | Iron | 1.7 | 36 | 3,800 | silver 7, gold 7, coal 15 |
  | Deeps | Golden | 1.1 | 56 | 5,900 | silver 10, gold 10, coal 24 |

  Small next to farm income at these levels on purpose: the mine is the home of ores, gems and fossils that the Manor,
  Estate and Village Projects already ask for, plus the Museum's new shelves.
- **Pickaxes (Bram):** Copper (5 copper bars, 800 coins; about 1-2 days, the floor 5 chest gives 2 bars) opens the
  Crystal Caverns; Iron (6 iron bars, 2 copper bars, 3,000; about 2-3 days) opens the Ember Deeps; Golden (6 gold bars,
  3 silver bars, a diamond, 12,000; about 4-5 days, diamonds are 1 in 3 days) is the best.
- **Workshops:** the Smelter (18) turns 3 ore and coal into a bar for about +30% over the ore; the Jeweller (26) makes
  rings, pendants and the Diamond Tiara for +55-90% over their parts, slower the dearer.
- **Extras:** a mine cart on a third of floors (3-4 ores and coal, once a day; Cart Luck at Mining 7 doubles it), a
  glowing pool on a third of deeper floors (glow moss or a cave pearl), a chest on each lift floor (once ever, 800
  coins and 2 gems at floor 5 up to the bottom). Geodes are cracked by Bram for 25 coins (a mineral, about 1 in 4 a
  precious gem).
- **Mining skill:** XP from rocks (2), gems (6), fossils (8), new floors (12), geodes (4) and carts (4).
