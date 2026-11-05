// Turns a .bin from tools/build_hero.py into one closed mesh.
// Layout: u32 nV nT nE nO, then i16 x[nV] y[nV] zf[nV] zb[nV] (16ths of a pixel, y up), u16 u[nV] v[nV],
// u16 tris[nT*3], u16 openEdges[nE*2], u16 openIds[nO], i16 openDirs[nO*2] (thousandths),
// i8 frontNormals[nV*3], i8 backNormals[nV*3]. Normals come from the height field, not the triangles.
// Front and back share every seam vertex (zf === zb), so the surface closes with smooth normals.
// Hem and cuffs are open: a dark recessed cap sits inside them.
import * as THREE from 'three';

export function garmentGeometry(buf, H, size) {
  const [nV, nT, nE, nO] = new Uint32Array(buf, 0, 4);
  let o = 16;
  const i16 = n => { const a = new Int16Array(buf, o, n); o += n * 2; return a; };
  const u16 = n => { const a = new Uint16Array(buf, o, n); o += n * 2; return a; };
  const X = i16(nV), Y = i16(nV), ZF = i16(nV), ZB = i16(nV), U = u16(nV), V = u16(nV);
  const tris = u16(nT * 3), oe = u16(nE * 2), ids = u16(nO), dirs = i16(nO * 2);
  const NF = new Int8Array(buf, o, nV * 3), NB = new Int8Array(buf, o + nV * 3, nV * 3);
  const k = H / size.h / 16, W = H * size.w / size.h;

  // back vertices: seam vertices are the front ones, the rest are new
  const backOf = new Uint32Array(nV);
  let n = nV;
  for (let i = 0; i < nV; i++) backOf[i] = ZF[i] === ZB[i] ? i : n++;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
  for (let i = 0; i < nV; i++) {
    const x = X[i] * k, y = Y[i] * k, u = U[i] / 65535, v = V[i] / 65535;
    pos.set([x, y, ZF[i] * k], i * 3); uv.set([u, v], i * 2);
    nor.set([NF[i * 3] / 127, NF[i * 3 + 1] / 127, NF[i * 3 + 2] / 127], i * 3);
    const b = backOf[i];
    if (b !== i) {
      pos.set([x, y, ZB[i] * k], b * 3); uv.set([u, v], b * 2);
      nor.set([NB[i * 3] / 127, NB[i * 3 + 1] / 127, NB[i * 3 + 2] / 127], b * 3);
    }
  }
  const idx = new Uint32Array(nT * 6);
  for (let t = 0; t < nT; t++) {
    const a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2];
    idx.set([a, b, c], t * 3);
    idx.set([backOf[a], backOf[c], backOf[b]], nT * 3 + t * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.addGroup(0, nT * 3, 0);
  g.addGroup(nT * 3, nT * 3, 1);

  // The cap: front edge, in and up to a recessed middle, back out to the back edge.
  const mid = new Map();
  const cp = [];
  const put = (x, y, z) => { cp.push(x, y, z); return cp.length / 3 - 1; };
  const lip = new Map();
  const depth = .34;
  ids.forEach((v, i) => {
    const dx = dirs[i * 2] / 1000, dy = dirs[i * 2 + 1] / 1000;
    const x = X[v] * k, y = Y[v] * k, zf = ZF[v] * k, zb = ZB[v] * k;
    lip.set(v, [put(x, y, zf), put(x, y, zb)]);
    mid.set(v, put(x + dx * depth, y + dy * depth, (zf + zb) / 2));
  });
  const ci = [];
  for (let e = 0; e < nE; e++) {
    const a = oe[e * 2], b = oe[e * 2 + 1];
    const [af, ab] = lip.get(a), [bf, bb] = lip.get(b), am = mid.get(a), bm = mid.get(b);
    ci.push(af, bf, bm, af, bm, am, am, bm, bb, am, bb, ab);
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cp), 3));
  cap.setIndex(ci);
  cap.computeVertexNormals();
  return { body: g, cap, W };
}
