/**
 * Gift codes: a gift packed into a short shareable text, so two players can swap gifts with no
 * server at all (any device, any browser). The code is base64url JSON plus a small checksum that
 * catches typos and truncated copies. It is not a security feature: limits are applied when a
 * code is claimed, and each farm remembers the codes it already claimed.
 */
export interface GiftCodeData {
  /** sender's farmer name */
  from: string;
  items: Record<string, number>;
  coins: number;
  message?: string;
  /** random id, so a code can be claimed only once per farm */
  nonce: string;
  /** when the code was made (ms) */
  at: number;
}

const SALT = 'cozy-acres-gift-1:';

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0');
}

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function newNonce(): string {
  const a = new Uint32Array(2);
  try { crypto.getRandomValues(a); } catch { a[0] = Math.random() * 2 ** 32; a[1] = Math.random() * 2 ** 32; }
  return `${a[0].toString(36)}${a[1].toString(36)}`.slice(0, 12);
}

export function encodeGift(g: GiftCodeData): string {
  const body = toB64Url(JSON.stringify({ v: 1, f: g.from, i: g.items, c: g.coins, m: g.message || undefined, n: g.nonce, t: Math.floor(g.at / 1000) }));
  return `${body}.${fnv(SALT + body)}`;
}

/** Accepts a bare code or a whole link containing ?gift=CODE. Returns null if it is not a valid code. */
export function decodeGift(input: string): GiftCodeData | null {
  let s = input.trim();
  const m = /[?&#]gift=([^&#\s]+)/.exec(s);
  if (m) s = decodeURIComponent(m[1]);
  s = s.replace(/\s+/g, '');
  const dot = s.lastIndexOf('.');
  if (dot < 8) return null;
  const body = s.slice(0, dot), chk = s.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(body) || fnv(SALT + body) !== chk) return null;
  try {
    const o = JSON.parse(fromB64Url(body)) as { v?: number; f?: unknown; i?: unknown; c?: unknown; m?: unknown; n?: unknown; t?: unknown };
    if (o.v !== 1 || typeof o.n !== 'string' || !o.n) return null;
    const items: Record<string, number> = {};
    if (o.i && typeof o.i === 'object') {
      for (const [k, v] of Object.entries(o.i as Record<string, unknown>)) if (typeof v === 'number' && v > 0) items[k] = Math.floor(v);
    }
    const coins = typeof o.c === 'number' && o.c > 0 ? Math.floor(o.c) : 0;
    return {
      from: typeof o.f === 'string' && o.f.trim() ? o.f.slice(0, 24) : 'A friend',
      items, coins,
      message: typeof o.m === 'string' ? o.m.slice(0, 120) : undefined,
      nonce: o.n.slice(0, 24),
      at: typeof o.t === 'number' ? o.t * 1000 : 0,
    };
  } catch { return null; }
}
