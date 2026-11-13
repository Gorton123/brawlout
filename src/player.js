import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PARTS, BONES, buildSkeleton, buildPartMesh } from './humanoid.js';
import { Prop, GRIPS } from './props.js';
import { Models, instance, writeBones, buildRigSkeleton, partsWorld } from './models.js';

const UP = new THREE.Vector3(0, 1, 0);
const ZONE = Object.fromEntries(PARTS.map(p => [p.name, p.zone]));
export const LABEL = Object.fromEntries(PARTS.map(p => [p.name, p.label]));
const L1 = 0.45, L2 = 0.42;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9a77f, roughness: 0.55 });
const wrapMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.95 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.92 });

class Arm {
  constructor(player, side) {
    this.player = player; this.side = side; this.key = side < 0 ? 'L' : 'R';
    this.S = new THREE.Vector3(side * 0.25, -0.33, -0.05);
    this.REST = new THREE.Vector3(side * 0.19, -0.23, -0.44);
    this.pos = this.REST.clone(); this.target = this.REST.clone();
    this.state = 'idle'; this.t = 0; this.dur = 0; this.curl = 1; this.roll = 0;
    this.prop = null; this.hold = null; this.reach = null; this.bloody = 0;
    const cam = player.game.camera;
    this.upper = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 1, 12), sleeveMat);
    this.fore = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 1, 12), skinMat);
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.08, 12), sleeveMat);
    this.group = new THREE.Group();
    this.wrapMat = wrapMat.clone();
    this.buildHand(skinMat);
    for (const m of [this.upper, this.fore, this.cuff, this.group]) cam.add(m);
    this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Sphere(0.04), collisionFilterGroup: 8, collisionFilterMask: 0 });
    this.body.collisionResponse = false;
    player.game.world.addBody(this.body);
    this.world = new THREE.Vector3();
  }
  get busy() { return this.state !== 'idle'; }
  // five-finger hand: wrapped palm + knuckles, three-segment fingers, thumb. Curls with this.curl.
  buildHand(skin) {
    const side = this.side, wrap = this.wrapMat;
    const g = this.handG = new THREE.Group(); this.group.add(g);
    const cap = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.rotation.x = Math.PI / 2; m.position.z = -len / 2; return m; };
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.04, 0.088, 5, 0.019), wrap); palm.position.z = -0.004; g.add(palm);
    const knuck = new THREE.Mesh(new RoundedBoxGeometry(0.088, 0.03, 0.026, 2, 0.011), wrap); knuck.position.set(0, 0.004, -0.043); g.add(knuck);
    this.fingers = [];
    const L = [[0.027, 0.019, 0.016], [0.03, 0.021, 0.017], [0.028, 0.02, 0.016], [0.022, 0.016, 0.014]]; // index..pinky
    for (let i = 0; i < 4; i++) {
      const r = i === 3 ? 0.0082 : 0.0093, [l1, l2, l3] = L[i];
      const f = new THREE.Group(); f.position.set(side * (0.029 - i * 0.0195), 0, -0.05); f.add(cap(r, l1, skin));
      const j = new THREE.Group(); j.position.z = -l1 - r * 0.6; f.add(j); j.add(cap(r * 0.95, l2, skin));
      const k = new THREE.Group(); k.position.z = -l2 - r * 0.6; j.add(k); k.add(cap(r * 0.9, l3, skin));
      f.userData.j = j; f.userData.k = k; g.add(f); this.fingers.push(f);
    }
    this.thumb = new THREE.Group(); this.thumb.position.set(side * 0.04, -0.008, -0.004); g.add(this.thumb);
    this.thumb.add(cap(0.011, 0.026, skin));
    const t2 = new THREE.Group(); t2.position.z = -0.032; this.thumb.add(t2); t2.add(cap(0.0105, 0.02, skin)); this.thumb.userData.j = t2;
    this.group.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  useModel() {
    // the real model drives the arms; the five-finger hand rides on the model's wrist (FPBody.solveArm)
    this.modelArms = true;
    for (const m of [this.upper, this.fore, this.cuff]) m.visible = false;
    this.glove = null;
    this.handG.scale.setScalar(1.2); this.handG.position.z = -0.01; // match the model's forearm thickness
  }
  setVisible(v) {
    if (this.modelArms) { this.group.visible = v; if (this.player.fp) this.player.fp.show(v); return; }
    for (const m of [this.upper, this.fore, this.cuff, this.group]) m.visible = v;
  }
  seg(mesh, a, b) {
    _a.subVectors(b, a); const len = _a.length();
    mesh.position.copy(a).addScaledVector(_a, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, _a.normalize());
    mesh.scale.set(1, len, 1);
  }
  update(dt) {
    const k = 1 - Math.exp(-dt * 30);
    this.pos.lerp(this.target, this.state === 'punch' ? 1 : k);
    // IK
    const S = this.S; const H = _b.copy(this.pos);
    const d0 = _a.subVectors(H, S).length();
    const d = Math.min(Math.max(d0, 0.12), L1 + L2 - 0.002);
    const dir = _a.normalize();
    if (d0 > d) H.copy(S).addScaledVector(dir, d);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pole = _c.set(this.side * 0.9, -1, 0.25);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = _d.copy(S).addScaledVector(dir, a).addScaledVector(pole, h);
    this.seg(this.upper, S, E);
    this.seg(this.fore, E, H);
    this.cuff.position.copy(E).lerp(H, 0.18); this.cuff.quaternion.copy(this.fore.quaternion);
    // hand orientation
    const fd = _a.subVectors(H, E).normalize();
    const z = _c.copy(fd).negate();
    const x = new THREE.Vector3().crossVectors(UP, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    _m.makeBasis(x, y, z);
    this.group.position.copy(H);
    this.group.quaternion.setFromRotationMatrix(_m);
    this.group.rotateZ(this.roll);
    const cu = this.prop ? 1 : this.state === 'reach' ? 0.1 : this.curl;
    for (const f of this.fingers) { f.rotation.x = -1.5 * cu; f.userData.j.rotation.x = -1.65 * cu; if (f.userData.k) f.userData.k.rotation.x = -1.2 * cu; }
    this.thumb.rotation.set(-0.5 * cu, -this.side * (0.35 + 0.55 * cu), 0); if (this.thumb.userData.j) this.thumb.userData.j.rotation.x = -0.6 * cu;
    this.wrapMat.color.setRGB(0.62 - this.bloody * 0.3, 0.57 - this.bloody * 0.5, 0.48 - this.bloody * 0.42);
    this.group.getWorldPosition(this.world);
  }
}

// weapon in one hand + enemy grabbed with the other = execution
const SM = (name, wear) => ({ name, kind: 'smash', wear, dur: 0.78 });
export const WEXEC = {
  bottle: { head: SM('BOTTLE SMASH', 'broken'), body: SM('BOTTLE SMASH', 'broken') },
  broken: { head: { name: 'NECK STAB', kind: 'stab', dur: 0.75 }, body: { name: 'GUT STAB', kind: 'stab', dur: 0.75 } },
  sword: { head: { name: 'BEHEADED', kind: 'slash', behead: true, dur: 0.85 }, body: { name: 'IMPALED', kind: 'stab', impale: true, dur: 1.1 } },
  spear: { head: { name: 'SKEWERED', kind: 'stab', impale: true, dur: 1.1 }, body: { name: 'IMPALED', kind: 'stab', impale: true, dur: 1.1 } },
  cue: { head: SM('CUE BREAKER', 'halfcue'), body: { name: 'CUE SPEAR', kind: 'stab', dur: 0.75 } },
  halfcue: { head: { name: 'SPLINTER STAB', kind: 'stab', dur: 0.75 }, body: { name: 'SPLINTER STAB', kind: 'stab', impale: true, dur: 1.2 } },
  stool: { head: SM('STOOL SMASH', 'gone'), body: SM('STOOL SMASH', 'gone') },
  cash: { head: SM('MONEY SHOT', 'gone'), body: SM('MONEY SHOT', 'gone') },
  rock: { head: SM('MOON ROCK', 'gone'), body: SM('MOON ROCK', 'gone') },
  bat: { head: SM('HOME RUN', null), body: SM('BAT TO THE RIBS', null) },
  crowbar: { head: SM('CROWBARRED', null), body: { name: 'PRISED OPEN', kind: 'stab', dur: 0.75 } },
  wrench: { head: SM('SPANNERED', null), body: SM('TIGHTENED UP', null) },
  pipe: { head: SM('PIPE DOWN', null), body: SM('PIPE DOWN', null) },
};
export function wexecSpec(type, zone) { const X = WEXEC[type]; return X ? (zone === 'head' ? X.head : X.body) : null; }
const TWO_HANDED = new Set(['cue', 'stool', 'halfcue', 'spear']);
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
const strip = n => n.replace(/^mixamorig\d*[:_]?/, '');
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _wq = new THREE.Quaternion(), _wq2 = new THREE.Quaternion(), _dq = new THREE.Quaternion();
function aimBone(bone, child, target) {
  bone.getWorldPosition(_w1); child.getWorldPosition(_w2);
  _w2.sub(_w1).normalize(); _w3.copy(target).sub(_w1).normalize();
  if (_w2.lengthSq() < 1e-8 || _w3.lengthSq() < 1e-8) return;
  _dq.setFromUnitVectors(_w2, _w3);
  bone.getWorldQuaternion(_wq); _wq.premultiply(_dq);
  bone.parent.getWorldQuaternion(_wq2);
  bone.quaternion.copy(_wq2.invert().multiply(_wq));
  bone.updateWorldMatrix(false, true);
}
// First-person body: the real player model, animated by Mixamo clips, arms driven by IK to the hand targets
class FPBody {
  constructor(player) {
    this.player = player; const g = player.game;
    this.inst = instance(Models.types.hero ? 'hero' : 'quick');
    this.noTwistBones = !!Models.types.hero;
    this.model = this.inst.model; g.scene.add(this.model);
    if (!Models.types.hero) for (const m of this.inst.mats) m.color.setRGB(0.75, 0.78, 0.95);
    this.B = this.inst.bones;
    // first person: don't draw the body close to the camera (hood, neck, chest when looking down)
    this.clip = { value: 0.3 };
    for (const mat of this.inst.mats) {
      mat.onBeforeCompile = sh => {
        sh.uniforms.uClipR = this.clip;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vClipW;').replace('#include <project_vertex>', '#include <project_vertex>\nvClipW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vClipW;\nuniform float uClipR;').replace('void main() {', 'void main() {\n  if (uClipR > 0.0 && distance(vClipW, cameraPosition) < uClipR) discard;');
      };
      mat.customProgramCacheKey = () => 'fpclip'; mat.needsUpdate = true;
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.acts = {};
    const upper = /(Hips|Spine|Neck|Head|Shoulder|Arm|ForeArm|Hand)/;
    for (const [n, c] of Object.entries(this.inst.prof.clips)) {
      const cc = c.clone(); cc.tracks = cc.tracks.filter(t => !upper.test(t.name.split('.')[0].replace('mixamorig', '')) || /UpLeg/.test(t.name));
      this.acts[n] = this.mixer.clipAction(cc);
    }
    this.cur = null; this.play('Fighting_Idle');
    this.fingers = { L: [], R: [] };
    for (const side of ['L', 'R']) for (const f of FINGERS) for (let i = 1; i <= 3; i++) {
      const b = this.B[(side === 'L' ? 'Left' : 'Right') + 'Hand' + f + i]; if (b) this.fingers[side].push({ b, rest: b.quaternion.clone(), i });
    }
    const th = side => [1, 2, 3].map(i => this.B[(side === 'L' ? 'Left' : 'Right') + 'HandThumb' + i]).filter(Boolean).map(b => ({ b, rest: b.quaternion.clone() }));
    this.thumbs = { L: th('L'), R: th('R') };
    this.hipsBind = this.B.Hips.position.clone();
    this.visible = true;
    // palm direction in each hand's local frame (bind A-pose: palms face the thighs)
    this.model.updateMatrixWorld(true);
    this.palm = {};
    for (const [side, pre, sx] of [['L', 'Left', -1], ['R', 'Right', 1]]) {
      const h = this.B[pre + 'Hand']; if (!h) continue;
      const q = h.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.palm[side] = new THREE.Vector3(sx, 0, 0).applyQuaternion(q);
    }
  }
  play(n, rate = 1) {
    const a = this.acts[n]; if (!a) return;
    if (this.cur === n) { a.setEffectiveTimeScale(rate); return; }
    const p = this.cur && this.acts[this.cur];
    a.reset(); a.setEffectiveTimeScale(rate); a.play(); if (p) p.crossFadeTo(a, 0.25, false);
    this.cur = n;
  }
  update(dt) {
    const P = this.player, g = P.game, cam = g.camera, B = this.B;
    const sp = Math.hypot(P.vel.x, P.vel.z);
    const lat = P.vel.x * P.r.x + P.vel.z * P.r.z, fw = P.vel.x * P.f.x + P.vel.z * P.f.z;
    if (sp < 0.4) this.play('Fighting_Idle');
    else if (Math.abs(lat) > Math.abs(fw)) this.play(lat > 0 ? 'Walk_Strafe_Right' : 'Walk_Strafe_Left', Math.min(1.8, sp / 1.6));
    else this.play('Walking', Math.min(2, sp / 1.4) * (fw < 0 ? -1 : 1));
    const m = this.model;
    m.position.set(P.pos.x - P.f.x * 0.1, -0.03, P.pos.z - P.f.z * 0.1);
    m.rotation.set(0, P.yaw + Math.PI, 0);
    B.Hips.position.copy(this.hipsBind);
    this.mixer.update(dt);
    const tp = !!g.tpActive;
    if (B.Head) B.Head.scale.setScalar(tp ? 1 : 0.001);
    this.clip.value = tp ? 0 : 0.3;
    // first person: the shoulders sit behind the camera, so lengthen the arm bones to let punches reach out in front
    const ARM = tp ? 1 : 1.18;
    for (const n of ['LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand']) { const b = B[n]; if (!b) continue; if (!b.userData.bind) b.userData.bind = b.position.clone(); b.position.copy(b.userData.bind).multiplyScalar(ARM); }
    // first person shows the five-finger code hand on the wrist; the model's own (fused-finger) hand is hidden
    for (const h of [B.LeftHand, B.RightHand]) if (h) h.scale.setScalar(tp ? 1 : 0.001);
    // torso twist into punches / lean
    let tw = 0;
    for (const a of Object.values(P.arms)) if (a.state === 'punch') { const k = a.t / a.dur; tw += -a.side * 0.16 * (k < 0.35 ? k / 0.35 : Math.max(0, 1 - (k - 0.35) / 0.65)); }
    m.updateMatrixWorld(true);
    if (B.Spine1 && tw) { _dq.setFromAxisAngle(_w1.set(0, 1, 0), tw); B.Spine1.getWorldQuaternion(_wq).premultiply(_dq); B.Spine1.parent.getWorldQuaternion(_wq2); B.Spine1.quaternion.copy(_wq2.invert().multiply(_wq)); B.Spine1.updateWorldMatrix(false, true); }
    for (const arm of Object.values(P.arms)) this.solveArm(arm);
  }
  solveArm(arm) {
    const P = this.player, cam = P.game.camera, side = arm.key;
    const pre = side === 'L' ? 'Left' : 'Right';
    const A = this.B[pre + 'Arm'], F = this.B[pre + 'ForeArm'], H = this.B[pre + 'Hand'];
    if (!A || !F || !H) return;
    // hand target (camera space -> world). Idle/punch targets are remapped to the model's real arm reach
    const t = new THREE.Vector3().copy(arm.pos);
    if (!arm.support && !arm.prop && (arm.state === 'idle' || arm.state === 'punch' || arm.state === 'recover')) { t.x *= 0.95; t.y += 0.14; if (arm.state !== 'punch') t.z *= 0.75; }
    else if (!arm.support && (arm.state === 'idle' || arm.state === 'punch' || arm.state === 'recover')) { t.x *= 0.85; t.z = t.z * 0.82; t.y += 0.1; }
    t.applyMatrix4(cam.matrixWorld);
    const S = A.getWorldPosition(new THREE.Vector3()), E0 = F.getWorldPosition(new THREE.Vector3()), H0 = H.getWorldPosition(new THREE.Vector3());
    const l1 = S.distanceTo(E0), l2 = E0.distanceTo(H0);
    const dir = t.clone().sub(S); let d = dir.length(); dir.normalize();
    d = Math.min(Math.max(d, 0.08), (l1 + l2) * 0.999);
    const Ht = S.clone().addScaledVector(dir, d);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pole = new THREE.Vector3(arm.side * 0.9, -1, 0.3).applyQuaternion(cam.quaternion);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, a).addScaledVector(pole, h);
    aimBone(A, F, E); aimBone(F, H, Ht);
    // twist the forearm so the palm faces the right way (fist knuckles forward, open palm toward a grab)
    if (this.palm[side]) {
      const st = arm.state;
      const pd = (st === 'reach' || st === 'hold' || st === 'lift' || arm.support) ? new THREE.Vector3(-arm.side * 0.35, -0.35, -0.85) : st === 'punch' && !arm.prop ? new THREE.Vector3(-arm.side * 0.3, -1, 0.1) : new THREE.Vector3(-arm.side * 0.9, -0.45, 0.15);
      pd.normalize().applyQuaternion(cam.quaternion);
      const fp = F.getWorldPosition(new THREE.Vector3()), hp = H.getWorldPosition(new THREE.Vector3());
      const axis = hp.sub(fp).normalize();
      const cur = this.palm[side].clone().applyQuaternion(H.getWorldQuaternion(new THREE.Quaternion()));
      cur.addScaledVector(axis, -cur.dot(axis)); pd.addScaledVector(axis, -pd.dot(axis));
      if (cur.lengthSq() > 1e-6 && pd.lengthSq() > 1e-6) {
        cur.normalize(); pd.normalize();
        let ang = Math.acos(Math.max(-1, Math.min(1, cur.dot(pd))));
        if (new THREE.Vector3().crossVectors(cur, pd).dot(axis) < 0) ang = -ang;
        if (this.noTwistBones) ang = 0; // auto-rigged models have no twist bones: twisting the forearm wrings the skin like a rope (the first-person hand is oriented on its own)
        _dq.setFromAxisAngle(axis, ang);
        F.getWorldQuaternion(_wq); _wq.premultiply(_dq);
        F.parent.getWorldQuaternion(_wq2); F.quaternion.copy(_wq2.invert().multiply(_wq));
        F.updateWorldMatrix(false, true);
      }
    }
    // fingers curl into a fist / open to grab
    // rest pose is a fist (models.js fistPose); open the hand as arm.curl drops toward 0 (reaching to grab)
    const AXS = this.inst.prof.curl || {};
    const open = arm.prop ? 0.25 : arm.state === 'reach' ? 1 : Math.max(0, Math.min(1, 1 - arm.curl));
    for (const f of this.fingers[side]) { const ax = AXS[strip(f.b.name)]; if (ax) f.b.quaternion.copy(f.rest).multiply(_dq.setFromAxisAngle(ax, -open * (f.i === 1 ? 1.35 : 1.5))); }
    for (const f of this.thumbs[side]) { const ax = AXS[strip(f.b.name)]; if (ax) f.b.quaternion.copy(f.rest).multiply(_dq.setFromAxisAngle(ax, -open * 0.5)); }
    H.updateWorldMatrix(false, true);
    // move the (invisible) code hand anchor onto the real hand so held props follow it
    H.getWorldPosition(_w1);
    const hl = cam.worldToLocal(_w1.clone());
    const el = cam.worldToLocal(F.getWorldPosition(new THREE.Vector3()));
    arm.group.position.copy(hl);
    let z = el.sub(hl).normalize(); // points back along the forearm (local +Z)
    if (arm.prop) { const wy = arm.weaponYaw || 0, wp = arm.weaponPitch || 0; z = new THREE.Vector3(Math.sin(-wy) * Math.cos(wp), -Math.sin(wp), Math.cos(-wy) * Math.cos(wp)).normalize();  }
    let x, y;
    if (arm.prop) { x = new THREE.Vector3().crossVectors(UP, z).normalize(); y = new THREE.Vector3().crossVectors(z, x); }
    else {
      // back of the fist faces up and slightly out (guard), turning palm-down as the punch extends
      y = new THREE.Vector3(arm.side * 0.45, 1, 0.35); y.addScaledVector(z, -y.dot(z)).normalize();
      x = new THREE.Vector3().crossVectors(y, z).normalize();
    }
    arm.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    if (arm.prop) arm.group.rotateZ(arm.roll);
    arm.world.copy(_w1);
  }
  show(v) { this.model.visible = v; }
}

// full-body animated character for the over-the-shoulder camera (legs: locomotion, upper body: fight layer)
const UPPER = /(Spine|Neck|Head|Shoulder|Arm|ForeArm|Hand)/;
class TPBody {
  constructor(player) {
    this.player = player; const g = player.game;
    this.inst = instance(Models.types.hero ? 'hero' : 'quick'); this.model = this.inst.model; g.scene.add(this.model);
    if (!Models.types.hero) for (const m of this.inst.mats) { m.color.setRGB(0.55, 0.75, 1.25); m.emissive && m.emissive.setRGB(0.02, 0.04, 0.09); }
    this.B = this.inst.bones; this.model.visible = false;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.lo = {}; this.up = {};
    const bn = t => t.name.split('.')[0].replace('mixamorig', '').replace(':', '');
    for (const [n, c] of Object.entries(this.inst.prof.clips)) {
      const a = c.clone(); a.tracks = a.tracks.filter(t => !UPPER.test(bn(t)) || /UpLeg/.test(bn(t)));
      const b = c.clone(); b.tracks = b.tracks.filter(t => UPPER.test(bn(t)) && !/UpLeg/.test(bn(t)));
      this.lo[n] = this.mixer.clipAction(a); this.up[n] = this.mixer.clipAction(b);
    }
    this.curL = null; this.curU = null; this.uT = 0; this.uDur = 0;
    this.playL('Fighting_Idle'); this.playU('Fighting_Idle');
    this.hipsBind = this.B.Hips.position.clone();
    // weapon grip on the right hand
    this.grip = new THREE.Group(); (this.B.RightHand || this.model).add(this.grip);
    this.grip.position.set(0, 9, 3); this.grip.rotation.set(Math.PI / 2, 0, 0);
    const hs = new THREE.Vector3(); (this.B.RightHand || this.model).getWorldScale(hs); this.grip.scale.setScalar(1 / (hs.x || 1));
    this.model.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); (this.B.RightHand || this.model).getWorldScale(ws);
    this.grip.scale.setScalar(1 / (ws.x || 1)); this.grip.position.set(0, 0.085 / (ws.x || 1), 0.025 / (ws.x || 1));
  }
  playL(n, rate = 1) {
    const a = this.lo[n]; if (!a) return;
    if (this.curL === n) { a.setEffectiveTimeScale(rate); return; }
    const p = this.curL && this.lo[this.curL];
    a.reset(); a.setEffectiveTimeScale(rate); a.play(); if (p) p.crossFadeTo(a, 0.22, false);
    this.curL = n;
  }
  playU(n, rate = 1, once = false) {
    const a = this.up[n]; if (!a) return;
    const p = this.curU && this.up[this.curU];
    if (this.curU === n && !once) return;
    a.reset(); a.setEffectiveTimeScale(rate); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.play();
    if (p && p !== a) p.crossFadeTo(a, once ? 0.08 : 0.2, false);
    this.curU = n; this.uT = 0; this.uDur = once ? a.getClip().duration / rate : 0;
  }
  show(v) { this.model.visible = v; }
  update(dt) {
    const P = this.player, B = this.B;
    const sp = Math.hypot(P.vel.x, P.vel.z);
    const lat = P.vel.x * P.r.x + P.vel.z * P.r.z, fw = P.vel.x * P.f.x + P.vel.z * P.f.z;
    if (sp < 0.35) this.playL('Fighting_Idle');
    else if (Math.abs(lat) > Math.abs(fw) * 1.2) this.playL(lat > 0 ? 'Walk_Strafe_Right' : 'Walk_Strafe_Left', Math.min(2.2, sp / 1.5));
    else this.playL('Walking', Math.min(2.6, sp / 1.3) * (fw < 0 ? -1 : 1));
    // fight layer
    for (const a of Object.values(P.arms)) if ((a.state === 'punch' || a.state === 'parry') && a.t <= dt * 1.5 + 1e-4) this.playU(a.state === 'parry' ? 'Hit_To_Body' : a.side > 0 ? 'Punching' : 'Hook_Punch', a.state === 'parry' ? 2.4 : a.side > 0 ? 2.0 : 2.6, true);
    if (P.lastHurt < 0.02 && this.curU !== 'Head_Hit') this.playU('Head_Hit', 1.8, true);
    if (P.wexec && this.curU !== 'Punching' && P.wexec.impact === false && P.wexec.t > P.wexec.spec.dur * 0.3) this.playU('Punching', 1.2, true);
    this.uT += dt;
    if (this.uDur && this.uT > this.uDur - 0.1) this.playU('Fighting_Idle');
    const m = this.model;
    m.position.set(P.pos.x, -0.02, P.pos.z);
    m.rotation.set(0, P.yaw + Math.PI, 0);
    this.mixer.update(dt);
    B.Hips.position.x = this.hipsBind.x; B.Hips.position.z = this.hipsBind.z;
    // lean the spine toward where the camera aims
    if (B.Spine1) B.Spine1.rotation.x += -P.pitch * 0.35;
  }
}

class PlayerBody {
  constructor(game) {
    this.game = game;
    const sk = buildSkeleton(1, 1.05);
    this.root = sk.root; this.bones = sk.bones;
    const look = { shirt: 0x2b2b30, pants: 0x1c1c20, skin: 0xd9a77f, hair: 0x1a1410, hairStyle: 'short', beard: false, wraps: true, hood: true, sleeve: 'long', shoes: 0x151515 };
    this.parts = PARTS.map(def => {
      const mesh = buildPartMesh(def, look, 1, 1.05); mesh.visible = false; game.scene.add(mesh);
      return { mesh, bone: this.bones[def.bone], off: new THREE.Vector3(...def.off) };
    });
    this.rot = {}; for (const [n] of BONES) this.rot[n] = new THREE.Vector3();
  }
  show(v) {
    if (v && !this.model && Models.ready && Models.types.quick) {
      this.inst = instance(Models.types.hero ? 'hero' : 'quick');
      if (this.inst) {
        this.model = this.inst.model; this.game.scene.add(this.model);
        const sk = buildRigSkeleton(this.inst.prof.rig); this.root = sk.root; this.bones = sk.bones;
        this.hipsY = this.inst.prof.rig.hipsY; this.pw = {};
        if (!Models.types.hero) for (const m of this.inst.mats) m.color.setRGB(0.75, 0.78, 0.95);
      }
    }
    if (this.model) { this.model.visible = v; for (const p of this.parts) p.mesh.visible = false; }
    else for (const p of this.parts) p.mesh.visible = v;
  }
  pose(pos, yaw, tgt, dt) {
    if (this.model) {
      this.root.position.copy(pos); this.root.rotation.set(0, yaw + Math.PI, 0);
      const a = 1 - Math.exp(-dt * 14);
      for (const n in this.rot) { const t = tgt[n] || [0, 0, 0]; this.rot[n].x += (t[0] - this.rot[n].x) * a; this.rot[n].y += ((t[1] || 0) - this.rot[n].y) * a; this.rot[n].z += ((t[2] || 0) - this.rot[n].z) * a; this.bones[n].rotation.set(this.rot[n].x, this.rot[n].y, this.rot[n].z); }
      this.root.updateMatrixWorld(true);
      partsWorld(this.inst.prof.rig.parts, this.bones, this.pw);
      this.model.position.copy(pos);
      writeBones(this.inst, this.pw);
      return;
    }
    this.root.position.copy(pos); this.root.rotation.set(0, yaw + Math.PI, 0);
    const a = 1 - Math.exp(-dt * 14);
    for (const n in this.rot) { const t = tgt[n] || [0, 0, 0]; this.rot[n].x += (t[0] - this.rot[n].x) * a; this.rot[n].y += ((t[1] || 0) - this.rot[n].y) * a; this.rot[n].z += ((t[2] || 0) - this.rot[n].z) * a; this.bones[n].rotation.set(this.rot[n].x, this.rot[n].y, this.rot[n].z); }
    this.root.updateMatrixWorld(true);
    for (const p of this.parts) {
      p.mesh.position.copy(p.off).applyMatrix4(p.bone.matrixWorld);
      p.bone.matrixWorld.decompose(_a, p.mesh.quaternion, _b);
    }
  }
}

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 2.5);
    this.yaw = 0; this.pitch = -0.05; this.vel = new THREE.Vector3(); this.lunge = new THREE.Vector3();
    this.hp = 100; this.focus = 100; this.dead = false;
    this.invuln = 0; this.dodgeT = 0; this.dodgeCd = 0; this.dodgeDir = new THREE.Vector3(); this.lastHurt = 99;
    this.combo = 0; this.comboT = 0; this.lastSide = 0;
    this.focusActive = false; this.ret = new THREE.Vector2(); this.hover = null; this.beatT = 0;
    this.lift = null; this.bob = 0; this.kick = new THREE.Vector2(); this.parryT = 0; this.parryCd = 0;
    this.arms = { L: new Arm(this, -1), R: new Arm(this, 1) };
    this.body = new PlayerBody(game);
    this.f = new THREE.Vector3(); this.r = new THREE.Vector3();
  }
  other(arm) { return arm === this.arms.L ? this.arms.R : this.arms.L; }

  reset() {
    this.pos.set(0, 0, 2.5); this.yaw = 0; this.pitch = -0.05; this.vel.set(0, 0, 0);
    this.hp = 100; this.focus = 100; this.dead = false; this.lift = null; this.focusActive = false; this.hug = null; this.wexec = null;
    for (const a of Object.values(this.arms)) { this.releaseArm(a); if (a.prop) { a.prop.destroy(); a.prop = null; } a.state = 'idle'; a.bloody = 0; }
  }

  // --------------- camera basis ---------------
  basis() {
    this.f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
  camLocalToWorld(v, out) { return out.copy(v).applyMatrix4(this.game.camera.matrixWorld); }
  worldToCamLocal(v, out) { return this.game.camera.worldToLocal(out.copy(v)); }

  update(I, dtR, ws) {
    const g = this.game;
    const pdt = dtR * (0.42 + 0.58 * ws);
    this.basis();
    // ---------- look ----------
    if (!this.focusActive) {
      this.yaw -= I.lookX + I.padLookX * 2.7 * dtR;
      this.pitch -= I.lookY + I.padLookY * 2.0 * dtR;
    } else {
      this.ret.x += I.lookX * 1.4 + I.padLookX * 1.8 * dtR;
      this.ret.y -= I.lookY * 1.4 + I.padLookY * 1.8 * dtR;
      for (const ax of ['x', 'y']) {
        const v = this.ret[ax];
        if (Math.abs(v) > 0.8) {
          const ex = v - Math.sign(v) * 0.8;
          if (ax === 'x') this.yaw -= ex * 1.6 * dtR * 4; else this.pitch += ex * 1.2 * dtR * 4;
          this.ret[ax] = Math.sign(v) * Math.min(0.9, Math.abs(v));
        }
      }
    }
    if (this.lift) {
      const tp = this.lift.phase === 'exec' && this.lift.t > 0.3 ? -0.62 : this.lift.phase === 'table' && this.lift.t > 0.25 ? -0.35 : 0.28;
      this.pitch += (tp - this.pitch) * Math.min(1, dtR * 5);
    }
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    this.basis();
    // ---------- move ----------
    let speed = I.sprint ? 5.5 : 3.5;
    if (this.lift) speed *= 0.4;
    else if (this.arms.L.hold || this.arms.R.hold) speed *= 0.75;
    if (this.lift && this.lift.phase !== 'lift') speed = 0;
    if (this.hug || this.wexec) speed = 0;
    if (this.dead) speed = 0;
    const wish = _a.copy(this.r).multiplyScalar(I.mx).addScaledVector(this.f, I.my).multiplyScalar(speed);
    if (this.dodgeT > 0) { this.dodgeT -= pdt; this.vel.copy(this.dodgeDir).multiplyScalar(8.5); }
    else this.vel.lerp(wish, Math.min(1, pdt * 11));
    this.pos.addScaledVector(this.vel, pdt).addScaledVector(this.lunge, pdt);
    this.lunge.multiplyScalar(Math.max(0, 1 - pdt * 7));
    g.resolveCharacter(this.pos, 0.33, null);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.bob += pdt * sp * 2.4;
    this.updateCamera();
    // ---------- timers ----------
    this.invuln -= pdt; this.dodgeCd -= pdt; this.parryT -= pdt; this.parryCd -= pdt; this.lastHurt += pdt; this.comboT -= pdt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.lastHurt > 4 && !this.dead) this.hp = Math.min(100, this.hp + 7 * pdt);
    if (this.hug) this.updateHug(pdt);
    this.kick.multiplyScalar(Math.max(0, 1 - dtR * 9));
    // ---------- focus ----------
    const want = I.focus && !this.lift && !this.dead && (this.focusActive ? this.focus > 0 : this.focus > 12);
    if (want && !this.focusActive) this.enterFocus();
    else if (!want && this.focusActive) this.exitFocus();
    if (this.focusActive) {
      this.focus = Math.max(0, this.focus - 35 * dtR);
      this.beatT -= dtR; if (this.beatT <= 0) { g.audio.heartbeat(); this.beatT = 0.75; }
    } else this.focus = Math.min(100, this.focus + 15 * dtR);
    // ---------- actions ----------
    if (!this.dead) {
      if (I.dodge && !this.hug) this.dodge(I);
      if (I.parry || (I.punchL && I.punchR && !this.hug && !this.lift)) this.parry();
      else {
        if (I.punchL) this.punch(this.arms.L);
        if (I.punchR) this.punch(this.arms.R);
      }
      if (I.grabL) this.grab(this.arms.L);
      if (I.grabR) this.grab(this.arms.R);
    }
    // ---------- camera ----------
    this.updateCamera();
    // ---------- lift ----------
    if (this.lift) this.updateLift(dtR, ws);
    // ---------- arms ----------
    for (const arm of Object.values(this.arms)) this.updateArm(arm, pdt);
    if (!this.fp && Models.ready && Models.types.quick) {
      try { this.fp = new FPBody(this); for (const a of Object.values(this.arms)) a.useModel(); } catch (e) { console.warn('fp body', e); this.fp = null; }
    }
    if (this.fp) this.fp.update(pdt);
    if (!this.tp && this.fp) { try { this.tp = new TPBody(this); } catch (e) { console.warn('tp body', e); this.tp = null; } }
    if (this.tp) { this.tp.show(!!g.tpActive && this.game.tpK > 0.02); if (g.tpActive || g.tpK > 0.02) this.tp.update(pdt); }
    // hand bodies for ragdoll drags
    const inv = g.dtW > 1e-5 ? 1 / g.dtW : 0;
    for (const arm of Object.values(this.arms)) {
      const b = arm.body, w = arm.world;
      b.velocity.set((w.x - b.position.x) * inv, (w.y - b.position.y) * inv, (w.z - b.position.z) * inv);
    }
    // ---------- focus hover ----------
    g.clearHighlights();
    this.hover = null;
    if (this.focusActive) {
      const hit = g.raycastNDC(this.ret.x, this.ret.y, 3.4);
      if (hit && hit.enemy) { hit.enemy.highlight = hit.part; this.hover = hit; }
      else if (hit && hit.prop) this.hover = hit;
    }
  }
  postStep() {
    for (const arm of Object.values(this.arms)) arm.body.position.set(arm.world.x, arm.world.y, arm.world.z);
  }

  updateCamera() {
    const cam = this.game.camera;
    const bobY = Math.sin(this.bob * 2) * 0.025, bobX = Math.cos(this.bob) * 0.02;
    cam.position.set(this.pos.x, 1.65 + bobY, this.pos.z).addScaledVector(this.r, bobX);
    const sh = this.game.shakeOffset();
    cam.rotation.set(this.pitch + this.kick.y + sh.y, this.yaw + this.kick.x + sh.x, sh.z, 'YXZ');
    // over-the-shoulder: aim the head ray at whatever the crosshair (centre of the 3rd-person view) is on
    if (this.game.tpActive && this.game.tpAimPoint) { cam.updateMatrixWorld(true); cam.lookAt(this.game.tpAimPoint); }
    cam.updateMatrixWorld(true);
  }

  enterFocus() {
    const g = this.game;
    this.focusActive = true; g.audio.slowIn(); this.beatT = 0;
    this.ret.set(0, 0);
    let best = null, bd = 5;
    for (const e of g.enemies) {
      if (e.state === 'lifted' || e.state === 'exec') continue;
      const p = e.byName.torso.mesh.position;
      const d = p.distanceTo(g.camera.position);
      if (d > bd) continue;
      const ndc = _a.copy(p).project(g.camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > 0.9 || Math.abs(ndc.y) > 0.9) continue;
      best = ndc.clone(); bd = d;
    }
    if (best) this.ret.set(best.x, best.y);
  }
  exitFocus() { this.focusActive = false; this.game.audio.slowOut(); }

  parry() {
    if (this.parryCd > 0 || this.lift || this.hug || this.dead || this.wexec) return;
    this.parryT = 0.32; this.parryCd = 0.6;
    for (const a of Object.values(this.arms)) if (!a.prop && a.state !== 'hold' && a.state !== 'reach') { a.state = 'parry'; a.t = 0; a.dur = 0.34; }
    this.game.audio.whoosh(0.7);
  }
  dodge(I) {
    if (this.dodgeCd > 0 || this.lift || this.wexec) return;
    const d = _a.copy(this.r).multiplyScalar(I.mx).addScaledVector(this.f, I.my);
    if (d.lengthSq() < 0.05) d.copy(this.f).negate();
    this.dodgeDir.copy(d.normalize());
    this.dodgeT = 0.18; this.dodgeCd = 0.6; this.invuln = 0.28;
    this.game.audio.whoosh(0.8);
  }

  hurt(dmg, enemy) {
    if (this.invuln > 0 || this.dead || (this.lift && this.lift.phase !== 'lift')) {
      if (this.invuln > 0 && this.dodgeT > -0.2) this.game.toast('DODGED!', 0.5);
      return;
    }
    this.hp -= dmg; this.invuln = 0.35; this.lastHurt = 0;
    const g = this.game; g.onPlayerHurt && g.onPlayerHurt(dmg);
    g.hurtFlash = Math.min(1, g.hurtFlash + 0.6); g.addShake(0.45);
    g.audio.hurt(); g.audio.punch(0.7);
    this.kick.set((Math.random() - 0.5) * 0.12, 0.07);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.dropAll(); g.gameOver(); }
  }

  // --------------- punches ---------------
  startHug(e) {
    this.hug = { enemy: e, t: 2.2, tick: 0.3 };
    this.dropAll(); this.lunge.set(0, 0, 0); this.vel.set(0, 0, 0);
    this.game.toast('BEAR HUG! MASH PUNCH TO BREAK FREE', 1.6); this.game.audio.grunt(0.5);
  }
  updateHug(dt) {
    const h = this.hug, e = h.enemy, g = this.game;
    if (e.dead || e.mode === 'rag' || e.state !== 'hugging') { this.hug = null; return; }
    h.t -= dt; h.tick -= dt;
    if (h.tick <= 0) { h.tick = 0.5; this.hp -= 6; this.lastHurt = 0; g.hurtFlash = Math.min(1, g.hurtFlash + 0.35); g.addShake(0.25); g.audio.punch(0.5); if (this.hp <= 0) { this.hp = 0; this.dead = true; this.hug = null; g.gameOver(); return; } }
    this.kick.set(Math.sin(g.time * 20) * 0.01, 0.01);
    if (h.t <= 0) {
      this.hug = null;
      e.state = 'stagger'; e.t = 0.7; e.stunned = 3; e.vel.set(this.f.x * 2.5, 0, this.f.z * 2.5);
      if (e.inst) e.play('Hit_To_Body', 0.06, true, 1.3);
      this.invuln = 0.6; g.toast('BROKE FREE! HE IS STUNNED - LIFT HIM!', 1.6); g.addShake(0.4); g.audio.punch(1.3);
    }
  }
  liftSurface() {
    const g = this.game; if (!g.surfaces) return null;
    const ax = this.pos.x + this.f.x * 0.9, az = this.pos.z + this.f.z * 0.9;
    let best = null, bd = 1.75;
    for (const s of g.surfaces) {
      const x = Math.max(s.minX, Math.min(s.maxX, ax)), z = Math.max(s.minZ, Math.min(s.maxZ, az));
      const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz), dot = dx * this.f.x + dz * this.f.z;
      if (d < bd && dot > 0.2) { bd = d; best = { s, point: new THREE.Vector3(x, s.y, z) }; }
    }
    return best;
  }
  startTableSlam(sf) {
    const L = this.lift;
    L.phase = 'table'; L.t = 0; L.surface = sf; L.impact = false;
    L.enemy.state = 'exec'; L.enemy.execBend = 0;
    this.game.offerThird(); this.game.audio.grunt(0.7);
  }
  punch(arm) {
    const g = this.game;
    if (this.hug) { this.hug.t -= 0.38; g.audio.punch(0.6); this.hug.enemy.byName.head.flash = 1; this.kick.set((Math.random() - 0.5) * 0.04, 0.03); }
    if (this.lift) { if (this.lift.phase === 'lift') this.startExec(); return; }
    if (this.wexec) return;
    if (arm.state === 'hold') { this.holdAction(arm); return; }
    { const o = this.other(arm); if (!arm.prop && o.prop && TWO_HANDED.has(o.prop.type)) arm = o; }
    { const o = this.other(arm); if (arm.prop && o.state === 'hold' && o.hold && o.hold.type === 'anim' && !arm.busy) { this.startWeaponExec(arm, o); return; } }
    if (arm.busy) return;
    const other = this.other(arm);
    arm.state = 'punch'; arm.t = 0; arm.hitDone = false;
    arm.dur = arm.prop ? (TWO_HANDED.has(arm.prop.type) ? 0.42 : 0.36) : 0.27;
    arm.heavyTarget = (!arm.prop && other.state === 'hold' && other.hold && other.hold.type === 'anim') ? other.hold.enemy : null;
    arm.elbow = !!(arm.heavyTarget && other.hold.zone === 'arm');
    if (arm.elbow) arm.dur = 0.32;
    g.audio.whoosh(arm.prop ? 1 : 0.5);
  }
  doPunchHit(arm) {
    const g = this.game;
    const camPos = g.camera.position;
    const dir = g.camera.getWorldDirection(new THREE.Vector3());
    if (arm.heavyTarget) {
      const e = arm.heavyTarget, zone = e.heldZone;
      const part = zone === 'head' || zone === 'arm' ? 'head' : 'torso';
      const p = e.byName[part].mesh.position;
      let hd = dir;
      if (zone === 'head') hd = new THREE.Vector3(dir.x * 0.4, 1, dir.z * 0.4);
      if (zone === 'arm') hd = this.r.clone().multiplyScalar(-arm.side).addScaledVector(this.f, 0.4);
      e.hit(part, zone === 'arm' ? 28 : 25, hd, { point: p, force: 35 });
      e.flinch = 1; e.flinchSide = zone === 'arm' ? -arm.side : 0; e.flinchUp = zone === 'head' ? 1 : 0;
      this.onLanded(arm, p, 1.5);
      if (zone === 'arm') { this.game.audio.crack(); this.game.toast('ELBOW!', 0.6); }
      g.addStyle(zone === 'arm' ? 'elbow' : 'heavy', 12);
      return;
    }
    const reach = 1.25 + (arm.prop ? arm.prop.reach : 0);
    const hit = g.raycast(camPos, dir, reach, true);
    if (!hit) return;
    if (hit.enemy) {
      const e = hit.enemy;
      const sideAlt = this.lastSide !== arm.side && this.comboT > 0;
      this.combo = sideAlt || this.combo === 0 ? this.combo + 1 : 1;
      this.comboT = 0.6; this.lastSide = arm.side;
      const mult = Math.min(2, 1 + 0.2 * (this.combo - 1));
      let dmg = (hit.part === 'head' ? 12 : 12) * mult, opts = { point: hit.point, force: 22, source: 'punch' };
      if (arm.prop) {
        dmg = arm.prop.damage * mult; opts.weapon = true; opts.force = 45; opts.knockdown = arm.prop.type === 'stool' || this.combo >= 4;
      } else if (this.combo >= 5) { opts.knockdown = true; opts.force = 40; }
      const done = e.hit(hit.part, dmg, dir, opts);
      if (!done && e.shield) { g.hitStop(0.04); arm.bloody = arm.bloody; g.fx.sparks(hit.point); if (arm.prop) this.weaponWear(arm, hit.point); return; }
      this.onLanded(arm, hit.point, arm.prop ? 1.5 : 1);
      g.addStyle(arm.prop ? 'weapon:' + arm.prop.type : (hit.part === 'head' ? 'head' : 'body'), arm.prop ? 7 : 4);
      g.addScore(10 * this.combo, false);
      if (arm.prop) this.weaponWear(arm, hit.point);
    } else if (hit.prop) {
      const b = hit.prop.body; b.wakeUp();
      b.applyImpulse(new CANNON.Vec3(dir.x * 6, 2, dir.z * 6));
      g.audio.punch(0.4);
    }
  }
  onLanded(arm, point, s) {
    const g = this.game;
    g.audio.punch(s); g.audio.wet(0.6 * s);
    g.fx.impact(point, 0.6);
    g.hitStop(0.055 * s); g.addShake(0.18 * s);
    this.focus = Math.min(100, this.focus + 10);
    if (!arm.prop) arm.bloody = Math.min(1, arm.bloody + 0.08);
    if (Math.random() < 0.3) g.enemyGrunt();
  }
  weaponWear(arm, point) {
    const p = arm.prop, res = p.breakHit(false);
    if (res === 'broken' || res === 'halfcue') {
      p.destroy(); arm.prop = null;
      const nb = new Prop(this.game, res, point.x, point.y, point.z, p.colorIdx);
      this.game.props.push(nb); nb.pickUp(arm); arm.prop = nb;
      this.game.toast(res === 'broken' ? 'BOTTLE SMASHED' : 'CUE SNAPPED', 0.7);
    } else if (res === 'gone') { p.destroy(); arm.prop = null; }
  }

  // --------------- weapon executions ---------------
  startWeaponExec(arm, grab) {
    const e = grab.hold.enemy, zone = grab.hold.zone, spec = wexecSpec(arm.prop.type, zone);
    if (!spec || e.dead) return;
    const part = spec.kind === 'smash' ? 'head' : zone === 'head' ? 'head' : 'torso';
    e.breakTime = 99; e.wexecBy = true;
    this.wexec = { arm, grab, e, spec, part, t: 0, impact: false, type: arm.prop.type, y0: arm.weaponYaw || 0, p0: arm.weaponPitch || 0, from: arm.pos.clone() };
    arm.state = 'wexec'; arm.t = 0; arm.dur = spec.dur;
    if (spec.kind !== 'stab') this.game.slowmo(0.55, spec.dur * 0.8);
    this.game.audio.grunt(0.8); this.game.audio.whoosh(0.6);
  }
  shoveCorpse(e, k = 3.5) { if (e.mode === 'rag') for (const p of e.parts) { p.body.velocity.x += this.f.x * k; p.body.velocity.z += this.f.z * k; p.body.velocity.y += 0.8; } }
  wexecImpact() {
    const W = this.wexec, g = this.game, e = W.e, sp = W.spec, arm = W.arm;
    W.impact = true;
    const pt = e.byName[W.part].mesh.position.clone();
    const lethal = !(e.T.boss && e.hp > 120);
    const f = this.f;
    g.hitStop(0.09); g.addShake(0.75); g.slowmo(0.2, 0.9);
    g.audio.punch(1.5); g.audio.wet(1.6); g.audio.crack();
    if (sp.kind === 'smash') {
      this.releaseArm(W.grab);
      if (W.type === 'bottle') g.fx.glass(pt); else if (W.type === 'cash') g.fx.notes(pt); else g.fx.splinters(pt);
      g.fx.bigBlood(pt);
      e.hit('head', lethal ? 999 : 95, { x: f.x * 0.9, y: -0.6, z: f.z * 0.9 }, { knockdown: true, force: 70, source: 'wexec', point: pt });
      if (W.type === 'cash') g.onCash(arm.prop);
      this.shoveCorpse(e, 2.5);
      this.wexecWear(arm, sp.wear, pt);
    } else if (sp.kind === 'slash') {
      this.releaseArm(W.grab);
      if (lethal && sp.behead) { e.behead(new THREE.Vector3(-this.r.x * 2.5 * arm.side + f.x * 1.5, 3.2, -this.r.z * 2.5 * arm.side + f.z * 1.5)); }
      g.fx.bigBlood(pt);
      e.hit('torso', lethal ? 999 : 95, { x: f.x - this.r.x * arm.side * 0.4, y: 0.2, z: f.z - this.r.z * arm.side * 0.4 }, { knockdown: true, force: 70, source: 'wexec', point: pt });
      g.audio.clang(); this.shoveCorpse(e, 3);
    } else {
      g.fx.bigBlood(pt);
      if (!sp.impale) { this.releaseArm(W.grab); e.hit(W.part, lethal ? 999 : 95, { x: f.x, y: 0.2, z: f.z }, { knockdown: true, force: 45, source: 'wexec', point: pt }); this.shoveCorpse(e, 3); }
      else { W.impaleT = 0; e.flinch = 1; e.flinchUp = 0.5; }
    }
    if (lethal || !sp.impale) g.banner(sp.name + '!', lethal ? 'EXECUTION +300' : 'TOUGH ONE - KEEP GOING');
    g.addStyle('wexec:' + W.type + ':' + sp.kind, 32);
  }
  wexecWear(arm, wear, pt) {
    const p = arm.prop; if (!p || !wear) return;
    if (wear === 'gone') { p.destroy(); arm.prop = null; return; }
    p.destroy(); arm.prop = null;
    const nb = new Prop(this.game, wear, pt.x, pt.y, pt.z, p.colorIdx);
    this.game.props.push(nb); nb.pickUp(arm); arm.prop = nb;
  }
  wexecEnd() {
    const W = this.wexec; if (!W) return;
    if (W.spec.impale && W.impact) {
      const e = W.e; this.releaseArm(W.grab);
      const lethal = !(e.T.boss && e.hp > 120);
      e.hit(W.part, lethal ? 999 : 95, { x: this.f.x, y: 0.15, z: this.f.z }, { knockdown: true, force: 80, source: 'wexec' });
      this.shoveCorpse(e, 4); this.game.audio.wet(1.2); this.game.fx.blood(e.byName.torso.mesh.position, this.f, 40);
    }
    if (W.grab.state === 'hold') this.releaseArm(W.grab);
    W.e.wexecBy = false;
    W.arm.state = 'idle'; this.wexec = null;
  }
  updateWexecArm(arm, tgt, dt) {
    const W = this.wexec, s = arm.side, sp = W.spec, e = W.e;
    W.t += dt; const k = W.t / sp.dur;
    const tp = this.worldToCamLocal(e.byName[W.part].mesh.position, _c);
    tp.z = Math.min(-0.3, tp.z); tp.x = Math.max(-0.4, Math.min(0.4, tp.x)); tp.y = Math.max(-0.4, Math.min(0.12, tp.y));
    const idle = TWO_HANDED.has(W.type) ? _d.set(s * 0.2, -0.3, -0.42) : _d.set(s * 0.2, -0.24, -0.44);
    const lerpAng = (a, b, t) => a + (b - a) * t;
    arm.roll = 0; arm.curl = 1;
    if (sp.kind === 'smash') {
      const up = _a.set(s * 0.17, 0.1, -0.3);
      if (k < 0.42) { const u = smooth(k / 0.42); tgt.copy(W.from).lerp(up, u); arm.weaponPitch = lerpAng(W.p0, 1.3, u); arm.weaponYaw = lerpAng(W.y0, -s * 0.15, u); }
      else if (k < 0.52) { const u = Math.pow((k - 0.42) / 0.1, 1.6); tgt.copy(up).lerp(_b.copy(tp).add(_a.set(0, 0.1, 0.06)), u); arm.weaponPitch = lerpAng(1.3, -0.8, u); }
      else { const u = smooth((k - 0.52) / 0.48); tgt.copy(tp).add(_a.set(0, 0.04, 0.06)).lerp(idle, u); arm.weaponPitch = lerpAng(-0.8, arm.prop && !TWO_HANDED.has(arm.prop.type) ? -0.17 : 0.16, u); }
      if (k >= 0.5 && !W.impact) this.wexecImpact();
    } else if (sp.kind === 'slash') {
      const wind = _a.set(s * 0.34, 0.0, -0.3), y = tp.y;
      if (k < 0.4) { const u = smooth(k / 0.4); tgt.copy(W.from).lerp(wind, u); arm.weaponYaw = lerpAng(W.y0, s * 1.05, u); arm.weaponPitch = lerpAng(W.p0, -0.75, u); }
      else if (k < 0.56) { const u = (k - 0.4) / 0.16; tgt.set(s * 0.34 - s * 0.7 * u, y + 0.02, -0.3 - 0.18 * Math.sin(u * Math.PI)); arm.weaponYaw = lerpAng(s * 1.05, -s * 1.0, u); arm.weaponPitch = -0.75; }
      else { const u = smooth((k - 0.56) / 0.44); tgt.set(-s * 0.36, y, -0.32).lerp(idle, u); arm.weaponYaw = lerpAng(-s * 1.0, -s * 0.05, u); arm.weaponPitch = lerpAng(-0.75, -0.17, u); }
      if (k >= 0.47 && !W.impact) this.wexecImpact();
    } else {
      const back = _a.set(s * 0.2, -0.22, -0.16), hitK = 0.42, holdK = sp.impale ? 0.78 : 0.5;
      const aimP = TWO_HANDED.has(W.type) ? 0.0 : -0.85;
      if (k < 0.32) { const u = smooth(k / 0.32); tgt.copy(W.from).lerp(back, u); arm.weaponPitch = lerpAng(W.p0, aimP, u); arm.weaponYaw = lerpAng(W.y0, TWO_HANDED.has(W.type) ? -s * 0.1 : 0, u); }
      else if (k < hitK) { const u = Math.pow((k - 0.32) / (hitK - 0.32), 1.5); tgt.copy(back).lerp(_b.copy(tp).add(_a.set(0, 0, 0.12)), u); }
      else if (k < holdK) { tgt.copy(tp).add(_a.set(0, 0, 0.12)); arm.roll = s * 0.6 * Math.sin((k - hitK) * 20) * 0.3; if (sp.impale && W.impact && Math.random() < 0.3) this.game.fx.blood(this.game.camera.localToWorld(_b.copy(tgt)), this.f, 3); }
      else { const u = smooth((k - holdK) / (1 - holdK)); tgt.copy(tp).add(_a.set(0, 0, 0.12)).lerp(idle, u); arm.weaponPitch = lerpAng(aimP, TWO_HANDED.has(W.type) ? 0.16 : -0.17, u); }
      if (k >= hitK && !W.impact) this.wexecImpact();
    }
    arm.pos.copy(tgt);
    if (k >= 1) this.wexecEnd();
  }

  // --------------- holds ---------------
  holdAction(arm) {
    const h = arm.hold, g = this.game, e = h.enemy;
    const dir = _a.copy(this.f);
    if (h.type === 'rag') {
      this.releaseArm(arm);
      for (const p of e.parts) { p.body.velocity.x += this.f.x * 6; p.body.velocity.y += 2.5; p.body.velocity.z += this.f.z * 6; }
      g.audio.whoosh(1);
      return;
    }
    const zone = h.zone;
    this.releaseArm(arm);
    e.state = 'fight';
    arm.state = 'punch'; arm.t = 0; arm.dur = 0.25; arm.hitDone = true; arm.heavyTarget = null;
    if (zone === 'head') { e.hit('head', 20, { x: dir.x * 0.3, y: -1, z: dir.z * 0.3 }, { knockdown: true, force: 55, source: 'slam' }); g.fx.dust(e.byName.head.mesh.position); }
    else if (zone === 'arm') e.hit(h.part, 15, { x: -this.r.x, y: -0.6, z: -this.r.z }, { knockdown: true, force: 50 });
    else if (zone === 'leg') {
      if (e.hp - 12 > 0 && e.canLift()) { e.hp -= 12; e.enterRag(); e.byName.torso.body.applyImpulse(new CANNON.Vec3(dir.x * 40, 10, dir.z * 40)); e.byName[h.part].body.applyImpulse(new CANNON.Vec3(-dir.x * 25, 15, -dir.z * 25)); }
      else e.hit(h.part, 12, dir, { knockdown: true, force: 45 });
    } else { e.hit('torso', 8, dir, { force: 30 }); e.state = 'stagger'; e.t = 0.6; e.vel.set(dir.x * 4.5, 0, dir.z * 4.5); }
    g.audio.punch(1.2); g.hitStop(0.07); g.addShake(0.3);
    g.addStyle('hold:' + zone, 11);
  }

  grab(arm) {
    const g = this.game;
    if (this.hug || this.wexec) return;
    if (this.lift) { if (this.lift.phase === 'lift') { const sf = this.liftSurface(); if (sf) this.startTableSlam(sf); else this.throwLifted(); } return; }
    if (arm.prop) { this.throwProp(arm); return; }
    if (arm.state === 'hold') { this.releaseArm(arm); arm.state = 'idle'; if (arm.holdEnemyPrev) arm.holdEnemyPrev.state = 'fight'; return; }
    if (arm.busy) return;
    const other = this.other(arm);
    if (other.state === 'hold' && other.hold) { this.tryLift(other.hold.enemy, arm); return; }
    let hit;
    if (this.focusActive) hit = this.hover;
    else hit = g.raycast(g.camera.position, g.camera.getWorldDirection(new THREE.Vector3()), 3.0, true);
    if (!hit || (hit.enemy && hit.distance > 1.8)) {
      const pp = this.nearProp(g.camera.position, g.camera.getWorldDirection(new THREE.Vector3()), 2.2, 0.35);
      if (pp && (!hit || pp.distance < hit.distance)) hit = pp;
    }
    if (hit && hit.enemy && hit.enemy.state !== 'lifted' && hit.enemy.state !== 'exec') {
      const e = hit.enemy;
      const d = hit.distance;
      if (d > 1.5) this.lunge.copy(this.f).multiplyScalar((d - 1.0) * 7);
      const p = e.byName[hit.part];
      const local = hit.point.clone().sub(p.mesh.position).applyQuaternion(p.mesh.quaternion.clone().invert());
      arm.reach = { enemy: e, part: hit.part, local, kind: 'enemy' };
      arm.state = 'reach'; arm.t = 0; arm.dur = 0.13 + d * 0.05;
      g.audio.whoosh(0.4);
      if (this.focusActive) this.focus = Math.max(0, this.focus - 8);
    } else if (hit && hit.prop && !hit.prop.heldBy && hit.distance < 2.2) {
      arm.reach = { prop: hit.prop, kind: 'prop' };
      arm.state = 'reach'; arm.t = 0; arm.dur = 0.15;
      if (hit.distance > 1.4) this.lunge.copy(this.f).multiplyScalar((hit.distance - 1.0) * 6);
    } else {
      arm.reach = { kind: 'miss' }; arm.state = 'reach'; arm.t = 0; arm.dur = 0.16;
    }
  }
  nearProp(o, dir, far, rad) {
    let best = null, bd = 1e9;
    for (const p of this.game.props) {
      if (p.heldBy || p.dead) continue;
      const v = _a.copy(p.mesh.position).sub(o);
      const t = v.dot(dir); if (t < 0.1 || t > far) continue;
      const perp = v.addScaledVector(dir, -t).length();
      if (perp < rad && perp + t * 0.1 < bd) { bd = perp + t * 0.1; best = { prop: p, point: p.mesh.position.clone(), distance: t }; }
    }
    return best;
  }
  connect(arm) {
    const g = this.game, R = arm.reach; arm.reach = null;
    if (R.kind === 'miss') { arm.state = 'recover'; arm.t = 0; arm.dur = 0.15; return; }
    if (R.kind === 'prop') {
      if (R.prop.heldBy || R.prop.dead) { arm.state = 'idle'; return; }
      R.prop.pickUp(arm); arm.prop = R.prop; arm.state = 'idle'; g.audio.punch(0.25); return;
    }
    const e = R.enemy;
    if (e.state === 'lifted' || e.state === 'exec' || !g.enemies.includes(e)) { arm.state = 'idle'; return; }
    const other = this.other(arm);
    if (other.state === 'hold' && other.hold && other.hold.enemy === e) { arm.state = 'idle'; this.tryLift(e, arm); return; }
    if (other.state === 'hold' && other.hold && other.hold.enemy !== e) this.releaseArm(other);
    const zone = ZONE[R.part];
    if (e.mode === 'rag' || e.dead) {
      const pb = e.byName[R.part].body;
      arm.body.position.set(arm.world.x, arm.world.y, arm.world.z);
      const c = new CANNON.PointToPointConstraint(arm.body, new CANNON.Vec3(0, 0, 0), pb, new CANNON.Vec3(R.local.x, R.local.y, R.local.z), 4000);
      g.world.addConstraint(c);
      arm.hold = { type: 'rag', enemy: e, part: R.part, zone, constraint: c };
      e.pinned = (e.pinned || 0) + 1;
      pb.wakeUp();
    } else {
      if (e.heldBy && e.heldBy !== arm) this.releaseArm(e.heldBy);
      arm.hold = { type: 'anim', enemy: e, part: R.part, zone, local: R.local };
      e.state = 'held'; e.heldBy = arm; e.heldZone = zone; e.heldPart = R.part; e.heldLocal = R.local.clone();
      e.heldSideL = R.part.endsWith('L'); e.heldT = 0; e.breakTime = 2.8; e.holdTarget = new THREE.Vector3();
      e.vel.set(0, 0, 0);
      g.enemyGrunt(e);
      if (this.game.firstHold) { this.game.firstHold = false; }
    }
    arm.state = 'hold';
    g.audio.punch(0.5);
  }
  releaseArm(arm) {
    const h = arm.hold;
    if (!h) return;
    if (h.type === 'rag') { this.game.world.removeConstraint(h.constraint); h.enemy.pinned = Math.max(0, (h.enemy.pinned || 1) - 1); }
    else if (h.enemy.heldBy === arm) { h.enemy.heldBy = null; h.enemy.holdTarget = null; if (h.enemy.state === 'held') { h.enemy.state = 'fight'; } }
    arm.hold = null;
    if (arm.state === 'hold') arm.state = 'idle';
  }
  dropHold(enemy) {
    for (const a of Object.values(this.arms)) if (a.hold && a.hold.enemy === enemy) this.releaseArm(a);
  }
  dropAll() { for (const a of Object.values(this.arms)) this.releaseArm(a); }
  breakFree(enemy) {
    this.dropHold(enemy);
    enemy.state = 'stagger'; enemy.t = 0.3; enemy.stagZ = 0;
    this.lunge.copy(this.f).multiplyScalar(-4);
    this.game.toast('HE BROKE FREE', 0.8); this.game.audio.grunt(0.9);
  }
  throwProp(arm) {
    const p = arm.prop; arm.prop = null;
    const v = _a.copy(this.game.camera.getWorldDirection(_b)).multiplyScalar(15); v.y += 2.5;
    p.release(v, new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 10));
    p.thrown = 1.5;
    arm.state = 'punch'; arm.t = 0; arm.dur = 0.25; arm.hitDone = true; arm.heavyTarget = null;
    this.game.audio.whoosh(1.1);
  }

  // --------------- lift + executions ---------------
  tryLift(e, arm) {
    const g = this.game;
    if (!e.canLift()) { g.toast('TOO HEAVY! STUN HIM FIRST (WEAPON OR BIG COMBO)', 1.6); return; }
    this.dropHold(e);
    for (const a of Object.values(this.arms)) { if (a.prop) this.throwProp(a); a.state = 'lift'; a.reach = null; }
    e.startLifted();
    this.lift = { enemy: e, phase: 'lift', t: 0, impact: false };
    g.audio.grunt(0.8); g.toast('LIFTED!', 0.6);
  }
  liftTransform(P) {
    const e = this.lift.enemy;
    const Y = _c.copy(this.r).negate(), Z = UP, X = _d.crossVectors(Y, Z);
    _m.makeBasis(X, Y, Z);
    const quat = new THREE.Quaternion().setFromRotationMatrix(_m);
    const pos = P.clone().sub(new THREE.Vector3(0, e.pelvisY, 0).applyQuaternion(quat));
    e.rootOverride = { pos, quat };
  }
  updateLift(dtR, ws) {
    const L = this.lift, e = L.enemy, g = this.game;
    const dt = dtR * ws;
    L.t += dt;
    const top = this.pos.clone().addScaledVector(UP, 2.12).addScaledVector(this.f, 0.75).addScaledVector(this.r, Math.sin(L.t * 3) * 0.04);
    if (L.phase === 'lift') {
      this.liftTransform(top);
      if (L.t > 6) this.throwLifted();
    } else if (L.phase === 'exec') {
      const knee = this.pos.clone().addScaledVector(UP, 1.1).addScaledVector(this.f, 0.46).addScaledVector(this.r, 0.08);
      const up2 = top.clone().addScaledVector(UP, 0.3);
      let P;
      if (L.t < 0.3) P = top.clone().lerp(up2, smooth(L.t / 0.3));
      else if (L.t < 0.48) P = up2.clone().lerp(knee, Math.pow((L.t - 0.3) / 0.18, 2));
      else P = knee.clone().addScaledVector(UP, -Math.min(0.06, (L.t - 0.48) * 0.5));
      this.liftTransform(P);
      if (L.t >= 0.48 && !L.impact) {
        L.impact = true;
        e.execBend = 1; e.dead = true; e.hp = 0;
        g.fx.bigBlood(knee); g.fx.dust(knee);
        g.audio.slam(); g.audio.crack(); g.audio.wet(1.5);
        g.addShake(0.9); g.slowmo(0.18, 1.1); g.hitStop(0.08);
        g.onKill(e, 'exec');
        g.banner('BACKBREAKER!', 'EXECUTION +300');
      }
      if (L.t > 1.55) {
        e.execBend = 1;
        e.releaseToRag({ x: this.f.x * 0.8, y: -1.5, z: this.f.z * 0.8 }, 1);
        this.endLift();
      }
    } else if (L.phase === 'table') {
      const S = L.surface.point.clone(); S.y += 0.14;
      const up2 = top.clone().addScaledVector(UP, 0.3);
      let P;
      if (L.t < 0.25) P = top.clone().lerp(up2, smooth(L.t / 0.25));
      else if (L.t < 0.42) P = up2.clone().lerp(S, Math.pow((L.t - 0.25) / 0.17, 2));
      else P = S;
      this.liftTransform(P);
      if (L.t >= 0.42 && !L.impact) {
        L.impact = true;
        e.hp -= 85;
        if (e.hp <= 0) { e.hp = 0; e.dead = true; g.onKill(e, 'exec'); }
        g.fx.bigBlood(S); g.fx.dust(S); g.fx.splinters(S);
        g.audio.slam(); g.audio.crack(); g.audio.wet(1.3);
        g.addShake(1); g.slowmo(0.2, 0.9); g.hitStop(0.08);
        g.banner(L.surface.s.name + ' SLAM!', e.dead ? 'EXECUTION +300' : '-85');
        g.addStyle('slam', 28);
        if (g.onSurfaceSlam) g.onSurfaceSlam(L.surface);
      }
      if (L.t > 1.25) {
        e.releaseToRag({ x: 0, y: -0.5, z: 0 }, 1);
        this.endLift();
      }
    }
  }
  startExec() {
    const L = this.lift;
    L.phase = 'exec'; L.t = 0; L.enemy.state = 'exec'; L.enemy.execBend = 0;
    this.game.offerThird();
    this.game.audio.grunt(0.7);
  }
  throwLifted() {
    const L = this.lift, e = L.enemy, g = this.game;
    const v = this.f.clone().multiplyScalar(10.5); v.y = 3.8;
    e.releaseToRag(v, 7);
    if (!e.dead) { e.hp -= 40; if (e.hp <= 0) { e.dead = true; g.onKill(e, 'throw'); } }
    g.audio.whoosh(1.5); g.audio.grunt(0.8);
    g.addStyle('throw', 14);
    this.endLift();
  }
  endLift() {
    this.lift = null;
    for (const a of Object.values(this.arms)) { a.state = 'recover'; a.t = 0; a.dur = 0.25; }
  }

  // --------------- arm animation ---------------
  updateArm(arm, dt) {
    const s = arm.side;
    let tgt = arm.target;
    arm.roll = s * 0.55;
    const oth = this.other(arm);
    if (oth.prop && TWO_HANDED.has(oth.prop.type) && !arm.prop && (arm.state === 'idle' || arm.state === 'recover' || arm.state === 'punch') && !this.lift) {
      const gp = GRIPS[oth.prop.type];
      if (gp && gp.support) {
        oth.prop.mesh.updateMatrixWorld(true);
        const wp = oth.prop.mesh.localToWorld(_b.set(...gp.support));
        this.worldToCamLocal(wp, tgt); arm.state = 'idle';
        arm.curl = 0.9; arm.roll = 0; arm.support = true;
        arm.pos.copy(tgt); arm.update(dt); return;
      }
    }
    arm.support = false;
    if (arm.state === 'idle') {
      const sway = Math.sin(this.bob * 2 + s) * 0.012;
      tgt.copy(arm.REST); tgt.y += sway;
      if (arm.prop) arm.weaponYaw = -s * 0.12;
      if (arm.prop) { if (TWO_HANDED.has(arm.prop.type)) { const st = arm.prop.type === 'stool'; tgt.set(s * (st ? 0.1 : 0.2), -0.3, st ? -0.36 : -0.42); arm.weaponYaw = st ? s * 0.18 : -s * 0.28; arm.weaponPitch = st ? -0.12 : 0.16; } else { tgt.set(s * 0.2, -0.24, -0.44); arm.weaponYaw = -s * 0.05; arm.weaponPitch = -0.17; } arm.roll = 0; }
      if (this.focusActive) { tgt.z -= 0.05; tgt.y += 0.03; }
      arm.curl = arm.prop ? 1 : 0.95;
    } else if (arm.state === 'punch' || arm.state === 'recover') {
      arm.t += dt;
      const k = arm.t / arm.dur;
      if (arm.state === 'punch') {
        const ext = k < 0.35 ? smooth(k / 0.35) : 1 - smooth((k - 0.35) / 0.65);
        if (arm.elbow) {
          const a = new THREE.Vector3(s * 0.34, -0.1, -0.2), b = new THREE.Vector3(-s * 0.14, -0.06, -0.4);
          tgt.copy(k < 0.4 ? arm.REST.clone().lerp(a, smooth(k / 0.15)).lerp(b, smooth((k - 0.1) / 0.3)) : b.lerp(arm.REST, smooth((k - 0.4) / 0.6)));
          arm.roll = s * 1.4; arm.curl = 1;
          if (!arm.hitDone && k >= 0.33) { arm.hitDone = true; this.doPunchHit(arm); }
          if (k >= 1) { arm.state = 'idle'; arm.elbow = false; }
          arm.update(dt); return;
        }
        if (arm.prop && TWO_HANDED.has(arm.prop.type)) {
          const a = new THREE.Vector3(s * 0.45, 0.04, -0.22), m = new THREE.Vector3(0, -0.06, -0.62), b = new THREE.Vector3(-s * 0.38, -0.16, -0.42);
          arm.weaponYaw = k < 0.18 ? s * 1.1 * smooth(k / 0.18) : k < 0.62 ? s * 1.1 - s * 2.2 * smooth((k - 0.18) / 0.44) : -s * 1.1 * (1 - smooth((k - 0.62) / 0.38));
          if (k < 0.18) tgt.copy(new THREE.Vector3(s * 0.22, -0.26, -0.5)).lerp(a, smooth(k / 0.18));
          else if (k < 0.62) { const u = smooth((k - 0.18) / 0.44); tgt.copy(u < 0.5 ? a.clone().lerp(m, u * 2) : m.clone().lerp(b, u * 2 - 1)); }
          else tgt.copy(b).lerp(new THREE.Vector3(s * 0.22, -0.26, -0.5), smooth((k - 0.62) / 0.38));
          arm.roll = s * 0.2; arm.curl = 1;
          if (!arm.hitDone && k >= 0.42) { arm.hitDone = true; this.doPunchHit(arm); }
          if (k >= 1) arm.state = 'idle';
          arm.update(dt); return;
        }
        if (arm.prop) {
          arm.weaponYaw = k < 0.45 ? s * 0.7 * (1 - smooth(k / 0.45)) - s * 0.3 * smooth(k / 0.45) : -s * 0.3 * (1 - smooth((k - 0.45) / 0.55));
          const a = new THREE.Vector3(s * 0.38, 0.12, -0.3), b = new THREE.Vector3(-s * 0.12, -0.24, -0.8);
          tgt.copy(k < 0.45 ? a.lerp(b, smooth(k / 0.45)) : b.lerp(arm.REST, smooth((k - 0.45) / 0.55)));
        } else {
          const up = arm.heavyTarget && arm.heavyTarget.heldZone === 'head';
          const ext3 = up ? new THREE.Vector3(s * 0.1, -0.02, -0.7) : new THREE.Vector3(s * 0.13, -0.08, -0.8);
          tgt.copy(arm.REST).lerp(ext3, ext);
          if (up) tgt.y += (1 - ext) * -0.15;
        }
        arm.roll = s * 0.55 * (1 - ext) + (arm.prop ? 0 : 0);
        arm.curl = 1;
        if (!arm.hitDone && k >= 0.3) { arm.hitDone = true; this.doPunchHit(arm); }
      } else {
        tgt.copy(arm.REST); arm.curl = 0.9;
      }
      if (k >= 1) arm.state = 'idle';
    } else if (arm.state === 'wexec') {
      if (!this.wexec || this.wexec.arm !== arm) { arm.state = 'idle'; }
      else { this.updateWexecArm(arm, tgt, dt); arm.update(dt); return; }
    } else if (arm.state === 'parry') {
      arm.t += dt; const k = arm.t / arm.dur;
      const up = k < 0.3 ? smooth(k / 0.3) : 1 - smooth((k - 0.3) / 0.7);
      tgt.copy(arm.REST).lerp(_c.set(s * 0.04, -0.03, -0.36), up);
      arm.roll = s * (0.55 + 0.9 * up); arm.curl = 1;
      if (k >= 1) arm.state = 'idle';
    } else if (arm.state === 'reach') {
      arm.t += dt;
      const k = Math.min(1, arm.t / arm.dur);
      const R = arm.reach;
      let wp = null;
      if (R.kind === 'enemy') { const p = R.enemy.byName[R.part]; wp = _b.copy(R.local).applyQuaternion(p.mesh.quaternion).add(p.mesh.position); }
      else if (R.kind === 'prop') wp = _b.copy(R.prop.mesh.position);
      if (wp) this.worldToCamLocal(wp, _c); else _c.set(s * 0.1, -0.1, -0.85);
      tgt.copy(arm.REST).lerp(_c, smooth(k));
      arm.curl = 0.1; arm.roll = 0;
      if (k >= 1) this.connect(arm);
    } else if (arm.state === 'hold') {
      const h = arm.hold;
      if (!h) { arm.state = 'idle'; return; }
      const e = h.enemy;
      if (h.type === 'anim') {
        const p = e.byName[h.part];
        const wp = _b.copy(h.local).applyQuaternion(p.mesh.quaternion).add(p.mesh.position);
        this.worldToCamLocal(wp, tgt);
        const ht = this.wexec && this.wexec.grab === arm ? new THREE.Vector3(s * 0.05, -0.1, this.wexec.spec.kind === 'stab' ? -0.95 : -0.7) : new THREE.Vector3(s * 0.12, -0.12, -0.62);
        e.holdTarget = this.camLocalToWorld(ht, new THREE.Vector3());
        if (e.state !== 'held' || e.heldBy !== arm) { arm.hold = null; arm.state = 'idle'; }
      } else {
        tgt.set(s * 0.2, -0.3, -0.62);
        if (!this.game.enemies.includes(e)) this.releaseArm(arm);
      }
      arm.curl = 0.65; arm.roll = 0;
    } else if (arm.state === 'lift') {
      const L = this.lift;
      if (!L) { arm.state = 'idle'; return; }
      const e = L.enemy;
      const part = s < 0 ? e.byName.torso : e.byName.thighR;
      const wp = _b.copy(part.mesh.position).addScaledVector(UP, -0.12);
      this.worldToCamLocal(wp, tgt);
      arm.curl = 0.6; arm.roll = 0;
    }
    arm.update(dt);
  }

  // --------------- third-person body ---------------
  bodyPose(dt) {
    const L = this.lift;
    const T = {};
    if (L && L.phase === 'exec') {
      if (L.t < 0.3) { T.shoulderL = [-2.6, 0, -0.2]; T.shoulderR = [-2.6, 0, 0.2]; T.elbowL = [-0.3]; T.elbowR = [-0.3]; T.spine = [-0.1]; }
      else { T.shoulderL = [-1.25, 0, -0.35]; T.shoulderR = [-1.25, 0, 0.35]; T.elbowL = [-0.35]; T.elbowR = [-0.35]; T.hipR = [-1.5]; T.kneeR = [1.55]; T.spine = [0.35]; T.neck = [0.35]; T.hipL = [-0.1]; T.kneeL = [0.2]; }
    } else if (L && L.phase === 'table') {
      if (L.t < 0.25) { T.shoulderL = [-2.6, 0, -0.2]; T.shoulderR = [-2.6, 0, 0.2]; T.elbowL = [-0.3]; T.elbowR = [-0.3]; }
      else { T.shoulderL = [-1.5, 0, -0.3]; T.shoulderR = [-1.5, 0, 0.3]; T.elbowL = [-0.2]; T.elbowR = [-0.2]; T.spine = [0.5]; T.hipL = [-0.4]; T.hipR = [0.2]; T.kneeL = [0.5]; T.kneeR = [0.3]; }
    } else if (L) { T.shoulderL = [-2.6, 0, -0.2]; T.shoulderR = [-2.6, 0, 0.2]; T.elbowL = [-0.3]; T.elbowR = [-0.3]; }
    else { T.shoulderL = [-0.9, 0, -0.25]; T.shoulderR = [-0.9, 0, 0.25]; T.elbowL = [-2]; T.elbowR = [-2]; }
    this.body.pose(this.pos, this.yaw, T, dt);
  }
}
