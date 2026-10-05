# Credits

Cozy Acres is built on generous free assets from the game-dev community. Every third-party asset below is
licensed **CC0 1.0** (public domain), **MIT**, **Apache-2.0** or **SIL OFL 1.1** - all allow commercial use and
redistribution. Raw packs are downloaded by `scripts/fetch-assets.sh` and processed by `scripts/build-assets.mjs`
(meshopt compression, texture atlases shared across models, mono MP3 audio). Only the files actually used are
shipped in `public/assets`.

## 3D models

| Asset | Author | Source | License | Used for |
| --- | --- | --- | --- | --- |
| KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg | https://kaylousberg.itch.io/kaykit-medieval-hexagon (GitHub: https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | CC0 1.0 | Farmhouse, Feed Mill (windmill), Bakery (oven), Dairy, Sugar Mill (watermill), Loom (mill), Jam Kitchen, Roadside Stall (market), Well, Chapel, Lookout Tower, construction stages, scaffolding, trees and rocks (obstacles), crates, sacks, barrels, wheelbarrow, pallets, fences, clouds, water plants |
| KayKit City Builder Bits 1.0 | Kay Lousberg | https://kaylousberg.itch.io/city-builder-bits (GitHub: https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0) | CC0 1.0 | Benches, street lamps, potted bushes, water tower (silo) |
| Nature Kit | Kenney | https://kenney.nl/assets/nature-kit (GLB mirror: https://github.com/Hidencod/tge-assets) | CC0 1.0 | Crops and growth stages, trees (incl. autumn variants), bushes, flowers, mushrooms, stumps, logs, rocks, statues, stone paths, fences, pots, campfire, sign |
| Cube Pets | Kenney | https://kenney.nl/assets/cube-pets (GLB mirror: https://github.com/Hidencod/tge-assets) | CC0 1.0 | Chickens, cows, pigs, sheep (recoloured polar bear), goats (recoloured deer), companion pets (dog, cat, bunny, fox, penguin, panda), bees |
| Mini Characters | Kenney | https://kenney.nl/assets/mini-characters (GLB mirror: https://github.com/Hidencod/tge-assets) | CC0 1.0 | Player character (recoloured in the character creator), villagers, travelling merchant |
| Food Kit | Kenney | https://kenney.nl/assets/food-kit (GLB mirror: https://github.com/Hidencod/tge-assets) | CC0 1.0 | Produce on crops and fruit trees, products on display, harvest pop-ups, item thumbnails |
| Car Kit | Kenney | https://kenney.nl/assets/car-kit (GLB mirror: https://github.com/Hidencod/tge-assets) | CC0 1.0 | Delivery truck, tractor, van |
| Fantasy Town Kit | Kenney | https://kenney.nl/assets/fantasy-town-kit (mirror: https://github.com/ETdoFresh/kenney.nl) | CC0 1.0 | Market stalls (order board, merchant), fountains, lanterns, carts, hedges, banners |

## Textures and effects

| Asset | Author | Source | License | Used for |
| --- | --- | --- | --- | --- |
| Particle Pack 1.1 | Kenney | https://kenney.nl/assets/particle-pack (mirror: https://github.com/ETdoFresh/kenney.nl) | CC0 1.0 | Sparkles, stars, dust and smoke particles |
| Palette atlases | Kay Lousberg / Kenney | (embedded in the packs above) | CC0 1.0 | Shared colour atlases, one per pack |

## Icons and fonts

| Asset | Author | Source | License | Used for |
| --- | --- | --- | --- | --- |
| Fluent Emoji (Flat) | Microsoft | https://github.com/microsoft/fluentui-emoji (via `@iconify-json/fluent-emoji-flat`) | MIT | Item, currency and UI icons |
| Lilita One | Juan Montoreano | https://fonts.google.com/specimen/Lilita+One (via `@fontsource/lilita-one`) | SIL OFL 1.1 | Headings, buttons, outlined numbers |
| Fredoka | Milena Brandao, Hafontia | https://fonts.google.com/specimen/Fredoka (via `@fontsource/fredoka`) | SIL OFL 1.1 | Body text |

## Audio

| Asset | Author | Source | License | Used for |
| --- | --- | --- | --- | --- |
| Interface Sounds | Kenney | https://kenney.nl/assets/interface-sounds | CC0 1.0 | Taps, panel open/close, errors, harvest plucks, gems, quest complete |
| RPG Audio | Kenney | https://kenney.nl/assets/rpg-audio | CC0 1.0 | Coins, chopping, doors, page flips |
| Impact Sounds | Kenney | https://kenney.nl/assets/impact-sounds | CC0 1.0 | Planting, building, rock breaking |
| Casino Audio | Kenney | https://kenney.nl/assets/casino-audio | CC0 1.0 | Coin counter ticks |
| Music Jingles | Kenney | https://kenney.nl/assets/music-jingles | CC0 1.0 | Level up, achievements, truck delivery |
| uisfx sound library | Romain Simon | https://github.com/romainsimon/uisfx (npm `uisfx`) | CC0 1.0 (audio) | Purchases, rewards, unlocks, bonuses, button presses, snaps |
| Cow / chicken / pig / sheep sounds | DJ WoodZ (derived from freesound.org recordings by josephsardin, Rudmer_Rotteveel, JarredGibb, sandeepkurissery) | https://github.com/DJWoodZ/Animal-Sounds | CC0 1.0 | Animal sounds. Goat = sheep recording pitched up (our derivative, CC0) |
| "Barnville" | FreePD (Kevin MacLeod) | https://freepd.com (mirror: https://github.com/SoundSafari/CC0-1.0-Music) | CC0 1.0 | Daytime music |
| "Happy Whistling Ukulele" | FreePD | https://freepd.com (mirror: https://github.com/SoundSafari/CC0-1.0-Music) | CC0 1.0 | Daytime music |
| "Spring Chicken" | FreePD | https://freepd.com (mirror: https://github.com/SoundSafari/CC0-1.0-Music) | CC0 1.0 | Daytime music |
| "Magic in the Garden" | FreePD | https://freepd.com (mirror: https://github.com/SoundSafari/CC0-1.0-Music) | CC0 1.0 | Evening music |

## Procedurally generated (fallbacks, made in code for this project)

These were built from Three.js primitives in the same low-poly style and palette because no fitting CC0 model
was available after searching Kenney, KayKit, Quaternius, Poly Pizza and OpenGameArt mirrors reachable from the
build environment:

- Barn, silo roof, chicken coop, animal shelters, pen fencing posts, order board, truck depot, plot soil, scarecrow,
  hay bales, flower beds, cotton bolls, jam jar sign, seasonal decorations (jack-o'-lanterns, scarecrows, lights)
- Player hats and accessories (straw hat, cap, beanie, flower crown, crown, witch hat, etc.)
- Terrain, water, sky and cloud shading
- Wool tufts and face plates that turn the polar-bear cube pet into a sheep
- Ambient bird and butterfly sprites

All original code, procedural models and project-specific derivatives are copyright Josh Makes Games, all rights
reserved (see LICENSE).

## Asset sources considered but not used

Quaternius (quaternius.com, poly.pizza), itch.io, OpenGameArt, Sketchfab, freesound.org and Pixabay were searched;
their direct download hosts were not reachable from the build environment, and the GitHub-hosted CC0 mirrors above
covered the needs with a more consistent style (KayKit + Kenney pair well).
