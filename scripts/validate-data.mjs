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
for (const b of buildings) if (b.onField && (b.cat !== 'decor' || b.size[0] > 2 || b.size[1] > 2)) err(`onField building ${b.id} must be a decoration of at most 2x2`);
{ const seen = new Set(); for (const b of buildings) { if (seen.has(b.id)) err(`duplicate building id ${b.id}`); seen.add(b.id); } }
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
for (const r of recipes) if (!r.perk) unlockLevels.add(r.level); // perk recipes (1.8 villagers) are gifts, not level unlocks
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
// 1.8 Ask a friend (economy.help): limits match the server (maxOpen 3, maxQty 10, fillsPerDay 30)
{
  const hp = read('economy.json').help;
  if (!hp) err('economy.help missing');
  else {
    for (const k of ['maxOpen', 'maxQty', 'sameItemHours', 'asksPerDay', 'expireHours', 'fillsPerDay', 'pollSec', 'rewardedPerDay', 'rewardMult', 'rewardMin', 'rewardMax', 'hazelAfterMin', 'hazelMarkup', 'reserveDefault', 'autoPerPoll']) if (!(hp[k] > 0)) err(`economy.help.${k} must be > 0`);
    if (hp.maxOpen !== 3 || hp.maxQty !== 10 || hp.fillsPerDay !== 30 || hp.expireHours !== 24) err('economy.help: maxOpen 3, maxQty 10, fillsPerDay 30 and expireHours 24 must match supabase/schema.sql');
    for (const i of hp.practice?.items ?? []) if (!items[i]) err(`economy.help.practice: unknown item ${i}`);
  }
}

// fishing (fish.json): species and junk are real items, known times/rarities, sane ranges
{
  const fish = read('fish.json');
  const times = Object.keys(fish.times);
  const rarities = Object.keys(fish.rarityChance);
  // the UI (labels, colours, reveal card) knows these tiers, rarest last
  const TIERS = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
  if (rarities.some((r, i) => TIERS.indexOf(r) < 0 || (i && TIERS.indexOf(r) < TIERS.indexOf(rarities[i - 1])))) err(`fish.json: rarityChance tiers must be ${TIERS.join(', ')} (in that order)`);
  if (rarities.some((r) => !(fish.rarityChance[r] > 0))) err('fish.json: every rarityChance must be > 0');
  const fishIcons = new Map();
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
    // every species needs its own icon (unseen ones show as silhouettes) that really exists on disk
    const ic = items[f.id]?.icon;
    if (ic && fishIcons.has(ic)) err(`fish ${f.id}: icon ${ic} is already used by ${fishIcons.get(ic)}`);
    fishIcons.set(ic, f.id);
    if (ic && icons?.[ic] && !existsSync(new URL(`../public/assets/${icons[ic]}`, import.meta.url))) err(`fish ${f.id}: icon file ${icons[ic]} is missing`);
    if (f.rarity === 'mythic' && fish.mythicNeedsLegendary && !fish.species.some((g) => g.rarity === 'legendary' && g.level <= f.level)) err(`fish ${f.id}: mythic needs a legendary fish at or below level ${f.level}`);
  }
  // something always bites at the fishing level, whatever the time of day
  for (const t of times) if (!fish.species.some((f) => f.level <= fish.level && f.times.includes(t))) err(`fish.json: nothing bites at ${t} at level ${fish.level}`);
  for (const j of fish.junk) if (!items[j.id] && !j.coinsBase) err(`fish junk ${j.id}: needs an item or a coin reward`);
  for (const [id, it] of Object.entries(items)) if (it.cat === 'fish' && !ids.has(id) && !fish.junk.some((j) => j.id === id)) err(`item ${id}: cat "fish" but not in fish.json`);
}

// 1.8 villagers: unique ids, real items in their tastes, valid birthdays and milestones
{
  const v = read('villagers.json');
  const seen = new Set();
  for (const p of v.villagers) {
    if (seen.has(p.id)) err(`villager ${p.id}: duplicate id`);
    seen.add(p.id);
    for (const k of ['loves', 'likes', 'dislikes']) for (const it of p[k] ?? []) if (it !== 'fish' && !items[it]) err(`villager ${p.id}: ${k} has unknown item ${it}`);
    const [m, d] = p.birthday ?? [];
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) err(`villager ${p.id}: bad birthday`);
    if (!p.perk6?.id) err(`villager ${p.id}: no 6-heart perk`);
    // looks, keepsakes and every piece of text the villagers agent wrote
    const L = p.look ?? {};
    if (!cosmetics.bodies.some((b) => b.id === L.body)) err(`villager ${p.id}: unknown body ${L.body}`);
    if (!cosmetics.hats.some((c) => c.id === L.hat)) err(`villager ${p.id}: unknown hat ${L.hat}`);
    if (!cosmetics.accessories.some((c) => c.id === L.accessory)) err(`villager ${p.id}: unknown accessory ${L.accessory}`);
    if (!cosmetics.pets.some((c) => c.id === L.pet)) err(`villager ${p.id}: unknown pet ${L.pet}`);
    for (const k of ['keepsake', 'portrait']) if (BUILDING[p[k]]?.group !== 'keepsakes') err(`villager ${p.id}: ${k} ${p[k]} is not a keepsakes decoration`);
    if ((p.chat ?? []).length < 5 || !p.birthdayChat) err(`villager ${p.id}: needs 5+ chat lines and a birthday line`);
    for (const t of ['love', 'like', 'neutral', 'dislike']) if ((p.react?.[t] ?? []).length < 3) err(`villager ${p.id}: needs 3 ${t} reactions`);
    if (!(p.react?.birthday ?? []).length) err(`villager ${p.id}: needs birthday reactions`);
    for (const k of ['hearts2', 'perk', 'best', 'weekly', 'birthday']) if (!p.letters?.[k]?.title || !p.letters?.[k]?.body) err(`villager ${p.id}: letter ${k} missing`);
    for (const m of ['4', '8']) if ((p.stories?.[m]?.cards ?? []).length < 3) err(`villager ${p.id}: story ${m} needs 3-4 cards`);
    for (const c of Object.values(p.stories ?? {}).flatMap((s) => s.cards)) if (icons && !icons[c.icon]) err(`villager ${p.id}: story icon ${c.icon} unknown`);
    for (const it of Object.keys(p.weekly?.items ?? {})) if (!items[it]) err(`villager ${p.id}: weekly gift has unknown item ${it}`);
    if (/\u2014|\u2013/.test(JSON.stringify(p))) err(`villager ${p.id}: no em or en dashes in text`);
  }
  for (const t of v.pipTreasures ?? []) for (const it of Object.keys(t.items ?? {})) if (!items[it]) err(`pip treasure: unknown item ${it}`);
  for (const r of recipes) if (r.perk && !v.villagers.some((p) => p.perk6?.id === r.perk)) err(`recipe ${r.id}: unknown perk ${r.perk}`);
  if (!v.friendship?.pointsPerHeart || !Array.isArray(v.friendship.milestones)) err('villagers.json: friendship settings missing');
}

// 1.8.5 skills: five skills, an XP ladder, two perks at each perk level, real icons, numbers for every perk
{
  const s = read('skills.json');
  const ids = new Set();
  if (!Array.isArray(s.xpLevels) || s.xpLevels.length < 2 || s.xpLevels[0] !== 0 || s.xpLevels.some((x, i) => i > 0 && x <= s.xpLevels[i - 1])) err('skills.json: xpLevels must start at 0 and rise');
  if (!Array.isArray(s.perkLevels) || s.perkLevels.some((l) => l < 2 || l > s.xpLevels.length)) err('skills.json: perkLevels must be levels the XP ladder reaches');
  if (!(s.headStartMaxLevel >= 1 && s.headStartMaxLevel <= s.xpLevels.length)) err('skills.json: bad headStartMaxLevel');
  const perkIds = new Set();
  for (const sk of s.skills ?? []) {
    if (ids.has(sk.id)) err(`skill ${sk.id}: duplicate id`);
    ids.add(sk.id);
    if (!sk.name || !sk.about || !sk.grows || !sk.perLevel) err(`skill ${sk.id}: needs name, about, grows and perLevel`);
    if (icons && !icons[sk.icon]) err(`skill ${sk.id}: unknown icon ${sk.icon}`);
    if (!Object.keys(sk.xp ?? {}).length) err(`skill ${sk.id}: needs at least one stat that gives XP`);
    for (const lvl of s.perkLevels) {
      const opts = sk.perks?.[String(lvl)] ?? [];
      if (opts.length !== 2) err(`skill ${sk.id}: level ${lvl} needs exactly two perks`);
      for (const p of opts) {
        if (!p.id || !p.name || !p.text) err(`skill ${sk.id}: a level ${lvl} perk needs id, name and text`);
        if (perkIds.has(p.id)) err(`skill perk ${p.id}: duplicate id`);
        perkIds.add(p.id);
        if (icons && !icons[p.icon]) err(`skill perk ${p.id}: unknown icon ${p.icon}`);
      }
    }
  }
  if (ids.size !== 6) err('skills.json: expected the six skills (farming, animals, fishing, cooking, crafting, foraging)');
  for (const [k, v] of Object.entries(s.values ?? {})) if (typeof v !== 'number' || !Number.isFinite(v)) err(`skills.json: value ${k} must be a number`);
  if (/\u2014|\u2013/.test(JSON.stringify(s))) err('skills.json: no em or en dashes in text');
}

// 1.8.5 restoration: unique rooms, real villagers, items and icons, bundles only in rooms that are open, numbers set
{
  const r = read('restoration.json');
  const villagers = new Set(read('villagers.json').villagers.map((v) => v.id));
  const seen = new Set();
  for (const room of r.rooms ?? []) {
    if (seen.has(room.id)) err(`room ${room.id}: duplicate id`);
    seen.add(room.id);
    if (!villagers.has(room.villager)) err(`room ${room.id}: unknown villager ${room.villager}`);
    if (icons && !icons[room.icon]) err(`room ${room.id}: unknown icon ${room.icon}`);
    if (!room.name || !room.about || !room.rebuilds || !room.reward?.text) err(`room ${room.id}: needs name, about, rebuilds and a reward text`);
    if (!(room.opensAt >= 1 && room.opensAt <= levels.maxLevel)) err(`room ${room.id}: bad opensAt`);
    if (room.soon && room.bundles.length) err(`room ${room.id}: a room that opens later has no bundles yet`);
    if (!room.soon && !room.bundles.length) err(`room ${room.id}: needs bundles`);
    if (!room.soon && (!room.letter?.title || !room.letter?.body)) err(`room ${room.id}: needs a letter`);
    const bseen = new Set();
    for (const b of room.bundles) {
      if (bseen.has(b.id)) err(`room ${room.id}: duplicate bundle ${b.id}`);
      bseen.add(b.id);
      if (icons && !icons[b.icon]) err(`bundle ${room.id}/${b.id}: unknown icon ${b.icon}`);
      if (!Object.keys(b.wants ?? {}).length) err(`bundle ${room.id}/${b.id}: wants nothing`);
      for (const [it, n] of Object.entries(b.wants ?? {})) {
        if (it !== 'coins' && !items[it]) err(`bundle ${room.id}/${b.id}: unknown item ${it}`);
        if (!(Number.isInteger(n) && n > 0)) err(`bundle ${room.id}/${b.id}: ${it} needs a whole number above 0`);
      }
      if (b.minStar !== undefined && b.minStar !== 1 && b.minStar !== 2) err(`bundle ${room.id}/${b.id}: minStar must be 1 or 2`);
    }
  }
  for (const k of ['rareSeedPrice', 'rareSeedsPerDay', 'truckMult', 'animalTimeMult']) if (typeof r.rewards?.[k] !== 'number') err(`restoration.json: rewards.${k} must be a number`);
  if (!(r.market?.dayOfWeek >= 0 && r.market?.dayOfWeek <= 6)) err('restoration.json: market.dayOfWeek must be 0-6');
  if (!items.rare_seed) err('items.json: rare_seed is missing (Rosa sells it)');
  if (/\u2014|\u2013/.test(JSON.stringify(r))) err('restoration.json: no em or en dashes in text');
}

// 1.8 Village Guide: every src/data/guide-*.json has pages with an id, a title, an icon and some paragraphs
{
  const ids = new Set();
  const iconDir = new URL('../public/assets/icons/', import.meta.url);
  const hasIcon = (k) => (icons && icons[k]) || existsSync(new URL(`${k}.svg`, iconDir));
  for (const f of readdirSync(dir).filter((f) => /^guide-.+\.json$/.test(f))) {
    const pages = read(f).pages;
    if (!Array.isArray(pages) || !pages.length) { err(`${f}: needs a "pages" list`); continue; }
    for (const g of pages) {
      if (!g.id || !g.title || !Array.isArray(g.paragraphs) || !g.paragraphs.length) err(`${f}: page ${g.id ?? '?'} needs id, title and paragraphs`);
      if (ids.has(g.id)) err(`${f}: duplicate guide page id ${g.id}`);
      ids.add(g.id);
      if (g.icon && !hasIcon(g.icon)) err(`${f}: page ${g.id} has unknown icon ${g.icon}`);
      for (const k of g.pictures ?? []) if (!hasIcon(k) && !items[k] && !read('villagers.json').villagers.some((v) => v.id === k)) err(`${f}: page ${g.id} has unknown picture ${k}`);
    }
  }
}

// 1.9 woods: every item exists with the right category
{
  const wd = read('woods.json'), items = read('items.json').items;
  {
    const list = wd.foraged ?? [];
    if (list.length < 3) err('woods: needs at least 3 forage items');
    for (const e of list) {
      if (!items[e.id] || items[e.id].cat !== 'forage') err(`woods: forage ${e.id} must be an item with cat "forage"`);
      if (!['leaf', 'flower', 'berry', 'mushroom', 'nut', 'root'].includes(e.kind)) err(`woods: forage ${e.id} has unknown kind ${e.kind}`);
    }
  }
  for (const [kind, list] of Object.entries(wd.finds)) for (const e of list) if (!items[e.id] || items[e.id].cat !== kind) err(`woods: find ${e.id} must be an item with cat "${kind}"`);
  if (!items[wd.clayItem]) err(`woods: clay item ${wd.clayItem} does not exist`);
  if (wd.dig.perDay > wd.dig.spots) err('woods: dig perDay is more than the number of spots');
}
// 1.9 schedules: known villagers and places
{
  const sc = read('schedules.json'), vIds = read('villagers.json').villagers.map((v) => v.id);
  for (const id of vIds) if (!sc.villagers[id]) err(`schedules: no routine for ${id}`);
  for (const [id, w] of Object.entries(sc.villagers)) for (const place of Object.keys(w)) if (!sc.places[place]) err(`schedules: ${id} uses unknown place ${place}`);
}
// 1.9 museum and expeditions
{
  const md = read('museum.json'), ed = read('expeditions.json'), items = read('items.json').items;
  const bIds = buildings.map((b) => b.id), vIds = read('villagers.json').villagers.map((v) => v.id);
  const shelfIds = new Set();
  for (const sh of md.shelves) {
    if (shelfIds.has(sh.id)) err(`museum: duplicate shelf ${sh.id}`);
    shelfIds.add(sh.id);
    if (!sh.kind && !(sh.items?.length)) err(`museum: shelf ${sh.id} needs items`);
    for (const i of sh.items ?? []) if (!items[i]) err(`museum: shelf ${sh.id} item ${i} does not exist`);
    if (icons && !icons[sh.icon]) err(`museum: shelf ${sh.id} unknown icon ${sh.icon}`);
  }
  if (!bIds.includes(md.curator.decor)) err(`museum: curator decoration ${md.curator.decor} does not exist`);
  for (const t of ed.trips) if (!(t.hours > 0 && t.items > 0)) err(`expeditions: trip ${t.id} needs hours and items`);
  for (const v of Object.keys(ed.favour)) if (!vIds.includes(v)) err(`expeditions: favour for unknown villager ${v}`);
}
if (errors.length) {
  console.error(`data invalid:\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
// 1.9 festival cycle: the epoch is a Monday, one slot per festival
{
  const cd = read('cycle.json');
  if (new Date(cd.epoch + 'T00:00:00Z').getUTCDay() !== 1) err('cycle: epoch must be a Monday');
  if (!(cd.festivalEvery >= 2)) err('cycle: festivalEvery must be at least 2');
}
// 1.9 festivals: one per slot of the cycle, prizes exist, stars ascend
{
  const fd = read('festivals.json'), sd = { order: read('cycle.json').slots };
  const bIds = buildings.map((b) => b.id), itemIds = Object.keys(read('items.json').items);
  for (const season of sd.order) {
    const f = fd.festivals[season];
    if (!f) { err(`festivals: no festival for ${season}`); continue; }
    if (!['eggs', 'derby', 'fair', 'feast'].includes(f.game)) err(`festivals: ${f.id} has unknown game ${f.game}`);
    if (!(f.stars[0] < f.stars[1] && f.stars[1] < f.stars[2])) err(`festivals: ${f.id} stars must ascend`);
    if (!bIds.includes(f.prize.decor)) err(`festivals: ${f.id} prize decoration ${f.prize.decor} does not exist`);
    if (f.prize.item && !itemIds.includes(f.prize.item.id)) err(`festivals: ${f.id} prize item ${f.prize.item.id} does not exist`);
  }
  if (fd.prizes.length !== 3) err('festivals: prizes needs 3 tiers');
}
if (errors.length) {
  console.error(`data invalid:\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log(`data ok: ${crops.length} crops, ${trees.length} trees, ${animals.length} animals, ${recipes.length} recipes, ${buildings.length} buildings, ${achievements.length} achievements, every level 2-${levels.maxLevel} unlocks something`);
