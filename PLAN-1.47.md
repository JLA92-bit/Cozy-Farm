# Plan: 1.47 Colour and Lanterns (drafted 8 Nov 2026)

Status (8 Nov 2026): built as 1.47.0, local, not pushed. Game only, no server change. Follows 1.46 Bean and Spice (`PLAN-1.45.md` section 4).

## What changes

| Area | Change |
| --- | --- |
| Levels | `authoredMax` 160 to 180: every level 161-180 unlocks something. Six decor pieces also go into the thin 131-139 stretch (131, 132, 134, 136, 138, 139) |
| Crops | Indigo (161), Madder (164), Marigold (167), 33-34 h like the other late crops |
| Workshop | Dye Works (162, 300,000 coins, 2x2): dyes, then dyed yarn and cloth |
| Recipes | 13: three dyes, three yarns, three cloths and festival bunting at the Dye Works; patchwork quilt, rainbow scarf and the Grand Tapestry (180) at the Loom |
| Paint colours | Four new decor paints: Indigo, Madder, Marigold (from your first blue, red and gold cloth) and Plum (from your first patchwork quilt). Painted pieces keep their colour in farm visits |
| Decor | 16 pieces in four sets of four, all built in code |
| Uses | New goods on the Craft Fair and Garden boats; each villager likes one or two |

## Decor sets

| Set | Pieces (level) |
| --- | --- |
| Lantern Walk | Paper Lantern String (131), Lantern Arch (132), Lantern Post (163), Lantern Tree (178). All glow at night |
| Cottage Garden | Rose Arbour (134), Bee Skep Stand (136), Herb Spiral (169), Flower Barrow (176) |
| Lighthouse Point | Ship's Anchor (138), Buoy Stack (139), Little Lighthouse (171, glows), Harbour Bollards (179) |
| Village Fete | Fete Bunting (166), Coconut Shy (170), Cake Stall (173), Maypole (175) |

Prices follow the Orchard Days decor (52,000-70,000 at 102-118): about 75,000 at level 131 rising to 130,000 at 179, charm 200-300. Several can be painted (bunting, cake stall awning, flower barrow, lantern post).

## Code

- Data: `crops.json`, `items.json`, `recipes.json`, `buildings.json`, `villagers.json`, `boatvisits.json`, `levels.json`.
- `systems/Decor.ts`: paints get an optional `made` item; `ui/DecorUI.ts` offers them once that item is in the Collection Book (`item:<id>`).
- Models: `world/models/colour.ts` (Dye Works and the 16 decor pieces), crop produce in `ProcModels.ts`.
- Icons from `scripts/icon-variants.mjs`; intro hints in `systems/Hints.ts`.
- Regression check: the Dye Works and sets open at their levels, and a dye paint shows only once its cloth is made.
