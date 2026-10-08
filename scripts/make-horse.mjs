// Builds the horse model (public/assets/models/pet/horse.glb) in the style of the Kenney cube pets: chunky boxes in
// flat colours, nose towards +z. There is no horse in the Kenney pack, so it is made here from boxes. Run once:
// `node scripts/make-horse.mjs` (it also adds `pet/horse` to public/assets/manifest.json).
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter wants a browser FileReader: a tiny stand-in is enough for binary export
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.(); }); }
};

const COAT = '#a8642f', COAT_DARK = '#8a4f24', MANE = '#3f2a1c', BLAZE = '#f6efe2', HOOF = '#352720', NOSE = '#d49a6a', EYE = '#1b1410', INNER = '#e8a98e';
const mats = new Map();
const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 1 })); return mats.get(c); };
const root = new THREE.Group();
const box = (w, h, d, c, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  root.add(m);
};

// body, chest and rump
box(0.78, 0.74, 1.5, COAT, 0, 1.12, -0.05);
box(0.7, 0.66, 0.4, COAT, 0, 1.15, 0.62);
box(0.7, 0.66, 0.4, COAT_DARK, 0, 1.13, -0.72);
// legs with hooves, front pair a touch forward
for (const [x, z] of [[-0.25, 0.62], [0.25, 0.62], [-0.25, -0.68], [0.25, -0.68]]) {
  box(0.22, 0.62, 0.24, COAT_DARK, x, 0.55, z);
  box(0.25, 0.14, 0.27, HOOF, x, 0.07, z);
}
// neck leaning forward, head with a white blaze and a muzzle
box(0.42, 0.9, 0.46, COAT, 0, 1.72, 0.84, -0.42, 0, 0);
box(0.46, 0.5, 0.62, COAT, 0, 2.18, 1.14, -0.25, 0, 0);
box(0.14, 0.42, 0.05, BLAZE, 0, 2.2, 1.46, -0.25, 0, 0);
box(0.38, 0.3, 0.3, NOSE, 0, 2.0, 1.52, -0.25, 0, 0);
box(0.05, 0.05, 0.02, EYE, 0.24, 2.28, 1.3);
box(0.05, 0.05, 0.02, EYE, -0.24, 2.28, 1.3);
// ears
for (const x of [-0.14, 0.14]) { box(0.1, 0.22, 0.1, COAT_DARK, x, 2.5, 0.95); box(0.04, 0.12, 0.04, INNER, x, 2.49, 1.0); }
// mane along the neck and a tail
box(0.1, 0.95, 0.2, MANE, 0, 1.88, 0.58, -0.42, 0, 0);
box(0.1, 0.2, 0.22, MANE, 0, 2.5, 0.8);
box(0.16, 0.7, 0.16, MANE, 0, 1.0, -1.02, 0.28, 0, 0);

const exporter = new GLTFExporter();
const glb = await new Promise((res, rej) => exporter.parse(root, res, rej, { binary: true }));
fs.writeFileSync(new URL('../public/assets/models/pet/horse.glb', import.meta.url), Buffer.from(glb));

const box3 = new THREE.Box3().setFromObject(root);
const mPath = new URL('../public/assets/manifest.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
manifest.models['pet/horse'] = {
  url: 'models/pet/horse.glb', pack: 'Made for Cozy Acres', source: 'scripts/make-horse.mjs',
  min: box3.min.toArray().map((n) => +n.toFixed(3)), max: box3.max.toArray().map((n) => +n.toFixed(3)), tris: root.children.length * 12,
};
fs.writeFileSync(mPath, JSON.stringify(manifest));
console.log('horse written', box3.min.toArray(), box3.max.toArray());
