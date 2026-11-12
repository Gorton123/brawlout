# Brawl Out character builds

Every character lives in `characters/<id>/` and has an entry in `roster.json`.
GitHub Actions does the heavy lifting in the cloud; you only do the Mixamo step.

## The flow

| Step | Who | What happens | Output |
|---|---|---|---|
| 1. Add | you / Claude | Add an entry to `roster.json` with the model's download link (`source.raw`) | roster entry |
| 2. Fetch | Action | Downloads the model | `raw.glb` |
| 3. Orient | Action | Detects which way the model faces, turns it to face forward, strips any broken rig | `front.glb`, `preview_front.png`, `<id>_mixamo.zip` |
| 4. Rig | **you** | Upload `<id>_mixamo.zip` on mixamo.com → Upload Character → place markers → download **FBX Binary, With Skin, T-pose** → add it to the folder as `mixamo.fbx` (GitHub app or website: *Add file → Upload*) | `mixamo.fbx` |
| 5. Ingest | Action | Converts the FBX into a game-ready model (Mixamo skeleton, so all the game's animations work) | `game.glb` |
| 6. Check | Action | Checks the model faces forward and the skeleton lines up with the body; renders idle and punch previews | `preview_idle.png`, `preview_punch.png` |
| 7. Approve | you | Look at the previews; if they're good set `"status": "approved"` | |
| 8. Install | Action | Copies the model into the game (`assets/<slot>.glb`) and redeploys the game | live game |

Every push to `characters/` runs the pipeline. You can also run it by hand: **Actions → Characters → Run workflow**.
The status table for every character is shown on each run's summary page.

## Slots

`slot` decides what the character replaces in the game: `hero` (you), `brawler`, `quick`, `big`, `grunt`, `gladiator`.

## Running it locally (Chromebook Linux / Claude Code)

```
npm install
npx playwright install chromium
node pipeline/cbuild.mjs status
node pipeline/cbuild.mjs build            # all characters
node pipeline/cbuild.mjs build hero --force
```

## Why the Mixamo step

Auto-riggers that guess the front of the model (like the Higgsfield/Meshy rig) put the skeleton in sideways when a model is exported facing sideways, which wraps the mesh when it animates. The orient step fixes the facing first, and Mixamo gives the exact skeleton the game's animation library was made for. The check step flags a sideways skeleton automatically.
