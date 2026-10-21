// Cockpit · Focus engine (ported from docs/reference/focusEngine.ts).
// It owns ONE thing: what has the spotlight right now. The UI only maps its state to CSS classes.
//
//   mode        'm-comp' (companion has focus) | 'm-task' (an item has focus)
//   items[id]   'hero' | 'sup1' | 'sup2' | 'done' | 'off'
//   planets[k]  'later' | 'upnext' | 'pulled' | 'done'     (one planet per quest step)
//   orbitDeg    rotation that brings the current/next step to the front of the orbit
//   companion   'waiting' | 'listening' | 'thinking' | 'speaking' | 'working'
//
// Two ways to feed it beats:
//   1) Scripted (Phase 0.5): beats come from the quest file (see demo-quest.md).
//   2) Live (next): Claude calls orchestrator tools (focus_item, support_items, complete_step,
//      offer_replies, say) and the orchestrator turns each call into a beat via engine.run(beat).
//
// Port changes (marked "port:"): runs in the main process, so Node timers instead of window.*;
// Beat/Step/Reply types live in types.ts (shared with quest files and the UI); start(fromStep)
// for resumed quests; onStepDone hook (the orchestrator's complete-objective path); pace
// multiplier on every delay (tests); waitingForReply() and state() getters.

import type {
  Beat,
  FocusCompanionState,
  FocusMode,
  ItemState,
  PlanetView,
  Reply,
  Step,
} from './types.ts';

export type { Beat, Reply, Step };
export type CompanionState = FocusCompanionState;

export interface FocusState {
  stepIndex: number; // -1 = intro
  hero: string | 'companion';
  sup: string[];
  done: string[];
  doneSteps: number;
  companion: CompanionState;
  caption: { who: 'companion' | 'you'; text: string };
  log: { who: string; text: string }[];
  replies: Reply[];
  complete: boolean;
}

type Listener = (s: FocusState) => void;

export interface FocusHooks {
  onVoiceLevel?: (v: number) => void; // feed BloomRenderer.setVoiceLevel
  onTick?: (itemId: string) => void; // tick next unchecked box (demo)
  onStepDone?: (stepIndex: number, end: boolean) => void; // port: complete-objective path
  typeMs?: number; // typewriter speed per 2 chars (default 30)
  pace?: number; // port: multiplies every delay (default 1; tests use less)
  voice?: (mode: FocusMode) => 'steady' | 'playful'; // port: picks say vs steady wording
  speak?: (line: string) => Promise<void>; // port (Phase 1): a line ends when its audio does
}

/** A line that asks Echo to do something, not a "yes" to the chip on screen. */
const COMMAND =
  /\b(back|open|close|switch|turn|change|use|set|untick|tick|uncheck|check|minimi[sz]e|maximi[sz]e|restore|show|hide|start|pause|resume|archive|skip|undo|step|steps|settings|skin|layout|face|journal|log|window|orbit|hud|calm)\b|\d/;

export class FocusEngine {
  private s: FocusState = {
    stepIndex: -1,
    hero: 'companion',
    sup: [],
    done: [],
    doneSteps: 0,
    companion: 'waiting',
    caption: { who: 'companion', text: '' },
    log: [],
    replies: [],
    complete: false,
  };
  private listeners: Listener[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private waiting: { step: number; beat: number } | null = null;
  // port: a one-off opener (e.g. "Welcome back") played before a resumed step.
  private opener: Beat[] = [];

  // port: plain fields, not constructor parameter properties (Node's type
  // stripping, used by `npm test`, doesn't support those).
  private intro: Beat[];
  private steps: Step[];
  private hooks: FocusHooks;

  constructor(intro: Beat[], steps: Step[], hooks: FocusHooks = {}) {
    this.intro = intro;
    this.steps = steps;
    this.hooks = hooks;
  }

  // ---------- public ----------
  subscribe(fn: Listener) {
    this.listeners.push(fn);
    fn(this.s);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
  /** port: fromStep > 0 resumes there (earlier steps count as done); `opener` plays first. */
  start(fromStep = 0, opener: Beat[] = []) {
    if (fromStep > 0) {
      this.set({ doneSteps: Math.min(fromStep, this.steps.length) });
      this.opener = opener;
      this.play(-2, 0, fromStep);
    } else this.play(-1, 0);
  }
  stop() {
    this.gen++; // port: speech that finishes after stop() is ignored
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
  state() {
    return this.s;
  }
  /** port: true while reply chips are up and a reply moves the script on. */
  waitingForReply() {
    return this.waiting !== null;
  }

  /** port: which reply chip `input` means, if any (matching split out of reply()). */
  private match(beat: Beat, input: string): Reply | undefined {
    const t = input.toLowerCase();
    const bare = (s: string) => s.replace(/[^\p{L}\p{N}' ]+/gu, ' ').trim();
    const words = bare(t).split(/\s+/).filter(Boolean);
    // port: partial matches only for short replies, and every significant
    // word of the chip must be there ("give me three quick tips…" is a
    // question for Claude, not "Give me a sec").
    const short = words.length <= 5;
    const r =
      beat.replies!.find((x) => bare(x.label.toLowerCase()) === bare(t)) ??
      (short
        ? beat.replies!.find((x) => {
            const key = bare(x.label.toLowerCase())
              .split(/[ ']/)
              .filter((w) => w.length > 3);
            return key.length > 0 && key.every((w) => words.includes(w));
          })
        : undefined);
    if (r) return r;
    // port: a question or a long sentence is never a generic "yes", and nor
    // is a request to Echo ("go back to step 2" is not "Let's go"; Nick,
    // 2026-10-20): it names an action, a step, or a part of Cockpit.
    if (
      !t.includes('?') &&
      words.length <= 8 &&
      !COMMAND.test(t) &&
      /\b(yes|yeah|yep|ready|go|done|ok|sure|made|saved|added|verified|in)\b/.test(
        t,
      )
    )
      return beat.replies![0];
  }

  /** port: would reply(input) move the script on or answer it from the script? */
  matches(input: string) {
    const w = this.waiting;
    return !!w && !!this.match(this.beat(w.step, w.beat), input);
  }

  /** port: show the user's line as the caption without consuming it (it went to Claude). */
  echo(input: string) {
    this.set({ caption: { who: 'you', text: input } });
  }

  /** User picked a reply chip, or typed/said something. */
  reply(input: string) {
    const w = this.waiting;
    if (!w) {
      this.set({ caption: { who: 'you', text: input } });
      return;
    }
    const beat = this.beat(w.step, w.beat);
    const r = this.match(beat, input);
    // port: cleared before set() so listeners see it, and so a second reply
    // during the pause below can't advance twice.
    this.waiting = null;
    this.set({
      caption: { who: 'you', text: input },
      companion: 'listening',
      replies: [],
    });
    // port (Phase 1 Task 5): was 900 + 450 ms of acted "listening / thinking";
    // with real speech the listening already happened, so it was dead air
    // (scripted replies measured 1.7 s to the first word).
    this.later(100, () => {
      this.set({ companion: 'thinking' });
      this.later(50, () => {
        if (!r) {
          this.say(
            'Happy to help with that. Say "done" when you are ready to move on.',
            () => this.wait(w, beat),
          );
          return;
        }
        if (r.answer) {
          this.say(r.answer, () => this.wait(w, beat));
          return;
        }
        this.play(w.step, w.beat + 1);
      });
    });
  }

  /** Live mode: push a beat decided by Claude (via orchestrator tools). */
  run(beat: Beat) {
    // port: apply() only knows support with a focus, and replies only inside
    // the script. Live: helpers alone swap the helpers; live chips just show
    // (a chip that isn't a script reply goes to Claude as the user's answer).
    if (beat.support && !beat.focus) this.set({ sup: beat.support });
    if (beat.replies && !beat.say) {
      this.set({ replies: beat.replies, companion: 'waiting' });
      return;
    }
    this.apply(beat, () => {
      if (beat.replies) this.set({ replies: beat.replies });
    });
  }

  // derived values for the UI
  itemState(id: string): ItemState {
    const s = this.s;
    return s.hero === id
      ? 'hero'
      : s.sup[0] === id
        ? 'sup1'
        : s.sup[1] === id
          ? 'sup2'
          : s.done.includes(id)
            ? 'done'
            : 'off';
  }
  mode(): FocusMode {
    return this.s.hero === 'companion' ? 'm-comp' : 'm-task';
  }
  frontIndex() {
    return Math.min(this.s.doneSteps, this.steps.length - 1);
  }
  orbitDeg() {
    return 90 - this.frontIndex() * (360 / this.steps.length);
  }
  planets(): PlanetView[] {
    const f = this.frontIndex();
    return this.steps.map((st, k) => ({
      k,
      label: st.short,
      icon: k < this.s.doneSteps ? '✓' : st.icon,
      state:
        k < this.s.doneSteps
          ? 'done'
          : k === f
            ? this.s.hero === 'companion'
              ? 'upnext'
              : 'pulled'
            : 'later',
    }));
  }

  // ---------- internals ----------
  // port: step -2 = the resume opener, which then continues at `resumeAt`.
  private resumeAt = 0;
  private beat(step: number, i: number) {
    return this.beatsOf(step)[i];
  }
  private beatsOf(step: number) {
    return step === -2
      ? this.opener
      : step < 0
        ? this.intro
        : this.steps[step].beats;
  }
  private wait(w: { step: number; beat: number }, beat: Beat) {
    this.waiting = w;
    this.set({ replies: beat.replies!, companion: 'waiting' });
  }
  private play(step: number, i: number, resumeAt?: number) {
    if (resumeAt !== undefined) this.resumeAt = resumeAt;
    if (step >= this.steps.length) return;
    if (i >= this.beatsOf(step).length) {
      this.play(step === -2 ? this.resumeAt : step + 1, 0);
      return;
    }
    if (step !== this.s.stepIndex && step !== -2) this.set({ stepIndex: step });
    const b = this.beat(step, i);
    if (b.replies && !b.say) {
      this.wait({ step, beat: i }, b);
      return;
    }
    this.apply(b, () => this.later(700, () => this.play(step, i + 1)));
  }
  private apply(b: Beat, next: () => void) {
    const s = this.s;
    if (b.stepDone) {
      const away = [s.hero, ...s.sup].filter(
        (x) => x !== 'companion' && !s.done.includes(x),
      );
      this.set({
        done: [...s.done, ...away],
        hero: 'companion',
        sup: [],
        doneSteps: s.doneSteps + 1,
        complete: !!b.end,
      });
      this.hooks.onStepDone?.(this.s.doneSteps - 1, !!b.end);
    }
    if (b.focus)
      this.set({
        hero: b.focus,
        sup: b.support ?? [],
        done: this.s.done.filter(
          (x) => x !== b.focus && !(b.support ?? []).includes(x),
        ),
      });
    if (b.say)
      this.say(this.wording(b), () => {
        if (b.tick && this.hooks.onTick) {
          const id = b.tick;
          [0, 1, 2].forEach((n) =>
            this.later(900 + n * 1100, () => this.hooks.onTick!(id)),
          );
          this.later(4400, next);
        } else next();
      });
    else next();
  }
  /** port: the beat's steady wording when the voice in use is steady. */
  private wording(b: Beat) {
    return b.steady && this.hooks.voice?.(this.mode()) === 'steady'
      ? b.steady
      : b.say!;
  }
  private gen = 0;
  private say(line: string, done: () => void) {
    const s = this.s;
    // port (Phase 1): speak while the caption types; the line is over when
    // both are done (the audio usually takes longer).
    const spoken = this.hooks.speak?.(line);
    const gen = this.gen;
    const log = [
      ...(s.caption.text
        ? [
            {
              who: s.caption.who === 'you' ? 'You' : 'Companion',
              text: s.caption.text,
            },
          ]
        : []),
      ...s.log,
    ].slice(0, 4);
    this.set({
      caption: { who: 'companion', text: '' },
      companion: 'speaking',
      log,
    });
    let i = 0;
    const step = this.hooks.typeMs ?? 30;
    const tick = () => {
      i += 2;
      const ch = line.charAt(i) || ' ';
      this.hooks.onVoiceLevel?.(
        /[ ,.—'?!:]/.test(ch) ? 0.18 : 0.45 + Math.random() * 0.55,
      );
      if (i >= line.length) {
        this.set({ caption: { who: 'companion', text: line } });
        const finish = () => {
          this.set({ companion: 'waiting' });
          done();
        };
        if (spoken)
          void spoken.then(() => {
            if (gen === this.gen) this.later(250, finish);
          });
        else this.later(500, finish);
        return;
      }
      this.set({ caption: { who: 'companion', text: line.slice(0, i) } });
      this.later(step, tick);
    };
    this.later(step, tick);
  }
  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms * (this.hooks.pace ?? 1)));
  }
  private set(p: Partial<FocusState>) {
    this.s = { ...this.s, ...p };
    this.listeners.forEach((l) => l(this.s));
  }
}
