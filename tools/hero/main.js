// The first screen: a 3D hoodie in orbit inside a chrome ring of the wordmark, after the globe
// and ring in the brand's own logo. Bundled to site/hero.js by tools/hero/build.sh.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import G from './glyphs.json';
import SIZE from './size.json';

const INK = 0x050508, COBALT = 0x0a35f0, VIOLET = 0x3a22a8;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const expoOut = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const STAR = [[135, 0], [137, 74], [332, 60], [147, 114], [150, 195], [87, 147], [17, 199], [57, 127], [0, 82], [90, 78]];

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
  [[0, '#f2f4ff'], [.22, '#a4abd0'], [.4, '#1b1d33'], [.466, '#59619a'], [.497, '#ffffff'], [.5, '#000000'],
    [.57, '#060609'], [.76, '#13132a'], [.92, '#2a2fa0'], [1, '#3c55ff']].forEach(([o, col]) => g.addColorStop(o, col));
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
  strip(0x7a55ff, 14, 2, 36, [-24, -2, -14]);
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

function glyphGeometry(ch, s) {
  const { d } = G.glyphs[ch];
  const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
  const shapes = svg.paths.flatMap(p => SVGLoader.createShapes(p));
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: .3 / s, curveSegments: 12, bevelEnabled: true, bevelThickness: .06 / s, bevelSize: .045 / s, bevelSegments: 5,
  });
  g.scale(s, s, s);
  pillow(g, .5);
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

/* TRUE OFFLINE, twice round, with a star between. */
function buildRing(chrome, R, cap) {
  const ring = new THREE.Group();
  const s = cap / G.cap;
  const gap = .19 * cap;                         // tracking
  const space = .62 * cap;
  const cache = {};
  const items = [];
  const phrase = 'TRUE OFFLINE*';
  let run = 0;
  for (let k = 0; k < 2; k++) {
    for (const ch of phrase) {
      if (ch === ' ') { run += space; continue; }
      const w = ch === '*' ? cap * 1.95 : G.glyphs[ch].adv * s;
      items.push({ ch, at: run, w });
      run += w + gap;
    }
  }
  const stretch = (Math.PI * 2 * R) / run;       // close the circle exactly
  for (const it of items) {
    const key = it.ch;
    if (!cache[key]) cache[key] = key === '*' ? starGeometry(cap * 1.95, .36) : glyphGeometry(key, s);
    const m = new THREE.Mesh(cache[key], chrome);
    const th = ((it.at + it.w / 2) * stretch) / R;
    const off = key === '*' ? 0 : -it.w / 2;
    const pivot = new THREE.Group();
    pivot.rotation.y = th;
    m.position.set(off, key === '*' ? cap / 2 : 0, R);
    pivot.add(m);
    ring.add(pivot);
  }
  return ring;
}

function shell(tex, nrm, hgt, w, h, depth, flip) {
  const seg = matchMedia('(pointer:coarse)').matches ? 240 : 380;
  const geo = new THREE.PlaneGeometry(w, h, seg, Math.round(seg * h / w));
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, normalMap: nrm, normalScale: new THREE.Vector2(.62, .62),
    displacementMap: hgt, displacementScale: depth,
    roughness: .92, metalness: 0, envMapIntensity: .16,
    sheen: .35, sheenRoughness: .5, sheenColor: new THREE.Color(0x70727e),
    alphaTest: .5, alphaToCoverage: true, side: THREE.FrontSide,
  });
  const m = new THREE.Mesh(geo, mat);
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

/* Last pass: a touch of lens split at the edges, vignette and grain. */
const Finish = {
  uniforms: { tDiffuse: { value: null }, t: { value: 0 }, fade: { value: 0 } },
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
  const pin = canvas.parentNode, sec = document.querySelector('#hero');
  const fadeEl = document.querySelector('[data-hero-fade]'), foot = document.querySelector('[data-hero-foot]');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  let dpr = Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.environment = studio(renderer);
  scene.environmentIntensity = 1;
  scene.fog = new THREE.Fog(INK, 20, 36);
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 400);

  const tl = new THREE.TextureLoader();
  const load = (u, srgb) => new Promise((res, rej) => tl.load(u, t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    res(t);
  }, undefined, rej));
  const [fc, fn, fh, bc, bn, bh] = await Promise.all([
    load('img/hero/front.webp', true), load('img/hero/front-n.webp'), load('img/hero/front-h.webp'),
    load('img/hero/back.webp', true), load('img/hero/back-n.webp'), load('img/hero/back-h.webp'),
  ]);

  /* hoodie */
  const H = 7.4, W = H * SIZE.w / SIZE.h, D = 1.25;
  const hoodie = new THREE.Group();
  hoodie.add(shell(fc, fn, fh, W, H, D, false), shell(bc, bn, bh, W, H, D, true));
  const rig = new THREE.Group();                 // everything that tilts with the pointer
  rig.add(hoodie);
  scene.add(rig);

  /* chrome wordmark ring */
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf4f5fb, metalness: 1, roughness: .055, envMapIntensity: 1 });
  const R = 7.4, CAP = 1.28;
  const ring = buildRing(chrome, R, CAP);
  const ringTilt = new THREE.Group();
  ringTilt.add(ring);
  ring.position.y = -CAP / 2;
  ringTilt.position.y = -.82;
  ringTilt.rotation.set(.175, 0, -.065);
  rig.add(ringTilt);

  /* the shooting star and its two echoes: white, cobalt, violet, as on the jorts */
  const orbit = new THREE.Group();
  const orbitTilt = new THREE.Group();
  orbitTilt.rotation.set(-.3, 0, .26);
  orbitTilt.position.y = 1.1;
  orbitTilt.add(orbit);
  rig.add(orbitTilt);
  const OR = 8.7;
  const sg = starGeometry(2.7, .26);
  const heads = [
    [chrome, 0, 1],
    [new THREE.MeshStandardMaterial({ color: COBALT, metalness: .85, roughness: .22, emissive: COBALT, emissiveIntensity: .9 }), .13, .9],
    [new THREE.MeshStandardMaterial({ color: VIOLET, metalness: .85, roughness: .25, emissive: VIOLET, emissiveIntensity: .7 }), .25, .8],
  ];
  heads.forEach(([mat, lag, sc]) => {
    const pivot = new THREE.Group();
    pivot.rotation.y = lag;
    const m = new THREE.Mesh(sg, mat);
    m.position.set(0, 0, OR); m.scale.setScalar(sc);
    pivot.add(m);
    orbit.add(pivot);
  });
  {
    const pts = [];
    const n = 90, arc = 1.25;
    for (let i = 0; i <= n; i++) { const a = (i / n) * arc; pts.push(new THREE.Vector3(Math.sin(a) * OR, 0, Math.cos(a) * OR)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, .03, 6);
    const col = new Float32Array(tube.attributes.position.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < tube.attributes.position.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(tube.attributes.position, i);
      const k = clamp(Math.atan2(v.x, v.z) / arc);
      c.set(COBALT).lerp(new THREE.Color(0xffffff), Math.pow(1 - k, 5)).multiplyScalar(Math.pow(1 - k, 1.5) * 3.2);
      col.set([c.r, c.g, c.b], i * 3);
    }
    tube.setAttribute('color', new THREE.BufferAttribute(col, 3));
    orbit.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  }

  /* light on the fabric */
  const key = new THREE.DirectionalLight(0xfff4ea, 2.05); key.position.set(-6, 10, 10); scene.add(key);
  const rimA = new THREE.DirectionalLight(0x3a62ff, 2.2); rimA.position.set(14, 1, -1); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0x9fa8ff, .9); rimB.position.set(-14, 4, -1); scene.add(rimB);
  const under = new THREE.DirectionalLight(0x4a5cff, .35); under.position.set(0, -10, 5); scene.add(under);
  scene.add(new THREE.AmbientLight(0xa8a8b4, .14));

  /* space */
  const nebula = glow([[0, 'rgba(58,34,168,.2)'], [.4, 'rgba(30,22,110,.09)'], [1, 'rgba(0,0,0,0)']], 60, [3, 2, -18]);
  const nebula2 = glow([[0, 'rgba(10,53,240,.13)'], [.5, 'rgba(10,40,160,.04)'], [1, 'rgba(0,0,0,0)']], 44, [-16, -7, -24]);
  const halo = glow([[0, 'rgba(150,150,235,.17)'], [.45, 'rgba(84,70,210,.07)'], [1, 'rgba(0,0,0,0)']], 17, [0, .6, -4.2]);
  scene.add(nebula, nebula2, halo);
  const far = starfield(1500, 70, 150, 1.1, .6);
  const near = starfield(120, 18, 40, 1.7, .7);
  scene.add(far, near);

  /* post */
  const size = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .16, .5, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(Finish);
  composer.addPass(finish);

  let fitD = 24, portrait = false;
  const resize = () => {
    const w = pin.clientWidth, h = pin.clientHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    portrait = w / h < 1;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Landscape: the hoodie sets the distance. Portrait: the ring runs off the sides on purpose.
    const byHeight = H / .66 / (2 * tan);
    const byWidth = (W * .98) / (2 * tan * camera.aspect);
    fitD = portrait ? byWidth : Math.max(H / .66 / (2 * tan), (R * 2.5) / (2 * tan * camera.aspect));
    camera.updateProjectionMatrix();
    renderer.getSize(size);
  };
  addEventListener('resize', resize);
  resize();

  /* input */
  let px = 0, py = 0, tx = 0, ty = 0;
  if (matchMedia('(pointer:fine)').matches) {
    addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
  }
  let drag = null, spin = 0, extra = 0, idleAt = 0;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, last: e.clientX }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.last; drag.last = e.clientX;
    extra += dx * .0095; spin = dx * .0095;
  });
  const up = () => { drag = null; idleAt = performance.now(); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  let visible = true;
  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(pin);

  /* timeline */
  const introing = document.documentElement.classList.contains('intro');
  const begin = Math.max(performance.now(), introing ? 1020 : 0);
  let last = performance.now(), ringAngle = 2.2, orbitAngle = 1, samples = 0, slow = 0, tuned = false;

  function frame(now) {
    if (!visible) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    const e = calm ? 1 : clamp((now - begin) / 2100);
    const inn = expoOut(e);

    const r = sec.getBoundingClientRect();
    const span = r.height - innerHeight;
    const p = calm || span <= 0 ? 0 : clamp(-r.top / span);
    const dive = smooth(.04, .9, p);

    px += (tx - px) * .05; py += (ty - py) * .05;

    // hoodie: arrives with a spin, sways with its back to you, turns square on as you scroll
    if (!drag) {
      extra += spin; spin *= .94;
      if (now - idleAt > 1600 && Math.abs(spin) < .002) {
        const home = Math.round(extra / (Math.PI * 2)) * Math.PI * 2;
        extra += (home - extra) * .035;
      }
    }
    const sway = calm ? .3 : Math.sin(t * .42) * .36 * (1 - dive);
    hoodie.rotation.y = Math.PI + sway + extra * (1 - dive) + (1 - inn) * -Math.PI * 1.2;
    hoodie.position.y = lerp(-13, .05, inn) + Math.sin(t * .8) * .09 * (1 - dive);
    hoodie.rotation.z = Math.sin(t * .55) * .012;

    // ring: winds down from a fast spin, then opens up and flies past the camera
    if (!calm) { ringAngle -= dt * (.11 + (1 - inn) * 2.8 + dive * .5); orbitAngle += dt * (.34 + (1 - inn) * 1.6); }
    ring.rotation.y = ringAngle;
    orbit.rotation.y = orbitAngle;
    const open = 1 + dive * 1.5;
    ringTilt.scale.set(open * lerp(1.7, 1, inn), 1 + dive * .5, open * lerp(1.7, 1, inn));
    ringTilt.rotation.x = .175 - dive * .3;
    ringTilt.position.y = -.82 - dive * 2;
    orbitTilt.scale.setScalar(lerp(1.6, 1, inn) + dive * 1.2);

    rig.rotation.y = px * .2;
    rig.rotation.x = py * .1;

    // chrome highlights travel: the studio turns slowly around the letters
    scene.environmentRotation.y = t * .22 + px * .7;
    scene.environmentRotation.x = py * .25;

    nebula.rotation.z = t * .012;
    far.rotation.y = t * .004; near.rotation.y = -t * .009;
    near.position.z = dive * 16;

    // camera: pushes into the back print
    const z = lerp(fitD, 5.6, dive);
    scene.fog.near = z + 1.5; scene.fog.far = z + 15;
    camera.position.set(px * 1.1 * (1 - dive), lerp(.5, 1.75, dive) - py * .6 * (1 - dive), z);
    camera.lookAt(0, lerp(portrait ? -.2 : -.72, 1.7, dive), 0);

    fadeEl.style.opacity = smooth(.74, .98, p);
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

  // Compile everything before showing it, so the first visible frame does not hitch.
  renderer.compile(scene, camera);
  composer.render(0);
  requestAnimationFrame(n => {
    last = n; frame(n);
    canvas.classList.add('on');
    document.documentElement.dataset.hero = 'ready';
  });
  if (calm) addEventListener('resize', () => requestAnimationFrame(frame));
}

start().catch(fail);
