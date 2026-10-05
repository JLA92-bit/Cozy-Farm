import * as THREE from 'three';
import { assets } from '../core/Assets';
import { BUILDING, COSMETICS } from '../data';
import { Character } from './Character';
import { procGeometry } from './ProcModels';
import { objectFor, visualFor } from './Visuals';
import { attachFx } from './models/DecorFx';

/**
 * Renders 3D thumbnails (shop cards, item icons for things without an emoji) with the main renderer
 * into an offscreen target. Results are cached as data URLs. Keys: 'model:<assetId|proc/name>' or 'building:<type>'.
 */
class Thumbs {
  private renderer: THREE.WebGLRenderer | null = null;
  private cache = new Map<string, Promise<string | null>>();
  private queue: (() => Promise<void>)[] = [];
  private running = false;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  private target = new THREE.WebGLRenderTarget(128, 128, { colorSpace: THREE.SRGBColorSpace });
  private canvas = document.createElement('canvas');
  private size = 128;

  constructor() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9a8a70', 1.9));
    const d = new THREE.DirectionalLight('#fff4e0', 2.0);
    d.position.set(3, 5, 4);
    this.scene.add(d);
    this.canvas.width = this.canvas.height = this.size;
  }

  attach(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    if (this.queue.length) void this.pump();
  }

  get(key: string): Promise<string | null> {
    let p = this.cache.get(key);
    if (!p) {
      p = new Promise((resolve) => {
        this.queue.push(async () => {
          try { resolve(await this.render(key)); } catch (e) { console.warn('thumb failed', key, e); resolve(null); }
        });
      });
      this.cache.set(key, p);
      void this.pump();
    }
    return p;
  }

  private async pump(): Promise<void> {
    if (this.running || !this.renderer) return;
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift()!;
      await job();
    }
    this.running = false;
  }

  private async objectFor(key: string): Promise<THREE.Object3D | null> {
    if (key.startsWith('look:')) {
      // another player's farmer, from their public look (JSON, already checked by the caller)
      const l = JSON.parse(key.slice(5)) as { body: string; skin: string; hair: string; top: string; bottom: string; hat: string };
      const c = await Character.create({ ...l, accessory: 'none', pet: 'none' });
      c.mixer.update(0.4);
      return c.root;
    }
    if (key.startsWith('avatar:')) {
      // pre-made farmer portrait: posed in its idle animation
      const a = COSMETICS.avatars.find((x) => x.id === key.slice(7));
      if (!a) return null;
      const c = await Character.create({ body: a.body, skin: a.skin, hair: a.hair, top: a.top, bottom: a.bottom, hat: a.hat, accessory: 'none', pet: 'none' });
      c.mixer.update(0.4);
      return c.root;
    }
    if (key.startsWith('building:')) {
      const type = key.slice(9);
      const def = BUILDING[type];
      if (def.model.startsWith('paint:')) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshLambertMaterial({ color: def.model.slice(6) }));
        return m;
      }
      const v = await visualFor(type);
      if (!v) return null;
      const o = objectFor(v);
      // flames, bulbs and sign text of pretty decor, posed once
      attachFx(o.children[0], { uid: 1, type, x: 0, z: 0, rot: 0, level: 1 }, def, '')?.update(0, 0.6, 0.45);
      return o;
    }
    const id = key.slice(6);
    if (id.startsWith('proc/')) return new THREE.Mesh(procGeometry(id.slice(5)), assets.vertexMaterial);
    if (!assets.has(id)) return null;
    return assets.mesh(id);
  }

  private async render(key: string): Promise<string | null> {
    const obj = await this.objectFor(key);
    if (!obj || !this.renderer) return null;
    const r = this.renderer;
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const portrait = key.startsWith('avatar:') || key.startsWith('look:');
    if (portrait) { sphere.center.y += sphere.radius * 0.2; sphere.radius *= 0.8; }
    const dir = portrait ? new THREE.Vector3(0.25, 0.3, 1).normalize() : new THREE.Vector3(1, 0.85, 1.15).normalize();
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (portrait ? 0.9 : 1.02);
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.lookAt(sphere.center);
    this.camera.near = dist / 20; this.camera.far = dist * 4;
    this.camera.updateProjectionMatrix();
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevShadow = r.shadowMap.enabled;
    r.shadowMap.enabled = false;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    const px = new Uint8Array(this.size * this.size * 4);
    r.readRenderTargetPixels(this.target, 0, 0, this.size, this.size, px);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    r.shadowMap.enabled = prevShadow;
    this.scene.remove(obj);
    // flip rows (GL origin is bottom-left)
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(this.size, this.size);
    const row = this.size * 4;
    for (let y = 0; y < this.size; y++) img.data.set(px.subarray((this.size - 1 - y) * row, (this.size - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}

export const thumbs = new Thumbs();
