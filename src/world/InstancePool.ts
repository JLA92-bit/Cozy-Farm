import * as THREE from 'three';

/**
 * Growable InstancedMesh wrapper. Each repeated model (crop stage, fence, path, obstacle, animal type)
 * gets one pool = one draw call no matter how many copies exist.
 */
export class InstancePool {
  mesh: THREE.InstancedMesh;
  private owners: number[] = []; // handle per slot
  private slotOf = new Map<number, number>(); // handle -> slot
  private nextHandle = 1;
  private capacity: number;
  private hasColors = false;

  constructor(
    private parent: THREE.Object3D,
    private geometry: THREE.BufferGeometry,
    private material: THREE.Material,
    private opts: { castShadow?: boolean; receiveShadow?: boolean; name?: string } = {},
    capacity = 16,
  ) {
    this.capacity = capacity;
    this.mesh = this.make(capacity);
    parent.add(this.mesh);
  }

  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geometry, this.material, cap);
    m.count = 0;
    m.castShadow = this.opts.castShadow ?? true;
    m.receiveShadow = this.opts.receiveShadow ?? true;
    m.name = this.opts.name ?? 'pool';
    // culled against the bounding sphere of all instances (recomputed when instances change)
    m.frustumCulled = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  }

  private grow(): void {
    const old = this.mesh;
    this.capacity *= 2;
    const m = this.make(this.capacity);
    m.count = old.count;
    (m.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    if (old.instanceColor) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
      (m.instanceColor.array as Float32Array).set(old.instanceColor.array as Float32Array);
    }
    this.parent.remove(old);
    old.dispose();
    this.parent.add(m);
    this.mesh = m;
  }

  get count(): number { return this.mesh.count; }

  private boundsDirty = false;
  /** Recompute culling bounds lazily, at most once per frame. */
  private dirty(): void {
    if (this.boundsDirty) return;
    this.boundsDirty = true;
    requestAnimationFrame(() => {
      this.boundsDirty = false;
      if (this.mesh.count > 0) this.mesh.computeBoundingSphere();
    });
  }

  add(matrix: THREE.Matrix4, color?: THREE.Color): number {
    if (this.mesh.count >= this.capacity) this.grow();
    const slot = this.mesh.count++;
    const h = this.nextHandle++;
    this.owners[slot] = h;
    this.slotOf.set(h, slot);
    this.mesh.setMatrixAt(slot, matrix);
    if (color || this.hasColors) {
      if (!this.mesh.instanceColor) {
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
      }
      this.hasColors = true;
      this.mesh.setColorAt(slot, color ?? new THREE.Color(1, 1, 1));
      this.mesh.instanceColor!.needsUpdate = true;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty();
    return h;
  }

  set(handle: number, matrix: THREE.Matrix4): void {
    const slot = this.slotOf.get(handle);
    if (slot === undefined) return;
    this.mesh.setMatrixAt(slot, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty();
  }

  setColor(handle: number, color: THREE.Color): void {
    const slot = this.slotOf.get(handle);
    if (slot === undefined) return;
    if (!this.mesh.instanceColor) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
      this.hasColors = true;
    }
    this.mesh.setColorAt(slot, color);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  get(handle: number, out: THREE.Matrix4): THREE.Matrix4 {
    const slot = this.slotOf.get(handle);
    if (slot !== undefined) this.mesh.getMatrixAt(slot, out);
    return out;
  }

  remove(handle: number): void {
    const slot = this.slotOf.get(handle);
    if (slot === undefined) return;
    const last = this.mesh.count - 1;
    if (slot !== last) {
      const m = new THREE.Matrix4();
      this.mesh.getMatrixAt(last, m);
      this.mesh.setMatrixAt(slot, m);
      if (this.mesh.instanceColor) {
        const c = new THREE.Color();
        this.mesh.getColorAt(last, c);
        this.mesh.setColorAt(slot, c);
        this.mesh.instanceColor.needsUpdate = true;
      }
      const movedHandle = this.owners[last];
      this.owners[slot] = movedHandle;
      this.slotOf.set(movedHandle, slot);
    }
    this.slotOf.delete(handle);
    this.mesh.count--;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty();
  }
}

/** Keyed collection of pools sharing a parent. */
export class PoolSet {
  private pools = new Map<string, InstancePool>();
  constructor(private parent: THREE.Object3D) {}

  pool(key: string, make: () => { geometry: THREE.BufferGeometry; material: THREE.Material; castShadow?: boolean; receiveShadow?: boolean }): InstancePool {
    let p = this.pools.get(key);
    if (!p) {
      const { geometry, material, castShadow, receiveShadow } = make();
      p = new InstancePool(this.parent, geometry, material, { castShadow, receiveShadow, name: key });
      this.pools.set(key, p);
    }
    return p;
  }
  get(key: string): InstancePool | undefined { return this.pools.get(key); }
  get size(): number { return this.pools.size; }
  *all(): IterableIterator<InstancePool> { yield* this.pools.values(); }
}
