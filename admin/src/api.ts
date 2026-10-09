/**
 * Supabase for the dashboard: Google sign-in only, and the admin_* server functions (supabase/schema.sql),
 * which refuse anyone not in admin_users. The session is stored under its own key, so signing in here never
 * touches the game's own (anonymous) session on the same site.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const configured = !!(url && key);
export const sb: SupabaseClient | null = configured
  ? createClient(url, key, { auth: { storageKey: 'cozy-admin-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
  : null;

export async function session(): Promise<Session | null> {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signIn(): Promise<void> {
  if (!sb) return;
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> { await sb?.auth.signOut(); }

/** Call a server function; throws Error(message) on failure. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!sb) throw new Error('Supabase is not configured for this build.');
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message || 'Request failed');
  return data as T;
}

// ------------------------------------------------------------------------------------------- types

export interface Overview {
  generatedAt: string;
  players: number; accounts: number; anonymousNoFarm: number; google: number; cloudSaves: number; snapshots: number;
  pushPlayers: number; pushDevices: number; new1: number; new7: number; new30: number;
  active1: number; active24?: number; active7: number; active30: number; seen7: number; minutes1: number; minutes7: number; sessions7: number;
  gifts7: number; listingsOpen: number; sales7: number; helps7: number; likes7: number; feedbackNew: number; giftsPending: number;
  hidden: number; lastBackup: string | null; backups: number;
  daily: { day: string; active: number; minutes: number; sessions: number; new: number }[];
  levels: { level: number; n: number }[];
  platforms: { platform: string; n: number }[];
  versions: { version: string; n: number }[];
  weekdays: { dow: number; active: number; minutes: number }[];
  cohorts: { week: string; size: number; d1: number; d7: number; d14: number; eligible1: number; eligible7: number; eligible14: number }[];
  tester14: { id: string; name: string; code: string; days: number; minutes: number; last: string; platform: string | null }[];
  top: { id: string; name: string; level: number; charm: number; minutes: number }[];
}

export interface PlayerRow {
  id: string; name: string; farm_name: string | null; code: string; level: number; total_xp: number; farm_value: number; charm: number;
  created_at: string; updated_at: string; lb_hidden: boolean; email: string | null; cloud_at: string | null; cloud_device: string | null;
  snap_at: string | null; days: number; minutes: number; last_day: string | null; platform: string | null; version: string | null;
  push: boolean; gifts_pending: number; notes: number;
}

export interface AdminGift { id: string; user_id: string; coins: number; gems: number; items: Record<string, number>; land: number; message: string | null; created_at: string; created_by: string | null; claimed_at: string | null; name?: string }
export interface Feedback { id: string; user_id: string | null; player_name: string | null; created_at: string; category: string; message: string; version: string | null; platform: string | null; device: string | null; level: number | null; status: 'new' | 'seen' | 'done'; admin_note: string | null }
export interface Listing { id: string; seller_id: string; seller_name: string; item: string; qty: number; price: number; listed_at: string; status: string; buyer_id: string | null; buyer_name: string | null; sold_at: string | null; collected: boolean }

export interface PlayerDetail {
  id: string;
  profile: (PlayerRow & { total_xp: number; weekly_xp: number; look: Record<string, string>; week_start: string }) | null;
  auth: { created_at: string; last_sign_in_at: string | null; is_anonymous: boolean; providers: string[]; email: string | null } | null;
  cloud: { updated_at: string; device: string | null; level: number; coins: number; save_version: number; bytes: number } | null;
  snapshot: { updated_at: string; data: unknown } | null;
  days: { day: string; sessions: number; minutes: number; platform: string | null; version: string | null; first_at: string; last_at: string }[];
  giftsSent: number; giftsReceived: number;
  recentGifts: { id: string; from: string; from_id: string; to: string | null; to_id: string; items: Record<string, number>; coins: number; message: string | null; sent_at: string; claimed: boolean }[];
  listings: Listing[];
  helpGiven: number; helpReceived: number;
  push: { devices: number; last_ok_at: string | null };
  feedback: Feedback[];
  adminGifts: AdminGift[];
  backups: { id: number; taken_at: string; source: 'cloud' | 'snapshot'; level: number | null; bytes: number }[];
  notes: { id: number; at: string; admin: string; note: string }[];
}
