# Migration notes: Phase 0 HUD → Orbit (ORBIT-UPGRADE Task 1)

Written 2026-10-18 from the code at `9cdddb7`.

## Stack
- **Electron 44.9.0** via Electron Forge 8 + Vite 8 (`vite` template, TypeScript). Bundled Chromium; checked again before Task 5.
- **UI is plain TypeScript, no framework.** DOM is built with a tiny `h()` helper (`ui/hud/dom.ts`); views own their elements and update them in place. So items stay stable by default: Orbit renders each item once and only swaps its state class.
- Main process = orchestrator + Claude client. The UI talks to it only through `window.cockpit` (`app/preload.ts`, channels in `app/ipc.ts`).

## Where things are
| Piece | File(s) |
|---|---|
| Quest loader / file edits | `orchestrator/questFile.ts` (parse, tick checkbox, frontmatter patch, replace objectives) |
| Quest state, bundles, pause/resume, setup timer, Forge accept | `orchestrator/index.ts` (`createOrchestrator`), `bundle.ts`, `forge.ts`, `measure.ts` |
| Journal | `orchestrator/journal.ts` → `journal/local/YYYY-MM-DD.jsonl`; app state in `journal/local/state.json` |
| Claude client (tools, confirm gate, streaming) | `orchestrator/companion.ts` |
| Shared types + `CockpitApi` | `orchestrator/types.ts` |
| HUD | `ui/hud/*.ts` (index mounts everything; quest, trail, xp, hotbar, companion orb + chat, forge card, journal panel, quest log, setup timer), `ui/hud.css` |
| Skin tokens/styles | `skins/frostbound/{tokens.json,skin.css}`, loaded by `ui/skin.ts` (hard-coded `SKIN = 'frostbound'` in `ui/main.ts`) |
| Settings | **None yet.** Calm mode is in-memory (F3) and resets on restart. |

## Keep / replace / adapt
- **Keep unchanged:** orchestrator (one state owner), v1 quest files and edits, bundle opening, permission/confirm gate, Claude client + tools, Quest Forge (draft → Accept), journal + End session, setup-time measurement, hotkeys and tray.
- **Replace:** HUD layout (`ui/hud.css`, trail, XP bar, orb, quest column), Frostbound skin + `ui/skin.ts`, the old orb.
- **Adapt:**
  - The chat panel becomes the **caption + reply chips + Say box**. Free text goes to the engine when it's waiting for a reply, otherwise to Claude as before. Streamed Claude replies show as the companion caption.
  - **Confirm prompts** (e.g. complete_objective) become reply chips: Confirm / Not now.
  - The **Focus engine** runs in the main process, owned by the orchestrator. The UI gets one `focus` state object per change over IPC.

## Port fixes I'll make (small, not redesigns)
1. `focusEngine.ts` uses `window.setTimeout`, but it runs in Node, so this becomes plain `setTimeout`. It also needs a `start(fromStep)` so a resumed quest starts at its first undone step. `start()` with no argument still plays the intro.
2. `orbit.css` `.orbt` re-declares `--text --muted --acctext --edge --saybg --chipbg` with fixed hex values. Those would override what `applyPalette()` sets on the root, so palette text and muted colors would never apply. I'll remove the re-declarations (and replace the 3 other hard-coded hexes with variables) so the palette really drives everything and the grep check passes.
3. Fonts: CSP blocks Google Fonts (decided in Phase 0). Bricolage Grotesque, Manrope and Newsreader get self-hosted via `@fontsource`, like the Frostbound fonts were.
4. Settings (`palette`, `voice`, `calm`) are stored by the orchestrator in `journal/local/settings.json`. That folder is gitignored and is where `state.json` already lives.
5. Steps are saved as **body checkboxes, one per step in step order**, for v2 too. Then "complete step" = the existing complete-objective path (tick, XP, journal, resume note), and Forge's `update_quest` keeps working. The v2 demo quest gets 4 `- [ ]` lines added to its body.

## Doc problems found
- **The new `FEATURES.md` dropped 14 decisions-log entries** from Phase 0: Electron choice, hotkeys, skin mechanics, quests-from-files rules, bundles, create-folder, companion chat config, Quest Forge build, journal, measure, first real quest, and more. It also dropped the `pause/resume/finish/note` journal kinds from the data model. I propose restoring them below the two new entries and marking the Frostbound-specific ones as superseded.
- **Task 2 vs Task 5 ordering:** the old HUD needs the Frostbound tokens, and it stays behind `legacyHud` until Task 5. So Frostbound is deleted at the end of Task 5, not in Task 2.

## Answered (2026-10-18)
1. **Quest file:** the demo replaces `quests/fiverr-profile.md`; the real quest moves to `quests/fiverr-profile-v1.md` (queued).
2. **Phase 0 extras:** kept, restyled small. Top-right control row, panels for the Forge card and journal, "I'm working" as a chip, same hotkeys.
3. **Decisions log:** the dropped entries are restored in FEATURES.md §0.
