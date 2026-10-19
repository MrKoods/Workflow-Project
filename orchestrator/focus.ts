// Runs one FocusEngine for the current quest (CLAUDE.md rule 4: the
// orchestrator owns it; the UI only receives FocusView). Keeps the engine in
// step with the quest file: a quest that already has done steps resumes at
// its first open step, and a step completed some other way (e.g. the chat's
// complete_objective) moves the engine on.
import { FocusEngine, type Beat } from './focusEngine.ts';
import type {
  FocusMode,
  FocusView,
  Quest,
  Settings,
  VoiceNow,
} from './types.ts';

/** Settings choice wins unless it is auto; then the quest's voice; auto follows the mode. */
export function voiceFor(
  setting: Settings['voice'],
  quest: Quest | null,
  mode: FocusMode,
): VoiceNow {
  const v = setting !== 'auto' ? setting : (quest?.voice ?? 'auto');
  return v === 'auto' ? (mode === 'm-task' ? 'steady' : 'playful') : v;
}

export interface FocusOptions {
  /** The step finished: run the Phase 0 complete-objective path. */
  completeStep: () => Promise<unknown>;
  pace?: number;
  typeMs?: number;
  /** Speak a line in the voice in use (Phase 1); resolves when heard. */
  speak?: (line: string, voice: VoiceNow) => Promise<void>;
}

/** The line a resumed quest opens with, in the quest's voice. */
export function resumeOpener(
  quest: Quest,
  at: number,
  voice: VoiceNow,
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

/** The chip shown while looking at another step. */
export const BACK_LABEL = 'Back to current step';

/** The items a step puts on screen: its first focus beat (hero + helpers). */
export function stepItems(step: Quest['steps'][number]) {
  const b = step.beats.find((x) => x.focus);
  return b ? { hero: b.focus!, sup: b.support ?? [] } : null;
}

/**
 * The view while looking at step `k`: the orbit turns to it, its cards pop
 * out (done checklists show ticked), and one chip goes back. Everything else
 * stays as the live script left it.
 */
export function peekView(live: FocusView, quest: Quest, k: number): FocusView {
  const step = quest.steps[k];
  const shown = stepItems(step);
  const items: FocusView['items'] = {};
  for (const [id, state] of Object.entries(live.items)) {
    items[id] =
      shown?.hero === id
        ? 'hero'
        : shown?.sup[0] === id
          ? 'sup1'
          : shown?.sup[1] === id
            ? 'sup2'
            : state === 'done'
              ? 'done'
              : 'off';
  }
  const done = k < live.doneSteps;
  const ticks = { ...live.ticks };
  if (done && shown)
    for (const id of [shown.hero, ...shown.sup]) {
      const item = quest.items[id];
      if (item?.type === 'checklist') ticks[id] = item.checks.length;
    }
  const text = done
    ? `Step ${k + 1}: ${step.title}. Done ✓${shown ? ' Everything from it is here if you need it.' : ''}`
    : `Step ${k + 1}: ${step.title}. Coming up.${shown ? ' Have a look; we finish steps in order.' : ''}`;
  return {
    ...live,
    mode: shown ? 'm-task' : 'm-comp',
    items,
    ticks,
    orbitDeg: 90 - k * live.stepAngle,
    companion: 'waiting',
    caption: { who: 'companion', text },
    replies: [{ label: BACK_LABEL }],
    waiting: false,
    peek: k,
  };
}

export function createFocus({
  completeStep,
  pace,
  typeMs,
  speak,
}: FocusOptions) {
  let engine: FocusEngine | null = null;
  let quest: Quest | null = null;
  let shape = '';
  let ticks: Record<string, number> = {};
  let view: FocusView | null = null;
  let voiceSetting: Settings['voice'] = 'auto';
  const voiceNow = (): VoiceNow =>
    voiceFor(voiceSetting, quest, engine?.mode() ?? 'm-comp');
  // Swap (Nick, 2026-10-18): look at another step on the orbit. View and use
  // only: the script keeps its place and steps still finish in order.
  let peek: number | null = null;
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
        voice: voiceNow(),
        peek: null,
      };
      if (peek !== null) view = peekView(view, quest, peek);
    } else view = null;
    for (const fn of viewListeners) fn(view);
  };

  const stopEngine = () => {
    engine?.stop();
    engine = null;
  };

  function begin(q: Quest) {
    stopEngine();
    quest = q;
    peek = null;
    shape = JSON.stringify([q.intro, q.steps, Object.keys(q.items)]);
    ticks = {};
    const firstOpen = q.objectives.findIndex((o) => !o.done);
    const at = firstOpen < 0 ? q.steps.length : firstOpen;
    const e: FocusEngine = new FocusEngine(q.intro, q.steps, {
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
      voice: (mode) => voiceFor(voiceSetting, q, mode),
      speak: speak
        ? (line) => speak(line, voiceFor(voiceSetting, q, e.mode()))
        : undefined,
    });
    engine = e;
    e.subscribe(() => {
      if (engine === e) publish();
    });
    // The opener is spoken with the companion in focus.
    if (at > 0)
      e.start(at, resumeOpener(q, at, voiceFor(voiceSetting, q, 'm-comp')));
    else e.start();
  }

  return {
    /**
     * Call with the quest on screen after every state change. Same quest and
     * steps: keep playing (move on if steps were completed elsewhere).
     */
    sync(q: Quest | null, voice: Settings['voice']) {
      const voiceChanged = voice !== voiceSetting;
      voiceSetting = voice;
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
        if (done > engine!.state().doneSteps) begin(q);
        else if (voiceChanged) publish();
        return;
      }
      begin(q);
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
    /**
     * Swap: 'prev' / 'next' move one step around the orbit, a number jumps to
     * that step, 'current' goes back. Landing on the live step ends the swap.
     */
    peekStep(target: number | 'prev' | 'next' | 'current') {
      if (!engine || !quest) return;
      const n = quest.steps.length;
      const live = engine.frontIndex();
      const from = peek ?? live;
      const to =
        target === 'current'
          ? live
          : target === 'prev'
            ? from - 1
            : target === 'next'
              ? from + 1
              : target;
      if (!Number.isInteger(to) || to < 0 || to >= n) return;
      const next = to === live ? null : to;
      if (next === peek) return;
      peek = next;
      publish();
    },
    /** Engine is waiting for a reply? */
    waiting: () => !!engine?.waitingForReply(),
    /**
     * Send a reply chip / typed reply to the engine. False when it isn't
     * waiting or the text matches no reply: that goes to Claude instead
     * (Nick, 2026-10-18), and the chips stay up.
     */
    reply(text: string) {
      if (peek !== null) {
        // Any reply ends the swap; the chip itself only goes back.
        peek = null;
        publish();
        if (text === BACK_LABEL) return true;
      }
      if (!engine?.matches(text)) return false;
      engine.reply(text);
      return true;
    },
    /** Show the user's own line in the caption (free text that went to Claude). */
    say(text: string) {
      engine?.echo(text);
    },
    /** One short companion line, only if it isn't mid-sentence (e.g. "Copied."). */
    note(playful: string, steady = playful) {
      if (engine?.state().companion === 'waiting')
        engine.run({ say: voiceNow() === 'steady' ? steady : playful });
    },
    /** The voice in use right now. */
    voiceNow,
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
