// Turntable for checking meshes. Not shipped. See tools/meshshot.mjs.
import * as THREE from 'three';
import { garmentGeometry } from './garment.js';
import SIZE from './size.json';
const q = new URLSearchParams(location.search), name = q.get('g') || 'blossom';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(innerWidth, innerHeight); r.toneMapping = THREE.ACESFilmicToneMapping;
document.body.style.margin = 0; document.body.append(r.domElement);
const sc = new THREE.Scene(); sc.background = new THREE.Color(q.get('bg') || 0x101014);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .1, 100);
const key = new THREE.DirectionalLight(0xfff2ea, 3); key.position.set(-5, 9, 11); sc.add(key);
const a = new THREE.DirectionalLight(0x3a62ff, 3.2); a.position.set(14, 1, -1); sc.add(a);
const b = new THREE.DirectionalLight(0xff6f9f, 2.2); b.position.set(-14, 4, -1); sc.add(b);
sc.add(new THREE.AmbientLight(0xb0a8b8, .6));
const tl = new THREE.TextureLoader();
const load = (u, s) => new Promise(res => tl.load(u, t => { if (s) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }));
(async () => {
  const p = `img/hero/${name}`;
  const [buf, fc, fn, bc, bn] = await Promise.all([fetch(p + '.bin').then(x => x.arrayBuffer()), load(p + '-front.webp', 1), load(p + '-front-n.webp'), load(p + '-back.webp', 1), load(p + '-back-n.webp')]);
  const { body, cap } = garmentGeometry(buf, 7.4, SIZE[name]);
  const m = (map, normalMap) => new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(.6, .6), roughness: .9, sheen: .4, sheenRoughness: .5, sheenColor: new THREE.Color(0x70727e) });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(body, q.get('clay') ? new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: .7 }) : [m(fc, fn), m(bc, bn)]));
  g.add(new THREE.Mesh(cap, new THREE.MeshStandardMaterial({ color: SIZE[name].inner, roughness: 1 })));
  sc.add(g);
  window.pose = (ry, rx = 0, z = 22, y = 0) => { g.rotation.set(rx, ry, 0); cam.position.set(0, y, z); cam.lookAt(0, y, 0); r.render(sc, cam); };
  window.ready = true; pose(0);
})();
