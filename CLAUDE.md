# CLAUDE.md — Cockpit (Workflow Project)

Read this first. It's the brief for anyone (human or Claude) working in this repo.

## What we're building
**Cockpit** — a full-screen Windows app that sits on top of the normal desktop and becomes the place Nick runs his work from. An AI companion (Claude) works alongside him on **one quest at a time**. Each quest carries its own folders, sites and apps; background agents keep them prepared; a hotbar opens everything scoped to the current quest. It's a shell over Windows, **not** a replacement OS.

Full specs live in `docs/`:
- `docs/CONTEXT.md` — original idea, problem, thesis, tests
- `docs/FEATURES.md` — features, core loop, data model, architecture, build phases (**main spec**)
- `docs/SKINS.md` — visual system: one Quest HUD layout, swappable skins (Frostbound default)
- `docs/CONNECTORS.md` — which apps connect and when; first workflow (Fiverr gig)
- `docs/PHASE-0.md` — current build task list

## Decisions already made (don't relitigate without asking)
- **Platform:** Windows desktop.
- **Voice:** wake word, push-to-talk fallback. (Phase 1, not Phase 0.)
- **Layout:** Quest HUD flow — quest title + current objective left, companion orb right, glowing objective trail along the bottom, XP bar top-center, hotbar (1–6) bottom-center, quest log bottom-right.
- **Look:** skins = token files + one stylesheet each. Components never hard-code colors or fonts. Default skin **Frostbound** (Aboreto titles, Alegreya Sans body, rune accents, frozen-glass button, ice/aurora palette).
- **Companion:** a co-pilot and friend — talks you through work, checks in, keeps you on track, honest pushback, small talk at breaks. Presence dial: Buddy (default) / Coach / Quiet + deep-work hold.
- **First workflow:** launching a Fiverr gig for AI automation services.

## Ground rules for the code
1. **One active quest at a time.** Everything else is queued.
2. **Permission tiers for anything an agent does:** Read (free) · Prep (free, undoable, sandboxed) · Act (send/submit/delete/accounts/money — always asks the user, every time).
3. **No trading orders from agents, ever.** Market data/analysis only.
4. **One local orchestrator owns all state.** The UI never talks to agents or external APIs directly; the permission gate lives in the orchestrator.
5. **Skins can't leak.** Adding a skin must only touch `skins/<name>/`. If it requires editing a component, fix the component.
6. **Secrets never in the repo.** API keys go in a local `.env` (gitignored).
7. **Calm mode + reduced motion are always supported.**
8. **XP counts completed objectives only.**

## How to work in this repo
- Work from `docs/PHASE-0.md` top to bottom. Finish and check off one task before starting the next.
- Keep changes small and runnable. After each task, the app must still start.
- When a decision isn't covered by the docs, ask Nick instead of guessing; record the answer in `docs/FEATURES.md` §0 Decisions log.
- Before using any library or API, check its current docs — don't rely on memory for versions or setup steps.

## About Nick (working style)
Capable builder. Skip beginner explanations. Lead with the answer, show working code, be direct about weak spots, name the hardest part early, and give every new idea a way to test it.
