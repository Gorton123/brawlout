import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BONES, PARTS, JOINTS, buildSkeleton, buildPartMesh } from './humanoid.js';
import { G } from './groups.js';
import { Models, instance, writeBones, readParts, buildRigSkeleton } from './models.js';

const CLIP_STATES = new Set(['approach', 'fight', 'windup', 'strike', 'recover', 'stagger', 'taunt', 'getup', 'chargeWind', 'charge']);
const proxyGeoCache = {};
let glowTex = null;
function getGlow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,80,40,0.9)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex;
}

const BASE = {
  brawler: { name: 'BRAWLER', hp: 100, speed: 1.6, scale: 1, width: 1, mass: 85, dmg: 10, cd: [1.1, 2.2], radius: 0.32 },
  quick: { name: 'QUICK LAD', hp: 70, speed: 2.3, scale: 0.97, width: 0.86, mass: 65, dmg: 7, cd: [0.8, 1.6], flurry: true, radius: 0.28 },
  big: { name: 'BIG LAD', hp: 200, speed: 1.15, scale: 1.15, width: 1.3, mass: 140, dmg: 18, cd: [1.7, 2.7], heavy: true, radius: 0.42, boss: true },
};
const V = (base, model, o) => ({ ...BASE[base], kind: base, model, ...o });
export const TYPES = {
  brawler: V('brawler', 'brawler', {}), quick: V('quick', 'quick', {}), big: V('big', 'big', {}),
  // Rome
  gladiator: V('brawler', 'brawler', { name: 'GLADIATOR', hp: 110, shield: 4, helmet: 'galea', tint: [1.0, 0.9, 0.8] }),
  murmillo: V('quick', 'quick', { name: 'MURMILLO', hp: 80, helmet: 'murmillo', tint: [1.0, 0.92, 0.85] }),
  champion: V('big', 'big', { name: 'CHAMPION', hp: 240, shield: 6, helmet: 'galea', gold: true, tint: [1.0, 0.9, 0.8] }),
  // Moon
  grunt: V('brawler', 'grunt', { name: 'ALIEN GRUNT', hp: 100 }),
  skitter: V('quick', 'grunt', { name: 'SKITTER', hp: 65, speed: 2.7, tint: [0.65, 1.0, 0.8] }),
  brute: V('big', 'grunt', { name: 'ALIEN BRUTE', hp: 260, tint: [1.0, 0.62, 0.9] }),
  // Street
  roadman: V('brawler', 'brawler', { name: 'ROADMAN', hp: 100, hood: true, tint: [0.42, 0.44, 0.5] }),
  runner: V('quick', 'quick', { name: 'RUNNER', hp: 70, hood: true, tint: [0.5, 0.5, 0.58] }),
  topboy: V('big', 'big', { name: 'TOP BOY', hp: 230, tint: [0.55, 0.55, 0.62], chain: true }),
};
for (const t of Object.values(TYPES)) if (t.model === 'grunt' && !t.tint) t.tint = [1, 1, 1];

const SKINS = [0xe0b393, 0xc68a63, 0x8d5a3b, 0x5b3a26, 0xf1c9a5, 0xd4a07a];
const HAIRS = [0x1a1410, 0x3b2414, 0x6b4a2a, 0xa88a5a, 0x222222];
const pick = a => a[Math.floor(Math.random() * a.length)];

function makeLook(type) {
  if (type === 'big') return { shirt: 0x161616, pants: 0x3d4a2a, skin: pick([0xf1c9a5, 0xe0b393, 0xc68a63]), hair: 0x8a3b12, hairStyle: 'bald', beard: 0x9a4518, sleeve: 'short', shoes: 0x111111 };
  if (type === 'quick') return { shirt: 0x151515, pants: 0x151515, skin: pick(SKINS), hair: pick(HAIRS), hairStyle: 'cap', capColor: 0x101010, beard: false, sleeve: 'long', shoes: 0xeeeeee };
  const shirts = [[0x8a1c1c, 0x2a0a0a], [0x1c3f8a, 0x0a1020], [0x2d5a2a, 0x0d1a0a], [0x6a4a1a, 0x201005], [0xa8a090, null], [0x2c2c2c, null], [0x6a2d6b, null]];
  const s = pick(shirts);
  return { shirt: s[0], shirt2: s[1], pants: pick([0x1d2a44, 0x2b2b2b, 0x22303a, 0x3a3226]), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: Math.random() < 0.8 ? 'short' : 'bald', beard: Math.random() < 0.5, sleeve: Math.random() < 0.4 ? 'short' : 'long' };
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const smooth = t => t * t * (3 - 2 * t);

export class Enemy {
  constructor(game, type, pos, wave) {
    this.game = game; this.type = type;
    const T = this.T = TYPES[type] || TYPES.brawler;
    this.kind = T.kind;
    this.hpMax = this.hp = T.hp + (wave - 1) * 10;
    this.dead = false; this.mode = 'anim'; this.state = 'approach'; this.t = 0;
    this.time = Math.random() * 10; this.walkPh = 0; this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.vel = new THREE.Vector3(); this.attackCd = 1.2 + Math.random() * 1.5;
    this.stunned = 0; this.recentDmg = 0; this.ragT = 0; this.deadT = 0; this.chargeCd = 3 + Math.random() * 2;
    this.heldBy = null; this.rootOverride = null; this.aggro = Math.min(1.6, 1 + (wave - 1) * 0.06);
    this.inst = Models.ready ? (instance(T.model) || instance(T.kind)) : null;
    const M = !!this.inst;
    let sk;
    if (M) { this.rig = this.inst.prof.rig; sk = buildRigSkeleton(this.rig); this.hipsBaseY = this.rig.hipsY; }
    else { sk = buildSkeleton(T.scale, T.width); this.hipsBaseY = 0.98 * T.scale; }
    this.root = sk.root; this.bones = sk.bones;
    this.root.position.copy(pos);
    this.yaw = Math.atan2(game.player.pos.x - pos.x, game.player.pos.z - pos.z);
    this.root.rotation.y = this.yaw;
    this.look = makeLook(this.kind);
    this.rot = {}; this.tgt = {};
    for (const [n] of BONES) { this.rot[n] = new THREE.Vector3(); this.tgt[n] = new THREE.Vector3(); }
    this.hipY = 0; this.tgtHipY = 0;
    this.parts = []; this.byName = {}; this.meshes = [];
    const defs = M ? this.rig.parts : PARTS;
    for (const def of defs) {
      const S = M ? 1 : T.scale, w = M ? 1 : ((def.name === 'torso' || def.name === 'pelvis') ? T.width : Math.sqrt(T.width));
      let mesh;
      if (M) {
        const key = (this.inst.modelKey || T.model) + def.name;
        const geo = proxyGeoCache[key] || (proxyGeoCache[key] = def.sphere ? new THREE.SphereGeometry(def.sphere, 12, 8) : new THREE.BoxGeometry(def.box[0] * 2, def.box[1] * 2, def.box[2] * 2));
        mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        mesh.renderOrder = 5;
      } else mesh = buildPartMesh(def, this.look, T.scale, T.width);
      mesh.traverse(o => { o.userData.enemy = this; o.userData.part = def.name; if (o.isMesh) this.meshes.push(o); });
      game.scene.add(mesh);
      const shape = def.sphere ? new CANNON.Sphere(def.sphere * S) : new CANNON.Box(new CANNON.Vec3(def.box[0] * S * w, def.box[1] * S, def.box[2] * S * w));
      const body = new CANNON.Body({ mass: T.mass * def.m, type: CANNON.Body.KINEMATIC, shape,
        collisionFilterGroup: G.RAG, collisionFilterMask: G.STATIC | G.PROP | G.RAG, linearDamping: 0.1, angularDamping: 0.4 });
      body.allowSleep = false;
      body.userData = { enemy: this, part: def.name };
      game.world.addBody(body);
      body.addEventListener('collide', e => this.onCollide(def.name, e));
      const p = { def, name: def.name, mesh, body, bone: this.bones[def.bone], off: new THREE.Vector3(def.off[0], def.off[1] * S, def.off[2]),
        pos: new THREE.Vector3(), quat: new THREE.Quaternion(), snapPos: new THREE.Vector3(), snapQuat: new THREE.Quaternion(),
        mat: mesh.material, flash: 0, radius: def.sphere ? def.sphere * S : Math.max(def.box[0], def.box[2]) * S * w };
      this.parts.push(p); this.byName[def.name] = p;
    }
    if (M) {
      game.scene.add(this.inst.model);
      this.hipsBind = this.inst.bones.Hips.position.clone();
      this.mixer = new THREE.AnimationMixer(this.inst.model);
      this.actions = {};
      for (const [n, c] of Object.entries(this.inst.prof.clips)) this.actions[n] = this.mixer.clipAction(c);
      this.drive = 'clip'; this.cur = null;
      this.partT = {}; for (const p of this.parts) this.partT[p.name] = { pos: p.pos, quat: p.quat };
      this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlow(), color: 0xff3020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      this.glow.scale.setScalar(0.32); this.glow.visible = false; game.scene.add(this.glow);
      this.inst.model.position.copy(pos); this.inst.model.rotation.y = this.yaw;
      if (T.tint) for (const m of this.inst.mats) m.color.setRGB(...T.tint);
      this.play('Walking', 0);
      this.mixer.update(0.01);
    }
    this.computeAnim();
    this.buildGear();
    this.jointDefs = JOINTS.map(([c, pa, bone, cone, twist]) => {
      const A = this.byName[pa], B = this.byName[c];
      const J = new THREE.Vector3(); this.bones[bone].getWorldPosition(J);
      const dir = B.pos.clone().sub(J).normalize();
      const iA = A.quat.clone().invert(), iB = B.quat.clone().invert();
      return { A, B, pA: J.clone().sub(A.pos).applyQuaternion(iA), pB: J.clone().sub(B.pos).applyQuaternion(iB),
        aA: dir.clone().applyQuaternion(iA), aB: dir.clone().applyQuaternion(iB), cone, twist };
    });
    this.constraints = [];
    for (const p of this.parts) {
      p.mesh.position.copy(p.pos); p.mesh.quaternion.copy(p.quat);
      p.body.position.set(p.pos.x, p.pos.y, p.pos.z); p.body.quaternion.set(p.quat.x, p.quat.y, p.quat.z, p.quat.w);
    }
  }

  get alive() { return !this.dead; }
  get radius() { return this.T.radius; }
  get pelvisY() { return this.hipsBaseY + 0.02; }

  // ---------------- mixamo clips ----------------
  play(name, fade = 0.2, once = false, rate = 1, from = 0) {
    const a = this.actions && this.actions[name]; if (!a) return;
    if (this.cur === name && !once) { a.setEffectiveTimeScale(rate); return; }
    const prev = this.cur && this.actions[this.cur];
    a.reset(); a.setEffectiveTimeScale(rate); a.setEffectiveWeight(1);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    a.time = from;
    if (prev && prev !== a && fade > 0) { a.play(); prev.crossFadeTo(a, fade, false); }
    else { if (prev && prev !== a) prev.stop(); a.play(); }
    this.cur = name;
  }
  chooseClip() {
    const s = this.state;
    if (s === 'approach') this.play('Walking', 0.25, false, Math.max(0.6, Math.min(1.6, this.vel.length() / 1.3)));
    else if (s === 'fight') {
      const right = _v2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const lat = this.vel.dot(right), fwd = this.vel.length();
      if (fwd > 0.35) this.play(lat > 0 ? 'Walk_Strafe_Left' : 'Walk_Strafe_Right', 0.3, false, Math.max(0.7, Math.min(1.5, fwd / 0.6)));
      else this.play('Fighting_Idle', 0.3);
    } else if (s === 'recover') { if (!this.atkClip || !this.actions[this.atkClip] || !this.actions[this.atkClip].isRunning()) this.play('Fighting_Idle', 0.3); }
  }

  computeAnim() {
    if (this.rootOverride) { this.root.position.copy(this.rootOverride.pos); this.root.quaternion.copy(this.rootOverride.quat); }
    else this.root.rotation.set(0, this.yaw, 0);
    this.bones.hips.position.y = this.hipsBaseY + this.hipY;
    for (const [n] of BONES) { const r = this.rot[n]; this.bones[n].rotation.set(r.x, r.y, r.z); }
    this.root.updateMatrixWorld(true);
    for (const p of this.parts) {
      _m.copy(p.bone.matrixWorld);
      p.pos.copy(p.off).applyMatrix4(_m);
      _m.decompose(_v, p.quat, _s);
    }
  }

  // ---------------- poses ----------------
  setT(n, x, y = 0, z = 0) { this.tgt[n].set(x, y, z); }
  poseTargets(dt) {
    const t = this.time, s = this.state;
    for (const n in this.tgt) this.tgt[n].set(0, 0, 0);
    this.tgtHipY = 0;
    let rate = 12;
    const guard = () => {
      this.setT('spine', 0.12); this.setT('neck', -0.08);
      this.setT('shoulderL', -0.62, 0.25, -0.42); this.setT('elbowL', -2.25);
      this.setT('shoulderR', -0.62, -0.25, 0.42); this.setT('elbowR', -2.25);
      this.setT('hipL', -0.18, 0, 0.05); this.setT('kneeL', 0.32);
      this.setT('hipR', 0.15, 0, -0.05); this.setT('kneeR', 0.22);
      this.tgtHipY = -0.04 + Math.sin(t * (this.kind === 'quick' ? 7 : 3)) * (this.kind === 'quick' ? 0.02 : 0.008);
    };
    const walk = (amt) => {
      const ph = this.walkPh;
      this.tgt.hipL.x += -Math.sin(ph) * 0.55 * amt; this.tgt.kneeL.x += 0.75 * Math.max(0, -Math.cos(ph)) * amt;
      this.tgt.hipR.x += Math.sin(ph) * 0.55 * amt; this.tgt.kneeR.x += 0.75 * Math.max(0, Math.cos(ph)) * amt;
      this.tgtHipY += -Math.abs(Math.cos(ph)) * 0.03 * amt;
    };
    const flail = (k = 1) => {
      this.setT('shoulderL', -0.4 + Math.sin(t * 9) * 0.7 * k, 0, 0.9 + Math.sin(t * 7) * 0.3);
      this.setT('shoulderR', -0.4 + Math.cos(t * 8) * 0.7 * k, 0, -0.9 - Math.sin(t * 6) * 0.3);
      this.setT('elbowL', -0.6); this.setT('elbowR', -0.6);
    };
    if (s === 'approach' || s === 'fight' || s === 'recover') {
      guard();
      const sp = Math.min(1, this.vel.length() / 1.5);
      walk(sp);
    } else if (s === 'windup' || s === 'strike') {
      guard();
      const R = this.atkSide === 'R';
      const sh = R ? 'shoulderR' : 'shoulderL', el = R ? 'elbowR' : 'elbowL', zs = R ? 1 : -1;
      if (s === 'windup') {
        this.setT(sh, -0.5, 0, 0.6 * zs); this.setT(el, -2.3);
        this.setT('spine', 0.05, R ? -0.45 : 0.45, 0);
        rate = 10;
      } else {
        this.setT(sh, -1.55, 0, 0.12 * zs); this.setT(el, -0.12);
        this.setT('spine', 0.25, R ? 0.45 : -0.45, 0);
        rate = 32;
      }
    } else if (s === 'stagger') {
      this.setT('spine', -0.45, 0, this.stagZ); this.setT('neck', -0.5);
      flail(0.4);
      this.setT('kneeL', 0.3); this.setT('kneeR', 0.3); this.setT('hipL', 0.2); this.setT('hipR', -0.1);
      rate = 18;
    } else if (s === 'held') {
      const zone = this.heldZone, side = this.heldSideL ? 'L' : 'R';
      const wob = Math.sin(t * 11) * 0.12;
      if (zone === 'head') {
        this.setT('spine', 0.95, 0, wob); this.setT('neck', 0.25);
        this.setT('shoulderL', -1.3, 0, -0.3); this.setT('shoulderR', -1.3, 0, 0.3);
        this.setT('elbowL', -0.5); this.setT('elbowR', -0.5);
        this.setT('hipL', -0.35); this.setT('hipR', -0.35); this.setT('kneeL', 0.4); this.setT('kneeR', 0.4);
        this.tgtHipY = -0.1;
      } else if (zone === 'arm') {
        guard(); flail(0.5);
        this.setT('shoulder' + side, -1.5, 0, 0); this.setT('elbow' + side, -0.05);
        this.setT('spine', 0.2, side === 'L' ? -0.4 : 0.4, wob);
      } else if (zone === 'leg') {
        this.setT('hip' + side, -1.15); this.setT('knee' + side, 0.25);
        const o = side === 'L' ? 'R' : 'L';
        this.setT('hip' + o, 0.1); this.setT('knee' + o, 0.2);
        flail(1);
        this.setT('spine', -0.2, 0, wob * 2);
        this.tgtHipY = Math.abs(Math.sin(t * 9)) * 0.05;
      } else {
        this.setT('spine', -0.15, 0, wob); this.setT('neck', 0.1);
        this.setT('shoulderL', -1.45, 0, -0.35); this.setT('shoulderR', -1.45, 0, 0.35);
        this.setT('elbowL', -0.9); this.setT('elbowR', -0.9);
        this.setT('hipL', -0.15); this.setT('kneeL', 0.25); this.setT('hipR', 0.15); this.setT('kneeR', 0.2);
      }
      if (this.wexecBy) { this.setT('shoulderL', -0.35, 0, -0.85); this.setT('shoulderR', -0.35, 0, 0.85); this.setT('elbowL', -0.5); this.setT('elbowR', -0.5); }
      const fl = this.flinch || 0;
      if (fl > 0) {
        this.tgt.spine.x -= 0.5 * fl; this.tgt.spine.z += (this.flinchSide || 0) * 0.6 * fl;
        this.tgt.neck.x -= (0.6 + (this.flinchUp || 0) * 0.5) * fl; this.tgt.neck.z += (this.flinchSide || 0) * 0.7 * fl;
      }
      rate = fl > 0.5 ? 30 : 14;
    } else if (s === 'hugWind') {
      this.setT('shoulderL', -1.15, 0, 1.25); this.setT('shoulderR', -1.15, 0, -1.25);
      this.setT('elbowL', -0.35); this.setT('elbowR', -0.35); this.setT('spine', 0.25); this.setT('neck', -0.2);
      this.setT('hipL', -0.25); this.setT('kneeL', 0.4); this.setT('hipR', 0.2); this.setT('kneeR', 0.35); this.tgtHipY = -0.08;
      rate = 8;
    } else if (s === 'hugging') {
      const sq = Math.sin(t * 10) * 0.08;
      this.setT('shoulderL', -1.45, 0, -0.25 + sq); this.setT('shoulderR', -1.45, 0, 0.25 - sq);
      this.setT('elbowL', -1.5); this.setT('elbowR', -1.5); this.setT('spine', 0.3, 0, sq); this.setT('neck', -0.1);
      this.setT('hipL', -0.2); this.setT('kneeL', 0.3); this.setT('hipR', 0.2); this.setT('kneeR', 0.3);
      rate = 14;
    } else if (s === 'dazed') {
      this.setT('spine', 0.35, Math.sin(t * 2) * 0.2, Math.sin(t * 3) * 0.15); this.setT('neck', 0.4 + Math.sin(t * 4) * 0.2, 0, Math.cos(t * 3) * 0.3);
      this.setT('shoulderL', 0.1, 0, -0.15); this.setT('shoulderR', 0.1, 0, 0.15); this.setT('elbowL', -0.25); this.setT('elbowR', -0.25);
      this.setT('hipL', -0.2); this.setT('hipR', -0.2); this.setT('kneeL', 0.45); this.setT('kneeR', 0.45); this.tgtHipY = -0.1;
      rate = 6;
    } else if (s === 'lifted') {
      this.setT('shoulderL', -1.2 + Math.sin(t * 9) * 0.9, 0, 0.5); this.setT('shoulderR', -1.2 + Math.cos(t * 8) * 0.9, 0, -0.5);
      this.setT('elbowL', -0.8 + Math.sin(t * 7) * 0.5); this.setT('elbowR', -0.8 + Math.cos(t * 6) * 0.5);
      this.setT('hipL', Math.sin(t * 8) * 0.6); this.setT('hipR', -Math.sin(t * 8) * 0.6);
      this.setT('kneeL', 0.7 + Math.sin(t * 9) * 0.4); this.setT('kneeR', 0.7 + Math.cos(t * 9) * 0.4);
      this.setT('neck', -0.2 + Math.sin(t * 5) * 0.2);
      rate = 10;
    } else if (s === 'exec') {
      const k = this.execBend || 0;
      this.setT('spine', -1.2 * k, 0, 0); this.setT('neck', -0.7 * k);
      this.setT('shoulderL', 1.4 * k - 1.2 * (1 - k), 0, 0.4); this.setT('shoulderR', 1.4 * k - 1.2 * (1 - k), 0, -0.4);
      this.setT('elbowL', -0.2); this.setT('elbowR', -0.2);
      this.setT('hipL', 0.95 * k); this.setT('hipR', 0.95 * k); this.setT('kneeL', 0.4); this.setT('kneeR', 0.4);
      rate = k > 0.5 ? 40 : 12;
    }
    const a = 1 - Math.exp(-rate * dt);
    for (const n in this.rot) this.rot[n].lerp(this.tgt[n], a);
    this.hipY += (this.tgtHipY - this.hipY) * a;
  }

  // ---------------- AI ----------------
  think(dt) {
    const P = this.game.player;
    const dx = P.pos.x - this.root.position.x, dz = P.pos.z - this.root.position.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;
    const face = Math.atan2(dx, dz);
    const T = this.T;
    const wish = _v.set(0, 0, 0);
    this.t -= dt;
    let range = 1.15 + (this.kind === 'big' ? 0.25 : 0);
    const cine = P.lift && P.lift.phase === 'exec';
    if (cine) { range = 3.2; this.attackCd = Math.max(this.attackCd, 1.2); if (this.state === 'windup') this.state = 'fight'; }
    switch (this.state) {
      case 'approach':
        if (dist > range) wish.set(nx, 0, nz).multiplyScalar(T.speed);
        else { this.state = 'fight'; }
        if (this.tryCharge(dist, cine)) break;
        break;
      case 'chargeWind':
        if (this.t <= 0) { this.state = 'charge'; this.t = 1.6; this.chargeDir = new THREE.Vector3(nx, 0, nz); this.game.audio.grunt(0.5); }
        break;
      case 'charge': {
        wish.copy(this.chargeDir).multiplyScalar(6.8);
        this.vel.copy(wish);
        const before = this.root.position.clone().addScaledVector(this.vel, dt);
        this.root.position.copy(before);
        this.game.resolveCharacter(this.root.position, this.radius, this);
        const blocked = before.distanceTo(this.root.position);
        this.walkPh += dt * 14;
        if (dist < this.radius + 0.55 && !P.dead) {
          P.hurt(20, this); P.lunge.copy(this.chargeDir).multiplyScalar(11);
          this.state = 'recover'; this.t = 0.8; this.chargeCd = 6; this.vel.set(0, 0, 0);
        } else if (blocked > 0.02 && this.t < 1.5) {
          this.state = 'dazed'; this.t = 2.8; this.stunned = 3.2; this.chargeCd = 7; this.vel.set(0, 0, 0);
          this.game.toast('HE HIT THE WALL! STUNNED - LIFT HIM!', 1.8); this.game.audio.slam(); this.game.addShake(0.6);
          this.game.fx.dust(this.byName.head.mesh.position);
        } else if (this.t <= 0) { this.state = 'fight'; this.chargeCd = 5; }
        return;
      }
      case 'dazed':
        if (this.t <= 0) { this.state = 'fight'; this.attackCd = 1; }
        break;
      case 'hugWind':
        if (this.t <= 0) {
          if (dist < range + 0.55 && !P.dead && !P.lift && P.invuln <= 0 && !P.hug) { this.state = 'hugging'; P.startHug(this); }
          else { this.state = 'recover'; this.t = 0.6; }
        } else wish.set(nx, 0, nz).multiplyScalar(1.2);
        break;
      case 'hugging': {
        if (!P.hug || P.hug.enemy !== this) { this.state = 'recover'; this.t = 0.5; break; }
        const tx = P.pos.x - nx * 0.72, tz = P.pos.z - nz * 0.72;
        this.root.position.x += (tx - this.root.position.x) * Math.min(1, dt * 10);
        this.root.position.z += (tz - this.root.position.z) * Math.min(1, dt * 10);
        this.yaw = lerpAngle(this.yaw, face, Math.min(1, dt * 10));
        return;
      }
      case 'taunt':
        if (this.t <= 0 && !P.dead) { this.state = 'fight'; this.attackCd = 0.6; }
        break;
      case 'getup':
        if (this.t <= 0) {
          const h = this.byName.pelvis.mesh.position;
          this.root.position.set(h.x, 0, h.z);
          this.state = 'recover'; this.t = 0.3;
        }
        return;
      case 'fight': {
        if (dist > range + 0.6) { this.state = 'approach'; break; }
        const side = _v2.set(-nz, 0, nx).multiplyScalar(this.strafeDir * 0.55);
        wish.copy(side);
        if (dist < range - 0.25) wish.add(_v2.set(-nx, 0, -nz).multiplyScalar(0.8));
        if (dist > range + 0.1) wish.add(_v2.set(nx, 0, nz).multiplyScalar(0.8));
        if (Math.random() < dt * 0.4) this.strafeDir *= -1;
        this.attackCd -= dt * this.aggro;
        if (this.tryCharge(dist, cine)) break;
        if (this.attackCd <= 0 && T.heavy && Math.random() < 0.4 && this.game.attackers() < 2 && !P.dead && !P.hug && !cine) {
          this.state = 'hugWind'; this.t = 0.75; this.game.audio.grunt(0.5); if (!this.game._hugTip) { this.game._hugTip = 1; this.game.toast('BEAR HUG INCOMING - DODGE!', 1.4); }
          break;
        }
        if (this.attackCd <= 0 && this.game.attackers() < 2 && !P.dead) {
          this.state = 'windup'; this.t = (this.kind === 'big' ? 0.6 : 0.45) / this.aggro; this.atkSide = Math.random() < 0.6 ? 'R' : 'L';
          this.flurryLeft = T.flurry ? 1 : 0;
          this.startAttackClip();
        }
        break;
      }
      case 'windup':
        if (this.t <= 0) { this.state = 'strike'; this.t = 0.17; this.hitDone = false; this.game.audio.whoosh(0.6); wish.set(nx, 0, nz).multiplyScalar(4); }
        break;
      case 'strike':
        wish.set(nx, 0, nz).multiplyScalar(this.t > 0.08 ? 3 : 0);
        if (!this.hitDone && this.t < 0.09) {
          this.hitDone = true;
          if (dist < range + 0.55) {
            if (P.parryT > 0 && !P.dead) { this.parried(); return; }
            P.hurt(T.dmg, this);
          }
        }
        if (this.t <= 0) {
          if (this.flurryLeft > 0) { this.flurryLeft--; this.state = 'windup'; this.t = 0.16; this.atkSide = this.atkSide === 'R' ? 'L' : 'R'; this.startAttackClip(1.8); }
          else { this.state = 'recover'; this.t = 0.45; }
          if (this.glow) this.glow.visible = false;
        }
        break;
      case 'recover':
        if (this.t <= 0) {
          this.state = 'fight'; this.attackCd = T.cd[0] + Math.random() * (T.cd[1] - T.cd[0]);
          if (this.inst && Math.random() < 0.15 && dist > 1.4) this.startTaunt();
        }
        break;
      case 'stagger':
        if (this.t <= 0) { this.state = 'fight'; this.attackCd = Math.max(this.attackCd, 0.5); }
        break;
      case 'held': {
        this.heldT += dt;
        if (this.holdTarget) {
          const a = this.attachWorld(_v2);
          const k = Math.min(1, dt * 12);
          this.root.position.x += (this.holdTarget.x - a.x) * k;
          this.root.position.z += (this.holdTarget.z - a.z) * k;
        }
        this.yaw = lerpAngle(this.yaw, face, Math.min(1, dt * 8));
        if (this.heldT > this.breakTime) this.game.player.breakFree(this);
        return;
      }
      case 'lifted': case 'exec':
        return;
    }
    if (P.dead && (this.state === 'fight' || this.state === 'approach' || this.state === 'recover')) this.startTaunt(true);
    if (this.state !== 'strike') this.yaw = lerpAngle(this.yaw, face, Math.min(1, dt * (this.state === 'windup' ? 3 : 7)));
    const acc = this.state === 'stagger' ? 3 : 10;
    this.vel.lerp(wish, Math.min(1, dt * acc));
    if (this.state === 'stagger') this.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
    this.root.position.addScaledVector(this.vel, dt);
    this.walkPh += dt * (2 + this.vel.length() * 4.2);
    this.game.resolveCharacter(this.root.position, this.radius, this);
  }

  // cut the head off: hide it on the body, spawn a physics head that is a pose-frozen copy of this model
  behead(vel) {
    if (!this.inst || this.beheaded) return;
    const B = this.inst.bones, g = this.game; if (!B.Head) return;
    this.beheaded = true;
    this.inst.model.updateMatrixWorld(true);
    const c = instance(this.inst.modelKey); if (!c) return;
    if (this.T.tint) for (const m of c.mats) m.color.setRGB(...this.T.tint);
    for (const [n, b] of Object.entries(c.bones)) { const v = B[n]; if (v) { b.position.copy(v.position); b.quaternion.copy(v.quaternion); b.scale.copy(v.scale); } }
    c.model.position.copy(this.inst.model.position); c.model.quaternion.copy(this.inst.model.quaternion); c.model.scale.copy(this.inst.model.scale);
    c.model.updateMatrixWorld(true);
    const Hc = c.bones.Head, hw = Hc.matrixWorld.clone(), inv = hw.clone().invert();
    const headSet = new Set(); Hc.traverse(o => { if (o.isBone) headSet.add(o); });
    const bones = [], meshes = [];
    c.model.traverse(o => { if (o.isBone) bones.push({ o, rel: headSet.has(o) ? inv.clone().multiply(o.matrixWorld) : null }); if (o.isSkinnedMesh) meshes.push(o); });
    const hp = this.byName.head, r = hp.def.sphere || 0.12;
    const body = new CANNON.Body({ mass: 4.5, shape: new CANNON.Sphere(r * 0.9), position: new CANNON.Vec3(hp.mesh.position.x, hp.mesh.position.y, hp.mesh.position.z),
      collisionFilterGroup: G.PROP, collisionFilterMask: G.STATIC | G.PROP | G.RAG, linearDamping: 0.15, angularDamping: 0.35 });
    body.quaternion.set(hp.mesh.quaternion.x, hp.mesh.quaternion.y, hp.mesh.quaternion.z, hp.mesh.quaternion.w);
    body.velocity.set(vel.x, vel.y, vel.z); body.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
    g.world.addBody(body);
    const bm = new THREE.Matrix4().compose(hp.mesh.position, hp.mesh.quaternion, new THREE.Vector3(1, 1, 1));
    const off = bm.invert().multiply(hw);
    const tiny = new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4), M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
    const apply = () => {
      M.compose(P.set(body.position.x, body.position.y, body.position.z), Q.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w), ONE).multiply(off);
      for (const b of bones) b.o.matrixWorld.multiplyMatrices(M, b.rel || tiny);
      for (const m of meshes) { m.matrixWorld.identity(); m.bindMatrixInverse.identity(); }
    };
    // stop three.js recomputing this copy's matrices from its (frozen) local transforms
    c.model.traverse(o => { o.updateMatrixWorld = () => {}; o.updateWorldMatrix = () => {}; });
    c.model.updateMatrixWorld = () => apply();
    for (const m of meshes) { m.frustumCulled = false; }
    apply();
    g.scene.add(c.model);
    B.Head.scale.setScalar(0.001);
    // stump + helmet rides on the severed head
    const stump = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 12, 8), new THREE.MeshStandardMaterial({ color: 0x5a0606, roughness: 0.25, emissive: 0x1a0000 }));
    stump.scale.y = 0.5; g.scene.add(stump);
    for (const Gr of this.gear || []) if (Gr.part === 'head') Gr.severed = true;
    this.severed = { model: c.model, body, stump, t: 0, M, off };
    g.audio.slam();
  }
  updateSevered(dt) {
    const S = this.severed; if (!S) return;
    S.t += dt;
    const hp = this.byName.head.mesh;
    S.stump.position.copy(hp.position); S.stump.quaternion.copy(hp.quaternion);
    if (S.t < 1.6 && this.game.fx.bloodOn) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.byName.torso.mesh.quaternion);
      for (let i = 0; i < 3; i++) this.game.fx.small.emit(hp.position, new THREE.Vector3(up.x * 2.5 + (Math.random() - 0.5), up.y * 3 + Math.random() * 1.5, up.z * 2.5 + (Math.random() - 0.5)), new THREE.Color(0.45, 0.01, 0.01), 1.2, 9.8, Math.random() < 0.3 ? 1 : 0);
    }
    for (const Gr of this.gear || []) if (Gr.severed) { const b = S.body; Gr.obj.position.set(b.position.x, b.position.y, b.position.z); Gr.obj.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); }
  }
  parried() {
    this.state = 'dazed'; this.t = 1.5; this.stunned = Math.max(this.stunned, 2.4); this.flurryLeft = 0; this.attackCd = 1.5;
    if (this.glow) this.glow.visible = false;
    this.vel.set(-Math.sin(this.yaw) * 2.5, 0, -Math.cos(this.yaw) * 2.5);
    this.game.onParry(this);
  }
  buildGear() {
    const T = this.T, g = this.game; this.gear = [];
    const bronze = new THREE.MeshStandardMaterial({ color: T.gold ? 0xb88a2a : 0x8a6232, metalness: 0.9, roughness: 0.45 });
    const head = this.byName.head, hr = (head.def.sphere || 0.12);
    if (T.helmet) {
      const h = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.12, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), bronze); dome.position.y = hr * 0.1; h.add(dome);
      const brim = new THREE.Mesh(new THREE.TorusGeometry(hr * 1.1, hr * 0.08, 6, 24), bronze); brim.rotation.x = Math.PI / 2; brim.position.y = hr * 0.05; h.add(brim);
      for (const sx of [-1, 1]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.12, hr * 0.8, hr * 0.7), bronze); ch.position.set(sx * hr * 1.02, -hr * 0.35, hr * 0.25); h.add(ch); }
      const crest = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.22, hr * 0.7, hr * 2.0), new THREE.MeshStandardMaterial({ color: T.helmet === 'murmillo' ? 0x1a3a8a : 0xa0141a, roughness: 0.9 }));
      crest.position.set(0, hr * 1.35, -hr * 0.1); h.add(crest);
      if (T.helmet === 'murmillo') { const visor = new THREE.Mesh(new THREE.TorusGeometry(hr * 1.05, hr * 0.06, 6, 20, Math.PI * 0.8), bronze); visor.rotation.set(0, 0, Math.PI * 0.1); visor.position.set(0, -hr * 0.05, 0); h.add(visor); }
      h.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.scene.add(h); this.gear.push({ obj: h, part: 'head', off: new THREE.Vector3(0, 0.0, 0) });
    }
    if (T.hood) {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.2, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: 0x1c1d22, roughness: 0.95 }));
      hood.scale.set(1, 1.05, 1.1); const hg = new THREE.Group(); hood.position.set(0, hr * 0.05, -hr * 0.15); hg.add(hood); g.scene.add(hg);
      this.gear.push({ obj: hg, part: 'head', off: new THREE.Vector3() });
    }
    if (T.chain) {
      const ch = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 8, 24), new THREE.MeshStandardMaterial({ color: 0xe8c050, metalness: 1, roughness: 0.2 }));
      ch.rotation.x = 1.25; const cg = new THREE.Group(); ch.position.set(0, 0.12, 0.06); cg.add(ch); g.scene.add(cg);
      this.gear.push({ obj: cg, part: 'torso', off: new THREE.Vector3() });
    }
    if (T.shield) {
      const sh = new THREE.Group();
      const big = this.kind === 'big';
      const W = big ? 0.78 : 0.62, H = big ? 1.0 : 0.86, rad = 0.42;
      const face = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, H, 16, 1, true, -W / (2 * rad), W / rad), new THREE.MeshStandardMaterial({ color: 0x6a0c10, roughness: 0.75, side: THREE.DoubleSide }));
      face.geometry.translate(0, 0, -rad);
      sh.add(face);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 0.035, 0.035), bronze); rim.position.set(0, H / 2, 0.05); sh.add(rim);
      const rim2 = rim.clone(); rim2.position.y = -H / 2; sh.add(rim2);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), bronze); boss.rotation.x = Math.PI / 2; boss.position.z = 0.0; sh.add(boss);
      for (const sy of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.02), bronze); w.position.set(0, sy * H * 0.27, 0.01); sh.add(w); }
      sh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.enemy = this; o.userData.part = 'torso'; o.userData.shield = true; } });
      g.scene.add(sh);
      this.shield = { obj: sh, hp: T.shield, max: T.shield, face };
      this.gear.push({ obj: sh, shield: true });
    }
  }
  updateGear() {
    if (!this.gear) return;
    for (const G of this.gear) {
      if (G.severed) continue;
      if (G.shield) {
        const s = this.shield; if (!s || !s.obj.parent) continue;
        const la = this.byName.lArmL, to = this.byName.torso;
        if (this.mode === 'rag') {
          s.obj.position.copy(la.mesh.position); s.obj.quaternion.copy(la.mesh.quaternion); continue;
        }
        const yaw = this.yaw, f = _v.set(Math.sin(yaw), 0, Math.cos(yaw));
        if (this.state === 'held' || this.state === 'dazed' || this.state === 'stagger') {
          // guard dropped: shield hangs off the arm, edge-on, out of the player's face
          s.obj.position.copy(la.mesh.position); s.obj.position.y -= 0.3;
          s.obj.position.x += Math.cos(yaw) * 0.32 - f.x * 0.1; s.obj.position.z -= Math.sin(yaw) * 0.32 + f.z * 0.1;
          s.obj.rotation.set(0, yaw + Math.PI / 2, 0.15);
          continue;
        }
        s.obj.position.copy(to.mesh.position).lerp(la.mesh.position, 0.7).addScaledVector(f, 0.22);
        s.obj.position.x += Math.cos(yaw) * 0.1; s.obj.position.z -= Math.sin(yaw) * 0.1; s.obj.position.y -= 0.12;
        s.obj.rotation.set(0, yaw + 0.35, 0);
        continue;
      }
      const p = this.byName[G.part];
      G.obj.position.copy(p.mesh.position); G.obj.quaternion.copy(p.mesh.quaternion);
    }
  }
  shieldBlock(dmg, dir, opts) {
    const s = this.shield; if (!s || s.hp <= 0) return false;
    if (opts.source === 'slam' || opts.source === 'throw' || opts.source === 'wexec' || opts.source === 'trap' || opts.source === 'meteor' || this.state === 'held' || this.state === 'dazed' || this.state === 'stagger' || this.mode === 'rag') return false;
    const f = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const L = Math.hypot(dir.x, dir.z) || 1;
    if ((dir.x * f.x + dir.z * f.z) / L > -0.25) return false; // not from the front
    s.hp -= opts.weapon ? 2 : 1;
    const g = this.game, at = s.obj.position;
    g.fx.splinters(at); g.audio.thunk(); g.addShake(0.12);
    s.face.material.color.setRGB(0.25 + 0.17 * (s.hp / s.max), 0.05, 0.06);
    s.obj.rotation.z = (Math.random() - 0.5) * 0.2;
    this.vel.set(dir.x / L * 1.6, 0, dir.z / L * 1.6);
    if (s.hp <= 0) {
      g.scene.remove(s.obj); g.fx.splinters(at); g.fx.splinters(at); g.audio.crack(); g.audio.crack();
      g.toast('SHIELD SMASHED! HE IS OPEN', 1.2); g.addStyle && g.addStyle('shield', 18);
      this.state = 'stagger'; this.t = 0.7; this.stunned = Math.max(this.stunned, 1.5);
      if (this.inst) this.play('Hit_To_Body', 0.06, true, 1.4);
    } else g.toast('BLOCKED - ' + s.hp + ' MORE', 0.5);
    return true;
  }
  tryCharge(dist, cine) {
    if (!this.T.heavy || this.chargeCd > 0 || dist < 3 || dist > 8 || cine || this.game.player.dead) return false;
    this.state = 'chargeWind'; this.t = 0.8;
    if (this.inst) this.play('Taunt', 0.15, true, 1.6);
    this.game.audio.grunt(0.45);
    if (!this.game._chargeTip) { this.game._chargeTip = 1; this.game.toast('BIG LAD IS CHARGING - DODGE HIM INTO A WALL!', 2); }
    return true;
  }
  startTaunt(loop = false) {
    if (!this.inst || !this.actions.Taunt) return;
    if (this.state === 'taunt') return;
    this.state = 'taunt'; this.t = loop ? 99 : this.actions.Taunt.getClip().duration / 1.2;
    this.play('Taunt', 0.25, !loop, 1.2);
  }
  startAttackClip(rateMul = 1) {
    if (!this.inst) return;
    const name = (this.kind === 'big' || (this.kind === 'brawler' && Math.random() < 0.35)) && this.actions.Hook_Punch ? 'Hook_Punch' : 'Punching';
    const info = Models.attack[name] || { t: 0.45, side: 'R' };
    const rate = (name === 'Hook_Punch' ? 1.35 : 1.25) * this.aggro * rateMul;
    this.atkClip = name; this.atkSide = info.side;
    const lead = Math.max(0, info.t - 0.55 * rate);
    this.play(name, 0.12, true, rate, lead);
    this.t = Math.max(0.14, (info.t - lead) / rate - 0.06);
    this.glowBone = this.inst.bones[info.side === 'L' ? 'LeftHand' : 'RightHand'];
  }
  attachWorld(out) {
    const p = this.byName[this.heldPart];
    return out.copy(this.heldLocal).applyQuaternion(p.quat).add(p.pos);
  }

  // ---------------- per-frame ----------------
  preStep(dt) {
    this.time += dt;
    this.chargeCd -= dt;
    if (this.stunned > 0) this.stunned -= dt;
    this.recentDmg = Math.max(0, this.recentDmg - dt * 15);
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt * 3);
    for (const p of this.parts) {
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 4);
      const hl = this.highlight === p.name ? 0.55 + Math.sin(this.time * 14) * 0.25 : 0;
      if (this.inst) p.mat.opacity = hl * 0.55;
      else p.mat.emissive.setRGB(p.flash * 0.9 + hl * 0.25, hl * 0.55, hl * 1.0);
    }
    if (this.inst) {
      let f = 0; for (const p of this.parts) f = Math.max(f, p.flash);
      const hlAny = (this.highlight ? 0.12 : 0) + (this.game.dark ? (this.game.player.focusActive ? 0.16 : 0.025) : 0);
      for (const m of this.inst.mats) m.emissive.setRGB(f * f * 0.2 + hlAny * 0.3, hlAny * 0.6, hlAny);
    }
    if (this.mode === 'rag') {
      this.ragT += dt;
      if (this.dead) this.deadT += dt;
      return;
    }
    this.think(dt);
    if (this.inst) {
      const drive = CLIP_STATES.has(this.state) ? 'clip' : 'proc';
      if (drive !== this.drive) {
        this.drive = drive;
        if (this.mode !== 'blend') { this.snapshot(); this.mode = 'blend'; this.blendT = 0; this.blendDur = drive === 'clip' ? 0.25 : 0.15; }
        if (drive === 'clip') { this.mixer.stopAllAction(); this.cur = null; this.resetPose(); }
      }
      if (drive === 'clip') {
        this.chooseClip();
        const m = this.inst.model;
        m.position.copy(this.root.position); m.rotation.set(0, this.yaw, 0);
        this.inst.bones.Hips.position.copy(this.hipsBind);
        this.mixer.update(dt);
        readParts(this.inst, this.partT);
      } else {
        this.poseTargets(dt);
        this.computeAnim();
      }
    } else {
      this.poseTargets(dt);
      this.computeAnim();
    }
    if (this.mode === 'blend') {
      this.blendT += dt / this.blendDur;
      const k = smooth(Math.min(1, this.blendT));
      for (const p of this.parts) {
        p.mesh.position.copy(p.snapPos).lerp(p.pos, k);
        p.mesh.quaternion.copy(p.snapQuat).slerp(p.quat, k);
      }
      if (this.blendT >= 1) this.mode = 'anim';
    } else {
      for (const p of this.parts) { p.mesh.position.copy(p.pos); p.mesh.quaternion.copy(p.quat); }
    }
    if (this.inst && (this.drive === 'proc' || this.mode === 'blend')) this.writeModel();
    if (this.glow) {
      const on = this.state === 'windup' && this.glowBone;
      this.glow.visible = !!on;
      if (on) { this.glowBone.getWorldPosition(this.glow.position); this.glow.material.opacity = 0.6 + Math.sin(this.time * 30) * 0.3; }
    }
    const inv = dt > 1e-5 ? 1 / dt : 0;
    for (const p of this.parts) {
      const b = p.body, mp = p.mesh.position;
      b.velocity.set((mp.x - b.position.x) * inv, (mp.y - b.position.y) * inv, (mp.z - b.position.z) * inv);
      if (b.velocity.lengthSquared() > 400) b.velocity.scale(20 / b.velocity.length(), b.velocity);
      b.angularVelocity.set(0, 0, 0);
    }
  }

  writeModel() {
    const T = this._wt || (this._wt = {});
    for (const p of this.parts) { const o = T[p.name] || (T[p.name] = {}); o.pos = p.mesh.position; o.quat = p.mesh.quaternion; }
    writeBones(this.inst, T);
  }
  postStep() {
    if (this.mode === 'rag') {
      for (const p of this.parts) { p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion); }
      if (this.inst) this.writeModel();
      if (!this.dead && !this.pinned && this.ragT > 1.6) {
        const v = this.byName.pelvis.body.velocity.length();
        if (v < 0.8 || this.ragT > 4) this.getUp();
      }
      if (this.dead && this.deadT > 3 && !this.pinned) {
        for (const p of this.parts) { p.body.allowSleep = true; }
      }
    } else {
      for (const p of this.parts) {
        p.body.position.set(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
        p.body.quaternion.set(p.mesh.quaternion.x, p.mesh.quaternion.y, p.mesh.quaternion.z, p.mesh.quaternion.w);
      }
    }
  }

  syncMatrices() { for (const p of this.parts) p.mesh.updateMatrixWorld(true); this.updateGear(); if (this.severed) this.updateSevered(this.game.dtW || 0); if (this.shield && this.shield.obj.parent) this.shield.obj.updateMatrixWorld(true); }
  snapshot() { for (const p of this.parts) { p.snapPos.copy(p.mesh.position); p.snapQuat.copy(p.mesh.quaternion); } }

  enterRag() {
    if (this.mode === 'rag') return;
    this.state = 'down'; this.rootOverride = null; this.heldBy = null;
    for (const p of this.parts) {
      const b = p.body;
      b.type = CANNON.Body.DYNAMIC; b.wakeUp();
      if (b.velocity.length() > 12) b.velocity.scale(12 / b.velocity.length(), b.velocity);
    }
    for (const j of this.jointDefs) {
      const c = new CANNON.ConeTwistConstraint(j.A.body, j.B.body, {
        pivotA: new CANNON.Vec3(j.pA.x, j.pA.y, j.pA.z), pivotB: new CANNON.Vec3(j.pB.x, j.pB.y, j.pB.z),
        axisA: new CANNON.Vec3(j.aA.x, j.aA.y, j.aA.z), axisB: new CANNON.Vec3(j.aB.x, j.aB.y, j.aB.z),
        angle: j.cone, twistAngle: j.twist, collideConnected: false, maxForce: 1e6,
      });
      this.game.world.addConstraint(c); this.constraints.push(c);
    }
    this.mode = 'rag'; this.ragT = 0;
  }
  exitRag() {
    for (const c of this.constraints) this.game.world.removeConstraint(c);
    this.constraints = [];
    for (const p of this.parts) {
      p.body.type = CANNON.Body.KINEMATIC; p.body.velocity.set(0, 0, 0); p.body.angularVelocity.set(0, 0, 0);
      p.body.allowSleep = false; p.body.wakeUp();
    }
  }
  resetPose(standing = true) {
    for (const n in this.rot) this.rot[n].set(0, 0, 0);
    this.hipY = 0;
  }
  getUp() {
    const pb = this.byName.pelvis.body.position;
    if (this.inst && this.actions.Getting_Up && this.inst.prof.getup) {
      const tq = this.byName.torso.body.quaternion;
      const face = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(tq.x, tq.y, tq.z, tq.w));
      if (face.y > 0.35) {
        const hd = this.byName.head.body.position;
        const aR = Math.atan2(hd.x - pb.x, hd.z - pb.z);
        const th = aR - this.inst.prof.getup.a0;
        this.snapshot(); this.exitRag();
        const o = this.inst.prof.getup.off;
        const c = Math.cos(th), sn = Math.sin(th);
        this.yaw = th;
        this.root.position.set(pb.x - (o.x * c + o.z * sn), 0, pb.z - (-o.x * sn + o.z * c));
        this.resetPose(); this.vel.set(0, 0, 0);
        this.mixer.stopAllAction(); this.cur = null; this.drive = 'clip';
        this.play('Getting_Up', 0, true, 1.45);
        this.mode = 'blend'; this.blendT = 0; this.blendDur = 0.35;
        this.state = 'getup'; this.t = this.actions.Getting_Up.getClip().duration / 1.45 - 0.15;
        return;
      }
    }
    this.snapshot();
    this.exitRag();
    this.root.position.set(pb.x, 0, pb.z);
    this.game.resolveCharacter(this.root.position, this.radius, this);
    const P = this.game.player;
    this.yaw = Math.atan2(P.pos.x - pb.x, P.pos.z - pb.z);
    this.resetPose();
    this.vel.set(0, 0, 0);
    this.mode = 'blend'; this.blendT = 0; this.blendDur = 0.75;
    this.state = 'recover'; this.t = 0.9;
  }
  startLifted() {
    this.snapshot();
    if (this.mode === 'rag') this.exitRag();
    this.mode = 'blend'; this.blendT = 0; this.blendDur = 0.35;
    this.state = 'lifted'; this.heldBy = null; this.vel.set(0, 0, 0);
  }
  releaseToRag(vel, spin = 4) {
    this.rootOverride = null;
    this.enterRag();
    for (const p of this.parts) {
      p.body.velocity.set(vel.x + (Math.random() - 0.5) * 1.5, vel.y + (Math.random() - 0.5), vel.z + (Math.random() - 0.5) * 1.5);
      p.body.angularVelocity.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    }
  }

  canLift() { return this.dead || !this.T.heavy || this.stunned > 0; }

  hit(partName, dmg, dir, opts = {}) {
    if (this.state === 'lifted' || this.state === 'exec') return 0;
    const p = this.byName[partName] || this.byName.torso;
    const mult = partName === 'head' ? 1.5 : 1;
    const d = dmg * mult;
    p.flash = 1;
    const hp = opts.point || p.mesh.position;
    const L = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const force = opts.force ?? 22;
    const imp = new CANNON.Vec3(dir.x / L * force, dir.y / L * force, dir.z / L * force);
    if (this.dead) { this.game.fx.blood(hp, dir, 8); if (this.mode === 'rag') p.body.applyImpulse(imp); return 0; }
    if (this.shieldBlock(d, dir, opts)) return 0;
    this.game.fx.blood(hp, dir, Math.min(40, 6 + d * 0.6));
    this.hp -= d;
    this.recentDmg += d;
    if (opts.weapon || this.recentDmg > 45) this.stunned = 3;
    if (this.state === 'held') this.breakTime += 1;
    if (this.hp <= 0) { this.die(imp, p, opts.source); return d; }
    const canDown = !this.T.heavy || this.stunned > 0 || opts.force > 60;
    if (this.mode === 'rag') { p.body.applyImpulse(imp); }
    else if (opts.knockdown && canDown) {
      if (this.heldBy) this.game.player.dropHold(this);
      this.enterRag(); p.body.applyImpulse(imp);
    } else if (this.state !== 'held') {
      if (!this.T.heavy || d >= 20) {
        this.state = 'stagger'; this.t = this.T.heavy ? 0.25 : 0.38; this.stagZ = (Math.random() - 0.5) * 0.6;
        if (this.inst) { this.play(partName === 'head' ? 'Head_Hit' : 'Hit_To_Body', 0.06, true, 1.5, 0.05); this.t = this.T.heavy ? 0.35 : 0.5; if (this.glow) this.glow.visible = false; }
        this.vel.set(dir.x / L * (this.T.heavy ? 1.8 : 3.4), 0, dir.z / L * (this.T.heavy ? 1.8 : 3.4));
      }
    }
    return d;
  }
  die(imp, p, source) {
    this.dead = true; this.hp = 0;
    if (this.heldBy) this.game.player.dropHold(this);
    if (this.mode !== 'rag') this.enterRag();
    if (imp) p.body.applyImpulse(imp);
    this.game.onKill(this, source);
  }
  onCollide(partName, e) {
    if (this.dead || this.mode === 'rag' || this.state === 'lifted' || this.state === 'exec') return;
    const o = e.body.userData;
    if (o && o.enemy && o.enemy !== this && o.enemy.mode === 'rag') {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 4.5) {
        const dir = o.enemy.byName.pelvis.body.velocity;
        this.game.events.push(() => {
          if (this.dead || this.mode === 'rag') return;
          this.hit(partName, 10 + v * 3, { x: dir.x, y: 0.3, z: dir.z }, { knockdown: true, force: 30 + v * 4, source: 'throw' });
          this.game.audio.punch(1.2);
        });
      }
    }
  }
  dispose() {
    for (const c of this.constraints) this.game.world.removeConstraint(c);
    for (const p of this.parts) { this.game.scene.remove(p.mesh); this.game.world.removeBody(p.body); }
    if (this.inst) { this.game.scene.remove(this.inst.model); this.game.scene.remove(this.glow); this.mixer.stopAllAction(); }
    for (const G of this.gear || []) this.game.scene.remove(G.obj);
    if (this.severed) { this.game.scene.remove(this.severed.model); this.game.scene.remove(this.severed.stump); this.game.world.removeBody(this.severed.body); }
  }
}
