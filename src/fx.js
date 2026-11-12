import * as THREE from 'three';

let dotTex = null;
function getDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c); return dotTex;
}
class PointPool {
  constructor(scene, n, size, opacity, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.grav = new Float32Array(n); this.blood = new Uint8Array(n);
    for (let k = 0; k < n; k++) this.pos[k * 3 + 1] = -100;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map: getDot(), alphaTest: 0.02, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, v, c, life, grav = 9.8, blood = 0) {
    const k = this.i; this.i = (this.i + 1) % this.n;
    this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z;
    this.vel[k * 3] = v.x; this.vel[k * 3 + 1] = v.y; this.vel[k * 3 + 2] = v.z;
    this.col[k * 3] = c.r; this.col[k * 3 + 1] = c.g; this.col[k * 3 + 2] = c.b;
    this.life[k] = life; this.grav[k] = grav; this.blood[k] = blood;
  }
  update(dt, onLand) {
    for (let k = 0; k < this.n; k++) {
      if (this.life[k] <= 0) continue;
      this.life[k] -= dt;
      const i = k * 3;
      this.vel[i + 1] -= this.grav[k] * dt;
      this.vel[i] *= 1 - dt * 0.8; this.vel[i + 2] *= 1 - dt * 0.8;
      this.pos[i] += this.vel[i] * dt; this.pos[i + 1] += this.vel[i + 1] * dt; this.pos[i + 2] += this.vel[i + 2] * dt;
      if (this.pos[i + 1] < 0.01) {
        if (this.blood[k] && onLand) onLand(this.pos[i], this.pos[i + 2]);
        this.life[k] = 0;
      }
      if (this.life[k] <= 0) this.pos[i + 1] = -100;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class FX {
  constructor(game) {
    this.game = game;
    this.small = new PointPool(game.scene, 900, 0.022, 0.95, false);
    this.big = new PointPool(game.scene, 220, 0.14, 0.35, false);
    this.glow = new PointPool(game.scene, 200, 0.05, 1, true);
    this.decals = [];
    this.decalGeo = new THREE.CircleGeometry(1, 14);
    this.decalMats = [0x5a0000, 0x4a0404, 0x6a0a0a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.decalI = 0;
    this.bloodOn = true;
    this._v = new THREE.Vector3(); this._c = new THREE.Color();
  }
  rnd(s) { return (Math.random() - 0.5) * s; }
  impact(p, s = 1) {
    for (let i = 0; i < 10 * s; i++) this.glow.emit(p, this._v.set(this.rnd(4), this.rnd(4) + 1, this.rnd(4)), this._c.setRGB(1.5, 1.3, 1.0), 0.12 + Math.random() * 0.1, 0);
    for (let i = 0; i < 8 * s; i++) this.small.emit(p, this._v.set(this.rnd(3), Math.random() * 2.5, this.rnd(3)), this._c.setRGB(0.85, 0.88, 0.9), 0.5, 9.8);
  }
  blood(p, dir, n = 12) {
    if (!this.bloodOn) { this.impact(p, 0.6); return; }
    const L = Math.hypot(dir.x, dir.y, dir.z) || 1;
    for (let i = 0; i < n; i++) {
      const sp = 1.5 + Math.random() * 3.5;
      this._v.set(dir.x / L * sp + this.rnd(2.5), dir.y / L * sp + Math.random() * 2.2, dir.z / L * sp + this.rnd(2.5));
      const d = 0.35 + Math.random() * 0.35;
      this.small.emit(p, this._v, this._c.setRGB(d, 0.01, 0.01), 1.4, 9.8, Math.random() < 0.35 ? 1 : 0);
    }
    for (let i = 0; i < n / 10; i++) this.big.emit(p, this._v.set(this.rnd(1), Math.random() * 0.6, this.rnd(1)), this._c.setRGB(0.25, 0.01, 0.01), 0.25, 1);
  }
  bigBlood(p) {
    if (!this.bloodOn) { this.dust(p); return; }
    this.blood(p, { x: 0, y: 1, z: 0 }, 60);
    for (let i = 0; i < 4; i++) this.decal(p.x + this.rnd(0.8), p.z + this.rnd(0.8), 0.18 + Math.random() * 0.25);
  }
  glass(p) {
    for (let i = 0; i < 30; i++) this.small.emit(p, this._v.set(this.rnd(5), Math.random() * 3, this.rnd(5)), this._c.setRGB(0.6, 0.9, 0.7), 1.2, 9.8);
    for (let i = 0; i < 10; i++) this.glow.emit(p, this._v.set(this.rnd(3), Math.random() * 2, this.rnd(3)), this._c.setRGB(1.2, 1.4, 1.2), 0.2, 0);
  }
  splinters(p) {
    for (let i = 0; i < 28; i++) this.small.emit(p, this._v.set(this.rnd(5), Math.random() * 3.5, this.rnd(5)), this._c.setRGB(0.4, 0.25, 0.12), 1.4, 9.8);
    this.dust(p);
  }
  dust(p) {
    for (let i = 0; i < 26; i++) this.big.emit(p, this._v.set(this.rnd(3), Math.random() * 1.2, this.rnd(3)), this._c.setRGB(0.55, 0.45, 0.35), 0.9, 0.5);
  }
  notes(p) {
    for (let i = 0; i < 40; i++) this.big.emit(p, this._v.set(this.rnd(4), 1 + Math.random() * 3, this.rnd(4)), this._c.setRGB(0.35, 0.75 + Math.random() * 0.2, 0.35), 2.2, 1.4);
    for (let i = 0; i < 10; i++) this.glow.emit(p, this._v.set(this.rnd(3), Math.random() * 2, this.rnd(3)), this._c.setRGB(1.4, 1.3, 0.6), 0.3, 0);
  }
  explosion(p, s = 1) {
    for (let i = 0; i < 60 * s; i++) this.glow.emit(p, this._v.set(this.rnd(10), Math.random() * 7, this.rnd(10)), this._c.setRGB(2, 1.1 + Math.random() * 0.5, 0.4), 0.3 + Math.random() * 0.4, 6);
    for (let i = 0; i < 60 * s; i++) this.big.emit(p, this._v.set(this.rnd(6), Math.random() * 3, this.rnd(6)), this._c.setRGB(0.6, 0.58, 0.55), 1.6, 0.6);
    for (let i = 0; i < 40 * s; i++) this.small.emit(p, this._v.set(this.rnd(8), Math.random() * 6, this.rnd(8)), this._c.setRGB(0.35, 0.33, 0.3), 1.5, 4);
  }
  sparks(p) { for (let i = 0; i < 22; i++) this.glow.emit(p, this._v.set(this.rnd(5), Math.random() * 3, this.rnd(5)), this._c.setRGB(2, 1.6, 0.6), 0.25 + Math.random() * 0.2, 6); }
  clearDecals() { for (const m of this.decals) if (m) m.position.y = -50; }
  decal(x, z, r) {
    let m = this.decals[this.decalI];
    if (!m) {
      m = new THREE.Mesh(this.decalGeo, this.decalMats[this.decalI % 3]);
      m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
      this.game.scene.add(m); this.decals[this.decalI] = m;
    }
    m.position.set(x, 0.003 + (this.decalI % 50) * 0.00004, z);
    m.scale.set(r * (0.7 + Math.random() * 0.6), r, 1);
    m.rotation.z = Math.random() * 6.28;
    this.decalI = (this.decalI + 1) % 90;
  }
  update(dt) {
    const land = (x, z) => { if (Math.random() < 0.5) this.decal(x, z, 0.03 + Math.random() * 0.07); };
    this.small.update(dt, land); this.big.update(dt); this.glow.update(dt);
  }
}
