// Server checks without a Postgres install: runs supabase/schema.sql twice on PGlite (Postgres 17 in WebAssembly) with a
// stub Supabase auth schema, then checks reports and blocks, the word filter, app_min, cloud save history, daily farm
// copies and gem spending (1.33.0-1.33.6). PGlite is not a project dependency; install it somewhere temporary:
//   mkdir -p /tmp/pg && (cd /tmp/pg && npm init -y >/dev/null && npm i @electric-sql/pglite)
//   NODE_PATH=/tmp/pg/node_modules node tools/schema-test.mjs
// Add checks here for new server work, then tell the owner to run the whole schema.sql in Supabase.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(`${process.env.NODE_PATH ?? process.cwd()}/`);
const { PGlite } = await import(require.resolve('@electric-sql/pglite'));
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const db = new PGlite();
const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key, is_anonymous boolean default true, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade, provider text, identity_data jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on function auth.uid() to anon, authenticated; grant execute on function auth.jwt() to anon, authenticated;
`;
let fails = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` ${detail}`}`); if (!cond) fails++; };

await db.exec(stub);
for (const run of [1, 2]) {
  try { await db.exec(schema); console.log(`schema run ${run}: ok`); } catch (e) { console.log(`schema run ${run}: FAILED`, e.message); process.exit(1); }
}

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c', ADM = '00000000-0000-0000-0000-0000000000ad';
const su = async (sql, p) => { await db.exec('reset role;'); return (await db.query(sql, p)).rows; };
const as = async (uid, sql, p = []) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); select set_config('request.jwt.claims', '{"is_anonymous": false}', false); set role authenticated;`);
  try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role;'); }
};
const err = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

for (const [id, name] of [[A, 'Ann'], [B, 'Bob'], [C, 'Cat'], [ADM, 'Admin']]) {
  await su(`insert into auth.users (id, is_anonymous) values ($1, false)`, [id]);
  await as(id, `select public.upsert_profile($1, $2, 5, 1000, 100, 0, 0, '{}'::jsonb)`, [name, `${name} Farm`]);
}
await su(`insert into auth.identities (user_id, provider, identity_data) values ($1, 'google', '{"email": "boss@example.com"}')`, [ADM]);
await su(`insert into public.admin_users (email) values ('boss@example.com')`);
ok('profiles made', (await su('select count(*)::int n from public.profiles'))[0].n === 4);

// a gift from B to A before any block, and one B's listing and farm
const g1 = (await as(B, `select (public.send_gift($1, '{"wheat": 2}'::jsonb, 0, 'you smell')).id`, [A]))[0].id;
ok('A sees the gift before blocking', (await as(A, 'select id from public.gifts where to_id = auth.uid()')).length === 1);
await su(`insert into public.listings (seller_id, seller_name, item, qty, price) values ($1, 'Bob', 'wheat', 1, 5)`, [B]);
await su(`insert into public.farm_snapshots (user_id, data) values ($1, '{}'::jsonb)`, [B]).catch(async (e) => console.log('snapshot insert:', e.message));
ok('A sees B listing before blocking', (await as(A, `select id from public.listings where seller_id = $1`, [B])).length === 1);

// report with the gift: the note is kept; a second report the same day adds nothing
ok('report made', (await as(A, `select public.report_player($1, 'message', 'mean note', 'gift', $2) r`, [B, g1]))[0].r === true);
ok('second report the same day is a no-op', (await as(A, `select public.report_player($1, 'name', null, 'card') r`, [B]))[0].r === false);
const rep = (await su('select * from public.player_reports'))[0];
ok('report keeps name, farm name and gift note', rep.name === 'Bob' && rep.farm_name === 'Bob Farm' && rep.gift_message === 'you smell', JSON.stringify(rep));
ok('cannot report yourself', /not yourself/.test(await err(() => as(A, `select public.report_player($1, 'name', null, 'card')`, [A])) ?? ''));
ok('bad reason refused', /bad reason/.test(await err(() => as(A, `select public.report_player($1, 'meh', null, 'card')`, [C])) ?? ''));
ok('players cannot read reports', /permission denied/.test(await err(() => as(A, 'select * from public.player_reports')) ?? ''));
ok('players cannot write blocks directly', /permission denied/.test(await err(() => as(A, `insert into public.player_blocks values ($1, $2)`, [A, C])) ?? ''));

// block: both ways
await as(A, 'select public.block_player($1)', [B]);
await as(A, 'select public.block_player($1)', [B]); // again is fine
ok('my_blocks lists B with the name', JSON.stringify(await as(A, 'select id, name from public.my_blocks()')) === JSON.stringify([{ id: B, name: 'Bob' }]));
ok('A no longer sees the gift from B', (await as(A, 'select id from public.gifts where to_id = auth.uid()')).length === 0);
ok('B still sees the gift they sent', (await as(B, 'select id from public.gifts where from_id = auth.uid()')).length === 1);
ok('A cannot gift B', /blocked/.test(await err(() => as(A, `select public.send_gift($1, '{"wheat": 1}'::jsonb, 0, null)`, [B])) ?? ''));
ok('B cannot gift A', /blocked/.test(await err(() => as(B, `select public.send_gift($1, '{"wheat": 1}'::jsonb, 0, null)`, [A])) ?? ''));
ok('C can still gift A', !(await err(() => as(C, `select public.send_gift($1, '{"wheat": 1}'::jsonb, 0, null)`, [A]))));
ok('A no longer sees B listing', (await as(A, `select id from public.listings where seller_id = $1`, [B])).length === 0);
ok('C still sees B listing', (await as(C, `select id from public.listings where seller_id = $1`, [B])).length === 1);
ok('A cannot see B farm', (await as(A, `select user_id from public.farm_snapshots where user_id = $1`, [B])).length === 0);
ok('B cannot see A farm either', (await as(B, `select user_id from public.farm_snapshots where user_id = $1`, [A])).length === 0);
ok('C sees B farm', (await as(C, `select user_id from public.farm_snapshots where user_id = $1`, [B])).length === 1);
ok('B cannot like A farm', /blocked/.test(await err(() => as(B, `select public.like_farm($1, null)`, [A])) ?? ''));
ok('B cannot help A farm', /blocked/.test(await err(() => as(B, `select public.help_farm($1, 'water', '{"type": "plot", "x": 1, "z": 1}'::jsonb)`, [A])) ?? ''));
ok('B cannot come for coffee', /blocked/.test(await err(() => as(B, `select public.coffee_visit($1)`, [A])) ?? ''));
ok('C can like A farm', !(await err(() => as(C, `select public.like_farm($1, null)`, [A]))));
ok('blocked_between: own pair is true', (await as(B, 'select public.blocked_between($1, $2) b', [B, A]))[0].b === true);
ok('blocked_between: others\' pairs say false', (await as(C, 'select public.blocked_between($1, $2) b', [A, B]))[0].b === false);
ok('assert_not_blocked is not callable by players', /permission denied/.test(await err(() => as(C, 'select public.assert_not_blocked($1, $2)', [A, B])) ?? ''));

// ask a friend: B's request with A in the audience is hidden from A
const askErr = await err(() => as(B, `select public.ask_help('wheat', 2, 'order', $1::uuid[])`, [`{${A},${C}}`]));
if (askErr) console.log('  (ask_help:', askErr, ')');
else {
  ok('A does not see B request', JSON.parse(JSON.stringify((await as(A, 'select public.friend_help_requests($1::uuid[]) r', [`{${B}}`]))[0].r)).length === 0);
  ok('C sees B request', (await as(C, 'select public.friend_help_requests($1::uuid[]) r', [`{${B}}`]))[0].r.length === 1);
}

// dashboard
ok('players cannot list reports', /not admin/.test(await err(() => as(A, `select public.admin_reports('open', 10)`)) ?? ''));
const list = (await as(ADM, `select public.admin_reports('open', 10) r`))[0].r;
ok('admin sees the open report', list.length === 1 && list[0].reporter_name === 'Ann' && list[0].reported_count === 1, JSON.stringify(list));
ok('admin open count', (await as(ADM, 'select public.admin_reports_open() r'))[0].r.open === 1);
await as(ADM, `select public.admin_report_set($1, 'actioned', 'locked for a day')`, [rep.id]);
ok('report actioned', (await su('select status, reviewed_by from public.player_reports'))[0].reviewed_by === 'boss@example.com');
const pr = (await as(ADM, 'select public.admin_player_reports($1) r', [B]))[0].r;
ok('player reports: about B, blocked by 1', pr.about.length === 1 && pr.blockedBy === 1, JSON.stringify(pr));

// unblock, then gifts work again
await as(A, 'select public.unblock_player($1)', [B]);
ok('after unblock A sees B listing again', (await as(A, `select id from public.listings where seller_id = $1`, [B])).length === 1);
ok('after unblock B can gift A', !(await err(() => as(B, `select public.send_gift($1, '{"wheat": 1}'::jsonb, 0, null)`, [A]))));

// deleting an account removes its blocks and reports
await as(C, 'select public.block_player($1)', [A]);
await as(C, `select public.report_player($1, 'cheating', null, 'leaderboard')`, [A]);
await as(A, 'select public.delete_my_account()');
ok('A deleted: no blocks or reports left about or by A', (await su(`select (select count(*) from public.player_blocks where blocker = $1 or blocked = $1)::int + (select count(*) from public.player_reports where reporter = $1 or reported = $1)::int n`, [A]))[0].n === 0);

// word filter
await as(C, `select public.upsert_profile('B1tch', 'Sh1t Farm', 5, 1000, 100, 0, 0, '{}'::jsonb)`);
const cp = (await su('select name, farm_name from public.profiles where id = $1', [C]))[0];
ok('unkind name becomes Farmer, unkind farm name dropped', cp.name === 'Farmer' && cp.farm_name === null, JSON.stringify(cp));
await as(C, `select public.upsert_profile('Cat', 'Grassy Acres', 5, 1000, 100, 0, 0, '{}'::jsonb)`);
ok('kind names kept', JSON.stringify((await su('select name, farm_name from public.profiles where id = $1', [C]))[0]) === JSON.stringify({ name: 'Cat', farm_name: 'Grassy Acres' }));
ok('unkind gift note refused', /unfriendly/.test(await err(() => as(C, `select public.send_gift($1, '{"wheat": 1}'::jsonb, 0, 'you f*ck1ng idiot fuuck')`, [B])) ?? ''));
ok('kind gift note sent', !(await err(() => as(C, `select public.send_gift($1, '{"wheat": 1}'::jsonb, 0, 'Happy harvest!')`, [B]))));

// 1.33.3 app_min
ok('app_min saved', JSON.stringify((await as(ADM, `select public.admin_set_game_config('app_min', '{"android": "1.33.3"}'::jsonb) c`))[0].c.app_min) === '{"android":"1.33.3"}');
ok('app_min rejects bad versions', /app_min needs/.test(await err(() => as(ADM, `select public.admin_set_game_config('app_min', '{"android": "1.33"}'::jsonb)`)) ?? ''));
ok('app_min rejects unknown keys', /app_min needs/.test(await err(() => as(ADM, `select public.admin_set_game_config('app_min', '{"web": "1.33.3"}'::jsonb)`)) ?? ''));
ok('players can read it', JSON.stringify((await as(B, 'select public.get_game_config() c'))[0].c.app_min) === '{"android":"1.33.3"}');
ok('players cannot set it', /not admin/.test(await err(() => as(B, `select public.admin_set_game_config('app_min', '{"ios": "9.9.9"}'::jsonb)`)) ?? ''));
await as(ADM, `select public.admin_set_game_config('app_min', null)`);
ok('app_min cleared', (await as(B, 'select public.get_game_config() c'))[0].c.app_min === undefined);

// 1.33.5 cloud save history
const farm = (created, level, name) => JSON.stringify({ createdAt: created, player: { name, level } });
await as(B, `select public.save_cloud($1::jsonb, 9, 40, 100, 'Pixel', null, true)`, [farm(1000, 40, 'Bob')]);
const at1 = (await su('select updated_at from public.cloud_saves where user_id = $1', [B]))[0].updated_at;
await as(B, `select public.save_cloud($1::jsonb, 9, 41, 100, 'Pixel', $2, false)`, [farm(1000, 41, 'Bob'), at1]);
ok('same farm growing keeps no copy', (await as(B, 'select * from public.my_cloud_copies()')).length === 0);
await as(B, `select public.save_cloud($1::jsonb, 9, 1, 0, 'New phone', null, true)`, [farm(2000, 1, 'Farmer')]);
let copies = await as(B, 'select * from public.my_cloud_copies()');
ok('a different farm keeps the old copy', copies.length === 1 && copies[0].level === 41 && copies[0].name === 'Bob' && copies[0].reason === 'other farm', JSON.stringify(copies));
const cpy = (await as(B, 'select public.cloud_copy($1) c', [copies[0].id]))[0].c;
ok('the copy can be fetched by its owner', cpy && cpy.data.player.level === 41);
ok('nobody else can fetch it', (await as(C, 'select public.cloud_copy($1) c', [copies[0].id]))[0].c === null);
ok('players cannot read the table', /permission denied/.test(await err(() => as(B, 'select * from public.cloud_save_history')) ?? ''));
const at2 = (await su('select updated_at from public.cloud_saves where user_id = $1', [B]))[0].updated_at;
await as(B, `select public.save_cloud($1::jsonb, 9, 1, 0, 'New phone', $2, false)`, [farm(2000, 1, 'Farmer'), at2]);
const at3 = (await su('select updated_at from public.cloud_saves where user_id = $1', [B]))[0].updated_at;
await as(B, `select public.save_cloud($1::jsonb, 9, 0 + 1, 0, 'New phone', $2, false)`, [JSON.stringify({ createdAt: 2000, player: { name: 'Farmer', level: 1 } }), at3]);
for (let i = 0; i < 7; i++) {
  const at = (await su('select updated_at from public.cloud_saves where user_id = $1', [B]))[0].updated_at;
  await as(B, `select public.save_cloud($1::jsonb, 9, 5, 0, 'x', $2, false)`, [farm(3000 + i, 5, 'F' + i), at]);
}
ok('at most 5 copies are kept', (await as(B, 'select * from public.my_cloud_copies()')).length === 5);
ok('admin lists them', (await as(ADM, 'select public.admin_cloud_copies($1) c', [B]))[0].c.length === 5);
// daily whole-farm copies
ok('anonymous players can send a daily copy', (await as(C, `select public.save_device_copy($1::jsonb, 9, 12, 'Pixel') r`, [farm(5000, 12, 'Cat')]))[0].r === true);
ok('a second copy the same day is skipped', (await as(C, `select public.save_device_copy($1::jsonb, 9, 12, 'Pixel') r`, [farm(5000, 12, 'Cat')]))[0].r === false);
await su('select public.backup_all_farms()');
const bk = await su("select source, level from public.farm_backups where user_id = $1", [C]);
ok('the nightly backup keeps the whole farm', bk.length === 1 && bk[0].source === 'device' && bk[0].level === 12, JSON.stringify(bk));
ok('cloud players stay on their cloud save', (await su("select source from public.farm_backups where user_id = $1", [B]))[0]?.source === 'cloud');

// 1.33.6 gem spending
await as(C, `select public.log_event('gems_spent', '{"n": 5, "on": "finish:bakery", "left": 20, "level": 12}'::jsonb)`);
await as(C, `select public.log_event('gems_spent', '{"n": 3, "on": "grow:wheat", "left": 17, "level": 12}'::jsonb)`);
const gm = (await as(ADM, 'select public.admin_player_gems($1) g', [C]))[0].g;
ok('admin sees gem spends with totals by kind', gm.total === 8 && gm.byKind.finish === 5 && gm.byKind.grow === 3 && gm.spends.length === 2 && gm.spends[0].on === 'grow:wheat', JSON.stringify(gm));
ok('players cannot read it', /not admin/.test(await err(() => as(C, 'select public.admin_player_gems($1)', [C])) ?? ''));

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
