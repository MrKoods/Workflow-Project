// The Orbit screen (ORBIT-UPGRADE Task 5). Structure follows
// docs/reference/markup-snapshot.html; state comes from the orchestrator's
// focus engine (FocusView) and snapshots. Elements are built once and only
// their classes / CSS variables change, so orbit.css does all the motion.
import type {
  ChatEvent,
  CockpitApi,
  CockpitSnapshot,
  FocusCompanionState,
  TalkStateView,
  FocusView,
  Quest,
} from '../../orchestrator/types';
import { h } from '../panels/dom';
import { createForgeCard } from '../panels/forge';
import { createJournalPanel } from '../panels/journal';
import { createQuestLog } from '../panels/questLog';
import type { SettingsPanel } from '../settings';
import { pressed } from '../keys';
import type { TalkControl } from '../voice/talk';
import { createItemCard, type ItemCard } from './items';

const STATE_LABEL: Record<FocusCompanionState, string> = {
  waiting: 'Your move',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  working: 'Working',
};
export const COMPANION_STATES = Object.keys(
  STATE_LABEL,
) as FocusCompanionState[];
const PLANET_LABEL = {
  later: 'Later',
  upnext: 'Up next',
  pulled: 'In progress',
  done: 'Done',
} as const;

export interface OrbitHooks {
  /** Bloom (Task 6) mounts its canvas here and follows the companion state. */
  onCompanion?: (state: FocusCompanionState) => void;
  /** Voice level pulses while Claude's reply streams in (feeds Bloom). */
  onVoice?: (level: number) => void;
  /** Push-to-talk control (the Talk button toggles it). */
  talk?: TalkControl;
  /** Is the companion's voice playing right now? */
  speaking?: () => boolean;
  /** The companion line on screen while it speaks (the hologram's mouth follows it). */
  onLine?: (text: string) => void;
}

export function mountOrbit(
  root: HTMLElement,
  api: CockpitApi,
  initial: CockpitSnapshot,
  initialView: FocusView | null,
  settings: SettingsPanel,
  hooks: OrbitHooks = {},
) {
  let snap = initial;
  let view = initialView;
  let debugState: FocusCompanionState | null = null; // F2 cycles (debug)
  // Claude's reply (free text that wasn't a script reply) shows as the
  // companion caption until the engine says something new (`under` is the
  // engine caption it covers). A pending confirmation replaces the chips.
  let chat: {
    text: string;
    state: FocusCompanionState;
    under: string;
    confirm?: { id: string };
  } | null = null;

  // ---- static structure ------------------------------------------------
  const title = h('b');
  const xp = h('span', { class: 'xpx' });
  const canvas = h('canvas', { class: 'mol' });
  const comp = h('div', { class: 'comp', attrs: { role: 'img' } }, [canvas]);
  const rings = [h('div', { class: 'ring' }), h('div', { class: 'ring r2' })];
  const motes = Array.from({ length: 12 }, (_, j) =>
    h('i', { class: 'mote', vars: { '--j': String(j) } }),
  );
  const orbit = h(
    'div',
    { class: 'orbit', attrs: { 'aria-label': 'Quest steps in orbit' } },
    [...rings, ...motes],
  );
  const who = h('div', { class: 'who3' });
  const line = h('div', { class: 'ln3' });
  const caret = h('span', { class: 'caret', attrs: { 'aria-hidden': 'true' } });
  const capx = h('div', { class: 'capx', attrs: { 'aria-live': 'polite' } }, [
    who,
    line,
  ]);
  const chips = h('div', { class: 'chipsx' });
  const say = h('input', {
    attrs: {
      id: 'sayOrb',
      type: 'text',
      maxlength: '8000',
      autocomplete: 'off',
      placeholder: 'Talk to me… (try “yeah” or “done”)',
    },
  });
  // Push-to-talk: the button toggles; Right Ctrl (hold) and Ctrl+Alt+V do too.
  const micBtn = h('button', {
    class: 'mic',
    text: 'Talk',
    attrs: {
      type: 'button',
      title: 'Hold Right Ctrl to talk, or tap Ctrl+Alt+V from any app',
      'aria-keyshortcuts': 'Control+Alt+V',
    },
    on: { click: () => hooks.talk?.toggle() },
  });
  const sayForm = h('form', { class: 'sayx' }, [
    h('label', { text: 'Say', attrs: { for: 'sayOrb' } }),
    say,
    micBtn,
    h('button', { class: 'send', text: 'Send', attrs: { type: 'submit' } }),
  ]);
  let talkState: TalkStateView = { phase: 'idle', partial: '' };
  const talking = () => talkState.phase !== 'idle' || !!hooks.talk?.active;
  sayForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = say.value.trim();
    if (!text) return;
    say.value = '';
    void api.reply(text);
  });

  // ---- Tech HUD frame (layout 'hud'): decorative modules, hidden in Orbit --
  const modLabel = (text: string) => h('span', { class: 'ml', text });
  const modState = h('span', { class: 'mr' });
  const modStep = h('span', { class: 'mr' });
  const modDone = h('span', { class: 'mr' });
  const viewTask = h('span', { class: 'vl2' });
  const hudFrame = [
    h('div', { class: 'mod m1' }, [modLabel('01 · Companion'), modState]),
    h('div', { class: 'mod m2' }, [
      modLabel('02 · Comms'),
      h('span', { class: 'mr', text: 'live' }),
    ]),
    h('div', { class: 'mod view' }, [
      h('span', { class: 'ml' }, [
        h('span', { class: 'vl1', text: 'Focus · companion' }),
        viewTask,
      ]),
      modStep,
    ]),
    h('div', { class: 'mod m3' }, [modLabel('03 · Handed to you')]),
    h('div', { class: 'mod m4' }, [modLabel('04 · Completed'), modDone]),
  ];
  hudFrame.forEach((m) => m.setAttribute('aria-hidden', 'true'));
  const logx = h('div', {
    class: 'logx',
    attrs: { 'aria-label': 'Conversation' },
  });

  // ---- Phase 0 extras, restyled (decision 2026-10-18) -------------------
  const notice = h('div', { class: 'noticex', attrs: { hidden: '' } });
  const forge = createForgeCard({
    accept: (draft, start) => api.acceptDraft(draft, start),
    discard: () => void api.discardDraft(),
  });
  let chatBusy = false;
  const journal = createJournalPanel({
    close: () => toggleJournal(false),
    endSession: () => void api.endSession(),
  });
  const refreshJournal = async () => {
    if (journal.open) journal.render(await api.getJournal(), snap, chatBusy);
  };
  const toggleJournal = (open = !journal.open) => {
    journal.setOpen(open);
    if (open) log.update(snap.queue, (logOpen = false), canActivate());
    void refreshJournal();
  };
  let logOpen = false;
  const canActivate = () => snap.current?.status !== 'active';
  const log = createQuestLog(
    () => {
      logOpen = !logOpen;
      if (logOpen) journal.setOpen(false);
      log.update(snap.queue, logOpen, canActivate());
    },
    (id) => {
      logOpen = false;
      void api.activateQuest(id);
    },
  );
  const [logToggle, logList] = log.els;

  const pauseNote = h('input', {
    class: 'field',
    attrs: {
      maxlength: '500',
      autocomplete: 'off',
      placeholder: 'Where did you leave off? (optional)',
      'aria-label': 'Where did you leave off?',
    },
  });
  const pauseForm = h('form', { class: 'pausex', attrs: { hidden: '' } }, [
    pauseNote,
    h('button', { class: 'pl', text: 'Pause', attrs: { type: 'submit' } }),
    h('button', {
      class: 'pl',
      text: 'Cancel',
      attrs: { type: 'button' },
      on: { click: () => (pauseForm.hidden = true) },
    }),
  ]);
  pauseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    pauseForm.hidden = true;
    void api.pauseQuest(pauseNote.value);
  });

  const btn = (text: string, onClick: () => void) =>
    h('button', {
      class: 'pl',
      text,
      attrs: { type: 'button' },
      on: { click: onClick },
    });
  const pauseBtn = btn('Pause', () => {
    pauseForm.hidden = !pauseForm.hidden;
    pauseNote.value = '';
    if (!pauseForm.hidden) pauseNote.focus();
  });
  const bundleBtn = btn('Open bundle', () => void api.openBundle());
  const nextBtn = btn('Next quest', () => void api.startNextQuest());
  const journalBtn = btn('Journal', () => toggleJournal());
  const settingsBtn = btn('Settings', () => settings.toggle());
  logToggle.classList.add('pl');

  const ctrl = h('div', { class: 'ctrlx' }, [
    xp,
    nextBtn,
    bundleBtn,
    pauseBtn,
    logToggle,
    journalBtn,
    settingsBtn,
  ]);

  // "I'm working" chip while the setup timer runs (Phase 0 Task 7 metric).
  const workingChip = h('button', {
    class: 'chp working',
    attrs: { type: 'button', 'aria-keyshortcuts': 'W' },
    on: { click: () => void api.markWorking() },
  });
  let timerTick = 0;

  const fx = h('div', { class: 'fx orbt m-comp s-waiting' }, [
    h('div', { class: 'stars', attrs: { 'aria-hidden': 'true' } }),
    ...hudFrame,
    h('div', { class: 'topr2' }, [
      h('div', { class: 'q' }, ['Today’s quest', title]),
      ctrl,
    ]),
    orbit,
    h('div', { class: 'tether', attrs: { 'aria-hidden': 'true' } }),
    comp,
    logx,
    capx,
    chips,
    sayForm,
    notice,
    pauseForm,
    logList,
    journal.el,
    forge.el,
  ]);
  root.replaceChildren(fx);

  // ---- per-quest elements (stable while the quest is on screen) ---------
  let items: ItemCard[] = [];
  let itemsKey = '';
  let planets: HTMLElement[] = [];
  let planetsKey = '';

  function buildItems(q: Quest | null) {
    const key = q ? q.id + JSON.stringify(q.items) : '';
    if (key === itemsKey) return;
    itemsKey = key;
    items.forEach((c) => c.el.remove());
    items = Object.entries(q?.items ?? {}).map(([id, item]) =>
      createItemCard(id, item, (itemId) => void api.itemAction(itemId)),
    );
    chips.before(...items.map((c) => c.el));
  }

  function buildPlanets(v: FocusView | null) {
    const key = v
      ? v.questId + JSON.stringify(v.planets.map((p) => p.label))
      : '';
    if (key === planetsKey) return;
    planetsKey = key;
    planets.forEach((p) => p.remove());
    // Swap: click (or Enter on) a planet to look at that step.
    planets = (v?.planets ?? []).map((p) =>
      h(
        'div',
        {
          class: 'pln later',
          vars: { '--k': String(p.k) },
          attrs: {
            role: 'button',
            tabindex: '0',
            'data-k': String(p.k),
            'aria-label': `Step ${p.k + 1}: ${p.label}`,
          },
          on: {
            click: () => void api.peekStep(p.k),
            keydown: (e) => {
              const k = (e as KeyboardEvent).key;
              if (k !== 'Enter' && k !== ' ') return;
              e.preventDefault();
              void api.peekStep(p.k);
            },
          },
        },
        [
          h('span', { class: 'pd', attrs: { 'aria-hidden': 'true' } }),
          h('span', {}, [h('b', { text: p.label }), h('em')]),
        ],
      ),
    );
    orbit.append(...planets);
  }

  // ---- chips: engine replies (rebuilt only when they change) ------------
  let chipsKey = '';
  function renderChips(v: FocusView | null) {
    const replies = v?.replies ?? [];
    const confirm = chat?.confirm;
    const key = confirm ? `confirm:${confirm.id}` : JSON.stringify(replies);
    if (key !== chipsKey && confirm) {
      chipsKey = key;
      const answer = (ok: boolean) => () => {
        chat!.confirm = undefined;
        void api.answerConfirm(confirm.id, ok);
        render();
      };
      chips.replaceChildren(
        h('span', { class: 'rl', text: 'Confirm' }),
        h('button', {
          class: 'chp',
          text: 'Confirm',
          attrs: { type: 'button' },
          on: { click: answer(true) },
        }),
        h('button', {
          class: 'chp',
          text: 'Not now',
          attrs: { type: 'button' },
          on: { click: answer(false) },
        }),
      );
    } else if (key !== chipsKey) {
      chipsKey = key;
      chips.replaceChildren(
        ...(replies.length ? [h('span', { class: 'rl', text: 'Reply' })] : []),
        ...replies.map((r) =>
          h('button', {
            class: 'chp',
            text: r.label,
            attrs: { type: 'button' },
            on: { click: () => void api.reply(r.label) },
          }),
        ),
      );
    }
    if (snap.setupTimer) {
      if (!workingChip.isConnected) chips.append(workingChip);
    } else workingChip.remove();
  }

  const paintTimer = () => {
    const t = snap.setupTimer;
    if (!t) return;
    const s = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(t.startedAt)) / 1000),
    );
    workingChip.textContent = `I'm working · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // ---- render ------------------------------------------------------------
  function render() {
    const q = snap.current;
    const v = view && q && view.questId === q.id ? view : null;
    buildItems(q);
    buildPlanets(v);

    // The chat covers the engine's caption until the engine moves on.
    if (
      chat &&
      !chatBusy &&
      !chat.confirm &&
      (v?.caption.text ?? '') !== chat.under
    )
      chat = null;
    const chatOn = !!chat && (v?.caption.text ?? '') === chat.under;
    const companion =
      debugState ??
      (talking()
        ? 'listening'
        : hooks.speaking?.()
          ? 'speaking'
          : chatOn
            ? chat!.state
            : v?.companion) ??
      'waiting';
    const hud = snap.settings.layout === 'hud';
    fx.className = [
      'fx orbt',
      hud ? 'hud' : '',
      v?.mode ?? 'm-comp',
      `s-${companion}`,
      snap.settings.calm ? 'calm' : '',
    ]
      .filter(Boolean)
      .join(' ');
    hooks.onCompanion?.(companion);
    const name = snap.settings.companionName || 'Companion';
    comp.setAttribute('aria-label', `${name} is ${STATE_LABEL[companion]}`);

    orbit.style.setProperty('--rot', `${v?.orbitDeg ?? 90}deg`);
    orbit.style.setProperty('--step-angle', `${v?.stepAngle ?? 90}deg`);
    orbit.style.setProperty('--n', String(v?.planets.length ?? 0));
    // 6–7 steps (Task 8): a planet at the back of the orbit (same angle math
    // as orbit.css, minus the small wobble) shows its icon only.
    const crowded = (v?.planets.length ?? 0) >= 6;
    v?.planets.forEach((p, k) => {
      const el = planets[k];
      if (!el) return;
      const a = ((k * v.stepAngle + v.orbitDeg) * Math.PI) / 180;
      const back = crowded && Math.sin(a) < -0.25;
      el.className = `pln ${p.state}${back ? ' back' : ''}${v.peek === k ? ' peek' : ''}`;
      el.setAttribute('aria-pressed', String(v.peek === k));
      el.title = back ? p.label : '';
      el.querySelector('.pd')!.textContent = p.icon;
      el.querySelector('em')!.textContent = PLANET_LABEL[p.state];
    });

    let doneIdx = 0;
    for (const c of items) {
      const st = v?.items[c.id] ?? 'off';
      // HUD: done cards stack in the Completed module, in the order they finished.
      if (st === 'done') c.el.style.setProperty('--d', String(doneIdx++));
      c.setState(st);
      c.setTicks(v?.ticks[c.id] ?? 0);
    }

    // Caption: Claude's reply, the engine's line, or a resting line.
    const cap = (talking()
      ? {
          who: 'you' as const,
          text:
            talkState.partial ||
            (talkState.phase === 'finishing' ? '…' : 'Listening…'),
        }
      : null) ??
      (chatOn && chat!.text
        ? { who: 'companion' as const, text: chat!.text }
        : null) ??
      v?.caption ?? {
        who: 'companion' as const,
        text: q
          ? q.status === 'done'
            ? 'Quest complete. Pick the next one when you’re ready.'
            : ''
          : snap.queue.length
            ? 'Nothing active right now. Pick a quest from the quest log.'
            : 'No quests yet. Tell me what you want to get done ("New quest: …").',
      };
    const you = cap.who === 'you';
    who.className = you ? 'who3 you' : 'who3';
    who.replaceChildren(
      h('b'),
      you
        ? 'You'
        : `${name} · ${v?.voice === 'steady' ? 'Focus · ' : ''}${STATE_LABEL[companion]}`,
    );
    line.className = you ? 'ln3 you' : 'ln3';
    line.replaceChildren(cap.text);
    if (companion === 'speaking' && !you) line.append(caret);
    // Long answers: smaller type; very long ones scroll, newest words in view.
    line.classList.toggle('long', cap.text.length > 150);
    line.classList.toggle('xlong', cap.text.length > 300);
    line.scrollTop = line.scrollHeight;
    if (!you && companion === 'speaking') hooks.onLine?.(cap.text);

    // HUD frame labels + the conversation log (comms module).
    if (hud) {
      modState.textContent = STATE_LABEL[companion];
      const total = v?.planets.length ?? 0;
      const stepNo = Math.min(total, (v?.stepIndex ?? 0) + 1);
      modStep.textContent = total
        ? `Step ${Math.max(1, stepNo)} / ${total}`
        : '';
      modDone.textContent = total ? `${v?.doneSteps ?? 0} / ${total}` : '';
      const cur = v?.planets[v.peek ?? Math.min(v.doneSteps, total - 1)];
      viewTask.textContent = `Focus · ${cur?.label ?? 'task'}`;
      const logKey = JSON.stringify(v?.log ?? []);
      if (logx.dataset.key !== logKey) {
        logx.dataset.key = logKey;
        logx.replaceChildren(
          ...(v?.log ?? []).map((g, i) =>
            h(
              'div',
              {
                class: g.who === 'You' ? 'lg you' : 'lg',
                vars: { opacity: String(0.75 - i * 0.15) },
              },
              [h('b', { text: g.who === 'You' ? 'You' : name }), g.text],
            ),
          ),
        );
      }
    }

    renderChips(v);
    const on = talking();
    sayForm.classList.toggle('listening', on);
    micBtn.textContent = on ? 'Stop' : 'Talk';
    micBtn.setAttribute('aria-pressed', String(on));

    // Top row.
    title.textContent = q?.title ?? 'No active quest';
    const done = q?.objectives.filter((o) => o.done).length ?? 0;
    const total = q?.objectives.length ?? 0;
    xp.textContent = q ? `${done * 100} XP · ${done}/${total} steps` : '';
    const active = q?.status === 'active';
    pauseBtn.hidden = !active;
    if (!active) pauseForm.hidden = true;
    bundleBtn.hidden =
      !active ||
      !q ||
      !(
        q.bundle.folders.length ||
        q.bundle.urls.length ||
        q.bundle.apps.length
      );
    nextBtn.hidden = !(q?.status === 'done' && snap.queue.length);
    log.update(snap.queue, logOpen, canActivate());
    forge.update(snap.draft, active);
  }

  // A short line in the notice spot (e.g. "Logged a journal note").
  function toast(text: string) {
    clearTimeout(noticeTimer);
    notice.hidden = false;
    notice.replaceChildren(text);
    noticeTimer = window.setTimeout(() => (notice.hidden = true), 5000);
  }

  // Orchestrator notices ("Opened 2 of 3…"), with an optional action.
  let lastNotice = initial.notice?.seq ?? 0;
  let noticeTimer = 0;
  function showNotice(s: CockpitSnapshot) {
    if (!s.notice || s.notice.seq === lastNotice) return;
    lastNotice = s.notice.seq;
    clearTimeout(noticeTimer);
    notice.hidden = false;
    notice.replaceChildren(s.notice.text);
    if (s.notice.action === 'create-folders') {
      notice.append(
        h('button', {
          class: 'pl',
          text: 'Create missing folder',
          attrs: { type: 'button' },
          on: {
            click: () => {
              notice.hidden = true;
              void api.createMissingFolders();
            },
          },
        }),
      );
      return; // stays until used or replaced
    }
    noticeTimer = window.setTimeout(() => (notice.hidden = true), 8000);
  }

  api.onSnapshot((next) => {
    snap = next;
    showNotice(next);
    void refreshJournal();
    clearInterval(timerTick);
    if (next.setupTimer) {
      paintTimer();
      timerTick = window.setInterval(paintTimer, 1000);
    }
    render();
  });
  // Echo opening / closing panels (main -> here).
  api.onUiCommand((cmd) => {
    if (cmd.type === 'journal') toggleJournal(cmd.open);
    else if (cmd.type === 'questLog') {
      logOpen = cmd.open;
      if (logOpen) journal.setOpen(false);
      render();
    } else if (cmd.type === 'settings') {
      if (cmd.open) settings.openTab(cmd.tab);
      else settings.toggle(false);
    }
  });
  api.onTalkState((s) => {
    if (s.error && s.error !== talkState.error) toast(s.error);
    talkState = s;
    render();
  });
  api.onFocus((v) => {
    view = v;
    render();
  });
  api.onChat((e: ChatEvent) => {
    if (e.type === 'user') chatBusy = true;
    if (e.type === 'done' || e.type === 'error') chatBusy = false;
    if (['user', 'done', 'error', 'action'].includes(e.type))
      void refreshJournal();
    switch (e.type) {
      case 'user':
        chat = { text: '', state: 'thinking', under: view?.caption.text ?? '' };
        break;
      case 'state':
        if (chat) chat.state = e.ai;
        break;
      case 'delta':
        if (!chat) break;
        chat.text += e.text;
        hooks.onVoice?.(0.45 + Math.random() * 0.55);
        break;
      case 'confirm':
        if (chat) {
          chat.text = e.text;
          chat.confirm = { id: e.id };
          chat.state = 'waiting';
        }
        break;
      case 'confirmed':
        if (chat) chat.confirm = undefined;
        break;
      case 'action':
        toast(e.text);
        break;
      case 'error':
        if (chat) {
          chat.text = e.text;
          chat.state = 'waiting';
        }
        break;
      case 'done':
        if (chat) chat.state = 'waiting';
        break;
    }
    render();
  });
  if (initial.notice) {
    lastNotice = 0;
    showNotice(initial);
  }
  if (snap.setupTimer) {
    paintTimer();
    timerTick = window.setInterval(paintTimer, 1000);
  }
  render();

  // Keys: 1 new quest · 6 journal · W I'm working · F2 companion state (debug) · F3 calm · Esc closes.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (journal.open) toggleJournal(false);
      else if (logOpen) {
        logOpen = false;
        render();
      } else if (!pauseForm.hidden) pauseForm.hidden = true;
      else if (settings.open) settings.toggle(false);
      else if (view?.peek != null) void api.peekStep('current');
      else return;
      e.preventDefault();
      return;
    }
    // Keys from Settings → Keys (ui/keys.ts); defaults in orchestrator/keymap.ts.
    const swap = pressed(e, 'stepPrev')
      ? 'prev'
      : pressed(e, 'stepNext')
        ? 'next'
        : pressed(e, 'stepCurrent')
          ? 'current'
          : null;
    if (swap && snap.current) {
      e.preventDefault();
      void api.peekStep(swap);
      return;
    }
    if (pressed(e, 'newQuest')) {
      say.value = 'New quest: ';
      say.focus();
      say.setSelectionRange(say.value.length, say.value.length);
    } else if (pressed(e, 'journal')) toggleJournal();
    else if (pressed(e, 'debugCompanion')) {
      const i = COMPANION_STATES.indexOf(debugState ?? 'waiting');
      debugState =
        i === COMPANION_STATES.length - 1 ? null : COMPANION_STATES[i + 1];
      render();
    } else if (pressed(e, 'calm'))
      void api.setSettings({ calm: !snap.settings.calm });
    else if (pressed(e, 'mute'))
      void api.setSettings({ speech: !snap.settings.speech });
    else if (pressed(e, 'nextSkin')) settings.cycle();
    else if (pressed(e, 'settings')) settings.toggle();
    else if (pressed(e, 'working') && snap.setupTimer) void api.markWorking();
    else return;
    e.preventDefault();
  });

  return { canvas, el: fx, refresh: render, toast };
}
