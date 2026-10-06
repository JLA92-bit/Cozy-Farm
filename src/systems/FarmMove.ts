/**
 * "Move my farm": carry a save from the old address (jla92-bit.github.io/Cozy-Farm) to the new one
 * (cozyacres.joshmakesgames.app). Browsers keep saves per site, so the farm travels inside a link:
 *   https://cozyacres.joshmakesgames.app/play/#farm=<format>.<base64url data>
 * format "z" = gzip (CompressionStream), "j" = plain JSON. The part after # never leaves the browser.
 * See DOMAIN.md.
 */
export const NEW_GAME_URL = 'https://cozyacres.joshmakesgames.app/play/';
export const NEW_HOST = 'cozyacres.joshmakesgames.app';
const PARAM = '#farm=';

/** Running on the old github.io address, where the move button is offered. */
export const onOldAddress = (): boolean => location.hostname.endsWith('github.io');

const hasStreams = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Save JSON -> "z.<data>" (or "j.<data>" when the browser cannot compress). */
export async function encodeFarm(json: string): Promise<string> {
  const bytes = new TextEncoder().encode(json);
  if (hasStreams()) {
    try { return `z.${toB64url(await pipe(bytes, new CompressionStream('gzip')))}`; } catch { /* plain below */ }
  }
  return `j.${toB64url(bytes)}`;
}

/** "z.<data>" / "j.<data>" -> save JSON. Throws on anything damaged. */
export async function decodeFarm(data: string): Promise<string> {
  const m = /^([zj])\.([A-Za-z0-9_-]+)$/.exec(data.trim());
  if (!m) throw new Error('bad link');
  let bytes = fromB64url(m[2]);
  if (m[1] === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open farm links. Try Chrome, Edge, Firefox or Safari 16.4 or newer.');
    bytes = await pipe(bytes, new DecompressionStream('gzip'));
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** The whole move link for a save. */
export async function moveLink(json: string): Promise<string> {
  return `${NEW_GAME_URL}${PARAM}${await encodeFarm(json)}`;
}

/** The farm data in this page's #farm= link, or null. */
export function farmInHash(): string | null {
  return location.hash.startsWith(PARAM) ? location.hash.slice(PARAM.length) : null;
}

/**
 * The farm data in pasted text: a whole link, or just its "z.<data>" part. Message apps can add spaces, line breaks
 * or a full stop, so everything that cannot be part of the data is removed. Null when there is no farm in it.
 */
export function farmLinkData(text: string): string | null {
  const i = text.indexOf('farm=');
  const rest = (i >= 0 ? text.slice(i + 5) : text).replace(/\s+/g, '');
  const m = /^[zj]\.[A-Za-z0-9_-]+/.exec(rest);
  return m && m[0].length > 20 ? m[0] : null;
}

/** A typed farm code (like K7QM-2XPA, any case, spaces or dashes) in its stored form, or null. */
export function farmCode(text: string): string | null {
  const c = text.toUpperCase().replace(/[\s-]+/g, '');
  return /^[A-Z2-9]{8}$/.test(c) ? c : null;
}

/** Remove #farm=... from the address bar so a reload does not ask again. */
export function clearFarmHash(): void {
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* ignore */ }
}
