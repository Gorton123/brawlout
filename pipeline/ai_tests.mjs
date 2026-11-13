#!/usr/bin/env node
// Stage 2 of the AI tools test: map UniRig rigs, render + score 8 poses (UniRig vs autorig), retarget MoMask BVH,
// render contact sheets. Reads tests/ai/out/ (from stage 1), writes tests/ai/out/sheets/*.png and results.json.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tests/ai/out'), SHEETS = path.join(OUT, 'sheets'), GAME = path.join(OUT, 'game');
fs.mkdirSync(SHEETS, { recursive: true }); fs.mkdirSync(GAME, { recursive: true });
const b64 = f => fs.readFileSync(f).toString('base64');
const esbuild = await import('esbuild');
await esbuild.build({ entryPoints: [path.join(ROOT, 'pipeline/page.js')], bundle: true, format: 'iife', outfile: path.join(ROOT, 'pipeline/.page.bundle.js'), logLevel: 'warning' });
fs.writeFileSync(path.join(ROOT, 'pipeline/.page.html'), '<!doctype html><html><body style="margin:0"><script src=".page.bundle.js"></script></body></html>');
const { chromium } = await import('playwright');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1760, height: 420 } });
page.on('pageerror', e => console.log('[page error]', e.message));
await page.goto('file://' + path.join(ROOT, 'pipeline/.page.html'));
const call = (fn, ...a) => page.evaluate(([fn, a]) => window[fn](...a), [fn, a]);
const ref = b64(path.join(ROOT, 'assets/quick.glb')), lib = b64(path.join(ROOT, 'assets/clips.glb'));
const results = fs.existsSync(path.join(OUT, 'results.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'results.json'))) : { unirig: {}, momask: {} };
const save = () => fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
const only = process.argv.slice(2);

// ---- UniRig vs autorig
const uniDir = path.join(OUT, 'unirig');
for (const f of fs.existsSync(uniDir) ? fs.readdirSync(uniDir).filter(f => f.endsWith('.glb')) : []) {
  const id = f.slice(0, -4); if (only.length && !only.includes(id)) continue;
  const R = results.unirig[id] = { id };
  try {
    R.info = await call('rigInfo', b64(path.join(uniDir, f)));
    console.log(`${id}: UniRig gave ${R.info.bones} bones, ${R.info.skinned} skinned mesh(es), ${R.info.verts} verts`);
    if (id === 'lion' || !R.info.skinned) { await page.screenshot({ path: path.join(SHEETS, `${id}_unirig_info.png`) }); save(); continue; }
    const t0 = Date.now();
    const g = await call('uniToGame', b64(path.join(uniDir, f)), ref);
    fs.writeFileSync(path.join(GAME, `${id}_unirig.glb`), Buffer.from(g.b64, 'base64'));
    R.mapping = { snapped: g.info.snapped, ms: Date.now() - t0 };
    const s1 = await call('poseSheet', b64(path.join(GAME, `${id}_unirig.glb`)), lib, `${id} UniRig`);
    await page.screenshot({ path: path.join(SHEETS, `${id}_unirig.png`) }); R.unirig = s1.scores;
  } catch (e) { R.error = String(e).slice(0, 300); console.log(id, 'error', R.error); }
  const auto = path.join(ROOT, 'characters', id, 'game.glb');
  if (fs.existsSync(auto)) { const s2 = await call('poseSheet', b64(auto), lib, `${id} autorig`); await page.screenshot({ path: path.join(SHEETS, `${id}_autorig.png`) }); R.autorig = s2.scores; }
  save();
}

// ---- MoMask on the best character
const mmDir = path.join(OUT, 'momask');
if (fs.existsSync(mmDir) && (!only.length || only.includes('momask'))) {
  const best = process.env.BEST || (() => {
    let bestId = null, bestV = 1e9;
    for (const [id, R] of Object.entries(results.unirig)) for (const k of ['unirig', 'autorig']) if (R[k]) { const v = R[k].reduce((a, s) => a + Object.entries(s).filter(([r, x]) => typeof x === 'object' && r !== 'torso').reduce((b, [, x]) => b + x.stretch95 + x.flipPct / 10, 0), 0); if (v < bestV) { bestV = v; bestId = k === 'unirig' ? path.join(GAME, `${id}_unirig.glb`) : path.join(ROOT, 'characters', id, 'game.glb'); } }
    return bestId || path.join(ROOT, 'characters/hero/game.glb');
  })();
  results.momask.character = path.relative(ROOT, best); console.log('MoMask clips on', results.momask.character);
  for (const f of fs.readdirSync(mmDir).filter(f => f.endsWith('.bvh'))) {
    const key = f.slice(0, -4); const M = results.momask[key] = { key };
    try {
      const r = await call('bvhToClip', b64(best), fs.readFileSync(path.join(mmDir, f), 'utf8'), key);
      fs.writeFileSync(path.join(GAME, `momask_${key}.glb`), Buffer.from(r.b64, 'base64'));
      Object.assign(M, { frames: r.frames, dur: r.dur, missing: r.missing });
      const s = await call('animSheet', r.b64, lib, key, key);
      await page.screenshot({ path: path.join(SHEETS, `momask_${key}.png`) }); M.scores = s.scores;
      console.log(`momask ${key}: ${r.frames} frames, ${r.dur}s`);
    } catch (e) { M.error = String(e).slice(0, 300); console.log(key, 'error', M.error); }
    save();
  }
}
await browser.close();
