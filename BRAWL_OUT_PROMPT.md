# Brawl Out — full project brief

You're helping me (Tim) build **Brawl Out**, my first-person physics brawler. Read this whole brief before doing anything. Keep your answers short, and after every change the game must still run offline as a single HTML file.

## What the game is
- A first-person physics brawler that runs in the browser on iPhone, Chromebook and PC. It supports touch, keyboard and mouse, and Xbox controller (Bluetooth or wired).
- You play as me, Tim. You fight waves of enemies with your bare hands: left and right punches, grabs, a parry or counter, and a focus/slow-mo mode.
- You can grab enemies by any body part, then lift, throw or slam them into things. There are executions (Backbreaker, table slam), finishers on low-health enemies, and weapons you can pick up (bottles, stools, cues, swords, spears).
- Enemies are active ragdolls. They play Mixamo animations and go fully physical when they're hit or thrown.
- You can switch to a third-person camera.
- Waves get harder, and every 5th wave is a boss. Each stage awards stars, and clearing 2 waves unlocks the next stage.

## Stages
| Stage | Theme | Enemies | Boss | Extras |
|---|---|---|---|---|
| The Pub | "Last Orders" | brawler, quick, big | The Big Lad | Barman events, tables to slam on |
| The Colosseum | Rome, "Are you not entertained?" | gladiator, murmillo, champion | The Champion | Floor traps, swords and spears |
| The Moon | Lunar base, low gravity (-1.62) | grunt, skitter, brute | The Alien Brute | Meteor strikes |
| The Street | London, "Time Is Money" | roadman, runner, top boy | The Top Boy | Timed mode, car bonnet slams |

## Tech
- three.js 0.187 for graphics, cannon-es for physics. esbuild bundles everything into one offline file, `dist/brawl-out.html` (about 15 MB, with the 3D models base64-embedded).
- Repo: **github.com/Gorton123/brawlout**, branch `main`.
  - `npm run dev` runs a live server; `npm run build` makes the single HTML file.
- Code:
  - `src/main.js`: game loop, stages, waves, HUD, camera.
  - `src/player.js`: first-person body and arms (IK), punches, grabs, lifts, executions, weapons.
  - `src/enemy.js`: AI, animation playback, ragdolls.
  - `src/models.js`: GLB loading, the 11-part physics rig, mapping body parts to Mixamo bones.
  - `src/stages.js` and `src/world.js`: arenas.
  - `src/props.js`, `src/fx.js`, `src/audio.js` (synth audio), `src/input.js` (keyboard, touch, gamepad).
- Models are `.glb` files in `assets/`: hero (the player), brawler, quick, big, grunt, plus `clips.glb`, the shared Mixamo animation library.

## Character build pipeline (in the repo)
- `characters/roster.json` lists each character with its concept image, source model, game slot and status (`needs-rig` → `review` → `approved`).
- `pipeline/cbuild.mjs` runs headless Chrome through Playwright. For each character it does this:
  1. Fetches the model.
  2. Turns it to face forward and strips any broken rig.
  3. Exports a Mixamo-ready zip.
  4. *(Manual step: rig the zip on mixamo.com and download FBX, With Skin, T-pose.)*
  5. Ingests the Mixamo FBX into a `game.glb`.
  6. Checks the skeleton lines up with the mesh, and renders idle and punch preview images.
  7. Installs only approved characters into `assets/`.
- **GitHub Actions:**
  - `characters.yml` runs the pipeline on every push to `characters/` and commits the results.
  - `pages.yml` builds the game and deploys it to GitHub Pages. To make this work, Pages has to be set to "GitHub Actions" in the repo settings.
- How new characters are made: a Higgsfield concept image goes into Tripo image-to-3D, then Mixamo rigs it. Don't use Meshy auto-rig. It rotated the skeleton 90°, which made the characters "wrap" into themselves.

## Where it stands right now
- All four stages are playable. Combat, ragdolls, waves, bosses and unlocks all work.
- **Known bug:** the new hero and brawler models currently in the game are wrapping and twisting, because of the bad Meshy rig.
  - **The fix in progress:** rig `hero_mixamo.zip`, `brawler_mixamo.zip` and `gladiator_mixamo.zip` in Mixamo, then upload each result as `characters/<id>/mixamo.fbx`. The pipeline does the rest.
  - **Don't revert to the old models. Patch and fix.**
- There's no `gladiator` model slot wired into the game yet.

## What we want to do next (in priority order)
1. **Make it feel great:**
   - better character skins and models;
   - smoother player movement;
   - better enemy movement and hit reactions (staggers, flinches, proper knockdowns);
   - better graphics and lighting.
2. **Moon upgrade:** throw enemies off the edge into space so they float away. The current map is boring.
3. **Better lion:** the lion enemy looks terrible.
4. **New enemy types:** armed enemies, and giant bosses.
5. **Environmental kills:** spike walls, ledges, anything you can throw people into.
6. **DLC maps inspired by famous movie fight scenes.** These must be *inspired by* the scenes, with no copied characters, names or logos:
   - **Castle siege:** defend a grey stone wall against ogres and a giant ogre boss. Interactive environment: boulders, oil, ladders to kick away.
   - **Underground cage fight:** an illegal fight club in a cage, with a crowd and betting vibe.
   - **Rooftop assassin:** opens with a leap of faith off a high ledge onto a target, with a hidden-blade style finisher.
   - **Church brawl:** opens with a phone ringing in a church, then everyone goes crazy. A gentleman spy look: suit, glasses, umbrella or walking stick.
   - **Boxing ring:** a training montage, with uppercuts and a 1970s Philly underdog feel.
   - **Jungle one-man army:** a lone soldier in the jungle, plus an 80s time-travel style street scene.
7. Possibly simple shooting in later maps, only if it fits.

## Rules
- Use free tools only. Never enter payment details, and never subscribe to anything.
- Before spending any credits (Higgsfield, Tripo and so on), tell me the cost and wait for my OK.
- Never type my passwords. Stop and let me log in myself.
- Don't delete assets. Patch, don't revert.
- Keep it playable offline on iPhone after every change.
