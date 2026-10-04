// Validates the JSON game data in src/data: parses every file, checks cross-references
// (items, buildings, models, recipes) and that every level from 2 to 50 unlocks something.
// Run with `npm run validate-data` (also runs in CI before the build).
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const dir = new URL('../src/data/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) read(f);

const errors = [];
const err = (m) => errors.push(m);
const { crops, trees } = read('crops.json');
const { animals } = read('animals.json');
const { items } = read('items.json');
const { recipes } = read('recipes.json');
const { buildings, farmhouse } = read('buildings.json');
const levels = read('levels.json');
const cosmetics = read('cosmetics.json');
const land = read('land.json');
const { achievements } = read('achievements.json');
const quests = read('quests.json');

const manifestUrl = new URL('../public/assets/manifest.json', import.meta.url);
const models = existsSync(manifestUrl) ? JSON.parse(readFileSync(manifestUrl, 'utf8')).models : null;
const icons = existsSync(manifestUrl) ? JSON.parse(readFileSync(manifestUrl, 'utf8')).icons : null;
const BUILDING = Object.fromEntries(buildings.map((b) => [b.id, b]));
const model = (id, where) => {
  if (!models || !id) return;
  if (id.startsWith('proc') || id.startsWith('paint:') || id === 'tree') return;
  if (!models[id]) err(`${where}: unknown model ${id}`);
};

for (const c of crops) {
  if (!items[c.id]) err(`crop ${c.id}: no item`);
  c.stages.forEach((s) => model(s, `crop ${c.id}`));
  model(c.ready.model, `crop ${c.id}`);
  if (c.ready.produce && !c.ready.produce.startsWith('proc/')) model(c.ready.produce, `crop ${c.id}`);
}
for (const t of trees) {
  if (!items[t.item]) err(`tree ${t.id}: no item ${t.item}`);
  if (!BUILDING[t.id]) err(`tree ${t.id}: no building`);
  model(t.model, `tree ${t.id}`); model(t.fruit, `tree ${t.id}`);
}
for (const a of animals) {
  for (const k of ['feed', 'product']) if (!items[a[k]]) err(`animal ${a.id}: no item ${a[k]}`);
  if (!BUILDING[a.house]) err(`animal ${a.id}: no house ${a.house}`);
  model(a.model, `animal ${a.id}`);
}
for (const r of recipes) {
  if (!items[r.item]) err(`recipe ${r.id}: no item ${r.item}`);
  if (!BUILDING[r.building]) err(`recipe ${r.id}: no building ${r.building}`);
  for (const i of Object.keys(r.in)) if (!items[i]) err(`recipe ${r.id}: unknown ingredient ${i}`);
}
for (const b of buildings) model(b.model, `building ${b.id}`);
for (const [id, it] of Object.entries(items)) {
  if (icons && !it.icon.startsWith('model:') && !icons[it.icon]) err(`item ${id}: unknown icon ${it.icon}`);
  if (it.icon.startsWith('model:') && !it.icon.startsWith('model:proc/')) model(it.icon.slice(6), `item ${id} icon`);
}
for (const t of Object.values(land.obstacles.types)) t.models.forEach((m) => model(m, 'obstacle'));
const bodyIds = new Set(cosmetics.bodies.map((b) => b.id));
for (const a of cosmetics.avatars) {
  if (!bodyIds.has(a.body)) err(`avatar ${a.id}: unknown body ${a.body}`);
  if (!cosmetics.hats.some((h) => h.id === a.hat && h.unlock.default)) err(`avatar ${a.id}: hat ${a.hat} must be a starter hat`);
}
for (const g of ['female', 'male']) if (!cosmetics.avatars.some((a) => a.gender === g)) err(`no ${g} avatars`);
for (const a of achievements) if (a.tiers.length !== 3) err(`achievement ${a.id}: needs 3 tiers`);
if (achievements.length < 40) err(`need at least 40 achievements, have ${achievements.length}`);
if (crops.length < 15) err(`need at least 15 crops, have ${crops.length}`);
for (const t of [...quests.daily.templates, ...quests.weekly.templates]) if (!t.stat) err(`quest ${t.id}: no stat`);

// every level unlocks something visible
const unlockLevels = new Set();
for (const c of crops) unlockLevels.add(c.level);
for (const t of trees) unlockLevels.add(t.level);
for (const a of animals) unlockLevels.add(a.level);
for (const b of buildings) if (!b.event && b.cost > 0) unlockLevels.add(b.level);
for (const r of recipes) unlockLevels.add(r.level);
for (const list of [cosmetics.hats, cosmetics.accessories, cosmetics.pets, cosmetics.outfitColors]) for (const c of list) if (c.unlock.level) unlockLevels.add(c.unlock.level);
for (const f of farmhouse.levels) unlockLevels.add(f.playerLevel);
for (const lv of Object.keys(levels.orderSlots)) unlockLevels.add(Number(lv));
const e = land.expansion;
for (let n = 0; n < 32; n++) unlockLevels.add(Math.floor(e.baseLevel + n * e.levelStep));
const missing = [];
for (let lv = 2; lv <= levels.maxLevel; lv++) if (!unlockLevels.has(lv)) missing.push(lv);
if (missing.length) err(`levels with nothing to unlock: ${missing.join(', ')}`);

// changelog: newest first, versions match package.json, known icons, no em dashes in player text
const { releases } = read('changelog.json');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const cmpVer = (a, b) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); return 0; };
if (!releases?.length) err('changelog: no releases');
else if (releases[0].version !== pkg.version) err(`changelog: newest release ${releases[0].version} does not match package.json version ${pkg.version}`);
releases?.forEach((r, i) => {
  if (!/^\d+\.\d+\.\d+$/.test(r.version)) err(`changelog: bad version ${r.version}`);
  if (i > 0 && cmpVer(releases[i - 1].version, r.version) <= 0) err(`changelog: ${r.version} is not older than ${releases[i - 1].version} (newest first)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) err(`changelog ${r.version}: bad date ${r.date}`);
  const lines = [...(r.dedication ? [r.dedication] : []), ...r.highlights, ...(r.sections ?? []).flatMap((s) => s.items)];
  const icon = (k) => { if (k && icons && !icons[k]) err(`changelog ${r.version}: unknown icon ${k}`); };
  icon(r.icon); (r.sections ?? []).forEach((s) => icon(s.icon));
  for (const l of lines) { icon(l.icon); if (!l.text) err(`changelog ${r.version}: empty line`); }
  if (JSON.stringify(r).includes('—')) err(`changelog ${r.version}: use "-" instead of an em dash`);
});
// friends and gifts (economy.social)
{
  const so = read('economy.json').social;
  if (!so) err('economy.social missing');
  else {
    for (const k of ['giftsPerDay', 'maxCoinsPerGift', 'maxCoinsPerDay', 'maxItemsPerGift', 'maxStacksPerGift', 'messageMax', 'maxFriends', 'pollSec']) if (!(so[k] > 0)) err(`economy.social.${k} must be > 0`);
    for (const i of so.botGift?.items ?? []) if (!items[i]) err(`economy.social.botGift: unknown item ${i}`);
  }
}

// fishing (fish.json): species and junk are real items, known times/rarities, sane ranges
{
  const fish = read('fish.json');
  const times = Object.keys(fish.times);
  const rarities = Object.keys(fish.rarityChance);
  if (!items[fish.baitItem]) err(`fish.json: unknown bait item ${fish.baitItem}`);
  if (!(fish.freeCastsPerDay >= 0) || !(fish.level >= 2)) err('fish.json: bad level or freeCastsPerDay');
  const ids = new Set();
  for (const f of fish.species) {
    if (ids.has(f.id)) err(`fish ${f.id}: duplicate`);
    ids.add(f.id);
    if (!items[f.id]) err(`fish ${f.id}: no item`);
    else if (items[f.id].cat !== 'fish') err(`fish ${f.id}: item cat must be "fish"`);
    if (!rarities.includes(f.rarity)) err(`fish ${f.id}: unknown rarity ${f.rarity}`);
    if (!f.times?.length || f.times.some((t) => !times.includes(t))) err(`fish ${f.id}: bad times`);
    if (!(f.difficulty >= 1 && f.difficulty <= fish.reel.zone.length)) err(`fish ${f.id}: difficulty out of range`);
    if (!(f.size?.[0] > 0 && f.size[1] >= f.size[0])) err(`fish ${f.id}: bad size range`);
    if (f.level < fish.level) err(`fish ${f.id}: level ${f.level} is below the fishing level ${fish.level}`);
  }
  // something always bites at the fishing level, whatever the time of day
  for (const t of times) if (!fish.species.some((f) => f.level <= fish.level && f.times.includes(t))) err(`fish.json: nothing bites at ${t} at level ${fish.level}`);
  for (const j of fish.junk) if (!items[j.id] && !j.coinsBase) err(`fish junk ${j.id}: needs an item or a coin reward`);
  for (const [id, it] of Object.entries(items)) if (it.cat === 'fish' && !ids.has(id) && !fish.junk.some((j) => j.id === id)) err(`item ${id}: cat "fish" but not in fish.json`);
}

if (errors.length) {
  console.error(`data invalid:\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log(`data ok: ${crops.length} crops, ${trees.length} trees, ${animals.length} animals, ${recipes.length} recipes, ${buildings.length} buildings, ${achievements.length} achievements, every level 2-${levels.maxLevel} unlocks something`);
