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
