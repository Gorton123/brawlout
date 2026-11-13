# Find running Spaces for rigging / text-to-motion and print their APIs (runs on GitHub Actions)
import urllib.parse
import os, json, urllib.request
from gradio_client import Client
T = os.environ.get('HF_TOKEN')
H = {'Authorization': f'Bearer {T}'} if T else {}
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=40))
seen = []
for q in ['unirig', 'auto rig', 'rigging', 'rignet', 'puppeteer', 'magicarticulate', 'momask', 'text to motion', 'motion generation']:
    try:
        for s in get(f'https://huggingface.co/api/spaces?search={urllib.parse.quote(q)}&sort=likes&direction=-1&limit=15&full=true'):
            sid = s['id']
            if sid in seen: continue
            seen.append(sid)
            rt = (s.get('runtime') or {})
            print(f'== {q:18} {sid:45} likes={s.get("likes")} stage={rt.get("stage")} hw={(rt.get("hardware") or {}).get("current")}', flush=True)
    except Exception as e: print('search fail', q, e)
import urllib.parse
for sid in seen:
    try:
        rt = get(f'https://huggingface.co/api/spaces/{sid}').get('runtime', {})
        if rt.get('stage') != 'RUNNING': continue
        print(f'##### API {sid}', flush=True)
        Client(sid, token=T).view_api(print_info=True)
    except Exception as e: print(f'##### {sid}: ERROR {str(e)[:200]}', flush=True)
