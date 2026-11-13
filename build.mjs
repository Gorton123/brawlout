import { build } from 'esbuild';
import fs from 'fs';
import zlib from 'zlib';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const models = {};
// every model in assets/ is embedded (clips first)
const names = ['clips', ...fs.readdirSync('assets').filter(f => f.endsWith('.glb')).map(f => f.slice(0, -4)).filter(n => n !== 'clips').sort()];
for (const n of names) if (fs.existsSync(`assets/${n}.glb`)) models[n] = 'gz:' + zlib.gzipSync(fs.readFileSync(`assets/${n}.glb`), { level: 9 }).toString('base64');
const modelJs = 'window.__MODELS=' + JSON.stringify(models) + ';';
const html = fs.readFileSync('template.html', 'utf8').replace('/*BUNDLE*/', () => modelJs + '\n' + js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/brawl-out.html', html);
console.log('built', (html.length / 1024 / 1024).toFixed(1) + ' MB');
