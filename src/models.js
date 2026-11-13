import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PARTS } from './humanoid.js';

// physics part -> mixamo bone
export const MAP = { pelvis: 'Hips', torso: 'Spine2', head: 'Head', uArmL: 'LeftArm', lArmL: 'LeftForeArm', uArmR: 'RightArm', lArmR: 'RightForeArm', thighL: 'LeftUpLeg', shinL: 'LeftLeg', thighR: 'RightUpLeg', shinR: 'RightLeg' };
const BONE_TO_PART = Object.fromEntries(Object.entries(MAP).map(([p, b]) => [b, p]));
const EXTRA = { Spine: ['pelvis', 'torso', 0.35], Spine1: ['pelvis', 'torso', 0.7], Neck: ['torso', 'head', 0.5], LeftShoulder: ['torso', null, 0], RightShoulder: ['torso', null, 0], LeftHand: ['lArmL', null, 0], RightHand: ['lArmR', null, 0], LeftFoot: ['shinL', null, 0], RightFoot: ['shinR', null, 0] };
const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const strip = n => n.replace(/^mixamorig\d*[:_]?/, '');

export const Models = { ready: false, types: {}, clips: {}, attack: {} };

const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0), UPV = new THREE.Vector3(0, 1, 0);

function b64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }

// models are embedded as base64, optionally gzipped ('gz:' prefix) to fit the single-file size limit
async function unpack(s) {
  if (!s.startsWith('gz:')) return b64(s);
  const stream = new Blob([b64(s.slice(3))]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}
export function boneMap(root) { const m = {}; root.traverse(o => { if (o.isBone) m[strip(o.name)] = o; }); return m; }

function skinnedBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    for (let k = 0; k < pos.count; k += 7) { v.fromBufferAttribute(pos, k); o.applyBoneTransform(k, v); v.applyMatrix4(o.matrixWorld); box.expandByPoint(v); }
  });
  return box;
}

// Build our 11-part physics rig from the model's joints (meters, root at feet centre)
function rigFromJoints(J, topY) {
  const H = J.Hips, Sp = J.Spine, N = J.Neck, A = J.LeftArm, F = J.LeftForeArm, Hn = J.LeftHand, U = J.LeftUpLeg, K = J.LeftLeg, Ft = J.LeftFoot;
  const lenU = A.distanceTo(F), lenF = F.distanceTo(Hn), lenT = U.distanceTo(K), lenS = K.distanceTo(Ft) + Math.max(0.04, Ft.y * 0.9);
  const w = Math.max(0.85, Math.abs(A.x) / 0.21);
  const bones = [
    ['hips', null, [0, H.y, 0]], ['spine', 'hips', [0, Sp.y - H.y, Sp.z - H.z]], ['neck', 'spine', [0, N.y - Sp.y, N.z - Sp.z]],
    ['shoulderL', 'spine', [Math.abs(A.x), A.y - Sp.y, A.z - Sp.z]], ['elbowL', 'shoulderL', [0, -lenU, 0]],
    ['shoulderR', 'spine', [-Math.abs(A.x), A.y - Sp.y, A.z - Sp.z]], ['elbowR', 'shoulderR', [0, -lenU, 0]],
    ['hipL', 'hips', [Math.abs(U.x), U.y - H.y, U.z - H.z]], ['kneeL', 'hipL', [0, -lenT, 0]],
    ['hipR', 'hips', [-Math.abs(U.x), U.y - H.y, U.z - H.z]], ['kneeR', 'hipR', [0, -lenT, 0]],
  ];
  const torsoH = (N.y - Sp.y) / 2, headR = Math.min(0.15, Math.max(0.1, (topY - N.y) * 0.4));
  const dims = {
    pelvis: { off: [0, 0.02, 0], box: [Math.abs(U.x) + 0.07, 0.1, 0.11 * w] },
    torso: { off: [0, torsoH, 0], box: [Math.abs(A.x) * 0.82, torsoH, 0.12 * w] },
    head: { off: [0, (topY - N.y) * 0.45, 0.01], sphere: headR },
    uArmL: { off: [0, -lenU / 2, 0], box: [0.055 * w, lenU / 2, 0.055 * w] }, uArmR: { off: [0, -lenU / 2, 0], box: [0.055 * w, lenU / 2, 0.055 * w] },
    lArmL: { off: [0, -(lenF + 0.07) / 2, 0], box: [0.05 * w, (lenF + 0.07) / 2, 0.05 * w] }, lArmR: { off: [0, -(lenF + 0.07) / 2, 0], box: [0.05 * w, (lenF + 0.07) / 2, 0.05 * w] },
    thighL: { off: [0, -lenT / 2, 0], box: [0.075 * w, lenT / 2, 0.075 * w] }, thighR: { off: [0, -lenT / 2, 0], box: [0.075 * w, lenT / 2, 0.075 * w] },
    shinL: { off: [0, -lenS / 2, 0], box: [0.06 * w, lenS / 2, 0.06 * w] }, shinR: { off: [0, -lenS / 2, 0], box: [0.06 * w, lenS / 2, 0.06 * w] },
  };
  const parts = PARTS.map(p => { const d = dims[p.name]; const o = { ...p, off: d.off }; delete o.box; delete o.sphere; if (d.sphere) o.sphere = d.sphere; else o.box = d.box; return o; });
  return { bones, parts, hipsY: H.y };
}

export function buildRigSkeleton(rig) {
  const root = new THREE.Object3D(), bones = {};
  for (const [n, par, p] of rig.bones) { const b = new THREE.Object3D(); b.position.set(...p); (par ? bones[par] : root).add(b); bones[n] = b; }
  return { root, bones };
}
export function partsWorld(rigParts, bones, out) {
  for (const d of rigParts) {
    const b = bones[d.bone]; const o = out[d.name] || (out[d.name] = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    o.pos.set(...d.off).applyMatrix4(b.matrixWorld); b.matrixWorld.decompose(_v, o.quat, _s);
  }
  return out;
}

// Close the hands into fists in the template's rest pose. Finger tracks are stripped from clips,
// so fingers stay closed during animations; the first-person body opens them to grab.
// Each finger bends about the axis perpendicular to its direction and the palm normal
// (bind pose: palms face the thighs), so it works whatever the bone roll is.
const FING = ['Index', 'Middle', 'Ring', 'Pinky'];
export function fistPose(scene, bm, amount = 1) {
  const axes = {}, wq = new THREE.Quaternion(), a = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  for (const S of ['Left', 'Right']) {
    const hand = bm[S + 'Hand']; if (!hand || !bm[S + 'HandMiddle1']) continue;
    scene.updateMatrixWorld(true);
    const hips = bm.Hips.getWorldPosition(new THREE.Vector3()), hp = hand.getWorldPosition(new THREE.Vector3());
    const inward = new THREE.Vector3(hips.x - hp.x, 0, hips.z - hp.z).normalize();
    const bend = (b, child, ang) => {
      scene.updateMatrixWorld(true);
      b.getWorldPosition(p0); if (child) child.getWorldPosition(p1); else { b.parent.getWorldPosition(p1); p1.sub(p0).negate().add(p0); }
      d.subVectors(p1, p0).normalize(); n.copy(inward).addScaledVector(d, -inward.dot(d)).normalize();
      a.crossVectors(d, n).normalize(); b.getWorldQuaternion(wq); const al = a.clone().applyQuaternion(wq.invert());
      axes[strip(b.name)] = al; b.rotateOnAxis(al, ang * amount);
    };
    for (const f of FING) for (let i = 1; i <= 3; i++) { const b = bm[S + 'Hand' + f + i]; if (b) bend(b, bm[S + 'Hand' + f + (i + 1)], i === 1 ? 1.45 : 1.6); }
    for (let i = 2; i <= 3; i++) { const b = bm[S + 'HandThumb' + i]; if (b) bend(b, bm[S + 'HandThumb' + (i + 1)], 0.55); }
  }
  scene.updateMatrixWorld(true); return axes;
}
function prepare(scene, hipsTarget) {
  const holder = new THREE.Group(); holder.add(scene);
  const box0 = skinnedBox(holder);
  const bm = boneMap(scene);
  const hips0 = new THREE.Vector3(); bm.Hips.getWorldPosition(hips0);
  const k = hipsTarget / (hips0.y - box0.min.y);
  scene.scale.multiplyScalar(k);
  scene.position.set(-k * hips0.x, -k * box0.min.y, -k * hips0.z);
  holder.updateMatrixWorld(true);
  const box = skinnedBox(holder);
  const J = {}; for (const n of ['Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot']) { J[n] = new THREE.Vector3(); bm[n].getWorldPosition(J[n]); }
  const rig = rigFromJoints(J, box.max.y);
  const curl = fistPose(scene, bm);
  // pose our rig into the model's bind pose
  const sk = buildRigSkeleton(rig); sk.root.updateMatrixWorld(true);
  const aim = (boneName, from, to) => {
    const b = sk.bones[boneName]; b.parent.updateMatrixWorld(true);
    b.parent.matrixWorld.decompose(_v, _pq, _s);
    const d = _v.subVectors(to, from).normalize().applyQuaternion(_pq.clone().invert());
    b.quaternion.setFromUnitVectors(DOWN, d); b.updateMatrixWorld(true);
  };
  const mir = v => new THREE.Vector3(-v.x, v.y, v.z);
  const JR = {}; for (const n of ['RightArm', 'RightForeArm', 'RightHand', 'RightUpLeg', 'RightLeg', 'RightFoot']) { JR[n] = new THREE.Vector3(); bm[n].getWorldPosition(JR[n]); }
  aim('shoulderL', J.LeftArm, J.LeftForeArm); aim('elbowL', J.LeftForeArm, J.LeftHand);
  aim('shoulderR', JR.RightArm, JR.RightForeArm); aim('elbowR', JR.RightForeArm, JR.RightHand);
  aim('hipL', J.LeftUpLeg, J.LeftLeg); aim('kneeL', J.LeftLeg, J.LeftFoot);
  aim('hipR', JR.RightUpLeg, JR.RightLeg); aim('kneeR', JR.RightLeg, JR.RightFoot);
  sk.root.updateMatrixWorld(true);
  const PW = partsWorld(rig.parts, sk.bones, {});
  const off = {}, pb = {}, extra = {};
  const bw = n => { const b = bm[n]; const P = new THREE.Vector3(), Q = new THREE.Quaternion(); b.matrixWorld.decompose(P, Q, _s); return { P, Q }; };
  for (const [part, bone] of Object.entries(MAP)) {
    const { P, Q } = bw(bone), pw = PW[part];
    off[part] = pw.quat.clone().invert().multiply(Q);
    pb[part] = pw.pos.clone().sub(P).applyQuaternion(Q.clone().invert());
  }
  const hp = bw('Hips');
  const hipsOff = hp.P.clone().sub(PW.pelvis.pos).applyQuaternion(PW.pelvis.quat.clone().invert());
  for (const [bone, [a, b2, w]] of Object.entries(EXTRA)) {
    if (!bm[bone]) continue;
    const { Q } = bw(bone);
    extra[bone] = { a, b: b2, w, offA: PW[a].quat.clone().invert().multiply(Q), offB: b2 ? PW[b2].quat.clone().invert().multiply(Q) : null };
  }
  holder.traverse(o => { if (o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  return { template: holder, rig, off, pb, hipsOff, extra, height: box.max.y, curl };
}

export async function loadModels(data, hipsTargets) {
  const L = new GLTFLoader();
  for (const [type, s] of Object.entries(data)) {
    try {
      const gl = await L.parseAsync(await unpack(s), '');
      let skinned = false; gl.scene.traverse(o => { if (o.isSkinnedMesh) skinned = true; });
      if (!skinned) { for (const c of gl.animations) Models.clips[c.name] = c; continue; } // clip library
      Models.types[type] = prepare(gl.scene, hipsTargets[type] || 0.98);
      if (gl.animations.length) Models.types[type].own = Object.fromEntries(gl.animations.map(c => [c.name, c]));
    } catch (e) { console.warn('model load failed', type, e); }
  }
  // prune clips per type and find punch impact frames
  const refProf = Models.types.quick || Object.values(Models.types)[0];
  const refHips = refProf ? boneMap(refProf.template).Hips.position.length() : 1;
  for (const [type, prof] of Object.entries(Models.types)) {
    const names = new Set(); prof.template.traverse(o => { if (o.isBone) names.add(o.name); });
    const myHips = boneMap(prof.template).Hips.position.length();
    prof.clips = {};
    for (const [n, c] of Object.entries(prof.own || Models.clips)) {
      const cc = c.clone(); cc.tracks = cc.tracks.filter(t => names.has(t.name.split('.')[0]) && !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(t.name));
      cc.tracks = cc.tracks.filter(t => !t.name.endsWith('.position') || (n === 'Getting_Up' && /Hips\.position$/.test(t.name)));
      if (!prof.own) for (const t of cc.tracks) if (t.name.endsWith('.position')) { t.values = t.values.slice(); for (let i = 0; i < t.values.length; i++) t.values[i] *= myHips / refHips; }
      prof.clips[n] = cc;
    }
    if (prof.clips.Getting_Up) {
      const inst = SkeletonUtils.clone(prof.template), bm = boneMap(inst);
      const mx = new THREE.AnimationMixer(inst); mx.clipAction(prof.clips.Getting_Up).play(); mx.setTime(0.001); inst.updateMatrixWorld(true);
      const hp = new THREE.Vector3(), hd = new THREE.Vector3(); bm.Hips.getWorldPosition(hp); bm.Head.getWorldPosition(hd);
      prof.getup = { a0: Math.atan2(hd.x - hp.x, hd.z - hp.z), off: new THREE.Vector3(hp.x, 0, hp.z) };
    }
  }
  const any = Models.types.brawler || Object.values(Models.types)[0];
  if (any) {
    const inst = SkeletonUtils.clone(any.template), bm = boneMap(inst);
    for (const n of ['Punching', 'Hook_Punch']) {
      const clip = any.clips[n]; if (!clip) continue;
      const mx = new THREE.AnimationMixer(inst); const act = mx.clipAction(clip); act.play();
      let best = { t: clip.duration * 0.4, side: 'R', d: -1 };
      for (let t = 0; t < clip.duration; t += 1 / 30) {
        mx.setTime(t); inst.updateMatrixWorld(true);
        for (const side of ['L', 'R']) {
          const h = bm[side === 'L' ? 'LeftHand' : 'RightHand']; h.getWorldPosition(_v);
          if (_v.z > best.d) best = { t, side, d: _v.z };
        }
      }
      Models.attack[n] = best;
    }
  }
  Models.ready = Object.keys(Models.types).length > 0;
  return Models;
}

export function instance(type) {
  const prof = Models.types[type]; if (!prof) return null;
  const model = SkeletonUtils.clone(prof.template);
  const mats = [];
  model.traverse(o => { if (o.isSkinnedMesh) { o.material = o.material.clone(); mats.push(o.material); o.castShadow = true; o.frustumCulled = false; } });
  return { model, bones: boneMap(model), mats, prof, modelKey: type };
}

// write bone rotations from physics-part world transforms
export function writeBones(inst, parts) {
  const prof = inst.prof, B = inst.bones;
  inst.model.updateMatrixWorld(false);
  const sceneRoot = B.Hips.parent; sceneRoot.updateWorldMatrix(true, false);
  for (const name of ORDER) {
    const b = B[name]; if (!b) continue;
    const part = BONE_TO_PART[name];
    if (part) _q.copy(parts[part].quat).multiply(prof.off[part]);
    else {
      const ex = prof.extra[name]; if (!ex) continue;
      _q.copy(parts[ex.a].quat).multiply(ex.offA);
      if (ex.b) { _q2.copy(parts[ex.b].quat).multiply(ex.offB); _q.slerp(_q2, ex.w); }
    }
    b.parent.matrixWorld.decompose(_v, _pq, _s);
    b.quaternion.copy(_pq.invert()).multiply(_q);
    if (name === 'Hips') {
      _v.copy(prof.hipsOff).applyQuaternion(parts.pelvis.quat).add(parts.pelvis.pos);
      b.position.copy(b.parent.worldToLocal(_v));
    }
    b.updateWorldMatrix(false, false);
  }
}

// read part world transforms from (animated) bones
export function readParts(inst, parts) {
  const prof = inst.prof, B = inst.bones;
  inst.model.updateMatrixWorld(true);
  for (const [part, bone] of Object.entries(MAP)) {
    const b = B[bone]; if (!b) continue;
    const o = parts[part];
    b.matrixWorld.decompose(o.pos, _q, _s);
    o.quat.copy(_q).multiply(_q2.copy(prof.off[part]).invert());
    o.pos.add(_v.copy(prof.pb[part]).applyQuaternion(_q));
  }
}
