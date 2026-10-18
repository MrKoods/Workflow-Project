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
- [ ] Quest file format (markdown + frontmatter), e.g. `quests/fiverr-gig.md`:
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
- [ ] Orchestrator loads quests, enforces **one active**, exposes current quest/objective to the UI.
- [ ] "Complete objective" checks the box in the file, advances the trail, adds XP, writes a journal entry.

## Task 4 — Context bundles
- [ ] Starting a quest opens its folders (Explorer) and URLs (default browser).
- [ ] Pause saves a resume note; resume reopens the bundle and shows the note.

## Task 5 — Text chat with Claude
- [ ] Chat input + transcript area tied to the orb (thinking while waiting, speaking while streaming, "your move" when done).
- [ ] System prompt built from: companion role (see FEATURES §3.1), current quest, objective, bundle contents, last journal entries.
- [ ] Tools available to Claude in Phase 0 (all Read/Prep tier): `get_current_quest`, `complete_objective` (asks user to confirm), `add_journal_entry`, `open_bundle_item`.
- [ ] Verify current Claude API usage (models, streaming, tool use) in the official docs before writing the client.

## Task 6 — Journal + session summary
- [ ] Journal panel (hotbar slot 6) lists today's entries.
- [ ] "End session" asks Claude for a short debrief and sets tomorrow's first quest.

## Task 7 — Measure
- [ ] Log time from "start quest" to "first real work action" each session (simple local log).
- [ ] Compare against the baseline Nick times manually for 3 mornings before using Cockpit.

---

### Hardest part of Phase 0
Making the HUD look like the prototype *and* stay smooth while other apps are open. Keep animations CSS-only, and test on Nick's actual Windows machine early (after Task 2), not at the end.
