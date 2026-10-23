# Plan: 1.29 "Home Sweet Home" - inside the Farmhouse

**Built (23 Oct 2026), as planned with these owner decisions and changes:** opens at player level 30 (lowered to 15 in 1.30.1); friends
visiting the home and characters inside are left for later; rooms are 4, 5.5 and 7 metres square (Cosy, Roomy,
Grand), 120 pieces a room, saved looks share 600 pieces (cloud save size); 257 pieces (229 in the catalogue, 10
handmade, 18 from villagers at 3, 6 and 9 hearts); the "ceiling" colour is the cornice along the top of the walls.
Balance: `BALANCE.md` "1.29 Home Sweet Home". Code: `src/systems/Home.ts`, `src/world/home/`, `src/scenes/Home.ts`,
`src/ui/home/`.

Owner's brief (23 Oct 2026): go inside the Farmhouse and decorate it. Very in-depth and heavily customisable.
**No score, rating, leaderboard, stats or achievements for the home.** It is purely for the player.

Inspiration: Animal Crossing (rooms that grow, a catalogue you can re-buy from, items on tables and walls, displaying
your own catches), Dreamlight Valley (wallpaper and floors per room, a free camera), The Sims (cutaway walls, colour
swatches on every piece, a fine grid), Stardew Valley (villagers' gifts as furniture).

---

## 1. What the player gets

**Going in.** A "Go inside" button on the Farmhouse screen and a door bubble on the Farmhouse itself. A cloud wipe
and the camera cuts to the home, like the square and the woods. Back (button, browser or Android) goes home again.
The farm keeps running behind it.

**Rooms.** Each Farmhouse level opens a new room. Each room can be made bigger (three sizes) with coins and planks.
The player names each room and decides what it is for: no fixed room types.

| Farmhouse level | New room (default name, can be renamed) |
| --- | --- |
| 1 | Living room |
| 2 | Kitchen |
| 3 | Bedroom |
| 5 | Bathroom |
| 7 | Study |
| 9 | Attic (sloped ceiling) |
| 11 | Cellar (stone walls, no windows) |
| 13 | Sunroom (glass walls, the farm outside) |
| 15 | Upstairs landing (a staircase prop links the floors) |

Room sizes: small 6x6, medium 8x8, large 10x10 tiles. Players switch rooms from a house map strip at the bottom.

**Placing things** (a finer grid than the farm: half tiles).
- Floor pieces: sofas, beds, tables, cabinets, plants. Drag to move, rotate in 90 degree steps, fine nudge.
- On top of things: lamps, books, plants, vases, plates and radios go on tables, shelves, counters and desks.
  Each surface piece has spots.
- On walls: pictures, shelves, clocks, wall lamps, mirrors and windows. They snap to a wall at a chosen height.
- Under things: rugs layer under furniture, and two rugs can overlap.
- On the ceiling: fans and hanging lights.

**Changing every look.**
- **Walls:** about 14 patterns (plain plaster, stripes, pinstripes, gingham, polka dot, florals, damask, wood
  panelling, brick, stone, tiles, beadboard, log cabin, chalkboard). Each takes two colours from a 32-colour palette.
- **Each wall separately**, or all at once.
- **Lower-half panelling** (wainscot) with its own pattern and colour, plus skirting and trim colours.
- **Floors:** about 12 patterns (planks, wide boards, herringbone, parquet, checker tiles, hex tiles, terracotta,
  flagstone, carpet, rag rug, straw, painted boards), each with two colours.
- **Ceiling:** colour, exposed beams on or off, beam colour.
- **Windows and curtains:** window style, curtain style (none, short, long, tie-back) and curtain colour. Windows
  show the real sky (day, sunset, night, rain from the game's weather).
- **Every piece of furniture keeps its own colours:**
  - Kenney pieces have named parts (frame, cushion, fabric, metal), and each part takes any palette colour.
  - KayKit pieces get wood finishes (natural, honey, walnut, painted white, painted colour).
- **Lights:** each lamp switches on or off with a tap and has a warm, neutral or cool glow. Rooms follow the farm's
  time of day, so lamps matter at night.
- **Tools:**
  - **copy style:** tap one piece, then another, and the colours copy across;
  - **duplicate;**
  - **undo and redo** (the last 30 steps);
  - **move everything** (shift a room's layout by a tile);
  - **clear room** (everything to home storage).
- **Saved looks:** three layout slots per room ("Cosy winter", "Party"...). A look holds the furniture, walls and
  floor, and pieces that are missing come out of storage.
- **Show off your farm:**
  - any Wildlife Album photo can hang in a frame;
  - any crop, fish, forage or Museum find you own can sit on a shelf or table as a display, using the game's existing
    models;
  - mounted fish plaques for caught fish.
- **Photo mode** (already in the game) works inside.

**Getting furniture.** Nothing is ever taken away and nothing disappears on a schedule.
- **The Furniture Catalogue** at the Carpenter's Workshop. Everything is always on sale for coins. Six pieces a day
  are 25% off, but that is a discount only, and everything stays buyable.
- **Once bought, a piece is in your catalogue for good:** buy more copies at any time (Animal Crossing style).
- **Crafted furniture** at the Carpenter: rustic pieces made from planks, woods forage and creek finds, so those
  items get another use.
- **Villager sets:** each of the six villagers sends a furniture set over their hearts (Rosa's country kitchen,
  Bram's workshop corner, Juniper's reading nook, Pip's play corner, Hazel's tea table, Old Tom's fisherman's den).
- **Home storage:** separate from the barn, with no limit.
- **Starter pieces:** a bed, a table, two chairs, a rug and a lamp.

**Not in it:** no happy-home score, no charm or XP from decorating, no leaderboard, no achievements. Decorating
never changes the economy, apart from the coins spent.

## 2. Furniture content (all CC0, credited in CREDITS.md)

| Pack | Pieces | Notes |
| --- | --- | --- |
| Kenney Furniture Kit | about 110 of 141 | Living, bedroom, bathroom, kitchen, lights, rugs, plants, stairs. Recolourable by part. Skip computers, laptops and modern TVs (keep the vintage TV and radio) |
| KayKit Furniture Bits | 53 | Beds, couches, shelves, picture frames, pillows, cacti. Wood finishes |
| KayKit Restaurant Bits | about 40 | Kitchen counters, sinks, stoves, pots, jars, plates, kitchen tables |
| Procedural (code) | about 20 | Curtains, fireplace, bookshelves of the player's colours, wall clock with real hands, mounted fish plaque, photo frames, display stand, window seat, beams |

That's about 220 pieces at launch, grouped into sets (Country, Cottage, Lodge, Seaside, Modern Farmhouse, Kitchen,
Bathroom, Garden Room, Villager sets). About 3 MB of models, loaded the first time you go inside, never at boot.

## 3. How it is built

- **Data** (`src/data/`):
  - `home.json`: rooms, unlock levels, sizes and the costs to enlarge;
  - `furniture.json`: id, model, name, set, kind (floor, surface, wall, rug, ceiling), footprint, surface spots,
    colour parts, price and source;
  - `homestyle.json`: wall and floor patterns and the palette.
  - `validate-data` checks every piece has a model, an icon, a price or a source, and that the sets are complete.
- **State:** a new optional `state.home`, repaired in `withDefaults`. Old saves start with the Living room and the
  starter pieces:
  - `rooms[]`: name, size, walls, wainscot, floor, ceiling, curtains, items and three looks;
  - each item: `{ uid, f, x, z, rot, wall?, on?, colours }`, with `on` holding the uid of the surface it stands on;
  - `storage` and `known`, the catalogue.
- **Systems:** `src/systems/Home.ts` (rooms, placing rules, surfaces, storage, catalogue, looks, undo) and
  `src/systems/HomeStyle.ts` (patterns).
- **3D:**
  - `src/world/HomeView.ts`: room shell; walls from canvas-drawn pattern textures, cached per pattern and colour
    pair; windows with the live sky.
  - **Cutaway:** the two walls facing the camera drop to a low edge, as in The Sims.
  - Lights are a small pool of point lights: only the 4 nearest lamps that are switched on light the room, and the
    rest glow without casting light. This keeps phones fast.
  - The room sits off the farm's map in the same 3D scene (like the square), and its pieces are batched through the
    existing `BatchPool`.
- **Scene:** `src/scenes/Home.ts` handles going in and out, the camera (orbit and zoom within the room), the tap
  handler and the edit mode.
- **Screens:**
  - `HomePanel` (catalogue, storage, rooms);
  - the paint tool (walls, floor, ceiling, curtains);
  - a piece toolbar (rotate, colour, copy style, duplicate, store, light on or off, display picker);
  - the house map strip.
- **Limits:** 150 pieces per room. A new `test:perf` case fills a large room and must stay inside the draw-call
  budget.
- **Tests (regression):**
  - an old save opens the home with the starter set;
  - placing, stacking on a surface, a wall piece and rotation all survive a reload;
  - wall and floor colours survive a reload;
  - a look saves and restores;
  - storing a table also stores what stands on it;
  - nothing is lost when a room is enlarged;
  - the home never adds XP or charm.
- **Checks:** a phone sweep of the new screens and screenshots on Low, Medium and High.
- **Server:** none in 1.29. Friends visiting your home would mean adding the home to the shared farm snapshot (a
  `schema.sql` change), so it is planned for 1.30.

## 4. Order of work

1. **Assets:** fetch and build the Kenney Furniture Kit, the rest of KayKit Furniture and the Restaurant pieces;
   make icons; update CREDITS.md.
2. **One room:** data, state, the room shell, placing, moving, rotating, storage, going in and out.
3. **Customising:** walls, wainscot, floors, ceiling, curtains, furniture colours, lights, copy style, undo.
4. Surfaces, wall pieces and rugs; displays of farm items and photos.
5. All nine rooms, room sizes, the house map, saved looks.
6. The catalogue, crafted furniture, villager sets.
7. Tests, the perf budget, the phone sweep, screenshots, changelog, CLAUDE.md and BALANCE.md (furniture prices).

About 2-3 weeks of work. Each step is committed on its own so it can be reviewed, and nothing is pushed without
"yes push".

## 5. Later (1.30 ideas)

- Friends can visit your home (needs a server change).
- Your character and pet move around inside; sit on chairs, sleep in the bed.
- A second floor with real stairs.
- Seasonal decor as cosmetics only, never time-limited.
