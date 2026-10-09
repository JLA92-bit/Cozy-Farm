import * as THREE from 'three';
import gsap from 'gsap';
import { h, icon, button, fmt, priceTag, clear } from '../dom';
import { ui } from '../UI';
import { Panel } from '../Panel';
import { sideEntries } from '../SideBar';
import { FISHING, ITEMS } from '../../data';
import { biteWaitMult, reelZoneBonus } from '../../systems/SkillEffects';
import { game } from '../../systems/Game';
import { audio, haptics } from '../../systems/Audio';
import { hints } from '../../systems/Hints';
import { extraUnlocks } from '../../systems/Progression';
import { extraObtainable } from '../../systems/Economy';
import { visiting } from '../../systems/Visiting';
import { fishing, isRareTier, sizeText, RARITY_LABEL, TIME_ICON, TIME_LABEL, type Catch, type CatchResult } from '../../systems/Fishing';
import { FishingView } from '../../world/FishingView';
import { DOCK } from '../../world/Terrain';
import { PIER, SPOTS, type FishSpotId } from '../../world/FishSpots';
import { roomDone } from '../../systems/RestorationEffects';
import { worldToTile } from '../../world/Grid';
import { walkable } from '../../world/People';
import { player } from '../../scenes/Player';
import { confetti } from './ProgressionPanels';
import { starBadge } from '../QualityUI';
import './fishing.css';

type Step = 'idle' | 'cast' | 'wait' | 'bite' | 'reel' | 'land' | 'reveal' | 'lost';

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/**
 * Fishing at the dock: the farmer sits on the dock end and the mini-game runs in an HTML overlay.
 * One thumb: tap to cast, tap when the bobber dips, then hold / let go to keep the fish in the green.
 */
class FishingController {
  view: FishingView | null = null;
  private el: HTMLElement | null = null;
  private step: Step = 'idle';
  private t = 0;
  private paid: 'free' | 'bait' | null = null;
  /** 1.9 Lucky Bait: armed by the player, and whether this cast used one */
  private luckyArmed = false;
  private luckyUsed = false;
  private luckyEl!: HTMLElement;
  private catch: Catch | null = null;
  private tries = 0;
  private nibbles: number[] = [];
  private window = 1.4;
  private holding = false;
  // reel mini-game (0..1 along the bar)
  private zone = 0.3;
  private zoneW = 0.3;
  private zoneV = 0;
  private fish = 0.5;
  private fishV = 0;
  private fishTarget = 0.5;
  private fishRetarget = 0;
  private dart = 0;
  private progress = 0;
  private assist = 0;
  private trackW = 1;
  private tickT = 0;
  private soundT = 0;
  private nibbleT = 0;
  private reels = 0;
  // saved camera + farmer
  private savedTarget = new THREE.Vector3();
  private savedDist = 26;
  private savedBoundsMin = new THREE.Vector2();
  private savedTile: [number, number] = [24, 21];
  private savedRot = 0;
  private tmp = new THREE.Vector3();
  private dockBox = new THREE.Box3(
    new THREE.Vector3(DOCK.x - 1.1, DOCK.waterY - 0.3, DOCK.z0 - (DOCK.planks - 1) * DOCK.step - 0.8),
    new THREE.Vector3(DOCK.x + 2.6, DOCK.deckY + 1.6, DOCK.z0 + 0.6),
  );
  /** Old Tom's Pier on the west beach (1.8.5): the planks and the air above them */
  private pierBox = new THREE.Box3(
    new THREE.Vector3(PIER.x0 - PIER.planks * PIER.step - 0.8, PIER.waterY - 0.3, PIER.z - 1.2),
    new THREE.Vector3(PIER.x0 + 0.6, PIER.deckTop + 1.6, PIER.z + 1.2),
  );
  // overlay parts
  private prompt!: HTMLElement;
  private sub!: HTMLElement;
  private reel!: HTMLElement;
  private zoneEl!: HTMLElement;
  private fishEl!: HTMLElement;
  private fillEl!: HTMLElement;
  private castsEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private bitingEl!: HTMLElement;
  private actionBtn!: HTMLElement;
  private buyRow!: HTMLElement;
  private lastTimeKey = '';
  private keyDown = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && this.el && !Panel.isOpen) { e.preventDefault(); this.press(); } };
  private keyUp = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') this.holding = false; };

  get active(): boolean { return !!this.el; }

  /** Once the farm is on screen: dock scene, frame hook and the dock tap target. */
  init(): void {
    if (this.view) return;
    const scene = ui.scene;
    this.view = new FishingView(scene.scene);
    fishing.phase = () => scene.env.phase(game.now());
    scene.onFrame((dt, t) => this.frame(dt, t));
    const prev = ui.extraPick;
    ui.extraPick = (ray) => (ray.intersectsBox(this.dockBox) ? () => this.tapDock() : null)
      ?? (roomDone('pier') && ray.intersectsBox(this.pierBox) ? () => this.tapPier() : null) ?? prev?.(ray) ?? null;
  }

  private tapDock(): void {
    if (!fishing.unlocked) {
      ui.feedback.toast('A quiet little dock', `Fishing opens at level ${FISHING.level}`, 'fishing_pole');
      audio.play('error');
      return;
    }
    this.open('dock');
  }

  private tapPier(): void {
    if (!fishing.unlocked) {
      ui.feedback.toast("Old Tom's Pier", `Fishing opens at level ${FISHING.level}`, 'fishing_pole');
      audio.play('error');
      return;
    }
    this.open('pier');
  }

  // ------------------------------------------------------------------ enter / leave
  open(spotId: FishSpotId = 'dock'): void {
    if (this.el || visiting.active || !this.view) return;
    if (spotId === 'pier' && !roomDone('pier')) return;
    if (!fishing.unlocked) { ui.feedback.toast(`Fishing opens at level ${FISHING.level}`, undefined, 'lock'); return; }
    fishing.syncRare();
    Panel.closeAll();
    ui.world.hidePopup();
    ui.interaction.exitPlant();
    if (ui.interaction.mode.kind === 'edit' || ui.interaction.mode.kind === 'place') ui.interaction.exitEdit();
    const rig = ui.scene.rig;
    this.savedTarget.copy(rig.target);
    this.savedDist = rig.distance;
    this.savedBoundsMin.copy(rig.bounds.min);
    // the farmer pops over to the dock end
    const w = player.walker;
    w.halt();
    this.savedTile = w.tile;
    this.savedRot = w.char.root.rotation.y;
    player.busy = true;
    ui.effects.dust(this.tmp.copy(w.char.root.position).setY(0.2), 8, 0.6);
    fishing.spot = spotId;
    this.view.enter(w.char, SPOTS[spotId]);
    ui.effects.dust(this.tmp.copy(this.view.seat).setY(this.view.seat.y + 0.2), 8, 0.6);
    // let the camera follow the farmer out to the end of the planks
    if (spotId === 'dock') rig.bounds.min.y = DOCK.z0 - 12; else rig.bounds.min.x = PIER.x0 - PIER.planks * PIER.step - 6;
    const portrait = window.innerHeight > window.innerWidth;
    // frame the farmer and the bobber in the upper part of the screen, above the controls
    rig.focus(this.view.seat.x + (portrait ? 0.3 : 0.9), this.view.seat.z + (portrait ? 0.5 : 1.3), portrait ? 21 : 17, 0.9);
    this.build();
    this.setStep('idle');
    audio.play('whoosh', { volume: 0.5 });
    if (spotId === 'pier' && hints.firstTime('intro:pier')) {
      setTimeout(() => ui.feedback.toast("Old Tom's Pier", 'Nine new kinds of fish bite here, from anchovies to a baby whale.', 'fishing_pole'), 700);
    }
    if (hints.firstTime('intro:fishing')) {
      setTimeout(() => ui.feedback.toast('Gone fishing!', 'Tap to cast. When the bobber dips, tap again, then hold to keep the fish in the green.', 'fishing_pole'), 700);
    }
  }

  close(): void {
    if (!this.el || !this.view) return;
    // reeled in before anything bit: the cast is free
    if (this.paid && (this.step === 'cast' || this.step === 'wait')) { fishing.refund(this.paid); if (this.luckyUsed) { game.addItem(FISHING.luckyBait.item, 1); this.luckyUsed = false; } }
    this.paid = null;
    this.catch = null;
    this.holding = false;
    const el = this.el;
    this.el = null;
    ui.root.classList.remove('mode-fishing');
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    gsap.to(el, { opacity: 0, duration: 0.2, onComplete: () => el.remove() });
    this.view.exit();
    const w = player.walker;
    const [tx, tz] = walkable(this.savedTile[0], this.savedTile[1]) ? this.savedTile : [worldToTile(0), worldToTile(0)];
    w.placeAt(tx, tz);
    w.char.root.position.y = 0;
    w.char.root.rotation.set(0, this.savedRot, 0);
    w.char.play('idle');
    player.busy = false;
    ui.effects.dust(this.tmp.copy(w.char.root.position).setY(0.2), 8, 0.6);
    const rig = ui.scene.rig;
    rig.bounds.min.copy(this.savedBoundsMin);
    fishing.spot = 'dock';
    rig.focus(this.savedTarget.x, this.savedTarget.z, this.savedDist, 0.8);
    audio.play('close', { volume: 0.5 });
    ui.hud.refresh();
  }

  // ------------------------------------------------------------------ overlay
  private build(): void {
    this.castsEl = h('div', { class: 'fish-chip' });
    this.timeEl = h('div', { class: 'fish-chip' });
    this.bitingEl = h('div', { class: 'fish-biting', 'aria-label': 'Biting now' });
    this.luckyEl = h('button', { class: 'fish-chip fish-lucky', type: 'button', onclick: () => this.tapLucky() });
    const close = button('✕', () => this.close(), 'red round fish-close', { 'aria-label': 'Stop fishing' });
    const buy = button([h('span', { class: 'fish-buy-plus outlined' }, '+'), icon('worm'), priceTag(FISHING.baitShop.coins)], () => this.buyBait(), 'small yellow fish-buy', { 'aria-label': `Buy ${FISHING.baitShop.qty} bait`, title: `Buy ${FISHING.baitShop.qty} bait` });
    const top = h('div', { class: 'fish-top' }, h('div', { class: 'fish-top-row' }, this.timeEl, this.castsEl, this.luckyEl, buy, close), this.bitingEl);
    this.prompt = h('div', { class: 'fish-prompt outlined' });
    this.sub = h('div', { class: 'fish-sub outlined' });
    this.zoneEl = h('div', { class: 'fr-zone' });
    this.fishEl = h('div', { class: 'fr-fish' }, icon('fish'));
    this.fillEl = h('div', { class: 'fr-fill' });
    this.reel = h('div', { class: 'fish-reel' },
      h('div', { class: 'fr-track' }, this.zoneEl, this.fishEl),
      h('div', { class: 'fr-meter' }, this.fillEl));
    this.buyRow = h('div', { class: 'fish-buyrow' },
      button([icon('worm'), `Buy ${FISHING.baitShop.qty} bait`, priceTag(FISHING.baitShop.coins)], () => this.buyBait(), 'yellow'),
      h('div', { class: 'fish-sub outlined' }, 'Or make Worm Bait at the Feed Mill'));
    this.actionBtn = h('div', { class: 'fish-action', role: 'button', 'aria-label': 'Cast, hook or reel' }, icon('fishing_pole'));
    const touch = h('div', { class: 'fish-touch' }, h('div', { class: 'fish-bottom' },
      h('div', { class: 'fish-center' }, this.prompt, this.sub, this.buyRow),
      h('div', { class: 'fish-controls' }, this.reel, this.actionBtn)));
    touch.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.btn')) return;
      e.preventDefault();
      this.press();
    });
    const release = () => { this.holding = false; this.actionBtn.classList.remove('down'); };
    touch.addEventListener('pointerup', release);
    touch.addEventListener('pointercancel', release);
    touch.addEventListener('pointerleave', release);
    this.el = h('div', { class: 'fish-ui' }, touch, top);
    ui.root.append(this.el);
    ui.root.classList.add('mode-fishing');
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    gsap.fromTo(this.el, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    gsap.fromTo(top, { y: -40 }, { y: 0, duration: 0.35, ease: 'back.out(1.6)' });
    gsap.fromTo(this.actionBtn, { scale: 0.3 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' });
    this.lastTimeKey = '';
    this.refreshTop();
  }

  private refreshTop(): void {
    if (!this.el) return;
    const free = fishing.freeLeft, bait = fishing.bait;
    if (this.castsEl.dataset.key !== `${free}|${bait}`) {
      this.castsEl.dataset.key = `${free}|${bait}`;
      clear(this.castsEl);
      if (free) this.castsEl.append(h('span', { class: 'fc-free' }, `${free} free`));
      this.castsEl.append(icon('worm'), h('span', null, `x${fmt(bait)}`));
      this.castsEl.setAttribute('aria-label', `${free} free casts left today, ${bait} bait`);
    }
    const lucky = fishing.lucky, wanted = fishing.wantedBiting;
    const lk = `${lucky}|${this.luckyArmed}|${wanted}`;
    if (this.luckyEl.dataset.key !== lk) {
      this.luckyEl.dataset.key = lk;
      clear(this.luckyEl).append(icon(ITEMS[FISHING.luckyBait.item].icon), h('span', null, lucky ? `x${fmt(lucky)}` : '+'));
      this.luckyEl.classList.toggle('armed', this.luckyArmed && lucky > 0);
      this.luckyEl.setAttribute('aria-label', lucky ? `Lucky Bait, ${lucky} left, ${this.luckyArmed ? 'on' : 'off'}` : `Buy ${FISHING.luckyBait.qty} Lucky Bait`);
      this.luckyEl.title = lucky ? 'Lucky Bait: much better odds of the fish you need for orders' : `Buy ${FISHING.luckyBait.qty} Lucky Bait for ${FISHING.luckyBait.coins} coins`;
    }
    const time = fishing.time;
    const key = `${time}|${game.level}|${Object.keys(fishing.st.caught).length}|${fishing.mythicAwake}|${[...fishing.needed()].join(',')}`;
    if (key === this.lastTimeKey) return;
    this.lastTimeKey = key;
    clear(this.timeEl).append(icon(TIME_ICON[time]), h('span', { class: 'fc-time' }, TIME_LABEL[time]));
    this.timeEl.setAttribute('aria-label', TIME_LABEL[time]);
    this.timeEl.title = TIME_LABEL[time];
    // later in the game a dozen or more kinds bite at once: smaller icons that wrap onto a second row
    const biting = fishing.biting(time);
    const list = h('div', { class: `fb-list ${biting.length > 9 ? 'many' : ''}` });
    clear(this.bitingEl).append(h('span', { class: 'fb-label outlined' }, 'Biting:'), list);
    for (const f of biting) {
      const seen = !!fishing.st.caught[f.id];
      const ic = icon(ITEMS[f.id].icon);
      ic.title = seen ? ITEMS[f.id].name : '???';
      const need = fishing.needed().has(f.id);
      if (need) ic.title = `${ic.title} (you need this one)`;
      list.append(h('span', { class: `fb-fish ${seen ? '' : 'unseen'} r-${f.rarity}${need ? ' need' : ''}` }, ic));
    }
  }

  /** Tap the Lucky Bait chip: switch it on or off, or buy some when there is none. */
  private tapLucky(): void {
    if (fishing.lucky <= 0) {
      const { qty, coins } = FISHING.luckyBait;
      if (!ui.needCoins(coins) || !fishing.buyLucky()) return;
      this.luckyArmed = true;
      haptics.play('light');
      ui.feedback.toast(`+${qty} Lucky Bait`, 'On: it helps when you need a fish for an order', ITEMS[FISHING.luckyBait.item].icon);
    } else {
      this.luckyArmed = !this.luckyArmed;
      audio.play('select', { volume: 0.5 });
      ui.feedback.floatText(window.innerWidth / 2, window.innerHeight * 0.3, this.luckyArmed ? (fishing.wantedBiting ? 'Lucky Bait on' : 'Lucky Bait on (nothing you need is biting yet)') : 'Lucky Bait off', undefined, '#ffe58a');
    }
    this.refreshTop();
  }

  private buyBait(): void {
    if (!ui.needCoins(FISHING.baitShop.coins)) return;
    if (!fishing.buyBait()) return;
    haptics.play('light');
    ui.feedback.toast(`+${FISHING.baitShop.qty} Worm Bait`, undefined, 'worm');
    this.refreshTop();
    if (this.step === 'idle') this.setStep('idle');
  }

  private setStep(s: Step): void {
    this.step = s;
    this.t = 0;
    if (!this.el) return;
    this.el.dataset.step = s;
    const reel = s === 'reel';
    this.reel.style.visibility = reel ? 'visible' : 'hidden';
    this.buyRow.style.display = s === 'idle' && !fishing.canCast ? '' : 'none';
    let p = '', sub = '';
    if (s === 'idle') {
      if (!fishing.canCast) { p = 'Out of bait'; sub = `Free casts come back tomorrow (${fishing.freePerDay} a day)`; }
      else { p = 'Tap to cast'; sub = fishing.freeLeft ? `${fishing.freeLeft} free ${fishing.freeLeft === 1 ? 'cast' : 'casts'} left today` : 'Uses 1 Worm Bait'; }
    } else if (s === 'cast') p = '';
    else if (s === 'wait') { p = 'Waiting for a bite...'; sub = 'Tap when the bobber dips'; }
    else if (s === 'bite') { p = 'Tap now!'; }
    else if (s === 'reel') { p = 'Reel it in!'; sub = this.reels < 3 ? 'Hold to slide right, let go to drift left. Keep the fish in the green!' : 'Keep it in the green!'; }
    else if (s === 'lost') { p = 'It got away!'; sub = 'No worries, cast again'; }
    this.prompt.textContent = p;
    this.sub.textContent = sub;
    this.prompt.classList.toggle('urgent', s === 'bite');
    if (p && s !== 'wait') gsap.fromTo(this.prompt, { scale: 0.7 }, { scale: 1, duration: 0.3, ease: 'back.out(2.5)' });
    this.actionBtn.classList.toggle('pulse', s === 'bite' || (s === 'idle' && fishing.canCast));
    this.actionBtn.classList.toggle('dim', s === 'idle' && !fishing.canCast);
    this.refreshTop();
  }

  // ------------------------------------------------------------------ input
  private press(): void {
    if (!this.el || !this.view) return;
    this.holding = true;
    this.actionBtn.classList.add('down');
    const s = this.step;
    if (s === 'idle') this.cast();
    else if (s === 'wait') {
      // too early: no harm done, just a nudge
      ui.feedback.floatText(window.innerWidth / 2, window.innerHeight * 0.42, 'Not yet... wait for the big dip', undefined, '#bfe8ff');
      haptics.play('tap');
    } else if (s === 'bite') this.hook();
    else if (s === 'lost') this.cast();
  }

  private cast(): void {
    const view = this.view!;
    this.paid = fishing.payCast();
    if (!this.paid) {
      audio.play('error');
      gsap.fromTo(this.buyRow, { x: -8 }, { x: 0, duration: 0.4, ease: 'elastic.out(1.5, 0.3)' });
      this.setStep('idle');
      return;
    }
    // Lucky Bait is only used up when something you need is biting, so it is never wasted
    this.luckyUsed = false;
    if (this.luckyArmed && fishing.lucky > 0 && fishing.wantedBiting) {
      game.addItem(FISHING.luckyBait.item, -1);
      this.luckyUsed = true;
      if (fishing.lucky <= 0) this.luckyArmed = false;
    }
    this.catch = fishing.roll(Math.random, this.luckyUsed);
    this.refreshTop();
    this.tries = FISHING.bite.triesPerCast;
    view.setPhase('cast');
    void player.walker.char.gesture('interact-right', 'sit');
    audio.play('whoosh', { volume: 0.7, rate: 1.1 });
    haptics.play('light');
    this.setStep('cast');
  }

  private scheduleBite(first: boolean): void {
    const [lo, hi] = FISHING.bite.waitSec;
    const wait = (first ? rand(lo, hi) : rand(1.4, 3.2)) * biteWaitMult();
    this.window = wait;
    // a couple of little nibbles before the real bite keep you watching
    this.nibbles.length = 0;
    const n = Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.nibbles.push(rand(0.6, Math.max(0.7, wait - 0.6)));
    this.nibbles.sort((a, b) => b - a);
    this.nibbleT = 0;
  }

  private hook(): void {
    const c = this.catch!;
    this.view!.setPhase('reel');
    audio.play('snap', { volume: 0.8 });
    haptics.play('medium');
    this.splash(10);
    if (c.kind === 'junk') { this.win(); return; }
    // reel mini-game: zone size and fish liveliness by difficulty
    const d = Math.max(1, Math.min(5, c.def.difficulty)) - 1;
    this.zoneW = Math.min(0.6, FISHING.reel.zone[d] + this.assist * FISHING.reel.assistZone + reelZoneBonus());
    this.zone = 0.5 - this.zoneW / 2;
    this.zoneV = 0;
    this.fish = 0.5;
    this.fishV = 0;
    this.fishTarget = 0.5;
    this.fishRetarget = 0.6;
    this.dart = 0;
    this.progress = FISHING.reel.start;
    this.zoneEl.style.width = `${this.zoneW * 100}%`;
    // the marker never gives the catch away; rare ones glow
    this.fishEl.classList.toggle('glow', isRareTier(c.def.rarity));
    this.fishEl.classList.toggle('mythic', c.def.rarity === 'mythic');
    this.reels++;
    this.setStep('reel');
    this.trackW = (this.reel.firstChild as HTMLElement).clientWidth || 300;
    this.drawReel();
  }

  private splash(n: number): void {
    const p = this.view!.bobberPos(this.tmp);
    ui.effects.burst(p.setY(p.y + 0.05), '#e8fbff', n);
    ui.effects.leaves(p, '#bfeaff', Math.ceil(n * 0.7));
  }

  // ------------------------------------------------------------------ per frame
  private frame(dt: number, t: number): void {
    const view = this.view;
    if (!view) return;
    view.update(dt, t);
    if (!this.el) return;
    ui.scene.loop.wake(0.3);
    this.t += dt;
    const s = this.step;
    if (s === 'cast' && this.t >= 0.72) {
      view.setPhase('wait');
      audio.play('pop', { volume: 0.6, rate: 0.7 });
      this.splash(5);
      this.scheduleBite(true);
      this.setStep('wait');
    } else if (s === 'wait') {
      const left = this.window - this.t;
      if (this.nibbles.length && left <= this.nibbles[0]) {
        this.nibbles.shift();
        view.setPhase('nibble');
        this.nibbleT = 0.5;
        haptics.play('tap');
        audio.play('pop', { volume: 0.25, rate: 1.4 });
      } else if (this.nibbleT > 0 && (this.nibbleT -= dt) <= 0) view.setPhase('wait'); // nibbles last half a second
      if (left <= 0) this.bite();
    } else if (s === 'bite') {
      const d = this.catch?.kind === 'fish' ? this.catch.def.difficulty : 1;
      if (this.t >= (FISHING.bite.windowSec[d - 1] ?? 1.4)) this.missBite();
    } else if (s === 'reel') this.reelFrame(dt);
    else if (s === 'lost' && this.t > 2.2) this.setStep('idle');
    // the clock keeps turning while you fish: refresh what is biting now and then
    if ((this.tickT -= dt) <= 0) { this.tickT = 1; this.refreshTop(); }
  }

  private bite(): void {
    this.view!.setPhase('bite');
    audio.play('pop', { volume: 0.9, rate: 0.85 });
    audio.play('swipe', { volume: 0.5 });
    haptics.play('heavy');
    this.splash(8);
    this.setStep('bite');
  }

  private missBite(): void {
    this.tries--;
    if (this.tries > 0) {
      this.view!.setPhase('wait');
      ui.feedback.floatText(window.innerWidth / 2, window.innerHeight * 0.42, 'Missed it... it might bite again', undefined, '#bfe8ff');
      this.scheduleBite(false);
      this.step = 'wait';
      this.t = 0;
      this.el!.dataset.step = 'wait';
      this.prompt.textContent = 'Waiting for a bite...';
      this.prompt.classList.remove('urgent');
      this.actionBtn.classList.remove('pulse');
      return;
    }
    this.lose('The fish swam off');
  }

  private reelFrame(dt: number): void {
    const R = FISHING.reel;
    const c = this.catch;
    if (!c || c.kind !== 'fish') return;
    const d = Math.max(1, Math.min(5, c.def.difficulty)) - 1;
    // zone: hold to slide right, let go to drift left (smoothed so it feels weighty, not twitchy)
    const target = this.holding ? 0.85 : -0.85;
    this.zoneV += (target - this.zoneV) * Math.min(1, dt * 7);
    this.zone += this.zoneV * dt;
    if (this.zone < 0) { this.zone = 0; this.zoneV = Math.max(0, this.zoneV); }
    if (this.zone > 1 - this.zoneW) { this.zone = 1 - this.zoneW; this.zoneV = Math.min(0, this.zoneV); }
    // fish: swims towards a target that changes every so often; rare fish dart
    this.fishRetarget -= dt;
    if (this.fishRetarget <= 0 || Math.abs(this.fishTarget - this.fish) < 0.02) {
      this.fishTarget = rand(0.06, 0.94);
      this.fishRetarget = rand(0.7, 1.8) / (1 + d * 0.15);
      if (d >= 3 && Math.random() < 0.3) this.dart = 0.45;
    }
    this.dart = Math.max(0, this.dart - dt);
    const spd = R.fishSpeed[d] * (this.dart > 0 ? 2.2 : 1);
    const want = Math.sign(this.fishTarget - this.fish) * spd;
    this.fishV += (want - this.fishV) * Math.min(1, dt * 4);
    this.fish = Math.min(0.98, Math.max(0.02, this.fish + this.fishV * dt));
    const inside = this.fish >= this.zone && this.fish <= this.zone + this.zoneW;
    this.progress += (inside ? R.fillPerSec : -R.drainPerSec) * dt;
    this.reel.classList.toggle('inside', inside);
    // soft reel clicks while the fish is in the green
    if (inside && (this.soundT -= dt) <= 0) { this.soundT = 0.22; audio.play('press', { volume: 0.22, rate: 1.6 }); }
    this.view!.pull = (this.fish - 0.5) * 2;
    this.view!.reelIn = Math.max(0, Math.min(1, this.progress));
    this.drawReel();
    if (this.progress >= 1) this.win();
    else if (this.progress <= 0) { this.assist = Math.min(2, this.assist + 1); this.lose('It got away!'); }
  }

  private drawReel(): void {
    const w = this.trackW;
    this.zoneEl.style.transform = `translateX(${(this.zone * w).toFixed(1)}px)`;
    this.fishEl.style.transform = `translateX(${(this.fish * w).toFixed(1)}px)`;
    this.fillEl.style.transform = `scaleX(${Math.max(0, Math.min(1, this.progress)).toFixed(3)})`;
  }

  private lose(text: string): void {
    this.view!.setPhase('hidden');
    this.paid = null;
    this.catch = null;
    audio.play('close', { volume: 0.6, rate: 0.8 });
    haptics.play('light');
    this.splash(4);
    this.setStep('lost');
    this.prompt.textContent = text;
  }

  private win(): void {
    const c = this.catch!;
    this.paid = null;
    this.catch = null;
    this.holding = false;
    if (c.kind === 'fish') this.assist = 0;
    const wasAwake = fishing.mythicAwake;
    const res = fishing.land(c);
    // the first legendary catch wakes the mythic fish: a little teaser once the card is up
    if (!wasAwake && fishing.mythicAwake) {
      setTimeout(() => { if (this.el) ui.feedback.toast('Something mythic stirs in the deep...', 'Rumour says mythic fish now bite at the dock', 'sparkles'); }, 2600);
    }
    const view = this.view!;
    view.setPhase('land');
    this.splash(14);
    audio.play('pop', { volume: 0.9 });
    haptics.play('success');
    this.setStep('land');
    view.leap(res.icon, () => {
      if (!this.el) return;
      view.setPhase('hidden');
      void player.walker.char.gesture('pick-up', 'sit');
      this.reveal(res);
    });
  }

  // ------------------------------------------------------------------ catch reveal card
  private reveal(r: CatchResult): void {
    if (!this.el) return;
    this.setStep('reveal');
    const mythic = r.rarity === 'mythic';
    const legendary = r.rarity === 'legendary' || mythic;
    const ribbon = r.firstCatch && r.kind === 'fish' ? (mythic ? 'Mythic catch!' : 'New species!') : r.record ? 'New record!' : '';
    const rows: (HTMLElement | null)[] = [];
    if (r.note) {
      rows.push(h('div', { class: 'fish-note' }, r.note));
    } else if (r.kind === 'fish') {
      rows.push(h('div', { class: 'row', style: 'gap:6px;justify-content:center;flex-wrap:wrap' },
        r.rarity ? h('span', { class: `pill fish-rarity r-${r.rarity}` }, RARITY_LABEL[r.rarity]) : null,
        h('span', { class: 'pill' }, icon('fishing_pole'), sizeText(r.size))));
      if (mythic && r.firstCatch) rows.push(h('div', { class: 'card-sub' }, 'Only the luckiest anglers ever see one!'));
      if (r.record) rows.push(h('div', { class: 'card-sub' }, `Your old best was ${sizeText(r.prevRecord)}`));
      else if (!r.firstCatch) rows.push(h('div', { class: 'card-sub' }, `Your best: ${sizeText(fishing.recordOf(r.id).best)}`));
    } else if (r.line) rows.push(h('div', { class: 'card-sub' }, r.line));
    const pills = h('div', { class: 'row', style: 'gap:6px;justify-content:center;flex-wrap:wrap' },
      r.xp ? h('span', { class: 'pill' }, icon('xp'), `+${r.xp} XP`) : null,
      r.coins ? h('span', { class: 'pill' }, icon('coin'), `+${fmt(r.coins)}`) : null,
      r.gems ? h('span', { class: 'pill' }, icon('gem'), `+${r.gems}`) : null,
      ITEMS[r.id] ? h('span', { class: 'pill' }, icon('package'), `${fmt(game.count(r.id))} in barn`) : null);
    const done = () => {
      if (!card.isConnected || card.dataset.closing) return;
      card.dataset.closing = '1';
      card.style.pointerEvents = 'none';
      gsap.to(card, { scale: 0.7, opacity: 0, duration: 0.18, onComplete: () => card.remove() });
      if (this.el) this.setStep('idle');
    };
    // legendary and mythic cards twinkle: little sparkles dotted around the edge
    const sparkles = legendary ? h('div', { class: 'fish-sparkles' }) : null;
    if (sparkles) {
      const n = mythic ? 14 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
        const sp = icon(mythic && i % 2 ? 'glowing_star' : 'sparkles');
        sp.classList.add('fs-star');
        sp.style.left = `${(50 + Math.cos(a) * rand(46, 54)).toFixed(1)}%`;
        sp.style.top = `${(50 + Math.sin(a) * rand(44, 52)).toFixed(1)}%`;
        sp.style.animationDelay = `${rand(0, 1.6).toFixed(2)}s`;
        sp.style.setProperty('--s', rand(0.7, 1.25).toFixed(2));
        sparkles.append(sp);
      }
    }
    const card = h('div', { class: `fish-reveal ${legendary ? 'legendary' : ''} ${r.rarity ? `r-${r.rarity}` : ''}` },
      h('div', { class: 'fish-reveal-card' },
        sparkles,
        ribbon ? h('div', { class: 'fish-ribbon outlined' }, ribbon) : null,
        h('div', { class: 'fish-reveal-icon' }, icon(r.icon)),
        h('div', { class: 'fish-reveal-name outlined' }, r.note ? 'Message in a bottle!' : r.name),
        r.quality ? h('div', { class: 'q-catch' }, starBadge(r.quality)) : null,
        ...rows, pills,
        button(fishing.canCast ? 'Cast again' : 'OK', done, 'fish-again')));
    card.addEventListener('pointerdown', (e) => { if (e.target === card) done(); });
    this.el.append(card);
    gsap.fromTo(card.firstChild as HTMLElement, { scale: 0.4, y: 40 }, { scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.8)' });
    gsap.fromTo(card.querySelector('.fish-reveal-icon'), { rotate: -25, scale: 0.3 }, { rotate: 0, scale: 1, duration: 0.6, ease: 'elastic.out(1.1, 0.45)', delay: 0.1 });
    if (mythic) {
      // the rarest catch in the game: rainbow confetti, a second burst and a little shake
      confetti(80, ['#ff6fb5', '#ffd166', '#7ed957', '#4fc3ff', '#b07bff', '#ffffff']);
      setTimeout(() => confetti(40, ['#ff6fb5', '#b07bff', '#4fc3ff', '#fff3c4']), 650);
      audio.play('achievement');
      audio.play('reward', { volume: 0.7 });
      haptics.play('celebrate');
      ui.scene.rig.shake(0.18, 0.4);
    } else if (legendary) { confetti(50, ['#ffc93c', '#ffe066', '#fff3c4', '#8fd3ff']); audio.play('reward'); haptics.play('celebrate'); }
    else if (ribbon) { audio.play(r.firstCatch ? 'unlock' : 'bonus', { volume: 0.8 }); confetti(20); }
    else if (r.quality === 2) { audio.play('bonus', { volume: 0.8 }); confetti(16, ['#ffcf3f', '#ffe066', '#fff3c4']); }
    else audio.play(r.note ? 'reward' : 'sparkle', { volume: 0.7 });
    ui.effects.sparkle(this.tmp.copy(this.view!.seat).setY(this.view!.seat.y + 1.2), mythic ? '#ffb8f0' : legendary ? '#ffe066' : '#fff6a0', mythic ? 32 : legendary ? 20 : 10);
  }
}

export const fishingUI = new FishingController();

// ====================================================================== hooks
ui.register('fishing', () => fishingUI.open());
extraUnlocks.push((level) => (level === FISHING.level ? [{ kind: 'Feature', id: 'fishing', name: 'Fishing at the dock', icon: 'fishing_pole', level }] : []));
extraObtainable.push(() => fishing.orderable());
sideEntries.push(() => (fishing.unlocked && game.state.tutorial.done && !fishingUI.active ? { id: 'fishing', icon: 'fishing_pole', label: 'Fish', color: 'blue', badge: fishing.freeLeft > 0 } : null));
ui.onTick(() => { if (!fishingUI.view && ui.scene) fishingUI.init(); });

Object.assign(window as unknown as Record<string, unknown>, { __fishing: fishingUI, __fishSys: fishing, __FISHDATA: FISHING });
