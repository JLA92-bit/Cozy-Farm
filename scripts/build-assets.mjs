// Builds public/assets from the raw packs in .asset-cache (run scripts/fetch-assets.sh first).
//  - models: GLB, meshopt-compressed, deduped/pruned; atlas textures stripped out and shared at runtime
//  - textures: one palette atlas per pack, resized to 512px
//  - audio: mono MP3 (SFX 96 kbps, music 64 kbps)
//  - fonts: latin woff2 from @fontsource
//  - icons: Fluent Emoji (flat) SVGs
// Writes public/assets/manifest.json describing everything for the runtime loader.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, reorder, quantize, resample } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { FISHING_ICONS, writeVariants } from './icon-variants.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, '.asset-cache');
const OUT = path.join(ROOT, 'public/assets');
const HEX = path.join(CACHE, 'kaykit-hex/addons/kaykit_medieval_hexagon_pack/Assets/gltf');
const CITY = path.join(CACHE, 'kaykit-city/addons/kaykit_city_builder_bits/Assets/gltf');
const KG = path.join(CACHE, 'kenney-glb/packs');
const KM = path.join(CACHE, 'kenney-mirror');
const FTK = path.join(KM, 'fantasy-town-kit-1.0/Models/GLTF format');

if (!fs.existsSync(CACHE)) {
  console.error('Missing .asset-cache - run scripts/fetch-assets.sh first');
  process.exit(1);
}

function findFile(dir, base) {
  // with ADD_ONLY only the packs of the models being added need to be downloaded
  if (process.env.ADD_ONLY && !fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === base) return p;
    }
  }
  if (process.env.ADD_ONLY) return null;
  throw new Error(`not found: ${base} in ${dir}`);
}

// ---------------------------------------------------------------- model selection
// [id, sourceFile, atlasKey|null, pack]
const hex = (id, name) => [id, findFile(HEX, `${name}.gltf`), 'kaykit-hex', 'KayKit Medieval Hexagon Pack'];
const city = (id, name) => [id, findFile(CITY, `${name}.gltf`), 'kaykit-city', 'KayKit City Builder Bits'];
const nat = (id, name) => [id, path.join(KG, 'nature-kit', `${name}.glb`), null, 'Kenney Nature Kit'];
const pet = (id, name) => [id, path.join(KG, 'cube-pets', `${name}.glb`), 'kenney-pets', 'Kenney Cube Pets'];
const chr = (id, name) => [id, path.join(KG, 'mini-characters', `${name}.glb`), 'kenney-chars', 'Kenney Mini Characters'];
const food = (id, name) => [id, path.join(KG, 'food-kit', `${name}.glb`), 'kenney-food', 'Kenney Food Kit'];
const car = (id, name) => [id, path.join(KG, 'car-kit', `${name}.glb`), 'kenney-car', 'Kenney Car Kit'];
const ftk = (id, name) => [id, path.join(FTK, `${name}.glb`), null, 'Kenney Fantasy Town Kit'];

const MODELS = [
  // buildings
  hex('bld/home_a', 'building_home_A_red'),
  hex('bld/home_b', 'building_home_B_red'),
  hex('bld/tavern', 'building_tavern_blue'),
  hex('bld/windmill', 'building_windmill_yellow'),
  hex('bld/blacksmith', 'building_blacksmith_yellow'),
  hex('bld/watermill', 'building_watermill_green'),
  hex('bld/lumbermill', 'building_lumbermill_blue'),
  hex('bld/home_green', 'building_home_A_green'),
  hex('bld/home_yellow', 'building_home_B_yellow'),
  hex('bld/market', 'building_market_red'),
  hex('bld/well', 'building_well_blue'),
  hex('bld/church', 'building_church_green'),
  hex('bld/tower', 'building_tower_A_yellow'),
  hex('bld/stage_a', 'building_stage_A'),
  hex('bld/stage_b', 'building_stage_B'),
  hex('bld/stage_c', 'building_stage_C'),
  hex('bld/scaffolding', 'building_scaffolding'),
  hex('bld/grain', 'building_grain'),
  // 1.8.5 Village Restoration: the ruined lots of the village square (ADD_ONLY=bld/ruin,bld/dirt adds just these)
  hex('bld/ruin', 'building_destroyed'),
  hex('bld/dirt', 'building_dirt'),
  // the Village Kitchen (a workshop unlocked by rebuilding the Kitchen)
  hex('bld/kitchen', 'building_home_B_blue'),
  // props
  hex('prop/barrel', 'barrel'),
  hex('prop/crate_big', 'crate_A_big'),
  hex('prop/crate_small', 'crate_B_small'),
  hex('prop/crate_open', 'crate_open'),
  hex('prop/sack', 'sack'),
  hex('prop/wheelbarrow', 'wheelbarrow'),
  hex('prop/bucket', 'bucket_water'),
  hex('prop/pallet', 'pallet'),
  hex('prop/lumber', 'resource_lumber'),
  hex('prop/stones', 'resource_stone'),
  hex('prop/tent', 'tent'),
  hex('prop/flag', 'flag_red'),
  hex('prop/fence_wood', 'fence_wood_straight'),
  hex('prop/fence_stone', 'fence_stone_straight'),
  city('prop/bench', 'bench'),
  city('prop/streetlight', 'streetlight'),
  city('prop/watertower', 'watertower'),
  city('prop/bush_pot', 'bush'),
  ftk('prop/stall', 'stall'),
  ftk('prop/stall_green', 'stallGreen'),
  ftk('prop/stall_red', 'stallRed'),
  ftk('prop/stall_bench', 'stallBench'),
  ftk('prop/fountain', 'fountainRoundDetail'),
  ftk('prop/fountain_square', 'fountainSquareDetail'),
  ftk('prop/lantern', 'lantern'),
  ftk('prop/cart', 'cart'),
  ftk('prop/cart_high', 'cartHigh'),
  ftk('prop/hedge', 'hedge'),
  ftk('prop/hedge_curved', 'hedgeCurved'),
  ftk('prop/banner_red', 'bannerRed'),
  ftk('prop/banner_green', 'bannerGreen'),
  // nature (KayKit)
  hex('nat/tree_a', 'tree_single_A'),
  hex('nat/tree_b', 'tree_single_B'),
  hex('nat/trees_a', 'trees_A_medium'),
  hex('nat/trees_b', 'trees_B_medium'),
  hex('nat/trees_a_large', 'trees_A_large'),
  hex('nat/trees_b_large', 'trees_B_large'),
  hex('nat/trees_a_small', 'trees_A_small'),
  hex('nat/stump_a', 'tree_single_A_cut'),
  hex('nat/rock_a', 'rock_single_A'),
  hex('nat/rock_b', 'rock_single_B'),
  hex('nat/rock_c', 'rock_single_C'),
  hex('nat/rock_d', 'rock_single_D'),
  hex('nat/rock_e', 'rock_single_E'),
  hex('nat/cloud_big', 'cloud_big'),
  hex('nat/cloud_small', 'cloud_small'),
  hex('nat/waterlily', 'waterlily_A'),
  hex('nat/waterplant', 'waterplant_A'),
  // nature (Kenney)
  nat('nat/tree_default', 'tree-default'),
  nat('nat/tree_oak', 'tree-oak'),
  nat('nat/tree_fat', 'tree-fat'),
  nat('nat/tree_detailed', 'tree-detailed'),
  nat('nat/tree_simple', 'tree-simple'),
  nat('nat/tree_small', 'tree-small'),
  nat('nat/tree_oak_fall', 'tree-oak-fall'),
  nat('nat/tree_default_fall', 'tree-default-fall'),
  nat('nat/tree_fat_fall', 'tree-fat-fall'),
  nat('nat/tree_pine', 'tree-pinetalla'),
  nat('nat/tree_palm', 'tree-palmshort'),
  nat('nat/bush', 'plant-bush'),
  nat('nat/bush_large', 'plant-bushlarge'),
  nat('nat/bush_detailed', 'plant-bushdetailed'),
  nat('nat/grass', 'grass'),
  nat('nat/grass_large', 'grass-large'),
  nat('nat/flower_red', 'flower-redb'),
  nat('nat/flower_yellow', 'flower-yellowb'),
  nat('nat/flower_purple', 'flower-purpleb'),
  nat('nat/flower_red_a', 'flower-reda'),
  nat('nat/flower_yellow_a', 'flower-yellowa'),
  nat('nat/flower_purple_a', 'flower-purplea'),
  nat('nat/mushroom', 'mushroom-redgroup'),
  nat('nat/mushroom_tan', 'mushroom-tangroup'),
  nat('nat/stump_round', 'stump-round'),
  nat('nat/stump_old', 'stump-old'),
  nat('nat/log', 'log-large'),
  nat('nat/log_stack', 'log-stack'),
  nat('nat/rock_large', 'rock-largea'),
  nat('nat/rock_tall', 'rock-tallb'),
  nat('nat/rock_small', 'rock-smallc'),
  nat('nat/lily', 'lily-large'),
  nat('nat/pot_large', 'pot-large'),
  nat('nat/pot_small', 'pot-small'),
  nat('nat/campfire', 'campfire-stones'),
  nat('nat/sign', 'sign'),
  nat('nat/statue_head', 'statue-head'),
  nat('nat/statue_obelisk', 'statue-obelisk'),
  nat('nat/statue_column', 'statue-column'),
  nat('nat/statue_ring', 'statue-ring'),
  nat('nat/path_stone', 'path-stone'),
  nat('nat/path_stonecircle', 'path-stonecircle'),
  nat('nat/fence_simple', 'fence-simple'),
  nat('nat/fence_planks', 'fence-planks'),
  nat('nat/fence_gate', 'fence-gate'),
  nat('nat/tent', 'tent-detailedopen'),
  // crops (Kenney Nature Kit)
  nat('crop/wheat_a', 'crops-wheatstagea'),
  nat('crop/wheat_b', 'crops-wheatstageb'),
  nat('crop/corn_a', 'crops-cornstagea'),
  nat('crop/corn_b', 'crops-cornstageb'),
  nat('crop/corn_c', 'crops-cornstagec'),
  nat('crop/corn_d', 'crops-cornstaged'),
  nat('crop/bamboo_a', 'crops-bamboostagea'),
  nat('crop/bamboo_b', 'crops-bamboostageb'),
  nat('crop/leafs_a', 'crops-leafsstagea'),
  nat('crop/leafs_b', 'crops-leafsstageb'),
  nat('crop/carrot', 'crop-carrot'),
  nat('crop/pumpkin', 'crop-pumpkin'),
  nat('crop/melon', 'crop-melon'),
  nat('crop/turnip', 'crop-turnip'),
  nat('crop/dirt_row', 'crops-dirtrow'),
  // animals (Kenney Cube Pets)
  pet('pet/chick', 'animal-chick'),
  pet('pet/cow', 'animal-cow'),
  pet('pet/pig', 'animal-pig'),
  pet('pet/polar', 'animal-polar'),
  pet('pet/deer', 'animal-deer'),
  pet('pet/bunny', 'animal-bunny'),
  pet('pet/dog', 'animal-dog'),
  pet('pet/cat', 'animal-cat'),
  pet('pet/fox', 'animal-fox'),
  pet('pet/bee', 'animal-bee'),
  pet('pet/penguin', 'animal-penguin'),
  pet('pet/panda', 'animal-panda'),
  // characters (Kenney Mini Characters)
  ...['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f']
    .map((n) => chr(`char/${n}`, `character-${n}`)),
  // vehicles
  car('veh/delivery', 'delivery'),
  car('veh/delivery_flat', 'delivery-flat'),
  car('veh/truck', 'truck-flat'),
  car('veh/tractor', 'tractor'),
  car('veh/van', 'van'),
  // food items (Kenney Food Kit)
  ...['tomato', 'strawberry', 'cabbage', 'onion', 'beet', 'eggplant', 'paprika', 'broccoli', 'watermelon', 'radish',
    'cauliflower', 'apple', 'pear', 'orange', 'lemon', 'cherries', 'banana', 'coconut', 'grapes', 'egg', 'carton',
    'cheese', 'bread', 'loaf', 'loaf-baguette', 'croissant', 'cookie', 'cake', 'pie', 'muffin', 'cupcake', 'pancakes', 'honey',
    'mushroom', 'waffle', 'donut', 'corn', 'carrot', 'pumpkin-basic', 'pumpkin', 'leek', 'pineapple', 'bag', 'barrel',
    'chocolate', 'popsicle', 'ice-cream', 'whole-ham', 'sandwich', 'salad', 'skewer-vegetables', 'peanut-butter', 'bottle-oil', 'pot-stew', 'cake-birthday']
    .map((n) => food(`food/${n}`, n)),
];

// animations kept per model category (others are stripped to save bytes)
const KEEP_ANIMS = {
  char: ['idle', 'walk', 'sprint', 'pick-up', 'interact-right', 'emote-yes', 'sit', 'jump'],
  pet: ['idle', 'walk', 'eat', 'dance', 'gesture-positive'],
};

// ---------------------------------------------------------------- helpers
function sh(cmd, args) {
  try { execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { throw new Error(`${cmd} failed: ${e.stderr?.toString() ?? e.message}`); }
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function kb(p) { return Math.round(fs.statSync(p).size / 1024); }

// ---------------------------------------------------------------- models
// ADD_ONLY=id,id,... builds just those models and merges them into the existing manifest, so a new model can be
// added without rebuilding (and re-compressing) everything. Needs the pack in .asset-cache (fetch-assets.sh).
const ADD_ONLY = process.env.ADD_ONLY ? new Set(process.env.ADD_ONLY.split(',').map((s) => s.trim()).filter(Boolean)) : null;

async function buildModels() {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const atlases = {};
  const models = {};
  const modelDir = path.join(OUT, 'models');
  if (!ADD_ONLY) fs.rmSync(modelDir, { recursive: true, force: true });
  let total = 0;
  for (const [id, src, atlas, pack] of MODELS.filter(([id]) => !ADD_ONLY || ADD_ONLY.has(id))) {
    if (!fs.existsSync(src)) throw new Error(`missing source ${src}`);
    const doc = await io.read(src);
    const root = doc.getRoot();
    if (atlas) {
      const tex = root.listTextures()[0];
      if (tex && !atlases[atlas]) atlases[atlas] = { image: tex.getImage(), mime: tex.getMimeType() };
      for (const t of root.listTextures()) t.dispose();
    }
    const keep = KEEP_ANIMS[id.split('/')[0]];
    if (keep) for (const a of root.listAnimations()) if (!keep.includes(a.getName())) a.dispose();
    const skinned = root.listSkins().length > 0;
    await doc.transform(
      dedup(),
      prune({ keepAttributes: true }),
      ...(skinned ? [] : [weld()]),
      resample(),
      reorder({ encoder: MeshoptEncoder, target: 'size' }),
      // UVs stay float: textures are stripped into shared atlases, so a KHR_texture_transform
      // (which UV quantization relies on) would be lost.
      quantize({ pattern: /^(POSITION|NORMAL|JOINTS|WEIGHTS|COLOR)(_\d+)?$/, patternTargets: /^(POSITION|NORMAL)(_\d+)?$/, quantizeNormal: 10 }),
    );
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    // bounding box of all positions in world space (rest pose)
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const scene = root.listScenes()[0];
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const v = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v);
          const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
          const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
          const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
          min = [Math.min(min[0], x), Math.min(min[1], y), Math.min(min[2], z)];
          max = [Math.max(max[0], x), Math.max(max[1], y), Math.max(max[2], z)];
        }
      }
    });
    let tris = 0;
    for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
    const out = path.join(modelDir, `${id}.glb`);
    ensureDir(path.dirname(out));
    await io.write(out, doc);
    total += fs.statSync(out).size;
    const round = (a) => a.map((n) => Math.round(n * 1000) / 1000);
    models[id] = {
      url: `models/${id}.glb`,
      atlas: atlas ?? undefined,
      pack,
      source: path.relative(CACHE, src),
      min: round(min),
      max: round(max),
      tris,
      skinned: skinned || undefined,
      anims: root.listAnimations().map((a) => a.getName()).filter(Boolean),
    };
    if (!models[id].anims.length) delete models[id].anims;
  }
  console.log(`models: ${Object.keys(models).length} files, ${Math.round(total / 1024)} KB`);
  return { models, atlases };
}

// ---------------------------------------------------------------- textures
function buildTextures(atlases) {
  const dir = path.join(OUT, 'textures');
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  const out = {};
  for (const [key, { image }] of Object.entries(atlases)) {
    const tmp = path.join(dir, `${key}.src.png`);
    fs.writeFileSync(tmp, image);
    const dst = path.join(dir, `${key}.png`);
    // nearest-neighbour keeps the flat palette swatches crisp
    sh('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-vf', 'scale=512:512:flags=neighbor', dst]);
    fs.rmSync(tmp);
    out[key] = `textures/${key}.png`;
    console.log(`texture ${key}: ${kb(dst)} KB`);
  }
  // particle sprites (Kenney Particle Pack)
  const pdir = path.join(dir, 'particles');
  ensureDir(pdir);
  const psrc = path.join(KM, 'particlePack_1.1/PNG (Transparent)');
  for (const name of ['star_06', 'star_04', 'spark_05', 'smoke_04', 'circle_05', 'magic_04', 'twirl_02', 'light_01', 'dirt_02']) {
    // sources are light shapes on black: turn luminance into alpha over pure white so sprites tint cleanly
    sh('ffmpeg', ['-y', '-v', 'error', '-i', path.join(psrc, `${name}.png`), '-f', 'lavfi', '-i', 'color=white:s=128x128',
      '-filter_complex', '[0]scale=128:128,format=gray[g];[1]format=rgb24[w];[w][g]alphamerge,format=rgba', '-frames:v', '1', path.join(pdir, `${name}.png`)]);
  }
  return out;
}

// ---------------------------------------------------------------- audio
const SFX = {
  // Kenney Interface Sounds / RPG Audio / Impact Sounds / Music Jingles / Casino Audio (CC0)
  tap: [KM, 'kenney_interfacesounds', 'click_002.ogg'],
  select: [KM, 'kenney_interfacesounds', 'select_002.ogg'],
  open: [KM, 'kenney_interfacesounds', 'maximize_006.ogg'],
  close: [KM, 'kenney_interfacesounds', 'minimize_006.ogg'],
  error: [KM, 'kenney_interfacesounds', 'error_006.ogg'],
  harvest: [KM, 'kenney_interfacesounds', 'pluck_001.ogg'],
  harvest2: [KM, 'kenney_interfacesounds', 'pluck_002.ogg'],
  plant: [KM, 'kenney_impactsounds', 'footstep_grass_000.ogg'],
  plant2: [KM, 'kenney_impactsounds', 'footstep_grass_001.ogg'],
  build: [KM, 'kenney_impactsounds', 'impactPlank_medium_000.ogg'],
  build2: [KM, 'kenney_impactsounds', 'impactWood_heavy_002.ogg'],
  chop: [KM, 'kenney_rpgaudio', 'chop.ogg'],
  rock: [KM, 'kenney_impactsounds', 'impactMining_002.ogg'],
  coins: [KM, 'kenney_rpgaudio', 'handleCoins.ogg'],
  coins2: [KM, 'kenney_rpgaudio', 'handleCoins2.ogg'],
  coinTick: [KM, 'kenney_casinoaudio', 'chipLay1.ogg'],
  gem: [KM, 'kenney_interfacesounds', 'glass_002.ogg'],
  collect: [KM, 'kenney_interfacesounds', 'drop_002.ogg'],
  pop: [KM, 'kenney_interfacesounds', 'drop_001.ogg'],
  whoosh: [KM, 'kenney_interfacesounds', 'scratch_002.ogg'],
  door: [KM, 'kenney_rpgaudio', 'doorOpen_1.ogg'],
  page: [KM, 'kenney_rpgaudio', 'bookFlip2.ogg'],
  quest: [KM, 'kenney_interfacesounds', 'confirmation_002.ogg'],
  levelup: [KM, 'kenney_musicjingles', 'jingles_PIZZI10.ogg'],
  achievement: [KM, 'kenney_musicjingles', 'jingles_PIZZI03.ogg'],
  jingle: [KM, 'kenney_musicjingles', 'jingles_PIZZI07.ogg'],
  truck: [KM, 'kenney_musicjingles', 'jingles_STEEL02.ogg'],
  // uisfx (CC0)
  press: ['UISFX', 'rubber', 'press'],
  snap: ['UISFX', 'rubber', 'snap'],
  swipe: ['UISFX', 'rubber', 'swipe'],
  purchase: ['UISFX', 'soft', 'purchase'],
  reward: ['UISFX', 'soft', 'reward'],
  unlock: ['UISFX', 'soft', 'unlock'],
  bonus: ['UISFX', 'soft', 'bonus'],
  sparkle: ['UISFX', 'dreamy', 'achievement'],
  // Animal sounds (DJ WoodZ, CC0 derivatives of freesound.org)
  cow: ['ANIMAL', 'cow-moo.ogg'],
  chicken: ['ANIMAL', 'chicken-cluck.ogg'],
  pig: ['ANIMAL', 'pig-oink.ogg'],
  sheep: ['ANIMAL', 'sheep-baa.ogg'],
  goat: ['ANIMAL', 'sheep-baa.ogg', 'goat'],
};
const MUSIC = {
  barnville: 'Barnville.mp3',
  ukulele: 'Happy Whistling Ukulele.mp3',
  garden: 'Magic in the Garden.mp3',
  springchicken: 'Spring Chicken.mp3',
};

function buildAudio() {
  const sdir = path.join(OUT, 'audio/sfx');
  const mdir = path.join(OUT, 'audio/music');
  fs.rmSync(path.join(OUT, 'audio'), { recursive: true, force: true });
  ensureDir(sdir); ensureDir(mdir);
  const uisfx = path.join(ROOT, 'node_modules/uisfx/sounds');
  const sfx = {};
  let total = 0;
  for (const [key, spec] of Object.entries(SFX)) {
    let src, filters = ['loudnorm=I=-16:TP=-1.5:LRA=11'];
    if (spec[0] === 'UISFX') src = path.join(uisfx, spec[1], `${spec[2]}.mp3`);
    else if (spec[0] === 'ANIMAL') {
      src = path.join(CACHE, 'animal-sounds/src/sounds', spec[1]);
      // trim to a single short call; goat = pitched-up sheep
      filters = ['atrim=0:1.6', 'afade=t=out:st=1.3:d=0.3', ...filters];
      if (spec[2] === 'goat') filters.unshift('asetrate=44100*1.35', 'aresample=44100');
    } else src = findFile(path.join(spec[0], spec[1]), spec[2]);
    const dst = path.join(sdir, `${key}.mp3`);
    sh('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', filters.join(','), '-ac', '1', '-ar', '44100', '-b:a', '96k', dst]);
    total += fs.statSync(dst).size;
    sfx[key] = `audio/sfx/${key}.mp3`;
  }
  console.log(`sfx: ${Object.keys(sfx).length} files, ${Math.round(total / 1024)} KB`);
  const music = {};
  for (const [key, file] of Object.entries(MUSIC)) {
    const src = path.join(CACHE, 'cc0-music/freepd.com', file);
    const dst = path.join(mdir, `${key}.mp3`);
    sh('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', 'loudnorm=I=-20:TP=-2:LRA=11', '-ac', '1', '-ar', '44100', '-b:a', '56k', dst]);
    music[key] = `audio/music/${key}.mp3`;
    console.log(`music ${key}: ${kb(dst)} KB`);
  }
  return { sfx, music };
}

// ---------------------------------------------------------------- fonts
function buildFonts() {
  const dir = path.join(OUT, 'fonts');
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  const files = [
    ['@fontsource/fredoka/files/fredoka-latin-400-normal.woff2', 'fredoka-400.woff2'],
    ['@fontsource/fredoka/files/fredoka-latin-600-normal.woff2', 'fredoka-600.woff2'],
    ['@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2', 'lilita-one-400.woff2'],
  ];
  for (const [src, dst] of files) fs.copyFileSync(require.resolve(src), path.join(dir, dst));
  console.log('fonts: copied', files.length);
}

// ---------------------------------------------------------------- icons
const ICONS = {
  // items
  wheat: 'sheaf-of-rice', corn: 'ear-of-corn', carrot: 'carrot', tomato: 'tomato', strawberry: 'strawberry',
  cabbage: 'leafy-green', onion: 'onion', eggplant: 'eggplant', pepper: 'bell-pepper', broccoli: 'broccoli',
  watermelon: 'watermelon', potato: 'potato', apple: 'red-apple', pear: 'pear', orange: 'tangerine', lemon: 'lemon',
  cherry: 'cherries', banana: 'banana', coconut: 'coconut', grapes: 'grapes', blueberry: 'blueberries', peach: 'peach',
  egg: 'egg', milk: 'glass-of-milk', yarn: 'yarn', mushroom: 'brown-mushroom', bread: 'bread', baguette: 'baguette-bread',
  croissant: 'croissant', cookie: 'cookie', cake: 'shortcake', birthday_cake: 'birthday-cake', pie: 'pie', butter: 'butter',
  cheese: 'cheese-wedge', honey: 'honey-pot', jar: 'jar', popcorn: 'popcorn', thread: 'thread', tshirt: 't-shirt',
  scarf: 'scarf', coat: 'coat', pancakes: 'pancakes', cupcake: 'cupcake', candy: 'candy', lollipop: 'lollipop',
  doughnut: 'doughnut', ice_cream: 'soft-ice-cream', custard: 'custard', chocolate: 'chocolate-bar', sandwich: 'sandwich',
  pumpkin: 'jack-o-lantern', herb: 'herb', seedling: 'seedling', sunflower: 'sunflower', tulip: 'tulip', rose: 'rose',
  hibiscus: 'hibiscus', blossom: 'cherry-blossom', maple: 'maple-leaf', fallen_leaf: 'fallen-leaf', gloves: 'gloves',
  socks: 'socks', dress: 'dress', ribbon: 'ribbon', crown: 'crown', cap: 'billed-cap', hat: 'womans-hat', bowl: 'bowl-with-spoon',
  pineapple: 'pineapple', green_apple: 'green-apple', nest: 'nest-with-eggs', salad: 'green-salad', stew: 'pot-of-food',
  // currency / ui
  coin: 'coin', gem: 'gem-stone', star: 'star', glowing_star: 'glowing-star', sparkles: 'sparkles', xp: 'glowing-star',
  gift: 'wrapped-gift', package: 'package', truck: 'delivery-truck', pickup: 'pickup-truck', cart: 'shopping-cart',
  bags: 'shopping-bags', store: 'convenience-store', house: 'house-with-garden', hut: 'hut', construction: 'building-construction',
  hammer: 'hammer', hammer_wrench: 'hammer-and-wrench', axe: 'axe', pick: 'pick', rock: 'rock', wood: 'wood', evergreen: 'evergreen-tree',
  tree: 'deciduous-tree', chicken: 'chicken', cow: 'cow', pig: 'pig', sheep: 'ewe', goat: 'goat', horse: 'horse', rabbit: 'rabbit',
  dog: 'dog', cat: 'cat', bee: 'honeybee', chick: 'baby-chick', trophy: 'trophy', medal: 'sports-medal', medal1: '1st-place-medal',
  medal2: '2nd-place-medal', medal3: '3rd-place-medal', calendar: 'tear-off-calendar', clipboard: 'clipboard', scroll: 'scroll',
  memo: 'memo', gear: 'gear', speaker: 'speaker-high-volume', muted: 'muted-speaker', music: 'musical-notes', bell: 'bell',
  lock: 'locked', unlock: 'unlocked', key: 'key', map: 'world-map', hourglass: 'hourglass-not-done', timer: 'stopwatch',
  check: 'check-mark-button', cross: 'cross-mark', heart: 'red-heart', sparkle_heart: 'sparkling-heart',
  hand: 'backhand-index-pointing-up', hand_down: 'backhand-index-pointing-down', farmer: 'farmer', woman_farmer: 'woman-farmer',
  man_farmer: 'man-farmer', fountain: 'fountain', sun: 'sun', moon: 'crescent-moon', cloud: 'cloud', rainbow: 'rainbow',
  snowflake: 'snowflake', ghost: 'ghost', candle: 'candle', light_bulb: 'light-bulb', books: 'books', book: 'open-book',
  eye: 'eye', camera: 'camera', basket: 'basket', bucket: 'bucket', droplet: 'droplet', fire: 'fire', party: 'party-popper',
  confetti: 'confetti-ball', balloon: 'balloon', fireworks: 'fireworks', ticket: 'admission-tickets', receipt: 'receipt',
  notebook: 'notebook-with-decorative-cover', chart: 'chart-increasing', toolbox: 'toolbox', magnifier: 'magnifying-glass-tilted-left',
  tent: 'tent', paint: 'artist-palette', shirt: 't-shirt', jeans: 'jeans', kimono: 'kimono', crystal: 'crystal-ball',
  dice: 'game-die', mailbox: 'open-mailbox-with-raised-flag', bookmark: 'bookmark-tabs', puzzle: 'puzzle-piece', world: 'globe-showing-europe-africa',
  sunrise: 'sunrise', rocket: 'rocket', zzz: 'zzz', wave: 'waving-hand', thumbs: 'thumbs-up', smile: 'smiling-face-with-smiling-eyes',
  hug: 'smiling-face-with-hearts', bat: 'bat', spider_web: 'spider-web', leaf: 'leaf-fluttering-in-wind', chestnut: 'chestnut',
  acorn: 'chestnut', shell: 'spiral-shell', framed: 'framed-picture', bricks: 'brick', tractor: 'tractor', seed: 'seedling', plus: 'plus', info: 'information',
  ...FISHING_ICONS,
};

function buildIcons() {
  const dir = path.join(OUT, 'icons');
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  const json = require('@iconify-json/fluent-emoji-flat/icons.json');
  const W = json.width ?? 16, H = json.height ?? 16;
  const missing = [];
  for (const [key, name] of Object.entries(ICONS)) {
    let icon = json.icons[name];
    if (!icon && json.aliases?.[name]) icon = json.icons[json.aliases[name].parent];
    if (!icon) { missing.push(`${key}:${name}`); continue; }
    const w = icon.width ?? W, h = icon.height ?? H;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${w} ${h}" width="64" height="64">${icon.body}</svg>`;
    fs.writeFileSync(path.join(dir, `${key}.svg`), svg);
  }
  if (missing.length) console.warn('icons missing:', missing.join(', '));
  // recoloured / composed variants (fish species, fish pie)
  const variants = writeVariants(json, dir, ICONS);
  console.log('icons:', Object.keys(ICONS).length - missing.length + Object.keys(variants).length);
  return { ...Object.fromEntries(Object.keys(ICONS).filter((k) => !missing.some((m) => m.startsWith(`${k}:`))).map((k) => [k, `icons/${k}.svg`])), ...variants };
}

// ---------------------------------------------------------------- main
if (ADD_ONLY) {
  const manifestPath = path.join(OUT, 'manifest.json');
  const old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { models } = await buildModels();
  for (const id of ADD_ONLY) if (!models[id]) throw new Error(`ADD_ONLY: unknown model ${id}`);
  Object.assign(old.models, models);
  fs.writeFileSync(manifestPath, JSON.stringify(old));
  console.log('manifest updated with', Object.keys(models).join(', '));
  process.exit(0);
}
const { models, atlases } = await buildModels();
const textures = buildTextures(atlases);
const audio = buildAudio();
buildFonts();
const icons = buildIcons();
const manifest = { version: 1, generated: new Date().toISOString().slice(0, 10), textures, models, sfx: audio.sfx, music: audio.music, icons };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log('manifest written');
