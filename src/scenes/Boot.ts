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
import { updateSideBar, sideEntries } from '../ui/SideBar';
import { achievements, quests, daily, events, syncCosmeticDiscovery } from '../systems/Progression';
import { nextGoal, type Goal } from '../systems/Goals';
import { showLevelUp, openDaily, openUnlockTree, collectionBadge, wireProgressionNotes } from '../ui/panels/ProgressionPanels';
import { runGoalAction } from '../ui/GoalActions';
import { openDebug } from '../ui/panels/DebugPanel';
import { cosmeticUnlocked } from '../ui/panels/CharacterPanel';
import { Panel } from '../ui/Panel';
import { Villagers } from '../world/Villagers';
import { tutorial } from '../ui/Tutorial';
import { ECONOMY } from '../data';
import { openCharacter } from '../ui/panels/CharacterPanel';

function setProgress(f: number, text?: string): void {
  const pct = `${Math.round(f * 100)}%`;
  const fill = document.querySelector<HTMLElement>('.boot-fill');
  if (fill) fill.style.width = pct;
  const runner = document.querySelector<HTMLElement>('.boot-runner');
  if (runner) runner.style.left = pct;
  if (text) { const tip = document.querySelector('.boot-tip'); if (tip) tip.textContent = text; }
}

/** Friendly tips that rotate on the loading screen. */
const BOOT_HINTS = [
  'Swipe across fields to plant or harvest lots at once.',
  'Orders on the Order Board pay the most coins.',
  'Your farm keeps growing while you are away.',
  'Not sure what to do? Tap the goal card at the top.',
  'Decorations add Charm, and Charm makes crops grow faster.',
  'Pinch to zoom and drag to look around your farm.',
  'Press and hold a building to move it.',
];

function startHints(): () => void {
  const el = document.querySelector<HTMLElement>('.boot-hint');
  if (!el) return () => {};
  let i = Math.floor(Math.random() * BOOT_HINTS.length);
  el.textContent = BOOT_HINTS[i];
  const id = window.setInterval(() => {
    if (document.querySelector('.boot-retry')) { clearInterval(id); return; } // loading failed: keep the error text
    el.classList.add('fade');
    setTimeout(() => { i = (i + 1) % BOOT_HINTS.length; el.textContent = BOOT_HINTS[i]; el.classList.remove('fade'); }, 300);
  }, 3200);
  return () => clearInterval(id);
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
  const stopHints = startHints();
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
  scene.rig.shakeScale = settings.shake ? 1 : 0;

  const away = fresh ? null : offlineSummary(data.lastSeen);
  setProgress(0.88, 'Waking the animals...');
  await scene.env.populate();
  // complete anything that finished while the game was closed
  buildings.tick(game.now());
  await scene.farm.build();
  buildings.updateGauges();
  await player.init(scene);
  events.check();
  achievements.init();
  quests.init();
  orders.refresh();
  syncCosmeticDiscovery(cosmeticUnlocked);
  wireProgression();
  game.bus.on('levelup', () => orders.refresh());
  new Villagers(scene);
  const visitors = new Visitors(scene, merchantSpot);
  void visitors.sync();
  ui.extraPick = (ray) => (ray.intersectsBox(visitors.merchantBox) && merchant.visit().present ? () => ui.open('merchant') : null);
  scene.onTick((now) => { buildings.tick(now); truck.tick(now); scene.farm.tick(now); updateBubbles(now); updateSideBar(now); });

  saves.startAutosave();
  scene.loop.start();
  setProgress(1, 'Welcome!');
  for (const fn of afterBoot) fn();
  ui.setFps(settings.showFps);
  const dailyReady = daily.check();
  if (!game.state.player.created) {
    const off = game.bus.on('tutorial', ({ signal }) => { if (signal === 'character_done') { off(); setTimeout(() => tutorial.start(), 500); } });
    setTimeout(() => openCharacter(true), 400);
  } else if (!game.state.tutorial.done) setTimeout(() => tutorial.start(), 800);
  if (game.state.player.created && game.state.tutorial.done && away && away.awayMs > 120000 && hasNews(away)) setTimeout(() => openWelcome(away, () => { if (dailyReady) openDaily(); }), 600);
  else if (game.state.player.created && game.state.tutorial.done && dailyReady) setTimeout(() => openDaily(), 600);
  Object.assign(window as unknown as Record<string, unknown>, { __scene: scene, __game: game, __ui: ui, __interaction: interaction, __player: player });
  setTimeout(() => { document.getElementById('boot-screen')?.classList.add('hidden'); stopHints(); }, 150);
}

/** Level-ups, goal card, side shortcuts, level badge taps. */
function wireProgression(): void {
  game.bus.on('levelup', ({ level }) => {
    showLevelUp(level);
    ui.effects.levelUp(player.position.clone().setY(1));
    scene.rig.shake(0.25, 0.5);
    scene.rig.punch(0.07, 0.8);
    syncCosmeticDiscovery(cosmeticUnlocked);
    quests.refresh(game.now());
  });
  let goal: Goal | null = null;
  const refreshGoal = () => {
    goal = nextGoal();
    ui.hud.setGoal(goal.title, goal.text, goal.icon, goal.progress);
    ui.hud.setBadge('quests', quests.claimable() + events.claimable());
    ui.hud.setBadge('collection', collectionBadge());
  };
  scene.onTick(() => refreshGoal());
  refreshGoal();
  ui.register('__goal', () => { if (goal?.action) runGoalAction(goal.action); });
  // level badge: tap = unlock path, 5 quick taps = debug panel
  let taps = 0, tapTimer = 0;
  ui.register('__levelbadge', () => {
    taps++;
    clearTimeout(tapTimer);
    if (taps >= 5) { taps = 0; Panel.closeAll(); openDebug(); return; }
    tapTimer = window.setTimeout(() => { if (taps === 1 && !Panel.isOpen) openUnlockTree(); taps = 0; }, 450);
  });
  // seasonal ambience
  const SEASON: Record<string, string[]> = { harvest_festival: ['#e8833a', '#d9473a', '#f2b33a'], winter_wonderland: ['#ffffff'], spring_blossom: ['#ffb3cf', '#ffd6e6'] };
  let driftT = 0;
  scene.onFrame((dt) => {
    const cols = events.current ? SEASON[events.current.id] : undefined;
    if (!cols || scene.renderer.profile.ambientLife < 0.5) return;
    driftT -= dt;
    if (driftT > 0) return;
    driftT = 0.9;
    const t = scene.rig.target;
    ui.effects.drift(t.clone().set(t.x + (Math.random() - 0.5) * 10, 9, t.z + (Math.random() - 0.5) * 10), cols[Math.floor(Math.random() * cols.length)], events.current!.id === 'winter_wonderland' ? 'light_01' : 'circle_05', 2);
  });
  ui.register('__charm', () => {
    const b = buildings.bonuses();
    const c = ECONOMY.charm;
    ui.feedback.toast(`Charm ${buildings.charm()}`, `+${Math.round(b.growth * 100)}% crop speed, +${Math.round(b.orderCoins * 100)}% order coins, ${b.villagers} visitors. Every ${c.step} charm adds more!`, 'sparkle_heart');
  });
  sideEntries.push(() => (daily.check() ? { id: 'daily', icon: 'calendar', label: 'Daily', color: 'yellow', badge: true } : null));
  sideEntries.push(() => (game.state.crates.length ? { id: 'crates', icon: 'gift', label: `Crates`, color: 'purple', badge: true } : null));
  sideEntries.push(() => (events.current ? { id: 'event', icon: events.current.icon, label: 'Event', color: 'red', badge: events.claimable() > 0 } : null));
  wireProgressionNotes();
}
