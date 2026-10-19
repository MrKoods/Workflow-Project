// Runs one FocusEngine for the current quest (CLAUDE.md rule 4: the
// orchestrator owns it; the UI only receives FocusView). Keeps the engine in
// step with the quest file: a quest that already has done steps resumes at
// its first open step, and a step completed some other way (e.g. the chat's
// complete_objective) moves the engine on.
import { FocusEngine, type Beat } from './focusEngine.ts';
import type { FocusView, Quest, Settings } from './types.ts';

export interface FocusOptions {
  /** The step finished: run the Phase 0 complete-objective path. */
  completeStep: () => Promise<unknown>;
  pace?: number;
  typeMs?: number;
}

/** The line a resumed quest opens with, in the quest's voice. */
export function resumeOpener(
  quest: Quest,
  at: number,
  voice: Settings['voice'],
): Beat[] {
  const step = quest.steps[at];
  if (!step) return [];
  const left = quest.resumeNote ? ` You left off: ${quest.resumeNote}.` : '';
  const say =
    voice === 'steady'
      ? `Resuming "${quest.title}".${left} Next step: ${step.title}. Ready when you are.`
      : `Welcome back.${left} Next up: ${step.title}. Ready?`;
  return [{ say }, { replies: [{ label: "Let's go" }] }];
}

export function createFocus({ completeStep, pace, typeMs }: FocusOptions) {
  let engine: FocusEngine | null = null;
  let quest: Quest | null = null;
  let shape = '';
  let ticks: Record<string, number> = {};
  let view: FocusView | null = null;
  const viewListeners = new Set<(v: FocusView | null) => void>();
  const voiceListeners = new Set<(level: number) => void>();

  const publish = () => {
    if (engine && quest) {
      const e = engine;
      const s = e.state();
      view = {
        questId: quest.id,
        mode: e.mode(),
        items: Object.fromEntries(
          Object.keys(quest.items).map((id) => [id, e.itemState(id)]),
        ),
        planets: e.planets(),
        orbitDeg: e.orbitDeg(),
        stepAngle: 360 / quest.steps.length,
        companion: s.companion,
        caption: s.caption,
        log: s.log,
        replies: s.replies,
        ticks,
        stepIndex: s.stepIndex,
        doneSteps: s.doneSteps,
        complete: s.complete,
        waiting: e.waitingForReply(),
      };
    } else view = null;
    for (const fn of viewListeners) fn(view);
  };

  const stopEngine = () => {
    engine?.stop();
    engine = null;
  };

  function begin(q: Quest, voice: Settings['voice']) {
    stopEngine();
    quest = q;
    shape = JSON.stringify([q.intro, q.steps, Object.keys(q.items)]);
    ticks = {};
    const firstOpen = q.objectives.findIndex((o) => !o.done);
    const at = firstOpen < 0 ? q.steps.length : firstOpen;
    const e = new FocusEngine(q.intro, q.steps, {
      pace,
      typeMs,
      onVoiceLevel: (v) => voiceListeners.forEach((fn) => fn(v)),
      onTick: (id) => {
        const item = q.items[id];
        const max = item?.type === 'checklist' ? item.checks.length : 0;
        ticks = { ...ticks, [id]: Math.min(max, (ticks[id] ?? 0) + 1) };
        publish();
      },
      onStepDone: () => void completeStep(),
    });
    engine = e;
    e.subscribe(() => {
      if (engine === e) publish();
    });
    if (at > 0) e.start(at, resumeOpener(q, at, voice));
    else e.start();
  }

  return {
    /**
     * Call with the quest on screen after every state change. Same quest and
     * steps: keep playing (move on if steps were completed elsewhere).
     */
    sync(q: Quest | null, voice: Settings['voice']) {
      if (!q) {
        if (engine) {
          stopEngine();
          quest = null;
          publish();
        }
        return;
      }
      const sameQuest =
        engine &&
        quest?.id === q.id &&
        shape === JSON.stringify([q.intro, q.steps, Object.keys(q.items)]);
      if (sameQuest) {
        quest = q; // fresher resume note etc.
        const done = q.objectives.filter((o) => o.done).length;
        if (done > engine!.state().doneSteps) begin(q, q.voice ?? voice);
        return;
      }
      begin(q, q.voice ?? voice);
    },
    view: () => view,
    onView(fn: (v: FocusView | null) => void) {
      viewListeners.add(fn);
      return () => viewListeners.delete(fn);
    },
    onVoice(fn: (level: number) => void) {
      voiceListeners.add(fn);
      return () => voiceListeners.delete(fn);
    },
    /** Engine is waiting for a reply? */
    waiting: () => !!engine?.waitingForReply(),
    /**
     * Send a reply chip / typed reply to the engine. False when it isn't
     * waiting or the text matches no reply: that goes to Claude instead
     * (Nick, 2026-10-18), and the chips stay up.
     */
    reply(text: string) {
      if (!engine?.matches(text)) return false;
      engine.reply(text);
      return true;
    },
    /** Show the user's own line in the caption (free text that went to Claude). */
    say(text: string) {
      engine?.echo(text);
    },
    /** One short companion line, only if it isn't mid-sentence (e.g. "Copied."). */
    note(line: string) {
      if (engine?.state().companion === 'waiting') engine.run({ say: line });
    },
    /** Live mode (Task 9): run one beat decided outside the script. */
    run(beat: Beat) {
      engine?.run(beat);
    },
    stop() {
      stopEngine();
      viewListeners.clear();
      voiceListeners.clear();
    },
  };
}

export type Focus = ReturnType<typeof createFocus>;
