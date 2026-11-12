import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
window.gu = async (url) => {
  const gl = await new GLTFLoader().loadAsync(url);
  const m = gl.scene, clip = gl.animations.find(a => a.name === 'Getting_Up');
  const mx = new THREE.AnimationMixer(m); mx.clipAction(clip).play();
  const bm = {}; m.traverse(o => { if (o.isBone) bm[o.name.replace('mixamorig','')] = o; });
  const out = { tracks: clip.tracks.filter(t => t.name.includes('position')).map(t => t.name + ' ' + t.values.length), bindHips: bm.Hips.position.toArray().map(v=>+v.toFixed(2)) };
  for (const t of [0, 0.5, 1.0, 1.5, 2.0, 2.69]) {
    mx.setTime(t); m.updateMatrixWorld(true);
    const g = n => { const v = new THREE.Vector3(); bm[n].getWorldPosition(v); return v.toArray().map(x => +x.toFixed(1)); };
    out['t' + t] = { hips: g('Hips'), head: g('Head'), lfoot: g('LeftFoot'), hand: g('LeftHand') };
  }
  return out;
};
