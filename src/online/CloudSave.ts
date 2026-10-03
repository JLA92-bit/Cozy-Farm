import { LEVELS } from '../data';
import { game } from '../systems/Game';
import { saves } from '../systems/Save';
import { SAVE_VERSION, type SaveData } from '../systems/State';
import { holdProfile, publishProfile } from './Connect';
import { online } from './Online';
import { resetOnlineProfile } from './Profile';
import type { AccountBackend, AccountInfo, AuthResult, CloudRow } from './types';

/**
 * "Sign in with Google" and cloud saves.
 *
 * - Only real online play (Supabase) has accounts; practice mode shows the button disabled.
 * - Signing in links Google to the player's anonymous online account (see SupabaseBackend), so the
 *   friend code, listings and gifts stay. Once signed in, the farm is backed up to the cloud.
 * - Uploads: at most every 2 minutes while the farm changed, when the page is hidden, right after
 *   signing in, and from "Save now". Timers and DOM events only, never the frame loop. Failures are
 *   quiet and back off.
 * - On sign-in and on every start while signed in, the cloud farm is compared with this one
 *   ({@link decideSync}). A farm is never silently overwritten: either the choice is obvious (this
 *   device just continues its own cloud farm, or this farm has not been started yet), or the player
 *   picks in "We found a farm in the cloud". The farm that is replaced on this device is kept aside
 *   (Settings > Your farm > Previous farm) and cloud data goes through the same checks as an import.
 */

const META_KEY = 'cozy-acres-cloud';
const UPLOAD_GAP_MS = 2 * 60000;
const HIDDEN_GAP_MS = 15000;
const TICK_MS = 30000;
const MAX_BACKOFF_MS = 30 * 60000;
/** Same limit as the server (supabase/schema.sql save_cloud). */
export const CLOUD_MAX_BYTES = 512 * 1024;

/** What this device remembers about its cloud save (localStorage, not the farm save). */
interface Meta {
  /** account id this meta belongs to */
  uid: string;
  /** signed in with Google last time we looked (lets a fresh start connect early) */
  signedIn: boolean;
  email: string;
  /** cloud updated_at this device last uploaded or loaded (exact server text) */
  base: string | null;
  /** fingerprint of the farm at that moment, to tell whether it changed since */
  hash: string;
  /** when the last sync succeeded (ms) */
  at: number;
  /** set just before reloading into a cloud farm: its updated_at, and the note to show after the reload */
  adopt?: string;
  note?: string;
}

const blankMeta = (): Meta => ({ uid: '', signedIn: false, email: '', base: null, hash: '', at: 0 });
function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Partial<Meta> | null;
    return m && typeof m === 'object' ? { ...blankMeta(), ...m } : blankMeta();
  } catch { return blankMeta(); }
}
let meta = readMeta();
function writeMeta(): void { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* blocked */ } }

// ------------------------------------------------------------------------------------- pure helpers

/** What the farm-choice panel and the decision need to know about a farm. */
export interface FarmSummary {
  name: string;
  level: number;
  totalXp: number;
  coins: number;
  buildings: number;
  /** last played (game clock) */
  lastPlayed: number;
  createdAt: number;
  /** not started yet: tutorial not finished and still level 1 */
  fresh: boolean;
}

export function summarize(s: SaveData): FarmSummary {
  let totalXp = s.player.xp;
  for (let l = 1; l < s.player.level; l++) totalXp += LEVELS[l - 1]?.xpToNext ?? 0;
  return {
    name: s.player.name, level: s.player.level, totalXp: Math.floor(totalXp), coins: s.player.coins, buildings: s.buildings.length,
    lastPlayed: s.lastSeen, createdAt: s.createdAt, fresh: !s.tutorial.done && s.player.level <= 1,
  };
}

export type SyncDecision = 'upload' | 'none' | 'loadCloud' | 'ask';

/**
 * Compare this device's farm with the cloud farm.
 * - `base`: the cloud updated_at this device last synced with (null = never on this account)
 * - `cloudAt`: the cloud row's updated_at now
 * - `dirty`: this farm changed since that sync
 */
export function decideSync(local: FarmSummary, cloud: FarmSummary | null, ctx: { base: string | null; cloudAt: string | null; dirty: boolean }): SyncDecision {
  if (!cloud) return 'upload';
  // a farm that has not been started yet makes way for the cloud farm
  if (local.fresh) return cloud.fresh ? 'upload' : 'loadCloud';
  if (ctx.base && ctx.base === ctx.cloudAt) return ctx.dirty ? 'upload' : 'none'; // nobody else touched the cloud copy
  // the cloud moved on (another device) while this one did not play: take the newer farm
  if (ctx.base && !ctx.dirty) return 'loadCloud';
  if (cloud.fresh) return 'upload';
  // the very same farm (same start, same progress): nothing to choose
  if (local.createdAt === cloud.createdAt && local.totalXp === cloud.totalXp && local.coins === cloud.coins && local.buildings === cloud.buildings) return 'upload';
  return 'ask';
}

/** The farm to suggest when asking: more progress wins, then the one played last. */
export function suggest(local: FarmSummary, cloud: FarmSummary): 'local' | 'cloud' {
  if (local.totalXp !== cloud.totalXp) return local.totalXp > cloud.totalXp ? 'local' : 'cloud';
  return cloud.lastPlayed > local.lastPlayed ? 'cloud' : 'local';
}

/** Fingerprint of a farm, ignoring the "last seen" clock that changes on every autosave (FNV-1a). */
export function farmHash(s: SaveData): string {
  const txt = JSON.stringify({ ...s, lastSeen: 0 });
  let h = 0x811c9dc5;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(36)}.${txt.length}`;
}

/** A short name for this device, shown next to the cloud farm ("Android phone", "Windows PC"...). */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const kind = /Android/i.test(ua) ? (/Mobile/i.test(ua) ? 'Android phone' : 'Android tablet')
    : /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
      : /CrOS/i.test(ua) ? 'Chromebook' : /Windows/i.test(ua) ? 'Windows PC' : /Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux PC' : 'Browser';
  let app = false;
  try { app = document.referrer.startsWith('android-app://') || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches; } catch { /* old browser */ }
  return app ? `${kind} (app)` : kind;
}

// ------------------------------------------------------------------------------------------- state

export type CloudStatus = 'off' | 'idle' | 'saving' | 'error' | 'newer';

export interface CloudState {
  /** accounts exist (real online play); false in practice mode */
  available: boolean;
  account: AccountInfo | null;
  /** last successful upload or load (ms), 0 = never */
  lastSync: number;
  status: CloudStatus;
}

/** The farm-choice panel, provided by the UI: resolves with the farm the player keeps. */
export const cloudHooks: { ask?: (local: FarmSummary, cloud: FarmSummary & { device: string; savedAt: number }) => Promise<'local' | 'cloud'> } = {};

let override: AccountBackend | null = null;
/** The account features of the active backend (null in practice mode). */
export function accountBackend(): AccountBackend | null {
  if (override) return override;
  return online.kind === 'supabase' && 'signInWithGoogle' in online ? online as unknown as AccountBackend : null;
}

let status: CloudStatus = 'off';
let busy = false;
let asking = false;
let synced = false;
let failures = 0;
let nextAt = 0;
let lastTry = 0;
const listeners = new Set<(s: CloudState) => void>();

export function cloudState(): CloudState {
  const b = accountBackend();
  const account = b?.account() ?? null;
  return { available: !!b, account, lastSync: account && !account.anonymous ? meta.at : 0, status: account && !account.anonymous ? status : 'off' };
}
export function onCloud(fn: (s: CloudState) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
function notify(): void {
  const s = cloudState();
  for (const fn of [...listeners]) { try { fn(s); } catch (e) { console.error('[cloud]', e); } }
}
function setStatus(s: CloudStatus): void { status = s; notify(); }
const toast = (title: string, sub?: string, icon = 'cloud', style = '') => game.bus.emit('toast', { title, sub, icon, style });
const signedIn = (): boolean => { const a = accountBackend()?.account(); return !!a && !a.anonymous; };

// ------------------------------------------------------------------------------------------- sync

function dirty(): boolean { return !!game.state && farmHash(game.state) !== meta.hash; }

/** Upload this farm. `force` overwrites the cloud copy even if another device changed it. */
async function upload(force = false): Promise<boolean> {
  const b = accountBackend();
  if (!b || !signedIn() || busy || asking || saves.locked || status === 'newer') return false;
  const json = saves.serialize();
  if (!json) return false;
  if (new Blob([json]).size > CLOUD_MAX_BYTES) {
    if (status !== 'error') toast('Farm too big for the cloud', 'Your farm is safe on this device. Export a save in Settings to keep a copy.', 'cloud', 'warn');
    setStatus('error');
    return false;
  }
  busy = true;
  lastTry = Date.now();
  setStatus('saving');
  try {
    const data = JSON.parse(json) as SaveData;
    const at = await b.saveCloud(data, { saveVersion: data.version, level: data.player.level, coins: data.player.coins, device: deviceLabel() }, meta.base, force);
    meta.base = at;
    meta.hash = farmHash(data);
    meta.at = Date.now();
    writeMeta();
    failures = 0;
    nextAt = Date.now() + UPLOAD_GAP_MS;
    busy = false;
    setStatus('idle');
    return true;
  } catch (e) {
    busy = false;
    if ((e as Error).message === 'conflict') {
      // another device saved since: compare again (may ask the player)
      setStatus('idle');
      synced = false;
      await syncNow();
      return status === 'idle';
    }
    failures++;
    nextAt = Date.now() + Math.min(MAX_BACKOFF_MS, UPLOAD_GAP_MS * 2 ** (failures - 1));
    if (failures === 1) console.warn('[cloud] save failed, will retry', e);
    setStatus('error');
    return false;
  }
}

/** Switch to the cloud farm: reload into it, keeping this farm aside. */
function loadCloudFarm(row: CloudRow, data: SaveData, note: string, keep: boolean): void {
  meta.adopt = row.updatedAt;
  meta.note = note;
  writeMeta();
  const err = saves.applyImport(data, 'Replaced by your cloud farm', keep);
  if (err) {
    meta.adopt = undefined; meta.note = undefined; writeMeta();
    toast('Could not load your cloud farm', err, 'cross', 'warn');
  }
}

/** Compare the cloud farm with this one and act (upload, nothing, load, or ask). */
async function syncNow(): Promise<void> {
  const b = accountBackend();
  if (!b || !signedIn() || busy || asking || saves.locked) return;
  const acct = b.account()!;
  if (meta.uid !== acct.id) { meta = { ...blankMeta(), uid: acct.id, signedIn: true, email: acct.email }; writeMeta(); }
  busy = true;
  let row: CloudRow | null;
  try {
    row = await b.loadCloud();
  } catch (e) {
    busy = false;
    failures++;
    nextAt = Date.now() + Math.min(MAX_BACKOFF_MS, UPLOAD_GAP_MS * 2 ** (failures - 1));
    if (failures === 1) console.warn('[cloud] could not read the cloud save, will retry', e);
    setStatus('error');
    return;
  }
  busy = false;
  let cloudData: SaveData | null = null;
  if (row) {
    const parsed = row.saveVersion > SAVE_VERSION ? { error: 'newer' } : saves.parse(row.data);
    if ('error' in parsed) {
      // never overwrite a cloud farm this version cannot read (e.g. saved by a newer version of the game)
      synced = true;
      if (status !== 'newer') toast('Your cloud farm needs an update', 'It was saved by a newer version of Cozy Acres. Update the game to load it.', 'cloud', 'warn');
      setStatus('newer');
      return;
    }
    cloudData = parsed.data;
  }
  const local = summarize(game.state);
  const cloud = cloudData ? summarize(cloudData) : null;
  const decision = decideSync(local, cloud, { base: meta.base, cloudAt: row?.updatedAt ?? null, dirty: dirty() });
  synced = true;
  failures = 0;
  if (decision === 'none') { meta.at = Date.now(); writeMeta(); setStatus('idle'); return; }
  if (decision === 'upload') {
    meta.base = row?.updatedAt ?? null; // we looked at the cloud copy and it is fine to replace
    await upload();
    return;
  }
  if (decision === 'loadCloud') {
    loadCloudFarm(row!, cloudData!, local.fresh ? 'welcome' : 'newer', !local.fresh);
    return;
  }
  // ask: both farms have their own progress
  if (!cloudHooks.ask) return;
  asking = true;
  holdProfile(true);
  let pick: 'local' | 'cloud';
  try {
    pick = await cloudHooks.ask(local, { ...cloud!, device: row!.device, savedAt: Date.parse(row!.updatedAt) || 0 });
  } finally {
    asking = false;
    holdProfile(false);
  }
  if (pick === 'cloud') { loadCloudFarm(row!, cloudData!, 'chosen', true); return; }
  // keep this farm: the cloud copy is kept aside on this device, then replaced
  saves.keepReplaced(JSON.stringify(cloudData), `Cloud farm from ${row!.device || 'another device'}`);
  meta.base = row!.updatedAt;
  if (await upload(true)) toast('Farm saved to the cloud', 'The other farm is kept on this device in Settings.', 'cloud');
  void publishProfile(true);
}

// ----------------------------------------------------------------------------------------- actions

/** "Sign in with Google": leaves the page for Google (comes back signed in). */
export async function signInWithGoogle(): Promise<void> {
  const b = accountBackend();
  if (!b) throw new Error('Online play is not switched on');
  saves.save();
  await b.signInWithGoogle();
}

/** "Save now" in Settings. Returns false when it could not save. */
export async function saveToCloudNow(): Promise<boolean> {
  if (!signedIn()) return false;
  if (!synced) { await syncNow(); return status === 'idle'; }
  if (!dirty() && meta.base) { meta.at = Date.now(); writeMeta(); notify(); return true; }
  return upload();
}

/** Sign out on this device: one last upload, then back to a fresh anonymous account on the next connect. */
export async function signOutOfGoogle(): Promise<void> {
  const b = accountBackend();
  if (!b) return;
  if (signedIn() && synced && dirty()) await Promise.race([upload(), new Promise((r) => setTimeout(r, 6000))]);
  await b.signOut();
  meta = blankMeta();
  writeMeta();
  synced = false;
  resetOnlineProfile();
  setStatus('off');
  void publishProfile(true);
}

/** Delete the online account for good (the farm on this device stays). Throws when it could not. */
export async function deleteOnlineAccount(): Promise<void> {
  const b = accountBackend();
  if (!b) throw new Error('Online play is not switched on');
  await b.deleteAccount();
  meta = blankMeta();
  writeMeta();
  synced = false;
  resetOnlineProfile();
  setStatus('off');
}

// -------------------------------------------------------------------------------------------- boot

function onConnected(result: AuthResult | null): Promise<void> {
  const b = accountBackend();
  const a = b?.account() ?? null;
  if (result) {
    if (result.kind === 'linked' || result.kind === 'signedIn') toast('Signed in with Google', a?.email ? `Hello ${a.email}! Your farm will be backed up.` : 'Your farm will be backed up.', 'cloud', 'gold');
    else if (result.kind === 'cancelled') toast('Sign in cancelled', 'Your farm is still saved on this device.', 'info');
    else toast('Could not sign in', 'Please try again in a moment.', 'cross', 'warn');
  }
  if (!a) return Promise.resolve();
  if (a.anonymous) {
    if (meta.signedIn && !result) toast('Signed out', 'Sign in with Google in Settings to keep backing up your farm.', 'cloud');
    if (meta.signedIn || meta.uid) { meta = blankMeta(); writeMeta(); }
    notify();
    return Promise.resolve();
  }
  meta.signedIn = true;
  meta.email = a.email;
  writeMeta();
  return syncNow();
}

let started = false;
/**
 * Start accounts and cloud saves (once, at boot, before online sync). Connects right away when the
 * page is coming back from Google or this device is signed in, even before a farmer is made, so a
 * player on a new device gets their farm back straight away.
 */
export function startCloud(): void {
  if (started) return;
  started = true;
  // just reloaded into a cloud farm: this device is now in step with the cloud
  if (meta.adopt) {
    meta.base = meta.adopt;
    meta.hash = farmHash(game.state);
    meta.at = Date.now();
    const note = meta.note;
    meta.adopt = undefined;
    meta.note = undefined;
    writeMeta();
    synced = true;
    setTimeout(() => {
      if (note === 'welcome') toast('Welcome back!', 'Your farm was loaded from the cloud.', 'cloud', 'gold');
      else if (note === 'newer') toast('Loaded your latest farm', 'It was played on another device. The older copy is kept in Settings.', 'cloud', 'gold');
      else toast('Cloud farm loaded', 'Your other farm is kept in Settings > Your farm.', 'cloud', 'gold');
    }, 1500);
  }
  const b = accountBackend();
  if (!b) return;
  b.onAccount(() => notify());
  const returning = /[?&#](code|error|error_code)=/.test(location.search + location.hash);
  if (returning || meta.signedIn) {
    // keep the public profile untouched until we know which farm this account plays
    if (returning) holdProfile(true);
    online.init().then(() => onConnected(b.takeAuthResult()), (e) => {
      console.warn('[cloud] could not connect yet', e);
      // still tell the player how a sign-in they just made went
      const r = b.takeAuthResult();
      if (r) void onConnected(r);
    })
      .finally(() => holdProfile(false));
  } else {
    // connected later by online play: still notice a sign-in from another tab, etc.
    let off = (): void => {};
    off = b.onAccount((a) => { if (a && !a.anonymous) { off(); void onConnected(null); } });
  }
  window.setInterval(() => {
    if (document.hidden || !signedIn() || asking || Date.now() < nextAt) return;
    if (!synced) void syncNow();
    else if (dirty()) void upload();
  }, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !signedIn() || !synced || asking) return;
    if (Date.now() - lastTry > HIDDEN_GAP_MS && dirty()) void upload();
  });
}

// ------------------------------------------------------------------------------------- test seam

/**
 * Development only (never in production builds): a pretend account and cloud, so the signed-in
 * screens and the farm choice can be tried without a server. In the browser console:
 * `__cloudTest.fake()`, `__cloudTest.signIn()`, `__cloudTest.setCloud(saveData, 'Android phone')`, `__cloudTest.sync()`.
 */
if (import.meta.env.DEV) {
  let acct: AccountInfo | null = { id: 'fake-user', anonymous: true, email: '', name: '' };
  let row: CloudRow | null = null;
  const subs = new Set<(a: AccountInfo | null) => void>();
  const emit = () => subs.forEach((f) => f(acct));
  const stamp = () => new Date(Date.now()).toISOString();
  const fake: AccountBackend & { fail: boolean } = {
    fail: false,
    account: () => acct,
    async signInWithGoogle() { acct = { id: 'fake-user', anonymous: false, email: 'farmer@example.com', name: 'Test Farmer' }; emit(); await onConnected({ kind: 'linked', switched: false }); },
    async signOut() { acct = { id: `fake-anon-${Date.now()}`, anonymous: true, email: '', name: '' }; emit(); },
    async deleteAccount() { row = null; acct = { id: `fake-anon-${Date.now()}`, anonymous: true, email: '', name: '' }; emit(); },
    async loadCloud() { if (fake.fail) throw new Error('offline'); return row && JSON.parse(JSON.stringify(row)) as CloudRow; },
    async saveCloud(data, m, base, force) {
      if (fake.fail) throw new Error('offline');
      if (row && !force && base !== row.updatedAt) throw new Error('conflict');
      row = { data: JSON.parse(JSON.stringify(data)), saveVersion: m.saveVersion, level: m.level, coins: m.coins, device: m.device, updatedAt: stamp() };
      return row.updatedAt;
    },
    takeAuthResult: () => null,
    onAccount: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
  };
  (window as unknown as Record<string, unknown>).__cloudTest = {
    fake() { override = fake; started = false; startCloud(); notify(); return 'fake account backend on'; },
    signIn: () => fake.signInWithGoogle(),
    setCloud(data: SaveData, device = 'Android phone', ago = 3600000) {
      row = { data, saveVersion: data.version, level: data.player.level, coins: data.player.coins, device, updatedAt: new Date(Date.now() - ago).toISOString() };
    },
    cloud: () => row,
    meta: () => ({ ...meta }),
    setFail(v: boolean) { fake.fail = v; },
    sync: () => syncNow(),
    decideSync, summarize,
  };
}
