import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPub, ROOM } from './world.js';
import { buildRome, buildMoon, buildStreet, glowRing } from './stages.js';
import { Prop } from './props.js';
import { Enemy, TYPES } from './enemy.js';
import { Player, LABEL, wexecSpec } from './player.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { loadModels, Models, instance } from './models.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uFocus: { value: 0 }, uHurt: { value: 0 }, uTime: { value: 0 }, uAb: { value: 0 }, uLow: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1.08 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uFocus, uHurt, uTime, uAb, uLow, uSat; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5; float r = length(d);
      float ab = uAb * 0.008 + uFocus * 0.0025;
      vec3 col = vec3(texture2D(tDiffuse, vUv + d * ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ab).b);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSat) * uTint;
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
      col = mix(col, vec3(lum) * vec3(0.8, 0.95, 1.25), uFocus * 0.7);
      col *= mix(1.0, smoothstep(0.95, 0.2, r), 0.5 + uFocus * 0.35);
      float hurt = max(uHurt, uLow * (0.55 + 0.45 * sin(uTime * 5.0)));
      col = mix(col, col * vec3(1.5, 0.25, 0.25) + vec3(0.12, 0.0, 0.0), hurt * smoothstep(0.25, 0.75, r));
      float n = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.03;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const STAGES = {
  pub: { name: 'THE PUB', tag: 'FOR ALL OUT · THE PUB', build: buildPub, room: { minX: -9, maxX: 9, minZ: -7, maxZ: 7, r: 0 }, grav: -9.82,
    roster: { a: 'brawler', f: 'quick', b: 'big' }, bg: 0x0b0705, fog: [0x120a06, 0.035], env: 0.25, exp: 1.05, bloom: 0.6, tint: [1.04, 0.99, 0.93], start: [0, 2.5],
    sub: 'LAST ORDERS', bossLine: 'THE BIG LAD HAS ARRIVED - THE DOORS ARE LOCKED', bossName: 'BOSS: THE BIG LAD', unlock: null },
  rome: { name: 'THE COLOSSEUM', tag: 'ROME · ARE YOU NOT ENTERTAINED?', build: buildRome, room: { minX: -10.1, maxX: 10.1, minZ: -10.1, maxZ: 10.1, r: 10.0 }, grav: -9.82,
    roster: { a: 'gladiator', f: 'murmillo', b: 'champion' }, bg: 0x8fb6d8, fog: [0xd8c2a0, 0.011], env: 0.55, exp: 0.95, bloom: 0.35, tint: [1.05, 1.0, 0.9], start: [0, 4],
    sub: 'ARE YOU NOT ENTERTAINED?', bossLine: 'THE CHAMPION ENTERS THE ARENA', bossName: 'BOSS: THE CHAMPION', unlock: 'pub' },
  moon: { name: 'THE MOON', tag: 'LUNAR BASE · ALIEN BRAWL', build: buildMoon, room: { minX: -11.6, maxX: 11.6, minZ: -11.6, maxZ: 11.6, r: 11.4 }, grav: -1.62,
    roster: { a: 'grunt', f: 'skitter', b: 'brute' }, bg: 0x000000, fog: [0x000000, 0.004], env: 0.18, exp: 0.95, bloom: 0.5, tint: [0.93, 0.98, 1.08], start: [0, 3],
    sub: 'INCOMING', bossLine: 'THE ALIEN BRUTE HAS LANDED', bossName: 'BOSS: THE BRUTE', unlock: 'rome' },
  street: { name: 'THE STREET', tag: 'LONDON · TIME IS MONEY', build: buildStreet, room: { minX: -12.6, maxX: 12.6, minZ: -4.9, maxZ: 4.9, r: 0 }, grav: -9.82,
    roster: { a: 'roadman', f: 'runner', b: 'topboy' }, bg: 0x05060d, fog: [0x151522, 0.028], env: 0.22, exp: 1.1, bloom: 0.75, tint: [0.95, 0.96, 1.1], start: [0, 0],
    sub: 'TIME IS MONEY', bossLine: 'THE TOP BOY WANTS HIS MONEY BACK', bossName: 'BOSS: THE TOP BOY', unlock: 'moon', timed: true },
};
const ORDER = ['pub', 'rome', 'moon', 'street'];
const RANKS = [[130, 'S', '#ffd23f', 2], [95, 'A', '#ff6a3d', 1.6], [65, 'B', '#ff2a6d', 1.35], [38, 'C', '#6fd3ff', 1.15], [15, 'D', '#b0b0b0', 1]];
function waveList(n, R) {
  const W = [[R.a], [R.a, R.a], [R.a, R.f], [R.f, R.a, R.a], [R.b, R.a]];
  if (n <= W.length) return W[n - 1];
  const list = [];
  const count = Math.min(7, 2 + Math.floor(n / 2));
  for (let i = 0; i < count; i++) list.push(Math.random() < 0.3 ? R.f : R.a);
  if (n % 5 === 0) list.unshift(R.b);
  else if (n > 6 && Math.random() < 0.4) list.push(R.b);
  return list;
}

class Game {
  constructor() {
    const canvas = this.canvas = document.getElementById('c');
    this.isTest = /test/.test(location.hash);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    this.maxPR = Math.min(devicePixelRatio || 1, 1.5); this.pr = Math.min(this.maxPR, 1.0);
    r.setPixelRatio(this.pr);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0705);
    scene.fog = new THREE.FogExp2(0x120a06, 0.035);
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.25;
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.03, 60);
    scene.add(this.camera);
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w); w.allowSleep = true;
    w.defaultContactMaterial.friction = 0.45; w.defaultContactMaterial.restitution = 0.12;
    w.solver.iterations = 12;
    this.events = []; this.enemies = []; this.props = [];
    this.audio = new Audio(); this.fx = new FX(this);
    this.input = new Input(canvas);
    this.player = new Player(this);
    this.pickups = []; this.styleS = { pts: 0, last: '', idle: 0, rank: '' }; this.tpManual = false; this.tpK = 0; this.killCam = null;
    try { this.progress = JSON.parse(localStorage.getItem('brawlout_stars') || '{}') || {}; } catch (e) { this.progress = {}; }
    this.ray = new THREE.Raycaster();
    this.setupPost();
    if (this.input.touch) { this.maxPR = Math.min(devicePixelRatio || 1, 1.25); }
    let sk = 'pub'; try { sk = localStorage.getItem('brawlout_stage') || 'pub'; } catch (e) {}
    if (!STAGES[sk] || !this.unlocked(sk)) sk = 'pub';
    this.setStage(sk);
    this.state = 'title'; this.time = 0; this.dtW = 0;
    this.ws = 1; this.hitstopT = 0; this.slowT = 0; this.slowScale = 1; this.trauma = 0; this.hurtFlash = 0;
    this.score = 0; this.best = 0; try { this.best = +localStorage.getItem('brawlout_best') || 0; } catch (e) {}
    this.wave = 0; this.queue = []; this.spawnT = 0; this.waveClearT = 0; this.kills = 0;
    this.third = { k: 0, on: false, endT: 0 }; this.thirdOffer = 0; this.firstHold = true; this.hintT = 0;
    this.quality = this.quality || 'high'; this.fpsAcc = 0; this.fpsN = 0; this.lowStrikes = 0;
    this.ui = {}; for (const id of ['hud', 'hpbar', 'focusbar', 'score', 'wave', 'combo', 'prompts', 'reticle', 'partlabel', 'cross', 'banner', 'btitle', 'bsub', 'toast', 'title', 'pause', 'over', 'overstats', 'thirdp', 'qbtn', 'bbtn', 'padstatus', 'enemyinfo']) this.ui[id] = document.getElementById(id);
    this.bindUI();
    this.ui.srank = document.getElementById('srank'); this.ui.sfill = document.getElementById('sfill'); this.ui.timer = document.getElementById('timer');
    this.buildStageMenu();
    addEventListener('resize', () => this.resize()); this.resize();
    this.last = performance.now();
    this.loading = true;
    const startEl = document.querySelector('#title .start');
    startEl.textContent = 'LOADING FIGHTERS...';
    const finish = () => { this.loading = false; startEl.textContent = this.input.touch ? 'TAP TO FIGHT' : 'CLICK OR PRESS A TO FIGHT'; };
    if (window.__MODELS) loadModels(window.__MODELS, { brawler: 1.0, hero: 0.98, hero_rome: 0.98, hero_moon: 0.98, quick: 0.95, big: 1.12, grunt: 0.98, gladiator: 1.0, topboy: 1.06, champion: 1.12, brute: 1.15, skitter: 0.92, murmillo: 0.98, runner: 0.95, roadman: 1.0 }).then(finish, e => { console.warn(e); finish(); });
    else finish();
    requestAnimationFrame(t => this.loop(t));
  }

  setupPost() {
    const c = this.composer = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.45, 1.15);
    c.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
    c.addPass(new OutputPass());
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setPixelRatio(this.pr); this.composer.setSize(innerWidth, innerHeight);
  }
  setQuality(q) {
    this.quality = q;
    this.bloom.enabled = q === 'high';
    this.renderer.shadowMap.enabled = q === 'high';
    if (this.keyLight) this.keyLight.castShadow = q === 'high';
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.maxPR = q === 'high' ? Math.min(devicePixelRatio || 1, 1.5) : 0.75;
    this.pr = Math.min(this.pr, this.maxPR); this.resize();
    if (this.ui && this.ui.qbtn) this.ui.qbtn.textContent = 'GRAPHICS: ' + q.toUpperCase();
  }
  bindUI() {
    const start = () => { this.audio.init(); if (this.loading) return; if (this.state === 'title' || this.state === 'over') this.startGame(); else if (this.state === 'paused') this.resume(); };
    this.ui.title.addEventListener('click', e => { if (e.target.closest('button')) return; start(); });
    this.ui.over.addEventListener('click', start);
    this.ui.pause.addEventListener('click', start);
    this.ui.qbtn.addEventListener('click', e => { e.stopPropagation(); this.audio.init(); this.setQuality(this.quality === 'high' ? 'low' : 'high'); });
    this.ui.bbtn.addEventListener('click', e => { e.stopPropagation(); this.toggleBlood(); });
    for (const id of ['overmenu', 'pausemenu']) { const b = document.getElementById(id); if (b) b.addEventListener('click', e => { e.stopPropagation(); this.toTitle(); }); }
    addEventListener('keydown', () => this.audio.init(), { once: false });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing' && this.wasLocked && !this.input.usingPad) this.pause();
      this.wasLocked = this.input.locked;
    });
  }
  toggleBlood() { this.fx.bloodOn = !this.fx.bloodOn; this.ui.bbtn.textContent = 'BLOOD: ' + (this.fx.bloodOn ? 'ON' : 'OFF'); }

  unlocked(k) { const u = STAGES[k].unlock; return !u || (this.progress[u] || 0) >= 1; }
  buildStageMenu() {
    const box = document.getElementById('stages'); if (!box) return;
    box.innerHTML = '';
    this.stageBtns = {};
    for (const k of ORDER) {
      const st = STAGES[k], b = document.createElement('button');
      b.className = 'stage'; b.dataset.k = k;
      b.addEventListener('click', e => { e.stopPropagation(); this.audio.init(); if (this.unlocked(k)) { this.setStage(k); this.refreshStageMenu(); } else this.toast('CLEAR 2 WAVES IN ' + STAGES[st.unlock].name + ' TO UNLOCK', 1.6); });
      box.appendChild(b); this.stageBtns[k] = b;
    }
    this.refreshStageMenu();
  }
  refreshStageMenu() {
    if (!this.stageBtns) return;
    for (const k of ORDER) {
      const b = this.stageBtns[k], st = STAGES[k], n = this.progress[k] || 0, un = this.unlocked(k);
      b.innerHTML = `<div class="sn">${un ? '' : '&#128274; '}${st.name}</div><div class="ss">${'&#9733;'.repeat(n)}${'&#9734;'.repeat(3 - n)}</div>` + (un ? '' : `<div class="sl">CLEAR 2 WAVES IN ${STAGES[st.unlock].name}</div>`);
      b.classList.toggle('sel', k === this.stageKey); b.classList.toggle('locked', !un);
    }
    const tag = document.querySelector('#title .tag'); if (tag) tag.textContent = STAGES[this.stageKey].tag;
  }
  cycleStage(d) {
    let i = ORDER.indexOf(this.stageKey);
    for (let n = 0; n < ORDER.length; n++) { i = (i + d + ORDER.length) % ORDER.length; if (this.unlocked(ORDER[i])) break; }
    this.setStage(ORDER[i]); this.refreshStageMenu();
  }
  toTitle() {
    for (const e of this.enemies) e.dispose(); this.enemies = []; this.queue = [];
    this.state = 'title'; this.ui.over.style.display = 'none'; this.ui.pause.style.display = 'none'; this.ui.hud.style.display = 'none';
    this.ui.title.style.display = 'flex'; this.refreshStageMenu();
    document.exitPointerLock && document.exitPointerLock();
  }
  setStage(key) {
    const ST = STAGES[key]; if (!ST || (this.stageKey === key && this.stageRoot)) return;
    for (const e of this.enemies) e.dispose(); this.enemies = []; this.queue = [];
    if (this.player) for (const a of Object.values(this.player.arms)) { this.player.releaseArm(a); if (a.prop) { a.prop.destroy(); a.prop = null; } }
    for (const p of this.props) p.destroy(); this.props = [];
    for (const pk of this.pickups) this.scene.remove(pk.mesh); this.pickups = [];
    for (const b of this.stageBodies || []) this.world.removeBody(b);
    if (this.stageRoot) {
      this.scene.remove(this.stageRoot);
      const seen = new Set();
      this.stageRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); for (const m of [].concat(o.material || [])) { if (seen.has(m)) continue; seen.add(m); for (const t of ['map', 'bumpMap', 'emissiveMap']) if (m[t]) m[t].dispose(); m.dispose(); } });
    }
    for (const k of ['neon', 'jukeGlow', 'motes', 'bulbs', 'lightsList', 'barSpawn', 'surfaces', 'crowdBands', 'flames', 'torchLights', 'traps', 'meteors', 'earth', 'blink', 'rain', 'lampLights', 'emperorArm', 'emperorPos', 'keyLight', 'cut']) this[k] = null;
    this.dark = false; this._lf = null;
    this.fx.clearDecals();
    Object.assign(ROOM, ST.room);
    this.world.gravity.set(0, ST.grav, 0);
    this.scene.background = new THREE.Color(ST.bg); this.scene.fog = new THREE.FogExp2(ST.fog[0], ST.fog[1]);
    this.baseEnv = ST.env; this.scene.environmentIntensity = ST.env; this.renderer.toneMappingExposure = ST.exp;
    this.bloom.strength = ST.bloom; this.grade.uniforms.uTint.value.set(...ST.tint);
    this.stageRoot = new THREE.Group(); this.scene.add(this.stageRoot);
    const add = this.world.addBody, bodies = [];
    this.world.addBody = b => { if (!(b.userData && b.userData.prop)) bodies.push(b); return add.call(this.world, b); };
    let res;
    try { res = ST.build(this); } finally { this.world.addBody = add; }
    this.stageBodies = bodies;
    this.colliders = res.colliders; this.props = res.props; this.spawns = res.spawns;
    this.slots = this.props.map(p => ({ type: p.type, pos: p.body.position.clone(), color: p.colorIdx }));
    this.stageKey = key; this.stage = ST;
    if (this.input.touch && this.keyLight && this.keyLight.shadow.mapSize.x > 1024) this.keyLight.shadow.mapSize.set(1024, 1024);
    this.setQuality(this.quality || 'high');
    this.trapT = 6; this.meteorT = 5; this.crowdT = 3; this.sirenT = 12;
    if (this.player) { this.player.reset(); this.player.pos.set(ST.start[0], 0, ST.start[1]); }
    try { localStorage.setItem('brawlout_stage', key); } catch (e) {}
  }
  starsFor(cleared) { return cleared >= 9 ? 3 : cleared >= 5 ? 2 : cleared >= 2 ? 1 : 0; }
  rankInfo() { const p = this.styleS.pts; for (const r of RANKS) if (p >= r[0]) return r; return null; }
  addStyle(tag, v) {
    const S = this.styleS; S.pts = Math.min(160, S.pts + (S.last === tag ? v * 0.4 : v)); S.last = tag; S.idle = 0;
  }
  onPlayerHurt(d) { this.styleS.pts = Math.max(0, this.styleS.pts - 22); }
  onParry(e) {
    this.slowmo(0.2, 0.9); this.hitStop(0.06); this.addShake(0.3);
    this.audio.parry();
    const hand = e.byName[e.atkSide === 'L' ? 'lArmL' : 'lArmR'] || e.byName.torso;
    this.fx.sparks(hand.mesh.position);
    this.banner('PARRY!', 'HE IS OPEN - HIT HIM OR LIFT HIM', 1.0);
    this.addStyle('parry', 22); this.player.focus = Math.min(100, this.player.focus + 30);
  }
  onCash(prop) {
    this.score += 100; this.cash = (this.cash || 0) + 100;
    if (this.stage.timed) { this.timeLeft = Math.min(99, this.timeLeft + 3); this.toast('+£100  +3s', 0.8); } else this.toast('+£100', 0.8);
    this.addStyle('cash', 9);
  }
  spawnPickup(kind, pos, vel) {
    const g = new THREE.Group();
    if (kind === 'amphora') {
      const m = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0.02], [0.13, 0.12], [0.11, 0.24], [0.05, 0.3], [0.05, 0.36], [0.07, 0.38], [0, 0.38]].map(p => new THREE.Vector2(p[0], p[1])), 16), new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 1, roughness: 0.3, emissive: 0x553300 }));
      g.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.24), new THREE.MeshStandardMaterial({ color: kind === 'chips' ? 0xd8202a : 0xeeeeee, roughness: 0.5 }));
      m.position.y = 0.12; g.add(m);
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.25), new THREE.MeshBasicMaterial({ color: kind === 'chips' ? 0xffe060 : 0xd01010 })); c1.position.y = 0.12; g.add(c1);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.25), c1.material); c2.position.y = 0.12; g.add(c2);
    }
    const glow = new THREE.PointLight(kind === 'amphora' ? 0xffc040 : 0x60ff90, 2.5, 3, 2); glow.position.y = 0.4; g.add(glow);
    g.position.copy(pos); this.scene.add(g);
    this.pickups.push({ mesh: g, kind, vel: vel ? vel.clone() : new THREE.Vector3(), t: 0 });
  }
  updatePickups(dt) {
    const P = this.player, gy = this.world.gravity.y;
    for (const pk of this.pickups) {
      pk.t += dt; const m = pk.mesh;
      if (m.position.y > 0.02 || pk.vel.y > 0) { pk.vel.y += gy * dt; m.position.addScaledVector(pk.vel, dt); if (m.position.y < 0.02) { m.position.y = 0.02; pk.vel.set(0, 0, 0); } }
      const r = Math.hypot(m.position.x, m.position.z), R = ROOM.r || 0;
      if (R && r > R - 0.4) { m.position.x *= (R - 0.4) / r; m.position.z *= (R - 0.4) / r; }
      m.rotation.y += dt * 2;
      if (Math.hypot(P.pos.x - m.position.x, P.pos.z - m.position.z) < 0.85 && !P.dead) {
        P.hp = Math.min(100, P.hp + 40); pk.dead = true; this.scene.remove(m);
        this.toast(pk.kind === 'amphora' ? 'GIFT FROM THE EMPEROR: +40 HEALTH' : pk.kind === 'chips' ? 'CHIPS! +40 HEALTH' : 'SUPPLY DROP: +40 HEALTH', 1.3);
        this.audio.bell();
      }
    }
    this.pickups = this.pickups.filter(p => !p.dead);
  }
  waveReward() {
    const k = this.stageKey;
    if (k === 'rome' && this.emperorPos) {
      const ep = this.emperorPos.clone();
      if (Math.random() < 0.5) this.spawnPickup('amphora', ep, new THREE.Vector3((Math.random() - 0.5) * 3, 4, 5.5));
      else { const pr = new Prop(this, Math.random() < 0.5 ? 'sword' : 'spear', ep.x, ep.y, ep.z + 0.5); pr.body.velocity.set((Math.random() - 0.5) * 3, 3, 6); pr.thrown = 0; this.props.push(pr); }
      this.toast('THE EMPEROR THROWS YOU A GIFT', 1.5); this.audio.roar(0.8);
      if (this.emperorArm) { this.emperorArm.rotation.z = -2.2; setTimeout(() => this.emperorArm && (this.emperorArm.rotation.z = -0.6), 900); }
    } else if (k === 'moon') {
      const a = Math.random() * 6.28, r = 2 + Math.random() * 5;
      this.spawnPickup('medkit', new THREE.Vector3(Math.sin(a) * r, 14, Math.cos(a) * r), new THREE.Vector3(0, -2, 0));
      this.toast('SUPPLY DROP INCOMING', 1.4);
    } else if (k === 'street') {
      const a = Math.random() * 6.28;
      this.spawnPickup('chips', new THREE.Vector3((Math.random() - 0.5) * 16, 0.02, (Math.random() - 0.5) * 6), null);
    }
  }
  startGame() {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.player.reset();
    this.score = 0; this.wave = 0; this.queue = []; this.kills = 0; this.clearing = false; this.hintT = 25;
    this.cut = null; this.cutT = 0; this.barmanT = 0; this._lf = null; this._chargeTip = 0; this._hugTip = 0;
    this.restock();
    this.player.pos.set(this.stage.start[0], 0, this.stage.start[1]);
    for (const pk of this.pickups) this.scene.remove(pk.mesh); this.pickups = [];
    this.styleS = { pts: 0, last: '', idle: 0, rank: '' }; this.killCam = null; this.cash = 0; this.timeLeft = 75;
    this.ui.timer.style.display = this.stage.timed ? 'block' : 'none';
    this.state = 'playing';
    this.ui.title.style.display = 'none'; this.ui.over.style.display = 'none'; this.ui.pause.style.display = 'none';
    this.ui.hud.style.display = 'block';
    if (!this.input.usingPad) this.input.lock();
  }
  pause() { this.state = 'paused'; this.ui.pause.style.display = 'flex'; }
  resume() { this.state = 'playing'; this.ui.pause.style.display = 'none'; if (!this.input.usingPad) this.input.lock(); }
  gameOver() {
    this.slowmo(0.25, 2.5);
    setTimeout(() => {
      this.state = 'over';
      if (this.score > this.best) { this.best = this.score; try { localStorage.setItem('brawlout_best', this.best); } catch (e) {} }
      const cleared = Math.max(0, this.wave - 1), st = this.starsFor(cleared), k = this.stageKey;
      const wasLocked = ORDER.filter(o => !this.unlocked(o));
      if (st > (this.progress[k] || 0)) { this.progress[k] = st; try { localStorage.setItem('brawlout_stars', JSON.stringify(this.progress)); } catch (e) {} }
      const newly = wasLocked.filter(o => this.unlocked(o));
      this.ui.overstats.innerHTML = `${this.stage.name} &nbsp;·&nbsp; Wave <b>${this.wave}</b> &nbsp;·&nbsp; K.O.s <b>${this.kills}</b> &nbsp;·&nbsp; Score <b>${this.score}</b>${this.stage.timed ? ` &nbsp;·&nbsp; Cash <b>£${this.cash}</b>` : ''}<br><span style="color:#ffd23f;font-size:30px">${'&#9733;'.repeat(st)}${'&#9734;'.repeat(3 - st)}</span> &nbsp; Best <b>${this.best}</b>` + (newly.length ? `<br><span style="color:#7dff9a">${STAGES[newly[0]].name} UNLOCKED!</span>` : '');
      this.refreshStageMenu();
      this.ui.over.style.display = 'flex';
      document.exitPointerLock && document.exitPointerLock();
    }, 1600);
    this.banner(this.outOfTime ? 'OUT OF TIME' : 'BRAWLED OUT', ''); this.outOfTime = false;
  }

  // ---------------- helpers ----------------
  hitStop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  slowmo(s, t) { this.slowScale = s; this.slowT = t; }
  addShake(a) { this.trauma = Math.min(1, this.trauma + a); }
  shakeOffset() {
    const t = this.trauma * this.trauma, T = this.time * 40;
    return { x: Math.sin(T * 1.3) * 0.05 * t, y: Math.sin(T * 1.7 + 1) * 0.05 * t, z: Math.sin(T * 1.1 + 2) * 0.04 * t };
  }
  attackers() { let n = 0; for (const e of this.enemies) if (e.state === 'windup' || e.state === 'strike') n++; return n; }
  enemyGrunt(e) { this.audio.grunt(e ? (e.type === 'big' ? 0.6 : e.type === 'quick' ? 1.3 : 0.95) : 1); }
  clearHighlights() { for (const e of this.enemies) e.highlight = null; }
  addScore(n, show) { this.score += n; }
  onKill(e, source) {
    this.kills++;
    const ri = this.rankInfo(), mul = ri ? ri[3] : 1;
    const isExec = source === 'exec' || source === 'wexec';
    const pts = Math.round((isExec ? 300 : source === 'throw' ? 150 : source === 'meteor' || source === 'trap' ? 200 : 100) * mul);
    this.score += pts;
    this.addStyle('ko:' + (source || 'punch'), isExec ? 30 : source === 'meteor' || source === 'trap' ? 24 : 14);
    const last = !this.queue.length && !this.enemies.some(o => o !== e && !o.dead) && this.wave > 0;
    if (last) { this.slowmo(isExec ? 0.25 : 0.12, 1.6); this.killCam = { e, t: 1.6 }; this.addShake(0.3); }
    if (!isExec) this.banner(last ? 'FINAL BLOW' : 'K.O.', '+' + pts + (ri ? '  ' + ri[1] + ' RANK' : ''), 1.0);
    if (this.stage.timed) { this.timeLeft = Math.min(99, this.timeLeft + 6); this.cash += 50; }
    if (this.stageKey === 'rome') { this.audio.roar(0.6 + mul * 0.3); if (mul >= 1.6 || isExec) this.toast('THE CROWD GIVES A THUMBS UP!', 1.2); }
    else this.audio.crowd(isExec ? 1.4 : 0.5);
    this.audio.bell();
    this.player.focus = Math.min(100, this.player.focus + 25);
  }
  banner(t, sub = '', dur = 1.6) {
    const b = this.ui.banner; this.ui.btitle.textContent = t; this.ui.bsub.textContent = sub;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), dur * 1000);
  }
  toast(t, dur = 1) {
    const el = this.ui.toast; el.textContent = t; el.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }
  offerThird() { this.thirdOffer = 1.5; }

  rayList(props) {
    const list = [];
    for (const e of this.enemies) if (e.state !== 'lifted' && e.state !== 'exec') for (const m of e.meshes) list.push(m);
    if (props) for (const p of this.props) {
      if (p.heldBy || p.dead) continue;
      if (!p._ml) { p._ml = []; p.mesh.traverse(o => { if (o.isMesh) p._ml.push(o); }); }
      for (const m of p._ml) list.push(m);
    }
    return list;
  }
  pickHit(hits) {
    for (const h of hits) {
      const u = h.object.userData;
      if (u.enemy) return { enemy: u.enemy, part: u.part, point: h.point.clone(), distance: h.distance };
      if (u.prop && !u.prop.heldBy) return { prop: u.prop, point: h.point.clone(), distance: h.distance };
    }
    return null;
  }
  raycast(origin, dir, far, props) {
    this.ray.set(origin, dir.clone().normalize()); this.ray.near = 0; this.ray.far = far;
    let hit = this.pickHit(this.ray.intersectObjects(this.rayList(props), false));
    if (!hit) {
      // forgiving aim: try small cone offsets
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      for (const [ox, oy] of [[0.07, 0], [-0.07, 0], [0, -0.08], [0, 0.07]]) {
        const d2 = dir.clone().addScaledVector(right, ox).add(new THREE.Vector3(0, oy, 0)).normalize();
        this.ray.set(origin, d2);
        hit = this.pickHit(this.ray.intersectObjects(this.rayList(props), false));
        if (hit) break;
      }
    }
    return hit;
  }
  raycastNDC(x, y, far) {
    this.ray.setFromCamera(new THREE.Vector2(x, y), this.camera); this.ray.far = far;
    return this.pickHit(this.ray.intersectObjects(this.rayList(true), false));
  }
  resolveCharacter(pos, r, self) {
    if (ROOM.r) { const d = Math.hypot(pos.x, pos.z), m = ROOM.r - r; if (d > m) { pos.x *= m / d; pos.z *= m / d; } }
    else { pos.x = Math.max(ROOM.minX + r, Math.min(ROOM.maxX - r, pos.x)); pos.z = Math.max(ROOM.minZ + r, Math.min(ROOM.maxZ - r, pos.z)); }
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(c.maxX, pos.x)), cz = Math.max(c.minZ, Math.min(c.maxZ, pos.z));
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-8) { pos.z = c.maxZ + r; continue; }
        const d = Math.sqrt(d2), push = (r - d) / d; pos.x += dx * push; pos.z += dz * push;
      }
    }
    const P = this.player;
    if (self) {
      if (self.state !== 'held') {
        const dx = pos.x - P.pos.x, dz = pos.z - P.pos.z, d = Math.hypot(dx, dz), m = r + 0.42;
        if (d < m && d > 1e-4) { pos.x += dx / d * (m - d); pos.z += dz / d * (m - d); }
      }
      for (const o of this.enemies) {
        if (o === self || o.mode === 'rag' || o.state === 'lifted' || o.state === 'exec') continue;
        const op = o.root.position, dx = pos.x - op.x, dz = pos.z - op.z, d = Math.hypot(dx, dz), m = r + o.radius + 0.1;
        if (d < m && d > 1e-4) { pos.x += dx / d * (m - d) * 0.5; pos.z += dz / d * (m - d) * 0.5; }
      }
    } else {
      for (const o of this.enemies) {
        if (o.mode === 'rag' || o.state === 'held' || o.state === 'lifted' || o.state === 'exec') continue;
        const op = o.root.position, dx = pos.x - op.x, dz = pos.z - op.z, d = Math.hypot(dx, dz), m = r + o.radius;
        if (d < m && d > 1e-4) { pos.x += dx / d * (m - d); pos.z += dz / d * (m - d); }
      }
    }
  }
  restock() {
    for (const s of this.slots) {
      const near = this.props.some(p => !p.dead && !p.heldBy && p.type === s.type && p.body.position.distanceTo(s.pos) < 0.7);
      if (!near) this.props.push(new Prop(this, s.type, s.pos.x, s.pos.y + 0.05, s.pos.z, s.color));
    }
  }

  // ---------------- waves ----------------
  updateWaves(dt) {
    const alive = this.enemies.filter(e => !e.dead);
    if (this.queue.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && alive.length < 4) {
        const type = this.queue.shift();
        const sp = this.spawns.slice().sort((a, b) => b.distanceTo(this.player.pos) - a.distanceTo(this.player.pos))[Math.floor(Math.random() * 2)];
        const e = new Enemy(this, type, sp.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), this.wave);
        this.enemies.push(e);
        this.spawnT = 1.6;
        if (TYPES[type] && TYPES[type].boss) { this.toast(this.stage.bossLine, 2.4); this.audio.clunk(); setTimeout(() => this.audio.clunk(), 250); if (this.stageKey === 'rome') this.audio.roar(1.2); }
      }
    } else if (alive.length === 0) {
      if (!this.clearing) { this.clearing = true; this.waveClearT = this.wave === 0 ? 1.0 : 3.0; }
      this.waveClearT -= dt;
      if (this.waveClearT <= 0) {
        this.clearing = false;
        if (this.wave >= 1) this.waveReward();
        this.wave++; this.queue = waveList(this.wave, this.stage.roster).slice(); this.spawnT = 0.8;
        this.banner('WAVE ' + this.wave, this.wave % 5 === 0 ? this.stage.bossName : this.stage.sub, 1.8);
        this.audio.bell();
        if (this.wave > 1) this.restock();
        if (this.stageKey === 'pub') {
          if (this.wave >= 2) this.barmanT = 2.5;
          if (this.wave >= 3 && this.wave % 3 === 0) this.cutT = 7;
        }
      }
    }
    // corpse cap
    const dead = this.enemies.filter(e => e.dead && e.mode === 'rag' && !e.pinned);
    while (dead.length > 5) { const e = dead.shift(); e.dispose(); this.enemies.splice(this.enemies.indexOf(e), 1); }
  }

  // ---------------- stage events ----------------
  updateHazards(dt, dtR) {
    const P = this.player, k = this.stageKey;
    // ---- Colosseum spike traps + crowd
    if (this.traps) {
      this.trapT -= dt;
      if (this.trapT <= 0 && this.wave >= 1) {
        const idle = this.traps.filter(t => t.state === 'idle');
        if (idle.length) { const tr = idle[Math.floor(Math.random() * idle.length)]; tr.state = 'warn'; tr.t = 1.3; tr.warn.visible = true; this.audio.warn(); }
        this.trapT = Math.max(3, 7 - this.wave * 0.3) + Math.random() * 3;
      }
      for (const tr of this.traps) {
        if (tr.state === 'warn') {
          tr.t -= dt; tr.warn.material.opacity = 0.5 + 0.5 * Math.sin(this.time * 18);
          if (tr.t <= 0) {
            tr.state = 'up'; tr.t = 1.0; tr.warn.visible = false; this.audio.spikes(); this.addShake(0.15);
            const near = (x, z) => Math.abs(x - tr.x) < 0.8 && Math.abs(z - tr.z) < 0.8;
            if (near(P.pos.x, P.pos.z)) P.hurt(22, null);
            for (const e of this.enemies) { if (e.dead || e.state === 'lifted' || e.state === 'exec') continue; const ep = e.byName.pelvis.mesh.position; if (near(ep.x, ep.z)) e.hit('torso', 50, { x: 0, y: 1, z: 0 }, { knockdown: true, force: 70, source: 'trap' }); }
          }
        } else if (tr.state === 'up') {
          tr.t -= dt; tr.spikes.position.y += (0 - tr.spikes.position.y) * Math.min(1, dt * 30);
          if (tr.t <= 0) tr.state = 'down';
        } else if (tr.state === 'down') {
          tr.spikes.position.y += (-0.9 - tr.spikes.position.y) * Math.min(1, dt * 4);
          if (tr.spikes.position.y < -0.85) tr.state = 'idle';
        }
      }
    }
    if (this.crowdBands) {
      for (const b of this.crowdBands) b.material.map.offset.y = Math.abs(Math.sin(this.time * (3 + b.userData.ph * 0.4) + b.userData.ph)) * 0.012 * (1 + this.styleS.pts / 60);
      this.crowdT -= dtR; if (this.crowdT <= 0) { this.audio.crowd(0.25 + this.styleS.pts / 200); this.crowdT = 2.5 + Math.random() * 3; }
    }
    if (this.flames) for (const f of this.flames) { const b = f.userData.base, ph = f.userData.ph; f.scale.set(b.x * (0.9 + 0.15 * Math.sin(this.time * 13 + ph)), b.y * (0.85 + 0.2 * Math.sin(this.time * 9 + ph * 2)), 1); }
    if (this.torchLights) this.torchLights.forEach((L, i) => { L.intensity = 8 + Math.sin(this.time * 11 + i * 2) * 1.2 + Math.sin(this.time * 23 + i) * 0.8; });
    // ---- Moon meteors: random spots, telegraphed with a warning ring
    if (this.meteors) {
      this.meteorT -= dt;
      if (this.meteorT <= 0 && this.wave >= 1) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (ROOM.r - 1.2);
        const pos = new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r);
        const ring = glowRing(this.stageRoot, new THREE.Color(2, 0.5, 0.15)); ring.position.set(pos.x, 0.03, pos.z); ring.scale.setScalar(3.4);
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.4) }));
        const trail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 3.5, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.8, 0.2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        trail.position.y = 1.8; rock.add(trail);
        this.stageRoot.add(rock);
        const from = new THREE.Vector3(Math.random() - 0.5, 1.6, Math.random() - 0.5).normalize();
        const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), from); rock.quaternion.copy(qq);
        this.meteors.push({ pos, ring, rock, from, t: 2.0, T: 2.0 });
        this.audio.warn();
        this.meteorT = Math.max(2.2, 6 - this.wave * 0.35) + Math.random() * 3;
      }
      for (const m of this.meteors) {
        m.t -= dt;
        m.ring.material.opacity = 0.55 + 0.45 * Math.sin(this.time * 14); m.ring.scale.setScalar(3.4 - (1 - m.t / m.T) * 0.6);
        m.rock.position.copy(m.pos).addScaledVector(m.from, Math.max(0, m.t / m.T) * 32);
        if (m.t <= 0) {
          m.dead = true; this.stageRoot.remove(m.ring); this.stageRoot.remove(m.rock);
          const at = m.pos.clone(); at.y = 0.3;
          this.fx.explosion(at, 1); this.audio.boom();
          const pd = Math.hypot(P.pos.x - at.x, P.pos.z - at.z);
          this.addShake(Math.max(0.15, 1 - pd / 10));
          if (pd < 1.9) P.hurt(28, null);
          for (const e of this.enemies) {
            if (e.state === 'lifted' || e.state === 'exec') continue;
            const ep = e.byName.pelvis.mesh.position, d = Math.hypot(ep.x - at.x, ep.z - at.z);
            if (d < 2.2) { const dx = (ep.x - at.x) / (d || 1), dz = (ep.z - at.z) / (d || 1); if (e.dead) { if (e.mode === 'rag') for (const p of e.parts) p.body.velocity.set(dx * 5, 6, dz * 5); } else e.hit('torso', 65, { x: dx, y: 1.2, z: dz }, { knockdown: true, force: 95, source: 'meteor' }); }
          }
          for (const p of this.props) { if (p.heldBy || p.dead) continue; const bp = p.body.position, d = Math.hypot(bp.x - at.x, bp.y - at.y, bp.z - at.z); if (d < 3) { p.body.wakeUp(); p.body.velocity.y += 4; } }
          const sc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
          sc.rotation.x = -Math.PI / 2; sc.position.set(at.x, 0.006, at.z); this.stageRoot.add(sc);
        }
      }
      this.meteors = this.meteors.filter(m => !m.dead);
      if (this.blink) this.blink.visible = Math.sin(this.time * 4) > 0.6;
      if (this.earth) this.earth.rotation.y += dtR * 0.02;
    }
    // ---- Street: rain + time is money
    if (this.rain) {
      const a = this.rain.geometry.attributes.position, arr = a.array;
      for (let i = 1; i < arr.length; i += 3) { arr[i] -= dtR * 9; if (arr[i] < 0) arr[i] += 10; }
      a.needsUpdate = true;
      this.sirenT -= dtR; if (this.sirenT <= 0) { this.audio.tone(700, 950, 0.6, 'sine', 0.04); this.audio.tone(950, 700, 0.6, 'sine', 0.04, 0.6); this.sirenT = 14 + Math.random() * 10; }
    }
    if (this.stage.timed && this.wave >= 1 && !P.dead) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; P.hp = 0; P.dead = true; P.dropAll(); this.outOfTime = true; this.gameOver(); }
    }
  }
  updateEvents(dt, dtR) {
    this.updateHazards(dt, dtR);
    if (this.stageKey !== 'pub') return;
    if (this.barmanT > 0) { this.barmanT -= dt; if (this.barmanT <= 0) this.barman(); }
    if (this.cutT > 0) { this.cutT -= dt; if (this.cutT <= 0) { this.cut = { t: 0, dur: 10 }; this.audio.clunk(); this.audio.buzz(); this.toast('POWER CUT!', 1.5); } }
    let f = 1;
    if (this.cut) {
      const c = this.cut; c.t += dtR;
      const flick = () => (Math.random() < 0.5 ? 0.06 : 1);
      if (c.t < 0.8) f = Math.floor(c.t * 12) % 2 ? flick() : 0.06;
      else if (c.t < c.dur - 0.8) f = 0.06;
      else if (c.t < c.dur) f = Math.floor(c.t * 12) % 2 ? flick() : 1;
      else { this.cut = null; f = 1; this.audio.clunk(); this.toast('LIGHTS BACK ON', 1); }
    }
    if (f !== this._lf) {
      this._lf = f;
      for (const L of this.lightsList || []) if (!L.neon) L.l.intensity = L.base * f;
      for (const b of this.bulbs || []) b.visible = f > 0.5;
      this.scene.environmentIntensity = this.baseEnv * f;
      if (this.audio.juke) this.audio.juke.gain.value = f > 0.5 ? 0.16 : 0;
    }
    this.dark = f < 0.5;
  }
  barman() {
    const b = this.barSpawn; if (!b) return;
    for (let i = 0; i < 3; i++) {
      const p = new Prop(this, 'bottle', b.x - i * 0.3, b.y, b.z, i + 1);
      p.body.velocity.set(3.2 + i * 0.6, 0, 0);
      this.props.push(p);
    }
    this.toast('BARMAN: FRESH BOTTLES ON THE BAR!', 1.6); this.audio.glass();
  }

  // ---------------- HUD ----------------
  names() {
    if (this.input.touch && !this.input.usingPad) return { pL: 'PUNCH L', pR: 'PUNCH R', gL: 'GRAB L', gR: 'GRAB R', f: 'FOCUS', t: '3RD', d: 'DODGE', pa: 'PARRY' };
    return this.input.usingPad
      ? { pL: 'LT', pR: 'RT', gL: 'LB', gR: 'RB', f: 'A', t: 'Y', d: 'B', pa: 'X' }
      : { pL: 'L-CLICK', pR: 'R-CLICK', gL: 'Q', gR: 'E', f: 'F', t: 'T', d: 'SPACE', pa: 'R' };
  }
  prompts() {
    const P = this.player, N = this.names(), out = [];
    const A = P.arms;
    if (P.hug) { out.push([N.pL + ' / ' + N.pR, 'MASH TO BREAK FREE']); return out; }
    if (P.wexec) return out;
    if (P.lift) {
      if (P.lift.phase === 'lift') { const sf = P.liftSurface(); out.push([N.pL + ' / ' + N.pR, 'BACKBREAKER'], [N.gL + ' / ' + N.gR, sf ? sf.s.name + ' SLAM' : 'THROW']); }
      return out;
    }
    for (const [k, arm] of [['L', A.L], ['R', A.R]]) {
      if (arm.state === 'hold' && arm.hold) {
        const same = k === 'L' ? N.pL : N.pR, oth = k === 'L' ? N.pR : N.pL, og = k === 'L' ? N.gR : N.gL, sg = k === 'L' ? N.gL : N.gR;
        if (arm.hold.type === 'rag') { out.push([same, 'FLING'], [og, 'LIFT'], [sg, 'DROP']); }
        else {
          const z = arm.hold.zone;
          const o = { head: 'UPPERCUT', chest: 'GUT PUNCH', hips: 'BODY SHOT', arm: 'ELBOW', leg: 'BODY SHOT' }[z];
          const s = { head: 'FACE SLAM', chest: 'SHOVE', hips: 'PUSH', arm: 'ARM DRAG', leg: 'TRIP' }[z];
          const wa = k === 'L' ? A.R : A.L, ws = wa.prop && wexecSpec(wa.prop.type, z);
          if (ws) out.push([oth, ws.name], [same, s]);
          else out.push([oth, o], [same, s], [og, 'LIFT']);
        }
        return out;
      }
    }
    const atk = this.enemies.find(e => e.state === 'windup' && e.root.position.distanceTo(P.pos) < 2.4);
    if (atk) { out.push([N.pa, 'PARRY!']); return out; }
    for (const [k, arm] of [['L', A.L], ['R', A.R]]) if (arm.prop) out.push([k === 'L' ? N.pL : N.pR, 'SWING ' + arm.prop.type.toUpperCase()], [k === 'L' ? N.gL : N.gR, 'THROW']);
    if (out.length) return out;
    if (P.focusActive) {
      if (P.hover && P.hover.enemy) out.push([N.gL + ' / ' + N.gR, 'GRAB ' + LABEL[P.hover.part]]);
      else if (P.hover && P.hover.prop) out.push([N.gL + ' / ' + N.gR, 'PICK UP ' + P.hover.prop.type.toUpperCase()]);
      else out.push(['', 'AIM AT A BODY PART']);
      return out;
    }
    if (this.hintT > 0) out.push(['HOLD ' + N.f, 'FOCUS GRAB'], [N.gL + ' / ' + N.gR, 'GRAB'], [N.pL + ' / ' + N.pR, 'PUNCH'], [N.pa, 'PARRY THE RED GLOW'], [N.t, '3RD PERSON']);
    else if (this.enemies.some(e => e.shield && e.shield.hp > 0 && !e.dead) && this.hintT > -12) out.push(['', 'SMASH THE SHIELD OR GRAB HIM']);
    return out;
  }
  updateHUD(dtR) {
    const P = this.player, u = this.ui;
    u.hpbar.style.width = P.hp + '%';
    u.hpbar.style.background = P.hp < 30 ? '#ff3b3b' : '#e8443a';
    u.focusbar.style.width = P.focus + '%';
    u.score.textContent = this.score;
    u.wave.textContent = 'WAVE ' + Math.max(1, this.wave);
    u.combo.textContent = P.combo >= 2 ? 'x' + P.combo + ' COMBO' : '';
    const ri = this.rankInfo(), SS = this.styleS;
    const rk = ri ? ri[1] : '';
    if (rk !== SS.rank) { SS.rank = rk; u.srank.textContent = rk; u.srank.style.color = ri ? ri[2] : '#fff'; u.srank.classList.remove('pop'); void u.srank.offsetWidth; if (rk) u.srank.classList.add('pop'); }
    const nxt = RANKS.slice().reverse().find(r => r[0] > SS.pts), cur = ri ? ri[0] : 0;
    u.sfill.style.width = (nxt ? (SS.pts - cur) / (nxt[0] - cur) * 100 : 100) + '%';
    u.sfill.parentNode.style.opacity = SS.pts > 1 ? 1 : 0.25;
    if (this.stage.timed) { const t = Math.ceil(this.timeLeft); u.timer.innerHTML = `<span class="${t <= 10 ? 'low' : ''}">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span> &nbsp; <span class="cash">£${this.cash}</span>`; }
    const pr = this.prompts();
    const html = pr.map(([b, l]) => (b ? `<span class="btn">${b}</span>` : '') + `<span class="lbl">${l}</span>`).join('<span class="gap"></span>');
    if (html !== this._ph) { u.prompts.innerHTML = html; this._ph = html; }
    if (P.focusActive) {
      u.reticle.style.display = 'block';
      u.reticle.style.left = ((P.ret.x + 1) / 2 * 100) + '%'; u.reticle.style.top = ((1 - P.ret.y) / 2 * 100) + '%';
      u.reticle.classList.toggle('on', !!P.hover);
      u.partlabel.textContent = P.hover ? (P.hover.enemy ? LABEL[P.hover.part] : P.hover.prop.type.toUpperCase()) : '';
      u.cross.style.display = 'none';
    } else { u.reticle.style.display = 'none'; u.cross.style.display = this.third.k > 0.1 ? 'none' : 'block'; }
    u.thirdp.style.display = this.thirdOffer > 0 && !this.third.on ? 'flex' : 'none';
    u.thirdp.querySelector('.btn').textContent = this.names().t;
    // enemy info (nearest targeted)
    const t = P.hover && P.hover.enemy ? P.hover.enemy : null;
    u.enemyinfo.style.display = t ? 'block' : 'none';
    if (t) u.enemyinfo.innerHTML = `${t.T.name}<div class="ehp"><div style="width:${Math.max(0, t.hp / t.hpMax * 100)}%"></div></div>`;
  }

  // ---------------- loop ----------------
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    // phones render in half-float: very glossy materials make specular highlights overflow into white flares with black
    // (NaN) centres, so keep every PBR material at a safe minimum roughness
    if (!this._safeT || now - this._safeT > 1000) { this._safeT = now; this.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (m.roughness !== undefined && !m.userData.safe) { m.userData.safe = true; if (m.roughness < 0.35) m.roughness = 0.35; } }); }
    let dtR = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.isTest && this.fixedDt) dtR = this.fixedDt;
    this.time += dtR;
    const I = this.input; I.poll();
    I.showTouch(this.state === 'playing');
    const S = I.state();
    this.ui.padstatus.textContent = I.gp ? 'CONTROLLER CONNECTED' : 'NO CONTROLLER DETECTED – PRESS ANY BUTTON ON IT';
    this.ui.padstatus.classList.toggle('ok', !!I.gp);
    if (this.state === 'title' || this.state === 'over') {
      if (S.confirm && !this.loading && (this.state === 'title' || this.overReady)) { this.audio.init(); this.startGame(); }
      if (this.state === 'title' && I.gpPressed(2)) this.setQuality(this.quality === 'high' ? 'low' : 'high');
      if (this.state === 'title' && I.gpPressed(3)) this.toggleBlood();
      if (this.state === 'title' && S.stageL) this.cycleStage(-1);
      if (this.state === 'title' && S.stageR) this.cycleStage(1);
      const a = this.time * 0.12;
      if (this.stageKey === 'pub') { this.camera.position.set(Math.sin(a) * 3, 1.8, 2.5 + Math.cos(a) * 1.5); this.camera.lookAt(-0.5, 1.4, -5.5); }
      else if (this.stageKey === 'street') { this.camera.position.set(Math.sin(a) * 6, 2.2, 1.5); this.camera.lookAt(Math.sin(a) * 6 - 4, 1.8, -3); }
      else { const r = this.stageKey === 'rome' ? 6 : 7; this.camera.position.set(Math.sin(a) * r, 2.2, Math.cos(a) * r); this.camera.lookAt(-Math.sin(a) * 4, this.stageKey === 'rome' ? 3.5 : 3, -Math.cos(a) * 4); }
      this.camera.updateMatrixWorld(true);
      this.updateHazards(0, dtR);
      for (const arm of Object.values(this.player.arms)) arm.setVisible(false);
      this.overReady = this.state === 'over';
    } else if (this.state === 'paused') {
      if (S.pause || (I.usingPad && I.gpPressed(0))) this.resume();
    } else if (this.state === 'playing') {
      if (S.pause) { this.pause(); I.endFrame(); this.render(dtR); return; }
      if (!this.manual) this.step(S, dtR);
    }
    this.render(dtR);
    I.endFrame();
  }
  step(S, dtR) {
    // time scale
    let target = 1;
    if (this.player.focusActive) target = 0.2;
    if (this.slowT > 0) { this.slowT -= dtR; target = Math.min(target, this.slowScale); }
    this.ws += (target - this.ws) * Math.min(1, dtR * 10);
    let ws = this.ws;
    if (this.hitstopT > 0) { this.hitstopT -= dtR; ws = 0.04; }
    const dtW = this.dtW = dtR * ws;
    this.audio.setMuffle(this.player.focusActive ? 1 : this.slowT > 0 ? 0.6 : 0);
    this.hintT -= dtR;
    this.trauma = Math.max(0, this.trauma - dtR * 1.6);
    this.hurtFlash = Math.max(0, this.hurtFlash - dtR * 1.8);
    if (this.thirdOffer > 0) this.thirdOffer -= dtR;
    if (S.third) {
      if (this.player.lift && this.thirdOffer > 0) { this.third.on = true; this.third.endT = 0; this.thirdOffer = 0; }
      else { this.tpManual = !this.tpManual; this.toast(this.tpManual ? 'THIRD PERSON' : 'FIRST PERSON', 0.6); }
    }
    // in third person, lifts and executions stay third person (cinematic camera) instead of dropping to first person
    if (this.tpManual && (this.player.lift || this.player.wexec)) { this.third.on = true; this.third.endT = 0; }
    this.tpActive = this.tpManual && !this.player.lift && !this.player.wexec && this.third.k < 0.05;
    if (this.tpActive) {
      const pose = this.tpPose(), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(pose.q);
      const o = pose.pos.clone().addScaledVector(dir, 1.6);
      const hit = this.raycast(o, dir, 7, true);
      this.tpAimPoint = hit && hit.point ? hit.point.clone() : o.addScaledVector(dir, 5);
    } else this.tpAimPoint = null;
    this.tpK += ((this.tpActive ? 1 : 0) - this.tpK) * Math.min(1, dtR * 7);
    const SS = this.styleS; SS.idle += dtR; if (SS.idle > 2.2) SS.pts = Math.max(0, SS.pts - 9 * dtR);
    if (this.killCam) { this.killCam.t -= dtR; if (this.killCam.t <= 0) this.killCam = null; }
    if (this.audio.juke) this.audio.juke.gain.value = this.stageKey === 'pub' && !this.dark ? 0.16 : 0;
    this.player.update(S, dtR, ws);
    for (const e of this.enemies) e.preStep(dtW);
    for (const p of this.props) if (!p.dead) p.update(dtW);
    if (dtW > 0) {
      const n = Math.min(4, Math.max(1, Math.ceil(dtW / (1 / 60))));
      for (let i = 0; i < n; i++) this.world.step(dtW / n);
    }
    for (const e of this.enemies) { e.postStep(); e.syncMatrices(); }
    this.player.postStep();
    for (const p of this.props) if (!p.dead && !p.heldBy) { p.sync(); p.mesh.updateMatrixWorld(true); }
    const ev = this.events; this.events = []; for (const f of ev) f();
    this.props = this.props.filter(p => !p.dead);
    this.fx.update(dtW);
    this.updatePickups(dtW);
    this.updateWaves(dtW);
    this.updateEvents(dtW, dtR);
    // third person cam
    const T = this.third;
    if (T.on && !this.player.lift) { T.endT += dtR; if (T.endT > 0.9) T.on = false; }
    T.k += ((T.on ? 1 : 0) - T.k) * Math.min(1, dtR * 6);
    if (T.k < 0.01) T.k = 0;
    this.updateHUD(dtR);
  }
  // test hook: advance the simulation without rendering
  sim(n, over = {}) {
    const base = { mx: 0, my: 0, lookX: 0, lookY: 0, padLookX: 0, padLookY: 0, punchL: false, punchR: false, grabL: false, grabR: false, focus: false, dodge: false, sprint: false, third: false, pause: false, confirm: false, parry: false, stageL: false, stageR: false };
    for (let i = 0; i < n; i++) { this.time += 1 / 60; this.step(Object.assign({}, base, typeof over === 'function' ? over(i) : (i === 0 ? over : { focus: over.focus, mx: over.mx || 0, my: over.my || 0 })), 1 / 60); }
  }
  tpPose() {
    const P = this.player;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch, P.yaw, 0, 'YXZ'));
    const pos = new THREE.Vector3(P.pos.x, 1.62, P.pos.z)
      .add(new THREE.Vector3(0.52, 0.1, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, P.yaw, 0))))
      .add(new THREE.Vector3(0, 0, 1.85).applyQuaternion(q));
    pos.y = Math.max(0.45, pos.y);
    this.clampCam(pos);
    return { pos, q };
  }
  tpGripQ(type) {
    // weapon orientation in the third-person right hand (hand bone frame: +Y toward the knuckles)
    const up = { cue: [0, 0, -1], halfcue: [0, 0, -1], spear: [0, 0, -1], stool: [0, 1, -0.3], cash: [0, -1, 0], rock: [0, 1, 0], bottle: [0, 0.35, -1], broken: [0, 0.35, -1] }[type] || [0, -0.35, -1];
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...up).normalize());
  }
  clampCam(C) {
    if (ROOM.r) { const d = Math.hypot(C.x, C.z), m = ROOM.r + 0.3; if (d > m) { C.x *= m / d; C.z *= m / d; } }
    else { C.x = Math.max(ROOM.minX + 0.4, Math.min(ROOM.maxX - 0.4, C.x)); C.z = Math.max(ROOM.minZ + 0.4, Math.min(ROOM.maxZ - 0.4, C.z)); }
  }
  render(dtR) {
    const P = this.player, T = this.third;
    if (this.state !== 'title' && this.state !== 'over') {
      const showBody = T.k > 0.05;
      for (const arm of Object.values(P.arms)) arm.setVisible(!showBody);
      if (!showBody) for (const arm of Object.values(P.arms)) arm.group.visible = true;
      P.body.show(showBody);
      if (showBody) {
        P.bodyPose(dtR);
        P.basis();
        const C = P.pos.clone().addScaledVector(P.r, 2.4).addScaledVector(P.f, 1.4); C.y = 1.6;
        this.clampCam(C);
        const look = P.pos.clone().addScaledVector(P.f, 0.45); look.y = 1.2;
        const m = new THREE.Matrix4().lookAt(C, look, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        const sh = this.shakeOffset();
        this.camera.position.lerp(C.add(new THREE.Vector3(sh.x, sh.y, 0)), T.k);
        this.camera.quaternion.slerp(q, T.k);
        this.camera.updateMatrixWorld(true);
      }
    }
    // over-the-right-shoulder third person (toggle any time)
    const heldTP = [];
    if (this.state === 'playing' && this.tpK > 0.02 && T.k <= 0.05) {
      for (const arm of Object.values(P.arms)) {
        arm.group.visible = false;
        if (arm.prop && P.tp && arm.side > 0) { const m = arm.prop.mesh; heldTP.push({ arm, pos: m.position.clone(), q: m.quaternion.clone() }); P.tp.grip.add(m); m.position.set(0, 0, 0); m.quaternion.copy(this.tpGripQ(arm.prop.type)); }
        else if (arm.prop) { heldTP.push({ arm, pos: arm.prop.mesh.position.clone(), q: arm.prop.mesh.quaternion.clone(), hide: true }); arm.prop.mesh.visible = false; }
      }
      if (P.fp) P.fp.model.visible = false;
      if (P.tp) P.tp.model.updateMatrixWorld(true);
      const pose = this.tpPose(), sh = this.shakeOffset();
      pose.pos.x += sh.x * 2; pose.pos.y += sh.y * 2;
      this.camera.position.lerp(pose.pos, this.tpK); this.camera.quaternion.slerp(pose.q, this.tpK);
      this.camera.updateMatrixWorld(true);
    }
    // kill cam: slow-mo, tighten FOV, drift toward the last enemy
    const kc = this.killCam, fov = kc && this.state === 'playing' ? 58 : 75;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dtR * 6); this.camera.updateProjectionMatrix(); }
    if (kc && this.state === 'playing' && T.k <= 0.05 && kc.e.byName && !this.player.wexec && !kc.e.severed) {
      const sv = kc.e.severed, tp = sv ? new THREE.Vector3(sv.body.position.x, sv.body.position.y, sv.body.position.z) : kc.e.byName.pelvis.mesh.position;
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(this.camera.position, tp, new THREE.Vector3(0, 1, 0)));
      this.camera.quaternion.slerp(q, 0.35 * Math.min(1, kc.t)); this.camera.updateMatrixWorld(true);
    }
    const g = this.grade.uniforms;
    g.uFocus.value += ((P.focusActive ? 1 : (this.slowT > 0 ? 0.45 : 0)) - g.uFocus.value) * Math.min(1, dtR * 8);
    g.uHurt.value = this.hurtFlash; g.uTime.value = this.time % 100;
    g.uLow.value = this.state === 'playing' && P.hp < 30 ? (30 - P.hp) / 30 * 0.6 : 0;
    g.uAb.value = this.trauma;
    if (this.motes) this.motes.rotation.y += dtR * 0.01;
    this.composer.render();
    for (const h of heldTP) { const m = h.arm.prop && h.arm.prop.mesh; if (!m) continue; if (h.hide) m.visible = true; else { h.arm.group.add(m); m.position.copy(h.pos); m.quaternion.copy(h.q); } }
    // adaptive resolution
    this.fpsAcc += dtR; this.fpsN++;
    if (this.fpsAcc > 1.5) {
      const fps = this.fpsN / this.fpsAcc; this.fps = fps;
      if (fps < 45 && this.pr > 0.55) { this.pr = Math.max(0.55, this.pr - 0.1); this.resize(); }
      else if (fps < 30 && this.quality === 'high' && this.state === 'playing' && ++this.lowStrikes > 2) { this.setQuality('low'); this.toast('LITE GRAPHICS ON FOR SMOOTHER PLAY', 1.5); }
      else if (fps > 57 && this.pr < this.maxPR) { this.pr = Math.min(this.maxPR, this.pr + 0.05); this.resize(); }
      this.fpsAcc = 0; this.fpsN = 0;
    }
  }
}

window.__game = new Game();
window.__Models = Models; window.__THREE = THREE; window.__instance = instance;
window.__mkEnemy = (t, x, z) => { const g = window.__game; const e = new Enemy(g, t, new THREE.Vector3(x, 0, z), 1); g.enemies.push(e); return e; };
window.__Prop = Prop;
