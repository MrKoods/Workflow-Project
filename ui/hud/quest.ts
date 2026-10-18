import type { Quest } from '../../orchestrator/types';
import { h } from './dom';

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

export interface QuestActions {
  complete: () => void;
  startNext: () => void;
  talk: () => void;
}

// Left column: active quest, done-when, current objective, main action.
// With no quest, it becomes an "all clear" panel that can start the next one.
export function createQuest(
  quest: Quest | null,
  queueLength: number,
  on: QuestActions,
) {
  const stepLabel = h('div', { class: 'eyebrow quest-step' });
  const objectiveText = h('span');
  const actionLabel = h('span');
  const action = h('button', { class: 'btn-primary' }, [
    h('span', { class: 'btn-icon', attrs: { 'aria-hidden': 'true' } }),
    actionLabel,
  ]);
  const title = h('h1', {
    class: 'quest-title',
    text: quest?.title ?? 'All clear',
  });
  const doneWhen = quest
    ? quest.doneWhen
    : queueLength
      ? 'No active quest. Start the next one from the log.'
      : 'No quests yet. Add a quest file to quests/ to begin.';

  const el = h(
    'section',
    { class: 'quest', attrs: { 'aria-label': 'Active quest' } },
    [
      h('div', {
        class: 'eyebrow quest-eyebrow',
        text: quest ? 'Active quest' : 'No active quest',
      }),
      title,
      h('div', { class: 'quest-ornament', attrs: { 'aria-hidden': 'true' } }),
      h('p', { class: 'quest-done', text: doneWhen }),
      stepLabel,
      h('div', { class: 'objective' }, [
        h('span', {
          class: 'objective-marker',
          attrs: { 'aria-hidden': 'true' },
        }),
        objectiveText,
      ]),
      h('div', { class: 'quest-actions' }, [
        action,
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
  const observer = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width === lastWidth) return;
    lastWidth = width;
    // Next frame: resizing inside the observer callback triggers a loop warning.
    requestAnimationFrame(() => fitTitle(title));
  });
  observer.observe(el);
  // fonts.ready can resolve before the title font even starts loading,
  // so also refit whenever any font finishes loading.
  const refit = () => fitTitle(title);
  document.fonts.ready.then(refit);
  document.fonts.addEventListener('loadingdone', refit);

  let mode: 'complete' | 'next' = 'complete';
  action.addEventListener('click', () =>
    mode === 'complete' ? on.complete() : on.startNext(),
  );

  return {
    el,
    destroy() {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', refit);
    },
    update(objectives: Quest['objectives']) {
      const total = objectives.length;
      const step = objectives.findIndex((o) => !o.done);
      const allDone = step < 0;
      mode = quest && !allDone ? 'complete' : 'next';

      if (!quest) stepLabel.textContent = 'Quest log';
      else if (allDone) stepLabel.textContent = 'Objective — all clear';
      else stepLabel.textContent = `Objective ${step + 1} of ${total}`;

      objectiveText.textContent = !quest
        ? `${queueLength} quest${queueLength === 1 ? '' : 's'} waiting`
        : allDone
          ? 'Quest complete. Claim the next one.'
          : objectives[step].title;

      actionLabel.textContent =
        mode === 'complete' ? 'Complete objective' : 'Next quest';
      action.disabled = mode === 'next' && queueLength === 0;
    },
  };
}
