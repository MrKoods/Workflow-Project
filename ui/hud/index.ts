import type {
  Bundle,
  CockpitApi,
  CockpitSnapshot,
} from '../../orchestrator/types';
import type { SkinTokens } from '../skin';
import { createAtmosphere } from './atmosphere';
import { createCompanion } from './companion';
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

  const actions = {
    async complete() {
      const result = await api.completeObjective();
      if (!result) return;
      const fx = skin.fx.celebration;
      celebrate(result.questComplete ? fx.quest : fx.objective);
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
    },
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

  const companion = createCompanion();
  const pickSlot = (slot: number) => {
    set({ slot });
    sequence([
      [0, 'working'],
      [2600, 'waiting'],
    ]);
  };
  const hotbar = createHotbar(pickSlot);
  const log = createQuestLog(() => set({ logOpen: !state.logOpen }));

  const hud = h('div', { class: 'hud' }, [
    ...createAtmosphere(skin.fx.particles.count),
    views.xp.el,
    views.quest.el,
    companion.el,
    views.trail.el,
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
    views.quest.update(objectives);
    views.trail.update(objectives);
    companion.update(state.ai);
    hotbar.update(state.slot);
    log.update(
      snap.queue.map((q) => q.title),
      state.logOpen,
    );
  }

  api.onSnapshot((next) => {
    snap = next;
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

  // Keys: 1–6 hotbar · F2 cycle orb state (debug) · F3 calm mode.
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable]')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= SLOTS.length) pickSlot(n - 1);
    else if (e.key === 'F2') {
      sequence([]);
      set({
        ai: AI_STATES[(AI_STATES.indexOf(state.ai) + 1) % AI_STATES.length],
      });
    } else if (e.key === 'F3') set({ calm: !state.calm });
    else return;
    e.preventDefault();
  });
}
