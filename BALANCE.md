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

`xpToNext(L) = round(15 + 12 * (L - 1)^1.6)`. About 112k XP to reach level 50.

| Level | XP to next | Cumulative | Typical time (active play) |
| --- | --- | --- | --- |
| 1 | 15 | 0 | first minute |
| 2 | 27 | 15 | ~2 min |
| 3 | 51 | 42 | ~6 min |
| 5 | 125 | 178 | ~30 min |
| 7 | 226 | 476 | ~1 h |
| 10 | 419 | 1.3k | ~2.5 h |
| 20 | 1.3k | 9.4k | a few days of check-ins |
| 30 | 2.6k | 28k | ~2 weeks |
| 49 | 5.9k | 106k | long-term goal |

These times come from `tools/playtest.mjs`, which only plants, harvests and delivers orders. A real player
who also sells, builds and raises animals levels a little faster.

XP sources, roughly in order of size: crops (2-34 XP per field, scaling with grow time), orders (item value / 3,
minimum 5), animal products (3-15), recipes (about item value / 10), obstacles (2-14), quests, achievements and
land expansions.

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
| 7 | Tomato, Dairy (cream), lanterns |
| 8 | Cotton, Truck Depot, corn bread |
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
- **Truck:** 3-6 crates (different goods in each while possible), 1.8 x value per crate, plus a 50% bonus and a rare crate for filling all of them.
  6 h window, 30 min cooldown.
- **Stall:** you set the price (0.5x-1.6x value). Cheaper listings sell sooner (20 s - 4 min).
- **Merchant:** visits 2 h out of every 4 h from level 6 with decor at 30% off, crate-only cosmetics, bulk goods
  and gems for coins. Bulk goods cost 1.1 x value (`bulkPriceMult`) so they cannot be flipped at the barn; they
  save time on orders, which pay 1.8 x.
- **Production queue:** a job that has not started yet can be cancelled for a full ingredient refund.
- **Fields** cost 10 coins + 8 per field beyond the 6 you start with. Animals get 25% pricier per animal owned.
- **Gems** are only earned (levels, awards, daily calendar, rocks, some orders, crates, merchant). Finishing a
  timer costs 0.2 gems per minute left (minimum 1).

## Building caps (farmhouse level)

| Farmhouse | Needs player level | Fields | Fruit trees | Each animal home | Each production building | Decorations |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 10 | 4 | 1 | 1 | 25 |
| 2 | 5 | 16 | 6 | 1 | 1 | 40 |
| 3 | 10 | 22 | 9 | 2 | 1 | 60 |
| 4 | 16 | 28 | 12 | 2 | 2 | 85 |
| 5 | 22 | 34 | 16 | 2 | 2 | 115 |
| 8 | 44 | 56 | 30 | 3 | 3 | 260 |

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
