import { MAP } from './Grid';

/** A* on the tile grid (8-way, no corner cutting). Returns tile path including start and goal, or null. */
export function findPath(sx: number, sz: number, gx: number, gz: number, walkable: (x: number, z: number) => boolean, maxNodes = 4000): [number, number][] | null {
  if (sx === gx && sz === gz) return [[sx, sz]];
  const N = MAP * MAP;
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open: number[] = [];
  const f = new Float32Array(N).fill(Infinity);
  const idx = (x: number, z: number) => z * MAP + x;
  const h = (x: number, z: number) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz); };
  const s = idx(sx, sz);
  g[s] = 0; f[s] = h(sx, sz); open.push(s);
  let expanded = 0;
  const goal = idx(gx, gz);
  while (open.length && expanded++ < maxNodes) {
    // small open lists: linear min is fine and allocation-free
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) {
      const path: [number, number][] = [];
      for (let c = cur; c !== -1; c = from[c]) path.push([c % MAP, Math.floor(c / MAP)]);
      return path.reverse();
    }
    closed[cur] = 1;
    const cx = cur % MAP, cz = Math.floor(cur / MAP);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= MAP || nz >= MAP) continue;
      const ni = idx(nx, nz);
      if (closed[ni]) continue;
      const isGoal = ni === goal;
      if (!isGoal && !walkable(nx, nz)) continue;
      if (dx && dz && (!walkable(cx + dx, cz) || !walkable(cx, cz + dz))) continue;
      const ng = g[cur] + (dx && dz ? 1.41 : 1);
      if (ng < g[ni]) {
        g[ni] = ng; f[ni] = ng + h(nx, nz); from[ni] = cur;
        if (!open.includes(ni)) open.push(ni);
      }
    }
  }
  return null;
}
