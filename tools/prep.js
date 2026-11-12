import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

async function gradeTexture(map, size, filter) {
  const img = map.image;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.filter = filter; g.drawImage(img, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = map.flipY;
  t.userData.mimeType = 'image/jpeg';
  return t;
}
window.prepModel = async (url, opts) => {
  const g = await new FBXLoader().loadAsync(url);
  await new Promise(r => setTimeout(r, 1500));
  let info = {};
  const anims = [];
  for (const a of (opts.anims || [])) {
    const ag = await new FBXLoader().loadAsync(a.url);
    const clip = ag.animations[0];
    clip.name = a.name;
    clip.tracks = clip.tracks.filter(t => t.name.endsWith('.quaternion') || (a.keepHips && t.name.endsWith('Hips.position')));
    anims.push(clip);
  }
  const removeList = [];
  g.traverse(o => {
    if (o.isSkinnedMesh) {
      const before = o.geometry.attributes.position.count;
      o.geometry.deleteAttribute('normal');
      let geo = mergeVertices(o.geometry, 1e-4);
      geo.computeVertexNormals();
      o.geometry = geo;
      info.verts = [before, geo.attributes.position.count, geo.index.count / 3];
      o.userData.tex = true;
    }
  });
  const meshes = []; g.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const o of meshes) {
    const old = o.material;
    const map = await gradeTexture(old.map, opts.tex || 1024, opts.filter || 'saturate(1.3) contrast(1.08)');
    o.material = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, name: 'skin' });
  }
  g.animations = [];
  const exp = new GLTFExporter();
  const buf = await exp.parseAsync(g, { binary: true, animations: anims, onlyVisible: false });
  const bytes = new Uint8Array(buf);
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  info.size = bytes.length;
  return { info, b64: btoa(s) };
};
