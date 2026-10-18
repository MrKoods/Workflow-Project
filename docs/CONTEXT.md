# Project Context: AI Buddy Workspace (working name: "Cockpit")

> Starting-point context file. Status: idea stage, nothing built yet. Last updated 2026-10-17.
> Labels: **FACT** = verified · **INFERENCE** = reasoned from facts · **SPECULATION** = untested idea.

---

## 1. One-line pitch
A desktop app where an AI partner sits at the center of the screen talking with you, your one current task is shown so you can't miss it, and agents keep the surrounding context (folders, websites, files, next steps) prepared so you move from task to task without setup friction.

## 2. The problem it solves
- **Context-switching cost.** Starting a task means finding the right folders, opening the right sites, remembering where you left off. That setup time and the attention loss add up.
- **AI lives in a separate tab.** Today the AI is something you go to, not something working beside you on the task you're doing.
- **No single "what am I doing right now" anchor.** Task lists show everything, which makes it easy to drift.

**Core thesis (SPECULATION):** Throughput goes up mainly from (a) cutting setup and switching cost and (b) a "buddy" or body-doubling effect that keeps you engaged. The visuals support (b); they don't drive (a). If an early version doesn't cut measurable setup time, the visuals won't save it.

## 3. Core experience (the screen)

| Zone | What it shows | Purpose |
|---|---|---|
| **Center: AI presence** | Voice conversation plus a visual that reacts to tone and state (listening, thinking, speaking, waiting on you, agent working) | The buddy. You always know what the AI is doing |
| **Now card** | The ONE current main task, big and obvious, with its "done when…" condition | Anchor. Kills drift |
| **Workflow rail** | Ordered steps for the current task, current step highlighted, one clear "enter" action | Makes the next move obvious |
| **Context panel** | Folders, files, websites, and apps tied to the task, kept current by agents | Removes setup work |
| **Agent feed** | What agents are doing or did in the background, with approve/reject on anything risky | Trust and control |
| **Queue (collapsed)** | Next tasks, hidden until the current one is done or paused | Prevents overwhelm |

## 4. Core concepts (data model draft)
- **Task**: title, goal, done-condition, status, priority, linked workflow, linked context bundle.
- **Workflow**: ordered steps. Each step is either *you do it*, *AI does it*, or *AI preps, you approve*.
- **Context bundle**: the set of folders, files, URLs, and apps that belong to a task. Opening the task opens the bundle.
- **Agent job**: a background action (gather sources, update a file, check a site, draft something) with a permission tier.
- **Session log**: what happened, decisions made, where you left off. Feeds the next session's resume point.

## 5. Agent permission tiers (decide early)
1. **Read-only**: look at files and sites, summarize, suggest. Runs freely.
2. **Prep**: create drafts, open tabs, arrange folders. Runs freely, easy to undo.
3. **Act**: send messages, submit forms, edit important files, anything touching money or accounts. Always asks first.

**INFERENCE:** Trust is the product. One bad autonomous action (wrong email sent, file overwritten) and you'll stop letting it act. Tiers must exist from v0.

## 6. Example workflows to design against
- **Trading session**: Now card = "pre-market prep"; context = watchlist, charts, model files, news sites; agent pre-pulls overnight moves and flags levels for review.
- **Gym sales / CRM**: Now card = "follow up with this week's trial leads"; context = CRM view, message templates; agent drafts follow-ups, you approve sends.
- **Content creation (AI avatar brand)**: Now card = "script episode"; context = script folder, reference links, past episode notes; agent preps outline and research.
- **Job search**: Now card = "tailor resume for X role"; context = resume file, job posting, company site; agent drafts the tailored bullets.

## 7. MVP scope (v0) — deliberately small
**In:**
- Manually create a task with a done-condition and a context bundle (folders + URLs).
- One click opens the full bundle.
- Center voice conversation with state visualization (listening/thinking/speaking/waiting).
- Workflow rail with manual steps; AI can suggest steps.
- Session log + "resume where I left off."

**Out (later):**
- Autonomous agents that act without approval.
- Automatic task detection from email/calendar.
- Multi-device sync.

## 8. Technical sketch (unverified, to be researched)
- Desktop shell: web tech in a desktop wrapper (e.g., Electron or Tauri) so the UI can be built as a web app.
- AI: an LLM API for conversation and agent planning; tool/function calling for agent actions.
- Voice: speech-to-text + text-to-speech; tone visualization driven by audio amplitude and conversation state, not real emotion detection at first.
- Context: local folder access + browser automation for websites.
- Storage: local database (e.g., SQLite) for tasks, bundles, logs.
- **All specific product capabilities, pricing, and limits above are unverified. Check current docs before choosing.**

## 9. The hardest parts (name them early)
1. **Agent reliability and trust.** Getting agents to do the right thing, every time, with safe permissions.
2. **Knowing the "current task" accurately.** If the app's idea of what you're doing is wrong, it becomes noise.
3. **Voice-first without being distracting.** A talking UI can interrupt flow as easily as help it.
4. **Scope creep.** This idea can expand into "rebuild the operating system." v0 must stay small.

## 10. Strongest counter-case
- **Overlap with existing tools (unverified, needs a search):** AI task planners, launchers, and agent desktops already exist. Need to check what's out there before building and define the one thing this does better.
- **Visuals may be decoration.** A reactive orb is satisfying for a week; if it doesn't change behavior, it's cost without return.
- **Autonomy may not save time yet.** If you have to review every agent action, net time saved could be near zero or negative.
- **Builder risk:** building a productivity tool can become the procrastination. It needs to earn its place against simply using existing tools with discipline.

## 11. Approaches not yet considered
- **Test the buddy before the agents (SPECULATION).** Build only the center presence + Now card + resume log. If that alone raises output, agents become a bonus, not the foundation. Cheap to build, isolates the core thesis.
- **Task as a "launch file."** Each task is a single file (e.g., JSON/markdown) that defines its bundle and steps. Opening it rebuilds the workspace. Works without a custom app at first, is easy to version, and AI can write these files. Risk: feels less magical; may not stick without the UI.
- **Overlay instead of full app.** A thin always-on-top panel over your existing tools instead of a full replacement environment. Less to build, fits current habits. Risk: less control over layout and focus.

## 12. How to test it (falsifiable)
| Experiment | Measure | Kill / pivot condition |
|---|---|---|
| Time setup cost today vs. with context bundles (1 week each) | Minutes from "decide to start" to "actually working" | Less than ~30% reduction → bundles aren't the win |
| Buddy-only prototype (no agents) for 1 week | Tasks completed per day vs. baseline week | No change → the presence/visual layer isn't worth heavy investment |
| Agent prep on one recurring workflow (e.g., pre-market prep) | Time saved minus time spent reviewing agent output | Net ≤ 0 → keep agents read-only for now |
| Voice vs. text interaction for a week each | Self-rated interruptions + tasks done | Voice worse → make voice optional, not central |

## 13. Open questions
- Desktop only, or also phone?
- Which workflow is the first real test case? (Recommend one recurring daily workflow.)
- How much should the AI talk unprompted vs. only when asked?
- Where do tasks come from: manual entry only, or pulled from calendar/email/CRM later?
- Build solo or use existing frameworks as much as possible?

## 14. First concrete step
Pick ONE recurring workflow, write it out as a launch file (task, done-condition, steps, folders, URLs), and time how long setup takes today. That gives the baseline every later version is measured against.

## 15. Visual language (added 2026-10-17)
**Principle: light is the navigation.** The screen is dark; the brightest thing is always where your attention should be. Nothing competes with it.

| Rule | How it shows up |
|---|---|
| Dark ground, bright features | Near-black base (#07080B); only the focused zone is fully lit |
| One warm light = your task | Amber (#FFB547) is reserved for the Now card, current step and the primary action. If it's amber, it's yours to do |
| One cool light = the AI | Cyan (#6FE3FF) is the AI's color. When the AI hands the turn to you, its orb shifts to amber: the color change *is* the handoff signal |
| Light moves with focus | A soft light pool glides to whichever zone is active; the other zones dim and recede slightly |
| Depth, not boxes | The center stage tilts with the cursor; the orb floats in front of the task card; a perspective floor grid gives the room depth |
| Motion carries meaning | Orb states: listening (slow breathe), thinking (rings spin fast), speaking (core pulses with voice), waiting (amber, still), agents working (dashed orbiting rings). Motion is never just decoration |
| Calm mode | Every animation has an off switch; respects the OS reduced-motion setting |

**Risk (INFERENCE):** constant motion competes with the task it's meant to highlight. Rule of thumb: only one thing moves noticeably at a time, and idle motion stays under the threshold of attention.
**Test:** run a week with full motion and a week in calm mode; if tasks/day or self-rated focus doesn't drop in calm mode, cut the motion back.

Prototype: "Cockpit Visual Direction" design canvas (interactive).
