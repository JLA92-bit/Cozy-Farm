// Unit tests for the phone notification planner (src/notify/Plan.ts): quiet hours, grouping, limits.
// usage: node tools/test-notify.mjs        (runs in a few time zones; needs Node 22.18+ for .ts imports)
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

if (!process.env.NOTIFY_TEST_CHILD) {
  let failed = 0;
  for (const tz of ['Europe/London', 'America/New_York', 'Asia/Tokyo', 'UTC']) {
    const r = spawnSync(process.execPath, [process.argv[1]], { env: { ...process.env, TZ: tz, NOTIFY_TEST_CHILD: '1' }, encoding: 'utf8' });
    process.stdout.write(`[${tz}] ${r.stdout}${r.stderr}`);
    if (r.status !== 0) failed++;
  }
  console.log(failed ? `FAILED in ${failed} time zone(s)` : 'all notification planner tests passed');
  process.exit(failed ? 1 : 0);
}

const P = await import('../src/notify/Plan.ts');
const { planNotifications, afterQuietHours, inQuietHours, nextLocalTime, defaultNotifyPrefs, sanitizeNotifyPrefs, planKey } = P;

let n = 0;
const test = (name, fn) => { fn(); n++; };
const MIN = 60e3, HOUR = 3600e3;
/** a local time on a fixed day (no DST change on 2026-06-10) */
const at = (h, m = 0, day = 10) => new Date(2026, 5, day, h, m, 0, 0).getTime();
const prefs = (o = {}) => ({ ...defaultNotifyPrefs(), enabled: true, ...o });
const hm = (t) => { const d = new Date(t); return `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

test('quiet hours across midnight', () => {
  assert.equal(inQuietHours(at(21, 0), 1260, 480), true);
  assert.equal(inQuietHours(at(20, 59), 1260, 480), false);
  assert.equal(inQuietHours(at(3, 0), 1260, 480), true);
  assert.equal(inQuietHours(at(8, 0), 1260, 480), false);
  assert.equal(hm(afterQuietHours(at(22, 30), 1260, 480)), '11 08:00');
  assert.equal(hm(afterQuietHours(at(2, 15), 1260, 480)), '10 08:00');
  assert.equal(afterQuietHours(at(12, 0), 1260, 480), at(12, 0));
});
test('quiet hours inside one day and switched off', () => {
  assert.equal(hm(afterQuietHours(at(13, 0), 720, 840)), '10 14:00');
  assert.equal(afterQuietHours(at(3, 0), 600, 600), at(3, 0));
});
test('quiet hours over a daylight saving change (Europe and US spring forward in March)', () => {
  for (const [y, mo, d] of [[2026, 2, 28], [2026, 2, 7]]) {
    const end = afterQuietHours(new Date(y, mo, d, 22, 0).getTime(), 1260, 480);
    const e = new Date(end);
    assert.deepEqual([e.getDate(), e.getHours(), e.getMinutes()], [d + 1, 8, 0]);
  }
});
test('next local time', () => {
  assert.equal(hm(nextLocalTime(at(9, 0), 600)), '10 10:00');
  assert.equal(hm(nextLocalTime(at(10, 0), 600)), '11 10:00');
});
test('off = nothing', () => {
  assert.deepEqual(planNotifications([{ kind: 'crops', at: at(12) }], prefs({ enabled: false }), at(10)), []);
});
test('skips past, almost-now, beyond 24 h, and switched-off kinds', () => {
  const ev = [
    { kind: 'crops', at: at(9), what: 'Wheat' },
    { kind: 'crops', at: at(10, 1), what: 'Wheat' },
    { kind: 'goods', at: at(12), what: 'Bread' },
    { kind: 'animals', at: at(11), what: 'Egg' },
    { kind: 'crops', at: at(11, 0, 11), what: 'Corn' },
  ];
  const plan = planNotifications(ev, prefs({ animals: false }), at(10));
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, 'goods');
  assert.equal(plan[0].body, 'Bread is ready to collect.');
});
test('one crops notification per 30 min window, fired when the last one is ready', () => {
  const ev = [12 * 60, 12 * 60 + 10, 12 * 60 + 25, 12 * 60 + 40, 13 * 60 + 30].map((m, i) => ({ kind: 'crops', at: at(0) + m * MIN, what: i % 2 ? 'Corn' : 'Wheat' }));
  const plan = planNotifications(ev, prefs(), at(10));
  assert.deepEqual(plan.map((p) => hm(p.fireAt)), ['10 12:40', '10 13:30']);
  assert.equal(plan[0].body, 'Wheat and corn are ready to harvest.');
  assert.equal(plan[0].title, 'Harvest time!');
});
test('quiet hours move to the end and collapse', () => {
  const ev = [{ kind: 'crops', at: at(22), what: 'Wheat' }, { kind: 'crops', at: at(23, 30), what: 'Carrot' }, { kind: 'animals', at: at(4, 0, 11), what: 'Milk' }];
  const plan = planNotifications(ev, prefs(), at(20));
  assert.equal(plan.length, 1);
  assert.equal(hm(plan[0].fireAt), '11 08:00');
  assert.equal(plan[0].kind, 'mixed');
  assert.equal(plan[0].body, 'Wheat and carrot are ready to harvest. Fresh milk ready to collect.');
});
test('different kinds close together join; far apart stay', () => {
  const ev = [{ kind: 'crops', at: at(12) }, { kind: 'goods', at: at(12, 8), what: 'Butter' }, { kind: 'truck', at: at(15) }];
  const plan = planNotifications(ev, prefs(), at(10));
  assert.deepEqual(plan.map((p) => [p.kind, hm(p.fireAt)]), [['mixed', '10 12:08'], ['truck', '10 15:00']]);
  assert.equal(plan[0].body, 'Your crops are ready to harvest. Butter is ready to collect.');
  assert.equal(plan[1].title, 'The truck is here!');
});
test('a chain of close events cannot push a joined notification far out', () => {
  const ev = [{ kind: 'crops', at: at(12) }, { kind: 'goods', at: at(12, 9) }, { kind: 'animals', at: at(12, 18) }, { kind: 'sales', at: at(12, 27) }];
  const plan = planNotifications(ev, prefs(), at(10));
  assert.deepEqual(plan.map((p) => hm(p.fireAt)), ['10 12:09', '10 12:27']);
});
test('at most 6 a day, earliest first', () => {
  const ev = Array.from({ length: 20 }, (_, i) => ({ kind: 'crops', at: at(11) + i * HOUR, what: 'Wheat' }));
  const plan = planNotifications(ev, prefs({ quietStart: 0, quietEnd: 0 }), at(10));
  assert.equal(plan.length, 6);
  assert.equal(hm(plan[0].fireAt), '10 11:00');
  assert.ok(plan.every((p, i) => i === 0 || p.fireAt > plan[i - 1].fireAt));
});
test('daily reminder may be planned up to 36 h ahead; others 24 h', () => {
  const plan = planNotifications([{ kind: 'daily', at: at(10, 0, 11) }, { kind: 'crops', at: at(10, 0, 11) + 10 * MIN }], prefs(), at(9));
  assert.deepEqual(plan.map((p) => p.kind), ['daily']);
});
test('texts: no long dashes, within server limits', () => {
  const names = ['Wheat', 'Corn', 'Carrot', 'Sugarcane', 'Pumpkin'];
  const ev = [];
  for (const kind of ['crops', 'animals', 'goods', 'sales', 'truck', 'daily']) names.forEach((w, i) => ev.push({ kind, at: at(12) + i * MIN, what: w }));
  const plan = planNotifications(ev, prefs(), at(10));
  for (const p of planNotifications(ev.filter((e) => e.kind !== 'daily'), prefs(), at(10)).concat(plan)) {
    assert.ok(!/[–—]/.test(p.title + p.body), p.body);
    assert.ok(p.title.length <= 80 && p.body.length <= 200 && p.body.length > 0);
  }
  assert.ok(plan[0].body.endsWith('And more!'), plan[0].body);
});
test('prefs repair and plan key', () => {
  assert.deepEqual(sanitizeNotifyPrefs(null), defaultNotifyPrefs());
  const s = sanitizeNotifyPrefs({ enabled: true, crops: 'yes', quietStart: 1500, quietEnd: -60 });
  assert.equal(s.enabled, true);
  assert.equal(s.crops, true);
  assert.equal(s.quietStart, 60);
  assert.equal(s.quietEnd, 1380);
  const a = planNotifications([{ kind: 'crops', at: at(12) }], prefs(), at(10));
  assert.equal(planKey(a), planKey(planNotifications([{ kind: 'crops', at: at(12) + 1000 }], prefs(), at(10))));
});
console.log(`${n} tests ok`);
