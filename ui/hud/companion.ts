import { h } from './dom';
import { AI_LABELS, COMPANION_LINES } from './copy';
import type { AiState } from './types';

const WAVE_BARS = 24;

// Right column: the orb. Its look per state comes from the skin via .hud[data-ai].
export function createCompanion(onCreateFolders: () => void) {
  const orb = h('div', { class: 'orb', attrs: { role: 'img' } }, [
    h('div', { class: 'orb-gimbal' }, [
      h('div', { class: 'orb-ring orb-ring--1' }),
      h('div', { class: 'orb-ring orb-ring--2' }),
      h('div', { class: 'orb-ring orb-ring--3' }),
    ]),
    h('div', { class: 'orb-core' }),
  ]);
  const wave = h('div', { class: 'wave', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < WAVE_BARS; i++) {
    wave.append(
      h('span', {
        class: 'wave-bar',
        vars: { '--delay': `${((i * 0.37) % 0.8).toFixed(2)}s` },
      }),
    );
  }
  const status = h('div', { class: 'companion-status' });
  const line = h('p', {
    class: 'companion-line',
    attrs: { 'aria-live': 'polite' },
  });
  // Offered when a bundle folder was missing; nothing is created until clicked.
  const createBtn = h('button', {
    class: 'btn-link companion-action',
    text: 'Create missing folder',
    attrs: { hidden: '' },
    on: { click: onCreateFolders },
  });

  const el = h(
    'section',
    { class: 'companion', attrs: { 'aria-label': 'AI companion' } },
    [
      orb,
      h('div', { class: 'orb-floor', attrs: { 'aria-hidden': 'true' } }),
      wave,
      status,
      line,
      createBtn,
    ],
  );

  return {
    el,
    /** `say` overrides the stock line (e.g. what the bundle opened). */
    update(ai: AiState, say?: string | null, offerCreate = false) {
      orb.setAttribute('aria-label', `Companion is ${AI_LABELS[ai]}`);
      status.textContent = `Companion · ${AI_LABELS[ai]}`;
      line.textContent = say || COMPANION_LINES[ai];
      createBtn.hidden = !offerCreate;
    },
  };
}
