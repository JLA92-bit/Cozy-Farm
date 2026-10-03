import * as THREE from 'three';
import { assets } from '../core/Assets';
import type { CharacterLook } from '../systems/State';
import { COSMETICS } from '../data';
import { geo, PAL } from './Procedural';

/**
 * Kenney Mini Characters, recoloured per vertex. All variants share one palette atlas; we find the
 * skin swatch (the 220-vertex face block), the eyes, and the dominant hair/shirt/pants swatches, then
 * point those vertices at the atlas' white swatch and tint them with vertex colours.
 */
type Slot = 'skin' | 'hair' | 'top' | 'bottom' | 'keep';

const WHITE_COL = 4, WHITE_ROW = 3; // white swatch in the atlas grid (8 x 4)
const BONES = ['root', 'leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'];

interface SlotMap { slots: Uint8Array; uvBase: Float32Array; hidden: Uint8Array | null }
/** Held props baked into some bodies (swords on female-a): hidden arm-bone swatches, as "col,row". */
const HIDDEN_PROPS: Record<string, string[]> = { 'female-a': ['5,2', '3,3'] };
const slotCache = new Map<string, SlotMap[]>();
const SLOT_ID: Record<Slot, number> = { keep: 0, skin: 1, hair: 2, top: 3, bottom: 4 };

interface VInfo { bone: Uint8Array; swatch: Int16Array; mesh: THREE.SkinnedMesh }

/** Classify every vertex of a character (body + head meshes analysed together). */
function analyse(key: string, meshes: THREE.SkinnedMesh[]): SlotMap[] {
  const cached = slotCache.get(key);
  if (cached) return cached;
  const infos: VInfo[] = meshes.map((mesh) => {
    const g = mesh.geometry;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const si = g.attributes.skinIndex as THREE.BufferAttribute;
    const sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const n = uv.count;
    const bone = new Uint8Array(n);
    const swatch = new Int16Array(n);
    const boneNames = mesh.skeleton.bones.map((b) => b.name);
    for (let i = 0; i < n; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
      bone[i] = Math.max(0, BONES.indexOf(boneNames[si.getComponent(i, best)] ?? 'root'));
      swatch[i] = Math.floor(uv.getX(i) * 8) + Math.floor(uv.getY(i) * 4) * 8;
    }
    return { bone, swatch, mesh };
  });
  const count = (pred: (v: VInfo, i: number) => boolean) => {
    const m = new Map<number, number>();
    for (const v of infos) for (let i = 0; i < v.swatch.length; i++) if (pred(v, i)) m.set(v.swatch[i], (m.get(v.swatch[i]) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const HEAD = BONES.indexOf('head');
  const headSw = count((v, i) => v.bone[i] === HEAD);
  // the face block is the swatch with ~220 vertices on the head
  const skin = (headSw.find(([, c]) => c >= 200 && c <= 240) ?? headSw[0] ?? [-1])[0];
  const dark = 0 + 3 * 8;
  let fMinY = Infinity, fMaxY = -Infinity, fMaxZ = -Infinity, fMinZ = Infinity;
  for (const v of infos) {
    const pos = v.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < v.swatch.length; i++) if (v.bone[i] === HEAD && v.swatch[i] === skin) {
      fMinY = Math.min(fMinY, pos.getY(i)); fMaxY = Math.max(fMaxY, pos.getY(i));
      fMaxZ = Math.max(fMaxZ, pos.getZ(i)); fMinZ = Math.min(fMinZ, pos.getZ(i));
    }
  }
  // eyes: dark head vertices on the front of the face, below the hair line
  const isEye = (v: VInfo, i: number) => {
    if (v.bone[i] !== HEAD || v.swatch[i] !== dark) return false;
    const pos = v.mesh.geometry.attributes.position as THREE.BufferAttribute;
    return pos.getZ(i) > fMaxZ - (fMaxZ - fMinZ) * 0.15 && pos.getY(i) < fMinY + (fMaxY - fMinY) * 0.7;
  };
  const hair = count((v, i) => v.bone[i] === HEAD && v.swatch[i] !== skin && !isEye(v, i))[0]?.[0] ?? -1;
  const upper = new Set([BONES.indexOf('torso'), BONES.indexOf('arm-left'), BONES.indexOf('arm-right')]);
  const armBones = [BONES.indexOf('arm-left'), BONES.indexOf('arm-right')];
  const props = HIDDEN_PROPS[key];
  const isProp = (v: VInfo, i: number) => !!props && armBones.includes(v.bone[i]) && props.includes(`${v.swatch[i] % 8},${Math.floor(v.swatch[i] / 8)}`);
  const top = count((v, i) => upper.has(v.bone[i]) && v.swatch[i] !== skin && !isProp(v, i))[0]?.[0] ?? -1;
  const legs = new Set([BONES.indexOf('leg-left'), BONES.indexOf('leg-right')]);
  const bottom = count((v, i) => legs.has(v.bone[i]) && v.swatch[i] !== skin)[0]?.[0] ?? -1;
  const maps = infos.map((v) => {
    const uv = v.mesh.geometry.attributes.uv as THREE.BufferAttribute;
    const n = uv.count;
    const slots = new Uint8Array(n);
    const uvBase = new Float32Array(n * 2);
    const hidden = props ? new Uint8Array(n) : null;
    for (let i = 0; i < n; i++) {
      let s: Slot = 'keep';
      if (v.swatch[i] === skin) s = 'skin';
      else if (v.bone[i] === HEAD && v.swatch[i] === hair && !isEye(v, i)) s = 'hair';
      else if (upper.has(v.bone[i]) && v.swatch[i] === top) s = 'top';
      else if (legs.has(v.bone[i]) && v.swatch[i] === bottom) s = 'bottom';
      slots[i] = SLOT_ID[s];
      if (hidden && isProp(v, i)) hidden[i] = 1;
      // same position inside the white swatch keeps the atlas' soft vertical gradient
      const fu = uv.getX(i) * 8 - Math.floor(uv.getX(i) * 8), fv = uv.getY(i) * 4 - Math.floor(uv.getY(i) * 4);
      uvBase[i * 2] = (WHITE_COL + 0.1 + fu * 0.35) / 8;
      uvBase[i * 2 + 1] = (WHITE_ROW + 0.15 + fv * 0.7) / 4;
    }
    return { slots, uvBase, hidden };
  });
  slotCache.set(key, maps);
  return maps;
}

/** geometry clones already stripped of props (userData is shared between clones, so track here) */
const propsHidden = new WeakSet<THREE.BufferGeometry>();

function applyLook(mesh: THREE.SkinnedMesh, map: SlotMap, look: CharacterLook): void {
  const g = mesh.geometry;
  if (map.hidden && !propsHidden.has(g) && g.index) {
    // drop every triangle touching a hidden prop vertex
    const src = g.index.array, keep: number[] = [];
    for (let t = 0; t < src.length; t += 3) if (!map.hidden[src[t]] && !map.hidden[src[t + 1]] && !map.hidden[src[t + 2]]) keep.push(src[t], src[t + 1], src[t + 2]);
    g.setIndex(keep);
    propsHidden.add(g);
  }
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const orig = (g.userData.origUv ??= (uv.array as Float32Array).slice()) as Float32Array;
  const colors = new Float32Array(uv.count * 3).fill(1);
  const palette: Record<number, THREE.Color> = {
    1: new THREE.Color(look.skin), 2: new THREE.Color(look.hair), 3: new THREE.Color(look.top), 4: new THREE.Color(look.bottom),
  };
  for (let i = 0; i < uv.count; i++) {
    const s = map.slots[i];
    if (s) {
      uv.setXY(i, map.uvBase[i * 2], map.uvBase[i * 2 + 1]);
      palette[s].toArray(colors, i * 3);
    } else uv.setXY(i, orig[i * 2], orig[i * 2 + 1]);
  }
  uv.needsUpdate = true;
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// ------------------------------------------------------------------ hats & accessories
function hatGeometry(id: string): THREE.BufferGeometry | null {
  const b = geo();
  switch (id) {
    case 'straw': b.cyl(0.62, 0.62, 0.05, PAL.hay, [0, 0, 0], 14).cyl(0.34, 0.38, 0.28, PAL.hay, [0, 0.04, 0], 12).cyl(0.39, 0.39, 0.07, PAL.red, [0, 0.06, 0], 12); break;
    case 'cap': b.sphere(0.4, PAL.roofBlue, [0, 0.06, 0], 1, [1, 0.55, 1]).box(0.5, 0.04, 0.32, PAL.roofBlue, [0, 0.03, 0.36]).box(0.12, 0.08, 0.02, PAL.white, [0, 0.2, 0.36]); break;
    case 'beanie': b.sphere(0.41, '#e2533c', [0, 0.05, 0], 1, [1, 0.75, 1]).cyl(0.42, 0.42, 0.12, '#f7f1e3', [0, -0.02, 0], 12).sphere(0.1, '#f7f1e3', [0, 0.36, 0], 1); break;
    case 'flower_crown': {
      b.torus(0.38, 0.04, '#5fb83c', [0, 0.04, 0], [Math.PI / 2, 0, 0]);
      const cols = ['#ff8fb4', '#ffe066', '#ffffff', '#a77bf3', '#ff8c3a'];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.sphere(0.08, cols[i % 5], [Math.cos(a) * 0.38, 0.07, Math.sin(a) * 0.38], 0); }
      break;
    }
    case 'bucket': b.cyl(0.36, 0.5, 0.24, '#9bc66a', [0, 0, 0], 12).cyl(0.36, 0.36, 0.06, '#7aa84e', [0, 0.18, 0], 12); break;
    case 'cowboy': b.cyl(0.66, 0.66, 0.05, '#8a5528', [0, 0, 0], 14).cyl(0.3, 0.36, 0.34, '#8a5528', [0, 0.03, 0], 10).cyl(0.37, 0.37, 0.06, PAL.black, [0, 0.07, 0], 10); break;
    case 'chef': b.cyl(0.36, 0.34, 0.25, PAL.white, [0, 0, 0], 12).sphere(0.38, PAL.white, [0, 0.4, 0], 1, [1.1, 0.75, 1.1]); break;
    case 'top': b.cyl(0.55, 0.55, 0.04, PAL.black, [0, 0, 0], 14).cyl(0.3, 0.3, 0.55, PAL.black, [0, 0.02, 0], 12).cyl(0.31, 0.31, 0.08, PAL.red, [0, 0.08, 0], 12); break;
    case 'party': b.cone(0.28, 0.7, '#a77bf3', [0, 0, 0], 10).sphere(0.08, PAL.yellow, [0, 0.72, 0], 1); break;
    case 'bunny_ears': b.sphere(0.1, PAL.white, [-0.15, 0.3, 0], 1, [0.8, 3, 0.5]).sphere(0.1, PAL.white, [0.15, 0.3, 0], 1, [0.8, 3, 0.5]).sphere(0.06, PAL.pink, [-0.15, 0.3, 0.04], 0, [0.6, 2.4, 0.3]).sphere(0.06, PAL.pink, [0.15, 0.3, 0.04], 0, [0.6, 2.4, 0.3]); break;
    case 'viking': b.sphere(0.42, '#9aa5b1', [0, 0.02, 0], 1, [1, 0.8, 1]).cone(0.1, 0.4, PAL.cream, [-0.45, 0.1, 0], 6, [0, 0, 0.9]).cone(0.1, 0.4, PAL.cream, [0.45, 0.1, 0], 6, [0, 0, -0.9]); break;
    case 'crown': {
      b.cyl(0.36, 0.36, 0.2, PAL.gold, [0, 0, 0], 10);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.cone(0.07, 0.18, PAL.gold, [Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32], 4); }
      b.sphere(0.06, PAL.red, [0, 0.12, 0.36], 0);
      break;
    }
    case 'pumpkin': b.sphere(0.42, PAL.orange, [0, 0.15, 0], 1, [1.05, 0.8, 1.05]).cyl(0.05, 0.06, 0.15, '#4a7a2a', [0, 0.45, 0], 6); break;
    case 'witch': b.cyl(0.62, 0.62, 0.04, '#3b2a5a', [0, 0, 0], 14).cone(0.32, 0.8, '#3b2a5a', [0, 0.02, 0], 10, [0.15, 0, 0]).cyl(0.33, 0.33, 0.07, PAL.purple, [0, 0.06, 0], 10); break;
    case 'santa': b.cone(0.38, 0.6, PAL.red, [0, 0.02, 0], 10, [0.25, 0, 0]).cyl(0.4, 0.4, 0.12, PAL.white, [0, 0, 0], 12).sphere(0.1, PAL.white, [0, 0.55, 0.16], 1); break;
    default: return null;
  }
  return b.build();
}

function accessoryGeometry(id: string): { geometry: THREE.BufferGeometry; bone: string } | null {
  switch (id) {
    case 'backpack': return { bone: 'torso', geometry: geo().block(0.42, 0.45, 0.2, '#c0582b', [0, 0, -0.32]).block(0.3, 0.18, 0.06, '#8a5528', [0, 0.05, -0.43]).build() };
    case 'scarf': return { bone: 'torso', geometry: geo().torus(0.28, 0.08, '#e2533c', [0, 0.38, 0], [Math.PI / 2, 0, 0]).box(0.12, 0.3, 0.06, '#e2533c', [0.12, 0.2, 0.26]).build() };
    case 'glasses': return { bone: 'head', geometry: geo().torus(0.1, 0.025, PAL.black, [-0.15, 0.32, 0.42]).torus(0.1, 0.025, PAL.black, [0.15, 0.32, 0.42]).box(0.1, 0.025, 0.02, PAL.black, [0, 0.33, 0.42]).build() };
    case 'flower': return { bone: 'head', geometry: geo().sphere(0.1, PAL.pink, [0.36, 0.55, 0.15], 1).sphere(0.05, PAL.yellow, [0.4, 0.57, 0.2], 0).build() };
    case 'bowtie': return { bone: 'torso', geometry: geo().cone(0.09, 0.14, PAL.red, [-0.08, 0.3, 0.26], 4, [0, 0, Math.PI / 2]).cone(0.09, 0.14, PAL.red, [0.08, 0.3, 0.26], 4, [0, 0, -Math.PI / 2]).build() };
    default: return null;
  }
}

/** Head-bone offset for hats, tuned for the mini character head size. */
const HAT_OFFSET = new THREE.Vector3(0, 0.34, 0);

export class Character {
  readonly root = new THREE.Group();
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private skinned: THREE.SkinnedMesh[] = [];
  private extras: THREE.Object3D[] = [];
  look!: CharacterLook;
  pet: THREE.Object3D | null = null;
  petMixer: THREE.AnimationMixer | null = null;
  petPos = new THREE.Vector3();
  /** world height of the character model */
  height = 1.1;

  static async create(look: CharacterLook, scale = 1): Promise<Character> {
    const c = new Character();
    await c.setLook(look, scale);
    return c;
  }

  async setLook(look: CharacterLook, scale = this.scale): Promise<void> {
    this.scale = scale;
    const prevBody = this.look?.body;
    this.look = { ...look };
    if (prevBody !== look.body || !this.model) {
      if (this.model) this.root.remove(this.model);
      const id = `char/${look.body}`;
      const { root, clips } = await assets.animated(id);
      this.model = root;
      // normalise size: mini characters are ~0.7 units tall at scale 1
      const s = 1.55 * scale;
      root.scale.setScalar(s);
      this.root.add(root);
      this.skinned = [];
      root.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh) { m.geometry = m.geometry.clone(); this.skinned.push(m); }
      });
      this.mixer = new THREE.AnimationMixer(root);
      this.actions.clear();
      for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.current = '';
      this.play('idle');
    }
    const maps = analyse(look.body, this.skinned);
    this.skinned.forEach((m, i) => applyLook(m, maps[i], look));
    // hats/accessories follow bones
    for (const e of this.extras) e.parent?.remove(e);
    this.extras = [];
    const head = this.model.getObjectByName('head');
    const hat = hatGeometry(look.hat);
    if (hat && head) {
      const mesh = new THREE.Mesh(hat, assets.vertexMaterial);
      mesh.position.copy(HAT_OFFSET);
      mesh.scale.setScalar(0.52);
      mesh.castShadow = true;
      head.add(mesh);
      this.extras.push(mesh);
    }
    const acc = accessoryGeometry(look.accessory);
    if (acc) {
      const bone = this.model.getObjectByName(acc.bone);
      if (bone) {
        const mesh = new THREE.Mesh(acc.geometry, assets.vertexMaterial);
        mesh.scale.setScalar(0.62);
        bone.add(mesh);
        this.extras.push(mesh);
      }
    }
    await this.setPet(look.pet);
  }
  scale = 1;

  private petId = 'none';
  private async setPet(pet: string): Promise<void> {
    if (pet === this.petId) return;
    this.petId = pet;
    if (this.pet) { this.pet.parent?.remove(this.pet); this.pet = null; this.petMixer = null; }
    const def = COSMETICS.pets.find((p) => p.id === pet);
    if (!def?.model) return;
    const { root, clips } = await assets.animated(def.model);
    root.scale.setScalar(0.32 * this.scale);
    this.pet = root;
    this.petMixer = new THREE.AnimationMixer(root);
    const idle = clips.find((c) => c.name === 'walk') ?? clips[0];
    if (idle) this.petMixer.clipAction(idle).play();
    this.petPos.copy(this.root.position).add(new THREE.Vector3(0.6, 0, 0.6));
    this.root.parent?.add(this.pet);
  }

  attachPetTo(parent: THREE.Object3D): void { if (this.pet) parent.add(this.pet); }

  play(name: string, fade = 0.2, once = false): void {
    if (name === this.current && !once) return;
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.actions.get(this.current);
    next.reset();
    if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
    else next.setLoop(THREE.LoopRepeat, Infinity);
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    this.current = name;
  }

  /** Play a one-shot animation then return to `after`. */
  gesture(name: string, after = 'idle'): Promise<void> {
    const a = this.actions.get(name);
    if (!a) return Promise.resolve();
    this.play(name, 0.15, true);
    return new Promise((res) => {
      const dur = a.getClip().duration * 1000;
      setTimeout(() => { if (this.current === name) this.play(after); res(); }, Math.max(300, dur - 150));
    });
  }

  update(dt: number): void {
    this.mixer?.update(dt);
    if (this.pet) {
      // pet trots after its owner
      const target = this.root.position.clone().add(new THREE.Vector3(-0.55, 0, 0.45).applyQuaternion(this.root.quaternion));
      const d = target.sub(this.petPos);
      const dist = d.length();
      if (dist > 0.05) {
        this.petPos.addScaledVector(d.normalize(), Math.min(dist, dt * (dist > 1.5 ? 4 : 2.2)));
        this.pet.rotation.y = Math.atan2(d.x, d.z);
      }
      this.pet.position.copy(this.petPos);
      this.pet.position.y = dist > 0.1 ? Math.abs(Math.sin(performance.now() / 90)) * 0.05 : 0;
      this.petMixer?.update(dist > 0.1 ? dt : dt * 0.3);
    }
  }
}
