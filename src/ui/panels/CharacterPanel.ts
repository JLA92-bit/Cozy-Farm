import * as THREE from 'three';
import { Panel } from '../Panel';
import { h, icon, button, clear } from '../dom';
import { ui } from '../UI';
import { COSMETICS, type Unlock, ACHIEVEMENT } from '../../data';
import { game } from '../../systems/Game';
import type { CharacterLook } from '../../systems/State';
import { Character } from '../../world/Character';
import { audio } from '../../systems/Audio';

/** Is a cosmetic unlocked for the player? */
export function cosmeticUnlocked(id: string, unlock: Unlock): boolean {
  if (unlock.default) return true;
  if (game.state.cosmetics.includes(id)) return true;
  if (unlock.level && game.level >= unlock.level) return true;
  if (unlock.achievement && (game.state.achievements[unlock.achievement] ?? 0) >= 1) return true;
  return false;
}

export function unlockText(u: Unlock): string {
  if (u.level) return `Level ${u.level}`;
  if (u.achievement) return `Award: ${ACHIEVEMENT[u.achievement]?.name ?? u.achievement}`;
  if (u.event) return `Event (${u.cost} tokens)`;
  if (u.crate) return `${u.crate[0].toUpperCase()}${u.crate.slice(1)} crates`;
  return '';
}

/** Live 3D preview with its own small renderer (created on open, disposed on close). */
class Preview {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  char: Character | null = null;
  private raf = 0;
  private last = performance.now();
  private spin = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#a08870', 2.2));
    const d = new THREE.DirectionalLight('#fff4e0', 1.6);
    d.position.set(2, 4, 3);
    this.scene.add(d);
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.12, 24), new THREE.MeshLambertMaterial({ color: '#7cc85a' }));
    ground.position.y = -0.06;
    this.scene.add(ground);
    this.camera.position.set(0, 1.05, 3.4);
    this.camera.lookAt(0, 0.62, 0);
    canvas.addEventListener('pointermove', (e) => { if (e.buttons) this.spin += e.movementX * 0.02; });
    this.loop();
  }

  async show(look: CharacterLook): Promise<void> {
    if (!this.char) {
      this.char = await Character.create(look);
      this.scene.add(this.char.root);
      this.char.attachPetTo(this.scene);
    } else await this.char.setLook(look);
    this.char.petPos.set(0.65, 0, 0.25);
    if (this.char.pet) { this.char.pet.position.copy(this.char.petPos); this.char.pet.rotation.y = -0.6; }
  }

  wave(): void { void this.char?.gesture('emote-yes'); }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const w = this.canvas.clientWidth, hh = this.canvas.clientHeight;
    if (w && hh && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, hh, false);
      this.camera.aspect = w / hh;
      // frame the farmer whatever the box shape (short landscape boxes need a closer, lower camera)
      const dist = hh / w < 0.8 ? 2.6 : 3.4;
      this.camera.position.set(0, 0.95, dist);
      this.camera.lookAt(0, 0.55, 0);
      this.camera.updateProjectionMatrix();
    }
    if (this.char) {
      this.char.mixer.update(dt);
      this.char.petMixer?.update(dt * 0.5);
      this.char.root.rotation.y = Math.sin(now / 1800) * 0.35 + this.spin;
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

export function openCharacter(firstTime = false): void {
  const look: CharacterLook = { ...game.state.player.look };
  let name = game.state.player.name;
  const p = new Panel({
    title: firstTime ? 'Create your farmer' : 'My Farmer', color: 'blue', icon: 'farmer', closable: !firstTime,
    tabs: [
      { id: 'body', label: 'Body', icon: 'farmer' },
      { id: 'hair', label: 'Hair', icon: 'sparkles' },
      { id: 'outfit', label: 'Outfit', icon: 'shirt' },
      { id: 'hat', label: 'Hats', icon: 'hat' },
      { id: 'extras', label: 'Extras', icon: 'dog' },
    ],
  });
  const canvas = h('canvas');
  const previewBox = h('div', { class: 'creator-preview' }, canvas);
  const options = h('div', { class: 'creator-options' });
  const wrap = h('div', { class: 'creator' }, previewBox, options);
  p.body.style.display = 'flex';
  p.body.append(wrap);
  wrap.style.flex = '1 1 auto';
  wrap.style.minHeight = '0';
  const preview = new Preview(canvas);
  void preview.show(look);
  const update = () => { void preview.show(look); audio.play('select', { volume: 0.5 }); };

  const section = (title: string) => options.append(h('div', { class: 'section-title' }, title));
  const swatches = (list: string[], key: 'skin' | 'hair' | 'top' | 'bottom', lockedOf?: (c: string) => string | null) => {
    const row = h('div', { class: 'swatches' });
    for (const c of list) {
      const lock = lockedOf?.(c) ?? null;
      const s = h('div', { class: `swatch ${look[key] === c ? 'selected' : ''}`, style: `background:${c};${lock ? 'opacity:.35' : ''}`, title: lock ?? '' });
      s.addEventListener('click', () => {
        if (lock) { ui.feedback.toast('Locked', lock, 'lock'); audio.play('error'); return; }
        look[key] = c; render(p.tab); update();
      });
      row.append(s);
    }
    options.append(row);
  };
  const choices = (list: { id: string; name: string; unlock?: Unlock }[], key: 'body' | 'hat' | 'accessory' | 'pet') => {
    const row = h('div', { class: 'chip-row', style: 'justify-content:flex-start' });
    for (const c of list) {
      const ok = !c.unlock || cosmeticUnlocked(c.id, c.unlock);
      const b = h('button', { class: `opt-btn ${look[key] === c.id ? 'selected' : ''} ${ok ? '' : 'locked'}` }, ok ? null : icon('lock'), c.name);
      b.addEventListener('click', () => {
        if (!ok) { ui.feedback.toast(`${c.name} is locked`, unlockText(c.unlock!), 'lock'); audio.play('error'); return; }
        look[key] = c.id; render(p.tab); update();
      });
      row.append(b);
    }
    options.append(row);
  };

  const render = (tab: string) => {
    clear(options);
    if (tab === 'body') {
      section('Name');
      const input = h('input', { class: 'name-input', maxlength: '16', value: name, placeholder: 'Your name' }) as HTMLInputElement;
      input.addEventListener('input', () => { name = input.value; });
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      options.append(input);
      section('Body');
      const isF = look.body.startsWith('female');
      const letter = look.body.split('-')[1];
      choices([{ id: `female-${letter}`, name: 'Body A' }, { id: `male-${letter}`, name: 'Body B' }], 'body');
      void isF;
      section('Skin tone');
      swatches(COSMETICS.skinTones, 'skin');
    } else if (tab === 'hair') {
      section('Hair style');
      const prefix = look.body.split('-')[0];
      choices(['a', 'b', 'c', 'd', 'e', 'f'].map((l) => ({ id: `${prefix}-${l}`, name: `Style ${l.toUpperCase()}` })), 'body');
      section('Hair colour');
      swatches(COSMETICS.hairColors, 'hair');
    } else if (tab === 'outfit') {
      const lockOf = (c: string) => { const o = COSMETICS.outfitColors.find((x) => x.color === c)!; return cosmeticUnlocked(`color:${c}`, o.unlock) ? null : unlockText(o.unlock); };
      section('Top');
      swatches(COSMETICS.outfitColors.map((o) => o.color), 'top', lockOf);
      section('Bottoms');
      swatches(COSMETICS.outfitColors.map((o) => o.color), 'bottom', lockOf);
    } else if (tab === 'hat') {
      section('Hat');
      choices(COSMETICS.hats, 'hat');
    } else {
      section('Accessory');
      choices(COSMETICS.accessories, 'accessory');
      section('Companion');
      choices(COSMETICS.pets, 'pet');
    }
  };
  p.onTab = render;
  const random = button('🎲', () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    look.body = pick(COSMETICS.bodies).id;
    look.skin = pick(COSMETICS.skinTones);
    look.hair = pick(COSMETICS.hairColors);
    const free = COSMETICS.outfitColors.filter((o) => o.unlock.default).map((o) => o.color);
    look.top = pick(free); look.bottom = pick(free);
    look.hat = pick(COSMETICS.hats.filter((x) => cosmeticUnlocked(x.id, x.unlock))).id;
    render(p.tab); update();
  }, 'small purple', { 'aria-label': 'Random' });
  p.footer.append(random, button(firstTime ? "Let's farm!" : 'Save', () => {
    game.state.player.look = { ...look };
    game.state.player.name = (name.trim() || 'Farmer').slice(0, 16);
    const changed = game.state.player.created;
    game.state.player.created = true;
    if (changed) game.incStat('character_changes');
    game.bus.emit('look:changed', {});
    ui.hud.refresh();
    preview.wave();
    setTimeout(() => p.close(), firstTime ? 700 : 300);
    audio.play('reward');
  }, ''));
  p.footer.lastElementChild!.setAttribute('style', 'flex:1 1 auto;max-width:420px');
  p.onClose = () => { preview.dispose(); if (firstTime) game.bus.emit('tutorial', { signal: 'character_done' }); };
  p.panel.style.height = '100%';
  p.open();
}

ui.register('character', () => openCharacter(false));
ui.onBuildingTap((b) => {
  if (b.type !== 'farmhouse') return false;
  ui.buildingPopup(b, [button(['Change look', icon('farmer')], () => { ui.world.hidePopup(); openCharacter(false); }, 'small blue')]);
  return true;
});
