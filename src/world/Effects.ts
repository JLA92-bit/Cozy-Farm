import * as THREE from 'three';
import gsap from 'gsap';
import { assets, assetUrl } from '../core/Assets';
import { procGeometry } from './ProcModels';

/**
 * 3D juice: particle bursts (Kenney particle sprites), produce "pops" that jump out of crops,
 * dust puffs when building, sparkles on rare drops.
 */
interface Particle { sprite: THREE.Sprite; vel: THREE.Vector3; life: number; max: number; spin: number; grow: number; gravity: number }

export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private textures = new Map<string, THREE.Texture>();
  private materials = new Map<string, THREE.SpriteMaterial>();
  private loader = new THREE.TextureLoader();
  /** Dead particles keep their sprite + private material for reuse (disposing them made the sprite shader recompile after quiet spells). */
  private free: Particle[] = [];
  private rings: THREE.Mesh[] = [];
  private ringGeo?: THREE.RingGeometry;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    for (const n of ['star_06', 'star_04', 'spark_05', 'smoke_04', 'circle_05', 'magic_04', 'twirl_02', 'light_01', 'dirt_02']) {
      const t = this.loader.load(assetUrl(`textures/particles/${n}.png`));
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(n, t);
    }
  }

  private material(tex: string, color: string, additive: boolean): THREE.SpriteMaterial {
    const key = `${tex}|${color}|${additive}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: this.textures.get(tex), color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      this.materials.set(key, m);
    }
    return m;
  }

  private spawn(pos: THREE.Vector3, tex: string, color: string, opts: { count: number; speed: number; up: number; size: number; life: number; additive?: boolean; gravity?: number; spread?: number; grow?: number }): void {
    const mat = this.material(tex, color, opts.additive ?? true);
    for (let i = 0; i < opts.count; i++) {
      let p = this.free.pop();
      if (p) (p.sprite.material as THREE.SpriteMaterial).copy(mat);
      else p = { sprite: new THREE.Sprite(mat.clone()), vel: new THREE.Vector3(), life: 0, max: 1, spin: 0, grow: 0, gravity: 0 };
      const s = p.sprite;
      const spread = opts.spread ?? 0.3;
      s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * spread);
      const a = Math.random() * Math.PI * 2;
      const sp = opts.speed * (0.5 + Math.random() * 0.8);
      s.scale.setScalar(opts.size * (0.7 + Math.random() * 0.6));
      s.renderOrder = 5;
      (s.material as THREE.SpriteMaterial).opacity = 0;
      this.group.add(s);
      p.vel.set(Math.cos(a) * sp, opts.up * (0.6 + Math.random() * 0.8), Math.sin(a) * sp);
      p.life = 0; p.max = opts.life * (0.7 + Math.random() * 0.6); p.spin = (Math.random() - 0.5) * 4; p.grow = opts.grow ?? 0; p.gravity = opts.gravity ?? 6;
      this.particles.push(p);
    }
  }

  /** Soft shockwave ring that ripples out across the ground (building lands, land bought). */
  ring(pos: THREE.Vector3, size = 2, color = '#fffbe0'): void {
    if (!this.ringGeo) { this.ringGeo = new THREE.RingGeometry(0.78, 1, 40); this.ringGeo.rotateX(-Math.PI / 2); }
    let m = this.rings.pop();
    if (!m) {
      m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      m.renderOrder = 3;
    }
    const mesh = m;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.85;
    mesh.position.set(pos.x, 0.04, pos.z);
    mesh.scale.setScalar(size * 0.35);
    this.group.add(mesh);
    gsap.to(mesh.scale, { x: size, y: size, z: size, duration: 0.55, ease: 'power2.out' });
    gsap.to(mat, { opacity: 0, duration: 0.55, ease: 'power1.in', onComplete: () => { this.group.remove(mesh); this.rings.push(mesh); } });
  }

  /** Building lands: dust puff, ground ring and a few leaves kicked up. */
  landing(pos: THREE.Vector3, size = 1): void {
    this.dust(pos, 10 + Math.round(size * 2), size * 0.8);
    this.ring(pos, 0.9 + size * 0.75);
    this.leaves(pos, '#8fd860', 4 + Math.round(size));
  }

  sparkle(pos: THREE.Vector3, color = '#fff6a0', count = 10): void {
    this.spawn(pos, 'star_06', color, { count, speed: 1.6, up: 3, size: 0.5, life: 0.8, gravity: 4 });
  }
  burst(pos: THREE.Vector3, color = '#ffffff', count = 12): void {
    this.spawn(pos, 'spark_05', color, { count, speed: 2.4, up: 2.5, size: 0.45, life: 0.6, gravity: 5 });
  }
  dust(pos: THREE.Vector3, count = 10, spread = 1.5): void {
    this.spawn(pos, 'smoke_04', '#e8d8b8', { count, speed: 1.4, up: 0.8, size: 1.0, life: 0.9, additive: false, gravity: -0.5, spread, grow: 1.2 });
  }
  leaves(pos: THREE.Vector3, color = '#7cd65a', count = 8): void {
    this.spawn(pos, 'circle_05', color, { count, speed: 1.8, up: 2.8, size: 0.25, life: 0.9, additive: false, gravity: 6 });
  }
  /** A single soft star that blinks in place (ripe crops catching the light). */
  twinkle(pos: THREE.Vector3, color = '#fff3b0'): void {
    this.spawn(pos, 'star_04', color, { count: 1, speed: 0.05, up: 0.25, size: 0.42, life: 0.75, gravity: 0, spread: 0.05 });
  }
  hearts(pos: THREE.Vector3): void {
    this.spawn(pos, 'light_01', '#ff7fb0', { count: 6, speed: 0.6, up: 1.6, size: 0.4, life: 1.1, gravity: -0.3 });
  }
  /** Slowly drifting seasonal particles (leaves, snow, petals). */
  drift(pos: THREE.Vector3, color: string, tex = 'circle_05', count = 3): void {
    this.spawn(pos, tex, color, { count, speed: 0.6, up: -0.4, size: 0.28, life: 5, additive: false, gravity: 0.05, spread: 18 });
  }
  levelUp(pos: THREE.Vector3): void {
    this.spawn(pos, 'star_04', '#ffe066', { count: 30, speed: 4, up: 5, size: 0.7, life: 1.3, gravity: 5 });
    this.spawn(pos, 'magic_04', '#aef6ff', { count: 14, speed: 2.5, up: 3, size: 0.9, life: 1.2, gravity: 2 });
  }

  /** A produce model hops out of the ground and spins away (harvest pop). */
  async pop(pos: THREE.Vector3, modelId: string, scale = 0.35): Promise<void> {
    let mesh: THREE.Object3D;
    if (modelId.startsWith('proc/')) mesh = new THREE.Mesh(procGeometry(modelId.slice(5)), assets.vertexMaterial);
    else if (assets.has(modelId)) mesh = await assets.mesh(modelId);
    else return;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const s = scale / Math.max(size.x, size.y, size.z, 0.01);
    mesh.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
    mesh.scale.setScalar(0.01);
    mesh.position.copy(pos);
    this.group.add(mesh);
    const side = (Math.random() - 0.5) * 0.8;
    gsap.timeline({ onComplete: () => { this.group.remove(mesh); } })
      .to(mesh.scale, { x: s * 1.3, y: s * 1.3, z: s * 1.3, duration: 0.15, ease: 'back.out(3)' })
      .to(mesh.position, { y: pos.y + 1.4, x: pos.x + side, duration: 0.35, ease: 'power2.out' }, 0)
      .to(mesh.rotation, { y: Math.PI * 2, duration: 0.7 }, 0)
      .to(mesh.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.25, ease: 'back.in(2)' }, 0.45);
  }

  get active(): boolean { return this.particles.length > 0 || this.group.children.length > 0; }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        this.group.remove(p.sprite);
        this.free.push(p);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.x *= 0.98; p.vel.z *= 0.98;
      const m = p.sprite.material as THREE.SpriteMaterial;
      m.opacity = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      m.rotation += p.spin * dt;
      if (p.grow) p.sprite.scale.multiplyScalar(1 + p.grow * dt);
    }
  }
}
