// Icon variants built from Fluent Emoji bodies: recoloured copies (hue shift) and simple
// compositions (a small badge emoji in the corner of a base emoji). Used by build-assets.mjs and
// handy to run on its own: `node scripts/icon-variants.mjs` writes just these icons and adds them
// to public/assets/manifest.json without rebuilding every asset.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** New base icons for fishing (key -> Fluent Emoji name). Also listed in build-assets ICONS. */
export const FISHING_ICONS = {
  fish: 'fish', tropical_fish: 'tropical-fish', blowfish: 'blowfish', crab: 'crab', shrimp: 'shrimp', octopus: 'octopus',
  squid: 'squid', lobster: 'lobster', jellyfish: 'jellyfish', shark: 'shark', fishing_pole: 'fishing-pole', worm: 'worm',
  boot: 'hiking-boot', fish_cake: 'fish-cake-with-swirl', curry: 'curry-rice', water_wave: 'water-wave', bottle: 'bottle-with-popping-cork',
  oyster: 'oyster', sushi: 'sushi',
  // 1.8.5 the Pier: sea creatures with a picture of their own
  seal: 'seal', dolphin: 'dolphin', whale: 'spouting-whale',
  // 1.8.5 the Village Kitchen dishes
  pizza: 'pizza', spaghetti: 'spaghetti', dumpling: 'dumpling', bento: 'bento-box', fondue: 'fondue',
  stuffed_flatbread: 'stuffed-flatbread', roast: 'poultry-leg', taco: 'taco',
  // the Beehive house
  honey_pot: 'honey-pot', candle: 'candle', honeybee: 'honeybee',
  // Ducks
  duck: 'duck',
  // the Juice Press
  juice_box: 'beverage-box', juice_cup: 'cup-with-straw',
  // Blueberries
  blueberry: 'blueberries',
  // Pottery Kiln
  flower_pot: 'potted-plant', clay: 'brick',
  // Horses
  horse: 'horse',
  // Peas and lavender
  pea: 'pea-pod', lavender: 'hyacinth',
};

/**
 * Variants: `hue` rotates every colour of `base` by that many degrees (with optional saturation/lightness
 * scale); `flip` mirrors it left-right; `badge` draws another emoji small in the bottom-right corner.
 */
export const ICON_VARIANTS = {
  fish_green: { base: 'fish', hue: -70, sat: 0.85 },
  fish_pink: { base: 'fish', hue: 168, sat: 0.8, light: 1.18 },
  fish_gold: { base: 'fish', hue: -155, sat: 1.1, light: 1.1 },
  seaweed: { base: 'herb', hue: 35, sat: 0.8, light: 0.85 },
  fish_pie: { base: 'pie', badge: 'fish' },
  // more fish species (u6): a recolour, a mirror (`flip`) or a corner badge keeps every silhouette distinct
  sea_snail: { base: 'snail', hue: 150, sat: 0.9 },
  fish_blue: { base: 'fish', hue: 62, sat: 0.95, light: 1.05, flip: true },
  hermit_crab: { base: 'spiral-shell', badge: 'crab' },
  rainbow_trout: { base: 'fish', hue: -42, sat: 0.6, light: 1.05, badge: 'rainbow' },
  snapper: { base: 'tropical-fish', hue: -40, sat: 1.1, flip: true },
  sea_turtle: { base: 'turtle', hue: 45, sat: 0.95 },
  lantern_fish: { base: 'fish', hue: 25, sat: 0.9, light: 0.62, badge: 'red-paper-lantern' },
  coral_grouper: { base: 'tropical-fish', hue: 150, sat: 1.05, badge: 'coral' },
  moon_koi: { base: 'fish', hue: 0, sat: 0.2, light: 1.3, flip: true, badge: 'crescent-moon' },
  ghost_ray: { base: 'ghost', badge: 'water-wave' },
  coelacanth: { base: 'fish', hue: 190, sat: 0.45, light: 0.72, badge: 'hourglass-done' },
  betta_crown: { base: 'tropical-fish', hue: 110, sat: 1.1, badge: 'crown' },
  sea_dragon: { base: 'dragon', hue: 55, sat: 0.95, light: 1.05 },
  kraken: { base: 'octopus', hue: -95, sat: 1.05, light: 0.85, badge: 'sparkles' },
  celestial_koi: { base: 'fish', hue: 125, sat: 0.9, light: 1.42, flip: true, badge: 'glowing-star' },
  oyster_chowder: { base: 'pot-of-food', badge: 'oyster' },
  // 1.8: Rosa's berry tart (her 6-heart recipe)
  berry_tart: { base: 'pie', badge: 'strawberry' },
  // 1.8.5 Old Tom's Pier: the second fishing spot
  anchovy: { base: 'fish', hue: -110, sat: 0.55, light: 0.85 },
  flounder: { base: 'fish', hue: 40, sat: 0.55, light: 0.8, flip: true },
  sea_bass: { base: 'fish', hue: 195, sat: 0.8, light: 0.85, flip: true },
  spider_crab: { base: 'crab', hue: -25, sat: 0.9, light: 0.95 },
  tuna: { base: 'fish', hue: 225, sat: 1.1, light: 0.7 },
  golden_crab: { base: 'crab', hue: 45, sat: 1.2, light: 1.15, badge: 'sparkles' },
  // 1.9 Lucky Bait (a golden worm)
  lucky_bait: { base: 'worm', hue: 40, sat: 1.4, light: 1.2, badge: 'sparkles' },
  // 1.9 extra fish
  smelt: { base: 'fish', hue: 60, sat: 0.5, light: 1.15 },
  blossom_carp: { base: 'fish', hue: -35, sat: 0.9, light: 1.1, flip: true, badge: 'cherry-blossom' },
  sun_bream: { base: 'fish', hue: 25, sat: 1.1, light: 1.1 },
  gold_bream: { base: 'fish', hue: 45, sat: 1.2, light: 1.2, flip: true, badge: 'sun' },
  herring: { base: 'fish', hue: 15, sat: 0.9, light: 0.9, flip: true },
  harvest_perch: { base: 'fish', hue: 28, sat: 1.0, light: 0.95, badge: 'maple-leaf' },
  frost_cod: { base: 'fish', hue: 180, sat: 0.35, light: 1.2, flip: true },
  ice_char: { base: 'fish', hue: 200, sat: 0.9, light: 1.15, badge: 'snowflake' },
  tulip_wrasse: { base: 'fish', hue: -60, sat: 0.8, light: 1.1 },
  blossom_snapper: { base: 'tropical_fish', hue: -30, sat: 0.8, light: 1.1, flip: true, badge: 'cherry-blossom' },
  sun_mullet: { base: 'fish', hue: 30, sat: 1.0, light: 1.1, flip: true },
  rainbow_dorado: { base: 'fish', hue: 150, sat: 1.2, light: 1.1, badge: 'rainbow' },
  maple_flounder: { base: 'fish', hue: 20, sat: 0.9, light: 0.85, flip: true },
  amber_trout: { base: 'fish', hue: 25, sat: 1.0, light: 0.9, badge: 'maple-leaf' },
  pearl_herring: { base: 'fish', hue: 190, sat: 0.3, light: 1.25 },
  frost_halibut: { base: 'fish', hue: 205, sat: 0.8, light: 1.1, flip: true, badge: 'snowflake' },
  // 1.9 the Wild Woods: forage, minerals, fossils and artifacts
  wild_leek: { base: 'leafy-green', hue: 20, sat: 0.9 },
  dandelion: { base: 'blossom', hue: 60, sat: 1.3, light: 1.1 },
  daffodil: { base: 'tulip', hue: 55, sat: 1.2, light: 1.2 },
  raspberry: { base: 'cherries', hue: 5, sat: 0.9, light: 1.2 },
  wild_rose: { base: 'hibiscus', hue: 15, sat: 0.9, light: 1.15 },
  fern_frond: { base: 'herb', hue: -10, sat: 1.1, light: 0.9 },
  chanterelle: { base: 'mushroom', hue: 25, sat: 1.0, light: 1.25 },
  hazelnut: { base: 'chestnut', hue: 10, sat: 0.8, light: 1.2 },
  blackberry: { base: 'blueberries', hue: 55, sat: 0.7, light: 0.55 },
  winter_root: { base: 'garlic', hue: 25, sat: 0.8, light: 0.9 },
  holly: { base: 'herb', hue: -15, sat: 1.0, light: 0.7, badge: 'cherries' },
  snow_yam: { base: 'ginger-root', hue: 200, sat: 0.4, light: 1.1 },
  copper_ore: { base: 'rock', hue: 30, sat: 1.8, light: 1.0 },
  iron_ore: { base: 'rock', hue: 210, sat: 0.5, light: 0.8 },
  quartz: { base: 'gem-stone', hue: 0, sat: 0.12, light: 1.5 },
  topaz: { base: 'gem-stone', hue: 130, sat: 1.3, light: 1.15 },
  amethyst: { base: 'gem-stone', hue: 70, sat: 1.1, light: 0.95 },
  ammonite: { base: 'spiral-shell', sat: 0.4, light: 0.85 },
  fossil_fern: { base: 'fallen-leaf', sat: 0.3, light: 0.75 },
  fossil_bone: { base: 'bone', sat: 0.6, light: 0.85 },
  amber: { base: 'gem-stone', hue: 165, sat: 1.4, light: 1.2 },
  old_coin: { base: 'coin', sat: 0.7, light: 0.85, badge: 'sparkles' },
  rusty_key: { base: 'old-key', sat: 0.6, light: 0.8 },
  ancient_bell: { base: 'bell', sat: 0.6, light: 0.85 },
  scroll_fragment: { base: 'scroll', sat: 0.7, light: 0.9 },
  clay_figure: { base: 'teddy-bear', hue: 5, sat: 0.7, light: 0.9 },
  amphora: { base: 'amphora' },
  silver_mirror: { base: 'mirror' },
  old_compass: { base: 'compass', sat: 0.8, light: 0.9 },
  lost_crown: { base: 'crown', sat: 0.8, light: 0.9, badge: 'sparkles' },
  // 1.19 the Deep Woods: Mossy Hollow, Crystal Creek and Whispering Pines
  moss: { base: 'herb', hue: -30, sat: 0.9, light: 0.8 },
  bluebell: { base: 'tulip', hue: -150, sat: 0.9, light: 1.15 },
  puffball: { base: 'mushroom', sat: 0.15, light: 1.45 },
  wild_garlic: { base: 'garlic', hue: -40, sat: 0.6, light: 1.05, badge: 'herb' },
  elderberry: { base: 'blueberries', hue: 40, sat: 0.6, light: 0.5 },
  morel: { base: 'mushroom', hue: 25, sat: 0.5, light: 0.75, badge: 'sparkles' },
  watercress: { base: 'leafy-green', hue: -25, sat: 1.1, light: 1.2 },
  river_mint: { base: 'herb', hue: 25, sat: 1.0, light: 1.3 },
  cattail: { base: 'ear-of-corn', hue: 20, sat: 0.6, light: 0.6 },
  water_lily: { base: 'lotus' },
  wild_strawberry: { base: 'strawberry', light: 1.1, flip: true },
  pinecone: { base: 'chestnut', hue: -8, sat: 0.6, light: 0.7, flip: true },
  chestnut: { base: 'chestnut' },
  lingonberry: { base: 'cherries', hue: -8, sat: 1.0, light: 0.9 },
  pine_bolete: { base: 'mushroom', hue: 30, sat: 0.7, light: 0.85, flip: true },
  sloe: { base: 'blueberries', hue: 15, sat: 0.5, light: 0.75 },
  firefly: { base: 'lady-beetle', hue: 60, sat: 1.1, light: 1.1, badge: 'sparkles' },
  maple_sap: { base: 'honey-pot', hue: -15, sat: 0.8, light: 0.85, badge: 'maple-leaf' },
  pine_resin: { base: 'honey-pot', hue: 15, sat: 1.0, light: 1.0, badge: 'evergreen-tree' },
  gold_flake: { base: 'rock', hue: 45, sat: 2.0, light: 1.35, badge: 'sparkles' },
  agate: { base: 'gem-stone', hue: -150, sat: 0.9, light: 1.0 },
  jade: { base: 'gem-stone', hue: -70, sat: 0.8, light: 1.05 },
  river_pearl: { base: 'oyster', hue: 190, sat: 0.4, light: 1.25, badge: 'sparkles' },
  // 1.20 Woodland Friends: the critters, their gifts and Wren the ranger
  deer: { base: 'deer' },
  fox: { base: 'fox' },
  hedgehog: { base: 'hedgehog' },
  squirrel: { base: 'chipmunk', hue: -12, sat: 1.2 },
  owl: { base: 'owl' },
  paw_prints: { base: 'paw-prints', hue: -20, sat: 0.6, light: 0.8 },
  wren: { base: 'bird', hue: 25, sat: 0.6, light: 0.85 },
  field_notes: { base: 'spiral-notepad', badge: 'herb' },
  four_leaf_clover: { base: 'four-leaf-clover' },
  snail_shell: { base: 'spiral-shell', hue: 25, sat: 0.9, light: 0.9 },
  golden_acorn: { base: 'chestnut', hue: 18, sat: 1.6, light: 1.35, badge: 'sparkles' },
  shed_antler: { base: 'bone', hue: 30, sat: 0.6, light: 0.8, badge: 'deer' },
  silver_spoon: { base: 'spoon', sat: 0.3, light: 1.1, badge: 'sparkles' },
  owl_feather: { base: 'feather', hue: 25, sat: 0.7, light: 0.8 },
  // 1.23 The Ancient Grove
  oak: { base: 'deciduous-tree', hue: -10, sat: 1.1, light: 0.85 },
  acorn: { base: 'chestnut', hue: 28, sat: 0.75, light: 0.9, flip: true },
  moonflower: { base: 'hibiscus', hue: 190, sat: 0.25, light: 1.45 },
  acorn_bread: { base: 'bread', hue: -12, sat: 0.8, light: 0.8, badge: 'chestnut' },
  moonflower_tea: { base: 'teacup-without-handle', hue: 170, sat: 0.6, light: 1.1, badge: 'hibiscus' },
  // 1.22 Orchard Days: crops, fruit and dishes for levels 101-120 (peach.svg already exists)
  rice: { base: 'sheaf-of-rice' },
  garlic: { base: 'garlic' },
  sweet_potato: { base: 'roasted-sweet-potato', sat: 1.1 },
  cranberry: { base: 'cherries', hue: -15, sat: 1.3, light: 0.8, flip: true },
  plum: { base: 'cherries', hue: -80, sat: 0.8, light: 0.75 },
  olive: { base: 'olive' },
  rice_pudding: { base: 'custard', badge: 'sheaf-of-rice' },
  garlic_bread: { base: 'baguette-bread', hue: -20, sat: 0.8, badge: 'garlic' },
  plum_jam: { base: 'honey-pot', hue: -110, sat: 0.9, light: 0.7, badge: 'cherries' },
  sweet_potato_pie: { base: 'pie', hue: -15, sat: 1.1, badge: 'roasted-sweet-potato' },
  peach_cobbler: { base: 'pie', hue: 10, sat: 1.1, light: 1.1, badge: 'peach' },
  olive_oil: { base: 'bottle-with-popping-cork', hue: 40, sat: 0.9, badge: 'olive' },
  cranberry_sauce: { base: 'honey-pot', hue: -40, sat: 1.3, light: 0.75, badge: 'cherries' },
  risotto: { base: 'curry-rice', hue: 40, sat: 0.5, light: 1.1, badge: 'mushroom' },
  fried_rice: { base: 'cooked-rice', badge: 'egg' },
  olive_focaccia: { base: 'flatbread', badge: 'olive' },
  peach_sorbet: { base: 'shaved-ice', hue: 20, badge: 'peach' },
  plum_cake: { base: 'shortcake', hue: -100, sat: 0.8, badge: 'cherries' },
  // 1.21 Woodcraft: the Woodcraft Lodge's goods
  elderberry_cordial: { base: 'cup-with-straw', hue: -100, sat: 0.7, light: 0.7, badge: 'blueberries' },
  hazelnut_brittle: { base: 'chocolate-bar', hue: 20, sat: 1.1, light: 1.2, badge: 'chestnut' },
  herbal_salve: { base: 'lotion-bottle', hue: -60, badge: 'herb' },
  mushroom_tea: { base: 'teacup-without-handle', hue: 20, sat: 0.8, badge: 'mushroom' },
  bramble_crumble: { base: 'pie', hue: -60, sat: 0.9, light: 0.85, badge: 'blueberries' },
  holly_wreath: { base: 'christmas-tree', hue: 0, sat: 0.9, light: 0.95, badge: 'rosette' },
  forest_tea: { base: 'hot-beverage', hue: -40, badge: 'herb' },
  chestnut_bread: { base: 'bread', hue: -10, sat: 0.8, light: 0.8, badge: 'chestnut' },
  pinecone_wreath: { base: 'christmas-tree', hue: 40, sat: 0.6, light: 0.75, badge: 'evergreen-tree' },
  resin_varnish: { base: 'honey-pot', hue: 10, sat: 0.6, light: 0.55, badge: 'droplet' },
  maple_candy: { base: 'lollipop', hue: -160, sat: 0.9, badge: 'maple-leaf' },
  woodland_feast: { base: 'bento-box', hue: -40, sat: 0.8, badge: 'mushroom' },
  // 1.20 every item has a use: new dishes and crafts for fish, woods forage and creek finds
  snapper_grill: { base: 'tropical-fish', hue: -40, sat: 1.1, badge: 'fire' },
  flounder_fry: { base: 'french-fries', badge: 'fish' },
  crab_cakes: { base: 'pancakes', hue: -20, badge: 'crab' },
  grilled_tuna: { base: 'fish', hue: -10, sat: 0.6, light: 0.7, badge: 'fire' },
  sunny_skewers: { base: 'oden', badge: 'sun' },
  blossom_sushi: { base: 'sushi', badge: 'cherry-blossom' },
  harvest_fish_pie: { base: 'pie', hue: 20, badge: 'fallen-leaf' },
  winter_chowder: { base: 'pot-of-food', hue: 180, sat: 0.5, badge: 'snowflake' },
  halibut_supper: { base: 'fork-and-knife-with-plate', badge: 'fish' },
  rainbow_tacos: { base: 'taco', badge: 'rainbow' },
  pickled_herring: { base: 'canned-food', badge: 'fish' },
  sea_bass_herbs: { base: 'fish', hue: 195, sat: 0.8, light: 0.85, badge: 'herb' },
  grouper_curry: { base: 'curry-rice', badge: 'coconut' },
  maple_syrup: { base: 'honey-pot', hue: -30, sat: 1.1, light: 0.6, badge: 'pancakes' },
  maple_flounder_glazed: { base: 'fish', hue: -150, sat: 0.9, light: 0.9, flip: true, badge: 'maple-leaf' },
  pine_candle: { base: 'candle', hue: 80, badge: 'evergreen-tree' },
  firefly_lantern: { base: 'red-paper-lantern', hue: 55, light: 1.15, badge: 'sparkles' },
  wild_garlic_bread: { base: 'baguette-bread', badge: 'garlic' },
  woodland_pie: { base: 'pie', hue: -10, badge: 'mushroom' },
  mint_lemonade: { base: 'cup-with-straw', hue: 70, badge: 'lemon' },
  hedgerow_jam: { base: 'honey-pot', hue: -90, sat: 0.8, light: 0.7, badge: 'cherries' },
  woodland_vase: { base: 'amphora', hue: 180, sat: 0.6, badge: 'hyacinth' },
  rush_basket: { base: 'basket', hue: 20, badge: 'ear-of-corn' },
  gilded_vase: { base: 'amphora', hue: 20, sat: 1.6, light: 1.3, badge: 'sparkles' },
  gem_mosaic: { base: 'brick', hue: 150, sat: 0.8, badge: 'gem-stone' },
  boot_planter: { base: 'hiking-boot', badge: 'sunflower' },
  duck_egg_sponge: { base: 'shortcake', hue: 30, sat: 0.7, badge: 'duck' },
  // 1.10 late crops and new dishes
  leek: { base: 'leafy-green', hue: 12, sat: 0.55, light: 1.3 },
  // 1.11 the Master Farm (levels 51-60)
  giant_pumpkin: { base: 'jack-o-lantern', badge: 'sparkles' },
  muffin: { base: 'cupcake', hue: 28, sat: 0.9 },
  waffle: { base: 'pancakes', hue: 22, sat: 1.1, flip: true },
  mushroom_soup: { base: 'pot-of-food', badge: 'mushroom' },
  watermelon_juice: { base: 'juice_cup', badge: 'watermelon' },
  pumpkin_spice_cake: { base: 'shortcake', badge: 'jack-o-lantern' },
  // 1.13 levels 61-80
  spaghetti_dish: { base: 'spaghetti', badge: 'tomato' },
  apple_crumble: { base: 'pie', badge: 'red-apple' },
  hot_chocolate: { base: 'juice_cup', hue: -15, sat: 0.8, light: 0.75 },
  mushroom_pizza: { base: 'pizza', badge: 'mushroom' },
  berry_cheesecake: { base: 'shortcake', badge: 'blueberries' },
  honey_cake: { base: 'shortcake', badge: 'honey-pot' },
  pumpkin_soup: { base: 'pot-of-food', badge: 'jack-o-lantern' },
  chocolate_cake: { base: 'shortcake', hue: -25, sat: 0.7, light: 0.7 },
  milkshake: { base: 'juice_cup', badge: 'strawberry' },
  harvest_banquet: { base: 'bento', badge: 'sparkles' },
  // 1.14 levels 81-100
  avocado_toast: { base: 'bread', badge: 'avocado' },
  cobb_salad: { base: 'green-salad', badge: 'egg' },
  pineapple_juice: { base: 'beverage-box', hue: 45, badge: 'pineapple' },
  leek_pie: { base: 'pie', hue: 70, badge: 'leafy-green' },
  sunflower_honey: { base: 'honey-pot', hue: 15, sat: 1.2, badge: 'sunflower' },
  // the Beehive house
  blueberry_juice: { base: 'beverage-box', hue: 150, badge: 'blueberries' },
  blueberry_muffin: { base: 'cupcake', badge: 'blueberries' },
  clay_pot: { base: 'potted-plant', hue: 0, badge: 'sparkles' },
  glazed_tile: { base: 'brick', hue: 190, sat: 0.7, light: 1.15, badge: 'sparkles' },
  blue_vase: { base: 'amphora', hue: 200, sat: 1.1 },
  pea_soup: { base: 'pot-of-food', hue: 70, sat: 0.9, badge: 'pea-pod' },
  lavender_honey: { base: 'honey-pot', hue: 255, sat: 0.55, light: 1.1, badge: 'hyacinth' },
  lavender_candle: { base: 'candle', hue: 230, sat: 0.7, badge: 'hyacinth' },
  apple_juice: { base: 'beverage-box', hue: 0, badge: 'red-apple' },
  orange_juice: { base: 'beverage-box', hue: 10, sat: 1.15, badge: 'tangerine' },
  berry_juice: { base: 'beverage-box', hue: -35, badge: 'strawberry' },
  grape_juice: { base: 'beverage-box', hue: 70, badge: 'grapes' },
  duck_egg: { base: 'egg', hue: 140, sat: 0.35, light: 1.04 },
  honeycomb: { base: 'honey-pot', hue: -12, sat: 1.1, light: 1.1, badge: 'honeybee' },
  honey_butter: { base: 'butter', badge: 'honey-pot' },
  beeswax_candle: { base: 'candle', hue: 20, sat: 0.9, light: 1.15, badge: 'sparkles' },
};

function hexToHsl(hex) {
  const n = parseInt(hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.min(1, Math.max(0, s)); l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function iconOf(json, name) {
  let icon = json.icons[name];
  if (!icon && json.aliases?.[name]) icon = json.icons[json.aliases[name].parent];
  return icon;
}

/** SVG text for a variant, or null if a source emoji is missing. */
export function variantSvg(json, v, iconsMap) {
  const W = json.width ?? 16, H = json.height ?? 16;
  const base = iconOf(json, iconsMap[v.base] ?? v.base);
  if (!base) return null;
  const w = base.width ?? W, h = base.height ?? H;
  let body = base.body;
  if (v.hue !== undefined) {
    body = body.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (hex) => {
      const [hh, s, l] = hexToHsl(hex);
      return hslToHex(hh + v.hue, s * (v.sat ?? 1), l * (v.light ?? 1));
    });
  }
  if (v.flip) body = `<g transform="translate(${2 * (base.left ?? 0) + w} 0) scale(-1 1)">${body}</g>`;
  if (v.badge) {
    const b = iconOf(json, iconsMap[v.badge] ?? v.badge);
    if (!b) return null;
    const bw = b.width ?? W, bh = b.height ?? H;
    body += `<svg x="${w * 0.48}" y="${h * 0.48}" width="${w * 0.52}" height="${h * 0.52}" viewBox="${b.left ?? 0} ${b.top ?? 0} ${bw} ${bh}">${b.body}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${base.left ?? 0} ${base.top ?? 0} ${w} ${h}" width="64" height="64">${body}</svg>`;
}

/** Write the variant icons into `dir`; returns {key: 'icons/key.svg'} for the manifest. */
export function writeVariants(json, dir, iconsMap) {
  const out = {};
  for (const [key, v] of Object.entries(ICON_VARIANTS)) {
    const svg = variantSvg(json, v, iconsMap);
    if (!svg) { console.warn('icon variant missing source:', key); continue; }
    fs.writeFileSync(path.join(dir, `${key}.svg`), svg);
    out[key] = `icons/${key}.svg`;
  }
  return out;
}

// stand-alone: write the fishing icons + variants and add them to the manifest
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('../public/assets/', import.meta.url).pathname;
  const dir = path.join(root, 'icons');
  const json = require('@iconify-json/fluent-emoji-flat/icons.json');
  const W = json.width ?? 16, H = json.height ?? 16;
  const added = {};
  for (const [key, name] of Object.entries(FISHING_ICONS)) {
    const icon = iconOf(json, name);
    if (!icon) { console.warn('missing', name); continue; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${icon.width ?? W} ${icon.height ?? H}" width="64" height="64">${icon.body}</svg>`;
    fs.writeFileSync(path.join(dir, `${key}.svg`), svg);
    added[key] = `icons/${key}.svg`;
  }
  Object.assign(added, writeVariants(json, dir, { herb: 'herb', pie: 'pie', ...FISHING_ICONS }));
  const mPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  manifest.icons = { ...manifest.icons, ...added };
  fs.writeFileSync(mPath, JSON.stringify(manifest));
  console.log('icons written:', Object.keys(added).join(', '));
}
