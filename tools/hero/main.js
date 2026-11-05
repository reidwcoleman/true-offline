// One continuous 3D stage for the first two sections. A cherry blossom hoodie floats inside a chrome
// ring of the wordmark, after the globe and ring in the brand's logo, with real blossom branches and
// falling petals. Scrolling flies into the back print, then each featured hoodie turns in 3D.
// Bundled to site/hero.js by tools/hero/build.sh.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import GL from './glyphs.json';
import SIZE from './size.json';

const INK = 0x050508, COBALT = 0x0a35f0, VIOLET = 0x3a22a8, SAKURA = 0xff6f9f;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const expoOut = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const inOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rng = seed => () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const STAR = [[135, 0], [137, 74], [332, 60], [147, 114], [150, 195], [87, 147], [17, 199], [57, 127], [0, 82], [90, 78]];
const coarse = matchMedia('(pointer:coarse)').matches;

function fail(err) {
  console.warn('hero fallback', err);
  if (window.TO_heroFail) window.TO_heroFail();
}

/* Reflections only, never seen directly. Chrome reads as chrome because of one thing: a bright sky
   falling to a hard horizon over a dark ground. A few hot strips add the moving glints. */
function studio(renderer) {
  const s = new THREE.Scene();
  const c = document.createElement('canvas'); c.width = 16; c.height = 1024;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1024);
  [[0, '#f6f6ff'], [.22, '#b0b4d6'], [.4, '#1c1d33'], [.466, '#646aa6'], [.497, '#ffffff'], [.5, '#000000'],
    [.57, '#060609'], [.76, '#1c1224'], [.9, '#b03a78'], [1, '#ff8fb6']].forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 16, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 48), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
  dome.material.color.setScalar(1.9);
  s.add(dome);
  const strip = (color, power, w, h, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  strip(0xffffff, 18, .5, 34, [-22, 4, 16]);
  strip(0xffffff, 14, .35, 30, [12, 2, 25]);
  strip(COBALT, 16, 2.4, 40, [27, 0, 4]);
  strip(0xffffff, 16, .4, 30, [20, 3, -20]);
  strip(SAKURA, 12, 2, 36, [-24, -2, -14]);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0);
  pm.dispose();
  return rt.texture;
}

/* Flat letter faces would mirror one flat colour. Leaning the normals like a very shallow pillow
   makes the horizon sweep through each letter, which is what the eye reads as polished metal. */
function pillow(g, lean) {
  g.computeBoundingBox();
  const b = g.boundingBox, P = g.attributes.position, N = g.attributes.normal;
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
  const hx = (b.max.x - b.min.x) / 2 || 1, hy = (b.max.y - b.min.y) / 2 || 1;
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    if (N.getZ(i) < .98) continue;
    v.set(((P.getX(i) - cx) / hx) * lean * .35, ((P.getY(i) - cy) / hy) * lean, 1).normalize();
    N.setXYZ(i, v.x, v.y, v.z);
  }
  N.needsUpdate = true;
}

const glyphCache = new Map();
function glyph(ch, cap) {
  const key = ch + cap;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const s = cap / GL.cap;
  const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${GL.glyphs[ch].d}"/></svg>`);
  const shapes = svg.paths.flatMap(p => SVGLoader.createShapes(p));
  const k = cap / 1.2;
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: .3 * k / s, curveSegments: 12, bevelEnabled: true, bevelThickness: .055 * k / s, bevelSize: .04 * k / s, bevelSegments: 5,
  });
  g.scale(s, s, s);
  g.translate(-GL.glyphs[ch].adv * s / 2, 0, 0);
  pillow(g, .5);
  glyphCache.set(key, g);
  return g;
}

function starGeometry(size, depth) {
  const sh = new THREE.Shape();
  STAR.forEach(([x, y], i) => (i ? sh.lineTo(x, -y) : sh.moveTo(x, -y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth / size * 332, bevelEnabled: true, bevelThickness: 7, bevelSize: 5, bevelSegments: 3 });
  g.center();
  g.scale(size / 332, size / 332, size / 332);
  pillow(g, .4);
  return g;
}

/* Type laid along an arc. It always faces the viewer enough to read: letters turn only part of the
   way with the curve (lean), and the rear arc faces inward, so nothing is ever seen backwards. */
function arc(text, { R, cap, y = 0, lean = .55, rear = false, centre = 0, mat }) {
  const g = new THREE.Group();
  const s = cap / GL.cap, gap = .13 * cap, space = .62 * cap;
  const items = [];
  let run = 0;
  for (const ch of text) {
    if (ch === ' ') { run += space; continue; }
    const w = GL.glyphs[ch].adv * s;
    items.push({ ch, at: run + w / 2 });
    run += w + gap;
  }
  run -= gap;
  for (const it of items) {
    const a = centre + (it.at - run / 2) / R;
    const m = new THREE.Mesh(glyph(it.ch, cap), mat);
    if (rear) { m.position.set(Math.sin(a) * R, y, -Math.cos(a) * R); m.rotation.y = -a * lean; }
    else { m.position.set(Math.sin(a) * R, y, Math.cos(a) * R); m.rotation.y = a * lean; }
    g.add(m);
  }
  g.userData.half = run / 2 / R;                  // half the arc, in radians
  return g;
}

function shell(geo, tex, nrm, hgt, w, h, depth, flip) {
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, normalMap: nrm, normalScale: new THREE.Vector2(.62, .62),
    displacementMap: hgt, displacementScale: depth,
    roughness: .9, metalness: 0, envMapIntensity: .18,
    sheen: .4, sheenRoughness: .5, sheenColor: new THREE.Color(0x70727e),
    alphaTest: .5, alphaToCoverage: true, side: THREE.FrontSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(w, h, 1);
  if (flip) m.rotation.y = Math.PI;
  return m;
}

function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glow(stops, size, pos, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: glowTexture(stops), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity, toneMapped: false, fog: false,
  }));
  m.position.set(...pos);
  return m;
}

function starfield(n, r0, r1, size, opacity) {
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(lerp(r0, r1, Math.random()));
    p.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xf2f2ff, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false, toneMapped: false, fog: false }));
}

/* ---------- cherry blossom ---------- */
function petalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.beginPath();
  x.moveTo(128, 250);
  x.bezierCurveTo(30, 190, 8, 90, 62, 34);
  x.bezierCurveTo(84, 12, 112, 18, 128, 46);       // the notch that makes it a sakura petal
  x.bezierCurveTo(144, 18, 172, 12, 194, 34);
  x.bezierCurveTo(248, 90, 226, 190, 128, 250);
  x.closePath();
  const g = x.createRadialGradient(128, 250, 6, 128, 120, 200);
  g.addColorStop(0, '#d92d6b'); g.addColorStop(.3, '#f86f9e'); g.addColorStop(.62, '#ffbcd2'); g.addColorStop(1, '#fff0f5');
  x.fillStyle = g; x.fill();
  x.strokeStyle = 'rgba(214,60,110,.2)'; x.lineWidth = 1.6;
  for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(128, 240); x.quadraticCurveTo(128 + i * 15, 130, 128 + i * 30, 48); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function petalMaterial(map) {
  return new THREE.MeshStandardMaterial({
    map, alphaTest: .45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: .6, metalness: 0,
    emissive: 0xff8fb0, emissiveMap: map, emissiveIntensity: .34, envMapIntensity: .25,
  });
}
function flowerGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.PlaneGeometry(.3, .36, 3, 3);
    p.translate(0, .18, 0);
    const P = p.attributes.position;
    for (let k = 0; k < P.count; k++) P.setZ(k, -Math.pow(P.getY(k) / .36, 2) * .1 + Math.abs(P.getX(k)) * .1);
    p.rotateX(-.42);
    p.rotateZ((i / 5) * Math.PI * 2);
    parts.push(p);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}
/* A branch that forks and tapers. It runs in a shallow slab so it frames the shot without blocking it. */
function growTree(seed, dirX, reach) {
  const r = rng(seed), tubes = [], spots = [];
  const grow = (start, dir, len, rad, depth) => {
    const pts = [start.clone()];
    const d = dir.clone();
    const n = 5;
    for (let i = 1; i <= n; i++) {
      d.x += (r() - .5) * .42; d.y += (r() - .5) * .42; d.z += (r() - .5) * .16;
      d.normalize();
      pts.push(pts[i - 1].clone().addScaledVector(d, len / n));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 16, rad, 6);
    // taper toward the tip
    const P = tube.attributes.position, ringSize = 7;
    for (let i = 0; i < P.count; i++) {
      const t = Math.floor(i / ringSize) / 16, c = curve.getPointAt(Math.min(1, t));
      const v = new THREE.Vector3().fromBufferAttribute(P, i).sub(c).multiplyScalar(lerp(1, .42, t)).add(c);
      P.setXYZ(i, v.x, v.y, v.z);
    }
    tubes.push(tube);
    const blooms = depth >= 2 ? 5 : depth === 1 ? 4 : 1;
    for (let i = 0; i < blooms; i++) spots.push(curve.getPointAt(.35 + r() * .65));
    if (depth >= 2) { spots.push(pts[n].clone(), pts[n].clone()); return; }
    const kids = depth === 0 ? 4 : 3;
    for (let i = 0; i < kids; i++) {
      const t = .3 + (i / kids) * .65 + r() * .08;
      const p = curve.getPointAt(Math.min(1, t));
      const tan = curve.getTangentAt(Math.min(1, t));
      const side = i % 2 ? 1 : -1;
      const a = side * (.5 + r() * .55);
      const nd = new THREE.Vector3(tan.x * Math.cos(a) - tan.y * Math.sin(a), tan.x * Math.sin(a) + tan.y * Math.cos(a), (r() - .5) * .5).normalize();
      grow(p, nd, len * (.5 + r() * .24), rad * .56, depth + 1);
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dirX, -.16, .05).normalize(), reach, .11, 0);
  return { geo: mergeGeometries(tubes), spots };
}

/* Last pass: a touch of lens split at the edges, vignette and grain. */
const Finish = {
  uniforms: { tDiffuse: { value: null }, t: { value: 0 } },
  vertexShader: 'varying vec2 v; void main(){ v=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `
    varying vec2 v; uniform sampler2D tDiffuse; uniform float t;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 c=v-.5; float r=dot(c,c);
      vec2 o=c*r*.0045;
      vec3 col=vec3(texture2D(tDiffuse,v+o).r,texture2D(tDiffuse,v).g,texture2D(tDiffuse,v-o).b);
      col*=1.-smoothstep(.16,.6,r)*.7;
      col+=(h(gl_FragCoord.xy+t*61.)-.5)*.016;
      gl_FragColor=vec4(col,1.);
    }`,
};

async function start() {
  const canvas = document.querySelector('[data-gl]');
  const wrap = canvas.parentNode;
  const hero = document.querySelector('#hero'), turn = document.querySelector('#turn');
  const fadeEl = document.querySelector('[data-hero-fade]'), foot = document.querySelector('[data-hero-foot]');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  let dpr = Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.environment = studio(renderer);
  scene.fog = new THREE.Fog(INK, 20, 40);
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 400);

  const tl = new THREE.TextureLoader();
  const load = (u, srgb) => new Promise((res, rej) => tl.load(u, t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    res(t);
  }, undefined, rej));

  /* One bent grid serves every shell: each mesh scales it to its garment. */
  const seg = coarse ? 230 : 340;
  const grid = new THREE.PlaneGeometry(1, 1, seg, seg);
  const H = 7.4, D = 1.25;
  async function garment(name) {
    const b = `img/hero/${name}-`;
    const [fc, fn, fh, bc, bn, bh] = await Promise.all([
      load(b + 'front.webp', true), load(b + 'front-n.webp'), load(b + 'front-h.webp'),
      load(b + 'back.webp', true), load(b + 'back-n.webp'), load(b + 'back-h.webp'),
    ]);
    const W = H * SIZE[name].w / SIZE[name].h;
    const g = new THREE.Group();
    g.add(shell(grid, fc, fn, fh, W, H, D, false), shell(grid, bc, bn, bh, W, H, D, true));
    g.userData.w = W;
    return g;
  }

  const hoodie = await garment('blossom');
  const W = hoodie.userData.w;
  const rig = new THREE.Group();                 // everything that leans with the pointer
  rig.add(hoodie);
  scene.add(rig);

  /* chrome wordmark ring */
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf4f5fb, metalness: 1, roughness: .055 });
  const dimChrome = new THREE.MeshStandardMaterial({ color: 0xd8d9e4, metalness: 1, roughness: .14 });
  const R = 9.1;
  const band = (radius, y) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(radius, .032, 10, 240), chrome);
    t.rotation.x = Math.PI / 2; t.position.y = y;
    return t;
  };
  const ringWide = new THREE.Group();
  {
    const cap = 1.02;
    const word = arc('TRUE OFFLINE', { R, cap, mat: chrome, lean: .3 });
    ringWide.add(word, band(R, -.17));
    ringWide.userData.half = word.userData.half + .2;
    ringWide.add(arc('RALEIGH', { R, cap: .46, rear: true, centre: -.82, mat: dimChrome, lean: .75 }));
    ringWide.add(arc('N.C.', { R, cap: .46, rear: true, centre: .82, mat: dimChrome, lean: .75 }));
    const sideStar = starGeometry(1.15, .14);
    [-1, 1].forEach(s => {
      const a = s * (word.userData.half + .2);
      const m = new THREE.Mesh(sideStar, chrome);
      m.position.set(Math.sin(a) * R, cap * .42, Math.cos(a) * R);
      m.rotation.y = a * .5;
      ringWide.add(m);
    });
  }
  const ringTall = new THREE.Group();            // phones: the wordmark stacks on two arcs
  {
    const RT = 6.4;
    ringTall.add(arc('TRUE', { R: RT, cap: 1.06, y: 1.28, mat: chrome, lean: .35 }));
    ringTall.add(arc('OFFLINE', { R: RT, cap: 1.06, mat: chrome, lean: .35 }));
    ringTall.add(band(RT, -.17));
    ringTall.userData.R = RT;
  }
  const ringTilt = new THREE.Group();
  ringTilt.add(ringWide, ringTall);
  const TILT = .165, DROP = -1.0;
  ringTilt.rotation.set(TILT, 0, -.05);
  ringTilt.position.y = DROP;
  rig.add(ringTilt);

  /* the shooting star and its two echoes: white, cobalt, violet, as on the jorts */
  const orbit = new THREE.Group();
  const orbitTilt = new THREE.Group();
  orbitTilt.rotation.set(-.3, 0, .26);
  orbitTilt.position.y = 1.1;
  orbitTilt.add(orbit);
  rig.add(orbitTilt);
  const OR = 9.8;
  const orbitStar = starGeometry(2.3, .26);
  [
    [chrome, 0, 1],
    [new THREE.MeshStandardMaterial({ color: COBALT, metalness: .85, roughness: .22, emissive: COBALT, emissiveIntensity: .9 }), .13, .9],
    [new THREE.MeshStandardMaterial({ color: VIOLET, metalness: .85, roughness: .25, emissive: VIOLET, emissiveIntensity: .7 }), .25, .8],
  ].forEach(([mat, lag, sc]) => {
    const pivot = new THREE.Group();
    pivot.rotation.y = lag;
    const m = new THREE.Mesh(orbitStar, mat);
    m.position.set(0, 0, OR); m.scale.setScalar(sc);
    pivot.add(m);
    orbit.add(pivot);
  });
  {
    const pts = [];
    const n = 90, arcLen = 1.25;
    for (let i = 0; i <= n; i++) { const a = (i / n) * arcLen; pts.push(new THREE.Vector3(Math.sin(a) * OR, 0, Math.cos(a) * OR)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, .03, 6);
    const col = new Float32Array(tube.attributes.position.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < tube.attributes.position.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(tube.attributes.position, i);
      const k = clamp(Math.atan2(v.x, v.z) / arcLen);
      c.set(COBALT).lerp(new THREE.Color(0xffffff), Math.pow(1 - k, 5)).multiplyScalar(Math.pow(1 - k, 1.5) * 3.2);
      col.set([c.r, c.g, c.b], i * 3);
    }
    tube.setAttribute('color', new THREE.BufferAttribute(col, 3));
    orbit.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  }

  /* blossom branches framing the top of the shot */
  const petalMap = petalTexture();
  petalMap.anisotropy = 4;
  const bloomMat = petalMaterial(petalMap);
  const bark = new THREE.MeshStandardMaterial({ color: 0x1b1214, roughness: .62, metalness: .05, envMapIntensity: .55 });
  const flowerGeo = flowerGeometry();
  function tree(seed, dirX, reach, per) {
    const { geo, spots } = growTree(seed, dirX, reach);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, bark));
    const r = rng(seed + 9);
    const n = spots.length * per;
    const inst = new THREE.InstancedMesh(flowerGeo, bloomMat, n);
    const o = new THREE.Object3D(), col = new THREE.Color();
    let i = 0;
    for (const s of spots) {
      for (let k = 0; k < per; k++, i++) {
        o.position.set(s.x + (r() - .5) * .5, s.y + (r() - .5) * .5, s.z + (r() - .5) * .4);
        o.rotation.set((r() - .5) * 1.9, (r() - .5) * 1.9, r() * 6.28);
        o.scale.setScalar(.5 + r() * .46);
        o.updateMatrix();
        inst.setMatrixAt(i, o.matrix);
        inst.setColorAt(i, col.setHSL(.955, .55 + r() * .35, .8 + r() * .16));
      }
    }
    g.add(inst);
    return g;
  }
  const treeL = tree(11, 1, 4.9, 3);
  const treeR = tree(29, -1, 4.2, 3);
  const trees = new THREE.Group();
  trees.add(treeL, treeR);
  scene.add(trees);

  /* falling petals */
  const N = coarse ? 170 : 300;
  const petalGeo = new THREE.PlaneGeometry(.26, .3, 3, 3);
  {
    const P = petalGeo.attributes.position;
    for (let k = 0; k < P.count; k++) P.setZ(k, -Math.pow(P.getX(k) / .13, 2) * .035 + Math.pow(P.getY(k) / .15, 2) * .02);
    petalGeo.computeVertexNormals();
  }
  const petals = new THREE.InstancedMesh(petalGeo, bloomMat, N);
  petals.frustumCulled = false;
  scene.add(petals);
  const pr = rng(5), P = [];
  const px0 = new THREE.Object3D(), pcol = new THREE.Color();
  for (let i = 0; i < N; i++) {
    P.push({ x: (pr() - .5) * 30, y: (pr() - .5) * 22, z: lerp(-11, 13, pr()), fall: .55 + pr() * .75, ph: pr() * 6.28, f: .5 + pr() * .9, a: .4 + pr() * .9, rx: pr() * 6.28, ry: pr() * 6.28, sx: (pr() - .5) * 2.2, sy: (pr() - .5) * 2.6, s: .7 + pr() * .9 });
    petals.setColorAt(i, pcol.setHSL(.955, .5 + pr() * .4, .82 + pr() * .14));
  }

  /* light on the fabric */
  const key = new THREE.DirectionalLight(0xfff2ea, 3); key.position.set(-5, 9, 11); scene.add(key);
  const rimA = new THREE.DirectionalLight(0x3a62ff, 3.2); rimA.position.set(14, 1, -1); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(SAKURA, 2.2); rimB.position.set(-14, 4, -1); scene.add(rimB);
  const under = new THREE.DirectionalLight(0xff8fb6, .5); under.position.set(0, -10, 5); scene.add(under);
  scene.add(new THREE.AmbientLight(0xb0a8b8, .38));

  /* space */
  const nebula = glow([[0, 'rgba(64,30,130,.2)'], [.4, 'rgba(34,20,90,.09)'], [1, 'rgba(0,0,0,0)']], 60, [3, 2, -18]);
  const nebula2 = glow([[0, 'rgba(10,53,240,.12)'], [.5, 'rgba(10,40,160,.04)'], [1, 'rgba(0,0,0,0)']], 44, [-16, -7, -24]);
  const halo = glow([[0, 'rgba(255,255,255,.34)'], [.45, 'rgba(255,255,255,.1)'], [1, 'rgba(0,0,0,0)']], 18, [0, .5, -4.2]);
  halo.material.color.set(0xff9fbe);
  halo.material.opacity = .78;
  scene.add(nebula, nebula2, halo);
  const far = starfield(1500, 70, 150, 1.1, .6);
  const near = starfield(120, 18, 40, 1.7, .7);
  scene.add(far, near);

  /* featured hoodies, one per stop as you scroll */
  const STOPS = [
    ['pagoda', 'PAGODA', 0xff5f96], ['globe', 'GLOBE', 0xd8467e], ['rooster', 'ROOSTER', 0xff6a2a], ['dreamer', 'DREAMER', 0xe9d3b0],
  ];
  const gallery = new THREE.Group();
  gallery.visible = false;
  scene.add(gallery);
  const stops = STOPS.map(([name, word, tint]) => {
    const pivot = new THREE.Group();
    pivot.visible = false;
    const wordRing = new THREE.Group();
    wordRing.add(arc(word, { R: 8, cap: 1.2, mat: chrome, lean: .5 }));
    const tilt = new THREE.Group();
    tilt.rotation.set(TILT, 0, 0); tilt.position.y = DROP - .55;
    tilt.add(wordRing);
    pivot.add(tilt);
    gallery.add(pivot);
    return { name, tint: new THREE.Color(tint), pivot, wordRing, tilt, body: null };
  });
  const loadStops = async () => {
    for (const s of stops) {
      s.body = await garment(s.name);
      s.pivot.add(s.body);
    }
  };

  /* post */
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .17, .55, 1.02);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(Finish);
  composer.addPass(finish);

  let fitD = 24, portrait = false, viewW = 20;
  const resize = () => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    portrait = w / h < 1;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    fitD = portrait
      ? (W * 1.02) / (2 * tan * camera.aspect)
      : Math.max(H / .66 / (2 * tan), (8.5 * 2.32) / (2 * tan * camera.aspect));
    ringWide.visible = !portrait;
    ringTall.visible = portrait;
    // The ends of the phrase sit nearest the lens, so perspective pushes them outward. This solves
    // for the ring size that keeps both ends on screen, with room for the ring's slow sway.
    if (!portrait) {
      const a = ringWide.userData.half, k = .86 * tan * camera.aspect;
      ringWide.scale.setScalar(Math.min(1, (k * fitD) / (R * Math.sin(a) + k * R * Math.cos(a))));
    }
    // On phones the arcs scale to the screen, so the full wordmark always fits and reads.
    if (portrait) {
      const RT = ringTall.userData.R;
      const half = (fitD - RT) * tan * camera.aspect;
      const need = Math.sin(.74) * RT;
      ringTall.scale.setScalar(clamp(half * .86 / need, .5, 1.2));
    }
    // branches enter from the top corners of whatever screen this is
    const zT = 3, hw = (fitD - zT) * tan * camera.aspect, hh = (fitD - zT) * tan;
    viewW = hw * 2;
    const sc = portrait ? .78 : clamp(hw / 9.2, .7, 1.25);
    treeL.position.set(-hw - .4, hh + .1, zT);
    treeR.position.set(hw + .4, hh + .25, zT - 1.4);
    treeL.scale.setScalar(sc); treeR.scale.setScalar(sc * .92);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  /* input */
  let px = 0, py = 0, tx = 0, ty = 0;
  if (!coarse) addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
  let drag = null, spin = 0, extra = 0, idleAt = -1e4;
  canvas.addEventListener('pointerdown', e => { drag = { last: e.clientX }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.last; drag.last = e.clientX;
    extra += dx * .0095; spin = dx * .0095;
  });
  const up = () => { drag = null; idleAt = performance.now(); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  let visible = true, last = performance.now();
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was && !calm) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(wrap);

  const introing = document.documentElement.classList.contains('intro');
  const begin = Math.max(performance.now(), introing ? 1020 : 0);
  let orbitAngle = 1, samples = 0, slow = 0, tuned = false, showTime = 0;
  const tint = new THREE.Color(0xff9fbe), tmp = new THREE.Color();

  function frame(now) {
    if (!visible && !calm) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    const e = calm ? 1 : clamp((now - begin) / 2100);
    const inn = expoOut(e);

    const hr = hero.getBoundingClientRect(), tr = turn.getBoundingClientRect();
    const span = hr.height - innerHeight;
    const p = calm || span <= 0 ? 0 : clamp(-hr.top / span);
    const pos = clamp(-tr.top / (tr.height - innerHeight)) * STOPS.length;
    const dive = smooth(.04, .9, p);
    const inGallery = p >= .985;

    px += (tx - px) * .05; py += (ty - py) * .05;

    if (!drag) {
      extra += spin; spin *= .94;
      if (now - idleAt > 1600 && Math.abs(spin) < .002) extra += (Math.round(extra / (Math.PI * 2)) * Math.PI * 2 - extra) * .035;
    }

    rig.visible = trees.visible = !inGallery;
    gallery.visible = inGallery;

    if (!inGallery) {
      // It shows its back, turns to show the front, then comes back round: both sides, little edge-on.
      if (!calm && !drag) showTime += dt * (1 - dive);
      const c = showTime % 13, turns = Math.floor(showTime / 13);
      const a = c < 7 ? 0 : c < 8.1 ? inOut((c - 7) / 1.1) : c < 11.9 ? 1 : 1 + inOut((c - 11.9) / 1.1);
      const shown = (turns * 2 + a) * Math.PI;
      const homeBack = Math.round(shown / (Math.PI * 2)) * Math.PI * 2;
      const sway = calm ? .22 : Math.sin(t * .42) * .26 * (1 - dive);
      hoodie.rotation.y = Math.PI + lerp(shown, homeBack, smooth(0, .4, dive)) + sway + extra * (1 - dive) + (1 - inn) * -Math.PI * 1.2;
      hoodie.position.y = lerp(-13, .05, inn) + Math.sin(t * .8) * .09 * (1 - dive);
      hoodie.rotation.z = Math.sin(t * .55) * .012;

      if (!calm) orbitAngle += dt * (.34 + (1 - inn) * 1.6);
      orbit.rotation.y = orbitAngle;
      // the ring swings in, then rests facing you so the words can be read
      const swing = (1 - inn) * -2.2 + Math.sin(t * .31) * .05 + px * .16;
      ringWide.rotation.y = ringTall.rotation.y = swing;
      const open = 1 + dive * 1.5;
      ringTilt.scale.set(open * lerp(1.5, 1, inn), 1 + dive * .5, open * lerp(1.5, 1, inn));
      ringTilt.rotation.x = TILT - dive * .3;
      ringTilt.position.y = (portrait ? -3.5 : DROP) - dive * 2.4;
      rig.position.y = portrait ? .85 * (1 - dive) : 0;
      orbitTilt.scale.setScalar(lerp(1.6, 1, inn) + dive * 1.2);
      rig.rotation.y = px * .16;
      rig.rotation.x = py * .08;
      treeL.rotation.z = Math.sin(t * .6) * .007;
      treeR.rotation.z = Math.sin(t * .5 + 1) * .008;
      trees.position.y = (1 - inn) * 5 + dive * 7;
      trees.position.z = dive * 5;
    } else {
      let best = 0, bestV = 9;
      stops.forEach((s, i) => {
        const local = pos - i;
        const on = !!s.body && local > -.16 && local < 1.16;
        s.pivot.visible = on;
        const dist = Math.abs(local - .5);
        if (dist < bestV) { bestV = dist; best = i; }
        if (!on) return;
        const en = i === 0 ? 1 : inOut(clamp((local + .16) / .32));
        const lv = i === STOPS.length - 1 ? 0 : inOut(clamp((local - .84) / .32));
        const turnT = inOut(clamp((local - .08) / .5));
        s.body.rotation.y = turnT * Math.PI + (1 - en) * -1.3 + lv * 1.3 + (calm ? Math.PI : 0) + extra + Math.sin(t * .5) * .05 + px * .22;
        s.body.position.set((1 - en) * viewW * .95 - lv * viewW * .95, Math.sin(t * .8 + i) * .07, 0);
        s.wordRing.rotation.y = (1 - en) * 1.7 - lv * 1.7 + px * .1;
        s.tilt.scale.setScalar(portrait ? clamp(viewW / 15.5, .5, 1) : 1);
      });
      tmp.copy(stops[best].tint);
      tint.lerp(tmp, .08);
    }
    if (!inGallery) tint.lerp(tmp.set(0xff9fbe), .08);
    halo.material.color.copy(tint);
    halo.scale.setScalar(portrait ? .72 : 1);
    rimB.color.copy(tint);

    // chrome highlights travel: the studio turns slowly around the letters
    scene.environmentRotation.y = t * .22 + px * .7;
    scene.environmentRotation.x = py * .25;
    nebula.rotation.z = t * .012;
    far.rotation.y = t * .004; near.rotation.y = -t * .009;

    // camera: pushes into the back print, then settles for the featured pieces
    const z = inGallery ? fitD * (portrait ? 1.02 : .98) : lerp(fitD, 5.6, dive);
    scene.fog.near = z + 1.5; scene.fog.far = z + 24;
    if (inGallery) {
      camera.position.set(px * .9, .3 - py * .5, z);
      camera.lookAt(0, portrait ? -.2 : -.5, 0);
    } else {
      camera.position.set(px * 1.1 * (1 - dive), lerp(.5, 1.4, dive) - py * .6 * (1 - dive), z);
      camera.lookAt(0, lerp(portrait ? -.2 : -.62, 1.15, dive), 0);
    }

    // petals: drift and tumble; on the dive they stream past the lens
    const wind = .34 + px * 1.1, rush = dive * (inGallery ? 0 : 11);
    const half = viewW * .72;
    for (let i = 0; i < N; i++) {
      const q = P[i];
      if (!calm) {
        q.y -= q.fall * dt;
        q.x += (wind + Math.sin(t * q.f + q.ph) * q.a) * dt;
        q.z += (Math.cos(t * q.f * .7 + q.ph) * .22 + rush) * dt;
        if (q.y < -11) { q.y = 11.5; q.x = (pr() - .5) * half * 2; }
        if (q.x > half) q.x = -half; else if (q.x < -half) q.x = half;
        if (q.z > z - 1.2) q.z = -11;
      }
      px0.position.set(q.x, q.y, q.z);
      px0.rotation.set(q.rx + t * q.sx, q.ry + t * q.sy, q.ph);
      px0.scale.setScalar(q.s);
      px0.updateMatrix();
      petals.setMatrixAt(i, px0.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
    petals.count = inGallery ? Math.round(N * .4) : N;

    fadeEl.style.opacity = smooth(.74, .97, p) * (1 - smooth(.02, .14, pos));
    foot.style.opacity = 1 - smooth(.02, .16, p);
    foot.style.pointerEvents = p > .1 ? 'none' : '';

    finish.uniforms.t.value = t % 10;
    composer.render(dt);

    // keep it smooth on weak GPUs: one step down, once
    if (!tuned && e >= 1) {
      samples++; if (dt > .03) slow++;
      if (samples === 90) {
        tuned = true;
        if (slow > 40) { dpr = 1; bloom.enabled = false; resize(); }
      }
    }
    if (!calm) requestAnimationFrame(frame);
  }

  // Screen position of the ends of the phrase, for the test suite.
  window.TO_ringReach = () => {
    const live = portrait ? ringTall : ringWide;
    const box = new THREE.Box3();
    live.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    let left = 1e9, right = -1e9;
    live.traverse(o => {
      if (!o.isMesh || !o.geometry.boundingBox && !o.geometry.computeBoundingBox) return;
      if (o.geometry.type === 'TorusGeometry') return;
      o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
        if (z < 0) continue;                       // the rear arc is allowed to sit behind things
        v.set(x, (box.min.y + box.max.y) / 2, z).project(camera);
        const px = (v.x * .5 + .5) * wrap.clientWidth;
        left = Math.min(left, px); right = Math.max(right, px);
      }
    });
    return { left: Math.round(left), right: Math.round(right), w: wrap.clientWidth };
  };

  // Compile everything before showing it, so the first visible frame does not hitch.
  renderer.compile(scene, camera);
  composer.render(0);
  requestAnimationFrame(n => {
    last = n; frame(n);
    canvas.classList.add('on');
    document.documentElement.dataset.hero = 'ready';
    loadStops().then(() => {
      document.documentElement.dataset.stops = 'ready';
      if (calm) requestAnimationFrame(frame);
    }).catch(err => console.warn('featured pieces', err));
  });
  if (calm) {
    addEventListener('resize', () => requestAnimationFrame(frame));
    addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true });
  }
}

start().catch(fail);
