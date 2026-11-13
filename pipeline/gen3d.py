#!/usr/bin/env python3
"""Free character generator: concept image (FLUX.1-schnell Space) -> 3D model (TRELLIS / TRELLIS.2 Space).

    python pipeline/gen3d.py <id> "<character description>" [--image path.png]

Writes characters/<id>/concept.png and characters/<id>/raw.glb and adds the character to roster.json.
Runs on GitHub Actions (open internet). Set the HF_TOKEN secret for a bigger free GPU quota.
"""
import json, os, shutil, sys, time, traceback
from gradio_client import Client, handle_file

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = os.environ.get('HF_TOKEN') or None

POSE = ('full body game character, front view, standing straight in an A-pose with arms 45 degrees down away from the body, '
        'hands open with five separate fingers spread apart, feet apart, plain white background, even studio lighting, '
        'realistic proportions, highly detailed clothing, sharp focus, 3D render, ')


def client(space):
    print(f'connecting to {space}', flush=True)
    return Client(space, token=TOKEN) if TOKEN else Client(space)


def path_of(r):
    """dig a file path out of whatever a gradio endpoint returned"""
    if isinstance(r, str) and os.path.exists(r): return r
    if isinstance(r, dict):
        for k in ('value', 'path', 'name', 'image', 'model', 'glb', 'file'):
            if k in r:
                p = path_of(r[k])
                if p: return p
        for v in r.values():
            p = path_of(v)
            if p: return p
    if isinstance(r, (list, tuple)):
        for v in r:
            p = path_of(v)
            if p: return p
    return None


def concept(prompt, out):
    for space, call in [
        ('black-forest-labs/FLUX.1-schnell', lambda c: c.predict(POSE + prompt, 0, True, 768, 1024, 4, api_name='/infer')),
        ('black-forest-labs/FLUX.1-dev', lambda c: c.predict(POSE + prompt, 0, True, 768, 1024, 3.5, 28, api_name='/infer')),
    ]:
        try:
            r = call(client(space)); p = path_of(r)
            if p: shutil.copy(p, out); print('concept ->', out, flush=True); return True
        except Exception as e:
            print(f'  {space} failed: {e}', flush=True)
    return False


def trellis2(img, out):
    c = client('microsoft/TRELLIS.2')
    try: c.view_api(print_info=True)
    except Exception: pass
    try: c.predict(api_name='/start_session')
    except Exception as e: print('  start_session:', e)
    try:
        pre = c.predict(handle_file(img), api_name='/preprocess_image'); img2 = path_of(pre) or img
    except Exception as e:
        print('  preprocess:', e); img2 = img
    # use the endpoint's defaults for everything except the image
    try: r = c.predict(image=handle_file(img2), resolution='512', api_name='/image_to_3d')
    except Exception as e:
        if 'quota' in str(e).lower(): raise
        print('  image_to_3d(512) failed, defaults:', e); r = c.predict(image=handle_file(img2), api_name='/image_to_3d')
    print('  image_to_3d ->', str(r)[:300])
    try: g = c.predict(decimation_target=60000, texture_size=1024, api_name='/extract_glb')
    except Exception as e:
        if 'quota' in str(e).lower(): raise
        g = c.predict(api_name='/extract_glb')
    print('  extract_glb ->', str(g)[:300])
    p = path_of(g)
    if not p or not p.endswith('.glb'): raise RuntimeError('no glb returned')
    shutil.copy(p, out); return True


def trellis1(img, out, space):
    c = client(space)
    try: c.view_api(print_info=True)
    except Exception: pass
    try: c.predict(api_name='/start_session')
    except Exception as e: print('  start_session:', e)
    try:
        pre = c.predict(image=handle_file(img), api_name='/preprocess_image'); img2 = path_of(pre) or img
    except Exception as e:
        print('  preprocess:', e); img2 = img
    # newer community build: one call does generation + GLB extraction
    try:
        r = c.predict(image=handle_file(img2), multiimages=[], seed=0, ss_guidance_strength=7.5, ss_sampling_steps=12,
                      slat_guidance_strength=3, slat_sampling_steps=12, multiimage_algo='stochastic',
                      mesh_simplify=0.9, texture_size=1024, api_name='/generate_and_extract_glb')
        print('  generate_and_extract_glb ->', str(r)[:300]); p = None
        if isinstance(r, (list, tuple)) and len(r) > 2: p = path_of(r[2]) or path_of(r[1])
        p = p or path_of(r)
        if p and p.endswith('.glb'): shutil.copy(p, out); return True
    except ValueError as e:
        print('  no /generate_and_extract_glb:', e)
    try:
        r = c.predict(image=handle_file(img2), multiimages=[], seed=0, ss_guidance_strength=7.5, ss_sampling_steps=12,
                      slat_guidance_strength=3, slat_sampling_steps=12, multiimage_algo='stochastic', api_name='/image_to_3d')
    except Exception as e:
        print('  image_to_3d (full args) failed, trying image only:', e)
        r = c.predict(image=handle_file(img2), api_name='/image_to_3d')
    print('  image_to_3d ->', str(r)[:300])
    try: g = c.predict(mesh_simplify=0.9, texture_size=1024, api_name='/extract_glb')
    except Exception as e:
        print('  extract_glb args failed:', e); g = c.predict(api_name='/extract_glb')
    print('  extract_glb ->', str(g)[:300])
    p = path_of(g)
    if not p or not p.endswith('.glb'): raise RuntimeError('no glb returned')
    shutil.copy(p, out); return True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if args and args[0] == 'queue':
        # characters/queue.json: [{"id": ..., "description": ...}, ...] - generate every entry without a raw.glb
        q = json.load(open(os.path.join(ROOT, 'characters', 'queue.json'))); done = []
        for item in q:
            if os.path.exists(os.path.join(ROOT, 'characters', item['id'], 'raw.glb')): continue
            try: one(item['id'], item['description']); done.append(item['id'])
            except SystemExit as e: print(f"!! {item['id']}: {e}", flush=True)
            except Exception as e: print(f"!! {item['id']}: {e}", flush=True)
        print('generated:', ' '.join(done))
        open(os.path.join(ROOT, 'characters', '.generated'), 'w').write(' '.join(done))
        return
    one(args[0], args[1] if len(args) > 1 else '')


def one(cid, desc):
    d = os.path.join(ROOT, 'characters', cid); os.makedirs(d, exist_ok=True)
    img = os.path.join(d, 'concept.png')
    if '--image' in sys.argv: shutil.copy(sys.argv[sys.argv.index('--image') + 1], img)
    if not os.path.exists(img) and not concept(desc, img): sys.exit('concept image failed')
    out = os.path.join(d, 'raw.glb')
    ok = False
    for name, fn in [('TRELLIS community', lambda: trellis1(img, out, 'trellis-community/TRELLIS')),
                     ('TRELLIS.2', lambda: trellis2(img, out)),
                     ('TRELLIS original', lambda: trellis1(img, out, 'JeffreyXiang/TRELLIS'))]:
        for attempt in range(2):
            try:
                print(f'== {name} (attempt {attempt + 1})', flush=True); fn(); ok = True; break
            except Exception as e:
                print(f'  {name} failed: {e}', flush=True); traceback.print_exc(limit=1); time.sleep(20)
        if ok: print(f'3D model by {name} -> {out} ({os.path.getsize(out) / 1e6:.1f} MB)'); break
    if not ok: sys.exit('all 3D generators failed (quota? add an HF_TOKEN secret)')
    # roster entry
    rp = os.path.join(ROOT, 'characters', 'roster.json'); r = json.load(open(rp))
    if not any(c['id'] == cid for c in r['characters']):
        r['characters'].append({'id': cid, 'name': cid, 'slot': cid, 'status': 'approved', 'made_with': 'FLUX.1-schnell concept -> TRELLIS (free) -> autorig', 'description': desc})
        json.dump(r, open(rp, 'w'), indent=2)


if __name__ == '__main__':
    main()
