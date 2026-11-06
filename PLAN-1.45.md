# Plan: Thoughtful Parcels and content past level 140 (drafted 4 Nov 2026)

Status (5 Nov 2026): section 3 built as 1.45.0, local, not pushed. Owner: three cards, guardrail added. Differences: a pinned goal is exempt from the 7-day limit; items must have been on the farm before, not only unlocked; Master week and festival parcels are worth half a level-up parcel. Tables in BALANCE.md "1.45". Section 4: 1.46 built, local, not pushed (BALANCE.md "1.46"); 1.47 onwards not built.

## 1. What we have at high levels

| Levels | About day | What unlocks |
| --- | --- | --- |
| 101-120 | 190-231 | Orchard Days, Tea House, Florist: crops, trees, workshops, decor |
| 121-130 | 233-255 | Goose, alpaca, highland cow, Smokehouse, Preserves Cellar, recipes |
| 131-140 | 257-279 | One recipe a level, nothing else |
| 141-180 | 281-375 | Level Marker, coins and gems. Farmhouse 18, 19 and 20 at 150, 165 and 180 |
| 181-300 | 377-663 | Level Marker, coins and gems |
| 301+ | 665+ | Coins and gems |

Days past 120 are worked out at 2.4 days a level, not simulated.

Long-running goals that keep going at these levels: Manor, Estate, Grove, Treehouse, skills 11-20, Grand Mastery, mine floors 61-100, Master Board, Village Fair, co-op projects.

## 2. What rewards do today

- **Level-up:** 3,200 coins at level 140, against about 48k spare coins earned per level. It barely registers.
- **Crate item rolls:** a random item, with no idea what the farm needs.
- **Crate bug:** `CrateSystem.open` lists an item only if its crop level is reached, and items that are not crops count as level 99. So below level 99 crate item rolls give only crops and feed. From level 99 they can give nearly any item in the game, including things the farm has not unlocked.
- **Already need-aware:** boat wishes (`canSupply`), the net's fish picks, `ItemUses.itemNeeded`, `wantedItems` in workshops, and the dashboard's Needs tab, which already works out what a player is missing.

## 3. Thoughtful Parcels (1.45)

A villager noticed what you were short of and sent some over.

**The main rule: need picks what you get, never how much.** Every parcel has a fixed value set by the reward and the level. A struggling farm and a rich farm get the same value. That keeps the economy predictable and gives no reason to play badly on purpose.

### How it works

1. A reward arrives as a parcel. It stays until opened, so what is inside is worked out at opening and is never stale after time away.
2. It offers three cards, and the player picks one:
   - "14 Moonsilver Bars, for Workshop 8" (Bram)
   - "60 Feed, you are running low" (Hazel)
   - "11,000 coins towards Farmhouse 18" (Hazel)
3. The offer is seeded from the farm seed and the level, and saved once shown, so reloading cannot change it.

### What counts as a need, in order

1. The goal the player pinned (below).
2. Orders and the truck, for what is short right now.
3. Missing lines in open project bundles.
4. Goods for the next upgrade or pickaxe, or coins for the next Farmhouse level.
5. Running low: feed for animals they own, bait, fertiliser, seeds.
6. Nothing needed: coins, a decor piece they do not own, or a cosmetic.

Cards come from different groups where possible, so the three are a real choice.

**Pin a goal:** a pin on any project line or upgrade. It puts that goal first in parcels and shows it on the goal card. This also lets players say what they want rather than us guessing.

### Limits

- At most 25% of a missing line per parcel, so a parcel helps with a project but never finishes it. Any value left over comes as coins.
- The same item at most once in 7 days.
- Only items the farm has already unlocked.
- Never Museum pieces, Collection Book ticks, Mastery or quest counts, or first catches.
- Star goods only for lines that ask for stars, at the existing value (silver x2.5, gold x5).
- **Never sold.** No shop offer based on what a player is short of, now or in 2.0. Offering to sell someone the thing they are stuck on is the pattern this audience should not get. I suggest adding this to the roadmap guardrails.

### Where parcels are used

| Reward | Change | Value to start with |
| --- | --- | --- |
| Level-up, from 61 | A parcel on top of the coins | About half a day's spare income (10k), tuned by simulation |
| Crate item rolls, all levels | Picked from needs, no card choice. Fixes the level 99 bug | The existing amounts |
| Master week, 3-star festival prize | A parcel added | One level-up parcel |
| Rare boat guests, Village Fair | Later, if the first two feel good | |

### Build notes

- `systems/Needs.ts`: `needsNow()` returns the ranked list. Reuse `ItemUses`, and bring the dashboard's Needs logic across rather than writing it again.
- `systems/Parcels.ts`, `ui/panels/ParcelPanel.ts`. State `parcels` {pending, offered, recent, pin}, optional, repaired in `Save.ts`.
- Senders follow what villagers already do: Rosa seeds and baking, Tom fish and bait, Bram bars and tools, Juniper decor, Hazel coins and feed, Pip odd finds.
- Log `parcel_offered` and `parcel_picked` for the dashboard, to see what players choose.
- Game only, no server change. Check parcel coins against the leaderboard's value allowance.
- Regression checks: fixed value, the 25% cap, no reroll on reload, nothing locked offered, old saves.

## 4. Content after that

| Version | Theme | Levels | What |
| --- | --- | --- | --- |
| 1.46 (built) | Bean and Spice | 141-160 | Cocoa, coffee, chilli, saffron, zucchini, kiwi. Fig and almond trees. Chocolatier and Coffee Roastery. 26 recipes |
| 1.47 | Colour and Lanterns | 161-180, and 131-140 | Dye Works (coloured yarn and fabric unlock decor paint colours). Lantern, Cottage Garden, Lighthouse Point and Village Fete decor sets. Decor added to the thin 131-140 stretch |
| 1.48 | More festivals | All | Fruit Press, Lantern Night, Sheep Shearing Fair, Kite Day. Eight festivals in turn |
| 1.49 | Collector's Shore | All | Beach shells, pressed flowers, a decorations page and a recipe page per workshop in the Book |
| 1.50 | The Newcomer | 100+ | A seventh villager moves into the village, with hearts, letters, arc, keepsake and favours. Friends only |
| 2.x | The Hill Farm | 100+ | The second plot: its own build grid, opened by an Estate project, with its own performance budget |

Land last grew at level 47, so the Hill Farm is the biggest thing missing from the late game. It is also the biggest job here, and the roadmap has it in 2.x.

## 5. Questions for the owner

1. Start with 1.45?
2. Pick one of three cards, or just give the best match? I recommend three cards.
3. Add "need-based offers are never sold" to the guardrails?
4. Bring the Hill Farm forward, ahead of 1.48-1.50?
