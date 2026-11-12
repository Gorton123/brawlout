import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Bone hierarchy (rest pose, facing +Z). L = +X side.
export const BONES = [
  ['hips', null, [0, 0.98, 0]],
  ['spine', 'hips', [0, 0.12, 0]],
  ['neck', 'spine', [0, 0.5, 0]],
  ['shoulderL', 'spine', [0.27, 0.45, 0]],
  ['elbowL', 'shoulderL', [0, -0.3, 0]],
  ['shoulderR', 'spine', [-0.27, 0.45, 0]],
  ['elbowR', 'shoulderR', [0, -0.3, 0]],
  ['hipL', 'hips', [0.1, -0.06, 0]],
  ['kneeL', 'hipL', [0, -0.44, 0]],
  ['hipR', 'hips', [-0.1, -0.06, 0]],
  ['kneeR', 'hipR', [0, -0.44, 0]],
];

// mass fractions follow the design doc
export const PARTS = [
  { name: 'pelvis', bone: 'hips', off: [0, 0.02, 0], box: [0.17, 0.1, 0.11], m: 0.16, mat: 'pants', label: 'HIPS', zone: 'hips' },
  { name: 'torso', bone: 'spine', off: [0, 0.24, 0], box: [0.2, 0.25, 0.12], m: 0.28, mat: 'shirt', label: 'CHEST', zone: 'chest' },
  { name: 'head', bone: 'neck', off: [0, 0.17, 0], sphere: 0.12, m: 0.08, mat: 'skin', label: 'HEAD', zone: 'head' },
  { name: 'uArmL', bone: 'shoulderL', off: [0, -0.15, 0], box: [0.055, 0.15, 0.055], m: 0.04, mat: 'sleeve', label: 'LEFT ARM', zone: 'arm' },
  { name: 'lArmL', bone: 'elbowL', off: [0, -0.15, 0], box: [0.05, 0.15, 0.05], m: 0.04, mat: 'skin', label: 'LEFT WRIST', zone: 'arm' },
  { name: 'uArmR', bone: 'shoulderR', off: [0, -0.15, 0], box: [0.055, 0.15, 0.055], m: 0.04, mat: 'sleeve', label: 'RIGHT ARM', zone: 'arm' },
  { name: 'lArmR', bone: 'elbowR', off: [0, -0.15, 0], box: [0.05, 0.15, 0.05], m: 0.04, mat: 'skin', label: 'RIGHT WRIST', zone: 'arm' },
  { name: 'thighL', bone: 'hipL', off: [0, -0.22, 0], box: [0.075, 0.22, 0.075], m: 0.1, mat: 'pants', label: 'LEFT LEG', zone: 'leg' },
  { name: 'shinL', bone: 'kneeL', off: [0, -0.22, 0], box: [0.06, 0.22, 0.06], m: 0.06, mat: 'pants', label: 'LEFT ANKLE', zone: 'leg' },
  { name: 'thighR', bone: 'hipR', off: [0, -0.22, 0], box: [0.075, 0.22, 0.075], m: 0.1, mat: 'pants', label: 'RIGHT LEG', zone: 'leg' },
  { name: 'shinR', bone: 'kneeR', off: [0, -0.22, 0], box: [0.06, 0.22, 0.06], m: 0.06, mat: 'pants', label: 'RIGHT ANKLE', zone: 'leg' },
];

// child part, parent part, joint bone, cone angle, twist angle
export const JOINTS = [
  ['torso', 'pelvis', 'spine', 0.55, 0.35],
  ['head', 'torso', 'neck', 0.55, 0.5],
  ['uArmL', 'torso', 'shoulderL', 1.4, 0.6],
  ['lArmL', 'uArmL', 'elbowL', 1.3, 0.2],
  ['uArmR', 'torso', 'shoulderR', 1.4, 0.6],
  ['lArmR', 'uArmR', 'elbowR', 1.3, 0.2],
  ['thighL', 'pelvis', 'hipL', 1.0, 0.3],
  ['shinL', 'thighL', 'kneeL', 1.2, 0.1],
  ['thighR', 'pelvis', 'hipR', 1.0, 0.3],
  ['shinR', 'thighR', 'kneeR', 1.2, 0.1],
];

export function buildSkeleton(scale = 1, width = 1) {
  const root = new THREE.Object3D();
  const bones = {};
  for (const [name, parent, p] of BONES) {
    const b = new THREE.Object3D();
    b.position.set(p[0] * scale * width, p[1] * scale, p[2] * scale);
    (parent ? bones[parent] : root).add(b);
    bones[name] = b;
  }
  return { root, bones };
}

let checkTexCache = {};
function checkTex(hexA, hexB) {
  const key = hexA + '_' + hexB;
  if (checkTexCache[key]) return checkTexCache[key];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const a = '#' + hexA.toString(16).padStart(6, '0'), b = '#' + hexB.toString(16).padStart(6, '0');
  g.fillStyle = a; g.fillRect(0, 0, 64, 64);
  g.globalAlpha = 0.55; g.fillStyle = b;
  for (let i = 0; i < 4; i++) { g.fillRect(i * 16, 0, 7, 64); g.fillRect(0, i * 16, 64, 7); }
  g.globalAlpha = 0.25; g.fillStyle = '#000';
  for (let i = 0; i < 4; i++) g.fillRect(i * 16 + 2, i * 16 + 2, 3, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.magFilter = THREE.NearestFilter;
  checkTexCache[key] = t; return t;
}

/** look: { shirt, shirt2?, pants, skin, hair, hairStyle:'short'|'bald'|'cap', beard:bool|color, sleeve?:'short'|'long', wraps, hood } */
export function buildPartMesh(def, look, scale = 1, width = 1) {
  const S = scale;
  const mats = {
    skin: () => new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.55 }),
    shirt: () => new THREE.MeshStandardMaterial({ color: look.shirt, roughness: 0.85, map: look.shirt2 ? checkTex(look.shirt, look.shirt2) : null }),
    pants: () => new THREE.MeshStandardMaterial({ color: look.pants, roughness: 0.9 }),
  };
  mats.sleeve = look.sleeve === 'short' ? mats.skin : mats.shirt;
  let geo;
  const mat = mats[def.mat]();
  if (def.sphere) {
    geo = new THREE.SphereGeometry(def.sphere * S, 20, 16);
    geo.scale(1, 1.08, 1.02);
  } else {
    const [hx, hy, hz] = def.box;
    const w = def.name === 'torso' || def.name === 'pelvis' ? width : Math.sqrt(width);
    geo = new RoundedBoxGeometry(hx * 2 * S * w, hy * 2 * S, hz * 2 * S * w, 2, Math.min(hx * w, hz) * S * 0.7);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  const skinM = def.mat === 'skin' ? mat : mats.skin();
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const add = (g, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(g, m); o.position.set(x * S, y * S, z * S); o.rotation.set(rx, ry, rz); o.castShadow = true; mesh.add(o); return o;
  };
  if (def.name === 'head') {
    add(new THREE.BoxGeometry(0.03 * S, 0.045 * S, 0.04 * S), skinM, 0, -0.005, 0.12);
    const eyeG = new THREE.SphereGeometry(0.014 * S, 8, 6);
    add(eyeG, dark, 0.042, 0.025, 0.106); add(eyeG, dark, -0.042, 0.025, 0.106);
    const browM = new THREE.MeshStandardMaterial({ color: look.hair === 'none' ? 0x2a1a10 : look.hair, roughness: 0.9 });
    const browG = new THREE.BoxGeometry(0.05 * S, 0.013 * S, 0.016 * S);
    add(browG, browM, 0.044, 0.052, 0.112, 0, 0, -0.3); add(browG, browM, -0.044, 0.052, 0.112, 0, 0, 0.3);
    add(new THREE.BoxGeometry(0.045 * S, 0.008 * S, 0.01 * S), new THREE.MeshStandardMaterial({ color: 0x5a2a22 }), 0, -0.06, 0.11);
    const earG = new THREE.SphereGeometry(0.025 * S, 8, 6); earG.scale(0.5, 1, 0.8);
    add(earG, skinM, 0.12, 0, 0); add(earG, skinM, -0.12, 0, 0);
    if (look.hairStyle === 'short' || look.hairStyle === 'cap') {
      const hm = new THREE.MeshStandardMaterial({ color: look.hairStyle === 'cap' ? look.capColor : look.hair, roughness: 0.95 });
      const cap = add(new THREE.SphereGeometry(0.128 * S, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hm, 0, 0.012, -0.01, -0.25);
      if (look.hairStyle === 'cap') add(new THREE.BoxGeometry(0.17 * S, 0.012 * S, 0.1 * S), hm, 0, 0.05, 0.14, 0.15);
    }
    if (look.beard) {
      const bm = new THREE.MeshStandardMaterial({ color: typeof look.beard === 'number' ? look.beard : look.hair, roughness: 1 });
      const bg = new THREE.SphereGeometry(0.1 * S, 16, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45);
      add(bg, bm, 0, -0.02, 0.025);
    }
  } else if (def.name === 'lArmL' || def.name === 'lArmR') {
    const fist = add(new RoundedBoxGeometry(0.09 * S, 0.1 * S, 0.095 * S, 2, 0.025 * S), skinM, 0, -0.19, 0.01);
    if (look.wraps) add(new THREE.CylinderGeometry(0.054 * S, 0.054 * S, 0.07 * S, 10), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9 }), 0, -0.12, 0);
    if (look.sleeve !== 'short') { /* long sleeve: forearm = skin, cuff */ add(new THREE.CylinderGeometry(0.058 * S, 0.058 * S, 0.05 * S, 10), mats.shirt(), 0, 0.12, 0); }
  } else if (def.name === 'shinL' || def.name === 'shinR') {
    add(new RoundedBoxGeometry(0.11 * S, 0.07 * S, 0.22 * S, 2, 0.02 * S), new THREE.MeshStandardMaterial({ color: look.shoes || 0x2a1a10, roughness: 0.7 }), 0, -0.225, 0.045);
  } else if (def.name === 'pelvis') {
    add(new THREE.BoxGeometry(0.35 * S * width, 0.035 * S, 0.23 * S * width), new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.5 }), 0, 0.085, 0);
  } else if (def.name === 'torso') {
    if (look.hood) add(new THREE.TorusGeometry(0.11 * S, 0.04 * S, 8, 16), mats.shirt(), 0, 0.24, -0.04, Math.PI / 2 - 0.3);
    else add(new THREE.CylinderGeometry(0.07 * S, 0.08 * S, 0.06 * S, 12), skinM, 0, 0.26, 0);
    if (look.tattoo) { /* placeholder */ }
  }
  return mesh;
}
