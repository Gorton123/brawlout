# UniRig + MoMask stress test: report

*13 Nov 2026. Nothing has been published to the game link.*

## Summary
- **UniRig:** better than my autorig, but not good enough to ship, and it doesn't replace Mixamo.
  - It fixed the worst problems: the knees and elbows bend more cleanly and the face stretches about half as much.
  - Every character still failed on the shoulders.
  - The free daily allowance only covers about 3 characters.
- **MoMask:** a useful extra for animations, but not a replacement for the hand-made clips.
  - It made all 15 fight moves, in about 4 to 11 seconds each.
  - The motion is recognisable but soft. Punches look like gestures, not hits.
  - It can't do 2-person moves (collar grab, slam) or weapons.

## What ran
| Step | Where | Time | Result |
|---|---|---|---|
| UniRig: hero, brawler, quick | Hugging Face Space `faisal786U/unirig-api` (the main `jasongzy/UniRig` Space returned nothing) | 86, 85 and 73 s each | Rigged OK: 52 bones each, with full 3-bone fingers |
| UniRig: big, gladiator, topboy | same | — | **Blocked: the free ZeroGPU limit was used up** after 3 characters. It resets in about 23 h. |
| Lion, the non-human test | the free FLUX picture generator, then TRELLIS | — | **Failed:** the picture generator was busy or rate-limited, so there was no lion to rig. |
| MoMask: 15 prompts | `MeYourHint/MoMask` Space | 4–11 s each, 129 s in total | All 15 produced animation files (BVH) |
| Convert, render and score | locally, in a headless browser | about 3 min per character | Done |

Getting it working took a few attempts. The Space's interface changed, the MoMask Space needed an older client, and the download link needed fixing. All the fixes are in `tests/ai/run.py` and `.github/workflows/ai-tests.yml`.

## UniRig vs my autorig (8 poses each)
**How it's scored:** for each body area, I measure how much the skin stretches in the worst of the 8 poses. A score of 0.25 means 25% stretch. For comparison, the original Mixamo-rigged Quick Lad scores: knees 0.11, elbows 0.23, shoulders 0.50, hips 0.53, fingers 0.20, face 0.18. A character passes if it is within 1.5× of Mixamo.

| Character | Rig | Knees | Elbows | Shoulders | Hips | Fingers | Face | Verdict |
|---|---|---|---|---|---|---|---|---|
| hero | autorig | 0.24 | 0.64 | 1.41 | 0.42 | 0.20 | 1.14 | FAIL |
| hero | **UniRig** | 0.19 | **0.44** | **0.95** | 0.97 | **0.00** | **0.55** | FAIL (shoulders, hips) |
| brawler | autorig | 0.29 | 0.80 | 1.40 | 0.46 | 0.39 | 1.23 | FAIL |
| brawler | **UniRig** | 0.23 | **0.54** | **1.01** | 0.80 | 1.38 | **0.80** | FAIL |
| quick | autorig | 0.25 | 1.31 | 1.96 | 0.89 | 0.28 | 0.50 | FAIL |
| quick | **UniRig** | 0.44 | 2.38 | 1.63 | 2.98 | 0.00 | 0.57 | FAIL (worse) |

**What I found:**
- **Hero:** UniRig is clearly the best rig we have. The skeleton sits in the right places, and the elbows and face stretch much less.
  - The hips got worse because its weights spread the trousers across both legs.
- **Brawler:** better on the elbows, shoulders and face.
  - The fingers broke, because this model's hands are fused mittens, so the finger bones pull skin from the whole hand.
- **Quick Lad:** worse.
  - His arms hang very close to his body, and UniRig gave some sleeve skin to the hip bone.
  - That shows as long brown streaks stretching from his hands when he moves.
  - My autorig has the same problem, but less badly.
- **Shoulders fail everywhere:** both rigs score 2–4× worse than Mixamo on the shoulders.
  - Neither has the extra shoulder and twist bones Mixamo uses, so the armpit pinches when the arms go up.
  - That's the wrapping you saw.
- **Lion:** not tested; see "What ran".

**Why they still fail:**
1. The free 3D models have no gap between the arms and the body, or between the fingers. Any rig, even Mixamo, struggles to split skin that is fused together.
2. Neither rig has twist bones.
3. UniRig's weights were made for its own skeleton. When I move them onto the game's Mixamo skeleton, a little accuracy is lost.

## MoMask: 15 animations on the UniRig hero
| Animation | Length | What it looks like | Usable? |
|---|---|---|---|
| jab | 3.3 s | arm comes forward, but soft and lands high | as a base only |
| hook | 9.7 s | guard and a turn into the punch, with long idle padding | after trimming |
| uppercut | 2.5 s | rising arm, weak | no |
| haymaker | 9.5 s | big wind-up, good energy, drifts across the floor | after trimming |
| stagger back | 5.1 s | good: steps back and arms flail | **yes** |
| knockout fall | 9.7 s | falls, but the body flies off the frame | no |
| dodge | 8.1 s | small lean | no |
| parry | 1.7 s | forearm block, very short | maybe |
| collar grab | 9.7 s | arms forward, but no grip pose | no (needs a second person) |
| lift overhead | 4.1 s | arms up, with no weight in the body | no |
| slam | 7.7 s | crouch and arms up, roughly right | as a base only |
| sword slash | 9.7 s | arm swing, but no grip | no |
| spear thrust | 9.5 s | two-handed push, readable | as a base only |
| drunk walk | 9.5 s | **good:** sways and stumbles | **yes** |
| moon punch | 9.7 s | slow punch, but no float (it can't do low gravity) | no |

**Stretch:** stretch on the MoMask moves is about the same as on the hand-made clips with the same rig. The wrapping comes from the rig, not the animation.

**Where it breaks:**
- No hands: its skeleton has no fingers, so it can't make fists or grips.
- Nothing involving another person or a prop.
- Clips are padded towards about 10 seconds and need trimming.
- Fast, violent moves come out slow.
- The character drifts across the floor.

## Recommendation
1. **Rigging: don't replace Mixamo yet.** UniRig is the best free option and beats my autorig on clean models, so it should become the fallback rigger in the pipeline. For the main cast, Mixamo is still better. The bigger fix is generating models with the arms held away from the body and the fingers spread, because every rig gets better then.
2. **Animation: keep the hand-made Mixamo clips** for punches, hits, grabs and knockouts. Use MoMask for:
   - background and crowd moves (drunk walk, stagger, taunts, idles);
   - quick prototypes of new moves, which then get trimmed and tidied.
3. **Next steps, if you agree:**
   - re-run UniRig on big, gladiator and topboy, plus a lion, when the free limit resets;
   - add UniRig to the character pipeline as an option;
   - take the 2 good MoMask clips (drunk walk and stagger) and test them in the Pub.

All contact sheets are in `tests/ai/out/sheets/`.
