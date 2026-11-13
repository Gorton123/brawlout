## Worst stretch per region across the 8 poses (95th percentile edge stretch; bold = fail)

Mixamo reference: knees 0.11, elbows 0.23, shoulders 0.5, hips 0.53, fingers 0.2, face 0.18

| Character | Rig | knees | elbows | shoulders | hips | fingers | face | Verdict |
|---|---|---|---|---|---|---|---|---|
| brawler | autorig | **0.29** | **0.80** | **1.40** | 0.46 | **0.39** | **1.23** | FAIL: knees, elbows, shoulders, fingers, face |
| brawler | unirig | **0.23** | **0.54** | **1.01** | 0.80 | **1.38** | **0.80** | FAIL: knees, elbows, shoulders, fingers, face |
| hero | autorig | **0.24** | **0.64** | **1.41** | 0.42 | 0.20 | **1.14** | FAIL: knees, elbows, shoulders, face |
| hero | unirig | **0.19** | **0.44** | **0.95** | **0.97** | 0.00 | **0.55** | FAIL: knees, elbows, shoulders, hips, face |
| quick | autorig | **0.25** | **1.31** | **1.96** | **0.89** | 0.28 | **0.50** | FAIL: knees, elbows, shoulders, hips, face |
| quick | unirig | **0.44** | **2.38** | **1.63** | **2.98** | 0.00 | **0.57** | FAIL: knees, elbows, shoulders, hips, face |

## Timings

- unirig_hero_error_jasongzy: 
- unirig_hero_s: 86
- unirig_hero_space: faisal786U/unirig-api
- unirig_brawler_error_jasongzy: 
- unirig_brawler_s: 85
- unirig_brawler_space: faisal786U/unirig-api
- unirig_quick_error_jasongzy: 
- unirig_quick_s: 73
- unirig_quick_space: faisal786U/unirig-api
- unirig_big_error_jasongzy: 
- unirig_big_error_faisal786U: You have exceeded your free ZeroGPU quota (90s requested vs. 68s left). Try again in 23:10:57. Subscribe to Hugging Face PRO to get 40 min of ZeroGPU quota a day - https://huggingface.co/subscribe/pro?from=ZeroGPU
- unirig_gladiator_error_jasongzy: 
- unirig_gladiator_error_faisal786U: You have exceeded your free ZeroGPU quota (90s requested vs. 68s left). Try again in 22:55:54. Subscribe to Hugging Face PRO to get 40 min of ZeroGPU quota a day - https://huggingface.co/subscribe/pro?from=ZeroGPU
- unirig_topboy_error_jasongzy: 
- unirig_topboy_error_faisal786U: You have exceeded your free ZeroGPU quota (90s requested vs. 68s left). Try again in 22:40:52. Subscribe to Hugging Face PRO to get 40 min of ZeroGPU quota a day - https://huggingface.co/subscribe/pro?from=ZeroGPU
- lion_generate_s: failed: concept image failed
- total_unirig_s: 5653
- momask_jab_s: 6
- momask_hook_s: 11
- momask_uppercut_s: 4
- momask_haymaker_s: 10
- momask_stagger_s: 7
- momask_knockout_s: 11
- momask_dodge_s: 9
- momask_parry_s: 4
- momask_collar_grab_s: 11
- momask_lift_overhead_s: 6
- momask_slam_s: 9
- momask_sword_slash_s: 10
- momask_spear_thrust_s: 10
- momask_drunk_walk_s: 10
- momask_moon_punch_s: 11
- total_momask_s: 129

## MoMask

- character: tests/ai/out/game/hero_unirig.glb
- collar_grab: {'key': 'collar_grab', 'frames': 293, 'dur': 9.73, 'missing': []}
- dodge: {'key': 'dodge', 'frames': 244, 'dur': 8.1, 'missing': []}
- drunk_walk: {'key': 'drunk_walk', 'frames': 287, 'dur': 9.53, 'missing': []}
- haymaker: {'key': 'haymaker', 'frames': 287, 'dur': 9.53, 'missing': []}
- hook: {'key': 'hook', 'frames': 293, 'dur': 9.73, 'missing': []}
- jab: {'key': 'jab', 'frames': 100, 'dur': 3.3, 'missing': []}
- knockout: {'key': 'knockout', 'frames': 293, 'dur': 9.73, 'missing': []}
- lift_overhead: {'key': 'lift_overhead', 'frames': 125, 'dur': 4.13, 'missing': []}
- moon_punch: {'key': 'moon_punch', 'frames': 293, 'dur': 9.73, 'missing': []}
- parry: {'key': 'parry', 'frames': 53, 'dur': 1.73, 'missing': []}
- slam: {'key': 'slam', 'frames': 233, 'dur': 7.73, 'missing': []}
- spear_thrust: {'key': 'spear_thrust', 'frames': 287, 'dur': 9.53, 'missing': []}
- stagger: {'key': 'stagger', 'frames': 155, 'dur': 5.13, 'missing': []}
- sword_slash: {'key': 'sword_slash', 'frames': 293, 'dur': 9.73, 'missing': []}
- uppercut: {'key': 'uppercut', 'frames': 76, 'dur': 2.5, 'missing': []}
