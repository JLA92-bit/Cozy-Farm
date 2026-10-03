import { CHUNK, MAP, chunkOf, rotatedSize } from '../world/Grid';
import { rng } from '../world/Procedural';
import { BUILDING, ECONOMY, LAND } from '../data';
import { SAVE_VERSION, type Obstacle, type PlacedBuilding, type SaveData } from './State';

/** Builds the starting farm: farmhouse, barn, order board, a few fields, a path, and obstacles everywhere else. */
export function createNewGame(now = Date.now(), seed = Math.floor(Math.random() * 1e9)): SaveData {
  const buildings: PlacedBuilding[] = [];
  let uid = 1;
  const place = (type: string, x: number, z: number, extra: Partial<PlacedBuilding> = {}) => {
    buildings.push({ uid: uid++, type, x, z, rot: 0, level: 1, ...extra });
  };
  // start land is chunks 2..3 x 2..3 => tiles 16..31
  place('farmhouse', 17, 16);
  place('order_board', 21, 17);
  place('barn', 28, 16);
  for (let x = 16; x < 32; x++) place('path_dirt', x, 20);
  for (let z = 16; z < 20; z++) place('path_dirt', 24, z);
  const plotPos: [number, number][] = [[17, 22], [19, 22], [21, 22], [17, 24], [19, 24], [21, 24]];
  plotPos.forEach(([x, z], i) => {
    // two fields start with ripe wheat for an instant first harvest
    place('plot', x, z, { plot: i >= 4 ? { crop: 'wheat', plantedAt: now - 60000, growSec: 30 } : null });
  });

  const occupied = new Set<string>();
  for (const b of buildings) {
    const [w, d] = rotatedSize(BUILDING[b.type].size, b.rot);
    for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) occupied.add(`${x},${z}`);
  }
  // keep a clear area around the starting buildings
  const keepClear = (x: number, z: number) => x >= 16 && x <= 31 && z >= 15 && z <= 26;

  const r = rng(seed);
  const types = Object.entries(LAND.obstacles.types);
  const totalW = types.reduce((s, [, t]) => s + t.weight, 0);
  const pickType = () => {
    let x = r() * totalW;
    for (const [id, t] of types) { x -= t.weight; if (x <= 0) return id; }
    return types[0][0];
  };
  const obstacles: Obstacle[] = [];
  let oid = 0;
  const tryPlace = (x: number, z: number, type: string) => {
    if (occupied.has(`${x},${z}`)) return false;
    occupied.add(`${x},${z}`);
    const t = LAND.obstacles.types[type as keyof typeof LAND.obstacles.types];
    obstacles.push({ id: oid++, type, x, z, model: Math.floor(r() * t.models.length) });
    return true;
  };
  // start area: a handful of easy obstacles to clear early
  let placed = 0, guard = 0;
  while (placed < LAND.obstacles.startAreaCount && guard++ < 500) {
    const x = 16 + Math.floor(r() * 16), z = 16 + Math.floor(r() * 16);
    if (keepClear(x, z)) continue;
    const type = r() < 0.6 ? (r() < 0.5 ? 'bush' : 'tree_small') : pickType();
    if (type === 'big_rock') continue;
    if (tryPlace(x, z, type)) placed++;
  }
  // locked chunks: denser wilderness
  for (let cz = 0; cz < MAP / CHUNK; cz++) {
    for (let cx = 0; cx < MAP / CHUNK; cx++) {
      const key = `${cx},${cz}`;
      if (LAND.startChunks.includes(key)) continue;
      let n = 0, g = 0;
      while (n < LAND.obstacles.perLockedChunk && g++ < 200) {
        const x = cx * CHUNK + Math.floor(r() * CHUNK), z = cz * CHUNK + Math.floor(r() * CHUNK);
        if (chunkOf(x, z) !== key) continue;
        if (tryPlace(x, z, pickType())) n++;
      }
    }
  }

  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeen: now,
    seed,
    nextUid: uid,
    player: {
      name: 'Farmer',
      level: 1,
      xp: 0,
      coins: ECONOMY.start.coins,
      gems: ECONOMY.start.gems,
      look: { body: 'female-b', skin: '#f6c9a0', hair: '#8a5a33', top: '#3fa9f5', bottom: '#8a5528', hat: 'straw', accessory: 'none', pet: 'none' },
      created: false,
    },
    inventory: { ...ECONOMY.start.items },
    storage: {},
    buildings,
    obstacles,
    land: { unlocked: [...LAND.startChunks], bought: 0 },
    orders: { list: [], nextId: 1 },
    truck: null,
    truckNextAt: 0,
    stall: { slots: [], adUntil: 0 },
    merchant: { bought: {} },
    stats: { level: 1 },
    achievements: {},
    quests: { daily: [], dailyKey: '', weekly: [], weeklyKey: '', weeklyBonusClaimed: false },
    daily: { lastDay: '', streak: 0, claimedDay: '', best: 0, protectionUsedWeek: '' },
    collection: {},
    cosmetics: [],
    crates: [],
    event: null,
    tutorial: { step: 0, done: false },
    seen: { levelUnlocks: 1, loginDays: [] },
    debugTimeOffset: 0,
  };
}
