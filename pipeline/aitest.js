// Stage 2 of the AI tools test (browser side): map UniRig rigs onto the game's Mixamo skeleton, retarget MoMask BVH,
// pose characters, score skin stretch / flipped triangles per body region, and render contact sheets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const b64ToBuf = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const bufToB64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const strip = n => n.replace(/^mixamorig\d*[:_]?/, '');
const load = async b64 => new GLTFLoader().parseAsync(b64ToBuf(b64), '');

// ---------------- inspect any rig ----------------
window.rigInfo = async (b64) => {
  const g = await load(b64); g.scene.updateMatrixWorld(true);
  const bones = []; let meshes = 0, verts = 0;
  g.scene.traverse(o => { if (o.isBone) { const p = o.getWorldPosition(V()); bones.push({ n: o.name, p: o.parent && o.parent.isBone ? o.parent.name : null, xyz: p.toArray().map(v => +v.toFixed(3)) }); } if (o.isSkinnedMesh) { meshes++; verts += o.geometry.attributes.position.count; } });
  const box = new THREE.Box3().setFromObject(g.scene);
  return { bones: bones.length, skinned: meshes, verts, box: [box.min.toArray(), box.max.toArray()].map(a => a.map(v => +v.toFixed(3))), list: bones };
};

// ---------------- UniRig -> game rig ----------------
// Uses UniRig's mesh, joint positions and skin weights; snaps the game's Mixamo joints onto UniRig joints and moves the
// weights of every UniRig bone onto the Mixamo bone whose segment it lies on. Returns a GLB the game can load.
window.uniToGame = async (uniB64, refB64) => {
  const g = await load(uniB64); g.scene.updateMatrixWorld(true);
  let sm = null; g.scene.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
  if (!sm) throw new Error('UniRig result has no skinned mesh');
  // rest-pose world vertices + UniRig joints
  sm.skeleton.pose(); g.scene.updateMatrixWorld(true);
  const pos = sm.geometry.attributes.position, N = pos.count;
  const P = []; for (let i = 0; i < N; i++) P.push(V().fromBufferAttribute(pos, i).applyMatrix4(sm.bindMatrix).applyMatrix4(sm.bindMatrixInverse).applyMatrix4(sm.matrixWorld));
  const ub = sm.skeleton.bones.map(b => ({ b, p: b.getWorldPosition(V()) }));
  // export the UniRig mesh as a static GLB in the same frame and let the regular autorig fit it, but with
  // (a) Mixamo joints snapped to the nearest UniRig joint on the same limb and (b) UniRig weights carried over.
  const geo = sm.geometry.clone(); geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight');
  geo.applyMatrix4(sm.matrixWorld);
  const mesh = new THREE.Mesh(geo, sm.material); const sc = new THREE.Scene(); sc.add(mesh);
  const stat = await new GLTFExporter().parseAsync(sc, { binary: true });
  const uniJoints = ub.map(o => o.p.toArray());
  const si = sm.geometry.attributes.skinIndex, sw = sm.geometry.attributes.skinWeight;
  const uniW = []; for (let i = 0; i < N; i++) { const w = []; for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > 1e-4) w.push([si.getComponent(i, k), x]); } uniW.push(w); }
  const uniParent = ub.map(o => ub.findIndex(q => q.b === o.b.parent));
  return window.autorig(bufToB64(stat), refB64, { uni: { joints: uniJoints, weights: uniW, parent: uniParent } });
};

// ---------------- poses ----------------
const CLIP = { idle: ['Fighting_Idle', 0.3], jab: ['Punching', 0.45], hook: ['Hook_Punch', 0.5], uppercut: ['Fighting_Idle', 0.3], hit: ['Head_Hit', 0.3], knockdown: ['Knocked_Out', 1.2], lifted: ['Fighting_Idle', 0.3], grabbed: ['Hit_To_Body', 0.3] };
export const POSES = Object.keys(CLIP);
function aim(bm, name, child, dir, root) {
  const b = bm[name], c = bm[child]; if (!b || !c) return;
  root.updateMatrixWorld(true);
  const d0 = c.getWorldPosition(V()).sub(b.getWorldPosition(V())).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(d0, dir.clone().normalize());
  const wq = b.getWorldQuaternion(new THREE.Quaternion()), pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
}
function extraPose(name, bm, root) {
  // directions are in the model's frame (faces +Z, left = +X); the root may be scaled but not rotated
  if (name === 'uppercut') { aim(bm, 'RightArm', 'RightForeArm', V(-0.25, -0.35, 1), root); aim(bm, 'RightForeArm', 'RightHand', V(0.1, 1, 0.45), root); aim(bm, 'Spine1', 'Spine2', V(0.1, 1, 0.15), root); }
  if (name === 'lifted') {
    for (const [s, x] of [['Left', 1], ['Right', -1]]) {
      aim(bm, s + 'Arm', s + 'ForeArm', V(x * 0.7, 0.7, 0.2), root); aim(bm, s + 'ForeArm', s + 'Hand', V(x * 0.4, 0.9, 0.3), root);
      aim(bm, s + 'UpLeg', s + 'Leg', V(x * 0.15, -0.8, 0.6), root); aim(bm, s + 'Leg', s + 'Foot', V(x * 0.1, -1, -0.3), root);
    }
    aim(bm, 'Spine1', 'Spine2', V(0, 1, -0.35), root);
  }
  if (name === 'grabbed') { aim(bm, 'Spine', 'Spine1', V(0, 1, -0.3), root); aim(bm, 'Spine2', 'Neck', V(0, 1, -0.45), root); for (const [s, x] of [['Left', 1], ['Right', -1]]) { aim(bm, s + 'Arm', s + 'ForeArm', V(x * 0.4, -0.2, 1), root); aim(bm, s + 'ForeArm', s + 'Hand', V(-x * 0.3, 0.3, 1), root); } }
}
const _lib = {};
async function clips(libB64) { if (!_lib.c) { const g = await load(libB64); _lib.c = Object.fromEntries(g.animations.map(a => [a.name, a])); } return _lib.c; }
function stripFingers(clip) { const c = clip.clone(); c.tracks = c.tracks.filter(t => !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(t.name)); return c; }

// region of a bone for scoring
const REGION = n => /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n) ? 'fingers' : /Head|Neck/.test(n) ? 'face' : /ForeArm|Hand/.test(n) ? 'elbows' : /Arm|Shoulder/.test(n) ? 'shoulders' : /Leg$|Foot|Toe/.test(n) && !/UpLeg/.test(n) ? 'knees' : /UpLeg|Hips/.test(n) ? 'hips' : 'torso';
const REGIONS = ['knees', 'elbows', 'shoulders', 'hips', 'fingers', 'face'];

function skinnedTris(sm) {
  const pos = sm.geometry.attributes.position, N = pos.count, out = new Float32Array(N * 3), v = V();
  for (let i = 0; i < N; i++) { v.fromBufferAttribute(pos, i); sm.applyBoneTransform(i, v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  return out;
}
function scoreMesh(sm, rest, posed) {
  const idx = sm.geometry.index ? sm.geometry.index.array : null, T = idx ? idx.length : sm.geometry.attributes.position.count;
  const si = sm.geometry.attributes.skinIndex, sw = sm.geometry.attributes.skinWeight, bones = sm.skeleton.bones;
  const dom = i => { let bk = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bk = si.getComponent(i, k); } } return REGION(strip(bones[bk].name)); };
  const R = {}; for (const r of [...REGIONS, 'torso']) R[r] = { st: [], flips: 0, tris: 0 };
  const a = V(), b = V(), c = V(), a2 = V(), b2 = V(), c2 = V(), n1 = V(), n2 = V();
  const g = (arr, i, o) => o.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
  for (let t = 0; t < T; t += 3) {
    const i0 = idx ? idx[t] : t, i1 = idx ? idx[t + 1] : t + 1, i2 = idx ? idx[t + 2] : t + 2;
    g(rest, i0, a); g(rest, i1, b); g(rest, i2, c); g(posed, i0, a2); g(posed, i1, b2); g(posed, i2, c2);
    const r = R[dom(i0)]; r.tris++;
    for (const [p, q, p2, q2] of [[a, b, a2, b2], [b, c, b2, c2], [c, a, c2, a2]]) { const l0 = p.distanceTo(q); if (l0 > 1e-6) r.st.push(Math.abs(p2.distanceTo(q2) / l0 - 1)); }
    n1.subVectors(b, a).cross(V().subVectors(c, a)); n2.subVectors(b2, a2).cross(V().subVectors(c2, a2));
    if (n1.lengthSq() > 1e-14 && n1.dot(n2) < -0.2 * n1.length() * n2.length()) r.flips++;
  }
  const out = {};
  for (const [k, r] of Object.entries(R)) { if (!r.tris) continue; r.st.sort((x, y) => x - y); out[k] = { stretch95: +(r.st[Math.floor(r.st.length * 0.95)] || 0).toFixed(3), flipPct: +(100 * r.flips / r.tris).toFixed(2), tris: r.tris }; }
  return out;
}

// render N copies side by side (poses or animation frames) and score each
async function sheet(b64, libB64, items, label) {
  const g0 = await load(b64), lib = await clips(libB64);
  const own = Object.fromEntries((g0.animations || []).map(a => [a.name, a]));
  document.body.innerHTML = '';
  const W = 220 * items.length, H = 420;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x5d626b);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.3)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(1, 2, 3); sc.add(d);
  const box0 = new THREE.Box3().setFromObject(g0.scene), h = box0.max.y - box0.min.y, sp = h * 0.55;
  const scores = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i], m = SkeletonUtils.clone(g0.scene); m.position.x = (i - (items.length - 1) / 2) * sp; sc.add(m); m.updateMatrixWorld(true);
    const bm = {}; m.traverse(o => { if (o.isBone) bm[strip(o.name)] = o; });
    let sm = null; m.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
    const rest = skinnedTris(sm);
    if (it.clip) {
      const clip = own[it.clip] || lib[it.clip]; if (clip) { const mx = new THREE.AnimationMixer(m); mx.clipAction(stripFingers(clip)).play(); mx.setTime(it.t || 0); }
    }
    if (it.extra) extraPose(it.extra, bm, m);
    m.updateMatrixWorld(true);
    scores.push({ name: it.name, ...scoreMesh(sm, rest, skinnedTris(sm)) });
  }
  const cam = new THREE.PerspectiveCamera(30, W / H, h * 0.01, h * 100);
  const span = sp * items.length; cam.position.set(0, box0.min.y + h * 0.55, Math.max(span * 0.95, h * 2.6)); cam.lookAt(0, box0.min.y + h * 0.48, 0);
  r.render(sc, cam);
  return { label, scores };
}
window.poseSheet = (b64, libB64, label) => sheet(b64, libB64, POSES.map(p => ({ name: p, clip: CLIP[p][0], t: CLIP[p][1], extra: ['uppercut', 'lifted', 'grabbed'].includes(p) ? p : null })), label);

// ---------------- MoMask BVH -> Mixamo clip ----------------
// HumanML3D / MoMask joint names -> Mixamo
const BVH2MIX = { Hips: 'Hips', Pelvis: 'Hips', Spine: 'Spine', Spine1: 'Spine1', Spine2: 'Spine2', Spine3: 'Spine2', Chest: 'Spine2', Neck: 'Neck', Head: 'Head',
  LeftShoulder: 'LeftShoulder', LeftCollar: 'LeftShoulder', LeftArm: 'LeftArm', LeftUpArm: 'LeftArm', LeftForeArm: 'LeftForeArm', LeftLowArm: 'LeftForeArm', LeftHand: 'LeftHand',
  RightShoulder: 'RightShoulder', RightCollar: 'RightShoulder', RightArm: 'RightArm', RightUpArm: 'RightArm', RightForeArm: 'RightForeArm', RightLowArm: 'RightForeArm', RightHand: 'RightHand',
  LeftUpLeg: 'LeftUpLeg', LeftHip: 'LeftUpLeg', LeftLeg: 'LeftLeg', LeftKnee: 'LeftLeg', LeftFoot: 'LeftFoot', LeftAnkle: 'LeftFoot', LeftToe: 'LeftToeBase', LeftToeBase: 'LeftToeBase',
  RightUpLeg: 'RightUpLeg', RightHip: 'RightUpLeg', RightLeg: 'RightLeg', RightKnee: 'RightLeg', RightFoot: 'RightFoot', RightAnkle: 'RightFoot', RightToe: 'RightToeBase', RightToeBase: 'RightToeBase' };
const CHAIN = [['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'],
  ['LeftShoulder', 'LeftArm'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightShoulder', 'RightArm'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'],
  ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['LeftFoot', 'LeftToeBase'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['RightFoot', 'RightToeBase']];
window.bvhInfo = (text) => { const r = new BVHLoader().parse(text); return { bones: r.skeleton.bones.map(b => b.name), frames: r.clip.tracks[0] ? r.clip.tracks[0].times.length : 0, dur: r.clip.duration }; };

// returns a GLB (the character with one extra animation named `name`)
window.bvhToClip = async (charB64, bvhText, name) => {
  const bv = new BVHLoader().parse(bvhText);
  const bRoot = new THREE.Group(); bRoot.add(bv.skeleton.bones[0]); bRoot.updateMatrixWorld(true);
  const bb = {}; for (const b of bv.skeleton.bones) { const m = BVH2MIX[b.name.replace(/^mixamorig:?/, '')]; if (m && !bb[m]) bb[m] = b; }
  const missing = CHAIN.flat().filter((n, i, a) => a.indexOf(n) === i && !bb[n] && !/Shoulder|Toe|Spine1|Spine2/.test(n));
  const g = await load(charB64); const tgt = g.scene; tgt.updateMatrixWorld(true);
  const tb = {}; tgt.traverse(o => { if (o.isBone) tb[strip(o.name)] = o; });
  const restLocal = {}; for (const [n, b] of Object.entries(tb)) restLocal[n] = b.quaternion.clone();
  const mixer = new THREE.AnimationMixer(bRoot); mixer.clipAction(bv.clip).play();
  const fps = 30, nF = Math.max(2, Math.round(bv.clip.duration * fps));
  const tracks = {}; const hipsPos = [];
  const wp = b => b.getWorldPosition(V());
  // body frame from hips->spine and left->right hip vectors
  const frame = (hips, sp, l, r) => { const up = sp.clone().sub(hips).normalize(), side = l.clone().sub(r); side.addScaledVector(up, -side.dot(up)).normalize(); const fw = V().crossVectors(side, up).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, fw)); };
  mixer.setTime(0); bRoot.updateMatrixWorld(true);
  const spineB = bb.Spine || bb.Spine1 || bb.Spine2 || bb.Neck;
  const bvhH = Math.max(0.01, wp(bb.Head).y - Math.min(wp(bb.LeftFoot).y, wp(bb.RightFoot).y));
  const tgtH = wp(tb.Head).y - Math.min(wp(tb.LeftFoot).y, wp(tb.RightFoot).y), k = tgtH / bvhH;
  const restT = frame(wp(tb.Hips), wp(tb.Spine), wp(tb.LeftUpLeg), wp(tb.RightUpLeg)), hipsRestW = tb.Hips.getWorldQuaternion(new THREE.Quaternion());
  const hips0 = wp(bb.Hips), tHips0 = tb.Hips.position.clone();
  for (let f = 0; f < nF; f++) {
    mixer.setTime(f / fps); bRoot.updateMatrixWorld(true);
    for (const [n, b] of Object.entries(tb)) b.quaternion.copy(restLocal[n]);
    // root: rotation from the body frame, position scaled
    const fr = frame(wp(bb.Hips), wp(spineB), wp(bb.LeftUpLeg), wp(bb.RightUpLeg));
    const qW = fr.clone().multiply(restT.clone().invert()).multiply(hipsRestW);
    const pq = tb.Hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    tb.Hips.quaternion.copy(pq.multiply(qW));
    const dh = wp(bb.Hips).sub(hips0).multiplyScalar(k);
    hipsPos.push(tHips0.x + dh.x / tgt.scale.x, tHips0.y + dh.y / tgt.scale.y, tHips0.z + dh.z / tgt.scale.z);
    tgt.updateMatrixWorld(true);
    for (const [a, c] of CHAIN) {
      if (a === 'Hips' || !tb[a] || !tb[c]) continue;
      const sa = bb[a] || (a === 'Spine1' || a === 'Spine2' ? null : null), sc2 = bb[c];
      let dir;
      if (sa && sc2) dir = wp(sc2).sub(wp(sa));
      else if (/Spine/.test(a)) dir = wp(bb.Neck).sub(wp(spineB)); // missing spine segments follow the whole spine
      else continue;
      if (dir.lengthSq() < 1e-10) continue; dir.normalize();
      tgt.updateMatrixWorld(true);
      const d0 = wp(tb[c]).sub(wp(tb[a])).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(d0, dir), wq = tb[a].getWorldQuaternion(new THREE.Quaternion()), pq2 = tb[a].parent.getWorldQuaternion(new THREE.Quaternion());
      tb[a].quaternion.copy(pq2.invert().multiply(q.multiply(wq)));
    }
    for (const n of Object.keys(tb)) { if (/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n)) continue; (tracks[n] ||= []).push(...tb[n].quaternion.toArray()); }
  }
  const times = Array.from({ length: nF }, (_, i) => i / fps);
  const kt = Object.entries(tracks).map(([n, v]) => new THREE.QuaternionKeyframeTrack(tb[n].name + '.quaternion', times, v));
  kt.push(new THREE.VectorKeyframeTrack(tb.Hips.name + '.position', times, hipsPos));
  const clip = new THREE.AnimationClip(name, times[times.length - 1], kt);
  for (const [n, b] of Object.entries(tb)) b.quaternion.copy(restLocal[n]);
  tgt.updateMatrixWorld(true);
  const buf = await new GLTFExporter().parseAsync(tgt, { binary: true, animations: [clip] });
  return { b64: bufToB64(buf), frames: nF, dur: +clip.duration.toFixed(2), missing, bvhBones: bv.skeleton.bones.length };
};
// contact sheet of one animation (8 frames) + scores
window.animSheet = async (b64, libB64, clipName, label) => {
  const g = await load(b64); const c = g.animations.find(a => a.name === clipName); const D = c ? c.duration : 1;
  return sheet(b64, libB64, Array.from({ length: 8 }, (_, i) => ({ name: `${clipName}@${(D * i / 7).toFixed(2)}`, clip: clipName, t: D * i / 7 * 0.999 })), label);
};
window.sheetCustom = (b64, libB64, itemsJson) => sheet(b64, libB64, JSON.parse(itemsJson), 'custom');
