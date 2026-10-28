# Plan 1.34: The Fishing Net (built in 1.34.0, 29 Oct)

Owner's picks (29 Oct): the economy lever is a keep limit, setting the net costs bait, released fish give nothing back,
the net fills over 8 hours.

## How it plays

- A net hangs off the fishing dock (two posts, floats, a sagging net). Tap it on the farm or use a "Net" button on the
  fishing screen.
- **Set the net:** costs bait (3 Worm Bait = 15 coins). The fish then arrive one at a time, evenly spread up to the
  fill time. You can see "3 of 8 fish, full in 4h 50m".
- **Haul it:** any time. Early hauls just have fewer fish. A full net stops filling; nothing rots or escapes.
- **Pick through it:** every fish in the net is shown as a card. Tap the ones to keep, up to the keep limit. The most
  valuable fish and any your orders need are picked for you to start with. "Keep these" puts them in the barn and the
  rest swim away (nothing given back). Then the net is empty and can be set again.

## Net levels (from the Fishing skill, automatic)

| Net | Fishing skill | Holds | Keep | Full in | Rare chance per fish |
| --- | --- | --- | --- | --- | --- |
| Old Net | 3 | 4 | 2 | 6 h | 0 |
| Mended Net | 5 | 6 | 3 | 7 h | 0 |
| Sturdy Net | 7 | 8 | 4 | 8 h | 2% |
| Master Net | 10 | 10 | 5 | 8 h | 4% |

The net levels up the next time it is set after the skill goes up.

## What keeps the rod worth using

- **Only fish you have already caught with the rod** can swim into the net, so discovery stays with the rod.
- **Dock fish only**, common and uncommon (rare only from the Sturdy Net, at 2-4%). No legendary or mythic, no Pier
  fish, no "extra" kinds.
- **No stars:** net fish are always plain (no silver or gold), so the barn's star prices stay a rod thing.
- **No records, no Collection Book entries, no XP** (player or Fishing skill). Net fish do not count as `fish_caught`
  (Master challenges, achievements, the Fishing Derby); they have their own stat `net_fish`.
- **Keep limit:** at most 5 fish a haul. With about two hauls a day that is 10 fish, the same as the 5 free casts and a
  little bait. The net saves time; it does not make more fish.
- Kept fish are ordinary items: they can go to orders, the truck, cooking or the barn.

Balance: commons sell 8-24, uncommons 26-62, so a Master Net is worth about 250-300 coins a day after its 30 coins of
bait. That is small next to the rest of the late-game economy. I'll check it with `simulate-economy` and write the
numbers into `BALANCE.md`.

Note: the time-of-day idea from the first draft is dropped. Fish times run on the 24-minute game clock, so 8 real hours
cover every time many times over. The net draws from every dock fish you could catch, weighted by how much of the day
each one bites.

## Building it

- **Data:** `fish.json` gets a `net` block (bait cost, the four tiers above, rare chance).
- **Rules:** `src/systems/FishNet.ts`. State `fishing.net` {setAt, tier} (optional, repaired in `Save.ts`). Arrivals
  are seeded from the farm seed and `setAt`, so the haul is the same on every device and cannot be re-rolled by
  reopening.
- **Screen:** `src/ui/panels/FishNetPanel.ts` (ui `net`). Set, fill progress, the pick screen.
- **3D:** a net and posts at the dock (`world/FishNet.ts`, procedural), floats bob more as it fills, tap opens the panel.
- **Hints:** a small "Your net is full" badge on the fishing shortcut. A phone notification can come later with the
  other app notifications.
- **Logs:** `logEvent('net_haul', { kept, caught, tier })` for the dashboard.
- **Tests:** a regression check that the haul is fixed by its seed, the keep limit holds, and net fish give no XP or
  records. `validate-data`, `simulate-economy`, the phone sweep for the new screen.
- **Version:** 1.34.0, game only (no server change). Android players get it in the next app build.

## Decided

Name "Fishing Net"; unlocks at Fishing skill 3. Built without bycatch. The net is drawn in code (`world/DockNet.ts`), not a model file.
