# CLAUDE.md — Cockpit (Workflow Project)

Read this first. It's the brief for anyone (human or Claude) working in this repo.

## What we're building
**Cockpit** — a full-screen Windows app that sits on top of the normal desktop and becomes the place Nick runs his work from. An AI companion (Claude) works alongside him on **one quest at a time**. Each quest carries its own folders, sites and apps; background agents keep them prepared; a hotbar opens everything scoped to the current quest. It's a shell over Windows, **not** a replacement OS.

Full specs live in `docs/`:
- `docs/CONTEXT.md` — original idea, problem, thesis, tests
- `docs/FEATURES.md` — features, core loop, data model, architecture, build phases (**main spec**)
- `docs/SKINS.md` — visual system: Orbit layout + 7 color palettes (Aqua default)
- `docs/PHASE-1.md` — **current build task list** (Phase 1: voice + templates)
- `docs/ORBIT-UPGRADE.md` — Orbit upgrade task list (done, history)
- `docs/reference/` — prototype code to port: orbit.css, palettes/*.json, palette.ts, bloom.ts, focusEngine.ts, demo-quest.md, markup-snapshot.html
- `docs/CONNECTORS.md` — which apps connect and when; first workflow (Fiverr gig)
- `docs/PHASE-0.md` — Phase 0 task list (complete, history)

## Decisions already made (don't relitigate without asking)
- **Platform:** Windows desktop.
- **Voice:** wake word, push-to-talk fallback. (Phase 1, not Phase 0.)
- **Layout: Orbit.** Quest steps orbit the companion. The orbit turns so the current step is at the front; its work pops out as the center card; done steps tuck back in with ✓. One spotlit thing at a time; the conversation drives the sequence.
- **Look:** components never hard-code colors. Skins are **color palettes only**: one JSON token file each in `skins/palettes/` (Aqua default, Ember, Nebula, Aurora, Frost, Crimson, Eclipse). Companion visual: **Bloom** (canvas). Fonts fixed: Bricolage Grotesque, Manrope, Newsreader. Voice (Steady / Playful) is separate from skin.
- **Companion:** a co-pilot and friend — talks you through work, checks in, keeps you on track, honest pushback, small talk at breaks. Presence dial: Buddy (default) / Coach / Quiet + deep-work hold.
- **First workflow:** launching a Fiverr gig for AI automation services.

## Ground rules for the code
1. **One active quest at a time.** Everything else is queued.
2. **Permission tiers for anything an agent does:** Read (free) · Prep (free, undoable, sandboxed) · Act (send/submit/delete/accounts/money — always asks the user, every time). **The companion operating Cockpit itself is free (Nick, 2026-10-19):** settings, quest/step state, panels, its own window, and other apps' windows (minimize/restore/maximize/focus/open) need no confirmation because they're undoable. Still Act (asks every time): closing another app's window, deleting files, anything that sends, submits or spends. Quests are archived, never deleted.
3. **No trading orders from agents, ever.** Market data/analysis only.
4. **One local orchestrator owns all state.** The UI never talks to agents or external APIs directly; the permission gate lives in the orchestrator.
5. **Palettes can't leak.** Adding a color skin = adding one JSON file in `skins/palettes/`. If it needs a CSS or component edit, fix the component.
6. **Secrets never in the repo.** API keys go in a local `.env` (gitignored).
7. **Calm mode + reduced motion are always supported.**
8. **XP counts completed objectives only.**

## How to work in this repo
- Work from `docs/PHASE-1.md` top to bottom (PHASE-0.md and ORBIT-UPGRADE.md are complete, kept for history). Finish and check off one task before starting the next.
- Keep changes small and runnable. After each task, the app must still start.
- When a decision isn't covered by the docs, ask Nick instead of guessing; record the answer in `docs/FEATURES.md` §0 Decisions log.
- Before using any library or API, check its current docs — don't rely on memory for versions or setup steps.

## About Nick (working style)
Capable builder. Skip beginner explanations. Lead with the answer, show working code, be direct about weak spots, name the hardest part early, and give every new idea a way to test it.
