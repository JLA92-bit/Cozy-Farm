import * as THREE from 'three';

/**
 * 1.16 Draw-call batching for decor: every decor model drawn with the same material (most share the vertex-colour
 * material or one of a few palette atlases) goes into one THREE.BatchedMesh, so a farm with hundreds of different
 * decorations costs a handful of draws instead of one per piece (plus one per piece for shadows). Each batch grows
 * its instance and geometry buffers as needed and culls per instance.
 */

/** The part of a pool a building view needs: add, move and remove one instance. */
export interface PoolLike {
  add(matrix: THREE.Matrix4): number;
  set(handle: number, matrix: THREE.Matrix4): void;
  get(handle: number, out: THREE.Matrix4): THREE.Matrix4;
  remove(handle: number): void;
}

const START_INSTANCES = 128;
const START_VERTICES = 32768;
const START_INDICES = 65536;

/** Geometries can only share a batch when their attribute layout and indexing match. */
function layoutKey(g: THREE.BufferGeometry): string {
  const attrs = Object.keys(g.attributes).sort().map((n) => {
    const a = g.getAttribute(n) as THREE.BufferAttribute;
    return `${n}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
  });
  return `${g.getIndex() ? 'i' : 'n'}|${attrs.join(',')}`;
}

class Batch {
  readonly mesh: THREE.BatchedMesh;
  private geometries = new Map<THREE.BufferGeometry, number>();
  private vertices = 0;
  private indices = 0;
  private maxInstances = START_INSTANCES;
  private maxVertices = START_VERTICES;
  private maxIndices = START_INDICES;
  private live = 0;

  constructor(parent: THREE.Object3D, material: THREE.Material, castShadow: boolean, name: string) {
    this.mesh = new THREE.BatchedMesh(this.maxInstances, this.maxVertices, this.maxIndices, material);
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    // 1.20: never cull the batch as a whole. three.js works out a batch's bounds once, at its first draw, and does
    // not grow them when pieces are added or moved, so decor placed later (big pieces most of all) vanished whenever
    // those old bounds were off screen. Each piece is still culled on its own (perObjectFrustumCulled).
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    parent.add(this.mesh);
  }

  /** The batch's id for a geometry, adding it (and growing the buffers) the first time. */
  geometryId(g: THREE.BufferGeometry): number {
    let id = this.geometries.get(g);
    if (id !== undefined) return id;
    const v = g.getAttribute('position').count;
    const i = g.getIndex()?.count ?? 0;
    if (this.vertices + v > this.maxVertices || this.indices + i > this.maxIndices) {
      while (this.vertices + v > this.maxVertices) this.maxVertices *= 2;
      while (this.indices + i > this.maxIndices) this.maxIndices *= 2;
      this.mesh.setGeometrySize(this.maxVertices, this.maxIndices);
    }
    id = this.mesh.addGeometry(g);
    this.vertices += v;
    this.indices += i;
    this.geometries.set(g, id);
    return id;
  }

  add(geometryId: number, matrix: THREE.Matrix4): number {
    if (this.live >= this.maxInstances) {
      this.maxInstances *= 2;
      this.mesh.setInstanceCount(this.maxInstances);
    }
    const id = this.mesh.addInstance(geometryId);
    this.mesh.setMatrixAt(id, matrix);
    this.live++;
    this.stale();
    return id;
  }

  set(id: number, matrix: THREE.Matrix4): void {
    this.mesh.setMatrixAt(id, matrix);
    this.stale();
  }

  remove(id: number): void {
    this.mesh.deleteInstance(id);
    this.live--;
    this.stale();
  }

  /** Bounds are worked out again when next needed (taps and anything else that reads them). */
  private stale(): void {
    this.mesh.boundingSphere = null;
    this.mesh.boundingBox = null;
  }
}

/** Keyed collection of batches sharing a parent (one per material, shadow setting and geometry layout). */
export class BatchSet {
  private batches = new Map<string, Batch>();
  constructor(private parent: THREE.Object3D) {}

  /** A pool-like handle for one model: instances of it go into the batch for its material. */
  pool(geometry: THREE.BufferGeometry, material: THREE.Material, castShadow: boolean): PoolLike {
    const key = `${material.uuid}|${castShadow ? 1 : 0}|${layoutKey(geometry)}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = new Batch(this.parent, material, castShadow, `batch/${material.name || material.uuid}`);
      this.batches.set(key, batch);
    }
    const b = batch;
    const gid = b.geometryId(geometry);
    return {
      add: (m) => b.add(gid, m),
      set: (h, m) => b.set(h, m),
      get: (h, out) => b.mesh.getMatrixAt(h, out),
      remove: (h) => b.remove(h),
    };
  }

  get size(): number { return this.batches.size; }
}
