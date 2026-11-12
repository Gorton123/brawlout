// Unified keyboard/mouse + Xbox (standard gamepad) input
const GP = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13 };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.gp = null; this.gpPrev = []; this.gpNow = [];
    this.usingPad = false;
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code); this.usingPad = false;
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    canvas.addEventListener('mousedown', e => { this.keys.add('M' + e.button); this.pressed.add('M' + e.button); this.usingPad = false; e.preventDefault(); });
    addEventListener('mouseup', e => this.keys.delete('M' + e.button));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (document.pointerLockElement === canvas) { this.mdx += e.movementX; this.mdy += e.movementY; }
    });
    addEventListener('blur', () => this.keys.clear());
    this.tx = 0; this.ty = 0;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.touch) this.buildTouch();
  }
  buildTouch() {
    const css = document.createElement('style');
    css.textContent = `
      html,body,#c{touch-action:none;-webkit-touch-callout:none;-webkit-user-select:none}
      #tc{position:fixed;inset:0;display:none;z-index:5;touch-action:none}
      #tc .zone{position:absolute;top:0;bottom:0}
      #tc .stick{position:absolute;width:120px;height:120px;margin:-60px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(0,0,0,.25);display:none;pointer-events:none}
      #tc .knob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px;border-radius:50%;background:rgba(255,255,255,.55)}
      #tc .tb{position:absolute;border-radius:50%;background:rgba(0,0,0,.45);border:2px solid rgba(255,255,255,.45);color:#fff;font:bold 11px Arial;letter-spacing:1px;display:flex;align-items:center;justify-content:center;text-align:center;touch-action:none}
      #tc .tb.on{background:rgba(255,255,255,.5);color:#111}#tc .pa{border-color:rgba(111,211,255,.8);color:#bfeaff}
      #tc .big{width:78px;height:78px;font-size:13px}#tc .mid{width:58px;height:58px}#tc .sm{width:44px;height:44px;font-size:10px}
      @media (pointer:coarse){#title .controls,#padstatus{display:none}#prompts{bottom:auto;top:78px;font-size:12px}#prompts .btn{font-size:10px}}
    `;
    document.head.appendChild(css);
    const tc = this.tc = document.createElement('div'); tc.id = 'tc';
    const R = 'env(safe-area-inset-right)';
    tc.innerHTML = `
      <div class="zone" id="tzL" style="left:0;width:42%"></div>
      <div class="zone" id="tzR" style="right:0;width:58%"></div>
      <div class="stick" id="tst"><div class="knob" id="tkn"></div></div>
      <div class="tb big" data-k="T_PR" style="right:calc(22px + ${R});bottom:96px">PUNCH<br>R</div>
      <div class="tb big" data-k="T_PL" style="right:calc(112px + ${R});bottom:40px">PUNCH<br>L</div>
      <div class="tb mid" data-k="T_GR" style="right:calc(30px + ${R});bottom:190px">GRAB<br>R</div>
      <div class="tb mid" data-k="T_GL" style="right:calc(104px + ${R});bottom:140px">GRAB<br>L</div>
      <div class="tb mid" data-k="T_F" style="right:calc(204px + ${R});bottom:30px">FOCUS</div>
      <div class="tb mid pa" data-k="T_PA" style="right:calc(196px + ${R});bottom:112px">PARRY</div>
      <div class="tb mid" data-k="T_D" style="right:calc(26px + ${R});bottom:18px">DODGE</div>
      <div class="tb sm" data-k="T_S" style="left:calc(20px + env(safe-area-inset-left));bottom:20px">RUN</div>
      <div class="tb sm" data-k="T_T" style="right:calc(20px + ${R});top:96px">3RD</div>
      <div class="tb sm" data-k="T_P" style="right:calc(72px + ${R});top:96px">II</div>`;
    document.body.appendChild(tc);
    const st = tc.querySelector('#tst'), kn = tc.querySelector('#tkn');
    let mv = null, lk = null, lx = 0, ly = 0, ox = 0, oy = 0;
    const zl = tc.querySelector('#tzL'), zr = tc.querySelector('#tzR');
    zl.addEventListener('pointerdown', e => { if (mv !== null) return; mv = e.pointerId; ox = e.clientX; oy = e.clientY; st.style.left = ox + 'px'; st.style.top = oy + 'px'; st.style.display = 'block'; kn.style.transform = ''; e.preventDefault(); });
    zr.addEventListener('pointerdown', e => { if (lk !== null) return; lk = e.pointerId; lx = e.clientX; ly = e.clientY; e.preventDefault(); });
    addEventListener('pointermove', e => {
      if (e.pointerId === mv) {
        let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy), m = 50;
        if (l > m) { dx *= m / l; dy *= m / l; }
        this.tx = dx / m; this.ty = dy / m; kn.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (e.pointerId === lk) {
        this.mdx += (e.clientX - lx) * 2.4; this.mdy += (e.clientY - ly) * 2.4; lx = e.clientX; ly = e.clientY;
      }
    }, { passive: true });
    const up = e => {
      if (e.pointerId === mv) { mv = null; this.tx = this.ty = 0; st.style.display = 'none'; }
      if (e.pointerId === lk) lk = null;
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    for (const b of tc.querySelectorAll('.tb')) {
      const k = b.dataset.k; const ids = new Set();
      const off = e => { if (!ids.delete(e.pointerId)) return; if (!ids.size) { this.keys.delete(k); b.classList.remove('on'); } };
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); ids.add(e.pointerId); this.keys.add(k); this.pressed.add(k); b.classList.add('on'); this.usingPad = false; });
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    }
    document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
  }
  showTouch(on) { if (this.tc && this._tv !== on) { this._tv = on; this.tc.style.display = on ? 'block' : 'none'; } }
  lock() { if (document.pointerLockElement !== this.canvas) { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } }
  get locked() { return document.pointerLockElement === this.canvas; }
  poll() {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) {}
    this.gp = null;
    for (const p of pads) if (p && p.connected) { this.gp = p; break; }
    this.gpPrev = this.gpNow;
    this.gpNow = this.gp ? this.gp.buttons.map(b => b.value > 0.45 || b.pressed) : [];
    if (this.gp) {
      const any = this.gpNow.some(Boolean) || this.gp.axes.some(a => Math.abs(a) > 0.3);
      if (any) this.usingPad = true;
    }
  }
  gpDown(b) { return !!this.gpNow[b]; }
  gpPressed(b) { return !!this.gpNow[b] && !this.gpPrev[b]; }
  axis(i) { if (!this.gp) return 0; const v = this.gp.axes[i] || 0; const dz = 0.15; return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz); }
  down(k) { return this.keys.has(k); }
  hit(k) { return this.pressed.has(k); }

  state() {
    const k = c => this.down(c) ? 1 : 0;
    let mx = k('KeyD') - k('KeyA') + this.axis(0) + this.tx;
    let my = k('KeyW') - k('KeyS') - this.axis(1) - this.ty;
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    return {
      mx, my,
      lookX: this.mdx * 0.0022, lookY: this.mdy * 0.0022,
      padLookX: this.axis(2), padLookY: this.axis(3),
      punchL: this.hit('M0') || this.hit('KeyJ') || this.gpPressed(GP.LT) || this.hit('T_PL'),
      punchR: this.hit('M2') || this.hit('KeyL') || this.gpPressed(GP.RT) || this.hit('T_PR'),
      grabL: this.hit('KeyQ') || this.gpPressed(GP.LB) || this.hit('T_GL'),
      grabR: this.hit('KeyE') || this.gpPressed(GP.RB) || this.hit('T_GR'),
      focus: this.down('KeyF') || this.down('M1') || this.gpDown(GP.A) || this.down('T_F'),
      dodge: this.hit('Space') || this.gpPressed(GP.B) || this.hit('T_D'),
      sprint: this.down('ShiftLeft') || this.down('ShiftRight') || this.gpDown(GP.L3) || this.down('T_S'),
      parry: this.hit('KeyR') || this.gpPressed(GP.X) || this.hit('T_PA'),
      stageL: this.gpPressed(GP.LB) || this.hit('ArrowLeft'), stageR: this.gpPressed(GP.RB) || this.hit('ArrowRight'),
      third: this.hit('KeyT') || this.gpPressed(GP.Y) || this.hit('T_T'),
      pause: this.hit('Escape') || this.hit('KeyP') || this.gpPressed(GP.START) || this.hit('T_P'),
      confirm: this.hit('Enter') || this.hit('M0') || this.gpPressed(GP.A) || this.gpPressed(GP.START),
    };
  }
  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; }
}
