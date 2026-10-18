import { h } from './dom';
import type { HudQuest } from './types';

const TITLE_MAX_LINES = 2;
const TITLE_MIN_SCALE = 0.4;

const countLines = (el: HTMLElement) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  const tops = new Set(
    [...range.getClientRects()].map((r) => Math.round(r.top)),
  );
  return tops.size;
};

// Title wraps to two lines at the skin's size; past that, shrink until it fits in two.
function fitTitle(title: HTMLElement) {
  title.style.fontSize = '';
  const base = parseFloat(getComputedStyle(title).fontSize);
  let size = base;
  while (countLines(title) > TITLE_MAX_LINES && size > base * TITLE_MIN_SCALE) {
    size *= 0.95;
    title.style.fontSize = `${size}px`;
  }
}

// Left column: active quest, done-when, current objective, main action.
export function createQuest(
  quest: HudQuest,
  on: { complete: () => void; talk: () => void },
) {
  const total = quest.objectives.length;
  const stepLabel = h('div', { class: 'eyebrow quest-step' });
  const objectiveText = h('span');
  const actionLabel = h('span');
  const title = h('h1', { class: 'quest-title', text: quest.title });

  const el = h(
    'section',
    { class: 'quest', attrs: { 'aria-label': 'Active quest' } },
    [
      h('div', { class: 'eyebrow quest-eyebrow', text: 'Active quest' }),
      title,
      h('div', { class: 'quest-ornament', attrs: { 'aria-hidden': 'true' } }),
      h('p', { class: 'quest-done', text: quest.doneWhen }),
      stepLabel,
      h('div', { class: 'objective' }, [
        h('span', {
          class: 'objective-marker',
          attrs: { 'aria-hidden': 'true' },
        }),
        objectiveText,
      ]),
      h('div', { class: 'quest-actions' }, [
        h('button', { class: 'btn-primary', on: { click: on.complete } }, [
          h('span', { class: 'btn-icon', attrs: { 'aria-hidden': 'true' } }),
          actionLabel,
        ]),
        h('button', {
          class: 'btn-link',
          text: 'Speak with companion',
          on: { click: on.talk },
        }),
      ]),
    ],
  );

  // Refit when the column width changes (window resize) and once fonts load.
  let lastWidth = -1;
  new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width === lastWidth) return;
    lastWidth = width;
    // Next frame: resizing inside the observer callback triggers a loop warning.
    requestAnimationFrame(() => fitTitle(title));
  }).observe(el);
  document.fonts.ready.then(() => fitTitle(title));

  return {
    el,
    update(step: number) {
      const done = step >= total;
      stepLabel.textContent = done
        ? 'Objective — all clear'
        : `Objective ${step + 1} of ${total}`;
      objectiveText.textContent = done
        ? 'Quest complete. Claim the next one.'
        : quest.objectives[step];
      actionLabel.textContent = done ? 'Next quest' : 'Complete objective';
    },
  };
}
