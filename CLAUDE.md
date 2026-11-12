# Brawl Out

First-person physics brawler (three.js + cannon-es), bundled with esbuild into one offline HTML file.

- `npm run dev` → live server at http://localhost:8000 (auto-reloads on save). Keep it running while editing.
- `npm run build` → `dist/brawl-out.html` (single offline file, models embedded).

## Layout
- `src/main.js` – game loop, waves, HUD, stage events, camera, raycasts
- `src/player.js` – first-person player: arms/IK on the real model (FPBody), gloves, punches, grabs, holds, lift, executions (Backbreaker, table slam), weapons
- `src/enemy.js` – enemy AI, Mixamo clip playback, procedural poses, ragdoll physics, Big Lad moves
- `src/models.js` – loads GLB models, builds the 11-part physics rig from model joints, retargets parts <-> Mixamo bones
- `src/world.js` – the pub arena; `src/props.js` – bottles, stools, cues; `src/fx.js` particles/blood; `src/audio.js` synth audio; `src/input.js` keyboard + Xbox pad
- `assets/*.glb` – Tripo models rigged in Mixamo (brawler has all animation clips)

The player is Tim. Keep answers short. After each change, the game should keep working offline.
