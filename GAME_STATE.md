# Brawl Out — State of the Game (14 Nov 2026)

An honest breakdown of what's in the game, what changed today, and how it really looks and feels.

- **Live link:** https://claude.ai/artifact/VYCLVRcmKMFNzWZrwvn2L3 (the build from 13 Nov, 13:48)
- **Repo:** github.com/Gorton123/brawlout, branch `main`

On your Chromebook (Linux terminal):

```
git clone https://github.com/Gorton123/brawlout
cd brawlout && npm install
npm run dev     # live game at http://localhost:8000
npm run build   # single offline file: dist/brawl-out.html
```

---

## 1. Folders and what's in them

| Folder / file | What it is |
|---|---|
| `src/` | **The game itself** |
| `src/main.js` | Game loop, arenas, waves, HUD, cameras (first and third person), fixes for phone graphics |
| `src/player.js` | You: first-person arms and the five-finger hand, punches, grabs, lifts, throws, executions, weapon moves, picking your skin per arena |
| `src/enemy.js` | Enemy AI, animations, ragdolls, the enemy roster for each arena (each enemy type points at its own model, with a fallback until it exists) |
| `src/models.js` | Loads the 3D models, builds the physics body for each character, closes the hands into fists |
| `src/stages.js` | Builds the Pub, Colosseum, Moon and Street, and places the props |
| `src/street.js` | **New:** street building kit (shopfronts, cars, LED lamps, bus shelter, traffic lights, puddles) |
| `src/props.js` | Weapons and throwables. **New:** bat, crowbar, spanner, pipe, a remade cash brick and moon rock |
| `src/world.js`, `fx.js`, `audio.js`, `input.js`, `textures.js` | Pub room, blood and particles, synthesised sound, touch / keyboard / Xbox pad controls, generated textures |
| `assets/*.glb` | The models embedded in the game: hero, brawler, quick, big, gladiator, grunt, topboy, plus `clips.glb` (the Mixamo animation library) |
| `characters/` | **Character factory:** one folder per character (concept picture → 3D model → rigged `game.glb` → preview pictures) |
| `characters/roster.json` | Every character, which game slot it fills, and its status |
| `characters/queue.json` | Characters waiting to be generated: murmillo, grunt, your Rome and Moon skins, champion, roadman, runner, skitter, brute |
| `characters/_refs/` | The earlier Higgsfield concept pictures (hero variants, Quick Lad, Big Lad, murmillo, alien) |
| `pipeline/` | Tools that turn a 3D model into a game character |
| `pipeline/autorig.js` | My free auto-rigger: fits a Mixamo-style skeleton with finger bones, plus skin weights |
| `pipeline/cbuild.mjs` | Character builder: fetch → turn to face forward → rig → check → install into `assets/` |
| `pipeline/gen3d.py` | Free generator: FLUX concept picture → TRELLIS 3D model (uses your HF_TOKEN) |
| `pipeline/aitest.js`, `ai_tests.mjs` | **New:** UniRig and MoMask conversion, pose rendering and the stretch scorer |
| `pipeline/ref_mixamo.glb` | The original Mixamo skeleton every rig is matched to |
| `tests/ai/` | **New:** UniRig and MoMask stress test: `REPORT.md`, contact sheets, raw outputs |
| `.github/workflows/` | Cloud jobs. `generate.yml`: make characters for free. `characters.yml`: rig and install. `pages.yml`: deploy the game. `ai-tests.yml`: UniRig and MoMask. `fetch.yml`: download reference pictures |
| `PLAN.md` | Master build plan, plus the decisions waiting on you |
| `BRAWL_OUT_PROMPT.md` | One-page brief to give any AI so it understands the project |
| `dev/` | My test scripts (screenshots, weapon checks). Not part of the game |

---

## 2. What changed (12–14 Nov)

**Characters and rigging**
- Built a free auto-rigger, so models no longer need Mixamo to work in the game. It now has finger bones, a face fix, handling for T-pose models, hands that don't snag on the thighs, and arms kept off the torso.
- Added a free character generator in GitHub Actions (FLUX → TRELLIS), using your HF_TOKEN.
- New characters made with it: **Top Boy, Quick Lad, Big Lad**. The **gladiator** is now in the Colosseum.
- Each enemy type now has its own model slot, so as each new model arrives it automatically replaces the repeated one.
- Your skin changes per arena (gladiator in Rome, astronaut on the Moon) as soon as those models exist.

**Combat and first person**
- Punches go straight out from each shoulder (the crossing-arms bug is fixed).
- The floating blocky gloves are gone. You now see wrapped hands with five fingers, which curl into fists and open to grab.
- Your hoodie and chest no longer block the view when you look down.
- Lifts and executions stay in 3rd person if you're in 3rd person.
- Forearms no longer twist like a rope when you lift someone.

**Weapons**
- Street: baseball bat (taped handle), red crowbar, and the cash bag remade as a brick of notes.
- Moon: big spanner, pipe with a hazard-taped grip, and lumpy moon rocks with glowing crystals.

**Graphics**
- The Street was rebuilt (details in section 5).
- Fixed shiny surfaces that caused a white flare with a black centre on phones. Still not tested on your iPhone.
- The game file shrank from 16.8 MB to about 10 MB because the models are now compressed.

**Testing tools**
- UniRig and MoMask stress test, with a report.
- A stretch and wrap scorer that renders 8 poses for any character.

---

## 3. Characters: honest status

**Quality:**
- **Good:** looks right and moves acceptably.
- **OK:** looks right, but its rig shows problems.
- **Poor:** visibly broken or placeholder.

| Arena | Role | Model | Look | Rig / movement | Honest verdict |
|---|---|---|---|---|---|
| All | **You (Tim)** | Tripo hero: black hoodie, joggers, hand wraps | Good | First person is fine (code hand on your real arm). In 3rd person the shoulders pinch and the face stretches on big moves. | **OK** |
| Pub | Brawler (plaid shirt, beard) | Tripo | Good, the best-looking model | Elbows and shoulders stretch on hooks; the fingers are fused mittens | **OK** |
| Pub | Quick Lad (tracksuit, cap) | TRELLIS (free) | Good from the front, softer texture | **Legs fold like rubber in fight poses**, and his arms touch his body so the sleeves smear | **Poor** |
| Pub | Big Lad (bald, beard) | TRELLIS (free) | Decent face, but **flat front to back**, thin from the side | Arms stay clear of the belly now; shoulders still pinch | **OK–Poor** |
| Colosseum | Gladiator | Tripo | Good: armour, helmet, kilt | The kilt stretches between the legs when he crouches; shoulders pinch | **OK** |
| Colosseum | Murmillo | *repeat:* Quick Lad plus a code-built helmet | Looks like a pub lad in a helmet | Same as Quick Lad | **Poor** |
| Colosseum | Champion (boss) | uses the gladiator model, tinted gold | Same face as the gladiator | — | **Poor (repeat)** |
| Colosseum | Lion | old code-built model | Blocky | Basic | **Poor** |
| Moon | Grunt / Skitter / Brute | **one shared old model**, tinted 3 colours | Weak | Basic | **Poor (repeat)** |
| Street | Top Boy (boss) | TRELLIS (free): tracksuit, gold chain | Good outline, darker and softer texture | Arms fixed (no longer stuck out); shoulders pinch | **OK** |
| Street | Roadman / Runner | *repeats:* tinted Brawler and Quick Lad with a hood | Look like Pub characters | — | **Poor (repeat)** |
| Rome / Moon | Your gladiator and astronaut skins | concept pictures exist, not generated yet | — | — | **Missing** |

**The common rig problem:** every rig we have, my autorig and UniRig alike, stretches the shoulders and armpits 2–4× more than Mixamo. The fixes are proper Mixamo rigs, and models generated with the arms held away from the body and fingers spread.

---

## 4. Actions: what you can do and how it feels

| Action | Control (touch / Xbox) | How it plays now |
|---|---|---|
| Punch left / right | PUNCH L/R buttons / triggers | Snappy and goes straight. The fist is a code-built hand, slightly chunky and blocky from behind. Hits connect with blood, sound and a stagger. |
| Grab | GRAB L/R / bumpers | Grab any body part. The hand opens to grab. Strong and fun: the core of the game. |
| Lift and throw | grab, then hold / move | Works well, with physics throws. In low gravity on the Moon it's floaty. Enemies don't yet fly off into space. |
| Executions | prompts on low-health enemies: Backbreaker, table or car-bonnet slam | Satisfying. Now stays in 3rd person. The camera can clip into walls. |
| Parry | PARRY when the enemy glows red | Works and slows time briefly. Timing is quite generous. |
| Focus | FOCUS (hold) | Slow motion, plus focus grabs. Works. |
| Dodge | DODGE | Quick side step. Works but feels small. |
| Weapons | walk over one and grab it | Bottle, broken bottle, stool, cue, sword, spear, cash, bat, crowbar, spanner, pipe, rock. All sit in the hand and swing with a hit-stop. The swings are the same arcs for every weapon (no unique moves per weapon yet). |
| 3rd person | 3RD / Y | Works. Your own model shows its rig problems most clearly here. |
| Run | RUN | Fine. |

**Enemies:**
- **AI:** they circle, close in, punch and occasionally use weapons. Better than before, but not smart. They wait their turn rather than mobbing you.
- **Hit reactions:** good flinches and staggers, and the full ragdoll on knockouts is the strongest part.
- **Still to do:** armed enemies, giant bosses, enemies reacting to environmental hazards.

---

## 5. Arenas, graphics and feel

**Overall look:** stylised realism. Real-looking characters against simpler, chunkier environments. Night lighting with bloom and film grain. On iPhone it renders in a lighter mode with fewer shadows.

| Arena | Graphics now | Feel | Honest gaps |
|---|---|---|---|
| **The Pub** | Warm lighting, bar, tables, stools, pool table, bottles | The most complete arena: close-quarters and chaotic | Mostly boxy furniture; a few more props to smash people into would help |
| **The Colosseum** | Sand floor, stone walls, banners, torches, crowd tiers | Big and epic. Swords and spears fit. | The crowd is flat cut-outs; the floor traps are basic; the lion is blocky |
| **The Moon** | Grey cratered ground, dome base, star sky, meteors, low gravity | Floaty | **Boring.** No space throws yet; mostly plain props; repeated aliens; the dome glass caused the flare |
| **The Street** | **Rebuilt:** brick, stock-brick and rendered terraces with real windows, sills, drainpipes, AC units; glowing shop signs with window displays; rounded cars with rims, lights and plates; LED lamps; bus shelter; traffic lights; puddles; wet road | Much more like a real London high street at night | Still not GTA level: the cars are parked, not driving; there are no pedestrians or neon reflections; the bus and some background items are still blocky |

**Performance:** smooth on Chromebook. On iPhone it's playable in the lighter mode. File size is about 10 MB.

---

## 6. Honest overall verdict

**Strong:**
- the grab-anything physics;
- ragdolls and executions;
- the Pub;
- the new Street;
- the weapons now fit the hand.

**Weak:**
- character rigs still bend wrongly at the shoulders, and the Quick Lad's legs;
- half the cast are repeats;
- the Moon is dull;
- the free models come out flat and soft.

**Biggest wins next:**
1. Proper rigs, either a Mixamo session on your Chromebook or UniRig re-runs.
2. Generate the 9 missing characters, plus your Rome and Moon skins.
3. Moon space throws and Street traffic.

**Decisions waiting on you (see `PLAN.md`):**
- paid Tripo or free models;
- when to do the Mixamo session;
- your Street outfit;
- the lion's timing;
- whether to remake Big Lad and Top Boy.
