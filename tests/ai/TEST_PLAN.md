# AI tools stress test — plan

**Goal:** find out whether UniRig (auto-rigging) and MoMask (text-to-animation) can replace Mixamo and the hand-made clips, and where they break.

## Where things run
- Neither tool can run on GitHub's free machines: UniRig needs a GPU with 8 GB+, and MoMask's model is large. Both are called through public Hugging Face Spaces using your HF_TOKEN:
  - UniRig: `jasongzy/UniRig` (`/process_pipeline`), with `faisal786U/unirig-api` as a fallback;
  - MoMask: `MeYourHint/MoMask` (outputs BVH files).
- Stage 1 (GitHub Actions, `tests/ai/run.py`): sends the models and prompts, saves the raw results and timings to `tests/ai/out/`.
- Stage 2 (`pipeline/ai_tests.mjs`): maps, retargets, renders and scores everything.

## UniRig test
1. Inputs: hero, brawler, quick, big, gladiator and topboy (each one's oriented `front.glb`), plus a lion generated for the test (FLUX concept → TRELLIS) as the non-human.
2. UniRig returns its own skeleton, not Mixamo's. Stage 2 maps its joints onto the Mixamo names the game uses, by position and chain. Its skin weights are kept and moved onto the mapped bones.
3. The same 8 poses are rendered on the UniRig rig and on the current autorig:
   - idle (Fighting_Idle);
   - jab (Punching);
   - hook (Hook_Punch);
   - uppercut (a shared hand-posed rotation);
   - hit reaction (Head_Hit);
   - knockdown (Knocked_Out);
   - being lifted (a shared pose: legs dangling, arms up);
   - being grabbed (Hit_To_Body plus a lean back).
4. Scoring, per pose and body region (knees, elbows, shoulders, hips, fingers, face):
   - **stretch:** the 95th percentile of how far triangle edges change length from the rest pose;
   - **wrap:** the number of triangles that flip inside out.
   - **Pass:** stretch ≤ 25% and fewer than 0.5% of triangles flipped in every region and pose.
5. The lion is checked only on whether UniRig produces a sensible four-legged skeleton. The game has no four-legged animations yet.

## MoMask test
1. 15 prompts, from simple to extreme: jab, hook, uppercut, haymaker, stagger, knockout, dodge, parry, collar grab, overhead lift, slam, sword slash, spear thrust, drunk walk, moon punch.
2. BVH (22-joint body) → retargeted to the Mixamo skeleton by matching bone directions frame by frame, with the root taken from the hips and spine.
3. Each animation plays on the best-scoring rigged character: a contact sheet of 8 frames, plus the same stretch and wrap scores.
4. Judged on whether it matches the prompt, whether the motion has fight energy, foot sliding and broken poses.

## Report
`tests/ai/REPORT.md` covers:
- what each tool can do and where it breaks;
- the time each run took;
- pass/fail tables;
- a recommendation on whether each tool replaces Mixamo or the hand-made clips.

Nothing is published to the game link.
