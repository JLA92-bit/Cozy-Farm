import { assets } from '../core/Assets';
import { Renderer, detectQuality, type Quality } from '../core/Renderer';
import { BUILDINGS, CROPS, LAND, TREES, ANIMALS } from '../data';
import { game } from '../systems/Game';
import { createNewGame } from '../systems/NewGame';
import { PROC_DEPENDENCIES } from '../world/ProcModels';
import { FarmScene } from './FarmScene';

function setProgress(f: number, text?: string): void {
  const fill = document.querySelector<HTMLElement>('.boot-fill');
  if (fill) fill.style.width = `${Math.round(f * 100)}%`;
  if (text) { const tip = document.querySelector('.boot-tip'); if (tip) tip.textContent = text; }
}

/** Every model needed to draw the farm immediately. Others (characters, food) load on demand. */
function coreModels(): string[] {
  const ids = new Set<string>(PROC_DEPENDENCIES);
  for (const b of BUILDINGS) if (!b.model.startsWith('proc:') && !b.model.startsWith('paint:') && b.model !== 'tree') ids.add(b.model);
  for (const t of Object.values(LAND.obstacles.types)) t.models.forEach((m) => ids.add(m));
  for (const c of CROPS) {
    c.stages.forEach((s) => ids.add(s));
    ids.add(c.ready.model);
    if (c.ready.produce && !c.ready.produce.startsWith('proc/')) ids.add(c.ready.produce);
  }
  for (const t of TREES) { ids.add(t.model); ids.add(t.fruit); }
  for (const a of ANIMALS) ids.add(a.model);
  ids.add('nat/cloud_big'); ids.add('nat/cloud_small');
  ids.add('bld/stage_a'); ids.add('bld/stage_b');
  return [...ids].filter((id) => assets.has(id));
}

export let scene: FarmScene;

export async function boot(): Promise<void> {
  setProgress(0.05, 'Loading the farm...');
  await assets.loadManifest();
  await assets.loadAtlases();
  setProgress(0.15, 'Planting seeds...');
  const ids = coreModels();
  await assets.preload(ids, (f) => setProgress(0.15 + f * 0.7));
  // pets are animated models: prepare their static (pooled) form too
  await Promise.all(ANIMALS.map((a) => assets.static(a.model)));

  const raw = localStorage.getItem('cozy-acres-save');
  game.load(raw ? JSON.parse(raw) : createNewGame());

  const quality = (localStorage.getItem('cozy-acres-quality') as Quality) || detectQuality();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, quality);
  scene = new FarmScene(canvas, renderer);
  scene.now = () => game.now();
  setProgress(0.9, 'Waking the animals...');
  await scene.env.populate();
  await scene.farm.build();
  scene.onTick((now) => scene.farm.tick(now));
  scene.handler = {
    tap: (p) => { const t = scene.tileAt(p); console.log('tap tile', t); },
    longPress: () => {},
    dragStart: () => 'pan',
    toolDrag: () => {},
    toolDragEnd: () => {},
    pointerDown: () => {},
  };
  scene.loop.start();
  setProgress(1, 'Welcome!');
  (window as unknown as { __scene: FarmScene }).__scene = scene;
  setTimeout(() => document.getElementById('boot-screen')?.classList.add('hidden'), 150);
}
