// Extra arenas: Rome (Colosseum), Moon (lunar base), Street (London at night)
import * as THREE from 'three';
import { makeCar, makeShop, ledLamp, busShelter, trafficLight, puddle } from './street.js';
import * as CANNON from 'cannon-es';
import { G } from './groups.js';
import { mk, rng, tex, speckle } from './textures.js';
import { Prop } from './props.js';

// ---------------------------------------------------------------- shared helpers
function kit(game) {
  const scene = game.stageRoot, world = game.world, colliders = [];
  const staticBox = (hx, hy, hz, x, y, z, addCollider = true, ry = 0) => {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), position: new CANNON.Vec3(x, y, z),
      collisionFilterGroup: G.STATIC, collisionFilterMask: G.RAG | G.PROP });
    if (ry) b.quaternion.setFromEuler(0, ry, 0);
    world.addBody(b);
    if (addCollider) {
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      const ex = hx * c + hz * s, ez = hx * s + hz * c;
      colliders.push({ minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez });
    }
    return b;
  };
  const mesh = (geo, mat, x, y, z, cast = true, recv = true, parent = scene) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
  };
  const floorPlane = () => {
    const fb = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), collisionFilterGroup: G.STATIC, collisionFilterMask: G.RAG | G.PROP });
    fb.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(fb);
  };
  // invisible ring of wall boxes for ragdolls/props in round arenas
  const ringWall = (r, h, n = 24) => {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, w = Math.PI * 2 * r / n / 2 + 0.05;
      const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(w, h, 0.4)), position: new CANNON.Vec3(Math.sin(a) * (r + 0.4), h, Math.cos(a) * (r + 0.4)),
        collisionFilterGroup: G.STATIC, collisionFilterMask: G.RAG | G.PROP });
      b.quaternion.setFromEuler(0, a, 0); world.addBody(b);
    }
  };
  return { scene, world, colliders, staticBox, mesh, floorPlane, ringWall };
}
function flameTex() {
  const [c, g] = mk(64, 128);
  const gr = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,190,60,0.95)'); gr.addColorStop(0.6, 'rgba(255,80,10,0.5)'); gr.addColorStop(1, 'rgba(120,10,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(70, 60, 64, 120, 32, 124); g.bezierCurveTo(0, 120, -6, 60, 32, 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _flame = null;
function flame(scene, x, y, z, s = 1) {
  _flame = _flame || flameTex();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: _flame, color: new THREE.Color(2.2, 1.6, 1.1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sp.position.set(x, y, z); sp.scale.set(0.45 * s, 0.9 * s, 1); sp.userData.base = sp.scale.clone(); sp.userData.ph = Math.random() * 10; scene.add(sp);
  return sp;
}
export function glowRing(scene, color) {
  const [c, g] = mk(128, 128);
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.85, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const inner = g.createRadialGradient(64, 64, 0, 64, 64, 50); inner.addColorStop(0, 'rgba(255,255,255,0.35)'); inner.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = inner; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 3; scene.add(m); return m;
}

// ---------------------------------------------------------------- textures
function sandTex() {
  const W = 1024, [c, g] = mk(W, W), r = rng(5);
  g.fillStyle = '#c9a272'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * W, rr = 40 + r() * 160; const gr = g.createRadialGradient(x, y, 0, x, y, rr); const l = r() < 0.5; gr.addColorStop(0, l ? 'rgba(235,205,160,0.35)' : 'rgba(150,110,70,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  speckle(g, W, W, 26000, 2, 0.25, false, r); speckle(g, W, W, 16000, 2, 0.25, true, r);
  g.strokeStyle = 'rgba(120,85,50,0.18)'; g.lineWidth = 3;
  for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * W; g.beginPath(); g.arc(x, y, 30 + r() * 120, r() * 6, r() * 6 + 1.2); g.stroke(); }
  for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * W; g.fillStyle = 'rgba(90,15,10,0.28)'; g.beginPath(); g.ellipse(x, y, 6 + r() * 26, 4 + r() * 16, r() * 3, 0, 7); g.fill(); }
  return tex(c, 6, 6);
}
function stoneTex(seed = 3, base = [176, 158, 130]) {
  const W = 1024, H = 512, [c, g] = mk(W, H), r = rng(seed);
  g.fillStyle = '#4a4036'; g.fillRect(0, 0, W, H);
  const rows = 6, rh = H / rows;
  for (let y = 0; y < rows; y++) {
    let x = -(y % 2) * 80;
    while (x < W) {
      const w = 110 + r() * 120, v = (r() - 0.5) * 40;
      g.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v * 0.8})`;
      g.fillRect(x + 3, y * rh + 3, w - 6, rh - 6);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 3, y * rh + 3, w - 6, 5);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 3, y * rh + rh - 9, w - 6, 6);
      x += w;
    }
  }
  speckle(g, W, H, 22000, 2, 0.22, false, r); speckle(g, W, H, 9000, 2, 0.15, true, r);
  for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(40,30,20,0.35)'; g.lineWidth = 1.5; g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += r() * 20; g.lineTo(x, y); } g.stroke(); }
  return tex(c);
}
function crowdTex(seed, cols) {
  const W = 2048, H = 256, [c, g] = mk(W, H), r = rng(seed);
  g.fillStyle = 'rgba(30,20,14,1)'; g.fillRect(0, 0, W, H);
  for (let row = 0; row < 3; row++) {
    const by = 110 + row * 60;
    for (let x = 0; x < W; x += 15 + r() * 10) {
      const col = cols[Math.floor(r() * cols.length)], y = by + (r() - 0.5) * 12, s = 0.8 + r() * 0.4;
      g.fillStyle = col; g.beginPath(); g.ellipse(x, y + 30 * s, 13 * s, 32 * s, 0, 0, 7); g.fill();
      const skin = ['#d9a77f', '#b98058', '#8d5a3b', '#e8c09a'][Math.floor(r() * 4)];
      g.fillStyle = skin; g.beginPath(); g.arc(x, y - 6 * s, 8 * s, 0, 7); g.fill();
      if (r() < 0.25) { g.strokeStyle = skin; g.lineWidth = 4 * s; g.beginPath(); g.moveTo(x + 6, y + 6); g.lineTo(x + 12 + r() * 6, y - 26 * s); g.stroke(); }
    }
  }
  const t = tex(c, 4, 1); return t;
}
function archTex() {
  const W = 1024, H = 512, [c, g] = mk(W, H), r = rng(9);
  g.fillStyle = '#b8a07c'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 20000, 2, 0.2, false, r);
  for (let lv = 0; lv < 2; lv++) {
    const y0 = lv * 256;
    g.fillStyle = 'rgba(80,60,40,0.5)'; g.fillRect(0, y0 + 20, W, 10);
    for (let i = 0; i < 8; i++) {
      const x = i * 128 + 24, w = 80, top = y0 + 70, bot = y0 + 240;
      g.fillStyle = '#20150d'; g.beginPath(); g.moveTo(x, bot); g.lineTo(x, top + 40); g.arc(x + w / 2, top + 40, w / 2, Math.PI, 0); g.lineTo(x + w, bot); g.fill();
      g.fillStyle = 'rgba(255,190,110,0.12)'; g.fillRect(x + 6, top + 50, w - 12, bot - top - 60);
      g.fillStyle = '#cdb690'; g.fillRect(x - 18, top - 10, 12, bot - top + 10); g.fillRect(x + w + 6, top - 10, 12, bot - top + 10);
    }
  }
  return tex(c, 8, 1);
}
function bannerTex(main = '#8e0f12', text = 'SPQR') {
  const [c, g] = mk(256, 640);
  g.fillStyle = main; g.fillRect(0, 0, 256, 640);
  g.strokeStyle = '#e3b23c'; g.lineWidth = 14; g.strokeRect(14, 14, 228, 560);
  g.fillStyle = '#e3b23c'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.fillText(text, 128, 170);
  g.beginPath(); g.arc(128, 330, 70, 0, 7); g.lineWidth = 10; g.stroke();
  for (let i = 0; i < 12; i++) { const a = Math.PI * 0.75 + i * 0.13; g.beginPath(); g.ellipse(128 + Math.cos(a) * 70, 330 + Math.sin(a) * 70, 14, 6, a + 1.5, 0, 7); g.fill(); const b = Math.PI * 0.25 - i * 0.13; g.beginPath(); g.ellipse(128 + Math.cos(b) * 70, 330 + Math.sin(b) * 70, 14, 6, b - 1.5, 0, 7); g.fill(); }
  g.beginPath(); g.moveTo(0, 590); for (let i = 0; i <= 8; i++) g.lineTo(i * 32, i % 2 ? 640 : 590); g.lineTo(256, 590); g.fill();
  return tex(c);
}
function regolithTex() {
  const W = 1024, [c, g] = mk(W, W), r = rng(21);
  g.fillStyle = '#8b8a86'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 40000, 2, 0.35, false, r); speckle(g, W, W, 30000, 2, 0.3, true, r);
  for (let i = 0; i < 60; i++) {
    const x = r() * W, y = r() * W, rr = 8 + Math.pow(r(), 2) * 90;
    const gr = g.createRadialGradient(x - rr * 0.2, y - rr * 0.2, rr * 0.2, x, y, rr);
    gr.addColorStop(0, 'rgba(40,40,40,0.35)'); gr.addColorStop(0.75, 'rgba(60,60,60,0.2)'); gr.addColorStop(0.9, 'rgba(230,230,225,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
  }
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(60,60,58,0.3)'; g.beginPath(); g.ellipse(r() * W, r() * W, 4, 9, r() * 3, 0, 7); g.fill(); }
  return tex(c, 5, 5);
}
function earthTex() {
  const W = 1024, H = 512, [c, g] = mk(W, H), r = rng(4);
  g.fillStyle = '#1d4f9c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) { const x = r() * W, y = 80 + r() * (H - 160); g.fillStyle = r() < 0.6 ? '#3f7d3a' : '#9a7d4a'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * 7, rr = 30 + r() * 70; g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr); } g.fill(); }
  g.fillStyle = '#eef'; g.fillRect(0, 0, W, 34); g.fillRect(0, H - 30, W, 30);
  for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(r() * W, r() * H, 20 + r() * 80, 6 + r() * 14, (r() - 0.5) * 0.4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function asphaltTex() {
  const W = 1024, [c, g] = mk(W, W), r = rng(31);
  g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 60000, 2, 0.35, true, r); speckle(g, W, W, 40000, 2, 0.4, false, r);
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(10,10,12,0.35)'; g.beginPath(); g.ellipse(r() * W, r() * W, 40 + r() * 120, 20 + r() * 60, r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(15,15,15,0.7)'; g.lineWidth = 2;
  for (let i = 0; i < 16; i++) { g.beginPath(); let x = r() * W, y = r() * W; g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  return tex(c, 4, 2);
}
function slabTex() {
  const W = 512, [c, g] = mk(W, W), r = rng(41);
  g.fillStyle = '#55555a'; g.fillRect(0, 0, W, W);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = (r() - 0.5) * 24; g.fillStyle = `rgb(${120 + v},${120 + v},${124 + v})`; g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122); }
  speckle(g, W, W, 20000, 2, 0.25, false, r);
  for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(20,20,20,0.4)'; g.beginPath(); g.arc(r() * W, r() * W, 3 + r() * 6, 0, 7); g.fill(); }
  return tex(c, 12, 2);
}
function shopTex(name, sign, glow) {
  const W = 512, H = 768, [c, g] = mk(W, H), r = rng(name.length * 7 + 3);
  // brick upper floors
  g.fillStyle = '#5a2e22'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < 470; y += 16) for (let x = -((y / 16) % 2) * 16; x < W; x += 32) { const v = (r() - 0.5) * 30; g.fillStyle = `rgb(${120 + v},${58 + v * 0.5},${42 + v * 0.4})`; g.fillRect(x + 1, y + 1, 30, 14); }
  for (const wy of [70, 270]) for (const wx of [70, 300]) {
    g.fillStyle = '#e8e0d0'; g.fillRect(wx - 10, wy - 10, 162, 172);
    const lit = r() < 0.5; g.fillStyle = lit ? '#f3c66a' : '#1a2230'; g.fillRect(wx, wy, 142, 152);
    g.fillStyle = '#e8e0d0'; g.fillRect(wx + 68, wy, 6, 152); g.fillRect(wx, wy + 72, 142, 6);
  }
  // fascia sign
  g.fillStyle = sign; g.fillRect(0, 480, W, 80);
  g.fillStyle = '#fff'; g.font = 'bold 50px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, W / 2, 522);
  // shop window
  g.fillStyle = glow; g.fillRect(20, 575, W - 150, 170);
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 6; i++) g.fillRect(40 + i * 56, 640 + (i % 2) * 20, 36, 80);
  g.fillStyle = '#20140c'; g.fillRect(W - 120, 575, 100, 193); g.fillStyle = '#c9a24a'; g.fillRect(W - 40, 670, 8, 8);
  g.fillStyle = '#111'; g.fillRect(0, 565, W, 10); g.fillRect(0, 745, W, 23);
  return tex(c);
}
function moneyBagTex() {
  const [c, g] = mk(256, 256), r = rng(77);
  g.fillStyle = '#b89a62'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) { g.fillStyle = 'rgba(90,70,40,0.25)'; g.fillRect(i, 0, 1, 256); g.fillRect(0, i, 256, 1); }
  speckle(g, 256, 256, 3000, 2, 0.3, false, r);
  g.fillStyle = '#1f5f2a'; g.font = 'bold 120px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('£', 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const TEX = { moneyBag: null };
export function getMoneyBagTex() { return TEX.moneyBag || (TEX.moneyBag = moneyBagTex()); }

// ---------------------------------------------------------------- ROME
export function buildRome(game) {
  const K = kit(game), { scene, mesh, staticBox } = K;
  const R = 10.6;
  K.floorPlane();
  const sand = sandTex();
  const floor = mesh(new THREE.CircleGeometry(R + 1.5, 64), new THREE.MeshStandardMaterial({ map: sand, roughness: 0.96, bumpMap: sand, bumpScale: 0.8 }), 0, 0, 0, false, true);
  floor.rotation.x = -Math.PI / 2;
  // podium wall
  const st = stoneTex(3); st.repeat.set(14, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: st, bumpMap: st, bumpScale: 1.5, roughness: 0.9, side: THREE.BackSide });
  mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 3.2, 72, 1, true), wallMat, 0, 1.6, 0, false, true);
  const marble = new THREE.MeshStandardMaterial({ color: 0xc9bea6, roughness: 0.45 });
  const cap = mesh(new THREE.TorusGeometry(R + 0.1, 0.12, 8, 96), marble, 0, 3.2, 0, false, false); cap.rotation.x = Math.PI / 2;
  const base = mesh(new THREE.TorusGeometry(R, 0.1, 6, 96), new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.9 }), 0, 0.08, 0, false, true); base.rotation.x = Math.PI / 2;
  K.ringWall(R, 3);
  // gates (spawn) with dark tunnels and iron portcullis
  const gateAngles = [Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI * 0.25, -Math.PI * 0.25];
  const ironM = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.8, roughness: 0.45 });
  const spawns = [];
  for (const a of gateAngles) {
    const g = new THREE.Group(); g.position.set(Math.sin(a) * (R - 0.02), 0, Math.cos(a) * (R - 0.02)); g.rotation.y = a + Math.PI; scene.add(g);
    mesh(new THREE.PlaneGeometry(2.2, 2.6), new THREE.MeshBasicMaterial({ color: 0x050302 }), 0, 1.3, -0.01, false, false, g);
    const arch = mesh(new THREE.TorusGeometry(1.15, 0.16, 8, 20, Math.PI), marble, 0, 2.3, 0.02, false, false, g);
    for (const sx of [-1.15, 1.15]) mesh(new THREE.BoxGeometry(0.32, 2.3, 0.3), marble, sx, 1.15, 0.02, true, false, g);
    for (let i = -4; i <= 4; i++) mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6), ironM, i * 0.24, 1.25, 0.05, false, false, g);
    for (const y of [0.6, 1.4, 2.1]) mesh(new THREE.BoxGeometry(2.1, 0.04, 0.04), ironM, 0, y, 0.05, false, false, g);
    spawns.push(new THREE.Vector3(Math.sin(a) * (R - 0.9), 0, Math.cos(a) * (R - 0.9)));
  }
  // seating tiers with crowd
  const tierStone = new THREE.MeshStandardMaterial({ map: (() => { const t = stoneTex(7, [190, 175, 150]); t.repeat.set(30, 0.4); return t; })(), roughness: 0.9, side: THREE.DoubleSide });
  const crowdCols = ['#e8e0cf', '#8e1b1b', '#e3b23c', '#3c5c8e', '#d8d0bd', '#5a3a6a', '#c7b591', '#7a2a1a'];
  game.crowdBands = [];
  for (let i = 0; i < 6; i++) {
    const r0 = R + 0.6 + i * 1.5, y0 = 3.2 + i * 1.15;
    mesh(new THREE.CylinderGeometry(r0, r0, 1.15, 72, 1, true), tierStone, 0, y0 + 0.575 - 1.15, 0, false, true);
    const top = mesh(new THREE.RingGeometry(r0, r0 + 1.5, 72, 1), tierStone, 0, y0, 0, false, true); top.rotation.x = -Math.PI / 2;
    const ct = crowdTex(10 + i, crowdCols); ct.repeat.set(5 + i, 1);
    const band = mesh(new THREE.CylinderGeometry(r0 + 0.75, r0 + 0.75, 1.2, 72, 1, true), new THREE.MeshStandardMaterial({ map: ct, roughness: 1, side: THREE.BackSide }), 0, y0 + 0.55, 0, false, false);
    band.userData.ph = i; game.crowdBands.push(band);
  }
  // outer arcade wall
  const outer = mesh(new THREE.CylinderGeometry(R + 10.5, R + 10.5, 8, 72, 1, true), new THREE.MeshStandardMaterial({ map: archTex(), roughness: 0.9, side: THREE.BackSide }), 0, 12, 0, false, false);
  // velarium poles + awning strips
  const cloth = new THREE.MeshStandardMaterial({ color: 0xd9c39a, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, rr = R + 10.2;
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), new THREE.MeshStandardMaterial({ color: 0x5a4028 }), Math.sin(a) * rr, 18, Math.cos(a) * rr, false, false);
    if (i % 2 === 0) {
      const s = mesh(new THREE.PlaneGeometry(3.2, 7), i % 4 ? cloth : new THREE.MeshStandardMaterial({ color: 0x9a1a1a, roughness: 1, side: THREE.DoubleSide }), Math.sin(a) * (rr - 3), 19.2, Math.cos(a) * (rr - 3), false, false);
      s.rotation.set(-Math.PI / 2 + 0.25, 0, 0); s.rotation.order = 'YXZ'; s.rotation.y = a;
    }
  }
  // emperor's box
  const box = new THREE.Group(); box.position.set(0, 3.2, -(R + 0.4)); scene.add(box);
  const purple = new THREE.MeshStandardMaterial({ color: 0x4b1259, roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 1, roughness: 0.3 });
  mesh(new THREE.BoxGeometry(4.2, 0.25, 1.8), marble, 0, 0, -0.4, true, true, box);
  mesh(new THREE.BoxGeometry(4.2, 0.9, 0.12), purple, 0, 0.55, 0.45, false, false, box);
  for (const x of [-2, -0.7, 0.7, 2]) mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.6, 14), marble, x, 1.3, 0.4, true, false, box);
  mesh(new THREE.BoxGeometry(4.6, 0.35, 2.0), marble, 0, 2.7, -0.3, true, false, box);
  const drape = mesh(new THREE.PlaneGeometry(4.2, 1.1), purple, 0, 2.15, 0.42, false, false, box);
  const eagle = mesh(new THREE.ConeGeometry(0.25, 0.5, 4), gold, 0, 3.15, 0.5, false, false, box); eagle.rotation.z = Math.PI;
  // emperor (seated figure)
  const emp = new THREE.Group(); emp.position.set(0, 0.15, -0.3); box.add(emp);
  mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.9 }), 0, 0.5, 0, false, false, emp);
  mesh(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd9a77f, roughness: 0.6 }), 0, 1.1, 0, false, false, emp);
  const laurel = mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), gold, 0, 1.18, 0, false, false, emp); laurel.rotation.x = Math.PI / 2;
  const armE = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0xd9a77f }), 0.3, 0.9, 0.1, false, false, emp); armE.rotation.z = -0.6;
  game.emperorArm = armE; game.emperorPos = new THREE.Vector3(0, 4.4, -(R + 0.2));
  // banners on the podium wall
  const bt = bannerTex(), bt2 = bannerTex('#5a1270', 'ROMA');
  for (let i = 0; i < 10; i++) {
    const a = (i + 0.5) / 10 * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI) < 0.3 || Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) + Math.PI) < 0.3) continue;
    const b = mesh(new THREE.PlaneGeometry(0.85, 2.1), new THREE.MeshStandardMaterial({ map: i % 2 ? bt2 : bt, roughness: 0.85, side: THREE.DoubleSide }), Math.sin(a) * (R - 0.06), 2.0, Math.cos(a) * (R - 0.06), false, true);
    b.rotation.y = a + Math.PI;
  }
  // braziers with fire
  game.flames = [];
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, metalness: 0.9, roughness: 0.35 });
  const braz = [];
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.25) / 6 * Math.PI * 2, rr = R - 0.7, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.1, 8), bronze, x, 0.55, z);
    mesh(new THREE.CylinderGeometry(0.32, 0.16, 0.28, 16, 1, true), bronze, x, 1.2, z);
    mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.3) }), x, 1.3, z, false, false).rotation.x = -Math.PI / 2;
    game.flames.push(flame(scene, x, 1.62, z, 1.2));
    staticBox(0.3, 0.7, 0.3, x, 0.7, z);
    braz.push([x, z]);
  }
  game.torchLights = [];
  for (const k of [0, 2, 4]) { const L = new THREE.PointLight(0xff9a40, 9, 9, 1.8); L.position.set(braz[k][0], 2.0, braz[k][1]); scene.add(L); game.torchLights.push(L); }
  // stone altars (slam surfaces) + weapon racks
  const altarM = new THREE.MeshStandardMaterial({ map: (() => { const t = stoneTex(12, [205, 195, 175]); t.repeat.set(1, 0.5); return t; })(), roughness: 0.7 });
  const altars = [[-4.2, -3.4], [4.6, 2.8]];
  game.surfaces = [];
  for (const [x, z] of altars) {
    mesh(new THREE.BoxGeometry(2.0, 0.95, 1.1), altarM, x, 0.475, z);
    mesh(new THREE.BoxGeometry(2.2, 0.1, 1.3), marble, x, 1.0, z);
    staticBox(1.1, 0.52, 0.65, x, 0.52, z);
    game.surfaces.push({ name: 'ALTAR', minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.45, maxZ: z + 0.45, y: 1.07 });
  }
  // spike trap grates
  const grateM = new THREE.MeshStandardMaterial({ color: 0x2a2520, metalness: 0.7, roughness: 0.6 });
  game.traps = [];
  for (const [x, z] of [[0, -1], [-5.5, 2.5], [5.2, -3.5], [-1.8, 5.4], [2.6, 6.2]]) {
    const grate = mesh(new THREE.BoxGeometry(1.4, 0.03, 1.4), grateM, x, 0.015, z, false, true);
    const warn = glowRing(scene, new THREE.Color(1.6, 0.25, 0.1)); warn.position.set(x, 0.04, z); warn.scale.setScalar(1.9); warn.visible = false;
    const spikes = new THREE.Group(); spikes.position.set(x, -0.9, z); scene.add(spikes);
    for (let i = 0; i < 16; i++) mesh(new THREE.ConeGeometry(0.05, 0.85, 6), ironM, ((i % 4) - 1.5) * 0.32, 0.42, (Math.floor(i / 4) - 1.5) * 0.32, true, false, spikes);
    game.traps.push({ x, z, grate, warn, spikes, t: 0, state: 'idle' });
  }
  // weapons lying in the sand
  const props = [];
  props.push(new Prop(game, 'sword', -2.5, 0.06, 1.5), new Prop(game, 'sword', 3.0, 0.06, -1.0), new Prop(game, 'spear', 1.2, 0.06, 3.8), new Prop(game, 'spear', -6.5, 0.06, -1.2));
  for (const p of props) { p.body.quaternion.setFromEuler(Math.PI / 2, 0, Math.random() * 3); p.sync(); }
  // lighting: low warm sun + sky fill
  const sun = new THREE.DirectionalLight(0xffd8a8, 3.2);
  sun.position.set(-9, 16, 7); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  game.keyLight = sun;
  scene.add(new THREE.HemisphereLight(0x9cc0ea, 0x8a6a40, 1.1));
  // sky dome
  const [sc2, sg] = mk(16, 256); const gr = sg.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2e5f9e'); gr.addColorStop(0.55, '#8fb6d8'); gr.addColorStop(0.8, '#f2c58a'); gr.addColorStop(1, '#f2c58a'); sg.fillStyle = gr; sg.fillRect(0, 0, 16, 256);
  const skyT = new THREE.CanvasTexture(sc2); skyT.colorSpace = THREE.SRGBColorSpace;
  const sky = mesh(new THREE.SphereGeometry(45, 24, 12), new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false, depthWrite: false }), 0, 0, 0, false, false);
  // dust motes in the sun
  const N = 400, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * R; pos[i * 3] = Math.sin(a) * rr; pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = Math.cos(a) * rr; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  game.motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe2b0, size: 0.015, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(game.motes);
  return { colliders: K.colliders, props, spawns };
}

// ---------------------------------------------------------------- MOON
export function buildMoon(game) {
  const K = kit(game), { scene, mesh, staticBox } = K;
  const R = 12;
  K.floorPlane();
  const reg = regolithTex();
  const floor = mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ map: reg, bumpMap: reg, bumpScale: 2.5, roughness: 1, color: 0xb8b6b0 }), 0, 0, 0, false, true);
  floor.rotation.x = -Math.PI / 2;
  // crater rim boundary: ring of boulders + raised berm
  const rockM = new THREE.MeshStandardMaterial({ map: reg, color: 0x9a9893, roughness: 1, flatShading: true });
  const berm = mesh(new THREE.TorusGeometry(R + 2.2, 2.0, 10, 64), rockM, 0, -0.6, 0, false, true); berm.rotation.x = Math.PI / 2; berm.scale.set(1, 1, 0.75);
  const r = rng(3);
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * Math.PI * 2 + r() * 0.1, rr = R + 0.5 + r() * 1.2, s = 0.5 + r() * 1.1;
    const g = new THREE.IcosahedronGeometry(s, 0); const m = mesh(g, rockM, Math.sin(a) * rr, s * 0.4, Math.cos(a) * rr, true, true);
    m.rotation.set(r() * 3, r() * 3, r() * 3); m.scale.y = 0.6 + r() * 0.5;
  }
  K.ringWall(R + 0.2, 3);
  // distant hills
  for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28, rr = 30 + r() * 6, s = 3 + r() * 5; const m = mesh(new THREE.ConeGeometry(s * 2, s, 7), rockM, Math.sin(a) * rr, s * 0.3, Math.cos(a) * rr, false, false); m.rotation.y = r() * 3; }
  // base: dome + modules
  const white = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.5, metalness: 0.2 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.4, metalness: 0.6 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x8fc8ff, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.32, emissive: 0x16304a, emissiveIntensity: 0.5, depthWrite: false });
  const domeX = -7.5, domeZ = -6.5;
  mesh(new THREE.SphereGeometry(3.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glassM, domeX, 0, domeZ, false, false);
  mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.5, 32), white, domeX, 0.25, domeZ);
  const domeRing = mesh(new THREE.TorusGeometry(3.25, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.8, 1.3) }), domeX, 0.55, domeZ, false, false); domeRing.rotation.x = Math.PI / 2;
  staticBox(2.4, 1.5, 2.4, domeX, 1.5, domeZ);
  for (const [x, z, ry] of [[-2.8, -9.2, 0], [6.5, -7.2, 0.7]]) {
    const m = mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.5, 24), white, x, 1.1, z); m.rotation.set(0, ry, Math.PI / 2);
    for (const d of [-1.6, 0, 1.6]) { const b = mesh(new THREE.TorusGeometry(1.12, 0.06, 6, 24), panel, x + Math.cos(ry) * d, 1.1, z - Math.sin(ry) * d, false, false); b.rotation.y = ry + Math.PI / 2; }
    staticBox(2.3, 1.2, 1.1, x, 1.2, z, true, ry);
    const win = mesh(new THREE.PlaneGeometry(2.6, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.5, 0.8) }), x + Math.sin(ry) * 1.12, 1.4, z + Math.cos(ry) * 1.12, false, false); win.rotation.y = ry;
  }
  // lander
  const goldFoil = new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.35 });
  const lander = new THREE.Group(); lander.position.set(7.2, 0, 4.5); scene.add(lander);
  mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.0, 8), goldFoil, 0, 1.3, 0, true, true, lander);
  mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), white, 0, 2.2, 0, true, true, lander);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; const l = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), panel, Math.sin(a) * 1.1, 0.7, Math.cos(a) * 1.1, true, false, lander); l.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), panel, Math.sin(a) * 1.45, 0.03, Math.cos(a) * 1.45, true, false, lander); }
  staticBox(1.0, 1.4, 1.0, 7.2, 1.4, 4.5);
  // supply crates (slam surface)
  const crateM = new THREE.MeshStandardMaterial({ color: 0xd0d3d8, roughness: 0.6, metalness: 0.3 });
  const stripeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 0.05) });
  game.surfaces = [];
  for (const [x, z] of [[-4.0, 4.0], [3.0, -3.8]]) {
    mesh(new THREE.BoxGeometry(1.9, 0.9, 1.1), crateM, x, 0.45, z);
    mesh(new THREE.BoxGeometry(1.92, 0.08, 1.12), stripeM, x, 0.7, z, false, false);
    staticBox(0.95, 0.47, 0.55, x, 0.47, z);
    game.surfaces.push({ name: 'CRATE', minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.4, maxZ: z + 0.4, y: 1.0 });
  }
  // antenna + solar panels
  mesh(new THREE.CylinderGeometry(0.05, 0.08, 5, 6), panel, -9.5, 2.5, 3.5);
  const dish = mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, 0.9), white, -9.5, 5, 3.5); dish.rotation.x = 2.2;
  const blink = mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) }), -9.5, 5.2, 3.5, false, false);
  game.blink = blink;
  const solarM = new THREE.MeshStandardMaterial({ color: 0x1a2a66, metalness: 0.8, roughness: 0.25, emissive: 0x0a1030 });
  for (let i = 0; i < 3; i++) { const p = mesh(new THREE.BoxGeometry(2.2, 0.05, 1.2), solarM, 2 + i * 2.5, 1.1, -10.6); p.rotation.x = -0.5; mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), panel, 2 + i * 2.5, 0.55, -10.6); }
  // stars, earth, sun
  const N = 2500, sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const v = new THREE.Vector3().randomDirection(); if (v.y < -0.1) v.y = -v.y; v.multiplyScalar(80); sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, sizeAttenuation: true, fog: false, depthWrite: false }));
  scene.add(stars);
  const earth = mesh(new THREE.SphereGeometry(7, 48, 24), new THREE.MeshStandardMaterial({ map: earthTex(), roughness: 0.7, emissive: 0x112244, emissiveIntensity: 0.4, fog: false }), -25, 26, -55, false, false);
  earth.rotation.z = 0.4; game.earth = earth;
  const atmo = mesh(new THREE.SphereGeometry(7.4, 48, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.6, 1.5), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false }), -25, 26, -55, false, false);
  const sun = new THREE.DirectionalLight(0xffffff, 4.2);
  sun.position.set(14, 12, 9); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 45;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target); game.keyLight = sun;
  scene.add(new THREE.HemisphereLight(0x6070a0, 0x303030, 0.55));
  const dl = new THREE.PointLight(0x58b8ff, 10, 10, 1.6); dl.position.set(domeX + 2, 1.5, domeZ + 2.5); scene.add(dl);
  const sunDisc = mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5.5), fog: false }), 42, 36, 27, false, false); sunDisc.lookAt(0, 0, 0);
  // meteor warning ring pool
  game.meteors = []; game.meteorT = 4;
  const props = [];
  for (const [x, z] of [[-1.5, 2.5], [-5.5, -1.5]]) props.push(new Prop(game, 'rock', x, 0.3, z));
  props.push(new Prop(game, 'wrench', 2.5, 0.3, 1.5)); props.push(new Prop(game, 'pipe', -3, 0.3, 4)); props.push(new Prop(game, 'wrench', 5, 0.3, -3));
  const spawns = [new THREE.Vector3(domeX + 2.6, 0, domeZ + 2.6), new THREE.Vector3(R - 1.2, 0, 0), new THREE.Vector3(-R + 1.2, 0, 1), new THREE.Vector3(0, 0, R - 1.2), new THREE.Vector3(1.5, 0, -R + 1.5)];
  return { colliders: K.colliders, props, spawns };
}

// ---------------------------------------------------------------- STREET (London, night)
export function buildStreet(game) {
  const K = kit(game), { scene, mesh, staticBox } = K;
  const X = 13, Z = 5.4;
  K.floorPlane();
  const asph = asphaltTex();
  const road = mesh(new THREE.PlaneGeometry(40, 7), new THREE.MeshStandardMaterial({ map: asph, roughness: 0.35, metalness: 0.15, bumpMap: asph, bumpScale: 1 }), 0, 0, 0, false, true); road.rotation.x = -Math.PI / 2;
  // lane markings
  const lineM = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.6 });
  for (let x = -18; x < 18; x += 3) { const l = mesh(new THREE.PlaneGeometry(1.6, 0.12), lineM, x, 0.006, 0, false, true); l.rotation.x = -Math.PI / 2; }
  for (const z of [-3.3, 3.3]) { const y1 = mesh(new THREE.PlaneGeometry(40, 0.08), new THREE.MeshStandardMaterial({ color: 0xd8b020 }), 0, 0.006, z * 0.95, false, true); y1.rotation.x = -Math.PI / 2; }
  // zebra crossing
  for (let i = 0; i < 7; i++) { const s = mesh(new THREE.PlaneGeometry(0.5, 2.8), lineM, -6 + 0, 0.007, -2.4 + i * 0.8, false, true); s.rotation.set(-Math.PI / 2, 0, Math.PI / 2); s.scale.set(1, 0.25, 1); s.position.x = -6.5; }
  // pavements + kerbs
  const slab = slabTex();
  for (const s of [-1, 1]) {
    mesh(new THREE.BoxGeometry(40, 0.14, 3.2), new THREE.MeshStandardMaterial({ map: slab, roughness: 0.75 }), 0, 0.07, s * (3.5 + 1.6), false, true);
    mesh(new THREE.BoxGeometry(40, 0.16, 0.18), new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.8 }), 0, 0.08, s * 3.55, false, true);
  }
  // shopfronts both sides
  const shops = [['CHICKEN SHOP', '#c8102e', '#ffe9a8'], ['OFF LICENCE', '#123c7a', '#d8f0ff'], ['BOOKIES', '#0c6b3a', '#c8ffd8'], ['KEBAB HOUSE', '#d06a00', '#ffe0b0'], ['LAUNDERETTE', '#3a2a7a', '#e0e8ff'], ['CASH 4 GOLD', '#9a7a10', '#fff2b0'], ['VAPE SHOP', '#1a1a1a', '#d0b0ff'], ['NAILS', '#b01a6a', '#ffd0e8']];
  let si = 0;
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const [n, col, glow] = shops[si++];
    const b = makeShop(n, col, glow, { seed: si * 7 + (s > 0 ? 3 : 0), width: 9.8 });
    b.position.set(-15 + i * 10, 0.14, s * 6.7); b.rotation.y = s > 0 ? Math.PI : 0; scene.add(b);
    b.traverse(o => { if (o.isMesh) { o.receiveShadow = true; } });
  }
  // the far ends of the street: more buildings so it doesn't stop dead
  for (const [x, z, ry] of [[-21, 6.7, Math.PI], [-21, -6.7, 0], [21, 6.7, Math.PI], [21, -6.7, 0]]) { const b = makeShop(['CAFE', 'BARBER', 'PHONES', 'PIZZA'][Math.abs(x + z * 3) % 4 | 0], '#202a3a', '#ffd27a', { seed: x * 3 + z, width: 9.8 }); b.position.set(x, 0.14, z); b.rotation.y = ry; scene.add(b); }
  busShelter(scene, 6.5, -5.4, 0, 'BRAWL OUT');
  for (const [x, z, ry] of [[-6.5, -3.9, 0], [-6.5, 3.9, Math.PI]]) trafficLight(scene, x, z, ry);
  for (const [x, z, sc] of [[-3, 1.2, 1.4], [6, -1.8, 1.1], [10.5, 0.6, 0.9], [-10, -1, 1.2]]) puddle(scene, x, z, sc);
  staticBox(20, 4, 0.4, 0, 4, 7.0, false); staticBox(20, 4, 0.4, 0, 4, -7.0, false);
  staticBox(0.4, 4, 7, X + 0.6, 4, 0, false); staticBox(0.4, 4, 7, -X - 0.6, 4, 0, false);
  // end of street: a red bus and police tape barrier
  const red = new THREE.MeshStandardMaterial({ color: 0xc0141c, roughness: 0.35, metalness: 0.3 });
  const glassDark = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.1, metalness: 0.8 });
  const bus = new THREE.Group(); bus.position.set(X + 2.2, 0, 0); bus.rotation.y = Math.PI / 2; scene.add(bus);
  mesh(new THREE.BoxGeometry(10, 3.9, 2.5), red, 0, 2.35, 0, true, true, bus);
  for (const y of [1.7, 3.4]) mesh(new THREE.BoxGeometry(9.2, 0.8, 2.52), glassDark, 0, y, 0, false, false, bus);
  for (const x of [-3.2, 3.2]) for (const z of [-1.2, 1.2]) { const w = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }), x, 0.5, z, true, false, bus); w.rotation.x = Math.PI / 2; }
  const busSign = mesh(new THREE.PlaneGeometry(1.8, 0.35), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.2) }), 0, 4.05, 1.26, false, false, bus);
  const tapeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.2, 0.1) });
  for (const y of [0.8, 1.1]) mesh(new THREE.BoxGeometry(0.03, 0.08, 10.8), tapeM, -X - 0.4, y, 0, false, false);
  // parked cars (slam surfaces)
  game.surfaces = [];
  const carCols = [0x1a1a1e, 0xd8d8dc, 0x2a4a8a, 0x7a1010];
  const cars = [[-8.5, -2.4, 0], [4.5, -2.4, 0], [-1.5, 2.4, Math.PI], [9.5, 2.4, Math.PI]];
  game.carLights = [];
  const styles = ['saloon', 'hatch', 'suv', 'saloon'];
  cars.forEach(([x, z, ry], i) => {
    const c = makeCar(carCols[i], styles[i]); c.position.set(x, 0, z); c.rotation.y = ry; scene.add(c);
    c.traverse(o => { if (o.isMesh) o.castShadow = true; });
    staticBox(2.0, 0.75, 0.9, x, 0.75, z, true, ry);
    game.surfaces.push({ name: 'CAR BONNET', minX: x - 1.8, maxX: x + 1.8, minZ: z - 0.8, maxZ: z + 0.8, y: 1.0, car: c });
  });
  // street lamps (sodium) + a red phone box + bins + bollards
  const pole = new THREE.MeshStandardMaterial({ color: 0x1e2224, metalness: 0.7, roughness: 0.4 });
  game.lampLights = [];
  for (const [x, z] of [[-10, -4.0], [0, -4.0], [10, -4.0], [-5, 4.0], [5, 4.0]]) ledLamp(scene, x, z, z < 0 ? 1 : -1);
  for (const [x, z] of [[-10, -3.0], [10, -3.0], [-5, 3.0], [5, 3.0]]) { const L = new THREE.PointLight(0xdfe8ff, 10, 12, 1.7); L.position.set(x, 5.6, z); scene.add(L); game.lampLights.push(L); }
  const kiosk = new THREE.Group(); kiosk.position.set(-12.2, 0.14, -5.6); scene.add(kiosk);
  mesh(new THREE.BoxGeometry(0.95, 2.5, 0.95), red, 0, 1.25, 0, true, true, kiosk);
  mesh(new THREE.BoxGeometry(0.8, 1.7, 0.96), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.1, 0.8) }), 0, 1.3, 0, false, false, kiosk);
  staticBox(0.5, 1.3, 0.5, -12.2, 1.3, -5.6);
  const binM = new THREE.MeshStandardMaterial({ color: 0x1a3a1a, roughness: 0.6 });
  for (const [x, z] of [[-3.2, 4.6], [7.4, -4.6], [-11, 4.5]]) { mesh(new THREE.BoxGeometry(0.75, 1.1, 0.75), binM, x, 0.69, z); staticBox(0.4, 0.6, 0.4, x, 0.6, z); }
  for (let x = -12; x <= 12; x += 3) for (const z of [-3.75, 3.75]) mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 8), pole, x + 1.5, 0.45, z, true, false);
  // night sky with a few stars and a glow over the city
  const [sc2, sg] = mk(16, 256); const gr = sg.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#05060d'); gr.addColorStop(0.6, '#141a2e'); gr.addColorStop(0.85, '#4a2a2a'); gr.addColorStop(1, '#4a2a2a'); sg.fillStyle = gr; sg.fillRect(0, 0, 16, 256);
  const skyT = new THREE.CanvasTexture(sc2); skyT.colorSpace = THREE.SRGBColorSpace;
  mesh(new THREE.SphereGeometry(45, 24, 12), new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false, depthWrite: false }), 0, 0, 0, false, false);
  // key spot light for shadows
  const key = new THREE.SpotLight(0xffc890, 60, 22, 0.9, 0.6, 1.5);
  key.position.set(0, 9, 0.5); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 1; key.shadow.camera.far = 16;
  scene.add(key); scene.add(key.target); game.keyLight = key;
  scene.add(new THREE.HemisphereLight(0x3a4a7a, 0x2a1a14, 0.75));
  // rain
  const N = 1800, rp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { rp[i * 3] = (Math.random() - 0.5) * 30; rp[i * 3 + 1] = Math.random() * 10; rp[i * 3 + 2] = (Math.random() - 0.5) * 13; }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  game.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0x9ab0d0, size: 0.03, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(game.rain);
  const props = [];
  for (const [x, z] of [[-6, 0.8], [2, -1.2], [7, 1.0], [-2, 4.7], [-9.5, 4.6]]) props.push(new Prop(game, 'cash', x, 0.25, z));
  for (const [x, z] of [[1.5, 4.8], [-7, -4.8]]) props.push(new Prop(game, 'bottle', x, 0.3, z, Math.floor(Math.random() * 4)));
  props.push(new Prop(game, 'bat', -4, 0.3, -3.8)); props.push(new Prop(game, 'crowbar', 4.5, 0.3, 3.9)); props.push(new Prop(game, 'bat', 9, 0.3, -2));
  const spawns = [new THREE.Vector3(-X + 0.8, 0, -1.5), new THREE.Vector3(-X + 0.8, 0, 1.5), new THREE.Vector3(X - 0.8, 0, -1.2), new THREE.Vector3(X - 0.8, 0, 1.5), new THREE.Vector3(0, 0, 4.8)];
  return { colliders: K.colliders, props, spawns };
}
