// Free auto-rigger: fits a Mixamo skeleton to an oriented (+Z facing) static mesh and computes skin weights.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const b64ToBuf = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const wp = o => o.getWorldPosition(new THREE.Vector3());
window.inspectRig = async (b64) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64), ''); g.scene.updateMatrixWorld(true);
  const bones = []; let verts = 0, meshes = 0, box = new THREE.Box3();
  g.scene.traverse(o => { if (o.isBone) { const p = wp(o); bones.push([o.name.replace(/^mixamorig:?/, ''), o.parent?.isBone ? o.parent.name.replace(/^mixamorig:?/, '') : '-', +p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]); } if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; box.expandByObject(o); } });
  return { meshes, verts, box: [box.min.toArray().map(v => +v.toFixed(3)), box.max.toArray().map(v => +v.toFixed(3))], bones };
};

import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fistPose } from '../src/models.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
const bufToB64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const strip = n => n.replace(/^mixamorig:?/, '');

// cluster sorted 1D values by gaps
function clusters(items, key, gap) {
  items.sort((a, b) => key(a) - key(b)); const out = []; let cur = [];
  for (const it of items) { if (cur.length && key(it) - key(cur[cur.length - 1]) > gap) { out.push(cur); cur = []; } cur.push(it); }
  if (cur.length) out.push(cur); return out;
}
const centroid = pts => { const c = V(0, 0, 0); for (const p of pts) c.add(p); return c.divideScalar(Math.max(1, pts.length)); };
function pcaLine(pts) {
  const c = centroid(pts); let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) { const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  let d = V(1, -1, 0).normalize();
  for (let i = 0; i < 50; i++) d = V(xx * d.x + xy * d.y + xz * d.z, xy * d.x + yy * d.y + yz * d.z, xz * d.x + yz * d.y + zz * d.z).normalize();
  return { c, d };
}

// Find joint positions on an A/T-pose mesh facing +Z (left = +X), feet at y=0. Works on a front silhouette grid.
function fitJoints(P, H) {
  const c = 0.01 * H, X0 = -0.6 * H, NX = Math.ceil(1.2 * H / c), NY = Math.ceil(1.02 * H / c);
  const occ = new Uint8Array(NX * NY), zmin = new Float32Array(NX * NY).fill(1e9), zmax = new Float32Array(NX * NY).fill(-1e9);
  for (const p of P) { const i = Math.floor((p.x - X0) / c), j = Math.floor(p.y / c); if (i < 0 || j < 0 || i >= NX || j >= NY) continue; const k = j * NX + i; occ[k] = 1; zmin[k] = Math.min(zmin[k], p.z); zmax[k] = Math.max(zmax[k], p.z); }
  // close small holes: dilate then erode (horizontal + vertical)
  const morph = (src, dil) => { const o = new Uint8Array(src.length); for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let v = dil ? 0 : 1; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; const s = (ii < 0 || jj < 0 || ii >= NX || jj >= NY) ? 0 : src[jj * NX + ii]; if (dil) v |= s; else v &= s; } o[j * NX + i] = v; } return o; };
  const g = morph(morph(occ, true), false);
  const xOf = i => X0 + (i + 0.5) * c, iOf = x => Math.floor((x - X0) / c);
  const runs = j => { const r = []; let s = -1; for (let i = 0; i <= NX; i++) { const f = i < NX && g[j * NX + i]; if (f && s < 0) s = i; if (!f && s >= 0) { r.push([s, i - 1]); s = -1; } } return r; };
  const zAt = (j, i0, i1) => { let lo = 1e9, hi = -1e9; for (let i = i0; i <= i1; i++) { const k = j * NX + i; if (zmin[k] < 1e8) { lo = Math.min(lo, zmin[k]); hi = Math.max(hi, zmax[k]); } } return lo < 1e8 ? (lo + hi) / 2 : 0; };
  const ic = iOf(0), J = {}, info = {};
  // ----- legs: from the floor up, the row where one run covers the centre = crotch
  let mergeJ = Math.round(0.47 * H / c);
  for (let j = Math.round(0.15 * H / c); j < Math.round(0.65 * H / c); j++) { const r = runs(j).filter(([a, b]) => Math.abs(xOf(a)) < 0.3 * H || Math.abs(xOf(b)) < 0.3 * H); if (r.some(([a, b]) => a < ic - 1 && b > ic + 1)) { mergeJ = j; break; } }
  const merge = mergeJ * c; info.legMerge = +(merge / H).toFixed(3);
  const hipY = Math.min(0.57 * H, Math.max(0.52 * H, merge + 0.06 * H));
  const legRun = (side, y) => { const j = Math.round(y / c); const r = runs(j).filter(([a, b]) => side > 0 ? xOf(a) > -0.01 * H && xOf(a) < 0.2 * H : xOf(b) < 0.01 * H && xOf(b) > -0.2 * H); if (!r.length) return null; const [a, b] = side > 0 ? r[0] : r[r.length - 1]; return { x: (xOf(a) + xOf(b)) / 2, z: zAt(j, a, b), w: (b - a + 1) * c }; };
  for (const [side, S] of [[1, 'Left'], [-1, 'Right']]) {
    const kneeY = 0.28 * H, ankY = 0.05 * H;
    const k = legRun(side, kneeY), a = legRun(side, ankY + 0.015 * H), t = legRun(side, merge - 0.03 * H) || k;
    J[S + 'UpLeg'] = new THREE.Vector3(side * Math.max(Math.abs(t.x) * 0.92, 0.05 * H), hipY - 0.03 * H, t.z);
    J[S + 'Leg'] = new THREE.Vector3(k.x, kneeY, k.z);
    J[S + 'Foot'] = new THREE.Vector3(a.x, ankY, a.z - 0.01 * H);
    const foot = P.filter(p => p.y < 0.03 * H && Math.abs(p.x - a.x) < 0.07 * H);
    const toeZ = Math.max(...foot.map(p => p.z));
    J[S + 'ToeBase'] = new THREE.Vector3(a.x, 0.015 * H, a.z + (toeZ - a.z) * 0.6);
    J[S + 'ToeTip'] = new THREE.Vector3(a.x, 0.012 * H, toeZ);
  }
  // ----- torso centre line
  const centreZ = y => { const j = Math.round(y / c); return zAt(j, ic - 3, ic + 3); };
  const R = { Hips: 0, Spine: 0.12, Spine1: 0.262, Spine2: 0.423, Neck: 0.604, Head: 0.729 };
  for (const [n, r] of Object.entries(R)) { const y = hipY + r * (H - hipY); J[n] = new THREE.Vector3(0, y, centreZ(y)); }
  J.HeadTop = new THREE.Vector3(0, H, J.Head.z);
  // ----- arms: outer runs per row = arm, until the row where the arm joins the torso (armpit)
  for (const [side, S] of [[1, 'Left'], [-1, 'Right']]) {
    const arm = P.filter(p => side * p.x > 0);
    const tip = arm.reduce((m, p) => side * p.x > side * m.x ? p : m, arm[0]);
    const line = []; let armpitY = null, chestHalf = 0.15 * H;
    for (let j = Math.round(tip.y / c); j < Math.round(0.92 * H / c); j++) {
      const r = runs(j); const torso = r.find(([a, b]) => a <= ic && b >= ic); if (!torso) continue;
      const outer = r.filter(([a, b]) => side > 0 ? a > torso[1] : b < torso[0]);
      const tEdge = side > 0 ? torso[1] : torso[0];
      if (!outer.length) { armpitY = j * c; break; }
      const o = side > 0 ? outer[outer.length - 1] : outer[0];
      line.push(new THREE.Vector3((xOf(o[0]) + xOf(o[1])) / 2, j * c, zAt(j, o[0], o[1])));
      chestHalf = Math.abs(xOf(tEdge));
    }
    info[S + 'Armpit'] = armpitY && +(armpitY / H).toFixed(3); info[S + 'Chest'] = +(chestHalf / H).toFixed(3);
    const use = line.filter(p => side * p.x < side * tip.x - 0.13 * H);
    const { c: lc, d } = pcaLine(use.length > 4 ? use : line);
    if (side * d.x < 0) d.negate();
    const at = x => lc.clone().addScaledVector(d, (x - lc.x) / d.x);
    let sh = at(side * chestHalf * 0.8);
    const shMaxY = J.Neck.y - 0.035 * H;
    if (sh.y > shMaxY) sh = lc.clone().addScaledVector(d, (shMaxY - lc.y) / d.y);
    sh.z = J.Spine2.z;
    // fingertip = the vertex furthest along the arm direction, close to the arm line
    let tipBest = null, tb = -1e9;
    for (const p of arm) { if (side * p.x < chestHalf) continue; const rel = p.clone().sub(lc), t = rel.dot(d); const off = rel.addScaledVector(d, -t).length(); if (off < 0.09 * H && t > tb) { tb = t; tipBest = p; } }
    const tip2 = tipBest || tip;
    const tipOnLine = lc.clone().addScaledVector(d, tb);
    const wrist = tipOnLine.clone().addScaledVector(d, -0.105 * H);
    const near = (q, r) => { const pts = P.filter(p => p.distanceTo(q) < r && side * p.x > chestHalf); return pts.length > 5 ? centroid(pts) : q; };
    const w2 = near(wrist, 0.035 * H), el = near(sh.clone().lerp(w2, 0.5), 0.045 * H);
    J[S + 'Arm'] = sh; J[S + 'ForeArm'] = el; J[S + 'Hand'] = w2; J[S + 'HandTip'] = tip2.clone();
    J[S + 'Shoulder'] = new THREE.Vector3(side * Math.abs(sh.x) * 0.34, J.Spine2.y + (J.Neck.y - J.Spine2.y) * 0.8, J.Spine2.z);
  }
  return { J, info, hipY };
}

const MAIN_CHILD = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandTip',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandTip',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', LeftToeBase: 'LeftToeTip',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', RightToeBase: 'RightToeTip' };
const FING = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
for (const S of ['Left', 'Right']) for (const f of FING) { MAIN_CHILD[S + 'Hand' + f + '1'] = S + 'Hand' + f + '2'; MAIN_CHILD[S + 'Hand' + f + '2'] = S + 'Hand' + f + '3'; MAIN_CHILD[S + 'Hand' + f + '3'] = S + 'Hand' + f + '3Tip'; }
const KEEP = new Set(Object.keys(MAIN_CHILD));
const isFinger = n => /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n);
// bone radius as fraction of height (for distance normalisation)
const RAD = { Hips: 0.1, Spine: 0.11, Spine1: 0.115, Spine2: 0.12, Neck: 0.04, Head: 0.07, LeftShoulder: 0.06, RightShoulder: 0.06,
  LeftArm: 0.04, RightArm: 0.04, LeftForeArm: 0.033, RightForeArm: 0.033, LeftHand: 0.016, RightHand: 0.016,
  LeftUpLeg: 0.07, RightUpLeg: 0.07, LeftLeg: 0.05, RightLeg: 0.05, LeftFoot: 0.035, RightFoot: 0.035, LeftToeBase: 0.03, RightToeBase: 0.03 };

function segDist(p, a, b) { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return { d: p.distanceTo(a.clone().addScaledVector(ab, t)), t }; }

function jpeg(tex, S, srgb) {
  if (!tex || !tex.image) return null;
  const c = document.createElement('canvas'); c.width = c.height = S; c.getContext('2d').drawImage(tex.image, 0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.flipY = tex.flipY; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.userData.mimeType = 'image/jpeg'; return t;
}
// Laplacian smoothing of skin weights over the welded mesh surface
function smoothWeights(geo, SI, SW, NB, iters) {
  if (!iters) return;
  const pos = geo.attributes.position, N = pos.count, idx = geo.index ? geo.index.array : null;
  const key = new Map(), weld = new Int32Array(N); let U = 0;
  for (let i = 0; i < N; i++) { const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4); let u = key.get(k); if (u === undefined) { u = U++; key.set(k, u); } weld[i] = u; }
  const W = new Float32Array(U * NB), cnt = new Float32Array(U);
  for (let i = 0; i < N; i++) { const u = weld[i]; cnt[u]++; for (let k = 0; k < 4; k++) W[u * NB + SI[i * 4 + k]] += SW[i * 4 + k]; }
  for (let u = 0; u < U; u++) for (let b = 0; b < NB; b++) W[u * NB + b] /= cnt[u];
  const nb = Array.from({ length: U }, () => new Set());
  const T = idx ? idx.length : N;
  for (let t = 0; t < T; t += 3) { const a = weld[idx ? idx[t] : t], b = weld[idx ? idx[t + 1] : t + 1], c = weld[idx ? idx[t + 2] : t + 2]; nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b); }
  const NBL = nb.map(s => [...s]);
  let cur = W, nxt = new Float32Array(W.length);
  for (let it = 0; it < iters; it++) {
    for (let u = 0; u < U; u++) { const l = NBL[u]; const o = u * NB; for (let b = 0; b < NB; b++) { let a = 0; for (const v of l) a += cur[v * NB + b]; nxt[o + b] = l.length ? 0.5 * cur[o + b] + 0.5 * a / l.length : cur[o + b]; } }
    [cur, nxt] = [nxt, cur];
  }
  for (let i = 0; i < N; i++) {
    const o = weld[i] * NB, top = [];
    for (let b = 0; b < NB; b++) { const w = cur[o + b]; if (w > 1e-4) top.push([b, w]); }
    top.sort((x, y) => y[1] - x[1]); const t4 = top.slice(0, 4), tot = t4.reduce((a, x) => a + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) { SI[i * 4 + k] = t4[k] ? t4[k][0] : 0; SW[i * 4 + k] = t4[k] ? t4[k][1] / tot : 0; }
  }
}

window.autorig = async (meshB64, refB64, opts = {}) => {
  const L = new GLTFLoader();
  const tgt = await L.parseAsync(b64ToBuf(meshB64), ''), ref = await L.parseAsync(b64ToBuf(refB64), '');
  tgt.scene.updateMatrixWorld(true);
  // gather target mesh (world space, metres)
  const meshes = []; tgt.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const P = []; for (const m of meshes) { const pos = m.geometry.attributes.position, v = V(); for (let i = 0; i < pos.count; i++) P.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone()); }
  const box = new THREE.Box3().setFromPoints(P), H = box.max.y - box.min.y;
  for (const p of P) p.y -= box.min.y;
  const sample = P.filter((_, i) => i % 2 === 0);
  const { J, info } = fitJoints(sample, H);

  // reference skeleton (Mixamo naming, shared clip conventions)
  const rs = SkeletonUtils.clone(ref.scene); rs.updateMatrixWorld(true);
  const rb = {}; rs.traverse(o => { if (o.isBone) rb[strip(o.name)] = o; });
  const refH = (() => { const b = new THREE.Box3(); rs.traverse(o => { if (o.isSkinnedMesh) { const pos = o.geometry.attributes.position, v = V(); for (let i = 0; i < pos.count; i += 5) { v.fromBufferAttribute(pos, i); o.applyBoneTransform(i, v); b.expandByPoint(v.applyMatrix4(o.matrixWorld)); } } }); return b; })();
  const s = (refH.max.y - refH.min.y) / H;
  const foot0 = V((refH.min.x + refH.max.x) / 2, refH.min.y, (rb.LeftFoot.getWorldPosition(V()).z + rb.RightFoot.getWorldPosition(V()).z) / 2);
  const tgtFoot0 = V(0, 0, (J.LeftFoot.z + J.RightFoot.z) / 2);
  const T = new THREE.Matrix4().makeTranslation(foot0.x, foot0.y, foot0.z).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-tgtFoot0.x, -tgtFoot0.y, -tgtFoot0.z));
  const JW = {}; for (const [n, p] of Object.entries(J)) JW[n] = p.clone().applyMatrix4(T);

  // remove unused bones and meshes from the reference clone
  const dead = []; rs.traverse(o => { if (o.isBone && !KEEP.has(strip(o.name))) dead.push(o); if (o.isMesh) dead.push(o); });
  for (const o of dead) o.parent && o.parent.remove(o);
  // ref world rotations + directions to main child (before we edit anything)
  const refQ = {}, refDir = {};
  // ----- fingers: copy the reference hand layout into the fitted hand, then snap joints onto the mesh
  for (const S of ['Left', 'Right']) {
    const rh = rb[S + 'Hand']; if (!rh || !rb[S + 'HandMiddle3']) continue;
    const rp = n => rb[n].getWorldPosition(V());
    const tipOf = f => { const a = rp(S + 'Hand' + f + '2'), b = rp(S + 'Hand' + f + '3'); return b.clone().addScaledVector(b.clone().sub(a), 0.9); };
    const rH = rp(S + 'Hand'), rTip = tipOf('Middle'), rDir = rTip.clone().sub(rH).normalize();
    const tH = JW[S + 'Hand'], tTip = JW[S + 'HandTip'], tDir = tTip.clone().sub(tH).normalize();
    // fingers from the geometry: slice the hand along its axis and split the finger zone into four bands
    const wr = J[S + 'Hand'], tp = J[S + 'HandTip'], ax = tp.clone().sub(wr), Lh = ax.length(); ax.normalize();
    const hv = P.filter(p => { const t = p.clone().sub(wr).dot(ax); return t > -0.02 * H && t < Lh * 1.05 && p.distanceTo(wr) < Lh * 1.3 && Math.sign(p.x) === (S === 'Left' ? 1 : -1); });
    // width direction = biggest spread across the axis; thumb sits on the forward (+z) side
    const perp = hv.map(p => { const r = p.clone().sub(wr); return r.addScaledVector(ax, -r.dot(ax)); });
    const { d: wd0 } = pcaLine(perp.map(v => v.clone()).concat([V(0, 0, 0)]));
    const wd = wd0.clone().addScaledVector(ax, -wd0.dot(ax)).normalize(); if (wd.z < 0) wd.negate();
    const tw = hv.map(p => { const r = p.clone().sub(wr); return { p, t: r.dot(ax) / Lh, w: r.dot(wd) }; });
    const zone = tw.filter(o => o.t > 0.55 && o.t < 0.98);
    const wmin = Math.min(...zone.map(o => o.w)), wmax = Math.max(...zone.map(o => o.w));
    // bands: pinky (most -w) .. index (most +w, next to the thumb)
    const order = ['Pinky', 'Ring', 'Middle', 'Index'], bw = (wmax - wmin) / 4;
    const at = (list, t0) => { const sl = list.filter(o => Math.abs(o.t - t0) < 0.06); return sl.length ? centroid(sl.map(o => o.p)) : null; };
    order.forEach((f, k) => {
      const band = tw.filter(o => o.w >= wmin + k * bw - 0.1 * bw && o.w <= wmin + (k + 1) * bw + 0.1 * bw);
      const tmax = Math.max(...band.filter(o => o.t < 1.05).map(o => o.t), 0.8);
      const t1 = 0.42, len = tmax - t1;
      const pts = [t1, t1 + len * 0.42, t1 + len * 0.72, tmax - 0.02].map((t, i) => at(band, t) || wr.clone().addScaledVector(ax, t * Lh).addScaledVector(wd, (wmin + (k + 0.5) * bw)));
      ['1', '2', '3', '3Tip'].forEach((suf, i) => { J[S + 'Hand' + f + suf] = pts[i]; JW[S + 'Hand' + f + suf] = pts[i].clone().applyMatrix4(T); });
    });
    // thumb: furthest point on the thumb side in the lower half of the hand
    const th = tw.filter(o => o.t > 0.1 && o.t < 0.75 && o.w > wmax * 0.6);
    const ttip = th.length ? th.reduce((m, o) => (o.w + o.t * 0.5 * (wmax - wmin)) > (m.w + m.t * 0.5 * (wmax - wmin)) ? o : m, th[0]).p : wr.clone().addScaledVector(ax, 0.5 * Lh).addScaledVector(wd, wmax);
    const t1p = wr.clone().addScaledVector(ax, 0.12 * Lh).addScaledVector(wd, wmax * 0.35);
    [['1', 0], ['2', 0.4], ['3', 0.72], ['3Tip', 1]].forEach(([suf, f]) => { const q = t1p.clone().lerp(ttip, f); J[S + 'HandThumb' + suf] = q; JW[S + 'HandThumb' + suf] = q.clone().applyMatrix4(T); });
    J[S + 'HandTip'] = J[S + 'HandMiddle3Tip']; JW[S + 'HandTip'] = JW[S + 'HandMiddle3Tip'];
    refDir[S + 'Hand'] = rDir; // hand bone aims at the middle fingertip
    for (const f of FING) refDir[S + 'Hand' + f + '3'] = rp(S + 'Hand' + f + '3').sub(rp(S + 'Hand' + f + '2')).normalize();
  }
  for (const n of KEEP) { const b = rb[n]; if (!b) continue; refQ[n] = b.getWorldQuaternion(new THREE.Quaternion()); const c = rb[MAIN_CHILD[n]]; if (c && !refDir[n]) refDir[n] = c.getWorldPosition(V()).sub(b.getWorldPosition(V())).normalize(); }
  // set bones top-down: world pos = fitted joint, world rot = ref rot swung onto the fitted direction
  const order = []; (function walk(b) { if (b.isBone && KEEP.has(strip(b.name))) order.push(b); for (const c of b.children) walk(c); })(rs);
  const worldM = new Map();
  for (const b of order) {
    const n = strip(b.name), p = JW[n];
    let q = refQ[n].clone();
    const ch = MAIN_CHILD[n], d0 = refDir[n] || (rb[ch] ? null : null);
    if (JW[ch]) {
      const dir = JW[ch].clone().sub(p).normalize();
      const ref0 = refDir[n] || dir;
      q = new THREE.Quaternion().setFromUnitVectors(ref0, dir).multiply(refQ[n]);
    }
    const ws = b.getWorldScale(V());
    const M = new THREE.Matrix4().compose(p, q, ws);
    const parentM = b.parent.isBone ? worldM.get(b.parent) : (b.parent.updateMatrixWorld(true), b.parent.matrixWorld);
    const local = parentM.clone().invert().multiply(M);
    local.decompose(b.position, b.quaternion, b.scale);
    worldM.set(b, M);
  }
  rs.updateMatrixWorld(true);
  const bones = order, bi = new Map(bones.map((b, i) => [strip(b.name), i]));

  // ----- skin weights
  const seg = bones.map(b => { const n = strip(b.name); return { n, a: J[n], b: (/Hand$/.test(n) && J[n + 'Middle1']) || J[MAIN_CHILD[n]] || J[n].clone().add(V(0, 0.02 * H, 0)), r: (RAD[n] || (isFinger(n) ? 0.011 : 0.05)) * H, parent: b.parent.isBone ? strip(b.parent.name) : null }; });
  const kids = {}; for (const sg of seg) if (sg.parent) (kids[sg.parent] ||= []).push(sg.n);
  const segOf = Object.fromEntries(seg.map(sg => [sg.n, sg]));
  let offset = 0; const out = [];
  for (const m of meshes) {
    const pos = m.geometry.attributes.position, N = pos.count;
    const SI = new Uint16Array(N * 4), SW = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const p = P[offset + i];
      let best = null, bd = 1e9;
      for (const sg of seg) {
        // side gating: limbs only take vertices on their own side
        if (/^Left/.test(sg.n) && p.x < -0.01 * H) continue; if (/^Right/.test(sg.n) && p.x > 0.01 * H) continue;
        if (/(UpLeg|Leg|Foot|Toe)/.test(sg.n) && p.y > J.Hips.y + 0.02 * H) continue;
        if (isFinger(sg.n) && p.distanceTo(J[sg.n.startsWith('Left') ? 'LeftHand' : 'RightHand']) > 0.16 * H) continue;
        if (/(Arm|Hand)$/.test(sg.n) && Math.abs(p.x) < 0.8 * Math.abs(J.LeftArm.x)) continue;
        const d = segDist(p, sg.a, sg.b).d / sg.r; if (d < bd) { bd = d; best = sg; }
      }
      const gp = best.parent && segOf[best.parent] ? segOf[best.parent].parent : null;
      const cand = [best.n, ...(best.parent ? [best.parent] : []), ...(gp && /Shoulder|Arm$/.test(best.n) ? [gp] : []), ...(kids[best.n] || [])];
      const ws = cand.map(n => { const sg = segOf[n]; const d = segDist(p, sg.a, sg.b).d / sg.r; return [n, 1 / Math.pow(d + 0.25, 6)]; }).sort((a, b) => b[1] - a[1]).slice(0, 4);
      let ws2 = ws;
      // head + jaw move as one: blend Neck -> Head by height so the face never shears
      if ((best.n === 'Neck' || best.n === 'Head' || (p.y > J.Neck.y && /^Spine|Shoulder/.test(best.n))) && Math.abs(p.x) < 0.12 * H) { const g = J.Head.y - J.Neck.y, t = Math.max(0, Math.min(1, (p.y - (J.Neck.y + 0.15 * g)) / (0.45 * g))); const hw = t * t * (3 - 2 * t); ws.length = 0; ws.push(['Head', hw + 1e-6], ['Neck', 1 - hw + 1e-6]); }
      const tot = ws.reduce((a, w) => a + w[1], 0);
      ws.forEach(([n, w], k) => { SI[i * 4 + k] = bi.get(n); SW[i * 4 + k] = w / tot; });
    }
    offset += N;
    smoothWeights(m.geometry, SI, SW, bones.length, opts.smooth ?? 4);
    out.push({ m, SI, SW });
  }
  const dom = {}; for (const { SI, SW } of out) for (let i = 0; i < SW.length / 4; i++) { const n = strip(bones[SI[i * 4]].name); dom[n] = (dom[n] || 0) + 1; }
  // build skinned meshes in the reference frame
  const skeleton = new THREE.Skeleton(bones);
  const root = new THREE.Group(); root.name = 'Character';
  // put the armature (top-level of ref clone) into root
  for (const c of [...rs.children]) root.add(c);
  for (const { m, SI, SW } of out) {
    const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); g.translate(0, -box.min.y, 0); g.applyMatrix4(T);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.computeVertexNormals();
    const old = Array.isArray(m.material) ? m.material[0] : m.material;
    const mat = new THREE.MeshStandardMaterial({ map: jpeg(old.map, opts.tex || 1024, true), normalMap: opts.normal === false ? null : jpeg(old.normalMap, opts.ntex || 1024, false), roughness: 0.85, metalness: 0, side: old.side, name: 'skin' });
    const sm = new THREE.SkinnedMesh(g, mat); sm.name = 'body';
    root.add(sm); root.updateMatrixWorld(true); sm.bind(skeleton, sm.matrixWorld);
  }
  root.updateMatrixWorld(true);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  const J2 = Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v.toArray().map(x => +(x / H).toFixed(3))]));
  return { size: buf.byteLength, H: +H.toFixed(3), info, dom, joints: J2, b64: bufToB64(buf) };
};

// close-up of one hand (optionally posed by a clip) for checking finger rigs
window.previewHand = async (b64, libB64, clip, t, side = 'Right', curl = 0) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64), '');
  document.body.innerHTML = '';
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(400, 520); document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x6a6f78);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(1, 2, 3); sc.add(d);
  sc.add(g.scene);
  let clipObj = g.animations.find(a => a.name === clip);
  if (!clipObj && libB64 && clip) { const lib = await new GLTFLoader().parseAsync(b64ToBuf(libB64), ''); clipObj = lib.animations.find(a => a.name === clip); }
  const bm = {}; g.scene.traverse(o => { if (o.isBone) bm[strip(o.name)] = o; });
  if (curl !== 9) fistPose(g.scene, bm); // same as the game: fists in the rest pose, finger tracks stripped from clips
  if (clipObj) { const cc = clipObj.clone(); cc.tracks = cc.tracks.filter(tr => !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(tr.name)); const mx = new THREE.AnimationMixer(g.scene); mx.clipAction(cc).play(); mx.setTime(t || 0); }
  if (curl === 9) { // debug: show joints as dots, no fist
    for (const [n, b] of Object.entries(bm)) if (/Hand/.test(n)) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: /Thumb/.test(n) ? 0x00ff00 : /Index/.test(n) ? 0xff0000 : /Middle/.test(n) ? 0x0000ff : /Ring/.test(n) ? 0xffff00 : /Pinky/.test(n) ? 0xff00ff : 0xffffff, depthTest: false })); m.renderOrder = 9; m.scale.setScalar(0.35); sc.add(m); b.getWorldPosition(m.position); }
  }
  if (curl) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = bm[side + 'Hand' + f + i]; if (b) b.rotateX(curl * 1.4); }
  g.scene.updateMatrixWorld(true);
  const hand = bm[side + 'Hand'], c = hand.getWorldPosition(V()), mid = bm[side + 'HandMiddle2'] ? bm[side + 'HandMiddle2'].getWorldPosition(V()) : c;
  const L = c.distanceTo(mid) * 4;
  const cam = new THREE.PerspectiveCamera(35, 400 / 520, L * 0.01, L * 100);
  cam.position.set(mid.x + (side === 'Left' ? 1 : -1) * L * 0.9, mid.y + L * 0.4, mid.z + L * 1.6); cam.lookAt(mid);
  r.render(sc, cam); return { bones: Object.keys(bm).length };
};
window.weightsAt = async (b64, qx, qy, qz, r) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64), ''); g.scene.updateMatrixWorld(true);
  let sm; g.scene.traverse(o => { if (o.isSkinnedMesh) sm = o; });
  const pos = sm.geometry.attributes.position, si = sm.geometry.attributes.skinIndex, sw = sm.geometry.attributes.skinWeight;
  const box = new THREE.Box3().setFromObject(sm), H = box.max.y - box.min.y, v = V();
  // query given as fractions of height relative to (centre x, min y, max z)
  const c = V((box.min.x + box.max.x) / 2 + qx * H, box.min.y + qy * H, box.max.z + qz * H);
  const res = {};
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(sm.matrixWorld); if (v.distanceTo(c) > r * H) continue; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0.05) { const n = strip(sm.skeleton.bones[si.getComponent(i, k)].name); res[n] = (res[n] || 0) + w; } } }
  return res;
};
