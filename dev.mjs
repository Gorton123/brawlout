// Live dev server: edits in src/ rebuild instantly and the game in Chrome reloads itself.
import * as esbuild from 'esbuild';
import fs from 'fs';
fs.mkdirSync('dev', { recursive: true });
const models = {};
for (const n of ['brawler', 'quick', 'big']) if (fs.existsSync(`assets/${n}.glb`)) models[n] = fs.readFileSync(`assets/${n}.glb`).toString('base64');
fs.writeFileSync('dev/models.js', 'window.__MODELS=' + JSON.stringify(models) + ';');
const reload = "new EventSource('/esbuild').addEventListener('change', () => location.reload());";
fs.writeFileSync('dev/index.html', fs.readFileSync('template.html', 'utf8').replace('<script>/*BUNDLE*/</script>', `<script src="models.js"></script><script>${reload}</script><script src="main.js"></script>`));
const ctx = await esbuild.context({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', outfile: 'dev/main.js', sourcemap: true, target: 'es2020' });
await ctx.watch();
const { port } = await ctx.serve({ servedir: 'dev', port: 8000 });
console.log(`\n  BRAWL OUT dev server running:  http://localhost:${port}\n  Leave this open. Every saved change reloads the game.\n`);
