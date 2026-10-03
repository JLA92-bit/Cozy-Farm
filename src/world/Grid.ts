import land from '../data/land.json';

export const MAP = land.mapSize;
export const CHUNK = land.chunkSize;
export const CHUNKS = MAP / CHUNK;
export const HALF = MAP / 2;

/** World position of a tile's centre (tile coords are integers 0..MAP-1). */
export const tileToWorld = (t: number): number => t - HALF + 0.5;
/** World position of the centre of a footprint starting at tile t with size n. */
export const footprintCenter = (t: number, n: number): number => t - HALF + n / 2;
export const worldToTile = (w: number): number => Math.floor(w + HALF);
export const chunkOf = (tx: number, tz: number): string => `${Math.floor(tx / CHUNK)},${Math.floor(tz / CHUNK)}`;
export const inMap = (tx: number, tz: number): boolean => tx >= 0 && tz >= 0 && tx < MAP && tz < MAP;
export const chunkCoords = (key: string): [number, number] => key.split(',').map(Number) as [number, number];

/** Rotated footprint size for a building of size [w, d] and rotation 0..3 (quarter turns). */
export function rotatedSize(size: [number, number], rot: number): [number, number] {
  return rot % 2 === 0 ? [size[0], size[1]] : [size[1], size[0]];
}
