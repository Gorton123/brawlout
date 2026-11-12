import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
window.view = async (urls, clipName, t) => {
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(900, 500); document.body.appendChild(r.domElement);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  const s = new THREE.Scene(); s.background = new THREE.Color(0x332820);
  s.add(new THREE.HemisphereLight(0xffeedd, 0x332211, 1.2)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 4, 3); s.add(d);
  const cam = new THREE.PerspectiveCamera(40, 900 / 500, 0.1, 100); cam.position.set(0, 1.0, 4.2); cam.lookAt(0, 0.9, 0);
  const L = new GLTFLoader(); const out = [];
  let clips = null;
  for (let i = 0; i < urls.length; i++) {
    const gl = await L.loadAsync(urls[i]);
    if (gl.animations.length) clips = gl.animations;
    const m = gl.scene; m.updateMatrixWorld(true);
    const box = new THREE.Box3(); const v = new THREE.Vector3();
    let sm; m.traverse(o => { if (o.isSkinnedMesh) sm = o; });
    const pos = sm.geometry.attributes.position;
    for (let k = 0; k < pos.count; k += 17) { v.fromBufferAttribute(pos, k); sm.applyBoneTransform(k, v); v.applyMatrix4(sm.matrixWorld); box.expandByPoint(v); }
    const h = box.max.y - box.min.y, k = 1.8 / h;
    const holder = new THREE.Group(); holder.add(m); m.scale.setScalar(k); m.position.set(-k * (box.min.x + box.max.x) / 2, -k * box.min.y, -k * (box.min.z + box.max.z) / 2);
    holder.position.x = (i - (urls.length - 1) / 2) * 1.1; s.add(holder);
    let bones = []; m.traverse(o => { if (o.isBone) bones.push(o.name); });
    out.push({ h, bones: bones.length, first: bones.slice(0, 3), anims: gl.animations.map(a => a.name + ':' + a.duration.toFixed(2)) });
    holder.userData.m = m;
  }
  if (clipName && clips) {
    const clip = clips.find(c => c.name === clipName);
    for (const h of s.children.filter(c => c.userData.m)) { const mx = new THREE.AnimationMixer(h.userData.m); mx.clipAction(clip).play(); mx.update(t); }
  }
  r.render(s, cam);
  return out;
};
