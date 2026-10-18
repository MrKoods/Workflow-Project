# Phase 0 — The Shell

**Goal:** prove the core loop feels good. Run one real quest end-to-end inside Cockpit with text chat.
**Done when:** Nick runs a real quest (pre-market prep or the Fiverr gig quest) through Cockpit on 5 separate days, and setup time is lower than his current baseline.
**Out of scope for Phase 0:** voice, wake word, background agents, connectors, skin switcher, hotbar panels beyond stubs.

---

## Task 0 — Pick the desktop framework (decide before coding)
- [x] Check what's installed: `node -v`, `npm -v`, `git --version` (and `rustc --version` if considering Tauri).
- [x] Choose: **Electron** (fewest installs if Node is present; more examples) or **Tauri** (lighter app; needs Rust). Verify current setup requirements in each project's docs.
- [x] Record the choice in `docs/FEATURES.md` §0 Decisions log. → **Electron + Forge (vite-typescript)**.

## Task 1 — Scaffold
- [x] Create the app with the chosen framework + a frontend (plain TypeScript + Vite is enough; React optional).
- [x] Folder layout:
  ```
  app/            desktop shell (main process / backend)
  ui/             HUD + panels
  orchestrator/   quest engine, bundle manager, journal, Claude client, permission gate
  skins/frostbound/ tokens.json, skin.css
  quests/         quest files (markdown)
  docs/
  ```
- [x] `npm run dev` opens a borderless full-screen window. Global hotkey shows/hides it. (Ctrl+Alt+C; quit Ctrl+Alt+Q or tray.)
- [x] `.env.example` with `ANTHROPIC_API_KEY=`; real `.env` is gitignored.

## Task 2 — Frostbound skin + static HUD
- [x] Port the Frostbound design (see `docs/SKINS.md`; reference prototype: `docs/reference/frostbound-prototype.html`, CSS only — ignore its script) into `skins/frostbound/`.
- [x] HUD renders: quest title, done-when, current objective, main button, companion orb (all five states, switchable by a debug key), objective trail, XP bar, hotbar (stubs), quest log toggle. (F2 cycles orb state, F3 calm mode, 1–6 hotbar.)
- [x] All colors/fonts come from `tokens.json` → CSS variables. Grep check: no hex colors inside `ui/` components.

## Task 3 — Quests from files
- [x] Quest file format (markdown + frontmatter), e.g. `quests/fiverr-gig.md`:
  ```
  ---
  title: Launch my AI automation gig on Fiverr
  doneWhen: Gig published with packages, copy, images and 2 portfolio samples
  status: active
  bundle:
    folders: ["C:/Users/<you>/Documents/Fiverr"]
    urls: ["https://www.fiverr.com"]
  ---
  - [ ] Research what sells
  - [ ] Pick niche + 3 packages
  - [ ] Write gig copy
  - [ ] Make gig images
  - [ ] Build 2 portfolio demos
  - [ ] Publish + route notifications
  ```
- [x] Orchestrator loads quests, enforces **one active**, exposes current quest/objective to the UI.
- [x] "Complete objective" checks the box in the file, advances the trail, adds XP, writes a journal entry. (`npm test` covers the orchestrator.)

## Task 4 — Context bundles
- [x] Starting a quest opens its folders (Explorer) and URLs (default browser). (Also on the first launch of the day; "Open bundle" any time.)
- [x] Pause saves a resume note; resume reopens the bundle and shows the note.

## Task 5 — Text chat with Claude
- [x] Chat input + transcript area tied to the orb (thinking while waiting, speaking while streaming, "your move" when done).
- [x] System prompt built from: companion role (see FEATURES §3.1), current quest, objective, bundle contents, last journal entries. (Role = frozen cached system prompt; live state = a system message each turn.)
- [x] Tools available to Claude in Phase 0 (all Read/Prep tier): `get_current_quest`, `complete_objective` (asks user to confirm), `add_journal_entry`, `open_bundle_item`.
- [x] Verify current Claude API usage (models, streaming, tool use) in the official docs before writing the client.

## Task 5b — Quest Forge: create quests by talking to the companion
**Why:** quests should never need hand-written files. You describe what you want; the companion drafts the quest; you approve; Cockpit writes the file.

**Flow**
1. Open it by: hotbar slot 1 → "New quest", or typing "new quest: …" in chat (wake word later uses the same path).
2. You describe it in plain words, e.g. "I want to launch a Fiverr gig for AI automation."
3. Companion asks **at most 3** clarifying questions, only if needed (what "done" means, which folder, which sites).
4. Companion shows a **draft quest card** in the HUD: title, done-when, 3–7 objectives, suggested folders and URLs.
5. You can edit any field on the card, or say "change objective 2 to …".
6. **Accept** → Cockpit writes `quests/<slug>.md` in the Task 3 format. If no quest is active, it asks "Start this now?" (active) — otherwise it's queued.
7. **Discard** → nothing is written.

**Claude tools (all go through the orchestrator's permission gate)**
- `draft_quest({title, doneWhen, objectives[], folders[], urls[]})` → returns a draft to the UI. Writes nothing.
- `create_quest(draftId)` → only callable after you press Accept. Writes the file. (Prep tier)
- `update_quest(id, changes)` → edits title/doneWhen/objectives of an existing quest after confirmation.
- `set_active_quest(id)` → enforces one active; current active quest is paused with a resume note.
- `create_folder(path)` → only inside the user's Documents (or a configured root), only after confirmation.

**Rules**
- Validate the draft against the quest schema before writing (required fields, 1–7 objectives, valid paths/URLs).
- Slug from title, lowercase-dashed; never overwrite an existing file — append `-2`, `-3`.
- The companion never writes a quest file without an explicit Accept.

**Done when**
- [x] Saying "new quest: launch my Fiverr AI automation gig" produces a draft card in under ~10 seconds. (Measured 5.6–5.9 s.)
- [x] Editing a field on the card and pressing Accept creates a valid file in `quests/` that the Task 3 loader picks up with no hand-editing.
- [x] Discard leaves `quests/` untouched.
- [x] Creating a quest while another is active queues it (or swaps with a resume note if you say "start now").

## Task 6 — Journal + session summary
- [x] Journal panel (hotbar slot 6) lists today's entries.
- [x] "End session" asks Claude for a short debrief and sets tomorrow's first quest.

## Task 7 — Measure
- [x] Log time from "start quest" to "first real work action" each session (simple local log). → `journal/local/setup-times.jsonl`; tap **I'm working** (or W).
- [ ] Compare against the baseline Nick times manually for 3 mornings before using Cockpit. (Tooling ready: `npm run measure -- baseline <minutes> [note]` to record each manual run, `npm run measure` for the comparison. Needs Nick's timed runs.)

---

### Hardest part of Phase 0
Making the HUD look like the prototype *and* stay smooth while other apps are open. Keep animations CSS-only, and test on Nick's actual Windows machine early (after Task 2), not at the end.
