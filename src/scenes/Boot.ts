import { assets } from '../core/Assets';
import { Renderer } from '../core/Renderer';
import { BUILDINGS, CROPS, LAND, TREES, ANIMALS } from '../data';
import { game } from '../systems/Game';
import { saves } from '../systems/Save';
import { settings } from '../systems/Settings';
import { audio, haptics } from '../systems/Audio';
import { buildings } from '../systems/Buildings';
import { PROC_DEPENDENCIES } from '../world/ProcModels';
import { thumbs } from '../world/Thumbs';
import { FarmScene } from './FarmScene';
import { Interaction } from './Interaction';
import { ui } from '../ui/UI';
import '../ui/panels';
import { offlineSummary, hasNews } from '../systems/Offline';
import { openWelcome } from '../ui/panels/WelcomePanel';
import { updateBubbles } from '../ui/Bubbles';
import { player } from './Player';
import { orders, truck, merchant } from '../systems/Economy';
import { Visitors } from '../world/Visitors';
import { merchantSpot } from '../ui/panels/EconomyPanels';
import { updateSideBar } from '../ui/SideBar';
import { openCharacter } from '../ui/panels/CharacterPanel';

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
  ids.add('nat/cloud_big'); ids.add('nat/cloud_small');
  ids.add('bld/stage_a'); ids.add('bld/stage_b');
  return [...ids].filter((id) => assets.has(id));
}

export let scene: FarmScene;
export let interaction: Interaction;
/** Hooks other modules add to run once the farm is on screen. */
export const afterBoot: (() => void)[] = [];

export async function boot(): Promise<void> {
  setProgress(0.05, 'Loading the farm...');
  await assets.loadManifest();
  await assets.loadAtlases();
  setProgress(0.15, 'Planting seeds...');
  await assets.preload(coreModels(), (f) => setProgress(0.15 + f * 0.65));
  await Promise.all(ANIMALS.map((a) => assets.static(a.model)));

  const { data, fresh } = saves.load();
  game.load(data);
  (window as unknown as { __fresh: boolean }).__fresh = fresh;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, settings.quality);
  thumbs.attach(renderer.renderer);
  scene = new FarmScene(canvas, renderer);
  scene.now = () => game.now();
  interaction = new Interaction(scene);
  scene.handler = interaction;
  ui.init(document.getElementById('ui-root')!, scene, interaction);
  audio.init({ music: settings.music, sfx: settings.sfx });
  haptics.enabled = settings.haptics;

  const away = fresh ? null : offlineSummary(data.lastSeen);
  setProgress(0.88, 'Waking the animals...');
  await scene.env.populate();
  // complete anything that finished while the game was closed
  buildings.tick(game.now());
  await scene.farm.build();
  buildings.updateGauges();
  await player.init(scene);
  orders.refresh();
  game.bus.on('levelup', () => orders.refresh());
  const visitors = new Visitors(scene, merchantSpot);
  void visitors.sync();
  ui.extraPick = (ray) => (ray.intersectsBox(visitors.merchantBox) && merchant.visit().present ? () => ui.open('merchant') : null);
  scene.onTick((now) => { buildings.tick(now); truck.tick(now); scene.farm.tick(now); updateBubbles(now); updateSideBar(now); });

  saves.startAutosave();
  scene.loop.start();
  setProgress(1, 'Welcome!');
  for (const fn of afterBoot) fn();
  if (!game.state.player.created) setTimeout(() => openCharacter(true), 400);
  else if (away && away.awayMs > 120000 && hasNews(away)) setTimeout(() => openWelcome(away), 600);
  Object.assign(window as unknown as Record<string, unknown>, { __scene: scene, __game: game, __ui: ui, __interaction: interaction, __player: player });
  setTimeout(() => document.getElementById('boot-screen')?.classList.add('hidden'), 150);
}
