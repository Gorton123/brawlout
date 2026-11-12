// Retarget the game's Mixamo clips onto a new auto-rigged GLB, rename its bones to mixamorig*,
// shrink textures, and export a game-ready GLB with its own baked clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const RENAME = { Hips: 'Hips', Spine02: 'Spine', Spine01: 'Spine1', Spine: 'Spine2', neck: 'Neck', Head: 'Head', head_end: 'HeadTop_End', headfront: 'HeadFront' };
for (const s of ['Left', 'Right']) for (const b of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase']) RENAME[s + b] = s + b;
// bone -> child used to aim it
const AIM = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' };
for (const s of ['Left', 'Right']) Object.assign(AIM, { [s + 'Shoulder']: s + 'Arm', [s + 'Arm']: s + 'ForeArm', [s + 'ForeArm']: s + 'Hand', [s + 'UpLeg']: s + 'Leg', [s + 'Leg']: s + 'Foot', [s + 'Foot']: s + 'ToeBase' });
const TWIST = { Spine: 0.5, Spine1: 0.5, Spine2: 0.5, Neck: 0.35, LeftArm: 0.3, RightArm: 0.3, LeftForeArm: 0.35, RightForeArm: 0.35, LeftUpLeg: 0.4, RightUpLeg: 0.4, LeftLeg: 0.3, RightLeg: 0.3 };
const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

const strip = n => n.replace(/^mixamorig:?/, '');
const bmap = root => { const m = {}; root.traverse(o => { if (o.isBone) m[strip(o.name)] = o; }); return m; };
const b64ToBuf = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const wq = o => o.getWorldQuaternion(new THREE.Quaternion());
const wp = o => o.getWorldPosition(new THREE.Vector3());

function shrink(map, size, mime) {
  if (!map || !map.image) return map;
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(map.image, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = map.colorSpace; t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT;
  t.userData.mimeType = mime; return t;
}

window.retarget = async (srcB64, tgtB64, opts = {}) => {
  const L = new GLTFLoader();
  const src = await L.parseAsync(b64ToBuf(srcB64), ''), tgt = await L.parseAsync(b64ToBuf(tgtB64), '');
  const S = src.scene, T = tgt.scene;
  // put both skeletons into their true bind pose (node rest transforms may not be the bind pose)
  const bindPose = root => { root.updateMatrixWorld(true); root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); }); root.updateMatrixWorld(true); };
  bindPose(S);
  S.updateMatrixWorld(true);
  const sb = bmap(S);
  // rename target bones
  T.traverse(o => { if (o.isBone && RENAME[o.name]) o.name = 'mixamorig' + RENAME[o.name]; });
  const tb = bmap(T);
  // wrap target: face +Z like the source and match its scale
  const holder = new THREE.Group(); holder.add(T); T.updateMatrixWorld(true);
  const lf = wp(tb.LeftUpLeg), rf = wp(tb.RightUpLeg), hp = wp(tb.Hips), hd = wp(tb.Head);
  const right = lf.clone().sub(rf); right.y = 0; right.normalize(); // character's left - right
  const fwd = new THREE.Vector3().crossVectors(right, new THREE.Vector3(0, 1, 0)).negate(); // (left x up) points backward for a +Z-facing body
  // source facing for comparison
  const slf = wp(sb.LeftUpLeg), srf = wp(sb.RightUpLeg), sright = slf.clone().sub(srf); sright.y = 0; sright.normalize();
  const yaw = Math.atan2(sright.x, sright.z) - Math.atan2(right.x, right.z);
  // face the model down +Z like the game's other characters, using the rig's 'HeadFront' marker bone
  let faceYaw = 0;
  if (tb.HeadFront && tb.Head) { const f = wp(tb.HeadFront).sub(wp(tb.Head)); f.y = 0; if (f.lengthSq() > 1e-10) faceYaw = Math.atan2(f.x, f.z); }
  holder.rotation.y = -faceYaw; holder.updateMatrixWorld(true);
  const sH = wp(sb.Head).y - wp(sb.Hips).y * 0, tH = hd.y;
  const scale = (wp(sb.Head).y) / hd.y;

  holder.updateMatrixWorld(true);
  // reference pose: aim target bones along the source's bind-pose bone directions
  const srcBindQ = {}; for (const n of ORDER) if (sb[n]) srcBindQ[n] = wq(sb[n]);
  const fix = new THREE.Quaternion();
  for (const n of ORDER) {
    const b = tb[n], c = tb[AIM[n]], s = sb[n], sc = sb[AIM[n]];
    if (!b || !c || !s || !sc || n === 'Hips') continue;
    holder.updateMatrixWorld(true);
    const td = wp(c).sub(wp(b)).normalize(), sd = wp(sc).sub(wp(s)).normalize();
    fix.setFromUnitVectors(td, sd);
    const W = wq(b).premultiply(fix), P = wq(b.parent);
    b.quaternion.copy(P.invert().multiply(W));
  }
  holder.updateMatrixWorld(true);
  const refQ = {}; for (const n of ORDER) if (tb[n]) refQ[n] = wq(tb[n]);
  const tRefLocal = {}; for (const n of ORDER) if (tb[n]) tRefLocal[n] = tb[n].quaternion.clone();
  const holderQ = wq(holder);
  const sHips0 = wp(sb.Hips), tHipsLocal0 = tb.Hips.position.clone();
  const hipRatio = (wp(tb.Hips).y) / sHips0.y; // world-space
  // bake every clip
  const clips = [];
  for (const clip of src.animations) {
    const mx = new THREE.AnimationMixer(S); const act = mx.clipAction(clip); act.play();
    const fps = 30, N = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(N), qv = {}, hpv = new Float32Array(N * 3);
    for (const n of ORDER) if (tb[n] && sb[n]) qv[n] = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const t = Math.min(clip.duration, i / fps); times[i] = t;
      mx.setTime(t); S.updateMatrixWorld(true);
      for (const n of ORDER) {
        if (!qv[n]) continue;
        const Wt = wq(sb[n]).multiply(srcBindQ[n].clone().invert()).multiply(refQ[n]);
        const b = tb[n]; holder.updateMatrixWorld(true);
        const loc = wq(b.parent).invert().multiply(Wt);
        // damp twist around the bone's own axis (these rigs have no twist bones, so big twists wrap the mesh)
        const k = TWIST[n];
        const ch = tb[AIM[n]];
        if (k !== undefined && ch) {
          const rel = tRefLocal[n].clone().invert().multiply(loc);
          const ax = ch.position.clone().applyQuaternion(tRefLocal[n]).normalize().applyQuaternion(tRefLocal[n].clone().invert());
          const d = rel.x * ax.x + rel.y * ax.y + rel.z * ax.z;
          const tw = new THREE.Quaternion(ax.x * d, ax.y * d, ax.z * d, rel.w);
          if (tw.lengthSq() > 1e-10) {
            tw.normalize();
            const sw = rel.clone().multiply(tw.clone().invert());
            const twS = new THREE.Quaternion().slerp(tw, k);
            loc.copy(tRefLocal[n]).multiply(sw).multiply(twS);
          }
        }
        b.quaternion.copy(loc); b.updateMatrixWorld(true);
        loc.toArray(qv[n], i * 4);
      }
      // hips translation: source world delta -> target parent space
      const d = wp(sb.Hips).sub(sHips0).multiplyScalar(hipRatio);
      const pInv = tb.Hips.parent.matrixWorld.clone().invert();
      const base = tb.Hips.parent.localToWorld(tHipsLocal0.clone());
      const pos = base.add(d).applyMatrix4(pInv);
      pos.toArray(hpv, i * 3);
    }
    // restore ref pose for next clip
    for (const n of ORDER) if (tb[n]) tb[n].quaternion.copy(tRefLocal[n]);
    tb.Hips.position.copy(tHipsLocal0);
    const tracks = Object.entries(qv).map(([n, v]) => new THREE.QuaternionKeyframeTrack(tb[n].name + '.quaternion', times, v));
    tracks.push(new THREE.VectorKeyframeTrack(tb.Hips.name + '.position', times, hpv));
    clips.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
    mx.stopAllAction(); mx.uncacheRoot(S);
  }
  // put the target back in its bind pose (as exported) — reset to original local rotations
  // (bind pose stays in the skin; rest node transforms are the A-pose from the file)
  const tgt2 = await L.parseAsync(b64ToBuf(tgtB64), '');
  const orig = {}; tgt2.scene.traverse(o => { if (o.isBone && RENAME[o.name]) orig['mixamorig' + RENAME[o.name]] = o; });
  T.traverse(o => { const r = o.isBone && orig[o.name]; if (r) { o.position.copy(r.position); o.quaternion.copy(r.quaternion); o.scale.copy(r.scale); } });
  T.updateMatrixWorld(true);
  // textures
  const size = opts.tex || 1024;
  T.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    o.material = new THREE.MeshStandardMaterial({ name: 'skin', map: shrink(m.map, size, 'image/jpeg'), normalMap: opts.normal ? shrink(m.normalMap, size, 'image/jpeg') : null, roughness: 0.8, metalness: 0 });
    o.geometry.deleteAttribute('tangent');
  });
  // remove the baked placeholder animation from the file
  const exp = new GLTFExporter();
  const buf = await exp.parseAsync(holder, { binary: true, animations: clips, onlyVisible: false });
  const bytes = new Uint8Array(buf);
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { yaw, faceYaw, scale, clips: clips.map(c => c.name), size: bytes.length, b64: btoa(s) };
};

// strip meshes from a GLB, keeping the skeleton and animations (clip library)
window.clipsOnly = async (srcB64) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(srcB64), '');
  const rm = []; g.scene.traverse(o => { if (o.isMesh) rm.push(o); }); for (const o of rm) o.parent.remove(o);
  const buf = await new GLTFExporter().parseAsync(g.scene, { binary: true, animations: g.animations, onlyVisible: false });
  const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { size: bytes.length, b64: btoa(s) };
};

window.diag = async (srcB64, outB64, clipName, t) => {
  const L = new GLTFLoader();
  const src = await L.parseAsync(b64ToBuf(srcB64), ''), out = await L.parseAsync(b64ToBuf(outB64), '');
  const play = (g) => { const c = g.animations.find(a => a.name === clipName); const mx = new THREE.AnimationMixer(g.scene); mx.clipAction(c).play(); mx.setTime(t); g.scene.updateMatrixWorld(true); };
  play(src); play(out);
  const sb = bmap(src.scene), tb = bmap(out.scene), res = {};
  for (const n of ORDER) { const c = AIM[n]; if (!c || !sb[n] || !tb[n] || !sb[c] || !tb[c]) continue;
    const sd = wp(sb[c]).sub(wp(sb[n])).normalize(), td = wp(tb[c]).sub(wp(tb[n])).normalize();
    res[n] = Math.round(THREE.MathUtils.radToDeg(sd.angleTo(td))); }
  // also bind pose directions comparison
  return res;
};

window.skinCheck = async (b64s) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64s), '');
  const root = g.scene; root.updateMatrixWorld(true);
  let mesh; root.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  const bm = bmap(root); const hand = bm.LeftHand || bm.lefthand;
  const arm = bm.LeftArm;
  const near = () => { // vertex most weighted to hand: compare skinned position to hand bone
    const sk = mesh.skeleton, hi = sk.bones.indexOf(hand); const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, pos = mesh.geometry.attributes.position;
    let best = -1, bw = 0; for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi && sw.getComponent(i, k) > bw) { bw = sw.getComponent(i, k); best = i; }
    const v = new THREE.Vector3().fromBufferAttribute(pos, best); mesh.applyBoneTransform(best, v); v.applyMatrix4(mesh.matrixWorld);
    return v.distanceTo(wp(hand));
  };
  const d0 = near();
  arm.rotateZ(1.2); root.updateMatrixWorld(true); mesh.skeleton.update && mesh.skeleton.update();
  const d1 = near();
  return { d0, d1, meshParent: mesh.parent && mesh.parent.name, bindMode: mesh.bindMode, meshMatrixIdentity: mesh.matrixWorld.equals(new THREE.Matrix4()) };
};

window.renderClip = async (b64s, clip, t) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64s), '');
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(500, 500); document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x808080); sc.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3));
  sc.add(g.scene);
  const box = new THREE.Box3().setFromObject(g.scene);
  const mx = new THREE.AnimationMixer(g.scene); const c = g.animations.find(a => a.name === clip); if (c) { mx.clipAction(c).play(); mx.setTime(t); }
  g.scene.updateMatrixWorld(true);
  const h = new THREE.SkeletonHelper(g.scene); h.material.depthTest = false; sc.add(h);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 1000); const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()).length();
  cam.position.copy(ctr).add(new THREE.Vector3(0, 0, sz * 1.3)); cam.lookAt(ctr);
  const ax = new THREE.AxesHelper(0.6 * (sz / 2)); ax.material.depthTest = false; ax.position.copy(ctr); sc.add(ax);
  r.render(sc, cam);
  const bp = {}; g.scene.traverse(o => { if (o.isBone && /UpLeg|headfront|HeadFront|^Head$|mixamorigHead$|Shoulder/.test(o.name)) bp[o.name] = wp(o).toArray().map(v => +v.toFixed(3)); });
  let mesh; g.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh) return { bp };
  const v = new THREE.Vector3(), mn = new THREE.Vector3(1e9, 1e9, 1e9), mxv = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (let i = 0; i < mesh.geometry.attributes.position.count; i += 50) { v.fromBufferAttribute(mesh.geometry.attributes.position, i); mesh.applyBoneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); mn.min(v); mxv.max(v); }
  return { bp, skinnedBox: [mn.toArray().map(x => +x.toFixed(2)), mxv.toArray().map(x => +x.toFixed(2))], cpuVsGpu: 'see image' };
};
window.faceInfo = async (b64s) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64s), ''); g.scene.updateMatrixWorld(true);
  const m = {}; g.scene.traverse(o => { if (o.isBone) m[o.name] = wp(o).toArray().map(v => +v.toFixed(3)); });
  let mesh; g.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  const box = new THREE.Box3().setFromObject(mesh);
  return { bones: m, box: [box.min.toArray(), box.max.toArray()] };
};

// bake a (possibly skinned) model into a static mesh, rotate it about Y, export GLB for re-rigging
window.staticRotated = async (b64s, angle) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64s), ''); g.scene.updateMatrixWorld(true);
  const out = new THREE.Group();
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone(); const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); pos.setXYZ(i, v.x, v.y, v.z); }
    geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight'); geo.deleteAttribute('tangent');
    geo.rotateY(angle); geo.computeVertexNormals();
    geo.computeBoundingBox(); const bb = geo.boundingBox; geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    out.add(new THREE.Mesh(geo, o.material));
  });
  const buf = await new GLTFExporter().parseAsync(out, { binary: true });
  const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { size: bytes.length, b64: btoa(s) };
};

// export a static GLB as OBJ text + base colour JPEG (for Mixamo's auto-rigger)
window.toOBJ = async (b64s, texSize) => {
  const g = await new GLTFLoader().parseAsync(b64ToBuf(b64s), ''); g.scene.updateMatrixWorld(true);
  let mesh; g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  const geo = mesh.geometry, P = geo.attributes.position, U = geo.attributes.uv, N = geo.attributes.normal, I = geo.index;
  const v = new THREE.Vector3(), lines = ['mtllib model.mtl', 'o character'];
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld).multiplyScalar(100); lines.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`); }
  for (let i = 0; i < U.count; i++) lines.push(`vt ${U.getX(i).toFixed(5)} ${(1 - U.getY(i)).toFixed(5)}`);
  for (let i = 0; i < N.count; i++) lines.push(`vn ${N.getX(i).toFixed(4)} ${N.getY(i).toFixed(4)} ${N.getZ(i).toFixed(4)}`);
  lines.push('usemtl skin');
  const n = I ? I.count : P.count;
  for (let i = 0; i < n; i += 3) { const a = (I ? I.getX(i) : i) + 1, b = (I ? I.getX(i + 1) : i + 1) + 1, c = (I ? I.getX(i + 2) : i + 2) + 1; lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`); }
  const map = mesh.material.map; const cv = document.createElement('canvas'); cv.width = cv.height = texSize;
  cv.getContext('2d').drawImage(map.image, 0, 0, texSize, texSize);
  const jpg = cv.toDataURL('image/jpeg', 0.9).split(',')[1];
  return { obj: lines.join('\n'), jpg, flipY: map.flipY };
};
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
window.renderOBJ = async (objText, jpgB64) => {
  const o = new OBJLoader().parse(objText);
  const tex = await new THREE.TextureLoader().loadAsync('data:image/jpeg;base64,' + jpgB64); tex.colorSpace = THREE.SRGBColorSpace;
  o.traverse(m => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }); });
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(500, 500); document.body.appendChild(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x808080); sc.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3)); sc.add(o);
  const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(40, 1, 1, 10000); cam.position.copy(c).add(new THREE.Vector3(0, 0, sz * 1.3)); cam.lookAt(c);
  r.render(sc, cam); return true;
};
