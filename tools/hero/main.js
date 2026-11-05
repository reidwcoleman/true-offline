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
import { garmentGeometry } from './garment.js';
import GL from './glyphs.json';
import SIZE from './size.json';

const INK = 0x050508, COBALT = 0x0a35f0, VIOLET = 0x3a22a8, SAKURA = 0xff6f9f;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const expoOut = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const inOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const silk = t => t * t * t * (t * (t * 6 - 15) + 10);          // starts and stops with no jolt
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);             // the same feel at 60 or 120 Hz
const rng = seed => () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const STAR = [[135, 0], [137, 74], [332, 60], [147, 114], [150, 195], [87, 147], [17, 199], [57, 127], [0, 82], [90, 78]];
const coarse = matchMedia('(pointer:coarse)').matches;
const VER = document.documentElement.dataset.v || '1';
// Phones and tablets get their own path: direct rendering, lighter assets, fewer of everything.
const LITE = coarse;
const SMALL = LITE ? '-m' : '';
const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || /iP(hone|ad|od)/.test(navigator.userAgent);
const breathe = () => new Promise(r => setTimeout(r));            // lets the page paint and respond between steps

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
    depth: .15 * k / s, curveSegments: LITE ? 6 : 14, bevelEnabled: true, bevelThickness: .04 * k / s, bevelSize: .03 * k / s, bevelSegments: LITE ? 2 : 4,
  });
  g.scale(s, s, s);
  g.translate(-GL.glyphs[ch].adv * s / 2, 0, 0);
  pillow(g, .3);
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
   way with the curve (lean). Each letter keeps its rest pose so it can react to the pointer. */
function arc(text, { R, cap, y = 0, lean = .55, mat, flat = 1 }) {
  const g = new THREE.Group();
  const s = cap / GL.cap, gap = .17 * cap, space = .62 * cap;
  const items = [];
  let run = 0;
  for (const ch of text) {
    if (ch === ' ') { run += space; continue; }
    const w = GL.glyphs[ch].adv * s;
    items.push({ ch, at: run + w / 2 });
    run += w + gap;
  }
  run -= gap;
  // Spaced evenly across the screen, then wrapped onto the ring, so the ends never crowd together.
  for (const it of items) {
    const a = Math.asin(clamp((it.at - run / 2) / R, -1, 1));
    const m = new THREE.Mesh(glyph(it.ch, cap), mat);
    m.position.set(Math.sin(a) * R, y, Math.cos(a) * R * flat);
    m.rotation.y = a * lean;
    m.userData.letter = { x: m.position.x, y, z: m.position.z, ry: a * lean, a, lift: 0, v: 0, flip: 0, flipTo: 0, sx: 0, sy: 0 };
    g.add(m);
  }
  g.userData.half = Math.asin(clamp(run / 2 / R, 0, 1));   // half the arc, in radians
  return g;
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
  const foot = document.querySelector('[data-hero-foot]');
  const turnPin = document.querySelector('.turn-pin');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: LITE, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const TIERS = LITE ? [1.75, 1.4, 1.1] : [2, 1.25];              // stepped down only if frames run long
  let tier = LITE && (navigator.deviceMemory || 4) < 4 ? 1 : 0;
  let dpr = Math.min(devicePixelRatio || 1, TIERS[tier]);
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.fog = new THREE.Fog(INK, 20, 40);
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 400);

  // Decoded off the main thread where that is safe, so loading a piece never drops a frame. Safari
  // cannot be trusted to honour the flip option, so it takes the ordinary path.
  const bitmaps = safari ? null : new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' });
  const plain = new THREE.TextureLoader();
  const finish3 = (t, srgb) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(LITE ? 4 : 16, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const load = (u, srgb) => new Promise((res, rej) => {
    if (!bitmaps) { plain.load(u, t => res(finish3(t, srgb)), undefined, rej); return; }
    bitmaps.load(u, img => {
      const t = new THREE.Texture(img);
      t.flipY = false;
      t.needsUpdate = true;
      res(finish3(t, srgb));
    }, undefined, rej);
  });

  /* Each garment is one closed mesh with the two photos on it. Loaded once, then shared by the hero
     and the featured stops. */
  const H = 7.4;
  const rimShared = { rimColor: { value: new THREE.Color(0xff9fbe) } };
  const cloth = (map, normalMap) => {
    const m = new THREE.MeshPhysicalMaterial({
      map, normalMap, normalScale: new THREE.Vector2(.8, .8),
      roughness: .9, metalness: 0, envMapIntensity: .3,
      sheen: .22, sheenRoughness: .6, sheenColor: new THREE.Color(0x6e7082),
      emissive: 0xffffff, emissiveIntensity: .1,
    });
    // Three tweaks to the stock shader: textures are read a little finer than the mip level asks for,
    // which is what keeps a print sharp; a share of the photo's own colour comes through untouched by
    // the coloured lights; and the tint sits only on the very edge, like light wrapping round cloth.
    m.onBeforeCompile = sh => {
      sh.uniforms.rimColor = rimShared.rimColor;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
        .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D( map, vMapUv, -1.1 );\ndiffuseColor *= sampledDiffuseColor;')
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'texture2D( normalMap, vNormalMapUv, -.6 )'))
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= sampledDiffuseColor.rgb;')
        .replace('#include <opaque_fragment>', 'float edge = pow( 1. - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) ), 3.4 );\noutgoingLight += rimColor * edge * .42;\n#include <opaque_fragment>');
    };
    return m;
  };
  const parts = new Map();
  const loadParts = name => {
    if (parts.has(name)) return parts.get(name);
    const b = `img/hero/${name}`;
    const job = Promise.all([
      fetch(`${b}${SMALL}.bin?v=${VER}`).then(r => { if (!r.ok) throw new Error(b); return r.arrayBuffer(); }),
      load(`${b}-front${SMALL}.webp?v=${VER}`, true), load(`${b}-front-n${SMALL}.webp?v=${VER}`),
      load(`${b}-back${SMALL}.webp?v=${VER}`, true), load(`${b}-back-n${SMALL}.webp?v=${VER}`),
    ]).then(([buf, fc, fn, bc, bn]) => {
      const { body, cap, W } = garmentGeometry(buf, H, SIZE[name]);
      const mats = [cloth(fc, fn), cloth(bc, bn)];
      // Pale garments would burn out under lights set for black fleece, so they take less of it.
      const hex = parseInt(SIZE[name].inner.slice(1), 16);
      const pale = ((hex >> 16) + (hex >> 8 & 255) + (hex & 255)) / 3 / 255 / .34;
      const gain = clamp(1 - (pale - .45) * 1.25, .5, 1);
      mats.forEach(m => { m.color.setScalar(gain); m.sheenColor.multiplyScalar(gain); m.emissiveIntensity *= gain; });
      return { body, cap, W, mats, inside: new THREE.MeshStandardMaterial({ color: SIZE[name].inner, roughness: 1, envMapIntensity: .1 }) };
    });
    parts.set(name, job);
    return job;
  };
  async function garment(name) {
    const { body, cap, W, mats, inside } = await loadParts(name);
    const g = new THREE.Group();
    const shell = new THREE.Mesh(body, mats);
    shell.castShadow = shell.receiveShadow = true;
    g.add(shell, new THREE.Mesh(cap, inside));
    g.userData.w = W;
    return g;
  }

  // The first hoodie downloads while everything else below is being built.
  const firstLoad = garment('blossom');
  await breathe();
  scene.environment = studio(renderer);
  await breathe();
  const hoodie = new THREE.Group();              // holds whichever piece is on show
  const W = H * SIZE.blossom.w / SIZE.blossom.h;
  const rig = new THREE.Group();                 // everything that leans with the pointer
  rig.add(hoodie);
  scene.add(rig);

  /* chrome wordmark ring */
  // Letter faces stay bright and the walls stay dark, so the name reads at a glance over any garment.
  const chrome = [
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .78, roughness: .17, emissive: 0xd4d7f4, emissiveIntensity: .5 }),
    new THREE.MeshStandardMaterial({ color: 0x4a4f86, metalness: 1, roughness: .28 }),
  ];
  const chromeLine = new THREE.MeshStandardMaterial({ color: 0xf4f5fb, metalness: 1, roughness: .08 });
  const FLAT = .55;
  const R = 9.1;
  const band = (radius, y) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(radius, .03, 10, 240), chromeLine);
    t.rotation.x = Math.PI / 2; t.position.y = y;
    t.scale.y = FLAT;                              // torus lies in its own xy plane, so y is depth here
    return t;
  };
  const ringWide = new THREE.Group();
  {
    const cap = 1.02;
    const word = arc('TRUE OFFLINE', { R, cap, mat: chrome, lean: .1, flat: FLAT });
    ringWide.add(word, band(R, -.17));
    ringWide.userData.half = word.userData.half + .27;
    const sideStar = starGeometry(1.15, .14);
    [-1, 1].forEach(s => {
      const a = s * (word.userData.half + .27);
      const m = new THREE.Mesh(sideStar, chrome);
      m.position.set(Math.sin(a) * R, cap * .42, Math.cos(a) * R * FLAT);
      m.rotation.y = a * .2;
      ringWide.add(m);
    });
  }
  const ringTall = new THREE.Group();            // phones: the wordmark stacks on two arcs
  {
    const RT = 6.4;
    ringTall.add(arc('TRUE', { R: RT, cap: 1.06, y: 1.28, mat: chrome, lean: .12, flat: FLAT }));
    ringTall.add(arc('OFFLINE', { R: RT, cap: 1.06, mat: chrome, lean: .12, flat: FLAT }));
    ringTall.add(band(RT, -.17));
    ringTall.userData.R = RT;
  }
  const ringTilt = new THREE.Group();
  ringTilt.add(ringWide, ringTall);
  const TILT = .085, DROP = -2.05;
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
  const orbitStar = starGeometry(1.5, .2);
  [
    [chromeLine, 0, 1],
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
  await breathe();
  const treeL = tree(11, 1, 4.9, LITE ? 2 : 3);
  await breathe();
  const treeR = tree(29, -1, 4.2, LITE ? 2 : 3);
  await breathe();
  const trees = new THREE.Group();
  trees.add(treeL, treeR);
  scene.add(trees);

  /* falling petals */
  const N = LITE ? 110 : 300;
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
    P.push({ x: (pr() - .5) * 30, y: (pr() - .5) * 22, z: lerp(-11, 13, pr()), fall: .55 + pr() * .75, ph: pr() * 6.28, f: .5 + pr() * .9, a: .4 + pr() * .9, rx: pr() * 6.28, ry: pr() * 6.28, sx: (pr() - .5) * 2.2, sy: (pr() - .5) * 2.6, s: .7 + pr() * .9, vx: 0, vy: 0, vz: 0 });
    petals.setColorAt(i, pcol.setHSL(.955, .5 + pr() * .4, .82 + pr() * .14));
  }

  /* light on the fabric */
  const key = new THREE.DirectionalLight(0xfff6ee, 2.9); key.position.set(-5, 9, 13); scene.add(key);
  key.castShadow = !coarse;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 4, far: 34 });
  key.shadow.radius = 7;
  key.shadow.bias = -.0006;
  key.shadow.normalBias = .05;
  const fill = new THREE.DirectionalLight(0xdfe4ff, .9); fill.position.set(8, 2, 10); scene.add(fill);
  const backFill = new THREE.DirectionalLight(0xfff0f4, 2.1); backFill.position.set(4, 6, -12); scene.add(backFill);
  const rimA = new THREE.DirectionalLight(0x3a62ff, .5); rimA.position.set(14, 1, -1); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(SAKURA, .4); rimB.position.set(-14, 4, -1); scene.add(rimB);
  scene.add(new THREE.AmbientLight(0xc4bdc9, .55));

  /* space */
  const nebula = glow([[0, 'rgba(64,30,130,.2)'], [.4, 'rgba(34,20,90,.09)'], [1, 'rgba(0,0,0,0)']], 60, [3, 2, -18]);
  const nebula2 = glow([[0, 'rgba(10,53,240,.12)'], [.5, 'rgba(10,40,160,.04)'], [1, 'rgba(0,0,0,0)']], 44, [-16, -7, -24]);
  const halo = glow([[0, 'rgba(255,255,255,.34)'], [.45, 'rgba(255,255,255,.1)'], [1, 'rgba(0,0,0,0)']], 18, [0, .5, -4.2]);
  halo.material.color.set(0xff9fbe);
  halo.material.opacity = .78;
  scene.add(nebula, nebula2, halo);
  const far = starfield(LITE ? 500 : 1500, 70, 150, 1.1, .6);
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
    wordRing.add(arc(word, { R: 8, cap: 1.04, mat: chrome, lean: .1, flat: FLAT }));
    const tilt = new THREE.Group();
    tilt.rotation.set(TILT, 0, 0); tilt.position.y = -3.75;
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

  /* The five pieces you can put on the hero. Spinning it round swaps the garment at the far side. */
  const PIECES = [['blossom', 0xff9fbe], ['pagoda', 0xff5f96], ['globe', 0xd8467e], ['rooster', 0xff6a2a], ['dreamer', 0xe9d3b0]];
  const firstPiece = await firstLoad;
  hoodie.add(firstPiece);
  await breathe();
  const heroModels = new Map([['blossom', firstPiece]]);
  const heroTint = new THREE.Color(0xff9fbe);
  let swap = null, shownPiece = 0, wantPiece = 0;
  async function pick(i) {
    wantPiece = i;
    const [name, col] = PIECES[i];
    wantStops();
    if (!heroModels.has(name)) heroModels.set(name, await garment(name));
    if (wantPiece !== i || i === shownPiece) return;
    heroTint.set(col);
    if (calm) {
      hoodie.clear(); hoodie.add(heroModels.get(name)); shownPiece = i;
      requestAnimationFrame(frame);
      return;
    }
    swap = { t: 0, i, done: false };
  }

  /* letters that answer the pointer */
  const lettersOf = g => { const l = []; g.traverse(o => { if (o.userData.letter) l.push(o); }); return l; };
  const heroLettersWide = lettersOf(ringWide), heroLettersTall = lettersOf(ringTall);
  stops.forEach(s => { s.letters = lettersOf(s.wordRing); });
  const lp = new THREE.Vector3();
  function reactLetters(list, dt, w, h, exit = 0, rise = 1) {
    const reach = Math.max(120, w * .1), n = list.length;
    let edge = .001;
    for (const m of list) edge = Math.max(edge, Math.abs(m.userData.letter.a));
    list.forEach((m, i) => {
      const L = m.userData.letter;
      // from the middle outward, the letters slip away in one wave
      const rank = Math.abs(L.a) / edge;
      const away = silk(clamp((exit * 2.6 - rank * .6) / .9));
      const up = silk(clamp(rise * 1.6 - (i / n) * .6));
      m.visible = away < .995 && up > .004;
      if (!m.visible) return;
      if (away > 0 || up < 1) {
        m.position.set(L.x, L.y - away * 7 - (1 - up) * 3.4, L.z);
        m.rotation.set(0, L.ry, 0);
        m.scale.setScalar(1);
        return;
      }
      lp.setFromMatrixPosition(m.matrixWorld).project(camera);
      L.sx = (lp.x * .5 + .5) * w; L.sy = (-lp.y * .5 + .5) * h;
      const dx = L.sx - mx, dy = L.sy - my;
      const k = pointerOn ? Math.exp(-(dx * dx + dy * dy) / (reach * reach)) : 0;
      L.v += ((k - L.lift) * 130 - L.v * 13) * dt;
      L.lift += L.v * dt;
      L.flip += (L.flipTo - L.flip) * Math.min(1, dt * 5.5);
      const out = L.lift * .75;
      m.position.set(L.x + Math.sin(L.a) * out, L.y + L.lift * .16, L.z + Math.cos(L.a) * out);
      m.rotation.set(clamp(dy / reach, -1, 1) * -.5 * L.lift, L.ry + clamp(dx / reach, -1, 1) * .7 * L.lift + L.flip, 0);
      m.scale.setScalar(1 + L.lift * .12);
    });
  }
  const liveLetters = () => (portrait ? heroLettersTall : heroLettersWide);

  /* post */
  // Phones draw straight to the screen: the extra passes cost more than they show at that size,
  // and the vignette comes free from CSS.
  let composer = null, bloom = null, finish = null;
  if (!LITE) {
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .15, .55, 1.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  finish = new ShaderPass(Finish);
  composer.addPass(finish);
  }
  const draw = dt => (composer ? composer.render(dt) : renderer.render(scene, camera));

  /* The other hoodies load on desktop straight away; on a phone, only once you start moving toward them. */
  let stopsWanted = false;
  function wantStops() {
    if (stopsWanted) return;
    stopsWanted = true;
    loadStops().then(async () => {
      // Hand the textures to the GPU one per frame now, so scrolling or picking never pays for it later.
      for (const job of parts.values()) {
        const { mats } = await job;
        for (const m of mats) for (const t of [m.map, m.normalMap]) {
          renderer.initTexture(t);
          await new Promise(r => requestAnimationFrame(r));
        }
      }
      document.documentElement.dataset.stops = 'ready';
      if (calm) requestAnimationFrame(frame);
    }).catch(err => console.warn('featured pieces', err));
  }

  let fitD = 24, portrait = false, viewW = 20;
  let sizedW = 0, sizedH = 0, sizedD = 0;
  const resize = () => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    // iOS fires resize as the address bar slides; reallocating the canvas then would stutter.
    if (w === sizedW && h === sizedH && dpr === sizedD) return;
    sizedW = w; sizedH = h; sizedD = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); }
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
      ringWide.scale.setScalar(Math.min(1.06, (k * fitD) / (R * Math.sin(a) + k * R * FLAT * Math.cos(a))));
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
    // Blossom frames the shot: on tablets the hood sits near the top, so the branches shrink to clear it.
    const headroom = hh - (H / 2 + .85);
    const sc = portrait ? clamp(headroom / 3.4, .34, .78) : clamp(hw / 9.2, .7, 1.25);
    treeL.position.set(-hw - .4, hh + .1, zT);
    treeR.position.set(hw + .4, hh + .25, zT - 1.4);
    treeL.userData.x = treeL.position.x; treeR.userData.x = treeR.position.x;
    treeL.scale.setScalar(sc); treeR.scale.setScalar(sc * .92);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  /* input */
  let px = 0, py = 0, tx = 0, ty = 0;
  let mx = -9999, my = -9999, lastMx = 0, lastMy = 0, pointerOn = false, wvx = 0, wvy = 0, gust = 0;
  const rayDir = new THREE.Vector3();
  const aim = (cx, cy) => {
    rayDir.set(cx / wrap.clientWidth * 2 - 1, 1 - cy / wrap.clientHeight * 2, .5).unproject(camera).sub(camera.position).normalize();
  };
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5;
    mx = e.clientX; my = e.clientY; pointerOn = true;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointerOn = false; tx = ty = 0; });

  let drag = null, spin = 0, extra = 0, tiltX = 0, idleAt = -1e4;
  canvas.addEventListener('pointerdown', e => {
    const touch = e.pointerType === 'touch';
    drag = { last: e.clientX, lastY: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), far: false, touch, live: !touch };
    if (touch) return;                           // the page keeps the finger until it proves it means to spin
    mx = e.clientX; my = e.clientY; pointerOn = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.live) {
      const ax = Math.abs(e.clientX - drag.x), ay = Math.abs(e.clientY - drag.y);
      if (ax + ay < 10) return;
      if (ax < ay * 1.4) { drag = null; return; }
      drag.live = true; drag.last = e.clientX; drag.lastY = e.clientY;
    }
    const dx = e.clientX - drag.last, dy = e.clientY - drag.lastY;
    drag.last = e.clientX; drag.lastY = e.clientY;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) drag.far = true;
    const k = drag.touch ? .012 : .0095;
    extra += dx * k; spin = dx * k;
    if (!drag.touch) tiltX = clamp(tiltX + dy * .0045, -.55, .55);
  });
  const up = e => {
    const tap = drag && !drag.touch && !drag.far && performance.now() - drag.t < 400;
    drag = null; idleAt = performance.now();
    if (tap && e.type === 'pointerup') tapAt(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  /* A tap flips the nearest letter, or throws a handful of petals from wherever you touched. */
  let nextPetal = 0, flips = 0, bursts = 0;
  function tapAt(cx, cy) {
    if (calm) return;
    const list = inGalleryNow ? stops.flatMap(s => (s.pivot.visible ? s.letters : [])) : liveLetters();
    let best = null, bd = Math.max(46, wrap.clientWidth * .035);
    for (const m of list) {
      const L = m.userData.letter, d = Math.hypot(L.sx - cx, L.sy - cy);
      if (d < bd) { bd = d; best = L; }
    }
    if (best) { best.flipTo += Math.PI * 2; flips++; return; }
    bursts++;
    aim(cx, cy);
    const k = (5 - camera.position.z) / rayDir.z;
    const ox = camera.position.x + rayDir.x * k, oy = camera.position.y + rayDir.y * k;
    const live = petals.count;
    for (let i = 0; i < 54; i++) {
      const q = P[nextPetal = (nextPetal + 1) % live];
      const a = pr() * 6.283, v = 2.5 + pr() * 7.5;
      q.x = ox; q.y = oy; q.z = 5 + (pr() - .5) * 1.5;
      q.vx = Math.cos(a) * v; q.vy = Math.sin(a) * v + 1.8; q.vz = (pr() - .5) * 5;
    }
  }

  let visible = true, last = performance.now();
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was && !calm) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(wrap);

  const introing = document.documentElement.classList.contains('intro');
  const begin = Math.max(performance.now(), introing ? 1020 : 0);
  // Phones open on the finished shot (the poster), so the live scene takes over with nothing to wait for.
  const settled = calm || LITE;
  let N_live = N, orbitAngle = 1, samples = 0, slow = 0, tuned = false, showTime = 0, inGalleryNow = false, sp = 0, sPos = 0;
  const tint = new THREE.Color(0xff9fbe), tmp = new THREE.Color();

  // Only touch the page when a value really changes, so a frame costs the browser nothing it can avoid.
  const wrote = new Map();
  const set = (el, k, v) => {
    const key2 = k + (el === foot ? 1 : 2);
    if (wrote.get(key2) === v) return;
    wrote.set(key2, v);
    el.style[k] = v;
  };

  function frame(now) {
    if (!visible && !calm) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    const e = settled ? 1 : clamp((now - begin) / 2100);
    const inn = expoOut(e);

    const hr = hero.getBoundingClientRect(), tr = turn.getBoundingClientRect();
    // Never innerHeight here: on phones it changes as the address bar slides, which would jolt the
    // whole timeline just as you stop scrolling. The stage height never changes.
    const stageH = wrap.clientHeight;
    const span = hr.height - stageH;
    // Scroll is eased here too, so a notched wheel or a jump still glides through the 3D.
    const rawP = calm || span <= 0 ? 0 : clamp(-hr.top / span);
    if (rawP > .02) wantStops();
    const rawPos = clamp(-tr.top / (tr.height - stageH)) * STOPS.length;
    sp += (rawP - sp) * (calm ? 1 : damp(11, dt)); sPos += (rawPos - sPos) * (calm ? 1 : damp(11, dt));
    if (Math.abs(rawP - sp) < .0004) sp = rawP;
    if (Math.abs(rawPos - sPos) < .0006) sPos = rawPos;
    const p = sp, pos = sPos;
    // Beat one turns the hoodie, beat two rests on the back, beat three hands over to the showcases.
    // The camera never gets closer than the photos stay sharp, and there is no cut: one continuous move.
    const dive = silk(clamp((p - .015) / .6));
    const out = calm ? (rawPos > 0 ? 1 : 0) : silk(clamp((p - .78) / .22));
    const inGallery = out > 0;

    px += (tx - px) * damp(5, dt); py += (ty - py) * damp(5, dt);
    inGalleryNow = inGallery;

    // how fast the pointer is moving through the scene, in world units a second
    const pw = wrap.clientWidth, ph = wrap.clientHeight;
    const unit = viewW / pw;
    if (dt > 0) {
      wvx += (clamp((mx - lastMx) / dt * unit, -40, 40) - wvx) * .2;
      wvy += (clamp(-(my - lastMy) / dt * unit, -40, 40) - wvy) * .2;
    }
    lastMx = mx; lastMy = my;
    gust += (Math.min(1, Math.abs(wvx) / 26) - gust) * .06;

    if (!drag) {
      extra += spin * dt * 60; spin *= Math.exp(-dt * 3.4);
      tiltX *= Math.exp(-dt * 3);
      if (now - idleAt > 1600 && Math.abs(spin) < .002) extra += (Math.round(extra / (Math.PI * 2)) * Math.PI * 2 - extra) * damp(1.8, dt);
    }

    // swapping the piece: one fast turn, changing garment at the far side
    let swapSpin = 0, swapScale = 1;
    if (swap) {
      swap.t = Math.min(1, swap.t + dt / 1.3);
      swapSpin = silk(swap.t) * Math.PI * 2;
      swapScale = 1 - Math.sin(Math.PI * swap.t) * .14;
      if (!swap.done && swap.t >= .5) {
        swap.done = true;
        hoodie.clear(); hoodie.add(heroModels.get(PIECES[swap.i][0]));
        shownPiece = swap.i;
      }
      if (swap.t >= 1) { swap = null; swapSpin = 0; }
    }

    rig.visible = out < 1;
    trees.visible = dive < 1;
    gallery.visible = inGallery;

    if (out < 1) {
      // It shows its back, turns to show the front, then comes back round: both sides, little edge-on.
      // The automatic turn stops the moment scrolling starts, so the landing point can never shift.
      if (!calm && !drag && p < .001) showTime += dt;
      const c = showTime % 14, turns = Math.floor(showTime / 14);
      const a = c < 6.2 ? 0 : c < 8 ? silk((c - 6.2) / 1.8) : c < 12.2 ? 1 : 1 + silk((c - 12.2) / 1.8);
      const shown = (turns * 2 + a) * Math.PI;
      const homeBack = Math.round(shown / (Math.PI * 2)) * Math.PI * 2;
      const lean = 1 - smooth(0, .3, dive);
      const sway = calm ? .22 : Math.sin(t * .42) * .26 * lean;
      // Scrolling winds it through a full turn that lands square on the back print.
      const leave = -out * 1.3;                    // the hero leaves on the same carousel the others ride
      hoodie.rotation.y = Math.PI + lerp(shown, homeBack + Math.PI * 2, dive) + sway + extra * lean + (1 - inn) * -Math.PI * 1.2 + px * .55 * lean + swapSpin + leave * 1.15;
      hoodie.rotation.x = (py * .2 + tiltX) * lean;
      hoodie.position.x = px * .4 * lean + Math.sin(leave) * viewW * .82;
      hoodie.position.z = (Math.cos(leave) - 1) * 15;
      hoodie.position.y = lerp(-13, .05, inn) + Math.sin(t * .8) * .09 * lean - py * .2 * lean;
      hoodie.rotation.z = Math.sin(t * .55) * .012 - px * .03 * lean;
      hoodie.scale.setScalar(swapScale);

      if (!calm) orbitAngle += dt * (.34 + (1 - inn) * 1.6 + dive * .9);
      orbit.rotation.y = orbitAngle;
      // the ring swings in, then rests facing you so the words can be read
      const swing = (1 - inn) * -2.2 + Math.sin(t * .31) * .05 + px * .16;
      ringWide.rotation.y = ringTall.rotation.y = swing;
      ringTilt.visible = dive < .95;
      ringTilt.scale.set(lerp(1.5, 1, inn), 1, lerp(1.5, 1, inn));
      ringTilt.rotation.x = TILT;
      ringTilt.position.y = (portrait ? -3.5 : DROP) - silk(clamp(dive / .6)) * 9;
      rig.position.y = portrait ? .85 * (1 - dive) : 0;
      orbitTilt.scale.setScalar(lerp(1.6, 1, inn) + dive * .7);
      rig.rotation.y = px * .16;
      rig.rotation.x = py * .08;
      treeL.rotation.z = Math.sin(t * .6) * .007 + Math.sin(t * 7) * gust * .018;
      treeR.rotation.z = Math.sin(t * .5 + 1) * .008 + Math.sin(t * 6.3 + 1) * gust * .02;
      // the branches part like curtains
      const part = silk(clamp(dive / .6));
      trees.position.y = (1 - inn) * 5 + part * 4;
      treeL.position.x = treeL.userData.x - part * 7;
      treeR.position.x = treeR.userData.x + part * 7;
    }
    if (inGallery) {
      let best = 0, bestV = 9;
      stops.forEach((s, i) => {
        const local = pos - i;
        const on = !!s.body && local > -.16 && local < 1.16;
        s.pivot.visible = on;
        const dist = Math.abs(local - .5);
        if (dist < bestV) { bestV = dist; best = i; }
        if (!on) return;
        const en = i === 0 ? out : silk(clamp((local + .16) / .32));
        const lv = i === STOPS.length - 1 ? 0 : silk(clamp((local - .84) / .32));
        const turnT = silk(clamp((local - .06) / .46));
        // Pieces ride a wide carousel: in from one side, round and away out of the other.
        const th = (1 - en) * 1.3 - lv * 1.3;
        s.body.rotation.y = turnT * Math.PI + th * 1.15 + (calm ? Math.PI : 0) + extra + Math.sin(t * .5) * .05 + px * .5;
        s.body.rotation.x = py * .18 + tiltX;
        s.body.position.set(Math.sin(th) * viewW * .82, .42 + Math.sin(t * .8 + i) * .06, (Math.cos(th) - 1) * 15);
        s.rise = en * (1 - lv);
        s.tilt.scale.setScalar(portrait ? clamp(viewW / 15.5, .5, 1) : 1);
      });
      tmp.copy(stops[best].tint);
      tint.lerp(tmp, damp(4, dt));
    }
    if (!inGallery) tint.lerp(heroTint, damp(4, dt));
    halo.material.color.copy(tint);
    halo.scale.setScalar((portrait ? .72 : 1) * (1 + dive * .35 * (1 - out)));
    rimB.color.copy(tint);
    rimShared.rimColor.value.copy(tint);

    // chrome highlights travel: the studio turns slowly around the letters
    scene.environmentRotation.y = t * .22 + px * .7;
    scene.environmentRotation.x = py * .25;
    nebula.rotation.z = t * .012;
    far.rotation.y = t * .004; near.rotation.y = -t * .009;

    // Camera: a slow arc round the turning hoodie, easing in only as far as the print stays crisp,
    // then back out to the showcase framing. Everything is one blend, so nothing can jump.
    const zHero = fitD * Math.pow(portrait ? .8 : .74, dive);
    const z = lerp(zHero, fitD * (portrait ? 1.02 : .98), out);
    scene.fog.near = z + 1.5; scene.fog.far = z + 24;
    {
      const arc = Math.sin(Math.PI * dive) * .24, still = 1 - dive;
      const roll = Math.sin(Math.PI * dive) * .03 * (1 - out);
      camera.up.set(Math.sin(roll), Math.cos(roll), 0);
      camera.position.set(
        lerp(Math.sin(arc) * z + px * 1.1 * still, px * .9, out),
        lerp(lerp(.5, .2, dive) - py * .6 * still, .3 - py * .5, out),
        lerp(Math.cos(arc) * z, z, out),
      );
      const lookHero = lerp(portrait ? -.2 : -.62, .1, dive);
      camera.lookAt(0, lerp(lookHero, portrait ? -.2 : -.5, out), 0);
    }

    camera.updateMatrixWorld();
    if (!calm) {
      if (inGallery) { for (const s of stops) if (s.pivot.visible) reactLetters(s.letters, dt, pw, ph, 0, s.rise); }
      if (dive < .95) reactLetters(liveLetters(), dt, pw, ph, portrait ? 0 : dive);   // stacked lines leave as one block
    }

    // petals: drift and tumble, swerve round the pointer, and on the dive stream past the lens
    const wind = .34 + px * 1.1, rush = dive * (1 - out) * 2.5;
    const half = viewW * .72;
    if (pointerOn) aim(mx, my);
    const fade = Math.exp(-dt * 1.9), PUSH = 2.5;
    const whirl = dive * (1 - out) * .5 * dt;        // the petals turn gently with the hoodie
    for (let i = 0; i < N_live; i++) {
      const q = P[i];
      if (!calm) {
        if (pointerOn) {
          const k = (q.z - camera.position.z) / rayDir.z;
          const dx = q.x - (camera.position.x + rayDir.x * k), dy = q.y - (camera.position.y + rayDir.y * k);
          const d2 = dx * dx + dy * dy;
          if (d2 < PUSH * PUSH) {
            const d = Math.sqrt(d2) + .001, f = (1 - d / PUSH) * (1 - d / PUSH);
            q.vx += (dx / d * 30 + wvx * 2.2) * f * dt;
            q.vy += (dy / d * 30 + wvy * 2.2) * f * dt;
          }
        }
        q.vx *= fade; q.vy *= fade; q.vz *= fade;
        q.y += (q.vy - q.fall) * dt;
        q.x += (wind + q.vx + Math.sin(t * q.f + q.ph) * q.a) * dt;
        q.z += (Math.cos(t * q.f * .7 + q.ph) * .22 + rush + q.vz) * dt;
        if (whirl) { const ox = q.x, oy = q.y - .5; q.x -= oy * whirl; q.y += ox * whirl; }
        if (q.y < -11) { q.y = 11.5; q.x = (pr() - .5) * half * 2; q.vx = q.vy = 0; }
        else if (q.y > 13) q.y = -10.5;
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
    petals.count = Math.round(N_live * lerp(1, .4, out));

    set(foot, 'opacity', (1 - smooth(.01, .1, p)).toFixed(3));
    set(foot, 'visibility', p > .1 ? 'hidden' : 'visible');
    const overlay = calm ? 1 : smooth(.955, 1, p);   // only once its section has stopped moving
    set(turnPin, 'opacity', overlay.toFixed(3));
    set(turnPin, 'visibility', overlay > 0 ? 'visible' : 'hidden');

    if (finish) finish.uniforms.t.value = t % 10;
    draw(dt);

    // keep it smooth on weak GPUs: one step down, once
    if (!tuned && e >= 1 && now - begin > 900) {
      samples++; if (dt > .024) slow++;
      if (samples === 60) {
        if (slow > 24) {
          tier++;
          dpr = Math.min(devicePixelRatio || 1, TIERS[Math.min(tier, TIERS.length - 1)]);
          key.castShadow = false;
          if (bloom) bloom.enabled = false;
          if (tier >= 2) { N_live = Math.round(N * .55); }
          resize();
        }
        if (tier >= TIERS.length) tuned = true;
        samples = slow = 0;
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
        v.set(x, (box.min.y + box.max.y) / 2, z).project(camera);
        const px = (v.x * .5 + .5) * wrap.clientWidth;
        left = Math.min(left, px); right = Math.max(right, px);
      }
    });
    return { left: Math.round(left), right: Math.round(right), w: wrap.clientWidth };
  };

  // The page drives the piece picker through this.
  window.TO_hero = { pick, state: () => ({ piece: PIECES[shownPiece][0], flips, bursts, spun: Math.abs(extra) + Math.abs(spin), p: sp, pos: sPos }) };

  // Compile everything before showing it, so the first visible frame does not hitch.
  await renderer.compileAsync(scene, camera);
  await breathe();
  draw(0);
  requestAnimationFrame(n => {
    last = n; frame(n);
    canvas.classList.add('on');
    document.documentElement.dataset.hero = 'ready';
    if (!LITE) wantStops(); else setTimeout(wantStops, 4000);
  });
  if (calm) {
    addEventListener('resize', () => requestAnimationFrame(frame));
    addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true });
  }
}

if (document.documentElement.classList.contains('gl')) start().catch(fail);
