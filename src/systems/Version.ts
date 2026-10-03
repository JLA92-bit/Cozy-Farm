/**
 * App version and changelog. src/data/changelog.json is the single source of truth: the newest
 * release's version is the app version (package.json is kept in step, checked by validate-data).
 */
import changelogJson from '../data/changelog.json';

export interface ChangeLine { icon: string; text: string }
export interface ChangeSection { title: string; icon?: string; items: ChangeLine[] }
export interface Release {
  version: string;
  date: string;
  title: string;
  icon?: string;
  color?: 'orange' | 'green' | 'blue' | 'purple' | 'pink';
  dedication?: ChangeLine;
  highlights: ChangeLine[];
  sections?: ChangeSection[];
}

/** Every release, newest first. */
export const RELEASES: Release[] = changelogJson.releases as Release[];
export const APP_VERSION: string = RELEASES[0].version;
/** What a save from before versions were tracked counts as. */
export const FIRST_VERSION = '1.0.0';

/** Compares dotted versions numerically: -1, 0 or 1. Missing or junk parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.'), pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = parseInt(pa[i] ?? '0', 10) || 0, y = parseInt(pb[i] ?? '0', 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Releases newer than `version`, newest first. */
export function releasesSince(version: string): Release[] {
  return RELEASES.filter((r) => compareVersions(r.version, version) > 0);
}

/** "Oct 3, 2026" from "2026-10-03" (local date, no timezone shift). */
export function releaseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
