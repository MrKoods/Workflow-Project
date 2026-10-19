# Cockpit — Features & How It Works

> Working spec v0.1, 2026-10-17. Supersedes CONTEXT.md §3 (screen zones), §4 (data model) and §7 (MVP scope).
> Labels: **FACT** = verified · **INFERENCE** = reasoned · **SPECULATION** = untested idea. Product/tool specifics marked *(verify)* have not been checked against current docs.

---

## 0. Decisions log
- 2026-10-18 — **Spoken-turn timing (Phase 1 Task 5):** every push-to-talk turn is logged to `journal/local/voice-turns.jsonl` (release → transcript → first audio, route script/Claude); `npm run measure -- voice` prints medians vs. targets. Engine port change: the reply pause (acted listening 900 ms + thinking 450 ms) is now **100 + 50 ms** — it was dead air with real speech. Measured with recorded speech: scripted **540 ms**, Claude **~2.9 s**.
- 2026-10-18 — **Control Deck settings + rebindable keys (Nick):** `ui/settings.ts` replaces the small panel: Look / Voice / Keys sections, every change saved at once. Voices offered: Thalia (default for both), Apollo, Aries, Atlas, Hermes (`ui/voice/voices.ts`); ▶ previews play even with speech off. Hotkeys are named actions (`orchestrator/keymap.ts`, `Settings.hotkeys` overrides): global ones need Ctrl/Alt/Win and re-register live (a combo Windows refuses is reported and the previous one kept); push-to-talk may be a lone held key (Right Ctrl/Alt/Shift); Esc is reserved; clashes are refused when saved and offered as a swap in the UI. New keys: **M** mute, **Ctrl+,** settings. While typing in a text field only Ctrl/Alt/Win combos fire.
- 2026-10-18 — **The companion speaks (Phase 1 Task 3):** `orchestrator/speech.ts` calls Deepgram TTS (24 kHz linear16, streamed) in the main process and streams audio to the window (`ui/voice/player.ts`), which plays lines back to back and reports when each was heard. Scripted lines end when their audio ends (engine port change: `speak` hook), in the voice of the moment (Playful/Steady → `Settings.voicePlayful` / `voiceSteady`). Claude's replies are spoken sentence by sentence as they stream. Pressing the talk key stops speech (barge-in); `Settings.speech` off stops it and leaves captions only; a line the window never reports finishes on its own a little after its audio length. Bloom follows the real audio level while speaking. Measured: first audio 126–360 ms after a line starts; Claude's first spoken sentence ~2.7 s after sending (2.5 s of it Claude).
- 2026-10-18 — **Push-to-talk (Phase 1 Task 2):** `orchestrator/talk.ts` owns the Deepgram live connection (nova-3, 16 kHz linear16): opened on key-down (audio buffered until it's up), Finalize on release, final transcript → the same reply path as the Say box (engine first, else Claude). Renderer `ui/voice/talk.ts` owns the mic (AudioWorklet at 16 kHz, 20 ms frames over IPC), opened on the first press and closed 30 s after the last; audio is sent only while talking. Keys: hold **Right Ctrl** (Right Ctrl + another key = a shortcut → cancel; Alt+Tab while holding = send), tap **Ctrl+Alt+V** from any app, or the **Talk** button; **Esc** cancels. Mic permission: Cockpit's own window, audio only. While talking Bloom listens to the real mic level and the caption shows the words as they're heard. Max 60 s per press. Dev harness: `wav:<16 kHz WAV>` speaks a recording through the real path.
- 2026-10-18 — **Speech provider: Deepgram (Nick, Phase 1 Task 1).** Measured with `npm run voice-latency` (5 runs, synthesized phrase): Deepgram STT end of speech → final **82 ms**, TTS first audio **130 ms**; ElevenLabs 154 ms / 157 ms; both transcribed the phrase exactly. Est. release-key → first word: **~0.3 s for scripted turns, ~1.8 s for Claude turns** (Claude's first sentence is ~85% of it). Voice: **Thalia (aura-2-thalia-en)** default — Nick's favorite; Apollo, Aries, Atlas, Hermes (male, not baritone) also liked and go in the Settings voice picker (Task 4). Target for Task 5: scripted turns under 0.6 s, Claude turns under 2.2 s, release-key → first word (medians).
- 2026-10-18 — **Fiverr links checked:** the demo quest's sign-up card opens `fiverr.com/join` (the real "Sign up for a Fiverr account" page) and the profile card opens `fiverr.com/start_selling` ("Start Selling on Fiverr"; its Become a Seller button starts the seller onboarding where display name, photo and description are entered). Checked by HTTP status against a 404 control; deeper onboarding pages need a login, so their exact paths are not used. **Tests use fixed fixtures** (`orchestrator/fixtures/`) instead of the live `quests/` files, and the formatter ignores `quests/` and the fixtures (quest files stay as written).
- 2026-10-18 — **Swap steps on the orbit (Nick):** click a planet, or ← / → (previous / next step; only while not typing), Home or Esc to go back. Swapping is **view and use**: the orbit turns to that step and its cards pop out (a done step's checklists show ticked; links and Copy work), the caption says Done ✓ or Coming up, and one chip offers "Back to current step". The script keeps its place underneath and **steps still finish in order** (XP unchanged). Any real reply ends the swap and counts as usual. Lives in `orchestrator/focus.ts` (`peekStep`, `peekView`); the engine itself is untouched. Dev aid: `COCKPIT_USER_DATA=<dir>` runs a test instance alongside the everyday one.
- 2026-10-18 — **Voice follows the context (Nick):** new default **Auto** = Playful while the companion has the floor (intro, between steps, wrap-up) and **Steady/focus while a step's card is up**. Settings → Companion voice: Auto / Steady / Playful (a pinned choice beats the quest's `voice:`). Applies to scripted beats (optional `steady:` wording per beat; the demo quest has one for every in-task line), item confirmations ("Copied."), the resume opener, and Claude's chat (the live state names the voice each turn; Steady = 1–3 short sentences, no jokes). The caption shows "Companion · Focus · …" while Steady. Settings files saved before Auto existed (no `version`) move to Auto once.
- 2026-10-18 — **Fit to Nick's monitor (Nick):** the window zooms the page (Electron `setZoomFactor`) so the 1440×900 design stage fills it: factor = min(height/900, width/1440), refit on resize. On 2560×1440 that is 1.6× (a 1600×900 stage), sharp because zoom raises devicePixelRatio. The link card was tightened a little so it clears the reply chips at 900 px. Tuned for Nick's 2560×1440 for now; other monitors get checked later.
- 2026-10-18 — **Setup-time comparison deferred (Nick):** the Orbit-vs-HUD / baseline timing comparison waits until Cockpit is fully built. The instrumentation stays in (sessions are still logged); nothing to run until then.
- 2026-10-18 — **Phase 0 complete (incl. the Orbit upgrade, ORBIT-UPGRADE Tasks 1–9).** Verified: the demo quest (`quests/fiverr-profile.md`) runs end to end in Orbit by typing only "yeah" and "done" (4/4 steps ticked in the file, XP 400, journal entries, 0 card re-mounts); the original Phase 0 quest (`quests/fiverr-profile-v1.md`, v1 format) loads and completes by typing "done"; all 7 color skins switch live (Ctrl+Shift+P / Settings) and the choice survives a restart. Open: Orbit-vs-HUD setup time over 5 real sessions (instrumented), 60 fps with a browser open (measured 170 fps without), the fixed-px layout on non-1440×900 screens.
- 2026-10-18 — **Claude drives the sequence — groundwork (Task 9):** `orchestrator/focusTools.ts` defines focus_item, support_items, complete_step, offer_replies, say (validated against the quest on screen, each → `engine.run(beat)`), **not enabled** (`FOCUS_TOOLS_ENABLED = false`, not in the companion's tools). All Read tier; **complete_step asks the user to confirm** like Phase 0's complete_objective, because it ticks the file and adds XP (CLAUDE.md rule 8) — a deviation from "UI-only" for that one tool. `engine.run` now applies helpers alone and live reply chips (a live chip goes to Claude as the user's answer).
- 2026-10-18 — **Polish + measure (Task 8):** below 1200 px the helpers sit under the hero at 0.6 scale and the docked caption narrows to stay clear of the hero. With 6–7 steps, planets at the back (sin(angle) < −0.25) show their icon only (label on hover). Setup times now carry `layout: "orbit"` (older records = Phase 0 HUD); `npm run measure` compares the two and counts Orbit sessions toward 5. Dev aid: `COCKPIT_WINDOW_SIZE=1100x900`. **Known:** the prototype's fixed px layout assumes ~1440×900; at 900 px tall the 0.6-scale helpers overlap the reply bar, and on 1440p the lower half stays empty. Fix later by scaling the stage to the viewport (needs a design call).
- 2026-10-18 — **Free text during a quest (Nick):** text that matches no reply chip and no yes/done word goes to Claude even while the engine waits; the chips stay up, so "done" still advances. The ported matcher also no longer treats a question (contains "?") as a generic yes — "what goes in my bio?" used to advance the step on the word "in".
- 2026-10-18 — **Conversation (Task 7):** chips and the Say box both call `reply`; the main process gives it to the engine when it is waiting, otherwise shows it as "You" and sends it to Claude. Claude's streamed answer is the companion caption (Bloom follows its state and gets voice pulses per chunk) until the engine says something new; a confirmation (e.g. complete_objective) shows as Confirm / Not now chips; tool actions show as a short notice. Settings → Companion voice: Steady / Playful (default Playful), persisted; today it changes the resume opener, quest files may carry both wordings later. Measured: free-text question → first text 1.9 s, done 2.6 s.
- 2026-10-18 — **Bloom (Task 6):** `ui/companion/bloom.ts` is the reference renderer unchanged; one instance in `.comp`, colors `setPalette(accent, reply, third)` on every palette change, state from the engine (F2 cycles listening → thinking → speaking → working → back to the engine for debugging), voice level from the engine's typewriter over IPC. Calm = `Settings.calm` (F3, persisted) or the OS reduced-motion setting. Measured in the dev harness on Nick's PC (no browser open): 170 fps, p95 frame 6 ms. Still to check by hand: 60 fps with a browser open next to it.
- 2026-10-18 — **Orbit UI (Task 5):** checked Electron 44.9.0 = Chromium 152: `@property`, `sin()/cos()/round()`, `color-mix()` supported and computing correctly. `ui/orbit/orbit.css` is the reference stylesheet with the palette re-declarations removed (they overrode `applyPalette()`). Items are built once per quest and only change class; a probe over a full demo run counted 0 removed / 0 added cards. Link CTAs open only URLs from the quest's own items; draft/tags copy via the main-process clipboard; the companion confirms in one line when it isn't mid-sentence. Fonts self-hosted (`@fontsource` Bricolage Grotesque, Manrope, Newsreader); Frostbound, the legacy HUD and its fonts are removed. Dev harness: `COCKPIT_SCREENSHOT_REPLIES="yeah,done,…"` types replies into the Say box and captures each step. Known: the prototype's fixed px layout (1440×900) leaves the lower part of a 1440p screen empty.
- 2026-10-18 — **Focus engine (Orbit Task 4):** `orchestrator/focusEngine.ts` is the reference engine with marked port changes (Node timers, `start(fromStep, opener)`, `onStepDone` → complete-objective, `pace` for tests, `waiting` cleared before listeners run). `orchestrator/focus.ts` runs one engine for the quest on screen and pushes a `FocusView` over IPC (`cockpit:focus`; voice level on `cockpit:voice`). A quest with done steps — after resume or relaunch — starts at its first open step with a short opener ("Welcome back. You left off: …. Next up: …. Ready?"); a step completed elsewhere (chat tool) restarts the engine there. Replies go to the engine when it is waiting, otherwise to Claude.
- 2026-10-18 — **Quest file v2 (Orbit Task 3):** a file with `steps:` in its frontmatter is v2 (`items`, `intro`, `steps[].beats`, optional `voice`), validated with the bad field's path in the error. Step progress is still the body's checkboxes, one per step in order (missing boxes = not done; the first completion writes the full list), so XP/journal/completion stay the Phase 0 path. v1 objectives become steps `objective-N` (label cut at a word to ~16 chars + …, icon •, beats say → Done → stepDone; the last also `end`). `update_quest` refuses to change a v2 quest's steps (edit the file). `get_current_quest` sends items and step titles, not beats.
- 2026-10-18 — **Orbit migration (ORBIT-UPGRADE Task 1, Nick's answers):** the demo quest becomes `quests/fiverr-profile.md`; the real Phase 0 seller-profile quest moves to `quests/fiverr-profile-v1.md` (queued). Phase 0 extras stay, restyled small on the palette: a thin top-right control row (quest log, journal, pause, settings, step count as XP), the Forge card and journal as panels, "I'm working" as a reply chip while the setup timer runs; hotkeys 1–6, W, Esc unchanged. Decision-log entries the Orbit docs update dropped were restored below. See docs/MIGRATION-NOTES.md for the port fixes.
- 2026-10-18 (later) — **Orbit is the layout.** Quest steps orbit the companion (Bloom); the current step pops out of the orbit as the center card; done steps tuck back in with ✓; the orbit turns so the next step is always at the front. **Skins are color palettes only** (7: Aqua default, Ember, Nebula, Aurora, Frost, Crimson, Eclipse), switched live. Flow / Tech HUD / Portal archived. Phase 0 is complete; next build doc is ORBIT-UPGRADE.md.
- 2026-10-18 — **Layout = focus follows the workflow** (replaces the fixed Quest HUD). One spotlit thing at a time: companion + task on open; on "yes" the needed item (link, page, draft, checklist) takes center, companion docks but keeps talking; done items get put away; between steps focus returns to the companion for one beat. **Skins:** Flow (default), Tech HUD, Portal — same engine, see SKINS.md. **Voice** (Steady / Playful) is a separate setting from skin; default Playful.
- 2026-10-17 — **Quest Forge:** quests are created by talking to the companion (draft card → edit → Accept writes the file). Hand-editing quest files stays possible but is never required. Built in Phase 0 as Task 5b.
- 2026-10-17 — **Windows** desktop app. **Wake word** for voice (push-to-talk fallback). **First workflow:** Fiverr gig page for AI automation (see CONNECTORS.md). Connectors chosen per workflow, not up front.
- 2026-10-17 — **Desktop framework: Electron** (via Electron Forge, `vite-typescript` template). Reasons: Node 24 already installed, no Rust/MSVC toolchain needed; orchestrator, Claude client (official TS SDK) and UI all in TypeScript; bundled Chromium renders the prototype CSS identically. Accepted cost: heavier app; Forge's Vite plugin is marked experimental (docs checked 2026-10-17, Electron 44.9.0 latest stable).
- 2026-10-17 — **Window hotkeys:** show/hide = **Ctrl+Alt+C** (Ctrl+Alt+Space was first choice but is already owned by another app on Nick's PC, likely Claude desktop quick entry); quit = **Ctrl+Alt+Q**. Hotkey only hides; a **tray icon** (Show/hide, Quit) keeps Cockpit running in the background. Window is borderless full-screen; F12 toggles DevTools.
- 2026-10-17 — Scaffold note: Forge 8's CLI renamed the template; the command is now `npx create-electron-app@latest <name> --template vite --typescript` (the Forge docs page still shows `vite-typescript`).
- 2026-10-17 — *(superseded by Orbit, 2026-10-18)* **Skin mechanics (Task 2):** `skins/<name>/tokens.json` is flattened to CSS variables on `:root` (`color.taskBright` → `--color-task-bright`); `skin.css` is loaded as one `<style id="skin">`, discovered by folder via `import.meta.glob` (so a new skin touches only its folder). `ui/hud.css` holds layout only. skin.css is hex-free too: alpha variants use CSS relative color `rgb(from var(--x) r g b / a)`. Fonts are self-hosted via `@fontsource/*` (imported from skin.css) — offline-safe, strict CSP, no Google Fonts at runtime.
- 2026-10-17 — *(superseded by Orbit, 2026-10-18)* **Port deviations from prototype:** mouse parallax dropped (it lived in the script block; also cheaper while other apps run); "Party" agent list on the orb column left out until Phase 2; trail progress uses a clipped layer instead of `pathLength` dashes (the prototype's dash approach mis-renders when the 1440 viewBox is stretched to wider screens). Debug keys: F2 cycle orb state, F3 calm mode, F12 DevTools.
- 2026-10-17 — *(superseded by Orbit, 2026-10-18)* **Quest title fit:** the title may wrap to two lines at the skin's size; if it would need three or more, the font shrinks (5% steps, floor 40%) until it fits in two. Refits on resize and after fonts load. Empty vertical band on large screens: leave as is for now.
- 2026-10-17 — **Quests from files (Task 3):** file-first, as in §4's speculation. `quests/*.md` is the source of truth (no DB yet); the orchestrator (main process) re-reads files before every change and watches the folder, so edits from VS Code/Claude Code show up live. Rules: more than one `status: active` → the first by file name stays active, the rest are set to `queued` in their files and journaled; the current objective is the first unticked box; finishing the last one sets `status: done` + `completedAt`, and the HUD keeps the finished quest on screen with "Next quest", which activates the first queued quest (file-name order). Trail nodes are display-only. Journal = `journal/local/YYYY-MM-DD.jsonl` (gitignored). Paths override via `COCKPIT_QUESTS_DIR` / `COCKPIT_JOURNAL_DIR`. XP bar = objectives done in the current quest ×100.
- 2026-10-18 — **Context bundles (Task 4):** starting or resuming a quest opens its folders (Explorer), apps and URLs (default browser); launching Cockpit opens the active quest's bundle only on the **first launch of the day** (tracked in `journal/local/state.json`); an "Open bundle" link re-opens it any time. Missing folders are **skipped and reported** by the companion, never created. Only http/https URLs open. **Pause** = "Pause quest" link → optional "Where did you leave off?" note (empty → "Paused on objective N: …"); after pausing nothing is active and the quest log offers Resume (paused) / Start (queued). The note shows as "Left off: …" after resuming and is cleared when the next objective completes. Frontmatter edits keep hand-written formatting (no re-wrapping). Closing a bundle's windows on pause is not done (FEATURES §7 #2). `COCKPIT_DRY_OPEN=1` logs instead of opening.
- 2026-10-18 — **Create missing folders (amends Task 4):** opening still never creates anything, but when a bundle folder is missing the companion offers a **Create missing folder** button. Clicking it creates the folder (only strictly inside the user's home folder; anything else is refused and reported), opens it, and journals `Created folder …`. Same rule the Task 5b `create_folder` tool will follow.
- 2026-10-18 — **Companion chat (Task 5):** `orchestrator/companion.ts`, official `@anthropic-ai/sdk` (0.135), model **`claude-opus-5-5`** at effort **`medium`** (override with `COCKPIT_EFFORT`), streaming via `client.beta.messages.stream`, manual tool loop. Thinking is always on for Opus 5.5 (no `thinking` param). **Server-side refusal fallback on** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Caching: frozen system prompt + top-level `cache_control`; live quest state goes in a **mid-conversation system message** each turn, so the cached prefix and history are never edited (append-only; a failed turn is dropped from the end). Tools validate their inputs; `open_bundle_item` opens only exact bundle entries; `complete_objective` only the current objective, and only after the user presses Confirm. Companion journal notes use kind `note`. Key loaded from `.env` in the main process only. Measured: a two-tool turn (complete + journal note, incl. confirm) finished in ~6.5 s. Chat history lives in memory for the session.
- 2026-10-18 — **Quest Forge built (Task 5b):** the companion **drafts first** when it can (assumptions named in its reply; the card is editable) and asks up to 3 questions only when it can't draft anything sensible — this is what meets the "<10 s to a draft card" check (measured 5.6–5.9 s). **No `create_quest` tool:** the Accept button is the only path that writes a quest file, which is the spec's rule ("never writes without an explicit Accept") with no tool that could only fail. Tools given to Claude: `draft_quest`, `update_quest` (confirm on screen; objective titles that stay the same keep their done state; notes in the file are kept), `set_active_quest` (pauses the current quest with "Paused to switch to …"), `create_folder` (confirm on screen; **inside Documents only**, stricter than the home-folder rule for "Create missing folder"). Card: Ctrl+Enter accepts; with nothing active, Accept asks "Start this now?". Hotbar slot 1 starts a "New quest: " chat message. Slugs never overwrite (`-2`, `-3`). Trail labels now wrap to two lines within the gap between nodes (full title on hover).
- 2026-10-18 — **Journal + End session (Task 6):** hotbar slot 6 opens a journal panel over the trail (today's entries, live-refreshing; Esc or Close hides it). **End session** sends a visible chat message; the companion debriefs and calls `end_session` (summary → journal kind `summary`; tomorrow's first quest → `firstQuest` in `journal/local/state.json`). On the **first launch of a later day**, if nothing is active, that quest is started (bundle opens); either way the plan is then cleared. The live state shows the plan so the companion can mention it. Journal timestamps now use the orchestrator's clock. Dev harness: waits out Vite's startup reload; `COCKPIT_SCREENSHOT_CLICK=<selector>`; renderer warnings/errors echo to the terminal in dev. Number keys also match `e.code` (Digit/Numpad); synthetic keypresses can't verify them, so 1–6 on a real keyboard is still to be checked.
- 2026-10-18 — **Measure (Task 7):** "first real work action" = **tapping "I'm working"** (or W) — Nick's choice, over automatic proxies. The setup timer starts when a session starts: quest start, resume, Accept-and-start, or the first launch of the day; manual "Open bundle" doesn't start one. Pausing before tapping drops it; completing an objective first ends it **unconfirmed**; after 10 min it stops **unconfirmed**. Only confirmed runs count. `journal/local/setup-times.jsonl` + `baseline.jsonl`; `npm run measure` prints median Cockpit time vs. median baseline, the reduction against CONTEXT.md's 30% bar, and progress toward 5 separate days.
- 2026-10-18 — **First real quest: Fiverr seller profile setup** (`quests/fiverr-profile.md`, active). The gig-launch quest is queued behind it: a verified seller profile comes before the first gig (Fiverr help center: identity verification happens after the profile, before the first gig). Profile sections come from third-party guides; Fiverr's current menu wording may differ.
- 2026-10-17 — *(superseded by Orbit, 2026-10-18)* Frostbound reference prototype lives at `docs/reference/frostbound-prototype.html`. Port its CSS/markup; its script block is prototype-only and is ignored.

## 1. What Cockpit is, in one paragraph
Cockpit is a full-screen workspace that sits **on top of** your normal computer and becomes the place you run your day from. You and the AI companion work on one quest at a time. Quests come from talking to the companion or from things you import. Each quest carries its own folders, sites and apps, and background agents keep them prepared. You never leave Cockpit to "go find" things; the hotbar opens them, already scoped to what you're doing. It is still Claude underneath — Cockpit is the cockpit, Claude is the co-pilot.

**INFERENCE (high confidence):** it should be a shell over your OS, not a replacement OS. Your real apps keep running; Cockpit launches, arranges and drives them.

---

## 2. The core loop

```
 Launch ─► Companion briefs you ─► Pick / confirm today's quest
                                         │
                                         ▼
                    Quest opens: context bundle restores
                    (folders, sites, apps, notes, last resume point)
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
               You work the current objective     Party (agents) work in background
               Companion: talk it through,        read-only / prep tasks, results land
               answer, look things up             in the approval inbox
                        └────────────────┬────────────────┘
                                         ▼
                         Complete objective ─► XP, journal entry
                                         │
                         more objectives? ─yes─► next objective
                                         │ no
                                         ▼
                Quest complete ─► debrief logged ─► next quest from log
                                         │
                                 End of day ─► session summary + tomorrow's first quest
```

---

## 3. Feature modules

### 3.1 Companion (the AI) — a co-pilot and a friend, not a notification system
**Role (decided 2026-10-17):** the companion works alongside you the whole session. It talks you through the process, keeps you on track, checks in, encourages, pushes back, and makes small talk at natural breaks — while still doing its core job of helping get the task done.

**Basics**
- **Talk:** voice with a **wake word** (push-to-talk hotkey as fallback) and text. Same conversation either way. Wake-word detection runs locally so audio isn't streamed until you call it *(verify engine choice on Windows)*.
- **States, shown by the orb:** listening · thinking · speaking · your move · agents working. "Your move" is the handoff — the orb turns the task color.
- **Knows the context:** current quest, objective, bundle contents, recent journal, what the party returned, and (with your permission) what it knows about you from memory.
- **Can act through tools:** create/edit quests, open bundle items, start agent jobs, write journal entries, search, read files — within the permission tiers (3.5).

**How it behaves through a session**

| Moment | What the companion does | Example |
|---|---|---|
| **Session start** | Greets you, reads the day, proposes the first quest | "Morning. Futures are your first stop — want to run pre-market prep, then the gym follow-ups?" |
| **Starting an objective** | Walks you in: what this step is, what "done" looks like, what it already prepped | "Step 2 is levels. I pulled last week's range; start with the daily chart." |
| **While you work** | Talks you through when you're talking; light check-ins on a rhythm, timed to pauses, not mid-thought | "How's it looking? Need me to pull anything?" |
| **Stuck or slowing down** | Notices (long time on one step, back-and-forth between files) and offers a way forward | "You've been on this one a while. Want to talk it through or break it smaller?" |
| **Drifting off-quest** | Names it plainly, once, and offers a choice | "Looks like we wandered to email. Park this quest or come back?" |
| **Completing a step** | Real acknowledgment, then a quick bridge to the next | "Nice, that's levels done. Signals next — quick one." |
| **Natural breaks** | Small talk, asks how you're doing, light humor; follows your lead | "Quick breather. How'd training go last night?" |
| **You're wrong or rushing** | Honest pushback, not cheerleading | "Hold on, that invalidation is above your entry. Double-check before we log it." |
| **End of session** | Debrief: what got done, what's left, sets tomorrow's first quest | "Three quests done. Tomorrow starts with the journal review." |

**Presence dial (you set it, changeable anytime by voice or in Settings)**
- **Buddy** *(default)* — conversational, check-ins every ~15–25 min of work, small talk at breaks, narrates transitions.
- **Coach** — focused on keeping pace: check-ins at objective boundaries, less small talk.
- **Quiet** — speaks when asked, when something needs you, and at session start/end.
- **Deep-work hold** — one tap or "hold for 45" silences check-ins for a block; it resumes after.

**Personality (configurable)**
- Name and voice of the companion, tone (warm, dry, hype), humor on/off, how blunt the pushback is.
- Consistent across skins — the skin changes the look, not who the companion is.

**Ground rules built in (non-negotiable by design)**
- **Honest over agreeable.** Encouragement is earned; mistakes get flagged. No flattery.
- **Never nags.** One nudge per drift; if you say "not now," it backs off for that block.
- **Times its talk.** Prefers pauses, step boundaries and breaks over interrupting active work.
- **Remembers what matters, forgets what you ask.** Uses memory to be a better partner (your workflows, preferences, what happened yesterday), and you can tell it to drop anything.
- **Healthy, not sticky.** It's a great work partner and good company, but it's upfront that it's an AI. It won't guilt you for stepping away, and it'll happily tell you to go take a break or go see people.

**Test (falsifiable):** run a week on Buddy and a week on Coach. Track objectives done per day and how often you dismissed a check-in. If Buddy completes ≥ Coach with low dismissals, Buddy stays default. If dismissals climb above roughly 1 in 3, the check-in timing is wrong — tune the rhythm before changing the personality.

### 3.2 Quests (task engine)
- **Quest** = one outcome with a done-condition ("Done when…") and 1–7 objectives.
- **Rule: one active quest at a time.** Everything else lives in the quest log, hidden until you finish or pause.
- **Where quests come from:**
  1. **Talking (Quest Forge)** — "Let's prep for market" → companion asks up to 3 questions, shows a draft quest card (title, done-when, objectives, folders, sites), you edit and Accept → the quest file is written.
  2. **Templates** — recurring workflows saved once, spawned on schedule (pre-market prep every weekday, gym follow-ups every Monday).
  3. **Import** — paste a list, drop a file (markdown/CSV), or pull from calendar / email / CRM / task apps via connectors *(verify which are available)*.
  4. **Party suggestions** — an agent finds something that needs doing; it lands as a *proposed* quest you accept or dismiss.
- **Objective types:** *You do it* · *Companion does it* · *Companion preps, you approve*.
- **Pause / resume:** pausing saves the resume point ("you were on objective 3, last note: …") and the bundle state.

### 3.3 Context bundles
- Each quest owns a bundle: **folders, files, URLs, apps, notes**.
- **Open quest → bundle restores:** folders open, sites load in the Web panel, apps launch.
- **Agents keep it current:** new relevant files appear, stale ones are flagged (the "UPDATED" / dimmed pips on the trail).
- **Close quest → bundle closes cleanly**, so the next quest starts clean.

### 3.4 Hotbar (the OS layer)
Keys 1–6, always visible, always scoped to the active quest.

| Slot | Opens | Scoped to quest means… |
|---|---|---|
| 1 Quests | Quest log, templates, import | Current quest pinned at top |
| 2 Files | File browser panel | Starts in the quest's folders |
| 3 Web | Embedded browser panel | Opens the quest's sites as tabs |
| 4 Comms | Messages / email drafts | Shows threads linked to the quest |
| 5 Inbox | Approval inbox + agent results | Items from this quest first |
| 6 Journal | Session log, notes, decisions | This quest's entries |

Opening anything from the hotbar makes it the spotlit item; closing it hands focus back. The companion stays visible (docked) the whole time.

### 3.5 Party (background agents) + permissions
- **Agent job** = a background task with a goal, a tier, and a result.
- **Tiers (decided):**
  1. **Read** — look, search, summarize. Runs freely.
  2. **Prep** — draft, open, arrange, create files in a sandbox folder. Runs freely, always undoable.
  3. **Act** — send, submit, delete, change accounts, anything with money. **Always asks first**, every time.
- **Approval inbox:** every Act request and every Prep result shows here with Accept / Decline / Edit.
- **Audit log:** every action an agent took, with undo where possible.
- **Hard rule:** no trading orders from agents. Market data and analysis yes; orders stay manual.

### 3.6 Journal & progress
- Auto-logged: quest started/finished, objectives done, decisions made, agent actions accepted.
- **Session summary** at end of day + tomorrow's first quest pre-set.
- **XP is honest:** XP = objectives completed, nothing for clicking. Weekly view shows quests done, time on quest vs. off quest.

### 3.7 Focus guardrails (run by the companion; on by default in Buddy and Coach)
- **Drift check:** if you've been outside the bundle for a while, the companion names it once and offers park-or-return.
- **Stuck detection:** long time on one objective, or repeated switching between the same files → offer to talk it through or split the step.
- **Breaks:** suggests a break after long stretches and uses it for a little conversation.
- **Calm mode:** kills celebrations and background motion (separate from the presence dial).

**What it needs to notice (signals):** active window/app, time on objective, files touched, voice/typing activity, your replies to check-ins. All local; nothing leaves the machine except what the companion sends to Claude as conversation context.

### 3.8 Focus engine + skins
- **Focus engine:** the orchestrator emits beats (companion line, hand-off of an item, wait for your reply, step done). The UI only maps state to classes: mode `m-comp` / `m-task`, item states `hero / sup1 / sup2 / done / off`. CSS transitions do the moving.
- **Layout:** Orbit (fixed). **Skins:** 7 color palettes, live switch from Settings → Color skin. See SKINS.md.
- **Voice:** Steady / Playful, independent of skin.
- **Test (falsifiable):** time from "yeah, let's go" to your first real action on the step. If focus switching doesn't beat the old multi-window layout on that number over 5 sessions, the model is wrong.

---

## 4. Data model (v0.1)

```
Quest        id, title, doneWhen, status(active|paused|queued|done), source(talk|template|import|agent),
             objectives[], bundleId, resumeNote, createdAt, completedAt
Objective    id, questId, title, type(you|companion|prep-approve), status, order
Bundle       id, folders[], files[], urls[], apps[], notes
Template     id, title, objectives[], bundle, schedule(cron-like)
AgentJob     id, questId, goal, tier(read|prep|act), status(running|needs-approval|done|declined), result, log[]
JournalEntry id, questId?, kind(start|pause|resume|finish|objective|decision|agent|note|summary), text, at
Settings     palette, voice(steady|playful), voiceMode, calmMode, driftCheck, hotkeys, presence(buddy|coach|quiet), checkInMinutes
Companion    name, voice, tone, humor, bluntness, deepWorkHoldUntil
CheckIn      id, questId, at, kind(walkthrough|checkin|stuck|drift|break|praise|pushback|debrief), dismissed(bool)
```

**Unconventional angle (SPECULATION):** store quests and templates as plain markdown files in a folder (one file per quest), with the database as an index only. Then Claude in any surface — chat, Claude Code — can read and write your quests directly, and nothing is locked inside the app. Trade-off: syncing file edits made outside the app is extra work. Test: build v0 file-first; if keeping the index in sync costs more than a day of fixes, switch to database-first.

---

## 5. Architecture (proposed — verify tools before committing)

```
┌───────────────────────── Cockpit window (full-screen, global hotkey) ─────────────────────────┐
│  UI layer: HUD + panels, rendered with web tech; skins = token files                         │
└───────────────▲───────────────────────────────────────────────────────────────▲──────────────┘
                │ events / state                                                 │ voice audio
┌───────────────┴──────────────── Local orchestrator service ────────────────────┴──────────────┐
│  Quest engine · Bundle manager · Agent runner · Permission gate · Journal · Scheduler         │
└──────▲──────────────────────▲──────────────────────────▲───────────────────────▲─────────────┘
       │                      │                          │                       │
  Claude API (chat +     Local system:              Connectors (MCP):       Speech-to-text /
  tool use, agents)      files, apps, browser       calendar, email, CRM,   text-to-speech
  (verify)               automation                 drive, market data      (verify providers)
       └──────────────────────┴───────────────── SQLite + quest files ─────────────────────────┘
```

- **Desktop shell:** a web-tech desktop wrapper (e.g., Tauri or Electron *(verify)*). Tauri is lighter; Electron has more examples. Decide by which one you can ship faster.
- **Orchestrator:** one local service owns all state; the UI never talks to agents directly. This is where the permission gate lives.
- **Integrations via MCP connectors** where they exist, so the same connectors work in Claude chat and in Cockpit *(verify)*.

---

## 6. Build phases

| Phase | Goal | In it | Done when |
|---|---|---|---|
| **0 — Shell** (1–2 weekends) | Prove the loop feels good | Flow skin + focus engine, quests from a markdown file, objectives + complete, bundle opens folders/URLs, **text** chat with Claude | You run pre-market prep through it 5 days straight |
| **1 — Companion** | Make it a buddy | Voice (push-to-talk), orb states wired to real audio, journal + resume point, templates | Setup time measurably lower than baseline |
| **2 — Party** | Background help | Read + Prep agents, approval inbox, audit log, 2–3 connectors | Net time saved > time spent reviewing agent output |
| **3 — OS layer** | Replace the desktop for work | Hotbar panels (Files, Web, Comms), skin switcher, drift check, Act tier with approvals | You stop opening apps outside Cockpit during work |

---

## 7. Hardest parts (in order)
1. **Agent trust.** Prep/Act agents that are reliably right. One bad send and you'll stop using them. Mitigation: tiers + inbox + undo from day one.
2. **Controlling other apps.** Opening a folder or URL is easy; arranging windows and reading what's on screen across apps is hard and OS-specific.
3. **Voice latency and timing.** If the companion takes too long to answer, voice feels worse than typing — measure round-trip early. Equally hard: knowing *when* to talk. A friend who interrupts mid-thought stops feeling like a friend. Check-in timing needs real signals (pauses, step boundaries) and tuning from your dismissals.
4. **Scope.** "OS" can swallow years. Phases above exist to stop that.

## 8. Strongest counter-case
- Existing tools (task managers, launchers, AI desktop agents) each cover a slice *(unverified — needs a search)*. Cockpit's bet is that **one active quest + bundle + companion in one place** beats the slices stitched together. If Phase 0 doesn't beat your current setup on setup time, that bet is wrong.
- Gamification can reward clicking "done" over doing the work. XP counts objectives only, and the weekly review checks whether completions were real.

## 9. First concrete step
Write your pre-market prep as a quest file (title, done-when, objectives, folders, URLs), time your current setup for 3 mornings, then build Phase 0 to run that one quest.
