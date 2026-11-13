# Plan: The Long Haul (keeping a fast level-100+ player engaged, drafted 13 Nov 2026)

Status: draft for the owner. Nothing built. Follows the roadmap guardrails:
- no prestige or reset;
- friends only;
- no loot boxes;
- nothing lost while away;
- nothing ever sold from what a player is short of.

## 1. Where a level-101 farm stands today

| What | Their runway |
| --- | --- |
| Level unlocks | Every level to 180 unlocks something (`authoredMax` 180): Tea and Flowers, Orchard Days, New Stock (121-140), Bean and Spice (141-160), Colour and Lanterns (161-180) |
| After 180 | Level Markers only (to 300), plus a milestone gift every 10 levels |
| Farmhouse | 15 at 110, then 16-20 at 120/135/150/165/180 (4.5M-12M coins) |
| Upgrades | Workshop 6-8, animal homes 5-7, Vet/Carpenter 4-5, skills to 20, Grand Mastery, farmhand levels |
| Time-gated tracks (cannot be rushed) | Willowmere Manor (about 8 months of goods), Estate projects (Observatory 110, Windmill 130), Grove Heartwood, Treehouse Lookout, Sunken Halls (100 swings a day), Far Reaches, favours (one a week), critter hearts, Master Board (weekly), festivals (every 7 days), Village Fair (every 28 days), rare boat guests, Gold Collection, co-op tier 2 |

**Why they are fast.** Past 60 every level costs 62,810 XP. The model assumed about 26k XP a day (2.4 days a level). The late recipes pay up to about 216 XP an hour per workshop (Florist buttonhole, Coffee Roastery espresso). A player who keeps 6+ workshops of several kinds queued round the clock can earn 100k+ XP a day: 2 levels a day. At that pace they reach 180 in about 6 weeks. New content batches take 1-2 weeks to build and add 20 levels, which such a player gets through in about 10 days. **Unlocks tied to levels cannot keep up with the fastest players. Content tied to days, goods and friends can.**

## 2. Steps

### Step 0 (this week, no build): learn about this player
- **Dashboard:**
  - their level-up dates (events);
  - Item history (what they make most);
  - Gems spent;
  - the Needs tab (what they are stuck on).
- **Check for exploits.** Rule out a bug or gift exploit: compare coins and XP against the leaderboard fair-play flags (`lb_flag`).
- **Send them a letter** from the dashboard (`admin_letter_to`). Thank them and ask what they enjoy most and what they wait for. One fast player's answer is the best guide we have.

### Step 1 (1.48.0, game only): XP by source, so we can tune
- **A daily event `xp_day`:** XP earned that day split by source, once a day, signed-in players only:
  - crops;
  - workshops;
  - animals;
  - orders and truck;
  - Master, boats and festivals (late XP);
  - other.
- **Dashboard:** a small chart of it on the player page and across players.
- **Privacy:** game events are already covered by the privacy policy, so no new data type.

### Step 2 (1.48.x, game only): calendar content that cannot be rushed
These suit fast and slow players alike, because the calendar sets the pace, not XP.
- **Four new festivals in the 28-day cycle** (content bank):
  - Lantern Night;
  - Kite Day (on windy weather);
  - Fruit Press Festival;
  - Sheep Shearing Fair.
  - Each one adds to the rotation and has its own prize decor.
  - Nothing ever becomes unavailable: a missed festival comes round again.
- **Village Almanac (from level 100):** one month-long village goal per 28-day cycle. It's a big list (about 3-4 weeks of spare goods for an engaged player) with 4 checkpoints. It pays a decor set piece per cycle (a 12-piece "Almanac" set over a year) and Friendship Tokens. If a cycle's goal is unfinished, it rolls into the next cycle instead of being lost.
- **Weekly design brief (from level 80):** a theme each week ("a picnic corner", "lanterns by the water"). Friends who visit can give one heart per farm a week. It pays charm and a title at 5/20/50 hearts, with no ranking against strangers. It reuses visits and likes (`like_farm`), so there's a small server change.

### Step 3 (1.49, game only): levels 181-200 before they get there
- **Keep the batch pattern:** crops, a workshop, about 12 recipes, 2 decor sets, Farmhouse 21 at 200 (`authoredMax` 200).
- **Ship it when the top player reaches about 165,** so it lands before 180.
- **Slow tracks for spare coins:** from now on, each batch also adds a slow track (an estate stage, a Manor-like wing, a collection) that asks for days and goods, not levels.

### Step 4 (decision for the owner): the late XP curve
Options:
- **A. Leave it.** Fast players level fast; they hit 180 and live on the time-gated tracks. This is cosy and honest, and they get a level-up every few hours.
- **B. A gentle rise again from level 120:** XP to next grows by 1,000 a level (level 180 needs 122,810). An engaged player is barely touched; a 2-a-day player slows to about 1 a day by 180. XP and levels are never taken away (leaderboard rule).
- **C. Late recipe XP no longer grows with the recipe's level from level 120** (cap at about 150 XP an hour). Easier to tune, but players notice a smaller number.

**Recommendation: B, after a week of `xp_day` data shows the real spread.** Show the before and after tables from `simulate-economy` before shipping (owner rule).

### Step 5 (2.x, bigger): long-term homes for the top players
- **Neighbourhoods** (roadmap 2.x): groups of 5-20 friends with a shared weekly goal and emotes, no chat. This gives top players a reason to bring friends in and help them up.
- **The second plot** (hill farm or orchard island): a new build grid, opened by an Estate project at about level 150. It needs its own performance budget (`test:perf`). It's the largest piece of content we could add, and it's what fills a 200+ farm.

## 3. Order and size

| When | What | Size | Server |
| --- | --- | --- | --- |
| This week | Step 0: look at the player, send a letter | an hour | no |
| Next | 1.48.0 `xp_day` + dashboard chart | 1-2 days | small section in schema.sql if a view is wanted |
| Then | 1.48.1 four festivals + Village Almanac | about 1.5 weeks | no |
| Then | 1.48.2 weekly design brief | about 1 week | yes (likes per brief) |
| When the top player is about 165 | 1.49 levels 181-200 | about 1.5 weeks | no |
| After a week of data | XP curve choice (Step 4) | a day + tables | `level_for_xp` in schema.sql must match |
| 2.x | Neighbourhoods, second plot | weeks each | yes |

## 4. Questions for the owner
1. Is a 2-levels-a-day player a problem, or fine as long as there is plenty to do? This decides Step 4.
2. Shall I draft the letter to the player for you to send from the dashboard?
3. Festivals first or the Almanac first?
