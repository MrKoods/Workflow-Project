# Orbit Upgrade (Phase 0.5) — move the finished Phase 0 shell to the Orbit design + color skins

**Goal:** the same app Nick finished in Phase 0, now running the **Orbit** layout: steps orbit the companion, the current step pops out of the orbit as the center card, done steps tuck back in with ✓, the conversation drives the sequence, and 7 color palettes switch live.
**Done when:** Nick runs the demo quest (`reference/demo-quest.md`) and one real quest end to end in Orbit, and switches palettes live without a restart.
**Out of scope:** voice/wake word (Phase 1), Claude deciding the sequence live (Task 9 lays the groundwork only), agents.

**Reference files (copy into the repo at `docs/reference/`):**
| File | What it is |
|---|---|
| `orbit.css` | The prototype's layout stylesheet. Palette-driven (CSS variables only). Port it, don't redesign it. |
| `palettes/*.json` | The 7 color skins as token files. |
| `palette.ts` | `applyPalette()` — tokens → CSS variables. |
| `bloom.ts` | The Bloom companion renderer (canvas). Drop-in. |
| `focusEngine.ts` | The focus/sequence engine (framework-agnostic). |
| `demo-quest.md` | Quest file v2 with `items`, `intro` and per-step `beats`. |
| `markup-snapshot.html` | Static DOM snapshot of Orbit mid-step: the class/structure reference. Open it next to `orbit.css`. |
| Design canvas | Live prototypes (motion, timing): the "Orbit" and "Orbit color skins" boards. |

Rules from CLAUDE.md still apply. Work top to bottom; the app must still start after every task.

---

## Task 1: Map the existing code (no code changes)
- [x] Read the Phase 0 code. Write `docs/MIGRATION-NOTES.md` (1 page) answering:
  - Which framework (Electron or Tauri), and is the UI React or plain TS?
  - Where are the quest loader, chat/Claude client, HUD components, skin tokens, settings?
  - Which Phase 0 pieces we **keep** (orchestrator, quest files, Claude client, journal, bundle opening, permission gate, Quest Forge), **replace** (HUD layout, Frostbound skin, old orb), or **adapt** (chat → reply chips + Say box).
- [x] Ask Nick if anything in the notes looks wrong before Task 2.

## Task 2: Palette tokens + live switch
- [x] Add `skins/palettes/` with the 7 JSON files from `reference/palettes/`.
- [x] Add `ui/palette.ts` from `reference/palette.ts`. Load the saved palette at startup (default `aqua`) and apply it to the root element.
- [x] Settings → **Color skin**: 7 swatch buttons (gradient accent→reply), live switch, persisted in `Settings.palette`. Debug hotkey `Ctrl+Shift+P` cycles palettes.
- [x] Remove the old Frostbound tokens/styles once nothing references them (keep the files in git history only). *(Done in Task 5, with the legacy HUD.)*
- **Done when:** switching palettes recolors the whole screen instantly, survives a restart, and `grep` finds no hue hex colors in `ui/` outside `skins/palettes/`.

## Task 3: Quest file v2 (backward compatible)
- [x] Extend the quest loader to read `items`, `intro`, `steps[].beats` (see `reference/demo-quest.md`). Item types: `link`, `checklist`, `draft`, `tags`.
- [x] v1 files still load: each `- [ ]` objective becomes a step with `short` = objective text (trimmed to ~16 chars), `icon` = "•", and beats:
  `say: "Step N: <objective>. Say done when it's finished."` → `replies: [{label: "Done"}]` → `stepDone`.
- [x] Completing a step still checks the box in the file, adds XP and writes the journal entry (Phase 0 behavior, unchanged).
- [x] Copy `demo-quest.md` into `quests/fiverr-profile.md`. *(The Phase 0 seller-profile quest moved to `quests/fiverr-profile-v1.md`, queued.)*
- **Done when:** both the old Phase 0 quest and the new demo quest load without errors; a unit test covers both formats.

## Task 4: Focus engine in the orchestrator
- [x] Add `orchestrator/focusEngine.ts` from `reference/focusEngine.ts`. The orchestrator owns it (CLAUDE.md rule 4); the UI only receives its state.
- [x] Wire: active quest → `new FocusEngine(quest.intro, quest.steps, hooks)`; `start()` when the quest opens.
- [x] Expose to the UI: `mode()`, `itemState(id)`, `planets()`, `orbitDeg()`, caption, log, replies, companion state.
- [x] `stepDone` beats call the existing "complete objective" path (XP + journal + file checkbox).
- [x] Pause/resume keeps the current step index (Phase 0 resume note still works).
- **Done when:** a headless test plays the demo quest by sending replies ("yeah", "done"…) and asserts the sequence of `hero` items: acct → profile → skills → verify → companion, with `doneSteps` = 4 and `complete` = true.

## Task 5: Orbit layout UI
- [x] Port `reference/orbit.css` into the app's stylesheet. Keep the class names; it already reads only CSS variables.
- [x] Build the DOM to match `reference/markup-snapshot.html`:
  - Root: `.fx.orbt` + `mode` (`m-comp` / `m-task`) + `s-<companionState>`.
  - Orbit: `.orbit` with `style="--rot: <orbitDeg>deg; --step-angle: <360/N>deg"`, two `.ring`s, 12 `.mote`s (`--j: 0..11`), one `.pln` per step (`--k`, class = planet state), and the `.tether`.
  - Companion: `.comp` containing the Bloom `<canvas>`. Caption: `.capx` (companion or "You" line). Reply chips: `.chipsx`. Say box: `.sayx`.
  - **One stable element per item** (`.it` + its state class). Do not unmount/remount items when their state changes; the CSS transitions do all the motion (pop out, glide, tuck back).
- [x] Item rendering by type: `link` = browser-bar preview + preview rows + CTA; `checklist` = boxes with ✓ count; `draft` = text + Copy; `tags` = pills + Copy all.
- [x] Item CTAs: `link` opens the URL in the default browser (existing bundle-opening code); `draft`/`tags` copy to clipboard; the companion says one short confirmation line.
- [x] Remove the old HUD screen once Orbit runs the demo quest (keep it behind a `legacyHud` flag until then). *(Orbit ran the demo end to end before removal, so no flag was needed; git history is the rollback.)*
- **Done when:** the demo quest looks like the "Orbit" board on the canvas: planets turn to the front in order, the current step's card pops out from the front of the orbit, done steps show ✓, and nothing jumps or re-mounts.

## Task 6: Bloom companion
- [x] Add `ui/companion/bloom.ts` from `reference/bloom.ts`. One instance, canvas inside `.comp`.
- [x] Feed it: companion state from the engine; palette colors on every palette change (`setPalette(accent, reply, third)`); voice level from the engine's `onVoiceLevel` hook (typed captions, for now).
- [x] Calm mode / reduced motion → `setCalm(true)` and CSS transitions shortened (`.calm` rule already in `orbit.css`).
- **Done when:** the five states are visibly different (debug key cycles them) and it holds 60 fps on Nick's Windows machine with a browser open next to it.

## Task 7: Conversation wiring
- [x] Reply chips call `engine.reply(label)`. The Say box sends free text to `engine.reply(text)`; if the engine isn't waiting for a reply, send it to Claude as normal chat (Phase 0 client) and show the answer as a companion caption.
- [x] Voice setting: `Settings.voice` = `steady | playful` (default `playful`). Quest files may carry both wordings later; for now the demo quest is Playful.
- **Done when:** Nick can run the whole demo quest by typing only "yeah" and "done".

## Task 8: Polish + measure
- [x] Narrow screens: below 1200 px wide, side helpers (sup1/sup2) move under the hero card at 0.6 scale; the orbit radius uses `min(…, 40vw)` (already in CSS).
- [x] Quests with 6–7 steps: `--step-angle` = 360/N, and planets show the icon only for planets at the back.
- [ ] Keep Phase 0's metric: time from "start quest" to first real action. Compare Orbit vs. the Phase 0 HUD over 5 sessions. *(Instrumented: sessions are tagged `layout: orbit`; `npm run measure` prints Orbit vs HUD and counts toward 5. Needs 5 real sessions by Nick. No HUD sessions were ever recorded, so the comparison falls back to the manual baseline.)*

## Task 9 (groundwork only): let Claude drive the sequence
- [x] Define orchestrator tools for later (don't enable them yet): `focus_item(itemId)`, `support_items(ids[])`, `complete_step()`, `offer_replies(labels[])`, `say(text)`. Each call becomes `engine.run(beat)`.
- [x] Permission gate: these are UI-only (Read tier); anything that opens, sends or submits still goes through the existing tiers.

---

### Hardest part
Keeping items as **stable elements** so the CSS transitions run (pop-out and tuck-back). If the framework re-mounts components on state change, the motion breaks. Key items by id and change only their class.

### Verify before building
- `@property` + CSS `sin()/cos()/round()` need a recent Chromium. Electron and Tauri's Windows WebView2 both ship one, but confirm the actual version in the app before Task 5.
- The Fiverr URLs in the demo quest are the homepage on purpose. Put in the exact sign-up/profile URLs only after checking them in a browser.
