import * as THREE from 'three';

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
export function rng(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export function tex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function speckle(g, w, h, n, r, alpha, light, rand) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    g.fillRect(rand() * w, rand() * h, r * rand() + 1, r * rand() + 1);
  }
}

export function woodFloor() {
  const W = 1024, H = 1024, [c, g] = mk(W, H), r = rng(11);
  const rows = 8, ph = H / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 500;
    while (x < W) {
      const len = 280 + r() * 420;
      const l = 18 + r() * 12, hue = 22 + r() * 10;
      g.fillStyle = `hsl(${hue},${40 + r() * 15}%,${l}%)`;
      g.fillRect(x, i * ph, len, ph);
      // grain
      for (let k = 0; k < 26; k++) {
        const yy = i * ph + r() * ph;
        g.strokeStyle = `hsla(${hue - 5},50%,${l - 8 + r() * 6}%,${0.25 + r() * 0.35})`;
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        g.moveTo(x, yy);
        for (let s = 0; s <= len; s += 40) g.lineTo(x + s, yy + Math.sin(s * 0.01 + k) * 2.5);
        g.stroke();
      }
      // knot
      if (r() < 0.35) {
        const kx = x + r() * len, ky = i * ph + r() * ph;
        const gr = g.createRadialGradient(kx, ky, 1, kx, ky, 14);
        gr.addColorStop(0, 'rgba(20,10,4,0.8)'); gr.addColorStop(1, 'rgba(20,10,4,0)');
        g.fillStyle = gr; g.fillRect(kx - 15, ky - 15, 30, 30);
      }
      g.fillStyle = 'rgba(8,4,2,0.9)';
      g.fillRect(x, i * ph, 3, ph);
      x += len;
    }
    g.fillStyle = 'rgba(8,4,2,0.95)';
    g.fillRect(0, i * ph, W, 3);
  }
  speckle(g, W, H, 4000, 2, 0.15, false, r);
  speckle(g, W, H, 1500, 2, 0.06, true, r);
  return tex(c, 4, 3);
}

export function brick() {
  const W = 1024, H = 1024, [c, g] = mk(W, H), r = rng(5);
  g.fillStyle = '#6b6158'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 8000, 2, 0.3, false, r);
  const rows = 16, bh = H / rows, bw = W / 4, m = 7;
  for (let i = 0; i < rows; i++) {
    const off = (i % 2) * bw / 2;
    for (let j = -1; j < 5; j++) {
      const x = j * bw + off + m / 2, y = i * bh + m / 2;
      const hue = 8 + r() * 14, sat = 35 + r() * 25, l = 22 + r() * 14;
      g.fillStyle = `hsl(${hue},${sat}%,${l}%)`;
      g.fillRect(x, y, bw - m, bh - m);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `hsla(${hue},${sat}%,${l + (r() - 0.5) * 18}%,0.5)`;
        g.fillRect(x + r() * (bw - m), y + r() * (bh - m), 2 + r() * 8, 2 + r() * 5);
      }
      if (r() < 0.25) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y, bw - m, bh - m); }
    }
  }
  speckle(g, W, H, 6000, 3, 0.12, false, r);
  return tex(c, 3, 1.2);
}

export function plaster() {
  const W = 512, H = 512, [c, g] = mk(W, H), r = rng(9);
  g.fillStyle = '#3a2f27'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 300; i++) {
    const x = r() * W, y = r() * H, rad = 10 + r() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const l = r() < 0.5 ? 0 : 255;
    gr.addColorStop(0, `rgba(${l},${l},${l},0.05)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  speckle(g, W, H, 3000, 2, 0.12, false, r);
  return tex(c, 4, 1);
}

export function darkWood() {
  const W = 512, H = 512, [c, g] = mk(W, H), r = rng(3);
  g.fillStyle = '#2a170c'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 140; k++) {
    const y = r() * H;
    g.strokeStyle = `rgba(${10 + r() * 30},${5 + r() * 12},2,${0.3 + r() * 0.4})`;
    g.lineWidth = 0.5 + r() * 2;
    g.beginPath(); g.moveTo(0, y);
    for (let s = 0; s <= W; s += 32) g.lineTo(s, y + Math.sin(s * 0.02 + k) * 3);
    g.stroke();
  }
  return tex(c, 2, 1);
}

export function felt() {
  const W = 256, H = 256, [c, g] = mk(W, H), r = rng(4);
  g.fillStyle = '#0d4a2a'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 5000, 1.5, 0.15, false, r);
  speckle(g, W, H, 2000, 1.5, 0.06, true, r);
  return tex(c, 3, 2);
}

export function neonSign(text, color = '#ff2a6d', sub = '') {
  const W = 1024, H = 320, [c, g] = mk(W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 150px Impact, "Arial Black", sans-serif';
  for (const blur of [40, 20, 6]) {
    g.shadowColor = color; g.shadowBlur = blur;
    g.strokeStyle = color; g.lineWidth = 10;
    g.strokeText(text, W / 2, sub ? H * 0.42 : H / 2);
  }
  g.shadowBlur = 0; g.lineWidth = 4; g.strokeStyle = '#fff';
  g.strokeText(text, W / 2, sub ? H * 0.42 : H / 2);
  if (sub) {
    g.font = '700 52px "Arial Black", sans-serif';
    g.shadowColor = '#05d9e8'; g.shadowBlur = 20; g.fillStyle = '#bff8ff';
    g.fillText(sub, W / 2, H * 0.83);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function poster(title, line2, hue) {
  const W = 256, H = 384, [c, g] = mk(W, H), r = rng(hue + 1);
  g.fillStyle = `hsl(${hue},60%,18%)`; g.fillRect(0, 0, W, H);
  g.fillStyle = `hsl(${hue + 20},80%,50%)`;
  g.beginPath(); g.arc(W / 2, H * 0.45, 80, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  g.fillRect(W / 2 - 22, H * 0.3, 44, 120); g.beginPath(); g.arc(W / 2, H * 0.27, 26, 0, Math.PI * 2); g.fill();
  g.fillRect(W / 2 - 70, H * 0.36, 140, 18);
  g.fillStyle = '#f4e9d8'; g.textAlign = 'center';
  g.font = '900 44px Impact, sans-serif'; g.fillText(title, W / 2, 56);
  g.font = '700 22px Arial, sans-serif'; g.fillText(line2, W / 2, H - 40);
  speckle(g, W, H, 2500, 2, 0.25, true, r);
  speckle(g, W, H, 2500, 2, 0.2, false, r);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function labelTex(bg, fg, text) {
  const [c, g] = mk(128, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg; g.font = '900 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
