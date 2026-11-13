#!/usr/bin/env python3
"""Build tests/ai/REPORT_DATA.md (tables) from tests/ai/out/results.json + timings.json."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tests', 'ai', 'out')
R = json.load(open(os.path.join(OUT, 'results.json'))) if os.path.exists(os.path.join(OUT, 'results.json')) else {'unirig': {}, 'momask': {}}
T = json.load(open(os.path.join(OUT, 'timings.json'))) if os.path.exists(os.path.join(OUT, 'timings.json')) else {}
# Mixamo-rigged reference (the original Quick Lad) = what "good" looks like; pass = within 1.5x of it
BASE = {'knees': 0.11, 'elbows': 0.23, 'shoulders': 0.5, 'hips': 0.53, 'fingers': 0.2, 'face': 0.18}
REG = list(BASE)
def worst(scores):
    w = {r: 0 for r in REG}
    for s in scores or []:
        for r in REG:
            if r in s: w[r] = max(w[r], s[r]['stretch95'])
    return w
lines = ['| Character | Rig | ' + ' | '.join(REG) + ' | Verdict |', '|' + '---|' * (len(REG) + 3)]
for cid, r in R.get('unirig', {}).items():
    for k in ('autorig', 'unirig'):
        if not r.get(k): continue
        w = worst(r[k]); fails = [x for x in REG if w[x] > BASE[x] * 1.5 + 0.02]
        lines.append(f'| {cid} | {k} | ' + ' | '.join(f"{'**' if x in fails else ''}{w[x]:.2f}{'**' if x in fails else ''}" for x in REG) + f" | {'PASS' if not fails else 'FAIL: ' + ', '.join(fails)} |")
    if r.get('error'): lines.append(f'| {cid} | unirig | ' + ' | '.join('-' for _ in REG) + f" | error: {r['error'][:80]} |")
open(os.path.join(ROOT, 'tests', 'ai', 'REPORT_DATA.md'), 'w').write('## Worst stretch per region across the 8 poses (95th percentile edge stretch; bold = fail)\n\nMixamo reference: ' + ', '.join(f'{k} {v}' for k, v in BASE.items()) + '\n\n' + '\n'.join(lines) + '\n\n## Timings\n\n' + '\n'.join(f'- {k}: {v}' for k, v in T.items()) + '\n\n## MoMask\n\n' + '\n'.join(f"- {k}: {v if isinstance(v, str) else {kk: vv for kk, vv in v.items() if kk != 'scores'}}" for k, v in R.get('momask', {}).items()) + '\n')
print(open(os.path.join(ROOT, 'tests', 'ai', 'REPORT_DATA.md')).read())
