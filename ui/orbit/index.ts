// The Orbit screen (ORBIT-UPGRADE Task 5). Structure follows
// docs/reference/markup-snapshot.html; state comes from the orchestrator's
// focus engine (FocusView) and snapshots. Elements are built once and only
// their classes / CSS variables change, so orbit.css does all the motion.
import type {
  ChatEvent,
  CockpitApi,
  CockpitSnapshot,
  FocusCompanionState,
  FocusView,
  Quest,
} from '../../orchestrator/types';
import { h } from '../panels/dom';
import { createForgeCard } from '../panels/forge';
import { createJournalPanel } from '../panels/journal';
import { createQuestLog } from '../panels/questLog';
import type { SettingsPanel } from '../settings';
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
  const sayForm = h('form', { class: 'sayx' }, [
    h('label', { text: 'Say', attrs: { for: 'sayOrb' } }),
    say,
    h('button', { class: 'send', text: 'Send', attrs: { type: 'submit' } }),
  ]);
  sayForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = say.value.trim();
    if (!text) return;
    say.value = '';
    void api.reply(text);
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
    h('div', { class: 'topr2' }, [
      h('div', { class: 'q' }, ['Today’s quest', title]),
      ctrl,
    ]),
    orbit,
    h('div', { class: 'tether', attrs: { 'aria-hidden': 'true' } }),
    comp,
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
      debugState ?? (chatOn ? chat!.state : v?.companion) ?? 'waiting';
    fx.className = [
      'fx orbt',
      v?.mode ?? 'm-comp',
      `s-${companion}`,
      snap.settings.calm ? 'calm' : '',
    ]
      .filter(Boolean)
      .join(' ');
    hooks.onCompanion?.(companion);
    comp.setAttribute('aria-label', `Companion is ${STATE_LABEL[companion]}`);

    orbit.style.setProperty('--rot', `${v?.orbitDeg ?? 90}deg`);
    orbit.style.setProperty('--step-angle', `${v?.stepAngle ?? 90}deg`);
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

    for (const c of items) {
      c.setState(v?.items[c.id] ?? 'off');
      c.setTicks(v?.ticks[c.id] ?? 0);
    }

    // Caption: Claude's reply, the engine's line, or a resting line.
    const cap = (chatOn && chat!.text
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
        : `Companion · ${v?.voice === 'steady' ? 'Focus · ' : ''}${STATE_LABEL[companion]}`,
    );
    line.className = you ? 'ln3 you' : 'ln3';
    line.replaceChildren(cap.text);
    if (companion === 'speaking' && !you) line.append(caret);

    renderChips(v);

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
    const target = e.target as HTMLElement;
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
    if (target.closest('input, textarea, [contenteditable]')) return;
    // Swap: ← previous step, → next step, Home back to the current one.
    const swap =
      e.key === 'ArrowLeft'
        ? 'prev'
        : e.key === 'ArrowRight'
          ? 'next'
          : e.key === 'Home'
            ? 'current'
            : null;
    if (swap && !e.ctrlKey && !e.altKey && !e.metaKey && snap.current) {
      e.preventDefault();
      void api.peekStep(swap);
      return;
    }
    const n = Number(e.key) || Number(/^(Digit|Numpad)(\d)$/.exec(e.code)?.[2]);
    if (n === 1) {
      say.value = 'New quest: ';
      say.focus();
      say.setSelectionRange(say.value.length, say.value.length);
    } else if (n === 6) toggleJournal();
    else if (e.key === 'F2') {
      const i = COMPANION_STATES.indexOf(debugState ?? 'waiting');
      debugState =
        i === COMPANION_STATES.length - 1 ? null : COMPANION_STATES[i + 1];
      render();
    } else if (e.key === 'F3')
      void api.setSettings({ calm: !snap.settings.calm });
    else if (
      (e.key === 'w' || e.key === 'W' || e.code === 'KeyW') &&
      snap.setupTimer
    )
      void api.markWorking();
    else return;
    e.preventDefault();
  });

  return { canvas, el: fx };
}
