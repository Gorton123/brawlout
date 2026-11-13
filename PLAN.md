# Brawl Out — Master Build Plan

*13 Nov 2026 · Tim + Claude*

This is the plan we agree on **before** anything else gets built or any credits get spent. Nothing goes into the game link until it passes the checks in section 5.

---

## 1. The game in one page

- **What it is:** a first-person physics brawler, with an optional third-person view. You can grab any body part, lift people, throw them and execute them, with weapons and with your fists.
- **Feel:** heavy, physical hits, like a cross between GTA street fights and a VR arena brawler. Enemies stagger, flinch and ragdoll properly.
- **Platforms:** iPhone (touch or Xbox controller) and Chromebook or PC, as one offline web file.
- **Core arenas:** The Pub, The Colosseum, The Moon, The Street.
- **Later (DLC):** castle siege, underground cage fight, rooftop assassin, church brawl, boxing ring.
- **Golden rules:**
  - Every character is unique to its arena, with no reused or tinted models.
  - You have your own skin in each arena.
  - Every body part bends like a real body: no wrapping, curling or rubber limbs.

---

## 2. Cast list: no repeats

| Arena | Player skin | Enemy 1 | Enemy 2 | Boss | Status |
|---|---|---|---|---|---|
| **Pub** | Tim (hoodie and hand wraps) | Brawler (plaid shirt) | Quick Lad (tracksuit and cap) | Big Lad (bald, beard) | All exist; all need re-rigging (see 3) |
| **Colosseum** | Tim as a gladiator *(concept exists)* | Gladiator | Murmillo *(concept exists)* | Champion (gold armour) | Gladiator exists; 3 to make |
| **Moon** | Tim as an astronaut *(concept exists)* | Grunt alien *(concept exists)* | Skitter alien | Alien Brute | 4 to make |
| **Street** | Tim, street look *(decide: new outfit or the hoodie?)* | Roadman | Runner | Top Boy | Top Boy exists but needs remaking; 2–3 to make |
| **Beasts** | — | Lion (Colosseum) | — | — | Needs a four-legged rig; separate job |

**To make:** 10 humanoids (12 if we remake Top Boy and Big Lad at full quality), plus the lion.

---

## 3. Why the bodies wrap and curl, and the proper fix

**What you're seeing** in the Quick Lad screenshot: the legs and body bend like rubber in the fight poses. Three things cause it:

1. **The skeleton is guessed.** My auto-rigger estimates where the hips, knees, shoulders and elbows are from the outline of the body, using average body proportions. When a guess is a few centimetres off, a knee bends above or below the real knee, and the leg folds in an S-shape.
2. **The skin weights are blurred.** I smooth how the skin follows each bone so joints don't crack. That spreads each bend over too much of the leg or arm.
3. **It has no twist bones.** Mixamo-quality rigs share forearm and thigh twist across extra bones; mine twist in one place.

It also didn't help that I published that build without checking every pose closely. That's on me, and it's why section 5 now exists.

**The fix: stop guessing the skeleton.**

| Option | Quality | Cost | How |
|---|---|---|---|
| **A. Mixamo (recommended)** | Best: hand-placed joints, proper weights, real fingers if the model has separated fingers | Free | You log in to Mixamo on your Chromebook once. While you're logged in, I drive your Chrome to upload each model, place the markers and download the rig. The pipeline does the rest. |
| B. Tripo's own rigging | Very good | Credits on top of each model | Done when the model is generated |
| C. Keep improving my rigger | OK, never Mixamo level | Free | Fine for prototypes, not for the final game |

**The model itself matters too.**

| Generator | Quality | Cost |
|---|---|---|
| **Tripo (through Higgsfield)** | Sharp textures, full body depth, cleaner hands | About 12 credits per character |
| TRELLIS (free) | Softer textures; bodies come out flat front-to-back (that's why Big Lad looks thin side-on) | Free, but needs your free Hugging Face token and gives about 1–2 a day |

**My recommendation:** Tripo for the models, Mixamo for the rigging. Make concept pictures for everyone first, approve them all, and only then spend credits, all in one batch.

---

## 4. Arenas: what each needs

- **Pub:** good as it is. Possibly add a dartboard and fruit machine to smash people into.
- **Colosseum:**
  - lion;
  - working floor traps;
  - a crowd that reacts to executions;
  - spears and swords tuned for gladiator moves.
- **Moon:**
  - throw enemies off the edge so they float into space;
  - low-gravity throws that look floaty but heavy;
  - airlock and dome as hazards.
  - The new spanner and pipe weapons are done.
- **Street (GTA feel):**
  - the first rebuild is done: 3D shopfronts, rounded cars, LED lamps, bus stop;
  - next: cars that drive past and can hit people;
  - wet road reflections;
  - more street props (phone box, scaffolding, shopping trolleys);
  - neon at night.
- **DLC maps:** designed only after the core four are finished.

---

## 5. Quality checks: nothing ships without passing these

For **every character**, before it goes in:

1. **Rest pose:** the outline matches the concept picture, and the model faces forward.
2. **Eight poses rendered side by side:** idle, jab, hook, uppercut, hit reaction, knockdown, being lifted, being grabbed.
3. **Checked for:**
   - knees and elbows bend at the real joint;
   - no limb twisting, wrapping or stretching;
   - the face doesn't stretch;
   - the hands make a fist.
4. **In the game:** checked in first person and third person, with a grab, a lift and an execution.
5. **Size:** under 1.5 MB, so all the models fit in the game file.

For **every build**, before your link is updated:

- every arena loads;
- punches, grabs, lifts, executions and every weapon are tested in each arena;
- the hands look right in first person;
- third person stays third person.

---

## 6. Build order and costs

1. **Concepts (free):** one front-facing concept picture for every character in section 2. You approve or redo each one.
2. **Models (credits):** generate all approved characters in one batch. About 12 credits each on Tripo, so about 120–150 credits for the full cast.
3. **Rigging (free):** a Mixamo session on your Chromebook. You log in, and I run all the characters.
4. **Integration:** every character is wired to its arena and run through the section 5 checks.
5. **Hands and first person:** with proper Mixamo finger rigs, your first-person view uses your real hands and fists instead of the code-built hand.
6. **Arena upgrades:** Moon space throws, Street traffic, Colosseum lion.
7. **DLC maps.**

### Decisions I need from you

1. **Models:** Tripo with credits (best), or TRELLIS free (flatter)?
2. **Rigging:** a Mixamo session on your Chromebook (recommended)? If yes, when are you home?
3. **Street skin:** a new outfit for you, or keep the hoodie?
4. **Lion:** now, or after the humans are done?
5. **Big Lad and Top Boy:** remake them at full quality, or keep them?
