# Print status + API of candidate Spaces (runs on GitHub Actions)
import os, json, urllib.request
from gradio_client import Client
T = os.environ.get('HF_TOKEN')
for sp in ['MohamedRashad/UniRig', 'jkorstad/Mesh_Rigger', 'MajorDaniel/UniRig', 'netw1z/UniRig', 'monaverse/UniRig', 'MeYourHint/MoMask', 'trellis-community/TRELLIS']:
    try:
        req = urllib.request.Request(f'https://huggingface.co/api/spaces/{sp}', headers={'Authorization': f'Bearer {T}'} if T else {})
        info = json.load(urllib.request.urlopen(req, timeout=30)); rt = info.get('runtime', {})
        print(f'##### {sp}: stage={rt.get("stage")} hw={rt.get("hardware", {}).get("current")}', flush=True)
        if rt.get('stage') != 'RUNNING': continue
        c = Client(sp, hf_token=T) if T else Client(sp)
        c.view_api(print_info=True)
    except Exception as e:
        print(f'##### {sp}: ERROR {e}', flush=True)
