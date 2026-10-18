import { createAtmosphere } from './atmosphere';
import { createCompanion } from './companion';
import { h, replay } from './dom';
import { createHotbar, SLOTS } from './hotbar';
import { createQuest } from './quest';
import { createQuestLog } from './questLog';
import { createTrail } from './trail';
import { AI_STATES, type AiState, type HudModel, type HudState } from './types';
import { createXp } from './xp';
import type { SkinTokens } from '../skin';

export function mountHud(root: HTMLElement, model: HudModel, skin: SkinTokens) {
  const total = model.quest.objectives.length;
  const state: HudState = {
    ai: 'waiting',
    step: 0,
    slot: -1,
    logOpen: false,
    calm: false,
  };
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
    xp.pop();
  };

  // TEMPORARY (Task 2): progress lives in the UI. Task 3 moves it to the orchestrator.
  const completeObjective = () => {
    if (state.step >= total) {
      set({ step: 0 });
      sequence([
        [0, 'speaking'],
        [2600, 'waiting'],
      ]);
      return;
    }
    const step = state.step + 1;
    set({ step });
    const fx = skin.fx.celebration;
    celebrate(step >= total ? fx.quest : fx.objective);
    sequence([
      [0, 'thinking'],
      [1100, 'speaking'],
      [3600, 'waiting'],
    ]);
  };

  const xp = createXp(total);
  const quest = createQuest(model.quest, {
    complete: completeObjective,
    talk: () => {
      sequence([]);
      set({ ai: 'listening' });
    },
  });
  const companion = createCompanion();
  const trail = createTrail(model.quest, (step) => set({ step }));
  const pickSlot = (slot: number) => {
    set({ slot });
    sequence([
      [0, 'working'],
      [2600, 'waiting'],
    ]);
  };
  const hotbar = createHotbar(pickSlot);
  const log = createQuestLog(model.queue, () =>
    set({ logOpen: !state.logOpen }),
  );

  const hud = h('div', { class: 'hud' }, [
    ...createAtmosphere(skin.fx.particles.count),
    xp.el,
    quest.el,
    companion.el,
    trail.el,
    hotbar.el,
    banner,
    ...log.els,
  ]);
  root.replaceChildren(hud);

  function render() {
    hud.dataset.ai = state.ai;
    hud.classList.toggle('is-calm', state.calm);
    xp.update(state.step);
    quest.update(state.step);
    companion.update(state.ai);
    trail.update(state.step);
    hotbar.update(state.slot);
    log.update(state.logOpen);
  }
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
