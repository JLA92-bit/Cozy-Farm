# Plan: Higher Ground (end game past level 80, drafted 31 Oct 2026)

A player has reached level 81 and most things are maxed. This plan gives every maxed track a second tier, opening between
levels 80 and 180. It follows the roadmap guardrails:
- no prestige or reset;
- friends only;
- no loot boxes;
- nothing is lost while away;
- late game asks for about 2-3 hours a week.

Nothing here is built yet. The numbers are starting points. I'll run `simulate-economy` and show you the before and after tables before anything ships.

## 1. What is maxed today, and when

The pace past level 60 is about 2.4 days a level (BALANCE.md 1.17). An engaged player reaches level 80 around day 140,
level 100 around day 187 and level 120 around day 231. Their spare income is roughly 20k coins a day.

| Track | Top today | Maxed at about |
| --- | --- | --- |
| Skills (7) | Level 10 (16,000 XP) | Level 50-80, depending on the skill |
| Workshop upgrades | 4 levels (6 queue slots), top cost 4,000 x mult | Level 30-40 |
| Animal home upgrades | 3 levels (6 stalls) | Level 30-40 |
| Land | 32 expansions, the 48 x 48 map | Level 47 |
| Animal kinds | 8, the last (horse) at 36 | Level 36 |
| Vet's Cottage, Carpenter's Workshop | Level 3 | Level 40-50 |
| Villager hearts | 10 | Level 50-70 |
| Critter hearts | 5 | Level 40-60 |
| Mine | 60 floors, 4 pickaxes | Level 50-70 |
| Fishing Net | Master Net (Fishing 10) | When Fishing reaches 10 |
| Mastery plaques | 1 per crop and workshop | Level 60-90 |
| Farmhouse | Level 15 at player level 110 | Level 110 |
| Building caps (Farmhouse 15) | 140 plots, 60 trees, 6 of each animal home and workshop, 800 decor | Level 110 |
| Farmhands | 3 (levels 50, 70, 90) | Level 90 |

These still grow without limit:
- endless levels, with Level Markers to 300;
- the Master Board every week;
- festivals, boats and co-op projects;
- Willowmere Manor (about 8 months);
- Estate, Grove and Treehouse projects.

These keep the days varied, but none of them is "my thing got better".

## 2. Principles

- **Every maxed track gets a next tier.** Players keep everything they have. A new tier opens by level, and sometimes needs the step before it.
- **One new goal every few days.** With about 2.4 days a level, a new unlock every 2-3 levels gives a level-81 farm something about once a week, from several tracks at once.
- **Late-game wealth needs somewhere to go.** The new tiers cost coins plus late goods: mine bars, Lodge planks, gold-star goods. That ties the mine, the woods and the workshops together.
- **Small bonuses, not multipliers.** A new tier mostly gives convenience (a slot, a stall, a longer check-up), variety (new kinds, floors, recipes) or a look (plaques, rings, decor). Income-type bonuses stay at about +1-5% each, so orders, the truck and the market don't inflate.
- **Check-in friendly.** Long timers are fine (hours, overnight), but none needs the player at a set time.

## 3. The tiers

### 3.1 Skills 11-20: expert ranks (all 7 skills)

- **XP to reach each level:** 24k, 33k, 43k, 54k, 66k, 79k, 93k, 108k, 124k, 141k.
- **XP already earned counts.** XP above 16k already counts, so a level-81 farm may open several ranks on its first day. That gives a good first-day feeling and costs nothing.
- **Each rank** gives half the normal per-level bonus (for example +0.5% gold crops).
- **Perks:** two-way choices at 15 and 20, plus a free bonus at 12 and 18.
- **Perk examples:**
  - Farming 15: fertiliser lasts two harvests.
  - Animals 15: one pat a day makes the next product silver.
  - Cooking 15: one queue slot a day finishes 25% faster.
  - Mining 15: geodes crack free once a day.
  - Foraging 15: a third woods dig.
- **On screen:** Me > Skills shows 1-20. Ranks 11-20 have a star ring on the skill badge.
- **Fishing Net:** a Grand Net at Fishing 15 (holds 12, keeps 6, 8 h, rare 5%). Keeping 6 fish is the hard top, to protect the fish economy.

### 3.2 Workshop levels 5-7 and animal home levels 4-6

| Upgrade | Gives | Cost (x the building's upgradeMult) | Player level |
| --- | --- | --- | --- |
| Workshop 5 | 7th queue slot | 12k + 10 iron bars + 10 planks | 75 |
| Workshop 6 | 8th queue slot | 30k + 8 gold bars + 15 planks | 90 |
| Workshop 7, Fine Tools | +5% star chance for that workshop's goods | 75k + 5 gems from the mine + 5 gold goods it makes | 105 |
| Animal home 4 | 7th stall | 15k + 10 iron bars + 10 planks | 80 |
| Animal home 5 | 8th stall | 35k + 8 gold bars + 15 planks | 95 |
| Animal home 6, Prize Pen | +5% silver and gold products there | 80k + 5 gold products from that home | 110 |

- **Cost to finish everything:** with 6 workshops of each kind, it's a long sink, which is the point. As a rough guide, upgrading one home or workshop all the way costs about 1-2 weeks of spare coins and goods.
- **Code:** mostly data (`buildings.json` `upgrades`), plus goods in the upgrade cost and the two "Fine Tools" and "Prize Pen" effects.

### 3.3 Vet's Cottage and Carpenter's Workshop levels 4-5

- **Vet 4:** check-ups last 5 days (3 now).
- **Vet 5:** old animals keep their full output for twice as long.
- **Carpenter 4:** fresh paint lasts twice as long.
- **Carpenter 5:** everything wears 25% slower.
- **Opens at:** levels 85 and 100.
- **Effect:** upkeep gets lighter, not removed.

### 3.4 Farmhouse 16-20

| Farmhouse | Player level | Cost | New caps |
| --- | --- | --- | --- |
| 16 | 120 | 4.5M | +10 plots, +4 trees, +1 workshop of each kind, +80 decor |
| 17 | 135 | 6M | +10 plots, +4 trees, +1 animal home of each kind, +80 decor |
| 18 | 150 | 8M | +10 plots, +4 trees, +1 workshop of each kind, +80 decor |
| 19 | 165 | 10M | +10 plots, +4 trees, +1 animal home of each kind, +80 decor |
| 20 | 180 | 12M | +10 plots, +4 trees, +1 workshop of each kind, +80 decor, a new home room |

- **Map room:** the map has no more land, so the extra plots and trees need space freed up somewhere. Options: smaller decor, or the second plot in 3.10. Before sizing these caps I'll check how full the map really is on a large farm.
- **Performance:** the decor cap stops at 1,200. Anything above that needs `npm run test:perf` rerun with more pieces.

### 3.5 The Sunken Halls (mine floors 61-100)

- **Where:** a fourth layer under the Ember Deeps. It opens with Mining 12 and a Bram letter.
- **New pickaxes:**
  - Starsteel at Mining 15 (power 4);
  - Heartstone at Mining 20 (power 5).
- **New finds:** two new bars (starsteel, moonsilver). They go into the workshop and home upgrades above, and into Farmhouse 16+.
- **Museum:** new shelves for the new finds.
- **Rhythm:** still 60 swings a day. Deeper floors drop more per rock, and the lift stops every 5 floors as now.

### 3.6 Grand Mastery

- **When:** after a crop's or workshop's gold plaque.
- **The challenge:** 50 gold of that crop, or 30 gold goods from that workshop.
- **Reward:** a Grand plaque (decor, charm counted in the trophy cap) and a permanent +2% gold chance for that one crop or workshop.
- **Why it works:** it gives each crop and workshop a reason to be grown or run again in the late game.

### 3.7 Farmhands levels 1-5

- **How they level:** each farmhand goes up a level every 10 working days.
- **What a level gives:**
  - 12 → 20 fields a round;
  - a second recipe they can queue;
  - at level 5, a free day off a week, with no wage that day.
- **Wages:** stay as now.
- **Limit:** they never do anything the player can't do. They just do more of it.

### 3.8 New stock and workshops (content for levels 121-140; raises `authoredMax` to 140)

These come from the roadmap's content bank, and reuse existing models where we can.

- **Animals:**
  - alpaca (from the sheep), with alpaca wool;
  - highland cow, with cream;
  - goose (from the duck), with goose eggs.
- **Workshops:**
  - Preserves Cellar: pickles and aged cheese, long overnight timers;
  - Smokehouse: smoked fish and smoked cheese. This gives net and rod fish a new use without changing fish prices.
- **Recipes:** about 20 new recipes and 6-8 decor pieces.

### 3.9 Villager favours and critter trust

- **Favours:** villagers at 10 hearts ask for one favour a week. It's a bigger errand (3 things within 3 days) and pays Friendship Tokens.
- **What tokens buy:** villager-themed home pieces and keepsake upgrades, such as a golden version of their keepsake.
- **Critters:** hearts 6-10, "Trusted". From 6, a second daily gift; a rare decor piece at 10.
- **Rules:** friends only, as always.

### 3.10 Later (2.x): the second plot

This is the real answer to "the land is full". It's already in the roadmap: a hill farm or orchard island, opened by an
Estate project and given its own performance budget. It's a large piece of work, so it comes after the steps above.

## 4. Release order

| Release | What | Why first |
| --- | --- | --- |
| 1.35 Higher Ground | Skills 11-20, the Grand Net, workshop levels 5-7, animal home levels 4-6, Vet and Carpenter 4-5 | Fixes "everything is maxed" for the level-81 farm right away. Mostly data and screens, no server change |
| 1.36 The Sunken Halls | Mine floors 61-100, 2 pickaxes, new bars and Museum shelves | Supplies the goods the 1.35 upgrades ask for, and a big new goal |
| 1.37 Grand Mastery and Farmhands levels | Grand plaques, farmhand levels | Gives every crop and workshop a late-game reason |
| 1.38 New Stock | Alpaca, highland cow, goose, Preserves Cellar, Smokehouse, levels 121-140 content | New things to build and grow for levels 120+ |
| 1.39 Farmhouse 16-20 | New caps, after checking map room and the decor budget | Needs the space and performance check first |
| 1.40 Favours and Trust | Villager favours, critter hearts 6-10 | Social late game |
| 2.x | The second plot | The long-term land answer |

Each release:
- gets its own `PLAN-1.3x.md` with the exact numbers;
- gets a regression check;
- gets a `simulate-economy` table in BALANCE.md;
- is a game-only change (no `schema.sql` run). The leaderboard's `level_for_xp` doesn't change.

## 5. Questions for you

1. Start with 1.35 as described above?
2. Skills: top out at 20, or keep it smaller at 15?
3. Land: wait for the 2.x second plot, or look for a smaller "reclaim the shore" expansion sooner?
4. Did your level-81 player name anything in particular as maxed or boring? I'll move that to the front.
