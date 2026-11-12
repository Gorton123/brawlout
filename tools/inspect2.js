import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
window.inspect2 = async (url) => {
  const g = await new FBXLoader().loadAsync(url);
  await new Promise(r => setTimeout(r, 1500));
  g.updateMatrixWorld(true);
  const out = {};
  const names = ['Hips','Spine','Spine2','Neck','Head','HeadTop_End','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightArm','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase'];
  g.traverse(o => { if (o.isBone) { const n = o.name.replace('mixamorig',''); if (names.includes(n)) { const v = new THREE.Vector3(); o.getWorldPosition(v); out[n] = v.toArray().map(x => +x.toFixed(1)); } } });
  let sm; g.traverse(o => { if (o.isSkinnedMesh) sm = o; });
  const v = new THREE.Vector3(), box = new THREE.Box3();
  const pos = sm.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 37) { v.fromBufferAttribute(pos, i); sm.applyBoneTransform(i, v); v.applyMatrix4(sm.matrixWorld); box.expandByPoint(v); }
  out.skinBox = [box.min.toArray().map(x=>+x.toFixed(1)), box.max.toArray().map(x=>+x.toFixed(1))];
  out.smMatrix = sm.matrixWorld.elements.map(x=>+x.toFixed(3));
  out.bindMode = sm.bindMode;
  const m = sm.material; out.map = m.map ? { w: m.map.image && (m.map.image.width || m.map.image.naturalWidth), src: m.map.image && (m.map.image.src||'').slice(0,40), cs: m.map.colorSpace } : null;
  out.attrs = Object.keys(sm.geometry.attributes);
  return out;
};
