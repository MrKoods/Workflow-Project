import type {
  Bundle,
  CockpitApi,
  CockpitSnapshot,
  CompleteResult,
} from '../../orchestrator/types';
import type { SkinTokens } from '../skin';
import { createAtmosphere } from './atmosphere';
import { createChat } from './chat';
import { createCompanion } from './companion';
import { createForgeCard } from './forge';
import { createJournalPanel } from './journal';
import { createSetupTimer } from './setupTimer';
import { h, replay } from './dom';
import { createHotbar, SLOTS } from './hotbar';
import { createQuest } from './quest';
import { createQuestLog } from './questLog';
import { createTrail } from './trail';
import {
  AI_STATES,
  type AiState,
  type BundleItem,
  type HudState,
} from './types';
import { createXp } from './xp';

// Short labels for the bundle fragments floating over the trail.
function bundleItems(bundle: Bundle): BundleItem[] {
  const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  };
  return [
    ...bundle.folders.map((f) => ({ name: base(f) })),
    ...bundle.urls.map((u) => ({ name: host(u) })),
    ...bundle.apps.map((a) => ({ name: base(a).replace(/\.exe$/i, '') })),
  ];
}

// The parts of a snapshot that change the HUD's structure (not just progress).
const shapeKey = (s: CockpitSnapshot) =>
  JSON.stringify([
    s.current?.id,
    s.current?.title,
    s.current?.doneWhen,
    s.current?.objectives.map((o) => o.title),
    s.current?.bundle,
    s.queue.length,
  ]);

export function mountHud(
  root: HTMLElement,
  api: CockpitApi,
  skin: SkinTokens,
  initial: CockpitSnapshot,
) {
  const state: HudState = {
    ai: 'waiting',
    slot: -1,
    logOpen: false,
    calm: false,
  };
  let snap = initial;
  let timers: number[] = [];

  const set = (patch: Partial<HudState>) => {
    Object.assign(state, patch);
    render();
  };

  // Plays a short scripted run of orb states (stands in for real chat until Task 5).
  const sequence = (steps: [number, AiState][]) => {
    timers.forEach(clearTimeout);
    timers = steps.map(([ms, ai]) => window.setTimeout(() => set({ ai }), ms));
  };

  const banner = h(
    'div',
    { class: 'banner', attrs: { 'aria-live': 'polite' } },
    [h('span', { class: 'banner-text' })],
  );
  const celebrate = (text: string) => {
    if (state.calm) return;
    banner.firstElementChild!.textContent = text;
    replay(banner);
    views.xp.pop();
  };

  const celebrateResult = (result: CompleteResult) => {
    const fx = skin.fx.celebration;
    celebrate(result.questComplete ? fx.quest : fx.objective);
  };

  const actions = {
    async complete() {
      const result = await api.completeObjective();
      if (!result) return;
      celebrateResult(result);
      sequence([
        [0, 'thinking'],
        [1100, 'speaking'],
        [3600, 'waiting'],
      ]);
    },
    async startNext() {
      await api.startNextQuest();
      sequence([
        [0, 'speaking'],
        [2600, 'waiting'],
      ]);
    },
    talk() {
      sequence([]);
      set({ ai: 'listening' });
      chat.focus();
    },
    async openBundle() {
      sequence([[0, 'working']]);
      await api.openBundle();
      sequence([[2600, 'waiting']]);
    },
    async pause(note: string) {
      await api.pauseQuest(note);
      sequence([[0, 'waiting']]);
    },
    async activate(id: string) {
      sequence([[0, 'working']]);
      await api.activateQuest(id);
      set({ logOpen: false });
      sequence([[2600, 'waiting']]);
    },
  };

  // Orchestrator notices (e.g. "Opened 2 of 3. Not found: …") replace the
  // companion's line for a few seconds.
  let say: string | null = null;
  let lastNotice = 0;
  let sayTimer = 0;
  let offerCreate = false;
  const showNotice = (s: CockpitSnapshot) => {
    if (!s.notice || s.notice.seq === lastNotice) return;
    lastNotice = s.notice.seq;
    say = s.notice.text;
    offerCreate = s.notice.action === 'create-folders';
    clearTimeout(sayTimer);
    // A notice with an action stays until it's used or replaced.
    if (offerCreate) return;
    sayTimer = window.setTimeout(() => {
      say = null;
      render();
    }, 8000);
  };

  // Views that depend on which quest is shown; rebuilt when its shape changes.
  const buildViews = (s: CockpitSnapshot) => {
    const q = s.current;
    return {
      key: shapeKey(s),
      xp: createXp(q?.objectives.length ?? 0),
      quest: createQuest(q, s.queue.length, actions),
      trail: createTrail(
        q?.objectives.map((o) => o.title) ?? [],
        q ? bundleItems(q.bundle) : [],
      ),
    };
  };
  let views = buildViews(snap);

  const companion = createCompanion(async () => {
    offerCreate = false;
    render();
    await api.createMissingFolders();
  });
  const chat = createChat({
    send: (text) => void api.sendChat(text),
    answer: (id, ok) => void api.answerConfirm(id, ok),
  });
  companion.el.append(chat.el);
  // The companion's own state (thinking / speaking / working / waiting)
  // replaces the scripted orb sequences while it's talking.
  // Journal panel (slot 6). Refreshed whenever something may have been logged.
  let chatBusy = false;
  const journal = createJournalPanel({
    close: () => toggleJournal(false),
    endSession: () => void api.endSession(),
  });
  const refreshJournal = async () => {
    if (!journal.open) return;
    journal.render(await api.getJournal(), snap, chatBusy);
  };
  const toggleJournal = (open = !journal.open) => {
    journal.setOpen(open);
    set({ slot: open ? 5 : -1 });
    void refreshJournal();
  };

  api.onChat((e) => {
    chat.handle(e);
    if (e.type === 'user') chatBusy = true;
    if (e.type === 'done' || e.type === 'error') chatBusy = false;
    if (['user', 'done', 'error', 'action'].includes(e.type))
      void refreshJournal();
    if (e.type === 'state') {
      sequence([]);
      set({ ai: e.ai });
    } else if (e.type === 'objective-completed') {
      celebrateResult(e.result);
    } else {
      render();
    }
  });
  const pickSlot = (slot: number) => {
    // Slot 1 (Quests) starts a new quest with the companion (Quest Forge).
    if (slot === 0) {
      chat.prefill('New quest: ');
      set({ slot, ai: 'listening' });
      return;
    }
    // Slot 6 (Journal) toggles the journal panel.
    if (slot === 5) return toggleJournal();
    set({ slot });
    sequence([
      [0, 'working'],
      [2600, 'waiting'],
    ]);
  };
  const hotbar = createHotbar(pickSlot);
  const log = createQuestLog(
    () => set({ logOpen: !state.logOpen }),
    actions.activate,
  );

  const setupTimer = createSetupTimer(() => void api.markWorking());
  const forge = createForgeCard({
    accept: (draft, start) => api.acceptDraft(draft, start),
    discard: () => void api.discardDraft(),
  });

  const hud = h('div', { class: 'hud' }, [
    ...createAtmosphere(skin.fx.particles.count),
    views.xp.el,
    // Left column: the active quest, with the Quest Forge card under it.
    h('div', { class: 'quest-col' }, [views.quest.el, setupTimer.el, forge.el]),
    companion.el,
    views.trail.el,
    journal.el,
    hotbar.el,
    banner,
    ...log.els,
  ]);
  root.replaceChildren(hud);

  function render() {
    const objectives = snap.current?.objectives ?? [];
    hud.dataset.ai = state.ai;
    hud.classList.toggle('is-calm', state.calm);
    views.xp.update(objectives.filter((o) => o.done).length);
    views.quest.update(snap.current);
    forge.update(snap.draft, snap.current?.status === 'active');
    setupTimer.update(snap.setupTimer);
    views.trail.update(objectives);
    companion.update(state.ai, say, offerCreate, chat.started);
    hotbar.update(state.slot);
    log.update(snap.queue, state.logOpen, snap.current?.status !== 'active');
  }

  showNotice(snap);
  api.onSnapshot((next) => {
    snap = next;
    showNotice(next);
    void refreshJournal();
    if (shapeKey(next) !== views.key) {
      const old = views;
      views = buildViews(next);
      old.quest.destroy();
      old.xp.el.replaceWith(views.xp.el);
      old.quest.el.replaceWith(views.quest.el);
      old.trail.el.replaceWith(views.trail.el);
    }
    render();
  });
  render();

  // Keys: 1–6 hotbar · W I'm working (setup timer) · F2 orb state (debug) · F3 calm · Esc closes the journal.
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable]')) return;
    // key for normal typing; code as a fallback (layouts, numpad, synthetic input).
    const n = Number(e.key) || Number(/^(Digit|Numpad)(\d)$/.exec(e.code)?.[2]);
    if (n >= 1 && n <= SLOTS.length) pickSlot(n - 1);
    else if (e.key === 'F2') {
      sequence([]);
      set({
        ai: AI_STATES[(AI_STATES.indexOf(state.ai) + 1) % AI_STATES.length],
      });
    } else if (e.key === 'F3') set({ calm: !state.calm });
    else if (e.key === 'Escape' && journal.open) toggleJournal(false);
    else if (
      (e.key === 'w' || e.key === 'W' || e.code === 'KeyW') &&
      setupTimer.running
    )
      void api.markWorking();
    else return;
    e.preventDefault();
  });
}
