import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G } from './groups.js';
import { getMoneyBagTex } from './stages.js';

const bottleColors = [0x1f6b2a, 0x5a3311, 0x2d5f73, 0x7a6a20];

function bottleGeo(broken) {
  const pts = [];
  if (!broken) {
    pts.push([0, -0.13], [0.034, -0.13], [0.036, -0.12], [0.036, 0.03], [0.03, 0.06], [0.013, 0.09], [0.012, 0.125], [0.015, 0.13], [0, 0.13]);
  } else {
    pts.push([0, -0.0], [0.034, -0.0], [0.036, 0.01], [0.036, 0.03], [0.03, 0.06], [0.013, 0.09], [0.012, 0.125], [0.015, 0.13], [0, 0.13]);
  }
  const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 14);
  if (broken) g.translate(0, -0.065, 0);
  return g;
}

// how each prop sits in the fist. Hand frame: x right, y up, -z forward; the handle runs up through the fist.
// dir = where the prop's +Y axis points, grip = prop-local point held in the fist, support = where the other hand goes (two-handed)
export const GRIPS = {
  bottle: { dir: [0, -0.88, 0.48], grip: [0, 0.095, 0], at: [0, 0, -0.07] },
  broken: { dir: [0, -0.88, 0.48], grip: [0, 0.035, 0], at: [0, 0, -0.07] },
  cue: { dir: [0, 0.06, -1], grip: [0, -0.6, 0], at: [0, 0, -0.07], support: [0, -0.2, 0] },
  halfcue: { dir: [0, 0.1, -1], grip: [0, -0.26, 0], at: [0, 0, -0.07], support: [0, 0.0, 0] },
  sword: { dir: [0, 0.78, -0.62], grip: [0, -0.06, 0], at: [0, 0, -0.07] },
  spear: { dir: [0, 0.06, -1], grip: [0, -0.55, 0], at: [0, 0, -0.07], support: [0, -0.1, 0] },
  cash: { dir: [0, 0.3, -0.95], grip: [0, -0.05, 0], at: [0, 0.01, -0.06] },
  rock: { dir: [0, 1, 0], grip: [0, -0.06, 0.02], at: [0, 0.03, -0.1] },
  bat: { dir: [0, 0.8, -0.6], grip: [0, -0.33, 0], at: [0, 0, -0.07] },
  crowbar: { dir: [0, 0.8, -0.6], grip: [0, -0.24, 0], at: [0, 0, -0.07] },
  wrench: { dir: [0, 0.8, -0.6], grip: [0, -0.12, 0], at: [0, 0, -0.07] },
  pipe: { dir: [0, 0.8, -0.6], grip: [0, -0.2, 0], at: [0, 0, -0.07] },
  stool: { dir: [0, 0.55, -0.83], grip: [0.092, -0.3, 0.092], at: [0, 0, -0.07], support: [-0.092, -0.25, 0.092], roll: Math.PI / 4 },
};
export class Prop {
  constructor(game, type, x, y, z, colorIdx = 0) {
    this.game = game; this.type = type; this.heldBy = null; this.dead = false;
    this.durability = { bottle: 1, cue: 4, halfcue: 3, sword: 8, spear: 5, cash: 1, rock: 3, bat: 6, crowbar: 12, wrench: 10, pipe: 7 }[type] || 3;
    this.colorIdx = colorIdx;
    const mesh = this.mesh = new THREE.Group();
    let shape, mass;
    if (type === 'bottle' || type === 'broken') {
      const mat = new THREE.MeshStandardMaterial({
        color: bottleColors[colorIdx % 4], roughness: 0.08, metalness: 0.1,
        transparent: true, opacity: 0.82, emissive: bottleColors[colorIdx % 4], emissiveIntensity: 0.08,
      });
      const m = new THREE.Mesh(bottleGeo(type === 'broken'), mat);
      m.castShadow = true;
      mesh.add(m);
      if (type === 'bottle') {
        const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0365, 0.0365, 0.07, 14, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 }));
        lab.position.y = -0.04; mesh.add(lab);
        shape = new CANNON.Box(new CANNON.Vec3(0.035, 0.13, 0.035)); mass = 0.5;
      } else {
        for (let i = 0; i < 5; i++) {
          const s = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05 + Math.random() * 0.04, 3), mat);
          const a = i / 5 * Math.PI * 2;
          s.position.set(Math.cos(a) * 0.028, -0.075, Math.sin(a) * 0.028);
          s.rotation.x = Math.PI; mesh.add(s);
        }
        shape = new CANNON.Box(new CANNON.Vec3(0.035, 0.07, 0.035)); mass = 0.35;
      }
    } else if (type === 'cue' || type === 'halfcue') {
      const half = type === 'halfcue';
      const L = half ? 0.72 : 1.45;
      const wood = new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.4 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(half ? 0.016 : 0.007, 0.016, L, 10), wood);
      shaft.castShadow = true; mesh.add(shaft);
      if (!half) {
        const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.42, 10), new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.35 }));
        butt.position.y = -L / 2 + 0.21; mesh.add(butt);
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.015, 8), new THREE.MeshStandardMaterial({ color: 0x2a5bd6, roughness: 0.8 }));
        tip.position.y = L / 2; mesh.add(tip);
      } else {
        for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.05, 3), wood); sp.position.set((Math.random() - 0.5) * 0.02, L / 2 + 0.02, (Math.random() - 0.5) * 0.02); mesh.add(sp); }
      }
      shape = new CANNON.Box(new CANNON.Vec3(0.02, L / 2, 0.02)); mass = half ? 0.3 : 0.6;
    } else if (type === 'sword') {
      const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.22 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.5, 0.012), steel); blade.position.y = 0.3; blade.castShadow = true; mesh.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.039, 0.1, 4), steel); tip.position.y = 0.6; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.25; mesh.add(tip);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.04), brass); guard.position.y = 0.04; mesh.add(guard);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.13, 10), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.7 })); grip.position.y = -0.04; mesh.add(grip);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), brass); pom.position.y = -0.115; mesh.add(pom);
      shape = new CANNON.Box(new CANNON.Vec3(0.04, 0.36, 0.02)); mass = 0.9;
    } else if (type === 'spear') {
      const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.6 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 1.7, 8), wood); shaft.castShadow = true; mesh.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.25 })); head.position.y = 0.96; head.scale.z = 0.35; mesh.add(head);
      shape = new CANNON.Box(new CANNON.Vec3(0.025, 0.93, 0.025)); mass = 1.0;
    } else if (type === 'cash') {
      // a brick of rolled-up notes with a paper band: fits in the fist
      const notes = new THREE.MeshStandardMaterial({ map: getMoneyBagTex(), color: 0xbfe0b0, roughness: 0.85 });
      const brick = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.17, 0.05, 2, 0.008), notes); brick.castShadow = true; mesh.add(brick);
      for (const y of [-0.045, 0.045]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.079, 0.022, 0.054), new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 0.7 })); band.position.y = y; mesh.add(band); }
      shape = new CANNON.Box(new CANNON.Vec3(0.038, 0.085, 0.026)); mass = 0.8;
    } else if (type === 'rock') {
      // lumpy moon rock with glowing crystal veins
      const g = new THREE.IcosahedronGeometry(0.11, 3), pa = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const n = 1 + 0.18 * Math.sin(v.x * 41 + v.y * 13) * Math.cos(v.z * 37 - v.x * 7) + 0.08 * Math.sin(v.y * 90); v.multiplyScalar(n); pa.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: 0.95 })); m.scale.set(1, 0.85, 1.15); m.castShadow = true; mesh.add(m);
      const cm = new THREE.MeshStandardMaterial({ color: 0x5ad8ff, emissive: 0x2aa8ff, emissiveIntensity: 1.2, roughness: 0.4 });
      for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.025 + i * 0.006, 0), cm); const a = i * 1.7; c.position.set(Math.cos(a) * 0.09, 0.03 + (i % 2) * 0.03, Math.sin(a) * 0.1); c.scale.y = 1.8; c.rotation.set(a, 0, a * 0.5); mesh.add(c); }
      shape = new CANNON.Sphere(0.12); mass = 3;
    } else if (type === 'bat') {
      // turned wooden baseball bat with taped handle
      const prof = [[0, -0.42], [0.02, -0.42], [0.021, -0.405], [0.015, -0.395], [0.015, -0.2], [0.02, -0.05], [0.03, 0.15], [0.034, 0.36], [0.03, 0.415], [0, 0.42]].map(([x, y]) => new THREE.Vector2(x, y));
      const wood = new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.5 });
      const bat = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), wood); bat.castShadow = true; mesh.add(bat);
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 })); tape.position.y = -0.31; mesh.add(tape);
      shape = new CANNON.Box(new CANNON.Vec3(0.03, 0.42, 0.03)); mass = 0.95;
    } else if (type === 'crowbar') {
      // steel crowbar: straight bar with a curved claw at the top
      const path = new THREE.CurvePath();
      path.add(new THREE.LineCurve3(new THREE.Vector3(0, -0.34, 0), new THREE.Vector3(0, 0.26, 0)));
      path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.26, 0), new THREE.Vector3(0, 0.36, 0), new THREE.Vector3(0.07, 0.36, 0)));
      const bar = new THREE.Mesh(new THREE.TubeGeometry(path, 40, 0.011, 8), new THREE.MeshStandardMaterial({ color: 0x9a1414, metalness: 0.6, roughness: 0.45 })); bar.castShadow = true; mesh.add(bar);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 6), new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.8, roughness: 0.4 })); claw.position.set(0.085, 0.36, 0); claw.rotation.z = -Math.PI / 2; claw.scale.z = 0.4; mesh.add(claw);
      const foot = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 6), claw.material); foot.position.set(0, -0.355, 0); foot.rotation.x = Math.PI; foot.scale.z = 0.4; mesh.add(foot);
      shape = new CANNON.Box(new CANNON.Vec3(0.04, 0.36, 0.015)); mass = 1.4;
    } else if (type === 'wrench') {
      // big station spanner: rounded handle, open jaw head
      const steel = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.85, roughness: 0.38 });
      const handle = new THREE.Mesh(new RoundedBoxGeometry(0.034, 0.46, 0.016, 2, 0.006), steel); handle.castShadow = true; mesh.add(handle);
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.016, 8, 18, Math.PI * 1.45), steel); jaw.position.y = 0.27; jaw.rotation.z = Math.PI * 0.27; mesh.add(jaw);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.012, 8, 16), steel); ring.position.y = -0.25; mesh.add(ring);
      const grip = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.16, 0.022, 2, 0.008), new THREE.MeshStandardMaterial({ color: 0xe0601a, roughness: 0.7 })); grip.position.y = -0.12; mesh.add(grip);
      shape = new CANNON.Box(new CANNON.Vec3(0.05, 0.3, 0.015)); mass = 1.6;
    } else if (type === 'pipe') {
      // length of station pipe with an elbow joint and yellow hazard tape grip
      const metal = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.7, roughness: 0.45 });
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.62, 14), metal); tube.castShadow = true; mesh.add(tube);
      const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.022, 8, 14, Math.PI / 2), metal); elbow.position.set(0.05, 0.31, 0); elbow.rotation.z = Math.PI / 2; mesh.add(elbow);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 14), metal); cap.position.set(0.1, 0.36, 0); cap.rotation.z = Math.PI / 2; mesh.add(cap);
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.16, 14), new THREE.MeshStandardMaterial({ color: 0xf2c21a, roughness: 0.8 })); tape.position.y = -0.2; mesh.add(tape);
      shape = new CANNON.Box(new CANNON.Vec3(0.05, 0.36, 0.025)); mass = 1.3;
    } else if (type === 'stool') {
      const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.55 });
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.18, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x6e1e1e, roughness: 0.6 }));
      seat.position.y = 0.345; seat.castShadow = true; mesh.add(seat);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.72, 8), wood);
        leg.position.set(Math.cos(a) * 0.13, -0.02, Math.sin(a) * 0.13);
        leg.rotation.z = Math.cos(a) * 0.08; leg.rotation.x = -Math.sin(a) * 0.08;
        leg.castShadow = true; mesh.add(leg);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 20), wood);
      ring.rotation.x = Math.PI / 2; ring.position.y = -0.12; mesh.add(ring);
      shape = new CANNON.Box(new CANNON.Vec3(0.17, 0.37, 0.17)); mass = 4;
    }
    mesh.traverse(o => { o.userData.prop = this; });
    game.scene.add(mesh);
    this.body = new CANNON.Body({
      mass, shape, position: new CANNON.Vec3(x, y, z),
      collisionFilterGroup: G.PROP, collisionFilterMask: G.STATIC | G.PROP | G.RAG,
      linearDamping: 0.05, angularDamping: 0.1,
    });
    this.body.userData = { prop: this };
    this.body.sleepSpeedLimit = 0.15;
    game.world.addBody(this.body);
    this.body.addEventListener('collide', e => this.onCollide(e));
    this.thrown = 0;
    this.sync();
  }
  get damage() { return { bottle: 22, broken: 30, stool: 34, cue: 22, halfcue: 18, sword: 32, spear: 28, cash: 16, rock: 26, bat: 30, crowbar: 28, wrench: 27, pipe: 25 }[this.type]; }
  get reach() { return { bottle: 0.25, broken: 0.2, stool: 0.55, cue: 0.95, halfcue: 0.35, sword: 0.6, spear: 1.15, cash: 0.25, rock: 0.15 }[this.type]; }
  onCollide(e) {
    if (this.heldBy || this.dead) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const other = e.body.userData;
    if (this.thrown > 0 && other && other.enemy && v > 4) {
      this.game.events.push(() => {
        other.enemy.hit(other.part, this.damage + v * 1.5, this.body.velocity, { knockdown: true, source: 'throw' });
        this.game.fx.impact(this.body.position, 1);
        this.game.audio.punch(1.1);
        const r = this.breakHit(true); if (r === 'gone' || r === 'broken') this.destroy();
      });
      this.thrown = 0;
    } else if ((this.type === 'bottle') && v > 7) {
      this.game.events.push(() => { if (this.breakHit(true) === 'broken') this.destroy(); });
    }
  }
  breakHit(force) {
    if (this.dead) return null;
    this.durability -= 1;
    if (this.durability > 0 && !force) return null;
    if (this.type === 'bottle') {
      this.game.fx.glass(this.worldPos());
      this.game.audio.glass();
      return 'broken';
    }
    if (this.type === 'cue') { this.game.fx.splinters(this.worldPos()); this.game.audio.crack(); return 'halfcue'; }
    if (this.type === 'cash') { this.game.fx.notes(this.worldPos()); this.game.audio.cash(); if (this.game.onCash) this.game.onCash(this); return 'gone'; }
    if (this.type === 'sword' || this.type === 'spear') { this.game.fx.impact(this.worldPos(), 1.2); this.game.audio.clang(); return 'gone'; }
    if (this.type === 'rock') { this.game.fx.dust(this.worldPos()); this.game.audio.crack(); return 'gone'; }
    if (this.type === 'stool' || this.type === 'broken' || this.type === 'halfcue') {
      if (this.type !== 'broken') { this.game.fx.splinters(this.worldPos()); this.game.audio.crack(); }
      else { this.game.fx.glass(this.worldPos()); this.game.audio.glass(); }
      return 'gone';
    }
    return null;
  }
  worldPos() {
    const v = new THREE.Vector3(); this.mesh.getWorldPosition(v); return v;
  }
  sync() {
    if (this.heldBy) return;
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }
  update(dt) {
    if (this.thrown > 0) this.thrown -= dt;
    this.sync();
  }
  pickUp(hand) {
    this.heldBy = hand;
    this.game.world.removeBody(this.body);
    hand.group.add(this.mesh);
    const g = GRIPS[this.type] || GRIPS.bottle;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...g.dir).normalize());
    if (g.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.roll));
    this.mesh.quaternion.copy(q);
    this.mesh.position.set(...g.at).sub(new THREE.Vector3(...g.grip).applyQuaternion(q));
    this.mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  release(vel, spin) {
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    this.mesh.getWorldPosition(wp); this.mesh.getWorldQuaternion(wq);
    this.heldBy = null;
    this.game.scene.add(this.mesh);
    this.body.position.set(wp.x, wp.y, wp.z);
    this.body.quaternion.set(wq.x, wq.y, wq.z, wq.w);
    this.body.velocity.set(vel.x, vel.y, vel.z);
    this.body.angularVelocity.set(spin.x, spin.y, spin.z);
    this.game.world.addBody(this.body);
    this.body.wakeUp();
    this.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.sync();
  }
  destroy() {
    this.dead = true;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    if (!this.heldBy) this.game.world.removeBody(this.body);
  }
}
