// Browser-side half of the character pipeline (bundled by cbuild.mjs, run in headless Chromium).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import '../tools/retarget.js'; // retarget, staticRotated, toOBJ, renderClip, clipsOnly

const b64ToBuf = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const bufToB64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const wp = o => o.getWorldPosition(new THREE.Vector3());

// world-space vertex positions of every mesh (skinned meshes in their current pose)
function worldVerts(root, step = 1) {
  root.updateMatrixWorld(true); const out = [];
  root.traverse(o => {
    if (!o.isMesh) return; const P = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < P.count; i += step) { v.fromBufferAttribute(P, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); out.push(v.clone()); }
  });
  return out;
}
// Which way does the body face? Arms span the wide horizontal axis; feet stick out forward.
function facing(verts) {
  const box = new THREE.Box3().setFromPoints(verts), h = box.max.y - box.min.y;
  const wideAxis = (box.max.x - box.min.x) >= (box.max.z - box.min.z) ? 'x' : 'z';
  const fwdAxis = wideAxis === 'x' ? 'z' : 'x';
  let toe = 0, tn = 0, shin = 0, sn = 0;
  for (const v of verts) { const y = v.y - box.min.y; if (y < h * 0.035) { toe += v[fwdAxis]; tn++; } else if (y < h * 0.12) { shin += v[fwdAxis]; sn++; } }
  const sign = Math.sign((toe / Math.max(1, tn)) - (shin / Math.max(1, sn))) || 1;
  // yaw (about Y) that turns this facing into +Z
  const fwd = new THREE.Vector3(); fwd[fwdAxis] = sign;
  const yawToZ = -Math.atan2(fwd.x, fwd.z);
  return { wideAxis, forward: (sign > 0 ? '+' : '-') + fwdAxis, yawToZ, height: h };
}
window.analyse = async (b64) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64), '');
  const f = facing(worldVerts(g.scene, 7));
  let skinned = false, bones = []; g.scene.traverse(o => { if (o.isSkinnedMesh) skinned = true; if (o.isBone) bones.push(o.name); });
  const res = { ...f, skinned, bones: bones.length, boneNames: bones.slice(0, 40), anims: g.animations.map(a => a.name) };
  // rig sanity: skeleton must face the same way as the mesh
  if (skinned) {
    const m = {}; g.scene.traverse(o => { if (o.isBone) m[o.name.replace(/^mixamorig:?/, '')] = o; });
    const L = m.LeftUpLeg || m.LeftUpLeg, R = m.RightUpLeg;
    if (L && R) {
      const d = wp(L).sub(wp(R)); d.y = 0; const legAxis = Math.abs(d.x) >= Math.abs(d.z) ? 'x' : 'z';
      res.skeletonSideAxis = legAxis;
      res.rigOK = legAxis === f.wideAxis;
      if (!res.rigOK) res.problem = 'Skeleton is turned 90 degrees relative to the mesh (bad auto-rig). Re-rig from the oriented mesh.';
    }
  }
  return res;
};
// Turn a raw (unrigged or badly rigged) model to face +Z, drop any skin, centre it on the floor.
window.orient = async (b64) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64), '');
  const f = facing(worldVerts(g.scene, 7));
  const r = await window.staticRotated(b64, f.yawToZ);
  return { ...r, facing: f };
};
// Mixamo-rigged FBX -> game GLB (skeleton keeps Mixamo names; the game's shared clip library drives it)
window.ingestFBX = async (b64, opts = {}) => {
  const url = URL.createObjectURL(new Blob([b64ToBuf(b64)]));
  const g = await new FBXLoader().loadAsync(url);
  await new Promise(r => setTimeout(r, 1500)); // let embedded textures decode
  const meshes = []; g.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const o of meshes) {
    o.geometry.deleteAttribute('normal');
    const geo = mergeVertices(o.geometry, 1e-4); geo.computeVertexNormals(); o.geometry = geo;
    const old = Array.isArray(o.material) ? o.material[0] : o.material;
    let map = null;
    if (old && old.map && old.map.image) {
      const S = opts.tex || 1024, c = document.createElement('canvas'); c.width = c.height = S;
      c.getContext('2d').drawImage(old.map.image, 0, 0, S, S);
      map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.flipY = old.map.flipY; map.userData.mimeType = 'image/jpeg';
    }
    o.material = new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0, name: 'skin' });
  }
  g.animations = [];
  const buf = await new GLTFExporter().parseAsync(g, { binary: true, onlyVisible: false });
  return { size: buf.byteLength, meshes: meshes.length, hasTexture: meshes.some(m => m.material.map), b64: bufToB64(buf) };
};
// Preview: render a model (optionally posed by a clip from a clip library) to the page canvas.
window.preview = async (b64, libB64, clip, t) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64), '');
  document.body.innerHTML = '';
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(400, 520); document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x6a6f78);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(1, 2, 3); sc.add(d);
  sc.add(g.scene);
  let clipObj = g.animations.find(a => a.name === clip);
  if (!clipObj && libB64 && clip) { const lib = await new GLTFLoader().parseAsync(b64ToBuf(libB64), ''); clipObj = lib.animations.find(a => a.name === clip); }
  if (clipObj) { const mx = new THREE.AnimationMixer(g.scene); mx.clipAction(clipObj).play(); mx.setTime(t || 0); }
  g.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromPoints(worldVerts(g.scene, 13)), c = box.getCenter(new THREE.Vector3()), h = box.max.y - box.min.y;
  const cam = new THREE.PerspectiveCamera(35, 400 / 520, h * 0.01, h * 50);
  cam.position.set(c.x + h * 0.6, c.y + h * 0.15, c.z + h * 2.1); cam.lookAt(c);
  r.render(sc, cam); return { posed: !!clipObj };
};
