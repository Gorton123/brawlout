// Modern London street kit: rounded cars, 3D shopfronts with brick upper floors, LED lamps, bus shelter, traffic light.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tx = (c, rep) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; };
const rnd = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

// ---------- textures ----------
const _tex = {};
export function brickTex(kind = 'red') {
  if (_tex[kind]) return _tex[kind];
  const [c, g] = cv(256, 256), r = rnd(kind.length * 31 + 7);
  const base = { red: [128, 62, 44], stock: [176, 150, 104], dark: [70, 52, 48] }[kind] || [128, 62, 44];
  g.fillStyle = kind === 'stock' ? '#8a8070' : '#6a6058'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) for (let x = -((y / 16) % 2) * 16; x < 256; x += 32) {
    const v = (r() - 0.5) * 34; g.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v * 0.6 | 0},${base[2] + v * 0.5 | 0})`; g.fillRect(x + 1, y + 1, 30, 14);
    if (r() < 0.15) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 1, y + 1, 30, 14); }
  }
  return (_tex[kind] = tx(c, [2, 2]));
}
export function renderTex() {
  if (_tex.render) return _tex.render;
  const [c, g] = cv(128, 128), r = rnd(5); g.fillStyle = '#d8d2c6'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},0.04)`; g.fillRect(r() * 128, r() * 128, 2, 2); }
  return (_tex.render = tx(c, [3, 3]));
}
export function signTex(name, bg, fg) {
  const [c, g] = cv(1024, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, bg); gr.addColorStop(1, '#000'); g.fillStyle = bg; g.fillRect(0, 0, 1024, 128);
  g.globalAlpha = 0.35; g.fillStyle = gr; g.fillRect(0, 64, 1024, 64); g.globalAlpha = 1;
  g.font = 'bold 84px Arial Black, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 18; g.fillStyle = fg; g.fillText(name, 512, 68);
  return tx(c);
}
function windowDisplayTex(seed, glow) {
  const [c, g] = cv(256, 128), r = rnd(seed);
  g.fillStyle = glow; g.fillRect(0, 0, 256, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(0,0,0,${0.18 + r() * 0.25})`; const w = 14 + r() * 26; g.fillRect(8 + i * 27, 40 + r() * 30, w, 90); }
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 110, 256, 18);
  return tx(c);
}
function plateTex(front) {
  const [c, g] = cv(256, 56); g.fillStyle = front ? '#f2f2ee' : '#f2c81a'; g.fillRect(0, 0, 256, 56);
  g.fillStyle = '#1a3aa0'; g.fillRect(0, 0, 26, 56); g.fillStyle = '#111'; g.font = 'bold 38px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BR4 WLO', 140, 30);
  return tx(c);
}

// ---------- cars ----------
const shapeFrom = pts => { const s = new THREE.Shape(); s.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]); } s.closePath(); return s; };
const extrude = (shape, depth, bevel = 0.05) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 }); g.translate(0, 0, -depth / 2); return g; };
const SHARED = {};
function shared() {
  if (SHARED.ok) return SHARED;
  SHARED.ok = true;
  SHARED.glass = new THREE.MeshPhysicalMaterial({ color: 0x0c141c, roughness: 0.35, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.88 });
  SHARED.trim = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.6 });
  SHARED.tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  SHARED.rim = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.35 });
  SHARED.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0) });
  SHARED.tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.08, 0.06) });
  SHARED.tyreGeo = new THREE.TorusGeometry(0.27, 0.1, 10, 22);
  SHARED.rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 18);
  SHARED.plateF = new THREE.MeshBasicMaterial({ map: plateTex(true) });
  SHARED.plateR = new THREE.MeshBasicMaterial({ map: plateTex(false) });
  return SHARED;
}
// style: 'hatch' | 'saloon' | 'suv'. Car faces +X, centred on the origin, wheels on y=0.
export function makeCar(color, style = 'saloon') {
  const S = shared(), car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.2 });
  const L = style === 'hatch' ? 3.9 : style === 'suv' ? 4.5 : 4.5, W = style === 'suv' ? 1.86 : 1.76, h0 = style === 'suv' ? 0.42 : 0.32, belt = style === 'suv' ? 1.08 : 0.9, roof = style === 'suv' ? 1.72 : 1.42;
  const hl = L / 2;
  // lower body (side profile, rounded nose and tail)
  const body = extrude(shapeFrom([[-hl, h0], [hl - 0.2, h0], [hl, h0 + 0.2, hl, h0 + 0.35], [hl, belt - 0.12], [hl - 0.05, belt, hl - 0.4, belt], [-hl + 0.3, belt], [-hl, belt, -hl, belt - 0.2], [-hl, h0 + 0.1]]), W - 0.1, 0.05);
  const bm = new THREE.Mesh(body, paint); bm.castShadow = true; bm.receiveShadow = true; car.add(bm);
  // cabin (glass) + roof
  const fr = style === 'hatch' ? -hl + 0.15 : -hl + 0.65, fw = hl - (style === 'suv' ? 1.15 : 1.45);
  const cabin = extrude(shapeFrom(style === 'hatch'
    ? [[fr, belt], [fw, belt], [fw - 0.75, roof], [fr + 0.25, roof], [fr, belt + 0.35]]
    : [[fr, belt], [fw, belt], [fw - 0.8, roof], [fr + 0.55, roof]]), W - 0.36, 0.06);
  const cm = new THREE.Mesh(cabin, S.glass); cm.castShadow = true; car.add(cm);
  const rf = new THREE.Mesh(new RoundedBoxGeometry((fw - 0.8) - (fr + (style === 'hatch' ? 0.25 : 0.55)) + 0.1, 0.06, W - 0.32, 2, 0.03), paint);
  rf.position.set(((fw - 0.8) + (fr + (style === 'hatch' ? 0.25 : 0.55))) / 2, roof + 0.03, 0); car.add(rf);
  // pillars
  for (const z of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), paint); p.position.set(fr + 0.4, belt + 0.25, z * (W / 2 - 0.15)); car.add(p); }
  // wheels + arches
  for (const wx of [hl - 0.85, -hl + 0.8]) for (const z of [-1, 1]) {
    const wg = new THREE.Group(); wg.position.set(wx, 0.37, z * (W / 2 - 0.05)); car.add(wg);
    const t = new THREE.Mesh(S.tyreGeo, S.tyre); wg.add(t);
    const rim = new THREE.Mesh(S.rimGeo, S.rim); rim.rotation.x = Math.PI / 2; wg.add(rim);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.02), S.trim); sp.rotation.z = i / 5 * Math.PI; sp.position.z = z * 0.065; wg.add(sp); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16, Math.PI), S.trim); arch.position.set(wx, 0.37, z * (W / 2 + 0.02)); car.add(arch);
  }
  // lights, grille, plates, mirrors, door lines, bumpers
  for (const z of [-1, 1]) {
    const hd = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.12, 0.36, 2, 0.03), S.head); hd.position.set(hl + 0.03, belt - 0.2, z * (W / 2 - 0.28)); car.add(hd);
    const tl = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.12, 0.42, 2, 0.03), S.tail); tl.position.set(-hl - 0.03, belt - 0.18, z * (W / 2 - 0.25)); car.add(tl);
    const mir = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.1, 0.12, 2, 0.03), paint); mir.position.set(fw - 0.15, belt + 0.08, z * (W / 2 + 0.06)); car.add(mir);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, belt - h0 - 0.12, 0.01), S.trim); line.position.set(0.15, (belt + h0) / 2, z * (W / 2 + 0.005)); car.add(line);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.02), S.rim); handle.position.set(-0.25, belt - 0.12, z * (W / 2 + 0.01)); car.add(handle);
  }
  const grille = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.18, W * 0.42, 2, 0.02), S.trim); grille.position.set(hl + 0.02, h0 + 0.2, 0); car.add(grille);
  for (const [x, m] of [[hl + 0.06, S.plateF], [-hl - 0.06, S.plateR]]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), m); pl.position.set(x, h0 + 0.12, 0); pl.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2; car.add(pl); }
  for (const x of [hl - 0.05, -hl + 0.05]) { const bp = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.14, W + 0.02, 2, 0.05), S.trim); bp.position.set(x, h0 + 0.02, 0); car.add(bp); }
  car.userData.size = { L, W, H: roof };
  return car;
}

// ---------- buildings ----------
// A terraced building: shopfront at street level, 2-3 brick/render floors, cornice. Faces +Z, front face at z=0, centred on x.
export function makeShop(name, signBg, signFg, opts = {}) {
  const r = rnd(name.length * 13 + (opts.seed || 1)), g = new THREE.Group();
  const W = opts.width || 9.6, floors = opts.floors || (r() < 0.5 ? 2 : 3), fh = 3.1, gh = 3.8, H = gh + floors * fh;
  const kind = ['red', 'stock', 'render', 'dark'][Math.floor(r() * 4)];
  const wallMat = kind === 'render' ? new THREE.MeshStandardMaterial({ map: renderTex(), color: [0xe8e2d6, 0xd8e4ea, 0xf0dcc8][Math.floor(r() * 3)], roughness: 0.9 })
    : new THREE.MeshStandardMaterial({ map: brickTex(kind), roughness: 0.92 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(W, H - gh, 0.4), wallMat); wall.position.set(0, gh + (H - gh) / 2, -0.2); wall.receiveShadow = true; g.add(wall);
  if (wallMat.map) { wallMat.map = wallMat.map.clone(); wallMat.map.needsUpdate = true; wallMat.map.repeat.set(W / 2.4, (H - gh) / 2.4); }
  // upper windows with frames + sills, some lit
  const nW = Math.max(2, Math.round(W / 3));
  for (let f = 0; f < floors; f++) for (let i = 0; i < nW; i++) {
    const x = -W / 2 + (i + 0.5) * W / nW, y = gh + f * fh + fh * 0.55;
    const lit = r() < 0.45;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.7), lit ? new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.09 + r() * 0.05, 0.6, 0.45 + r() * 0.2) }) : new THREE.MeshStandardMaterial({ color: 0x141c26, roughness: 0.4, metalness: 0.5 }));
    pane.position.set(x, y, 0.02); g.add(pane);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.86, 0.08), trim); fr.position.set(x, y, -0.02); g.add(fr);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), trim); bar.position.set(x, y + 0.2, 0.04); g.add(bar);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.22), trim); sill.position.set(x, y - 0.96, 0.08); g.add(sill);
    if (r() < 0.12) { const ac = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.45, 0.35, 2, 0.04), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.6 })); ac.position.set(x + 0.4, y - 1.25, 0.2); g.add(ac); }
  }
  // cornice + parapet
  const corn = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.25, 0.5), trim); corn.position.set(0, H - 0.1, 0); g.add(corn);
  // drainpipe
  const dp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, H, 8), dark); dp.position.set(W / 2 - 0.12, H / 2, 0.08); g.add(dp);
  // ---- shopfront: pilasters, fascia sign (lit), big window, door, shutter box
  for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, gh, 0.5), dark); p.position.set(x, gh / 2, 0); g.add(p); }
  const fasc = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.75, 0.3), new THREE.MeshBasicMaterial({ map: signTex(name, signBg, signFg) })); fasc.position.set(0, gh - 0.45, 0.12); g.add(fasc);
  const fascTop = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.5), dark); fascTop.position.set(0, gh - 0.02, 0.05); g.add(fascTop);
  const shutter = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.2, 0.25), new THREE.MeshStandardMaterial({ color: 0x5a5e62, metalness: 0.6, roughness: 0.5 })); shutter.position.set(0, gh - 0.95, 0.1); g.add(shutter);
  const ww = W * 0.62, wx = -W / 2 + 0.4 + ww / 2;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(ww, 2.2), new THREE.MeshBasicMaterial({ map: windowDisplayTex(name.length, signFg), color: new THREE.Color(0.85, 0.85, 0.85) })); disp.position.set(wx, 1.65, -0.2); g.add(disp);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, 2.2), new THREE.MeshPhysicalMaterial({ color: 0xaaccdd, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.18, clearcoat: 1 })); glass.position.set(wx, 1.65, -0.02); g.add(glass);
  const wframe = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.12, 0.1, 0.12), dark); wframe.position.set(wx, 0.5, 0); g.add(wframe);
  const stall = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.12, 0.5, 0.2), dark); stall.position.set(wx, 0.25, 0); g.add(stall);
  const dx = W / 2 - 0.4 - (W - 0.8 - ww) / 2;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 0.08), new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.5 })); door.position.set(dx, 1.3, -0.15); g.add(door);
  const dglass = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(signFg).multiplyScalar(0.55) })); dglass.position.set(dx, 1.55, -0.1); g.add(dglass);
  // projecting lit sign
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(signBg).multiplyScalar(1.6) })); blade.position.set(-W / 2 + 0.6, gh + 0.6, 0.5); g.add(blade);
  g.userData.height = H;
  return g;
}

// ---------- street furniture ----------
export function ledLamp(scene, x, z, side) {
  const pole = new THREE.MeshStandardMaterial({ color: 0x3a3f44, metalness: 0.6, roughness: 0.45 });
  const g = new THREE.Group(); g.position.set(x, 0.14, z); scene.add(g);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6, 10), pole); p.position.y = 3; p.castShadow = true; g.add(p);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), pole); arm.rotation.x = Math.PI / 2; arm.position.set(0, 5.95, side * 0.55); g.add(arm);
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.1, 0.7, 2, 0.04), pole); head.position.set(0, 5.95, side * 1.15); g.add(head);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 2.1) })); led.rotation.x = Math.PI / 2; led.position.set(0, 5.89, side * 1.15); g.add(led);
  return g;
}
export function busShelter(scene, x, z, rotY, adText) {
  const g = new THREE.Group(); g.position.set(x, 0.14, z); g.rotation.y = rotY; scene.add(g);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.6, roughness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xc8dde8, transparent: true, opacity: 0.2, roughness: 0.35, clearcoat: 1 });
  const roof = new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.08, 1.5, 2, 0.03), metal); roof.position.y = 2.5; g.add(roof);
  for (const px of [-1.6, 1.6]) for (const pz of [-0.65, 0.65]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8), metal); p.position.set(px, 1.25, pz); g.add(p); }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0), glass); back.position.set(0, 1.25, -0.65); g.add(back);
  const ad = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), new THREE.MeshBasicMaterial({ map: signTex(adText, '#101418', '#7fe0ff') })); ad.position.set(1.62, 1.2, 0); ad.rotation.y = -Math.PI / 2; g.add(ad);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.32), metal); seat.position.set(0, 0.5, -0.45); g.add(seat);
  return g;
}
export function trafficLight(scene, x, z, rotY) {
  const g = new THREE.Group(); g.position.set(x, 0.14, z); g.rotation.y = rotY; scene.add(g);
  const m = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, metalness: 0.4, roughness: 0.5 });
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 8), m); p.position.y = 1.6; g.add(p);
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.9, 0.26, 2, 0.04), m); box.position.set(0, 3.3, 0); g.add(box);
  const cols = [[1.8, 0.1, 0.08], [0.3, 0.2, 0.05], [0.05, 0.3, 0.12]];
  cols.forEach((c, i) => { const l = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c) })); l.position.set(0, 3.58 - i * 0.27, 0.135); g.add(l); });
  return g;
}
export function puddle(scene, x, z, s) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.35, metalness: 0.9, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.008, z); m.scale.set(s, s * 0.6, 1); scene.add(m); return m;
}
