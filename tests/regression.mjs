// Regression checks for saves, upkeep and the Master board, run against the production build in headless Chromium.
// usage: npm run test:regression   (builds, then runs this file; or `node tests/regression.mjs` after `vite build`)
// Chromium: CHROMIUM_PATH, else the cloud image's /opt/pw-browsers copy, else an installed Google Chrome.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.TEST_PORT ?? 4317);
const ROOT = `http://localhost:${PORT}/play/`;
const BLANK = `${ROOT}favicon.svg`; // same origin, no game: a safe page to edit storage on
const KEY = 'cozy-acres-save', BACKUP = 'cozy-acres-save-backup', UNREADABLE = 'cozy-acres-save-unreadable';
const DAY = 86400000;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(ROOT)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}

const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const browser = await chromium.launch({ executablePath: exe, channel: exe ? undefined : 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
let errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`); if (!ok) failed++; };
const setStorage = async (items) => {
  await page.goto(BLANK);
  await page.evaluate((o) => { localStorage.clear(); for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); }, items);
};
const boot = async () => {
  errors = [];
  await page.goto(ROOT);
  await page.waitForFunction(() => window.__game?.state && window.__scene, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
};
const state = () => page.evaluate(() => window.__game.state);
const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const mondayUtc = () => { const d = new Date(); const back = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10); };

try {
  // a clean farm to build the cases from
  await setStorage({});
  await boot();
  check('fresh boot has no errors', errors.length === 0, errors.join(' | '));
  const base = await page.evaluate(() => {
    const s = window.__game.state;
    s.player.created = true; s.tutorial.done = true; s.player.level = 30; s.player.coins = 50000; s.player.name = 'Test Farm';
    return JSON.parse(JSON.stringify(s));
  });
  const withCoop = (s, animals) => { s.buildings.push({ uid: 9001, type: 'coop', x: 30, z: 30, rot: 0, level: 3, animals }); return s; };
  const copy = () => JSON.parse(JSON.stringify(base));

  // 1. a farm from before 1.8 (every newer field missing) loads with its buildings
  {
    const old = withCoop(copy(), [{ fedAt: null }, { fedAt: 0 }]);
    for (const k of ['village', 'mail', 'help', 'welcome18', 'quality', 'skills', 'restoration', 'upkeep', 'master', 'boutique', 'endless', 'ranks', 'festivals', 'woods', 'museum']) delete old[k];
    await setStorage({ [KEY]: JSON.stringify(old) });
    await boot();
    const s = await state();
    check('pre-1.8 save keeps the farm', s.player.name === 'Test Farm' && s.buildings.some((b) => b.uid === 9001), `name ${s.player.name}`);
    check('pre-1.8 save boots without errors', errors.length === 0, errors.join(' | '));
  }

  // 2. a damaged save with a good backup loads the backup
  {
    await setStorage({ [KEY]: '{"version":1,"player":', [BACKUP]: JSON.stringify(base) });
    await boot();
    check('damaged save falls back to the backup', (await state()).player.name === 'Test Farm');
  }

  // 3. a damaged save with no backup: a new farm, but the damaged text is kept aside and survives saving
  {
    await setStorage({ [KEY]: '{"version":1,"player":{"name":"Test Farm"' });
    await boot();
    await page.evaluate(() => { dispatchEvent(new Event('pagehide')); dispatchEvent(new Event('pagehide')); });
    const kept = await page.evaluate((k) => localStorage.getItem(k), UNREADABLE);
    check('unreadable save is kept aside', !!kept && kept.includes('Test Farm'));
  }

  // 4. a save from a newer version: the boot stops with an update screen and the save is never touched
  {
    const newer = JSON.stringify({ ...base, version: 99 });
    await setStorage({ [KEY]: newer, [BACKUP]: JSON.stringify(base) });
    errors = [];
    await page.goto(ROOT);
    await page.waitForTimeout(8000);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.boot-actions button')].map((b) => b.textContent));
    await page.evaluate(() => { dispatchEvent(new Event('pagehide')); document.dispatchEvent(new Event('visibilitychange')); });
    const after = await page.evaluate((k) => localStorage.getItem(k), KEY);
    check('newer save shows the update screen', shown.includes('Update now'), JSON.stringify(shown));
    check('newer save is left exactly as it was', after === newer);
  }

  // 5. a Master board naming a challenge that no longer exists: no crash, the side bar still works
  {
    const m = copy(); m.player.level = 55;
    m.master = { week: mondayUtc(), base: { orders_completed: 0 }, ids: ['orders', 'no_such_challenge', 'pats'], claimed: [], streak: 2, best: 2, done: false };
    await setStorage({ [KEY]: JSON.stringify(m) });
    await boot();
    const ids = await page.evaluate(() => window.__master.list().map((c) => c.id));
    check('unknown Master challenge is dropped', JSON.stringify(ids) === '["orders","pats"]', JSON.stringify(ids));
    check('Master board boots without errors', errors.length === 0, errors.join(' | '));
    // 6. the per-animal Pat counts toward "Pat your animals" (and tapping a home does not)
    const prog = await page.evaluate(() => {
      const g = window.__game;
      g.incStat('animal_pets', 50);
      const before = window.__master.list().find((c) => c.id === 'pats').progress;
      g.incStat('animal_pats', 2);
      return [before, window.__master.list().find((c) => c.id === 'pats').progress];
    });
    check('Pat button counts for the Master challenge', prog[0] === 0 && prog[1] === 2, JSON.stringify(prog));
  }

  // 7. coming back after 14 days away: nothing wanders off on the first day back, and every unwell animal has 2 more days
  {
    const u = withCoop(copy(), [
      { fedAt: null, name: 'Longsick', born: Date.now() - 10 * DAY, sickAt: Date.now() - 20 * DAY, sickDays: 3 },
      { fedAt: null, name: 'Fine', born: Date.now() - 10 * DAY },
    ]);
    u.upkeep = { day: localDay(Date.now() - 15 * DAY), lost: [{ animal: 'chicken', name: 'Roamer', left: 1 }] };
    await setStorage({ [KEY]: JSON.stringify(u) });
    await boot();
    const s = await state();
    const coop = s.buildings.find((b) => b.uid === 9001);
    const sick = coop.animals.find((a) => a.name === 'Longsick');
    check('no wander-off on the first day back', !!sick && !s.upkeep.lost.some((l) => l.name === 'Longsick'), JSON.stringify(s.upkeep.lost));
    check('unwell animals have two more days after a break', !!sick && sick.sickDays <= 2, String(sick?.sickDays));
    check('a wanderer is still there after a break', s.upkeep.lost.some((l) => l.name === 'Roamer'));
  }

  // 8. an animal that wanders off on a normal day keeps the full return window
  {
    const w = withCoop(copy(), [{ fedAt: null, name: 'Wanderer', born: Date.now() - 10 * DAY, sickAt: Date.now() - 4 * DAY, sickDays: 3.5 }]);
    w.upkeep = { day: localDay(Date.now() - DAY), lost: [] };
    await setStorage({ [KEY]: JSON.stringify(w) });
    await boot();
    const lost = (await state()).upkeep.lost.find((l) => l.name === 'Wanderer');
    check('wanderer keeps the full return window', lost?.left === 6, JSON.stringify(lost));
  }

  // 9. upkeep switched off from the dashboard (dial 0): unwell animals are well again
  {
    const h = withCoop(copy(), [{ fedAt: Date.now() - 1000, name: 'Poorly', born: Date.now() - 10 * DAY, sickAt: Date.now() - DAY, sickDays: 1 }]);
    h.upkeep = { day: localDay(Date.now()), lost: [] };
    await setStorage({ [KEY]: JSON.stringify(h), 'cozy-config-1.9': JSON.stringify({ upkeep: 0 }) });
    await boot();
    const a = (await state()).buildings.find((b) => b.uid === 9001).animals[0];
    check('dial 0 makes unwell animals well', !a.sickAt);
  }
  // 1.17: a farm past level 60 gets Hazel's "shorter road" letter once, and a level it has now earned straight away
  {
    const r = copy(); r.player.level = 70; r.player.xp = 70000; delete r.endless;
    await setStorage({ [KEY]: JSON.stringify(r) });
    await boot();
    const s = await state();
    const letters = s.mail.letters.filter((l) => l.title === 'The road ahead got shorter');
    check('farms past 60 get the shorter-road letter once', letters.length === 1 && s.endless?.road === true, JSON.stringify({ n: letters.length, endless: s.endless }));
    check('a level already earned on the new curve is given', s.player.level === 71, `level ${s.player.level}`);
    await page.reload();
    await page.waitForFunction(() => window.__game?.state && window.__scene, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const again = (await state()).mail.letters.filter((l) => l.title === 'The road ahead got shorter').length;
    check('the shorter-road letter is not sent twice', again === 1, String(again));
  }

  // 1.18 Willowmere Manor: locked until the village festival, wings open in order and by level, the finale once
  {
    const rooms = ['pantry', 'barn', 'pier', 'kitchen', 'workshop', 'treasury'];
    const m = copy(); m.player.level = 70; m.player.coins = 2000000;
    m.restoration = { given: {}, done: rooms.slice(0, 5), seen: [] };
    await setStorage({ [KEY]: JSON.stringify(m) });
    await boot();
    const before = await page.evaluate(() => window.__restoration.isOpen('manor_grounds'));
    check('the manor is locked until the village is rebuilt', before === false);
    const wings = ['grounds', 'foundations', 'hall', 'kitchens', 'library', 'gardens', 'stables', 'ballroom'].map((w) => `manor_${w}`);
    const m2 = copy(); m2.player.level = 70; m2.player.coins = 2000000;
    // every wing but the ballroom done, and the ballroom one coin short of its last bundle
    m2.restoration = { given: { manor_ballroom: { banquet: { mushroom_soup: 50, garden_wrap: 40, pumpkin_spice_cake: 40, celebration_cake: 30 }, goldsvc: { cheese: 100, goat_cheese: 60, honey: 120 }, chandelier: { quartz: 30, topaz: 6, amethyst: 4, beeswax_candle: 200 }, music: { lavender_honey: 80, sunflower_honey: 80, hot_chocolate: 40 }, treasures: { amber: 4, clay_figure: 2, amphora: 2 }, wages: { coins: 999999 } } },
      done: [...rooms, ...wings.slice(0, 7)], seen: [], festival: Date.now() - 1000 };
    await setStorage({ [KEY]: JSON.stringify(m2) });
    await boot();
    const r = await page.evaluate(() => {
      const R = window.__restoration;
      const open = R.isOpen('manor_ballroom');
      const gave = R.give('manor_ballroom', 'wages', 'coins');
      const s = window.__game.state;
      return { open, gave, done: R.isDone('manor_ballroom'), manor: !!s.restoration.manor, decor: s.storage.willowmere ?? 0, letter: s.mail.letters.some((l) => l.title === 'Willowmere is open!') };
    });
    check('the last wing opens once the one before is rebuilt', r.open === true, JSON.stringify(r));
    check('finishing the ballroom opens Willowmere (letter and manor model)', r.gave === 1 && r.done && r.manor && r.decor === 1 && r.letter, JSON.stringify(r));
    // order: with the grounds not done, the foundations wing stays locked
    const m3 = copy(); m3.player.level = 70; m3.restoration = { given: {}, done: [...rooms], seen: [], festival: Date.now() - 1000 };
    await setStorage({ [KEY]: JSON.stringify(m3) });
    await boot();
    const order = await page.evaluate(() => [window.__restoration.isOpen('manor_grounds'), window.__restoration.isOpen('manor_foundations')]);
    check('manor wings open one after another', order[0] === true && order[1] === false, JSON.stringify(order));
    // the grand opening survives a reload
    await setStorage({ [KEY]: JSON.stringify({ ...m2, restoration: { ...m2.restoration, done: [...rooms, ...wings], manor: 12345 } }) });
    await boot();
    check('the grand opening is kept in the save', (await state()).restoration.manor === 12345);
    // coins paid part-way into a bundle are kept on load (they used to be dropped)
    const m4 = copy(); m4.player.level = 30; m4.restoration = { given: { treasury: { first: { coins: 4000 } } }, done: [], seen: [] };
    await setStorage({ [KEY]: JSON.stringify(m4) });
    await boot();
    check('coins given to a bundle survive a reload', (await state()).restoration.given.treasury?.first?.coins === 4000);
  }

  // 1.19 the Deep Woods: trails open regions; pans a day; taps refill; fireflies at night only; region forage; saved
  {
    const at = (hour) => { const n = new Date(); const t = new Date(n); t.setHours(hour, 0, 0, 0); return t.getTime() - n.getTime(); };
    const w = copy(); w.player.level = 40; w.debugTimeOffset = at(12);
    w.restoration = { given: {}, done: ['trail_creek', 'trail_pines', 'trail_hollow'], seen: [] };
    await setStorage({ [KEY]: JSON.stringify({ ...w, restoration: { given: {}, done: [], seen: [] } }) });
    await boot();
    const closed = await page.evaluate(() => [window.__woods.sys.regionOpen('creek'), window.__woods.sys.pan('creek')]);
    check('a region stays closed until its trail is restored', closed[0] === false && closed[1] === null, JSON.stringify(closed));
    await setStorage({ [KEY]: JSON.stringify(w) });
    await boot();
    const r = await page.evaluate(() => {
      const W = window.__woods.sys, g = window.__game;
      const pans = []; for (let i = 0; i < 7; i++) pans.push(!!W.pan('creek'));
      const tap1 = W.collectTap('pines:0'), tap2 = W.collectTap('pines:0');
      g.state.debugTimeOffset += 6 * 3600000 + 1000;
      const tap3 = W.collectTap('pines:0');
      const fireNoon = W.isFireflyTime('hollow');
      const spot = W.regionForage('hollow').find((s) => s.active && !s.picked);
      const before = spot ? g.count(spot.item) : 0;
      const picked = spot ? W.pick(spot.i) : null;
      return { pans: pans.filter(Boolean).length, tap1: !!tap1, tap2: !!tap2, tap3: !!tap3, fireNoon, picked: !!picked, gained: spot ? g.count(spot.item) - before : -1 };
    });
    check('six pans a day at Crystal Creek', r.pans === 6, JSON.stringify(r));
    check('a tap empties once and is full again after its hours', r.tap1 && !r.tap2 && r.tap3, JSON.stringify(r));
    check('region forage can be picked', r.picked && r.gained >= 1, JSON.stringify(r));
    check('no fireflies at midday', r.fireNoon === false, JSON.stringify(r));
    const w2 = { ...w, debugTimeOffset: at(21) };
    await setStorage({ [KEY]: JSON.stringify(w2) });
    await boot();
    const night = await page.evaluate(() => { const W = window.__woods.sys; const f = W.fireflies('hollow')[0]; return [W.isFireflyTime('hollow'), W.catchFirefly(f.id), W.catchFirefly(f.id)]; });
    check('fireflies can be caught at night, each once', night[0] === true && night[1] === 'firefly' && night[2] === null, JSON.stringify(night));
    await page.evaluate(() => { window.__woods.sys.pan('creek'); window.__woods.sys.collectTap('pines:1'); dispatchEvent(new Event('pagehide')); });
    await page.reload();
    await page.waitForFunction(() => window.__game?.state && window.__scene, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const kept = (await state()).woods;
    check('pans used and tap times are saved', kept.panned === 1 && typeof kept.taps?.['pines:1'] === 'number', JSON.stringify({ panned: kept.panned, taps: kept.taps }));
  }

  // 1.20 Woodland Friends: a treat waits on the stump until the family's hours, one visit a day, hearts every three
  // visits, closed regions cannot be fed, Wren's field note pays once; all of it saved
  {
    const at = (hour) => { const n = new Date(); const t = new Date(n); t.setHours(hour, 30, 0, 0); return t.getTime() - n.getTime(); };
    const w = copy(); w.player.level = 40; w.debugTimeOffset = at(14);
    w.inventory = { ...w.inventory, apple: 10, carrot: 10, chestnut: 5, moss: 20, river_mint: 20, wild_garlic: 20, bluebell: 20, watercress: 20, cattail: 20, pinecone: 20 };
    w.restoration = { given: {}, done: ['trail_hollow', 'trail_pines'], seen: [] };
    await setStorage({ [KEY]: JSON.stringify(w) });
    await boot();
    const r = await page.evaluate(() => {
      const C = window.__woods.critters, g = window.__game;
      const fedDeer = C.feed('deer', 'apple');
      const deerAt2pm = C.present('deer');
      const fedTwice = C.feed('deer', 'apple');
      const creekClosed = !C.open('fox') && !C.feed('fox', 'sardine');
      const fedRabbit = C.feed('rabbit', 'carrot');
      const rabbitHere = C.present('rabbit');
      const before = Object.values(g.state.inventory).reduce((a, b) => a + b, 0);
      const v1 = C.visit('rabbit');
      const again = C.visit('rabbit');
      const gifted = Object.values(g.state.inventory).reduce((a, b) => a + b, 0) - before;
      // two more days of visits: the third is a heart
      g.state.woods.critters.rabbit.seen = 'old'; C.feed('rabbit', 'carrot'); const v2 = C.visit('rabbit');
      g.state.woods.critters.rabbit.seen = 'old'; C.feed('rabbit', 'carrot'); const v3 = C.visit('rabbit');
      const note = C.note();
      g.addItem(note.item, note.n);
      const coins = g.state.player.coins;
      const paid = C.giveNote(), twice = C.giveNote();
      return { fedDeer, deerAt2pm, fedTwice, creekClosed, fedRabbit, rabbitHere, v1: !!v1, again: !!again, gifted, heart2: v2?.heart ?? null, heart3: v3?.heart ?? null, hearts: C.hearts('rabbit'), paid: !!paid, twice: !!twice, gain: g.state.player.coins - coins, deerTreat: C.treatOn('deer') };
    });
    check('a treat waits on the stump outside the family hours', r.fedDeer && !r.deerAt2pm && !r.fedTwice && r.deerTreat === 'apple', JSON.stringify(r));
    check('a stump in a closed region cannot be fed', r.creekClosed, JSON.stringify(r));
    check('a fed family visits in its hours, once a day, with a gift', r.fedRabbit && r.rabbitHere && r.v1 && !r.again && r.gifted === 1, JSON.stringify(r));
    check('every third visit is a heart', r.heart2 === null && r.heart3 === 1 && r.hearts === 1, JSON.stringify(r));
    check("Wren's field note pays once", r.paid && !r.twice && r.gain > 0, JSON.stringify(r));
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await page.reload();
    await page.waitForFunction(() => window.__game?.state && window.__scene, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const kept = (await state()).woods;
    check('critter visits, the waiting treat and field notes are saved', kept.critters?.rabbit?.visits === 3 && kept.critters?.deer?.treat === 'apple' && kept.notesDone === 1, JSON.stringify({ c: kept.critters, n: kept.notesDone }));
  }

  // 1.21 Care and Craft: vet and carpenter levels make care cheaper, a check-up keeps a home well, repairs get fresh
  // paint, the care round treats first and stops when the coins run out, Hardy Stock comes free at Animals level 7
  {
    const c = copy();
    c.buildings.push({ uid: 9101, type: 'vet_cottage', x: 6, z: 30, rot: 0, level: 1 }, { uid: 9102, type: 'carpenter', x: 10, z: 30, rot: 0, level: 1 });
    withCoop(c, [{ fedAt: null, born: Date.now(), sickAt: Date.now(), sickDays: 0 }, { fedAt: null, born: Date.now() }]);
    c.buildings.push({ uid: 9103, type: 'bakery', x: 20, z: 30, rot: 0, level: 1, wear: 80 });
    c.upkeep = { day: localDay(Date.now()), lost: [] };
    await setStorage({ [KEY]: JSON.stringify(c) });
    await boot();
    const r = await page.evaluate(() => {
      const U = window.__upkeep, g = window.__game, bs = g.state.buildings;
      const vet = bs.find((b) => b.type === 'vet_cottage'), car = bs.find((b) => b.type === 'carpenter'), coop = bs.find((b) => b.uid === 9001), bak = bs.find((b) => b.uid === 9103);
      const cost1 = U.repairCost(bak), noCheckup = !U.checkup(coop);
      vet.level = 2; car.level = 2;
      const cost2 = U.repairCost(bak);
      const checked = U.checkup(coop), chanceChecked = U.chance(coop, coop.animals[1], 0), secondToday = U.checkup(coop);
      delete coop.checkupUntil;
      const chanceBefore = U.chance(coop, coop.animals[1], 0);
      g.state.skills = { xp: { animals: 3500 }, perks: {}, headStart: true };
      const chanceHardy = U.chance(coop, coop.animals[1], 0);
      // just enough coins to treat, not to repair: the care round treats first and leaves the repair
      const plan = U.carePlan();
      g.state.player.coins = plan.treat[0].cost + 1;
      const round = U.careRound();
      g.state.player.coins = 50000;
      const round2 = U.careRound();
      return { cost1, cost2, noCheckup, checked, chanceChecked, secondToday, chanceBefore, chanceHardy, round, round2, paint: (bak.paintUntil ?? 0) > Date.now(), sick: coop.animals[0].sickAt ?? null };
    });
    check('a level 2 carpenter repairs for less', r.cost2 < r.cost1, JSON.stringify(r));
    check('a check-up needs vet level 2, keeps a home well and is once a day at level 2', r.noCheckup && r.checked && r.chanceChecked === 0 && !r.secondToday, JSON.stringify(r));
    check('Hardy Stock comes free at Animals level 7', r.chanceHardy < r.chanceBefore, JSON.stringify(r));
    check('the care round treats first and stops when the coins run out', r.round.treated === 1 && r.round.repaired === 0 && r.round.left === 1 && r.round2.repaired === 1 && r.sick === null, JSON.stringify(r));
    check('a repair by a level 2 carpenter gets fresh paint', r.paint, JSON.stringify(r));
  }

  // 1.20 every item has a use: a young farm only meets boats it can fill wishes for (never the Craft Fair or Picnic boat)
  {
    await setStorage({ [KEY]: JSON.stringify({ ...copy(), player: { ...copy().player, level: 12 } }) });
    await boot();
    const themes = await page.evaluate(() => {
      const B = window.__boat, g = window.__game, seen = new Set();
      if (!B) return null;
      for (let d = 0; d < 60; d++) { delete g.state.boatvisit; seen.add(B.theme(Date.now() + d * 86400000).id); }
      return [...seen];
    });
    check('a young farm never gets a boat it cannot fill', Array.isArray(themes) && themes.length > 0 && !themes.includes('crafts') && !themes.includes('picnic'), JSON.stringify(themes));
    // once a farm has made a few crafts, the Craft Fair boat comes and asks for them
    const crafts = await page.evaluate(() => {
      const B = window.__boat, g = window.__game, known = ['firefly_lantern', 'woodland_vase', 'gilded_vase'];
      for (const k of known) g.state.collection[`item:${k}`] = Date.now();
      for (let d = 0; d < 120; d++) {
        delete g.state.boatvisit;
        const at = Date.now() + d * 86400000;
        if (B.theme(at).id === 'crafts') return { want: Object.keys(B.want(at)), known };
      }
      return null;
    });
    check('the Craft Fair boat asks for crafts the farm has made', !!crafts && crafts.want.length === 3 && crafts.want.every((k) => crafts.known.includes(k)), JSON.stringify(crafts));
  }

  // 1.20.1 Spooky season: October only, cosmetic only (nothing is saved), and the Settings switch takes it away
  {
    await setStorage({ [KEY]: JSON.stringify(copy()) });
    await boot();
    const r = await page.evaluate(async () => {
      const october = new Date().getMonth() === 9;
      for (let i = 0; i < 40 && october && !window.__halloween.decor; i++) await new Promise((res) => setTimeout(res, 250));
      const d = window.__halloween.decor;
      const shown = !!d && d.group.visible;
      const before = Object.keys(window.__game.state).sort().join(',');
      const s = JSON.parse(localStorage.getItem('cozy-acres-settings') ?? '{}');
      localStorage.setItem('cozy-acres-settings', JSON.stringify({ ...s, halloween: false }));
      return { october, shown, keys: before.includes('halloween') };
    });
    check('the Halloween look shows in October only and saves nothing', r.shown === r.october && !r.keys, JSON.stringify(r));
  }

  // 10. 1.16: a level 1 farm does not load late-game models at boot, but one placed later still appears; different
  // decor kinds share a few batches instead of one draw each
  {
    await setStorage({});
    await boot();
    const r = await page.evaluate(async () => {
      const g = window.__game, f = window.__ui.scene.farm;
      const late = ['produce_carrots', 'produce_lettuce', 'produce_tomatoes'];
      const kinds = [...late, 'bench', 'statue_head', 'fountain', 'hedge', 'haybale', 'well', 'tent'];
      const placed = [];
      for (const t of kinds) {
        let done = false;
        for (let z = 14; z < 40 && !done; z++) for (let x = 14; x < 40 && !done; x++) if (g.canPlace(t, x, z, 0)) {
          const b = { uid: g.newUid(), type: t, x, z, rot: 0, level: 1 };
          g.state.buildings.push(b); g.markBuilding(b, b.uid); placed.push(b); done = true;
        }
      }
      for (const b of placed) await f.addBuilding(b);
      const shown = placed.filter((b) => { const v = f.views.get(b.uid); return v && (v.pool || v.obj); }).length;
      let batches = 0;
      window.__scene.scene.traverse((o) => { if (o.isBatchedMesh) batches++; });
      return { placed: placed.length, shown, batches };
    });
    check('late-game decor appears on a level 1 farm', r.placed === 10 && r.shown === 10, JSON.stringify(r));
    check('different decor kinds share a few batches', r.batches > 0 && r.batches <= r.placed / 2, JSON.stringify(r));
    // 1.20: a batch is drawn wherever its pieces are, also ones placed after it was first drawn (it used to keep
    // the bounds from its first draw, so big decor placed later vanished whenever those old bounds were off screen)
    const seen = await page.evaluate(async () => {
      const g = window.__game, f = window.__ui.scene.farm, s = window.__scene;
      for (let i = 0; i < 4; i++) { s.loop.wake(2); await new Promise((r) => requestAnimationFrame(r)); }
      let far = null;
      for (let z = 40; z > 10 && !far; z--) for (let x = 40; x > 10 && !far; x--) if (g.canPlace('water_tower', x, z, 0)) far = { uid: g.newUid(), type: 'water_tower', x, z, rot: 0, level: 1 };
      if (!far) return { placed: false };
      g.state.buildings.push(far); g.markBuilding(far, far.uid);
      await f.addBuilding(far);
      s.rig.focus(far.x, far.z, 12, 0);
      for (let i = 0; i < 4; i++) { s.loop.wake(2); await new Promise((r) => requestAnimationFrame(r)); }
      const v = f.views.get(far.uid);
      // every batch either is not culled as a whole or holds bounds that still cover all its pieces
      const drawn = [];
      s.scene.traverse((o) => {
        if (!o.isBatchedMesh) return;
        if (!o.frustumCulled || o.boundingSphere === null) { drawn.push(true); return; }
        const old = o.boundingSphere.clone();
        o.computeBoundingSphere();
        drawn.push(old.containsPoint(o.boundingSphere.center) && old.radius + 1e-3 >= o.boundingSphere.radius + old.center.distanceTo(o.boundingSphere.center));
      });
      return { placed: true, pooled: !!v?.pool, drawn };
    });
    check('decor placed later is drawn when the camera looks at it', seen.placed && seen.pooled && seen.drawn.every(Boolean), JSON.stringify(seen));
  }
} finally {
  await browser.close();
  stop();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
