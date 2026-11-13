#!/usr/bin/env node
// Brawl Out character build system.
//   node pipeline/cbuild.mjs status            show every character and its next step
//   node pipeline/cbuild.mjs build [id...]     run every step that can run (fetch -> orient -> ingest -> check -> install)
//   node pipeline/cbuild.mjs check <id>        analyse a character's files and write previews
// Steps per character (files live in characters/<id>/):
//   1 fetch   download source.raw / source.rigged URLs from roster.json  -> raw.glb / rigged.glb
//   2 orient  turn raw.glb to face +Z, strip any rig                   -> front.glb + <id>_mixamo.zip (+ preview_front.png)
//   3 autorig free built-in rigger: fits the Mixamo skeleton + skin weights to front.glb -> game.glb
//   3b (optional, better) upload <id>_mixamo.zip to mixamo.com, download "FBX Binary, With Skin, T-pose", commit it as mixamo.fbx
//   4 ingest  mixamo.fbx -> game.glb (Mixamo skeleton, shared animation clips)
//   5 check   rig sanity checks + preview_idle.png / preview_punch.png
//   6 install copy game.glb to assets/<slot>.glb when status is "approved" (or --force)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CH = path.join(ROOT, 'characters');
const ROSTER = path.join(CH, 'roster.json');
const roster = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
const args = process.argv.slice(2), cmd = args[0] || 'status';
const force = args.includes('--force');
const ids = args.slice(1).filter(a => !a.startsWith('--'));
const log = (...a) => console.log(...a);
const P = (id, f) => path.join(CH, id, f);
const has = (id, f) => fs.existsSync(P(id, f));
const newer = (id, a, b) => has(id, a) && (!has(id, b) || fs.statSync(P(id, a)).mtimeMs > fs.statSync(P(id, b)).mtimeMs);

function nextStep(c) {
  const id = c.id;
  if (!has(id, 'raw.glb') && c.source?.raw) return 'fetch';
  if (has(id, 'raw.glb') && !has(id, 'front.glb')) return 'orient';
  if (!has(id, 'mixamo.fbx') && (!has(id, 'game.glb') || newer(id, 'front.glb', 'game.glb'))) return 'autorig';
  if (!has(id, 'mixamo.fbx') && c.status === 'approved') return 'done (auto-rigged; optional upgrade: commit a Mixamo FBX as characters/' + id + '/mixamo.fbx)';
  if (newer(id, 'mixamo.fbx', 'game.glb')) return 'ingest';
  if (c.status !== 'approved') return 'review previews, then set "status": "approved" in roster.json';
  return 'done';
}

// ---------- browser worker ----------
let browser, page;
async function web() {
  if (page) return page;
  const esbuild = await import('esbuild');
  const out = path.join(ROOT, 'pipeline', '.page.bundle.js');
  await esbuild.build({ entryPoints: [path.join(ROOT, 'pipeline', 'page.js')], bundle: true, format: 'iife', outfile: out, logLevel: 'warning' });
  fs.writeFileSync(path.join(ROOT, 'pipeline', '.page.html'), '<!doctype html><html><body style="margin:0"><script src=".page.bundle.js"></script></body></html>');
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  page = await browser.newPage({ viewport: { width: 400, height: 520 } });
  page.on('pageerror', e => log('  [page error]', e.message));
  await page.goto('file://' + path.join(ROOT, 'pipeline', '.page.html'));
  return page;
}
const b64 = f => fs.readFileSync(f).toString('base64');
async function call(fn, ...a) { const p = await web(); return p.evaluate(([fn, a]) => window[fn](...a), [fn, a]); }
async function shot(file) { const p = await web(); await p.screenshot({ path: file }); }

// ---------- steps ----------
async function fetchStep(c) {
  for (const [key, file] of [['raw', 'raw.glb'], ['rigged', 'rigged.glb']]) {
    const url = c.source?.[key]; if (!url || has(c.id, file)) continue;
    log(`  fetch ${key}: ${url}`);
    const r = await fetch(url); if (!r.ok) throw new Error(`download failed ${r.status} for ${url}`);
    fs.writeFileSync(P(c.id, file), Buffer.from(await r.arrayBuffer()));
  }
}
async function orientStep(c) {
  const r = await call('orient', b64(P(c.id, 'raw.glb')));
  fs.writeFileSync(P(c.id, 'front.glb'), Buffer.from(r.b64, 'base64'));
  log(`  orient: was facing ${r.facing.forward}, turned ${(r.facing.yawToZ * 180 / Math.PI).toFixed(0)} deg -> front.glb (${(r.size / 1e6).toFixed(1)} MB)`);
  // OBJ zip for Mixamo
  const o = await call('toOBJ', b64(P(c.id, 'front.glb')), 2048);
  const tmp = P(c.id, '.obj'); fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'model.obj'), o.obj);
  fs.writeFileSync(path.join(tmp, 'model.mtl'), 'newmtl skin\nKd 1 1 1\nmap_Kd texture.jpg\n');
  fs.writeFileSync(path.join(tmp, 'texture.jpg'), Buffer.from(o.jpg, 'base64'));
  const zip = P(c.id, `${c.id}_mixamo.zip`); if (fs.existsSync(zip)) fs.rmSync(zip);
  execFileSync('zip', ['-q', '-j', zip, path.join(tmp, 'model.obj'), path.join(tmp, 'model.mtl'), path.join(tmp, 'texture.jpg')]);
  fs.rmSync(tmp, { recursive: true });
  await call('preview', b64(P(c.id, 'front.glb')), null, null, 0); await shot(P(c.id, 'preview_front.png'));
  log(`  mixamo zip ready: characters/${c.id}/${c.id}_mixamo.zip`);
}
async function autorigStep(c) {
  const r = await call('autorig', b64(P(c.id, 'front.glb')), b64(path.join(ROOT, 'assets', 'quick.glb')), { tex: c.texture || 1024, ntex: c.normalTexture || 512 });
  fs.writeFileSync(P(c.id, 'game.glb'), Buffer.from(r.b64, 'base64'));
  log(`  autorig: game.glb ${(r.size / 1e6).toFixed(2)} MB  legs merge ${r.info.legMerge}, armpits ${r.info.LeftArmpit}/${r.info.RightArmpit}`);
}
async function ingestStep(c) {
  const r = await call('ingestFBX', b64(P(c.id, 'mixamo.fbx')), { tex: c.texture || 1024 });
  fs.writeFileSync(P(c.id, 'game.glb'), Buffer.from(r.b64, 'base64'));
  log(`  ingest: game.glb ${(r.size / 1e6).toFixed(2)} MB, texture: ${r.hasTexture ? 'yes' : 'MISSING'}`);
}
async function checkStep(c) {
  const lib = path.join(ROOT, 'assets', 'clips.glb');
  const libB64 = fs.existsSync(lib) ? b64(lib) : null;
  for (const f of ['raw.glb', 'rigged.glb', 'game.glb']) {
    if (!has(c.id, f)) continue;
    const a = await call('analyse', b64(P(c.id, f)));
    log(`  check ${f}: faces ${a.forward}, ${a.skinned ? a.bones + ' bones' : 'no rig'}${a.rigOK === false ? '  !! ' + a.problem : a.rigOK ? '  rig OK' : ''}`);
    if (f === 'game.glb') {
      if (a.forward !== '+z') log('  !! game.glb does not face +Z');
      for (const [clip, t, name] of [['Fighting_Idle', 0.5, 'preview_idle.png'], ['Punching', 0.45, 'preview_punch.png']]) {
        await call('preview', b64(P(c.id, f)), libB64, clip, t); await shot(P(c.id, name));
      }
    }
  }
}
function installStep(c) {
  if (!has(c.id, 'game.glb')) return;
  if (c.status !== 'approved' && !force) { log(`  install skipped (status "${c.status}" - set "approved" in roster.json)`); return; }
  fs.copyFileSync(P(c.id, 'game.glb'), path.join(ROOT, 'assets', `${c.slot}.glb`));
  log(`  installed -> assets/${c.slot}.glb`);
}

// ---------- main ----------
const pick = roster.characters.filter(c => !ids.length || ids.includes(c.id));
try {
  if (cmd === 'status') {
    for (const c of roster.characters) log(`${c.id.padEnd(12)} slot=${(c.slot || '-').padEnd(9)} status=${(c.status || '-').padEnd(10)} next: ${nextStep(c)}`);
  } else if (cmd === 'check') {
    for (const c of pick) { log(c.id); await checkStep(c); }
  } else if (cmd === 'build') {
    for (const c of pick) {
      log(c.id); fs.mkdirSync(P(c.id, ''), { recursive: true });
      if (nextStep(c) === 'fetch') await fetchStep(c);
      if (nextStep(c) === 'orient' || (force && has(c.id, 'raw.glb'))) await orientStep(c);
      if (nextStep(c) === 'autorig' || (force && has(c.id, 'front.glb') && !has(c.id, 'mixamo.fbx'))) await autorigStep(c);
      if (nextStep(c) === 'ingest' || (force && has(c.id, 'mixamo.fbx'))) await ingestStep(c);
      await checkStep(c);
      installStep(c);
      log(`  next: ${nextStep(c)}`);
    }
  } else { log('commands: status | build [id...] [--force] | check <id>'); }
} finally { if (browser) await browser.close(); }
