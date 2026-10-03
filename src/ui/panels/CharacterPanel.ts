import * as THREE from 'three';
import { Panel } from '../Panel';
import { h, icon, button, clear } from '../dom';
import { ui } from '../UI';
import { COSMETICS, type Unlock, type AvatarDef, ACHIEVEMENT } from '../../data';
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
      // fit the whole farmer (about 1.3 units tall, 1.4 wide with arms) whatever the box shape
      const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const dist = Math.max(0.9 / t, 0.85 / (t * this.camera.aspect));
      this.camera.position.set(0, 0.9, dist);
      this.camera.lookAt(0, 0.66, 0);
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

/** Which pre-made avatar a look is based on (by body model). */
const avatarOf = (look: CharacterLook) => COSMETICS.avatars.find((a) => a.body === look.body) ?? COSMETICS.avatars[0];

export function openCharacter(firstTime = false): void {
  const look: CharacterLook = { ...game.state.player.look };
  let name = game.state.player.name;
  let gender = avatarOf(look).gender;
  const p = new Panel({
    title: firstTime ? 'Create your farmer' : 'My Farmer', color: 'blue', icon: 'farmer', closable: !firstTime,
    tabs: [
      { id: 'avatar', label: 'Avatar', icon: 'farmer' },
      { id: 'colours', label: 'Colours', icon: 'sparkles' },
      ...(firstTime ? [] : [{ id: 'extras', label: 'Extras', icon: 'hat' }]),
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
  const choices = (list: { id: string; name: string; unlock?: Unlock }[], key: 'hat' | 'accessory' | 'pet') => {
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
  /** Pick a ready-made farmer: body model plus its colours and hat. */
  const pickAvatar = (a: AvatarDef) => {
    Object.assign(look, { body: a.body, skin: a.skin, hair: a.hair, top: a.top, bottom: a.bottom });
    if (firstTime || look.hat === 'none' || look.hat === 'straw') look.hat = a.hat;
    render(p.tab); update();
  };

  const render = (tab: string) => {
    clear(options);
    if (tab === 'avatar') {
      section('Name');
      const input = h('input', { class: 'name-input', maxlength: '16', value: name, placeholder: 'Your name' }) as HTMLInputElement;
      input.addEventListener('input', () => { name = input.value; });
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      options.append(input);
      const seg = h('div', { class: 'segmented gender' });
      for (const g of ['female', 'male'] as const) {
        const b = h('button', { class: gender === g ? 'active' : '' }, g === 'female' ? 'Female' : 'Male');
        b.addEventListener('click', () => {
          if (gender === g) return;
          gender = g;
          // keep the same slot (A-F) when switching, so the swap feels like a counterpart
          const idx = COSMETICS.avatars.filter((a) => a.gender !== g).findIndex((a) => a.body === look.body);
          pickAvatar(COSMETICS.avatars.filter((a) => a.gender === g)[Math.max(0, idx)]);
        });
        seg.append(b);
      }
      section('Choose your farmer');
      options.append(seg);
      const grid = h('div', { class: 'avatar-grid' });
      for (const a of COSMETICS.avatars.filter((x) => x.gender === gender)) {
        const card = h('button', { class: `avatar-card ${look.body === a.body ? 'selected' : ''}`, 'aria-label': a.name }, icon(`avatar:${a.id}`, 'avatar-img'), h('span', {}, a.name));
        card.addEventListener('click', () => pickAvatar(a));
        grid.append(card);
      }
      options.append(grid);
    } else if (tab === 'colours') {
      const lockOf = (c: string) => { const o = COSMETICS.outfitColors.find((x) => x.color === c)!; return cosmeticUnlocked(`color:${c}`, o.unlock) ? null : unlockText(o.unlock); };
      section('Skin');
      swatches(COSMETICS.skinTones, 'skin');
      section('Hair');
      swatches(COSMETICS.hairColors, 'hair');
      section('Top');
      swatches(COSMETICS.outfitColors.map((o) => o.color), 'top', lockOf);
      section('Bottoms');
      swatches(COSMETICS.outfitColors.map((o) => o.color), 'bottom', lockOf);
    } else {
      section('Hat');
      choices(COSMETICS.hats, 'hat');
      section('Accessory');
      choices(COSMETICS.accessories, 'accessory');
      section('Companion');
      choices(COSMETICS.pets, 'pet');
    }
  };
  p.onTab = render;
  const random = button('🎲', () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const a = pick(COSMETICS.avatars.filter((x) => x.gender === gender));
    pickAvatar(a);
  }, 'small purple', { 'aria-label': 'Random farmer' });
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
