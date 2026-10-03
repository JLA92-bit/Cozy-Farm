import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/lilita-one/400.css';
import './ui/styles.css';
import * as THREE from 'three';
import { GameLoop } from './core/GameLoop';
import { registerSW } from 'virtual:pwa-register';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd3f4');
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
camera.position.set(14, 14, 14);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight('#ffffff', '#6a8f4a', 1.2));
const sun = new THREE.DirectionalLight('#fff4d6', 2);
sun.position.set(5, 10, 3);
scene.add(sun);
const island = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 1.2, 8), new THREE.MeshLambertMaterial({ color: '#7cc85a', flatShading: true }));
scene.add(island);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const loop = new GameLoop((dt) => {
  island.rotation.y += dt * 0.3;
  renderer.render(scene, camera);
}, () => {});
loop.start();
document.getElementById('boot-screen')?.classList.add('hidden');
registerSW({ immediate: true });
