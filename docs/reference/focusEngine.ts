// Cockpit · Focus engine (reference, framework-agnostic, ported from the design prototype).
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

export type ItemState = 'hero' | 'sup1' | 'sup2' | 'done' | 'off';
export type CompanionState = 'waiting' | 'listening' | 'thinking' | 'speaking' | 'working';
export interface Reply { label: string; answer?: string }      // answer => companion replies, step stays; none => advance
export interface Beat {
  say?: string;              // companion line (typed out; drives voice level)
  focus?: string;            // item id to pop out of the orbit (becomes hero)
  support?: string[];        // up to 2 helper item ids (sup1, sup2)
  tick?: string;             // checklist item id to auto-tick while you work (demo only)
  stepDone?: boolean;        // put current items away, focus returns to the companion, orbit turns
  end?: boolean;             // quest complete
  replies?: Reply[];         // wait for the user; show these as reply chips
}
export interface Step { id: string; title: string; short: string; icon: string; beats: Beat[] }

export interface FocusState {
  stepIndex: number;         // -1 = intro
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

export class FocusEngine {
  private s: FocusState = { stepIndex: -1, hero: 'companion', sup: [], done: [], doneSteps: 0, companion: 'waiting', caption: { who: 'companion', text: '' }, log: [], replies: [], complete: false };
  private listeners: Listener[] = [];
  private timers: number[] = [];
  private waiting: { step: number; beat: number } | null = null;

  constructor(private intro: Beat[], private steps: Step[], private hooks: {
    onVoiceLevel?: (v: number) => void;      // feed BloomRenderer.setVoiceLevel
    onTick?: (itemId: string) => void;       // tick next unchecked box (demo)
    typeMs?: number;                          // typewriter speed per 2 chars (default 30)
  } = {}) {}

  // ---------- public ----------
  subscribe(fn: Listener) { this.listeners.push(fn); fn(this.s); return () => { this.listeners = this.listeners.filter(l => l !== fn); }; }
  start() { this.play(-1, 0); }
  stop() { this.timers.forEach(clearTimeout); this.timers = []; }

  /** User picked a reply chip, or typed/said something. */
  reply(input: string) {
    const w = this.waiting; if (!w) { this.set({ caption: { who: 'you', text: input } }); return; }
    const beat = this.beat(w.step, w.beat); const t = input.toLowerCase();
    let r = beat.replies!.find(x => x.label.toLowerCase() === t)
      ?? beat.replies!.find(x => x.label.toLowerCase().split(/[ ,']/).some(word => word.length > 3 && t.includes(word)));
    if (!r && /\b(yes|yeah|yep|ready|go|done|ok|sure|made|saved|added|verified|in)\b/.test(t)) r = beat.replies![0];
    this.set({ caption: { who: 'you', text: input }, companion: 'listening', replies: [] });
    this.later(900, () => {
      this.set({ companion: 'thinking' });
      this.later(450, () => {
        if (!r) { this.say('Happy to help with that. Say "done" when you are ready to move on.', () => this.set({ replies: beat.replies! })); return; }
        if (r.answer) { this.say(r.answer, () => this.set({ replies: beat.replies! })); return; }
        this.waiting = null; this.play(w.step, w.beat + 1);
      });
    });
  }

  /** Live mode: push a beat decided by Claude (via orchestrator tools). */
  run(beat: Beat) { this.apply(beat, () => {}); }

  // derived values for the UI
  itemState(id: string): ItemState { const s = this.s; return s.hero === id ? 'hero' : s.sup[0] === id ? 'sup1' : s.sup[1] === id ? 'sup2' : s.done.includes(id) ? 'done' : 'off'; }
  mode() { return this.s.hero === 'companion' ? 'm-comp' : 'm-task'; }
  frontIndex() { return Math.min(this.s.doneSteps, this.steps.length - 1); }
  orbitDeg() { return 90 - this.frontIndex() * (360 / this.steps.length); }
  planets() {
    const f = this.frontIndex();
    return this.steps.map((st, k) => ({ k, label: st.short, icon: k < this.s.doneSteps ? '✓' : st.icon,
      state: k < this.s.doneSteps ? 'done' : k === f ? (this.s.hero === 'companion' ? 'upnext' : 'pulled') : 'later' }));
  }

  // ---------- internals ----------
  private beat(step: number, i: number) { return step < 0 ? this.intro[i] : this.steps[step].beats[i]; }
  private beatsOf(step: number) { return step < 0 ? this.intro : this.steps[step].beats; }
  private play(step: number, i: number) {
    if (step >= this.steps.length) return;
    if (i >= this.beatsOf(step).length) { this.play(step + 1, 0); return; }
    if (step !== this.s.stepIndex) this.set({ stepIndex: step });
    const b = this.beat(step, i);
    if (b.replies && !b.say) { this.waiting = { step, beat: i }; this.set({ replies: b.replies, companion: 'waiting' }); return; }
    this.apply(b, () => this.later(700, () => this.play(step, i + 1)));
  }
  private apply(b: Beat, next: () => void) {
    const s = this.s;
    if (b.stepDone) {
      const away = [s.hero, ...s.sup].filter(x => x !== 'companion' && !s.done.includes(x));
      this.set({ done: [...s.done, ...away], hero: 'companion', sup: [], doneSteps: s.doneSteps + 1, complete: !!b.end });
    }
    if (b.focus) this.set({ hero: b.focus, sup: b.support ?? [], done: this.s.done.filter(x => x !== b.focus && !(b.support ?? []).includes(x)) });
    if (b.say) this.say(b.say, () => {
      if (b.tick && this.hooks.onTick) { const id = b.tick; [0, 1, 2].forEach(n => this.later(900 + n * 1100, () => this.hooks.onTick!(id))); this.later(4400, next); }
      else next();
    }); else next();
  }
  private say(line: string, done: () => void) {
    const s = this.s; const log = [...(s.caption.text ? [{ who: s.caption.who === 'you' ? 'You' : 'Companion', text: s.caption.text }] : []), ...s.log].slice(0, 4);
    this.set({ caption: { who: 'companion', text: '' }, companion: 'speaking', log });
    let i = 0; const step = this.hooks.typeMs ?? 30;
    const tick = () => {
      i += 2; const ch = line.charAt(i) || ' ';
      this.hooks.onVoiceLevel?.(/[ ,.—'?!:]/.test(ch) ? 0.18 : 0.45 + Math.random() * 0.55);
      if (i >= line.length) { this.set({ caption: { who: 'companion', text: line } }); this.later(500, () => { this.set({ companion: 'waiting' }); done(); }); return; }
      this.set({ caption: { who: 'companion', text: line.slice(0, i) } }); this.later(step, tick);
    };
    this.later(step, tick);
  }
  private later(ms: number, fn: () => void) { this.timers.push(window.setTimeout(fn, ms)); }
  private set(p: Partial<FocusState>) { this.s = { ...this.s, ...p }; this.listeners.forEach(l => l(this.s)); }
}
