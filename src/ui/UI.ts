import * as THREE from 'three';
import gsap from 'gsap';
import { h, icon, itemIcon, button, fmt, priceTag, uiHooks, clear } from './dom';
import { HUD } from './HUD';
import { Feedback } from './Feedback';
import { WorldUI } from './WorldUI';
import { Panel } from './Panel';
import { Effects } from '../world/Effects';
import { BUILDING, CROPS, CROP, ITEMS, TREE, LAND } from '../data';
import { game } from '../systems/Game';
import { buildings, speedupCost } from '../systems/Buildings';
import { farming } from '../systems/Farming';
import { land } from '../systems/Land';
import { audio, haptics } from '../systems/Audio';
import type { Obstacle, PlacedBuilding } from '../systems/State';
import { formatTime, isBuilt, isUpgrading, plotRemaining, plotReady, treeReady } from '../systems/Timers';
import { Terrain } from '../world/Terrain';
import type { FarmScene } from '../scenes/FarmScene';
import type { Interaction } from '../scenes/Interaction';
import type { Pointer } from '../core/Input';

type PanelOpener = (arg?: unknown) => void;
type BuildingTapHandler = (b: PlacedBuilding) => boolean;

/** Central UI manager: HUD, popups, trays, panels, and all reward "juice". */
class UIManager {
  root!: HTMLElement;
  hud!: HUD;
  feedback!: Feedback;
  world!: WorldUI;
  effects!: Effects;
  scene!: FarmScene;
  interaction!: Interaction;
  /** Extra tappable world things (e.g. the merchant) checked before buildings. */
  extraPick: ((ray: THREE.Ray) => (() => void) | null) | null = null;
  private panels = new Map<string, PanelOpener>();
  private tapHandlers: BuildingTapHandler[] = [];
  private tray: HTMLElement | null = null;
  private trayUnsub: (() => void)[] = [];
  private placementBar: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private banner: HTMLElement | null = null;
  private tickHooks: ((now: number) => void)[] = [];
  private projV = new THREE.Vector2();

  init(root: HTMLElement, scene: FarmScene, interaction: Interaction): void {
    this.root = root;
    this.scene = scene;
    this.interaction = interaction;
    Panel.root = root;
    this.world = new WorldUI(root, (v, out) => scene.project(v, out));
    this.hud = new HUD(root, {
      open: (id) => this.open(id),
      levelBadgeTap: () => this.open('__levelbadge'),
      goalTap: () => this.open('__goal'),
    });
    this.feedback = new Feedback(root);
    this.feedback.targets = {
      coins: () => this.hud.coinsEl,
      gems: () => this.hud.gemsEl,
      xp: () => this.hud.levelEl.parentElement,
      barn: () => this.hud.buttons.inventory,
    };
    this.effects = new Effects(scene.scene);
    scene.onFrame((dt) => {
      this.effects.update(dt);
      this.world.update();
      if (this.effects.active) scene.loop.wake(0.2);
    });
    scene.onTick((now) => { for (const fn of this.tickHooks) fn(now); });
    uiHooks.press = () => { audio.play('press', { volume: 0.7 }); haptics.buzz(5); };
    this.wireJuice();
    this.open = this.open.bind(this);
  }

  register(id: string, opener: PanelOpener): void { this.panels.set(id, opener); }
  onBuildingTap(fn: BuildingTapHandler): void { this.tapHandlers.push(fn); }
  onTick(fn: (now: number) => void): void { this.tickHooks.push(fn); }

  open(id: string, arg?: unknown): void {
    if (id === 'build') {
      if (this.interaction.mode.kind === 'edit') this.interaction.exitEdit(); else this.interaction.enterEdit();
      return;
    }
    const fn = this.panels.get(id);
    if (fn) { this.world.hidePopup(); fn(arg); game.bus.emit('tutorial', { signal: `panel:${id}` }); }
    else console.warn('no panel', id);
  }

  /** Screen position of a world point. */
  screen(v: { x: number; y: number; z: number }): { x: number; y: number } {
    const p = this.scene.project(new THREE.Vector3(v.x, v.y, v.z), this.projV);
    return { x: p.x, y: p.y };
  }

  // ------------------------------------------------------------------ juice
  private wireJuice(): void {
    const bus = game.bus;
    bus.on('coins', ({ delta, total, at }) => {
      if (delta > 0 && at) {
        const s = this.screen(at);
        this.feedback.reward(s.x, s.y - 10, 'coins', delta);
        this.feedback.fly(s.x, s.y, 'coin', 'coins', Math.ceil(delta / 15), () => this.hud.setCoins(game.coins));
        audio.play('coins', { volume: 0.7 });
      } else this.hud.setCoins(total);
    });
    bus.on('gems', ({ delta, total, at }) => {
      if (delta > 0 && at) {
        const s = this.screen(at);
        this.feedback.reward(s.x, s.y - 30, 'gems', delta, undefined, 0.15);
        this.feedback.fly(s.x, s.y, 'gem', 'gems', delta, () => this.hud.setGems(game.gems));
        this.effects.sparkle(new THREE.Vector3(at.x, at.y, at.z), '#9ff7ee', 12);
        audio.play('gem');
        haptics.buzz(15);
      } else this.hud.setGems(total);
    });
    bus.on('xp', ({ delta, at }) => {
      if (at) {
        const s = this.screen(at);
        this.feedback.reward(s.x + 26, s.y - 34, 'xp', delta, undefined, 0.08);
        this.feedback.fly(s.x, s.y, 'xp', 'xp', 1, () => this.hud.refresh());
      } else this.hud.refresh();
    });
    bus.on('item', ({ item, delta, at }) => {
      if (delta > 0 && at) {
        const s = this.screen(at);
        this.feedback.floatText(s.x - 24, s.y - 50, `+${delta}`, ITEMS[item]?.icon.startsWith('model:') ? undefined : ITEMS[item]?.icon, '#fff');
        if (ITEMS[item]?.icon.startsWith('model:')) {
          const el = this.feedback.floatLayer.lastElementChild as HTMLElement | null;
          el?.prepend(itemIcon(item));
        }
        this.feedback.fly(s.x, s.y, ITEMS[item]?.icon.startsWith('model:') ? 'package' : ITEMS[item]?.icon ?? 'package', 'barn', 1);
      }
    });
    bus.on('toast', ({ title, sub, icon: ic, style }) => this.feedback.toast(title, sub, ic ?? 'star', style ?? ''));
    bus.on('sfx', ({ name }) => audio.play(name));
    bus.on('building:placed', ({ b, isNew }) => { void this.scene.farm.addBuilding(b, true); if (isNew && BUILDING[b.type].buildSec) audio.play('build2'); });
    bus.on('building:moved', ({ b }) => this.scene.farm.refreshBuilding(b, true));
    bus.on('building:removed', ({ b }) => this.scene.farm.removeBuilding(b.uid));
    bus.on('building:changed', ({ b }) => this.scene.farm.refreshBuilding(b));
    bus.on('building:complete', ({ b }) => {
      const at = this.scene.farm.anchor(b.uid);
      this.effects.dust(at.clone().setY(0.2), 14, 2);
      this.effects.sparkle(at, '#fff6a0', 12);
      audio.play('jingle', { volume: 0.6 });
    });
    bus.on('obstacle:cleared', ({ o }) => {
      this.scene.farm.removeObstacle(o);
      const p = new THREE.Vector3(o.x - 24 + 0.5, 0.4, o.z - 24 + 0.5);
      this.effects.dust(p, 10, 1);
      this.effects.leaves(p, o.type.includes('rock') ? '#b8b8b0' : '#7cd65a', 10);
      this.scene.rig.shake(0.1, 0.2);
      haptics.buzz(18);
    });
    bus.on('land:expanded', ({ chunk }) => {
      this.scene.farm.refreshLand();
      const c = Terrain.chunkCenter(chunk);
      this.effects.levelUp(c.clone().setY(0.5));
      this.scene.rig.focus(c.x, c.z);
      this.scene.rig.shake(0.2, 0.4);
      this.feedback.toast('New land!', 'Your farm just got bigger', 'map', 'gold');
      haptics.buzz([20, 40, 30]);
    });
    bus.on('charm', () => this.hud.refresh());
    bus.on('levelup', () => { this.hud.refresh(); this.hud.levelUpFlash(); });
  }

  // ------------------------------------------------------------------ seed tray (plant mode)
  openSeedTray(selected: string | null, onPick: (crop: string) => void, onClose: () => void): void {
    this.closeSeedTray();
    const tray = h('div', { class: 'tray' });
    const render = (sel: string | null) => {
      clear(tray);
      const visible = CROPS.filter((c) => c.level <= game.level + 2);
      for (const c of visible) {
        const locked = c.level > game.level;
        const poor = !locked && game.coins < c.seedCost;
        const have = locked ? 0 : game.count(c.id);
        const item = h('div', { class: `tray-item ${sel === c.id ? 'selected' : ''} ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}`, dataset: { crop: c.id } },
          itemIcon(c.id), h('div', null, locked ? `Lv ${c.level}` : formatTime(c.growSec * 1000)),
          locked ? null : h('div', { class: 'tcount outlined' }, c.seedCost ? `${c.seedCost}` : 'Free'),
          have ? h('div', { class: 'thave outlined', title: 'In your barn' }, `${have}`) : null,
        );
        if (!locked) {
          const coin = icon('coin');
          coin.style.cssText = 'width:12px;height:12px;margin-right:1px';
          item.querySelector('.tcount')?.prepend(coin);
        }
        item.addEventListener('pointerdown', (e) => {
          if (locked) { this.feedback.toast(`${c.name} unlocks at level ${c.level}`, undefined, 'lock'); audio.play('error'); return; }
          e.preventDefault();
          onPick(c.id);
          render(c.id);
          audio.play('select', { volume: 0.6 });
          game.bus.emit('tutorial', { signal: `seed:${c.id}` });
          this.startSeedDrag(e, c.id);
        });
        tray.append(item);
      }
      tray.append(button('✕', () => onClose(), 'red small tray-close'));
    };
    render(selected);
    this.root.append(tray);
    this.tray = tray;
    // keep prices / barn counts honest while planting and harvesting, without rebuilding (keeps scroll)
    let queued = false;
    const live = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        tray.querySelectorAll<HTMLElement>('.tray-item:not(.locked)').forEach((el) => {
          const c = CROP[el.dataset.crop ?? ''];
          if (!c) return;
          el.classList.toggle('poor', game.coins < c.seedCost);
          const have = game.count(c.id);
          let tag = el.querySelector<HTMLElement>('.thave');
          if (!have) { tag?.remove(); return; }
          if (!tag) { tag = h('div', { class: 'thave outlined' }); el.append(tag); }
          tag.textContent = `${have}`;
        });
      });
    };
    this.trayUnsub = [game.bus.on('coins', live), game.bus.on('item', live)];
    this.root.classList.add('mode-tray');
    gsap.fromTo(tray, { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'back.out(1.6)' });
    this.setModeBanner('Tap or swipe empty fields to plant', onClose);
  }

  /** Dragging a seed from the tray onto the farm plants every empty field it passes over. */
  private startSeedDrag(e: PointerEvent, crop: string): void {
    const cursor = itemIcon(crop, 'fly-icon');
    cursor.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:52px;height:52px;opacity:0`;
    this.feedback.floatLayer.append(cursor);
    let dragging = false;
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12) {
        dragging = true;
        cursor.style.opacity = '1';
        this.interaction.beginSeedDrag(crop);
      }
      if (!dragging) return;
      cursor.style.left = `${ev.clientX}px`;
      cursor.style.top = `${ev.clientY - 30}px`;
      const r = this.scene.canvas.getBoundingClientRect();
      this.interaction.seedDragMove({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      cursor.remove();
      if (dragging) this.interaction.seedDragEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  closeSeedTray(): void {
    if (!this.tray) return;
    const t = this.tray;
    this.tray = null;
    for (const off of this.trayUnsub) off();
    this.trayUnsub = [];
    this.root.classList.remove('mode-tray');
    gsap.to(t, { y: 80, opacity: 0, duration: 0.2, onComplete: () => t.remove() });
    this.setModeBanner(null);
  }

  // ------------------------------------------------------------------ placement bar
  showPlacementBar(a: { confirm: () => void; rotate: () => void; cancel: () => void; store?: () => void; name: string }): void {
    this.hidePlacementBar();
    this.confirmBtn = button('✔', a.confirm, 'round', { 'aria-label': 'Place' });
    const bar = h('div', { class: 'action-bar' },
      button('✕', a.cancel, 'red round', { 'aria-label': 'Cancel' }),
      button('⟳', a.rotate, 'blue round', { 'aria-label': 'Rotate' }),
      a.store ? button(icon('package'), a.store, 'yellow round', { 'aria-label': 'Store' }) : null,
      this.confirmBtn,
    );
    this.root.append(bar);
    this.placementBar = bar;
    this.root.classList.add('mode-place');
    gsap.fromTo(bar, { y: 80 }, { y: 0, duration: 0.3, ease: 'back.out(1.6)' });
    this.setModeBanner(`${a.name}: drag to move`, null);
  }
  setPlacementValid(valid: boolean): void { this.confirmBtn?.classList.toggle('disabled', !valid); }
  hidePlacementBar(): void {
    this.placementBar?.remove();
    this.placementBar = null;
    this.root?.classList.remove('mode-place');
    this.confirmBtn = null;
    if (this.interaction?.mode.kind !== 'edit') this.setModeBanner(null);
  }

  setModeBanner(text: string | null, onClose?: (() => void) | null): void {
    this.banner?.remove();
    this.banner = null;
    if (!text) return;
    this.banner = h('div', { class: 'mode-banner outlined' }, text);
    if (onClose) {
      const x = h('span', { class: 'banner-x' }, '✕');
      x.addEventListener('click', () => onClose());
      this.banner.append(x);
    }
    this.root.append(this.banner);
  }

  // ------------------------------------------------------------------ popups
  private card(title: string, ...rows: (HTMLElement | string | null)[]): HTMLElement {
    return h('div', { class: 'card', style: 'min-width:190px;max-width:260px;gap:6px;padding:10px 12px' }, h('div', { class: 'card-title' }, title), ...rows);
  }

  obstaclePopup(o: Obstacle, pos: THREE.Vector3): void {
    const t = land.obstacleDef(o);
    const check = land.canClear(o);
    const btn = button([icon(t.icon), 'Clear', priceTag(t.clearCost)], () => {
      const at = { x: pos.x, y: pos.y, z: pos.z };
      if (!land.clear(o, at)) { this.feedback.toast(land.canClear(o).reason ?? 'Cannot clear', undefined, 'cross'); audio.play('error'); return; }
      this.world.hidePopup();
    }, check.ok ? 'small' : 'small disabled');
    this.world.showPopup(pos, this.card(t.name, h('div', { class: 'card-sub' }, check.ok ? `+${t.xp} XP and a little treasure` : check.reason!), btn));
  }

  expansionPopup(chunk: string): void {
    const next = land.nextExpansion();
    const check = land.canExpand();
    const purch = this.isPurchasable(chunk);
    const c = Terrain.chunkCenter(chunk).setY(1.4);
    if (!purch) {
      this.world.showPopup(c, this.card('Wild land', h('div', { class: 'card-sub' }, 'Expand next to your farm to reach this area.')));
      return;
    }
    const btn = button(['Buy land', priceTag(next.cost)], () => {
      if (!land.expand(chunk)) { this.feedback.toast(land.canExpand().reason ?? '', undefined, 'lock'); audio.play('error'); return; }
      this.world.hidePopup();
    }, check.ok ? 'small' : 'small disabled');
    this.world.showPopup(c, this.card('Land for sale', h('div', { class: 'card-sub' }, check.ok ? `+${LAND.expansion.xp} XP. ${LAND.obstacles.perLockedChunk} wild spots to clear.` : check.reason!), btn));
  }

  private isPurchasable(chunk: string): boolean {
    const [x, z] = chunk.split(',').map(Number);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => game.isUnlocked(`${x + dx},${z + dz}`));
  }

  /** Context popup for any building: timers, speed-up, upgrade, move. */
  buildingPopup(b: PlacedBuilding, extra: HTMLElement[] = []): void {
    const def = BUILDING[b.type];
    const now = game.now();
    const rows: (HTMLElement | null)[] = [];
    let timerEnd = 0;
    let speedFn: (() => boolean) | null = null;
    let speedCost = 0;
    /** total duration of a growing crop / fruit, for the little growth bar */
    let growTotal = 0;
    if (!isBuilt(b, now)) {
      timerEnd = b.buildEnd!;
      rows.push(h('div', { class: 'card-sub' }, 'Under construction'));
      speedCost = speedupCost(timerEnd - now);
      speedFn = () => buildings.speedup(b);
    } else if (isUpgrading(b, now)) {
      timerEnd = b.upgradeEnd!;
      rows.push(h('div', { class: 'card-sub' }, `Upgrading to level ${b.level + 1}`));
      speedCost = speedupCost(timerEnd - now);
      speedFn = () => buildings.speedup(b);
    } else if (b.plot && !plotReady(b, now)) {
      timerEnd = now + plotRemaining(b, now);
      growTotal = b.plot.growSec * 1000;
      rows.push(h('div', { class: 'row' }, itemIcon(b.plot.crop), h('div', { class: 'card-sub' }, `${CROP[b.plot.crop].name} growing`)));
      speedCost = farming.speedupCost(b);
      speedFn = () => farming.speedup(b);
    } else if (def.tree && b.tree && !treeReady(b, now)) {
      timerEnd = b.tree.readyAt;
      growTotal = TREE[def.tree].growSec * 1000;
      rows.push(h('div', { class: 'row' }, itemIcon(TREE[def.tree].item), h('div', { class: 'card-sub' }, 'Fruit growing')));
      speedCost = farming.speedupCost(b);
      speedFn = () => farming.speedup(b);
    }
    if (timerEnd) {
      const timer = h('div', { class: 'timer-tag outlined' }, formatTime(timerEnd - now));
      // crops and fruit get a small growth bar so "how long until ripe" reads at a glance
      const fill = growTotal ? h('div', { class: 'fill' }) : null;
      const pct = () => `${Math.round(100 * Math.min(1, Math.max(0.03, 1 - (timerEnd - game.now()) / growTotal)))}%`;
      if (fill) { fill.style.width = pct(); rows.push(h('div', { class: 'progress grow-progress' }, fill)); }
      rows.push(timer);
      const iv = setInterval(() => {
        if (!timer.isConnected) { clearInterval(iv); return; }
        const left = timerEnd - game.now();
        timer.textContent = left > 0 ? formatTime(left) : 'Done!';
        if (fill) fill.style.width = pct();
      }, 500);
    }
    if (def.charm && def.cat === 'decor') rows.push(h('div', { class: 'card-sub' }, `+${def.charm} charm`));
    if (def.desc && !timerEnd && !extra.length) rows.push(h('div', { class: 'card-sub' }, def.desc));
    rows.push(...extra);
    const btns = h('div', { class: 'chip-row' });
    if (speedFn && speedCost) {
      btns.append(button([priceTag(0, speedCost), 'Finish'], () => {
        if (!speedFn!()) { this.feedback.toast('Not enough gems', undefined, 'gem'); audio.play('error'); return; }
        this.world.hidePopup();
        this.effects.sparkle(this.scene.farm.anchor(b.uid), '#9ff7ee', 14);
      }, 'small purple'));
    }
    const up = buildings.upgradeInfo(b);
    if (up && isBuilt(b, now) && !isUpgrading(b, now)) {
      const check = buildings.canUpgrade(b);
      btns.append(button(['Upgrade', priceTag(up.cost)], () => {
        if (!buildings.upgrade(b)) { this.feedback.toast(buildings.canUpgrade(b).ok ? 'Cannot upgrade' : (buildings.canUpgrade(b) as { reason: string }).reason, undefined, 'lock'); audio.play('error'); return; }
        this.world.hidePopup();
      }, `small ${check.ok ? 'yellow' : 'disabled'}`));
      rows.push(h('div', { class: 'card-sub' }, `Next: ${up.label}${check.ok ? '' : ` (${(check as { reason: string }).reason})`}`));
    }
    btns.append(button('Move', () => { this.world.hidePopup(); void this.interaction.startMove(b.uid, false); }, 'small blue'));
    rows.push(btns);
    const title = def.cat === 'production' || def.cat === 'animal' || b.type === 'farmhouse' ? `${def.name} (Lv ${b.level})` : def.name;
    this.world.showPopup(this.scene.farm.anchor(b.uid), this.card(title, ...rows));
  }

  /** Taps on non-farm buildings route to the system that owns them. */
  tapBuilding(b: PlacedBuilding, _p: Pointer): void {
    for (const fn of this.tapHandlers) if (fn(b)) return;
    this.buildingPopup(b);
  }

  private fpsEl: HTMLElement | null = null;
  /** Small FPS / draw-call overlay (Settings or Debug). */
  setFps(on: boolean): void {
    if (!on) { this.fpsEl?.remove(); this.fpsEl = null; return; }
    if (this.fpsEl) return;
    const el = h('div', { class: 'outlined', style: 'position:absolute;left:calc(var(--safe-left) + 8px);bottom:calc(var(--safe-bottom) + 4px);font-size:12px;z-index:99;pointer-events:none' });
    this.fpsEl = el;
    this.root.append(el);
    const tick = () => {
      if (!this.fpsEl) return;
      const r = this.scene.renderer.info.render;
      el.textContent = `${this.scene.fps.toFixed(0)} fps · ${r.calls} calls · ${(r.triangles / 1000).toFixed(0)}k tris`;
      setTimeout(tick, 500);
    };
    tick();
  }

  /** Generic "not enough" helper used across panels. */
  needCoins(n: number): boolean {
    if (game.coins >= n) return true;
    this.feedback.toast('Not enough coins', `You need ${fmt(n - game.coins)} more`, 'coin');
    audio.play('error');
    return false;
  }
}

export const ui = new UIManager();
