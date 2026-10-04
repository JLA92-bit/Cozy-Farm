// Cozy Acres: send the phone notifications that are due (Web Push with VAPID).
// Supabase Edge Function (Deno). Setup, secrets and deploy commands: ONLINE.md, "Notifications".
//
// Called every 5 minutes by pg_cron (public.push_cron_tick in supabase/schema.sql) or by a dashboard Cron
// job. Each run:
//   1. claim_due_pushes() takes the due rows of push_schedule and marks them in the same step, so two runs
//      never send the same notification (too late or over the daily limit are marked, not sent)
//   2. sends each one to every device of that player (gifts and market sales only to devices that want them)
//   3. remembers which devices worked, removes devices the push service says are gone (404 / 410), and
//      marks notifications no device took as 'failed'
//
// Secrets (Edge Functions > Secrets, or `supabase secrets set`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto:...), and optionally PUSH_CRON_SECRET (then callers must send it in the
// x-cron-secret header). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy with JWT verification off (the cron call sends the shared secret instead of a user token):
//   supabase functions deploy send-push --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface Row { id: number; user_id: string; kind: string; title: string; body: string; status: string | null }
interface Sub { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; social: boolean }

const SOCIAL = new Set(['gift', 'market']);
/** A notification that cannot be delivered within 4 hours (phone off) is dropped by the push service. */
const TTL_SECONDS = 4 * 3600;
const CONCURRENCY = 8;
const env = (k: string): string => (Deno.env.get(k) ?? '').trim();
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Run `fn` over `items`, at most `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => { while (i < items.length) await fn(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

function chunks<T>(a: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += size) out.push(a.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  const secret = env('PUSH_CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const publicKey = env('VAPID_PUBLIC_KEY');
  const privateKey = env('VAPID_PRIVATE_KEY');
  const subject = env('VAPID_SUBJECT') || 'mailto:joshmakesgames92@gmail.com';
  if (!publicKey || !privateKey) return json({ error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets are missing' }, 500);
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (e) {
    return json({ error: `bad VAPID settings: ${(e as Error).message}` }, 500);
  }

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. due notifications (already marked as sent, skipped or stale by the database)
  const { data: claimed, error } = await sb.rpc('claim_due_pushes', { p_limit: 300 });
  if (error) return json({ error: `claim_due_pushes: ${error.message}` }, 500);
  const rows = ((claimed ?? []) as Row[]).filter((r) => r.status === 'sent');
  if (!rows.length) return json({ due: claimed?.length ?? 0, sent: 0 });

  // 2. the devices of those players
  const users = [...new Set(rows.map((r) => r.user_id))];
  const subs = new Map<string, Sub[]>();
  for (const ids of chunks(users, 100)) {
    const { data, error: e2 } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, social').in('user_id', ids);
    if (e2) return json({ error: `push_subscriptions: ${e2.message}` }, 500);
    for (const s of (data ?? []) as Sub[]) subs.set(s.user_id, [...(subs.get(s.user_id) ?? []), s]);
  }

  const jobs: { row: Row; sub: Sub }[] = [];
  for (const row of rows) {
    for (const sub of subs.get(row.user_id) ?? []) if (!SOCIAL.has(row.kind) || sub.social) jobs.push({ row, sub });
  }

  const delivered = new Set<number>();
  const working = new Set<string>();
  const gone = new Set<string>();
  let errors = 0;
  await pool(jobs, CONCURRENCY, async ({ row, sub }) => {
    if (gone.has(sub.id)) return;
    const payload = JSON.stringify({ title: row.title, body: row.body, kind: row.kind, tag: `cozy-${row.kind}` });
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: TTL_SECONDS, urgency: 'normal', topic: `cozy-${row.kind}`.slice(0, 32), timeout: 10000 },
      );
      delivered.add(row.id);
      working.add(sub.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0;
      // the device unsubscribed, the app was removed, or the subscription expired: forget it
      if (status === 404 || status === 410) gone.add(sub.id);
      else { errors++; console.warn(`push to ${new URL(sub.endpoint).host} failed (${status || 'network'}): ${(e as Error).message}`); }
    }
  });

  // 3. bookkeeping
  const failed = rows.filter((r) => !delivered.has(r.id)).map((r) => r.id);
  for (const ids of chunks([...working], 200)) await sb.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).in('id', ids);
  for (const ids of chunks([...gone], 200)) await sb.from('push_subscriptions').delete().in('id', ids);
  for (const ids of chunks(failed, 200)) await sb.from('push_schedule').update({ status: 'failed' }).in('id', ids);

  return json({ due: claimed?.length ?? 0, sent: delivered.size, failed: failed.length, removedDevices: gone.size, errors });
});
