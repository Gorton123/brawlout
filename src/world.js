import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G } from './groups.js';
import * as T from './textures.js';
import { Prop } from './props.js';

export const ROOM = { minX: -9, maxX: 9, minZ: -7, maxZ: 7, H: 4.2 };

export function buildPub(game) {
  const scene = game.stageRoot, world = game.world;
  const colliders = []; // xz AABBs for character movement
  const props = [];

  const staticBox = (hx, hy, hz, x, y, z, addCollider = true) => {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), position: new CANNON.Vec3(x, y, z),
      collisionFilterGroup: G.STATIC, collisionFilterMask: G.RAG | G.PROP });
    world.addBody(b);
    if (addCollider) colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
    return b;
  };
  const mesh = (geo, mat, x, y, z, cast = true, recv = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m;
  };

  // ---------- floor ----------
  const floorTex = T.woodFloor();
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorTex, bumpScale: 1.2, roughness: 0.62, metalness: 0.0 });
  const floor = mesh(new THREE.PlaneGeometry(18, 14), floorMat, 0, 0, 0, false, true);
  floor.rotation.x = -Math.PI / 2;
  const fb = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), collisionFilterGroup: G.STATIC, collisionFilterMask: G.RAG | G.PROP });
  fb.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(fb);

  // ---------- walls ----------
  const brickTex = T.brick();
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, bumpMap: brickTex, bumpScale: 3, roughness: 0.92 });
  const plasterTex = T.plaster();
  const upperMat = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.95 });
  const panelTex = T.darkWood();
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.5 });
  const walls = [
    { w: 18, x: 0, z: ROOM.minZ, ry: 0 },
    { w: 18, x: 0, z: ROOM.maxZ, ry: Math.PI },
    { w: 14, x: ROOM.minX, z: 0, ry: Math.PI / 2 },
    { w: 14, x: ROOM.maxX, z: 0, ry: -Math.PI / 2 },
  ];
  for (const wl of walls) {
    const bt = brickTex.clone(); bt.repeat.set(wl.w / 6, 0.85); bt.needsUpdate = true;
    const bm = brickMat.clone(); bm.map = bt; bm.bumpMap = bt;
    const m = mesh(new THREE.PlaneGeometry(wl.w, 3.0), bm, wl.x, 1.5 + 0.0, wl.z, false, true);
    m.rotation.y = wl.ry;
    const up = mesh(new THREE.PlaneGeometry(wl.w, ROOM.H - 3.0), upperMat, wl.x, 3.0 + (ROOM.H - 3) / 2, wl.z, false, true);
    up.rotation.y = wl.ry;
    // wainscot
    const n = new THREE.Vector3(Math.sin(wl.ry), 0, Math.cos(wl.ry));
    const p = mesh(new THREE.BoxGeometry(wl.w, 1.0, 0.05), panelMat, wl.x + n.x * 0.025, 0.5, wl.z + n.z * 0.025, false, true);
    p.rotation.y = wl.ry;
    const rail = mesh(new THREE.BoxGeometry(wl.w, 0.06, 0.09), panelMat, wl.x + n.x * 0.045, 1.02, wl.z + n.z * 0.045, false, true);
    rail.rotation.y = wl.ry;
    const trim = mesh(new THREE.BoxGeometry(wl.w, 0.12, 0.07), panelMat, wl.x + n.x * 0.035, 3.0, wl.z + n.z * 0.035, false, true);
    trim.rotation.y = wl.ry;
  }
  staticBox(9, 3, 0.5, 0, 3, ROOM.minZ - 0.5, false);
  staticBox(9, 3, 0.5, 0, 3, ROOM.maxZ + 0.5, false);
  staticBox(0.5, 3, 7, ROOM.minX - 0.5, 3, 0, false);
  staticBox(0.5, 3, 7, ROOM.maxX + 0.5, 3, 0, false);

  // ---------- ceiling + beams ----------
  const ceil = mesh(new THREE.PlaneGeometry(18, 14), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 }), 0, ROOM.H, 0, false, false);
  ceil.rotation.x = Math.PI / 2;
  for (let x = -7.5; x <= 7.5; x += 2.5) mesh(new THREE.BoxGeometry(0.25, 0.3, 14), panelMat, x, ROOM.H - 0.15, 0, false, false);

  // ---------- bar ----------
  const barTopMat = new THREE.MeshStandardMaterial({ color: 0x3b1d0c, roughness: 0.22, metalness: 0.05, map: panelTex });
  const barX0 = -6, barX1 = 4, barZ = -5.5;
  const bw = barX1 - barX0, bcx = (barX0 + barX1) / 2;
  mesh(new THREE.BoxGeometry(bw, 1.05, 0.7), panelMat, bcx, 0.525, barZ);
  mesh(new THREE.BoxGeometry(bw + 0.2, 0.07, 0.9), barTopMat, bcx, 1.09, barZ + 0.05);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.25 });
  const rail = mesh(new THREE.CylinderGeometry(0.03, 0.03, bw, 10), brass, bcx, 0.22, barZ + 0.48);
  rail.rotation.z = Math.PI / 2;
  staticBox(bw / 2 + 0.1, 0.56, 0.45, bcx, 0.56, barZ + 0.05);
  // taps
  for (let i = 0; i < 5; i++) {
    const tx = -1.5 + i * 0.35;
    mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.35, 10), brass, tx, 1.3, barZ - 0.15);
    const h = mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: [0xaa2222, 0x222222, 0xddaa22, 0x2255aa, 0x228844][i], roughness: 0.4 }), tx, 1.55, barZ - 0.12);
    h.rotation.x = 0.2;
  }
  // back shelves with glowing bottles
  const shelfMat = panelMat;
  const glassCols = [0x2fa84f, 0xb5651d, 0x3fb0d8, 0xd8c23f, 0xc0392b, 0x8e44ad];
  for (let s = 0; s < 3; s++) {
    const y = 1.35 + s * 0.55;
    mesh(new THREE.BoxGeometry(bw - 1, 0.04, 0.3), shelfMat, bcx, y, ROOM.minZ + 0.16, false, true);
    for (let i = 0; i < 26; i++) {
      const c = glassCols[(i * 7 + s * 3) % glassCols.length];
      const hgt = 0.22 + ((i * 13 + s) % 5) * 0.03;
      const b = mesh(new THREE.CylinderGeometry(0.035, 0.04, hgt, 8),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.1, transparent: true, opacity: 0.9 }),
        barX0 + 0.8 + i * ((bw - 1.6) / 25), y + 0.02 + hgt / 2, ROOM.minZ + 0.16, false, false);
    }
  }
  // mirror strip
  const mirror = mesh(new THREE.PlaneGeometry(bw - 1, 1.7), new THREE.MeshStandardMaterial({ color: 0x223040, metalness: 1, roughness: 0.15 }), bcx, 2.0, ROOM.minZ + 0.02, false, false);
  // LED strip under shelves
  const led = mesh(new THREE.BoxGeometry(bw - 1, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.45, 0.15).multiplyScalar(4) }), bcx, 1.33, ROOM.minZ + 0.3, false, false);

  // ---------- neon sign ----------
  const neon = mesh(new THREE.PlaneGeometry(4.2, 1.31), new THREE.MeshBasicMaterial({ map: T.neonSign('BRAWL OUT', '#ff2a6d', 'FOR ALL OUT'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), bcx, 3.55, ROOM.minZ + 0.05, false, false);
  neon.material.color.setScalar(2.2);
  game.neon = neon;
  const neonLight = new THREE.PointLight(0xff2a6d, 6, 7, 2); neonLight.position.set(bcx, 3.4, ROOM.minZ + 0.8); scene.add(neonLight);

  // side neon "OPEN"
  const open = mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: T.neonSign('OPEN', '#05d9e8'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), ROOM.maxX - 0.05, 2.3, 3.5, false, false);
  open.rotation.y = -Math.PI / 2; open.material.color.setScalar(2);

  // ---------- windows (right wall) ----------
  for (const wz of [-2.5, 3.5]) {
    const glass = mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.14, 0.32) }), ROOM.maxX - 0.02, 2.0, wz, false, false);
    glass.rotation.y = -Math.PI / 2;
    const fm = new THREE.MeshStandardMaterial({ color: 0x1b0f08, roughness: 0.6 });
    for (const dy of [-0.72, 0, 0.72]) mesh(new THREE.BoxGeometry(0.08, 0.06, 2.1), fm, ROOM.maxX - 0.05, 2.0 + dy, wz, false, false);
    for (const dz of [-1.02, 0, 1.02]) mesh(new THREE.BoxGeometry(0.08, 1.5, 0.06), fm, ROOM.maxX - 0.05, 2.0, wz + dz, false, false);
  }

  // ---------- posters + dartboard ----------
  const posters = [['FIGHT', 'FRIDAY NIGHT', 0], ['ROME', 'COLOSSEUM - NOW OPEN', 30], ['MOON', 'ALIEN BRAWL', 200]];
  posters.forEach((p, i) => {
    const m = mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshStandardMaterial({ map: T.poster(p[0], p[1], p[2]), roughness: 0.8 }), ROOM.minX + 0.03, 2.0, 1.0 + i * 1.3, false, true);
    m.rotation.y = Math.PI / 2;
  });
  const dart = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.04, 32), new THREE.MeshStandardMaterial({ map: dartTex(), roughness: 0.8 }), ROOM.minX + 0.03, 1.75, -2.6, false, false);
  dart.rotation.z = Math.PI / 2;
  // door (left wall) - spawn point
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2b1608, roughness: 0.5, map: panelTex });
  const door = mesh(new THREE.BoxGeometry(0.08, 2.2, 1.1), doorMat, ROOM.minX + 0.04, 1.1, -4.6, false, true);
  const exitSign = mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: T.labelTex('#0a5a2a', '#cfffdf', 'EXIT'), color: new THREE.Color(2, 2, 2) }), ROOM.minX + 0.05, 2.45, -4.6, false, false);
  exitSign.rotation.y = Math.PI / 2;
  const door2 = mesh(new THREE.BoxGeometry(1.1, 2.2, 0.08), doorMat, 6.6, 1.1, ROOM.minZ + 0.04, false, true);

  // ---------- jukebox ----------
  const juke = mesh(new THREE.BoxGeometry(0.9, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a0d0d, roughness: 0.3, metalness: 0.4 }), 8.4, 0.8, 6.3);
  juke.rotation.y = -Math.PI / 4;
  const jg = mesh(new THREE.PlaneGeometry(0.7, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.4) }), 8.18, 1.1, 6.08, false, false);
  jg.rotation.y = -Math.PI / 4;
  game.jukeGlow = jg;
    staticBox(0.5, 0.8, 0.5, 8.4, 0.8, 6.3);

  // ---------- tables ----------
  const tableTop = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.3, map: panelTex });
  const iron = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.7 });
  const tables = [[-6.3, 1.2], [-6.3, 4.6], [6.4, -2.4]];
  let ci = 0;
  for (const [tx, tz] of tables) {
    mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 28), tableTop, tx, 0.78, tz);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 10), iron, tx, 0.39, tz);
    mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.04, 20), iron, tx, 0.02, tz);
    staticBox(0.45, 0.41, 0.45, tx, 0.41, tz);
    for (let k = 0; k < 2; k++) {
      props.push(new Prop(game, 'bottle', tx - 0.2 + k * 0.35, 0.95, tz + (k ? 0.15 : -0.1), ci++));
    }
    props.push(new Prop(game, 'stool', tx + 0.95, 0.38, tz + 0.2));
    props.push(new Prop(game, 'stool', tx - 0.95, 0.38, tz - 0.3));
  }
  // bar stools + bottles on bar
  for (let i = 0; i < 4; i++) props.push(new Prop(game, 'stool', -4.5 + i * 2.2, 0.38, barZ + 0.95));
  for (let i = 0; i < 3; i++) props.push(new Prop(game, 'bottle', -3.5 + i * 2.4, 1.27, barZ + 0.1, ci++));

  // ---------- pool table ----------
  const pool = new THREE.Group(); pool.position.set(5.6, 0, 4.2); scene.add(pool);
  const feltM = new THREE.MeshStandardMaterial({ map: T.felt(), roughness: 0.95 });
  const pt = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.4), feltM); pt.position.y = 0.82; pt.receiveShadow = true; pool.add(pt);
  const cush = new THREE.MeshStandardMaterial({ color: 0x3a1a0a, roughness: 0.35, map: panelTex });
  for (const [w, d, x, z] of [[2.7, 0.12, 0, 0.76], [2.7, 0.12, 0, -0.76], [0.12, 1.64, 1.31, 0], [0.12, 1.64, -1.31, 0]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), cush); c.position.set(x, 0.86, z); c.castShadow = true; pool.add(c);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 1.2), cush); base.position.y = 0.45; base.castShadow = true; pool.add(base);
  const ballCols = [0xffffff, 0xf1c40f, 0x2e4bd6, 0xd62e2e, 0x6a2ed6, 0xf08a24, 0x1a8f3a, 0x111111];
  ballCols.forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.15 }));
    b.position.set(-0.6 + (i % 4) * 0.25 + Math.random() * 0.1, 0.9, -0.3 + Math.floor(i / 4) * 0.45); b.castShadow = true; pool.add(b);
  });
  staticBox(1.35, 0.47, 0.8, 5.6, 0.47, 4.2);
  for (let i = 0; i < 2; i++) { const c = new Prop(game, 'cue', 5.1 + i * 0.9, 1.0, 4.2 + (i ? 0.3 : -0.2), 0); c.body.quaternion.setFromEuler(Math.PI / 2, 0, Math.PI / 2 + i * 0.3); c.sync(); props.push(c); }
  const poolLamp = mesh(new THREE.BoxGeometry(1.6, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: 0x0d3d1f, roughness: 0.4, metalness: 0.3 }), 5.6, 2.3, 4.2, false, false);
  const plb = mesh(new THREE.BoxGeometry(1.5, 0.02, 0.28), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.2, 3) }), 5.6, 2.235, 4.2, false, false);
  const pl = new THREE.PointLight(0xffe0b0, 7, 5, 2); pl.position.set(5.6, 2.1, 4.2); scene.add(pl);

  // ---------- pendant lamps ----------
  const lampSpots = [[-6.3, 1.2], [-6.3, 4.6], [6.4, -2.4], [-2.5, -4.6], [1.5, -4.6]];
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1d2a20, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.2) });
  game.bulbs = [];
  for (const [i, [lx, lz]] of lampSpots.entries()) {
    const y = 2.55;
    mesh(new THREE.CylinderGeometry(0.006, 0.006, ROOM.H - y, 4), iron, lx, (ROOM.H + y) / 2, lz, false, false);
    mesh(new THREE.ConeGeometry(0.26, 0.22, 20, 1, true), shadeMat, lx, y, lz, false, false);
    const bulb = mesh(new THREE.SphereGeometry(0.06, 12, 8), bulbMat, lx, y - 0.08, lz, false, false);
    game.bulbs.push(bulb);
    if (i === 4) continue;
    const L = new THREE.PointLight(0xffb066, i === 3 ? 8 : 5.5, i === 3 ? 8 : 6.5, 2); L.position.set(i === 3 ? -0.5 : lx, y - 0.15, lz); scene.add(L);
  }

  // ---------- main shadow key light ----------
  const key = new THREE.SpotLight(0xffd2a0, 34, 16, 0.95, 0.65, 1.6);
  key.position.set(0, ROOM.H - 0.15, 0.5); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 8;
  scene.add(key); scene.add(key.target);
  game.keyLight = key;
  // fight-ring lamp visual
  mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 24, 1, true), shadeMat, 0, ROOM.H - 0.2, 0.5, false, false);
  const kb = mesh(new THREE.CircleGeometry(0.33, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 3) }), 0, ROOM.H - 0.32, 0.5, false, false);
  kb.rotation.x = Math.PI / 2;

  const hemi = new THREE.HemisphereLight(0x8a6a50, 0x24140a, 0.8); scene.add(hemi);

  // dust motes
  const N = 500, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = (Math.random() - 0.5) * 12; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffd9a8, size: 0.012, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(motes);
  game.motes = motes;

  game.surfaces = [
    { name: 'POOL TABLE', minX: 4.45, maxX: 6.75, minZ: 3.6, maxZ: 4.8, y: 0.95 },
    { name: 'BAR', minX: barX0 + 0.3, maxX: barX1 - 0.3, minZ: barZ - 0.2, maxZ: barZ + 0.3, y: 1.14 },
  ];
  game.lightsList = []; scene.traverse(o => { if (o.isLight) game.lightsList.push({ l: o, base: o.intensity, neon: o === neonLight }); });
  game.barSpawn = new THREE.Vector3(barX0 + 0.6, 1.24, barZ + 0.05);
  const spawns = [new THREE.Vector3(ROOM.minX + 0.7, 0, -4.6), new THREE.Vector3(6.6, 0, ROOM.minZ + 0.8), new THREE.Vector3(-3, 0, 6.3), new THREE.Vector3(3.5, 0, 6.3)];
  return { colliders, props, spawns };
}

function dartTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const cols = ['#111', '#e8dcc0'];
  for (let i = 0; i < 20; i++) {
    g.fillStyle = cols[i % 2]; g.beginPath(); g.moveTo(128, 128);
    g.arc(128, 128, 124, i / 20 * Math.PI * 2, (i + 1) / 20 * Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#b22'; g.lineWidth = 10;
  for (const r of [118, 75]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#1a7a2a'; g.beginPath(); g.arc(128, 128, 14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b22'; g.beginPath(); g.arc(128, 128, 6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
