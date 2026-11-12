import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
window.inspect = async (url) => {
  const L = new FBXLoader();
  const g = await L.loadAsync(url);
  const out = { url, scale: g.scale.toArray(), children: g.children.map(c => c.type + ':' + c.name), meshes: [], bones: [], anims: [] };
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g); out.box = [box.min.toArray().map(v=>+v.toFixed(1)), box.max.toArray().map(v=>+v.toFixed(1))];
  g.traverse(o => {
    if (o.isMesh) {
      const m = Array.isArray(o.material) ? o.material : [o.material];
      out.meshes.push({ name: o.name, skinned: !!o.isSkinnedMesh, verts: o.geometry.attributes.position.count, tris: o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3,
        mats: m.map(x => ({ type: x.type, name: x.name, map: x.map ? [x.map.image && x.map.image.width, x.map.image && x.map.image.height] : null, color: x.color && x.color.getHexString() })) });
    }
    if (o.isBone) out.bones.push(o.name);
  });
  out.boneCount = out.bones.length; out.bones = out.bones.slice(0, 30);
  for (const a of g.animations) out.anims.push({ name: a.name, dur: a.duration, tracks: a.tracks.length, sample: a.tracks.slice(0, 4).map(t => t.name + ' ' + t.times.length) });
  return out;
};
