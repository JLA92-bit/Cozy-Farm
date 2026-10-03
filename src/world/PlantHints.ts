import * as THREE from 'three';
import type { PlacedBuilding } from '../systems/State';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** Soft rounded-square frame with a dashed outline, drawn once. */
function makeHintTexture(): THREE.Texture {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const r = 22, p = 10;
  const rr = () => {
    g.beginPath();
    g.moveTo(p + r, p); g.arcTo(n - p, p, n - p, n - p, r); g.arcTo(n - p, n - p, p, n - p, r);
    g.arcTo(p, n - p, p, p, r); g.arcTo(p, p, n - p, p, r); g.closePath();
  };
  rr();
  g.fillStyle = 'rgba(255,246,170,0.3)';
  g.fill();
  g.lineWidth = 9;
  g.setLineDash([16, 10]);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * While planting, every empty field wears a gently pulsing dashed frame so it is
 * obvious where the next seed can go. One instanced mesh = one draw call.
 */
export class PlantHints {
  private mesh: THREE.InstancedMesh;
  private mat: THREE.MeshBasicMaterial;
  private on = false;
  private t = 0;
  private refreshT = 0;

  constructor(private parent: THREE.Object3D, cap = 64) {
    this.mat = new THREE.MeshBasicMaterial({ map: makeHintTexture(), transparent: true, depthWrite: false, opacity: 0 });
    this.mesh = this.make(cap);
  }

  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.86, 1.86), this.mat, cap);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = 2;
    m.visible = false;
    m.raycast = () => {};
    this.parent.add(m);
    return m;
  }

  get visible(): boolean { return this.on; }
  set visible(v: boolean) {
    if (v === this.on) return;
    this.on = v;
    this.t = 0;
    this.refreshT = 0;
    if (!v) this.mesh.visible = false;
  }

  private empty(b: PlacedBuilding, now: number): boolean {
    return b.type === 'plot' && !b.plot && !(b.buildEnd && b.buildEnd > now);
  }

  /** Call each frame with the plots (and their centres) the farm knows about. */
  update(dt: number, plots: { values(): Iterable<{ b: PlacedBuilding; center: THREE.Vector3 }> }, now: number): void {
    if (!this.on) return;
    this.t += dt;
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.2;
      let need = 0;
      for (const v of plots.values()) if (this.empty(v.b, now)) need++;
      if (need > this.mesh.instanceMatrix.count) {
        // grow (rare: very large farms)
        const old = this.mesh;
        this.parent.remove(old);
        old.geometry.dispose();
        old.dispose();
        this.mesh = this.make(need * 2);
      }
      let n = 0;
      for (const v of plots.values()) {
        if (!this.empty(v.b, now)) continue;
        tmpM.compose(tmpV.set(v.center.x, 0.23, v.center.z), tmpQ, tmpS.set(1, 1, 1));
        this.mesh.setMatrixAt(n++, tmpM);
      }
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.visible = n > 0;
    }
    // fade in, then breathe
    const fade = Math.min(1, this.t / 0.25);
    this.mat.opacity = fade * (0.68 + 0.3 * Math.sin(this.t * 4.2));
  }
}
