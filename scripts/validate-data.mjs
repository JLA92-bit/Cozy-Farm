// Validates the JSON game data in src/data: parses every file, checks cross-references
// (items, buildings, models, recipes) and that every level from 2 to the max level unlocks something.
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
for (let lv = 2; lv <= levels.authoredMax; lv++) if (!unlockLevels.has(lv)) missing.push(lv);
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
    for (const b of sk.bonus ?? []) {
      if (!b.id || !b.name || !b.text || !(b.level >= 2 && b.level <= s.xpLevels.length)) err(`skill ${sk.id}: bonus ${b.id} needs id, name, text and a level the XP ladder reaches`);
      if (perkIds.has(b.id)) err(`skill bonus ${b.id}: duplicate id`);
      perkIds.add(b.id);
      if (icons && !icons[b.icon]) err(`skill bonus ${b.id}: unknown icon ${b.icon}`);
    }
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
    if (!(room.opensAt >= 1 && room.opensAt <= levels.authoredMax)) err(`room ${room.id}: bad opensAt`);
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

// 1.18 Willowmere Manor: wings are restoration rooms with ids manor_<wing>, opening one after another; every item a
// wing asks for must be obtainable by its opensAt level (farm items) or in the woods and sea (no level)
{
  const m = read('manor.json');
  const villagers = new Set(read('villagers.json').villagers.map((v) => v.id));
  const roomIds = new Set(read('restoration.json').rooms.map((x) => x.id));
  const lvl = {};
  for (const c of read('crops.json').crops) lvl[c.id] = c.level;
  for (const t of read('crops.json').trees ?? []) lvl[t.item] = t.level;
  for (const a of read('animals.json').animals) { lvl[a.product] = a.level; }
  const bl = Object.fromEntries(read('buildings.json').buildings.map((b) => [b.id, b.level]));
  for (const r of read('recipes.json').recipes) lvl[r.item] = Math.min(lvl[r.item] ?? 999, Math.max(r.level, bl[r.building] ?? 1));
  const seen = new Set();
  let prev = 0;
  for (const w of m.wings ?? []) {
    if (!/^manor_[a-z]+$/.test(w.id) || seen.has(w.id) || roomIds.has(w.id)) err(`manor wing ${w.id}: id must be a new, unique manor_<name>`);
    seen.add(w.id);
    if (!villagers.has(w.villager)) err(`manor wing ${w.id}: unknown villager ${w.villager}`);
    if (icons && !icons[w.icon]) err(`manor wing ${w.id}: unknown icon ${w.icon}`);
    if (!w.name || !w.about || !w.rebuilds || !w.reward?.text) err(`manor wing ${w.id}: needs name, about, rebuilds and a reward text`);
    if (!(w.opensAt >= prev)) err(`manor wing ${w.id}: opensAt must not go down from the wing before`);
    prev = w.opensAt;
    if (!w.bundles?.length) err(`manor wing ${w.id}: needs bundles`);
    const bseen = new Set();
    for (const b of w.bundles ?? []) {
      if (bseen.has(b.id)) err(`manor wing ${w.id}: duplicate bundle ${b.id}`);
      bseen.add(b.id);
      if (icons && !icons[b.icon]) err(`manor bundle ${w.id}/${b.id}: unknown icon ${b.icon}`);
      for (const [it, n] of Object.entries(b.wants ?? {})) {
        if (it !== 'coins' && !items[it]) err(`manor bundle ${w.id}/${b.id}: unknown item ${it}`);
        if (!(Number.isInteger(n) && n > 0)) err(`manor bundle ${w.id}/${b.id}: ${it} needs a whole number above 0`);
        if (lvl[it] !== undefined && lvl[it] > w.opensAt) err(`manor bundle ${w.id}/${b.id}: ${it} unlocks at level ${lvl[it]}, after the wing opens (${w.opensAt})`);
      }
      if (b.minStar !== undefined && b.minStar !== 1 && b.minStar !== 2) err(`manor bundle ${w.id}/${b.id}: minStar must be 1 or 2`);
    }
  }
  const last = (m.wings ?? []).at(-1);
  (m.wings ?? []).forEach((w) => { if (w !== last && (!w.letter?.title || !w.letter?.body)) err(`manor wing ${w.id}: needs a letter`); });
  for (const [k, v] of Object.entries(m.effects ?? {})) if (typeof v !== 'number' && typeof v !== 'boolean') err(`manor.json: effects.${k} must be a number or true/false`);
  if (!buildings.some((b) => b.id === m.finale?.decor)) err(`manor.json: finale decor ${m.finale?.decor} is not a building`);
  if (!m.finale?.title || !m.finale?.body || !(m.finale?.coins >= 0) || !(m.finale?.gems >= 0)) err('manor.json: finale needs title, body, coins and gems');
  if (/—|–/.test(JSON.stringify(m))) err('manor.json: no em or en dashes in text');
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
  // 1.19 the Deep Woods: regions with real items and a trail each; trails are restoration rooms (bundles of real items)
  const trailIds = new Set((wd.trails ?? []).map((t) => t.id));
  const villagers = new Set(read('villagers.json').villagers.map((v) => v.id));
  const rIds = new Set();
  for (const r of wd.regions ?? []) {
    if (rIds.has(r.id) || !/^[a-z]+$/.test(r.id)) err(`woods region ${r.id}: id must be unique lowercase letters`);
    rIds.add(r.id);
    if (!trailIds.has(r.trail)) err(`woods region ${r.id}: trail ${r.trail} is not in woods.json trails`);
    if (icons && !icons[r.icon]) err(`woods region ${r.id}: unknown icon ${r.icon}`);
    if (!(Array.isArray(r.at) && r.at.length === 2 && r.r > 4)) err(`woods region ${r.id}: needs at [x, z] and r`);
    for (const e of r.foraged ?? []) {
      if (!items[e.id] || items[e.id].cat !== 'forage') err(`woods region ${r.id}: forage ${e.id} must be an item with cat "forage"`);
      if (!['leaf', 'flower', 'berry', 'mushroom', 'nut', 'root'].includes(e.kind)) err(`woods region ${r.id}: forage ${e.id} has unknown kind ${e.kind}`);
    }
    if (!['fireflies', 'panning', 'taps', 'oak'].includes(r.feature)) err(`woods region ${r.id}: unknown feature ${r.feature}`);
    if (r.feature === 'fireflies' && !items[r.fireflies?.item]) err(`woods region ${r.id}: firefly item missing`);
    if (r.feature === 'panning') for (const e of r.pan?.table ?? []) if (!items[e.id]) err(`woods region ${r.id}: pan find ${e.id} is not an item`);
    if (r.feature === 'taps') for (const e of r.taps?.items ?? []) if (!items[e.id]) err(`woods region ${r.id}: tap item ${e.id} is not an item`);
  }
  for (const t of wd.trails ?? []) {
    if (!/^trail_[a-z]+$/.test(t.id)) err(`woods trail ${t.id}: id must be trail_<name>`);
    if (!villagers.has(t.villager)) err(`woods trail ${t.id}: unknown villager ${t.villager}`);
    if (!(t.opensAt >= wd.level)) err(`woods trail ${t.id}: opens before the woods do`);
    if (!t.letter?.title || !t.letter?.body || !t.reward?.text) err(`woods trail ${t.id}: needs a letter and a reward text`);
    for (const b of t.bundles ?? []) {
      if (icons && !icons[b.icon]) err(`woods trail ${t.id}/${b.id}: unknown icon ${b.icon}`);
      for (const [it, n] of Object.entries(b.wants ?? {})) {
        if (it !== 'coins' && !items[it]) err(`woods trail ${t.id}/${b.id}: unknown item ${it}`);
        if (!(Number.isInteger(n) && n > 0)) err(`woods trail ${t.id}/${b.id}: ${it} needs a whole number above 0`);
      }
    }
  }
  // 1.23 the Ancient Grove: the Elder Oak's stages are restoration rooms (grove_<stage>) with real items, growing in order
  const gv = wd.grove;
  if (gv) {
    const gIds = new Set();
    let prevAt = 0;
    for (const st of gv.stages ?? []) {
      if (!/^grove_[a-z]+$/.test(st.id) || gIds.has(st.id) || trailIds.has(st.id)) err(`grove stage ${st.id}: id must be a new, unique grove_<name>`);
      gIds.add(st.id);
      if (!villagers.has(st.villager)) err(`grove stage ${st.id}: unknown villager ${st.villager}`);
      if (icons && !icons[st.icon]) err(`grove stage ${st.id}: unknown icon ${st.icon}`);
      if (!st.name || !st.about || !st.rebuilds || !st.reward?.text) err(`grove stage ${st.id}: needs name, about, rebuilds and a reward text`);
      if (!(st.opensAt >= prevAt) || !(st.growDays >= 0)) err(`grove stage ${st.id}: opensAt must not go down and growDays must be 0 or more`);
      prevAt = st.opensAt;
      if (st !== gv.stages.at(-1) && (!st.letter?.title || !st.letter?.body)) err(`grove stage ${st.id}: needs a letter`);
      for (const b of st.bundles ?? []) {
        if (icons && !icons[b.icon]) err(`grove stage ${st.id}/${b.id}: unknown icon ${b.icon}`);
        if (b.minStar !== undefined && b.minStar !== 1 && b.minStar !== 2) err(`grove stage ${st.id}/${b.id}: minStar must be 1 or 2`);
        for (const [it, n] of Object.entries(b.wants ?? {})) {
          if (it !== 'coins' && !items[it]) err(`grove stage ${st.id}/${b.id}: unknown item ${it}`);
          if (!(Number.isInteger(n) && n > 0)) err(`grove stage ${st.id}/${b.id}: ${it} needs a whole number above 0`);
        }
      }
    }
    const decor = read('buildings.json').buildings.find((b) => b.id === gv.finale?.decor);
    if (!decor) err(`grove finale: decor ${gv.finale?.decor} is not a building`);
  }
  // 1.20 Woodland Friends: each critter family lives in the glade or a region, eats real items and gives real items
  const cr = wd.critters;
  if (cr) {
    if (!(cr.visitsPerHeart >= 1 && cr.maxHearts >= 1)) err('woods critters: needs visitsPerHeart and maxHearts');
    const cIds = new Set();
    for (const c of cr.families ?? []) {
      if (cIds.has(c.id) || !/^[a-z]+$/.test(c.id)) err(`woods critter ${c.id}: id must be unique lowercase letters`);
      cIds.add(c.id);
      if (c.region !== 'glade' && !rIds.has(c.region)) err(`woods critter ${c.id}: unknown region ${c.region}`);
      if (icons && !icons[c.icon]) err(`woods critter ${c.id}: unknown icon ${c.icon}`);
      if (!(c.from >= 0 && c.from < 24 && c.to >= 0 && c.to < 24 && c.from !== c.to)) err(`woods critter ${c.id}: from and to must be different hours 0-23`);
      if (!c.treats?.length) err(`woods critter ${c.id}: needs treats`);
      for (const t of c.treats ?? []) if (!items[t]) err(`woods critter ${c.id}: treat ${t} is not an item`);
      for (const g of c.gifts ?? []) if (!items[g.id] || !(g.w > 0)) err(`woods critter ${c.id}: gift ${g.id} must be an item with a weight`);
      if (!items[c.rare]) err(`woods critter ${c.id}: rare gift ${c.rare} is not an item`);
      if (!c.name || !c.about || !c.when || !c.model) err(`woods critter ${c.id}: needs name, about, when and model`);
    }
    const shelf = read('museum.json').shelves.find((s) => s.id === 'woodland');
    for (const c of cr.families ?? []) if (shelf && !shelf.items.includes(c.rare)) err(`woods critter ${c.id}: rare gift ${c.rare} is missing from the Woodland Gifts shelf`);
  }
  if (wd.wren) {
    if (!rIds.has(wd.wren.region)) err(`woods wren: unknown region ${wd.wren.region}`);
    if (!(Array.isArray(wd.wren.need) && wd.wren.need[0] >= 1 && wd.wren.need[1] >= wd.wren.need[0])) err('woods wren: need is [min, max]');
  }
  // 1.21 camping and woods weather
  if (wd.camp && !(wd.camp.finds >= 1 && wd.camp.pitchFrom >= 12 && wd.camp.wakeFrom >= 0 && wd.camp.wakeFrom < 12)) err('woods camp: needs finds, an evening pitchFrom and a morning wakeFrom');
  for (const id of wd.weather?.rarePan ?? []) if (!items[id]) err(`woods weather: rare pan find ${id} is not an item`);
  if (/\u2014|\u2013/.test(JSON.stringify(wd))) err('woods.json: no em or en dashes in text');
}
// 1.26 Estate Projects: stages are restoration rooms estate_<project>_<stage> with real items that exist by the
// project's level, a villager, a letter (but the last), and a finale decor that is a building
{
  const items = read('items.json').items, villagers = new Set(read('villagers.json').villagers.map((v) => v.id));
  const bl = Object.fromEntries(read('buildings.json').buildings.map((b) => [b.id, b.level]));
  const lvl = {};
  for (const c of read('crops.json').crops) lvl[c.id] = c.level;
  for (const t of read('crops.json').trees ?? []) lvl[t.item] = t.level;
  for (const a of read('animals.json').animals) lvl[a.product] = a.level;
  for (const r of read('recipes.json').recipes) lvl[r.item] = Math.min(lvl[r.item] ?? 999, Math.max(r.level, bl[r.building] ?? 1));
  const seen = new Set();
  for (const p of read('estate.json').projects ?? []) {
    if (!villagers.has(p.villager)) err(`estate ${p.id}: unknown villager ${p.villager}`);
    if (!(p.finale?.decor in bl)) err(`estate ${p.id}: finale decor ${p.finale?.decor} is not a building`);
    for (const st of p.stages ?? []) {
      if (!st.id.startsWith(`estate_${p.id}_`) || seen.has(st.id)) err(`estate stage ${st.id}: id must be a new estate_${p.id}_<name>`);
      seen.add(st.id);
      if (!villagers.has(st.villager)) err(`estate stage ${st.id}: unknown villager ${st.villager}`);
      if (st !== p.stages.at(-1) && (!st.letter?.title || !st.letter?.body)) err(`estate stage ${st.id}: needs a letter`);
      for (const b of st.bundles ?? []) {
        if (icons && !icons[b.icon]) err(`estate bundle ${st.id}/${b.id}: unknown icon ${b.icon}`);
        for (const [it, n] of Object.entries(b.wants ?? {})) {
          if (it !== 'coins' && !items[it]) err(`estate bundle ${st.id}/${b.id}: unknown item ${it}`);
          if (!(Number.isInteger(n) && n > 0)) err(`estate bundle ${st.id}/${b.id}: ${it} needs a whole number above 0`);
          if (lvl[it] !== undefined && lvl[it] > p.opensAt) err(`estate bundle ${st.id}/${b.id}: ${it} unlocks at level ${lvl[it]}, after the project opens (${p.opensAt})`);
        }
      }
    }
  }
}
// 1.27 the treehouse (rooms treehouse_<name> with real items) and the Wildlife Album (species with known sets,
// places and hours, every set reachable)
{
  const items = read('items.json').items, villagers = new Set(read('villagers.json').villagers.map((v) => v.id));
  const th = read('woods.json').treehouse;
  const ids = new Set();
  for (const r of [...(th?.stages ?? []), ...(th?.furnishings ?? [])]) {
    if (!/^treehouse_[a-z]+$/.test(r.id) || ids.has(r.id)) err(`treehouse room ${r.id}: id must be a new treehouse_<name>`);
    ids.add(r.id);
    if (!villagers.has(r.villager)) err(`treehouse room ${r.id}: unknown villager ${r.villager}`);
    for (const b of r.bundles ?? []) {
      if (icons && !icons[b.icon]) err(`treehouse bundle ${r.id}/${b.id}: unknown icon ${b.icon}`);
      for (const [it, n] of Object.entries(b.wants ?? {})) if ((it !== 'coins' && !items[it]) || !(Number.isInteger(n) && n > 0)) err(`treehouse bundle ${r.id}/${b.id}: bad want ${it} ${n}`);
    }
  }
  const wl = read('wildlife.json');
  const sets = new Set(wl.sets.map((x) => x.id)), places = new Set(['farm', 'glade', ...read('woods.json').regions.map((r) => r.id)]);
  const seen = new Set();
  for (const sp of wl.species) {
    if (seen.has(sp.id)) err(`wildlife ${sp.id}: duplicate id`);
    seen.add(sp.id);
    if (!sets.has(sp.set)) err(`wildlife ${sp.id}: unknown set ${sp.set}`);
    if (!places.has(sp.place)) err(`wildlife ${sp.id}: unknown place ${sp.place}`);
    if (!(sp.from >= 0 && sp.from <= 24 && sp.to >= 0 && sp.to <= 24 && sp.from !== sp.to)) err(`wildlife ${sp.id}: hours must be 0-24 and differ`);
    if (!(sp.chance > 0 && sp.chance <= 1)) err(`wildlife ${sp.id}: chance must be above 0 and at most 1`);
    if (icons && !icons[`wild_${sp.id}`]) err(`wildlife ${sp.id}: needs an icon wild_${sp.id}`);
  }
  for (const st of wl.sets) { if (!wl.species.some((sp) => sp.set === st.id)) err(`wildlife set ${st.id}: has no species`); if (icons && !icons[st.icon]) err(`wildlife set ${st.id}: unknown icon ${st.icon}`); }
}
// 1.25 farmhands and mastery lines
{
  const fh = read('farmhands.json');
  let prev = 0;
  for (const d of fh.hands ?? []) {
    if (!d.id || !d.name || !d.about || !(d.level >= prev)) err(`farmhand ${d.id}: needs id, name, about and a level not below the one before`);
    if (icons && !icons[d.icon]) err(`farmhand ${d.id}: unknown icon ${d.icon}`);
    prev = d.level;
  }
  for (const c of ['fields', 'animals', 'workshop']) if (!fh.chores?.[c]?.name || (icons && !icons[fh.chores[c].icon])) err(`farmhands: chore ${c} needs a name and a known icon`);
  if (!(fh.wage > 0 && fh.roundMinutes >= 1 && fh.fieldsPerRound >= 1)) err('farmhands: wage, roundMinutes and fieldsPerRound must be positive');
  const lines = read('mastery.json').lines ?? {};
  for (const kind of ['crop', 'workshop']) {
    const ids = (lines[kind] ?? []).map((l) => l.id).sort().join(',');
    if (ids !== 'gold,speed,yield') err(`mastery lines ${kind}: needs exactly yield, gold and speed`);
    for (const l of lines[kind] ?? []) if (!l.name || !l.text || (icons && !icons[l.icon])) err(`mastery line ${kind}/${l.id}: needs a name, text and a known icon`);
  }
}
// 1.24 villager arcs: letters in day order with text; the gift's items are real
{
  const items = read('items.json').items;
  for (const v of read('villagers.json').villagers) {
    if (!v.arc) continue;
    let prev = -1;
    for (const l of v.arc.letters ?? []) {
      if (!l.title || !l.body || !(l.day > prev)) err(`villager ${v.id} arc: letters need a title, a body and a later day each`);
      prev = l.day;
      for (const k of Object.keys(l.attach?.items ?? {})) if (!items[k]) err(`villager ${v.id} arc: unknown item ${k}`);
    }
    if (!v.arc.letters?.at(-1)?.attach) err(`villager ${v.id} arc: the last letter carries the gift`);
  }
}
// 1.20 every item has a use beyond selling: an ingredient, a bundle, a Museum piece, animal feed, a critter treat, a boat
// visitor's wish, a villager's favourite or a thing the game itself spends (seeds, fertiliser, bait, event tokens)
{
  const items = read('items.json').items, uses = new Set();
  const add = (k) => uses.add(k);
  for (const r of read('recipes.json').recipes) Object.keys(r.in).forEach(add);
  for (const r of read('crafting.json').recipes) Object.keys(r.in ?? {}).forEach(add);
  for (const room of read('restoration.json').rooms) for (const b of room.bundles) Object.keys(b.wants).forEach(add);
  for (const w of read('manor.json').wings) for (const b of w.bundles) Object.keys(b.wants).forEach(add);
  const wd = read('woods.json');
  for (const t of [...(wd.trails ?? []), ...(wd.grove?.stages ?? []), ...read('estate.json').projects.flatMap((p) => p.stages), ...(wd.treehouse?.stages ?? []), ...(wd.treehouse?.furnishings ?? [])]) for (const b of t.bundles) Object.keys(b.wants).forEach(add);
  for (const c of wd.critters?.families ?? []) c.treats.forEach(add);
  for (const s of read('museum.json').shelves) (s.items ?? []).forEach(add);
  for (const a of read('animals.json').animals) add(a.feed);
  for (const t of read('boatvisits.json').themes) t.items.forEach(add);
  for (const v of read('villagers.json').villagers) [...v.loves, ...v.likes].forEach(add);
  // 1.24 bouquets: every villager loves them (village.taste)
  for (const [k, it] of Object.entries(items)) if (it.bouquet) add(k);
  const fishData = read('fish.json');
  add(fishData.baitItem); add(fishData.luckyBait.item);
  // spent by the game's own code
  for (const k of ['rare_seed', 'quality_fertiliser', 'fertiliser']) add(k);
  for (const [k, it] of Object.entries(items)) if (it.cat !== 'event' && !uses.has(k)) err(`item ${k}: has no use (add it to a recipe, bundle, Museum shelf, boat wish list, treat or villager favourite)`);
}
// 1.28 Together: co-op projects need real items that exist by the project's level, real decorations, and the server's
// own copy of the catalog (coop_catalog in supabase/schema.sql) must match coop.json exactly
{
  const c = read('coop.json'), items = read('items.json').items;
  const bl = Object.fromEntries(read('buildings.json').buildings.map((b) => [b.id, b.level]));
  const lvl = {};
  for (const x of read('crops.json').crops) lvl[x.id] = x.level;
  for (const t of read('crops.json').trees ?? []) lvl[t.item] = t.level;
  for (const a of read('animals.json').animals) lvl[a.product] = a.level;
  for (const r of read('recipes.json').recipes) lvl[r.item] = Math.min(lvl[r.item] ?? 999, Math.max(r.level, bl[r.building] ?? 1));
  if (!(c.plaque in bl)) err(`coop: plaque ${c.plaque} is not a building`);
  if (c.maxGive !== 50 || c.givesPerDay !== 40 || c.days !== 30 || c.startsPerWeek !== 2) err('coop: maxGive 50, givesPerDay 40, days 30 and startsPerWeek 2 must match supabase/schema.sql');
  const ids = new Set();
  for (const p of c.projects) {
    if (!/^[a-z_]{1,30}$/.test(p.id) || ids.has(p.id)) err(`coop project ${p.id}: id must be unique lowercase letters`);
    ids.add(p.id);
    if (!(p.decor in bl)) err(`coop project ${p.id}: decor ${p.decor} is not a building`);
    if (icons && !icons[p.icon]) err(`coop project ${p.id}: unknown icon ${p.icon}`);
    if (!(p.level >= c.level)) err(`coop project ${p.id}: level must be at least ${c.level}`);
    for (const [k, n] of Object.entries(p.needs)) {
      if (!items[k]) err(`coop project ${p.id}: unknown item ${k}`);
      if (!(Number.isInteger(n) && n > 0)) err(`coop project ${p.id}: ${k} needs a whole number above 0`);
      if (lvl[k] !== undefined && lvl[k] > p.level) err(`coop project ${p.id}: ${k} unlocks at level ${lvl[k]}, after the project (${p.level})`);
    }
  }
  const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const m = sql.match(/function public\.coop_catalog\(\)[\s\S]*?select '(\{[^']*\})'::jsonb/);
  const want = Object.fromEntries(c.projects.map((p) => [p.id, { level: p.level, needs: p.needs }]));
  if (!m || JSON.stringify(JSON.parse(m[1])) !== JSON.stringify(want)) err('supabase/schema.sql coop_catalog: does not match src/data/coop.json (regenerate it)');
}

// 1.22 the server's leaderboard check knows the XP table: supabase/schema.sql level_for_xp must match levels.json
{
  const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const lv = read('levels.json'), cum = [0];
  for (const x of lv.levels.slice(0, -1)) cum.push(cum[cum.length - 1] + x.xpToNext);
  const m = sql.match(/level_for_xp[\s\S]*?array\[([0-9,]+)\]::bigint\[\]/);
  const step = sql.match(/\(\(p_xp - x\.cum\[array_length\(x\.cum, 1\)\]\) \/ (\d+)\)/);
  if (!m || m[1] !== cum.join(',')) err('supabase/schema.sql level_for_xp: the XP table does not match levels.json (regenerate it)');
  if (!step || Number(step[1]) !== lv.levels[lv.levels.length - 1].xpToNext || lv.endless.xpPerLevel !== 0) err('supabase/schema.sql level_for_xp: the XP per level past the table does not match levels.json (it assumes endless.xpPerLevel 0)');
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
{
  const bv = read('boatvisits.json'), items = read('items.json').items;
  if (!(bv.daysPerWeek >= 1 && bv.daysPerWeek <= 7)) err('boatvisits: daysPerWeek must be 1-7');
  if (!(bv.hours[0] < bv.hours[1])) err('boatvisits: hours must ascend');
  if (!(bv.coinMult >= 1 && bv.coinMult <= 3)) err('boatvisits: coinMult out of range');
  const seen = new Set();
  for (const t of bv.themes) {
    if (seen.has(t.id)) err(`boatvisits: duplicate theme ${t.id}`);
    seen.add(t.id);
    if (t.items.length < 5) err(`boatvisits: ${t.id} needs at least 5 items`);
    for (const i of t.items) if (!items[i]) err(`boatvisits: ${t.id} item ${i} does not exist`);
    if (/\u2014/.test(JSON.stringify(t))) err(`boatvisits: ${t.id} has an em dash`);
  }
}
{
  // 1.13 endless levels: the table must be continuous up to tableMax, and the endless rules sane
  const t = levels.levels, e = levels.endless;
  t.forEach((l, i) => { if (l.level !== i + 1) err(`levels: entry ${i} is level ${l.level}`); if (i < t.length - 1 && !(l.xpToNext > 0)) err(`levels: level ${l.level} needs xpToNext`); });
  if (t.length !== e.tableMax) err(`levels: table has ${t.length} levels but endless.tableMax is ${e.tableMax}`);
  if (!(levels.maxLevel > e.tableMax && levels.maxLevel <= 999)) err('levels: maxLevel must be above tableMax and at most 999 (the server limit)');
  if (!(levels.authoredMax >= e.tableMax && levels.authoredMax <= levels.maxLevel)) err('levels: authoredMax out of range');
  if (e.markerFrom <= e.tableMax || e.markerTo > levels.maxLevel || e.markerTo < e.markerFrom) err('levels: marker range out of range');
}
{
  // 1.14 Master Challenges and the Gem Boutique
  const md = read('master.json'), bd = read('buildings.json').buildings, ids = new Set(bd.map((b) => b.id));
  const statsKnown = new Set(read('achievements.json').achievements.map((a) => a.stat));
  if (md.challenges.length < 6) err('master: needs at least 6 challenges (3 are picked each week)');
  const seen = new Set();
  for (const c of md.challenges) {
    if (seen.has(c.id)) err(`master: duplicate challenge ${c.id}`);
    seen.add(c.id);
    if (!c.text.includes('{n}') || !(c.base >= 1)) err(`master: challenge ${c.id} needs {n} in its text and a base`);
    if (icons && !icons[c.icon]) err(`master: challenge ${c.id} has unknown icon ${c.icon}`);
  }
  for (const s of md.streaks) if (!ids.has(s.id)) err(`master: streak prize ${s.id} is not a building`);
  if (md.boutique.items.length < md.boutique.slots) err('master: boutique needs at least as many items as slots');
  for (const i of md.boutique.items) { if (!ids.has(i.id)) err(`master: boutique item ${i.id} is not a building`); if (!(i.price > 0)) err(`master: boutique item ${i.id} needs a price`); }
  void statsKnown;
}
if (errors.length) {
  console.error(`data invalid:\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log(`data ok: ${crops.length} crops, ${trees.length} trees, ${animals.length} animals, ${recipes.length} recipes, ${buildings.length} buildings, ${achievements.length} achievements, every level 2-${levels.authoredMax} unlocks something (then endless Level Markers to ${levels.endless.markerTo})`);
{
  // 1.15 Upkeep
  const u = read('upkeep.json');
  if (!(u.fromLevel >= 1) || !(u.animals.sickChance >= 0 && u.animals.sickChance <= 0.2)) err('upkeep: fromLevel or sickChance out of range');
  if (!(u.animals.wanderAfterDays >= 2) || !(u.animals.returnWithinDays >= 3)) err('upkeep: animals need at least 2 sick days before wandering and 3 days to return');
  if (!(u.wear.weathered < u.wear.worn && u.wear.worn <= u.wear.broken && u.wear.broken <= 100)) err('upkeep: wear stages must rise to at most 100');
  if (!(u.away.rate >= 0 && u.away.rate < 1) || !(u.away.maxDays >= 1)) err('upkeep: away rate must be 0 to under 1 and maxDays at least 1');
  if (!(u.wear.perDay > 0 && u.wear.perDay <= 5)) err('upkeep: wear perDay out of range');
}
