#!/usr/bin/env python3
"""Stage 1 of the AI tools test (runs on GitHub Actions, uses the HF_TOKEN secret).

  unirig : rig every character's front.glb with UniRig (Space jasongzy/UniRig, fallback faisal786U/unirig-api),
           plus one non-human (a lion made with FLUX + TRELLIS)
  momask : 15 fight animations from text with MoMask (Space MeYourHint/MoMask) -> BVH
  all    : both

Outputs go to tests/ai/out/ with timings.json; stage 2 (pipeline/ai_tests.mjs) maps, renders and scores them.
"""
import json, os, re, shutil, sys, time, traceback, urllib.request
from gradio_client import Client, handle_file

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tests', 'ai', 'out'); os.makedirs(OUT, exist_ok=True)
TOKEN = os.environ.get('HF_TOKEN') or None
TIM = os.path.join(OUT, 'timings.json')
timings = json.load(open(TIM)) if os.path.exists(TIM) else {}

def save_t(k, v):
    timings[k] = v; json.dump(timings, open(TIM, 'w'), indent=1)

def client(sp):
    print(f'connecting to {sp}', flush=True)
    import inspect
    kw = 'token' if 'token' in inspect.signature(Client.__init__).parameters else 'hf_token'
    return Client(sp, **({kw: TOKEN} if TOKEN else {}))

def timed(fn, timeout):
    # gradio calls can hang in a queue forever: give each one a hard limit
    import concurrent.futures as cf
    ex = cf.ThreadPoolExecutor(1); fut = ex.submit(fn)
    try: return fut.result(timeout=timeout)
    finally: ex.shutdown(wait=False, cancel_futures=True)

def path_of(r):
    if isinstance(r, str) and os.path.exists(r): return r
    if isinstance(r, dict):
        for v in r.values():
            p = path_of(v)
            if p: return p
    if isinstance(r, (list, tuple)):
        for v in r:
            p = path_of(v)
            if p: return p
    return None

CHARS = ['hero', 'brawler', 'quick', 'big', 'gladiator', 'topboy']

def make_lion():
    d = os.path.join(ROOT, 'characters', 'lion')
    if os.path.exists(os.path.join(d, 'raw.glb')): return True
    sys.path.insert(0, os.path.join(ROOT, 'pipeline'))
    import gen3d
    gen3d.POSE = 'full body side view, standing on all four legs, plain white background, even studio lighting, highly detailed fur, 3D render, '
    t = time.time()
    try:
        timed(lambda: gen3d.one('lion', 'a powerful adult male African lion with a thick dark mane, muscular, realistic, Roman arena beast'), 1200)
        save_t('lion_generate_s', round(time.time() - t)); return True
    except BaseException as e:
        print('lion generation failed:', e); save_t('lion_generate_s', f'failed: {e}'); return False

def rig_one(cid, src):
    out = os.path.join(OUT, 'unirig', f'{cid}.glb'); os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out): print('have', out); return
    for sp, call in [('jasongzy/UniRig', lambda c: c.predict(handle_file(src), 'glb', api_name='/process_pipeline')),
                     ('faisal786U/unirig-api', lambda c: c.predict(handle_file(src), api_name='/rig_model'))]:
        t = time.time()
        try:
            r = timed(lambda: call(client(sp)), 900); p = path_of(r)
            print(f'  {cid} via {sp}: {str(r)[:200]}', flush=True)
            if p:
                shutil.copy(p, out); save_t(f'unirig_{cid}_s', round(time.time() - t)); save_t(f'unirig_{cid}_space', sp); return
        except Exception as e:
            print(f'  {cid} via {sp} failed after {round(time.time() - t)}s: {str(e)[:300]}', flush=True)
            save_t(f'unirig_{cid}_error_{sp.split("/")[0]}', str(e)[:300])

def unirig():
    for cid in CHARS:
        src = os.path.join(ROOT, 'characters', cid, 'front.glb')
        if os.path.exists(src): rig_one(cid, src)
    # non-human: lion (front.glb comes from the orient step, so rig the raw TRELLIS mesh)
    if make_lion():
        rig_one('lion', os.path.join(ROOT, 'characters', 'lion', 'raw.glb'))

PROMPTS = [
    ('jab', 'a person throws a quick straight jab with the left fist in a boxing stance'),
    ('hook', 'a person throws a powerful right hook punch'),
    ('uppercut', 'a person throws a right uppercut punch upward'),
    ('haymaker', 'a person winds up and swings a huge wild haymaker punch'),
    ('stagger', 'a person gets hit and staggers backwards'),
    ('knockout', 'a person is knocked out and falls backwards to the ground'),
    ('dodge', 'a person quickly dodges to the side by leaning and stepping away'),
    ('parry', 'a person blocks and parries an incoming punch with the forearm'),
    ('collar_grab', 'a person reaches forward and grabs someone by the collar with both hands'),
    ('lift_overhead', 'a person lifts something heavy above their head with both arms'),
    ('slam', 'a person lifts something heavy overhead and slams it down to the ground'),
    ('sword_slash', 'a person slashes diagonally with a sword held in the right hand'),
    ('spear_thrust', 'a person thrusts a spear forward with both hands'),
    ('drunk_walk', 'a drunk person staggers forward, swaying and stumbling'),
    ('moon_punch', 'a person punches slowly and floats as if in low gravity on the moon'),
]

def momask():
    os.makedirs(os.path.join(OUT, 'momask'), exist_ok=True)
    c = client('MeYourHint/MoMask')
    for key, text in PROMPTS:
        out = os.path.join(OUT, 'momask', f'{key}.bvh')
        if os.path.exists(out): continue
        t = time.time()
        try:
            html = timed(lambda: c.predict(text, '0', 'IK', fn_index=3), 600)
            links = re.findall(r'(?:href|src)=["\']([^"\']+\.bvh)', str(html)) or re.findall(r'(/file=[^"\'\s>]+\.bvh)', str(html))
            print(f'  {key}: {len(str(html))} chars html, bvh links {links[:2]}', flush=True)
            if not links:
                open(os.path.join(OUT, 'momask', f'{key}.html'), 'w').write(str(html)); raise RuntimeError('no bvh link in result')
            url = links[0]
            if url.startswith('/'): url = c.src.rstrip('/') + url
            elif not url.startswith('http'): url = c.src.rstrip('/') + '/file=' + url
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'} if TOKEN else {})
            open(out, 'wb').write(urllib.request.urlopen(req, timeout=120).read())
            save_t(f'momask_{key}_s', round(time.time() - t))
        except Exception as e:
            print(f'  {key} failed: {str(e)[:300]}', flush=True); traceback.print_exc(limit=1)
            save_t(f'momask_{key}_error', str(e)[:300])

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    t0 = time.time()
    if mode in ('unirig', 'all'): unirig()
    if mode in ('momask', 'all'): momask()
    save_t(f'total_{mode}_s', round(time.time() - t0))
