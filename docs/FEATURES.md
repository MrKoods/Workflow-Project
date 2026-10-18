# Cockpit — Features & How It Works

> Working spec v0.1, 2026-10-17. Supersedes CONTEXT.md §3 (screen zones), §4 (data model) and §7 (MVP scope).
> Labels: **FACT** = verified · **INFERENCE** = reasoned · **SPECULATION** = untested idea. Product/tool specifics marked *(verify)* have not been checked against current docs.

---

## 0. Decisions log
- 2026-10-18 (later) — **Orbit is the layout.** Quest steps orbit the companion (Bloom); the current step pops out of the orbit as the center card; done steps tuck back in with ✓; the orbit turns so the next step is always at the front. **Skins are color palettes only** (7: Aqua default, Ember, Nebula, Aurora, Frost, Crimson, Eclipse), switched live. Flow / Tech HUD / Portal archived. Phase 0 is complete; next build doc is ORBIT-UPGRADE.md.
- 2026-10-18 — **Layout = focus follows the workflow** (replaces the fixed Quest HUD). One spotlit thing at a time: companion + task on open; on "yes" the needed item (link, page, draft, checklist) takes center, companion docks but keeps talking; done items get put away; between steps focus returns to the companion for one beat. **Skins:** Flow (default), Tech HUD, Portal — same engine, see SKINS.md. **Voice** (Steady / Playful) is a separate setting from skin; default Playful.
- 2026-10-17 — **Quest Forge:** quests are created by talking to the companion (draft card → edit → Accept writes the file). Hand-editing quest files stays possible but is never required. Built in Phase 0 as Task 5b.
- 2026-10-17 — **Windows** desktop app. **Wake word** for voice (push-to-talk fallback). **First workflow:** Fiverr gig page for AI automation (see CONNECTORS.md). Connectors chosen per workflow, not up front.

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
JournalEntry id, questId?, kind(start|objective|decision|agent|summary), text, at
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
