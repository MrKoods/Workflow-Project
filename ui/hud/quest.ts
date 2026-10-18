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
  openBundle: () => void;
  pause: (note: string) => void;
}

// Inline "Where did you leave off?" form; the note is optional.
function createPauseForm(onPause: (note: string) => void, onClose: () => void) {
  const input = h('input', {
    class: 'field',
    attrs: {
      id: 'pause-note',
      maxlength: '500',
      autocomplete: 'off',
      placeholder: 'Optional — e.g. "halfway through the FAQ"',
    },
  });
  const form = h('form', { class: 'pause-form', attrs: { hidden: '' } }, [
    h('label', {
      class: 'eyebrow',
      text: 'Where did you leave off?',
      attrs: { for: 'pause-note' },
    }),
    h('div', { class: 'pause-row' }, [
      input,
      h('button', {
        class: 'btn-link',
        text: 'Pause',
        attrs: { type: 'submit' },
      }),
      h('button', {
        class: 'btn-link',
        text: 'Cancel',
        attrs: { type: 'button' },
        on: { click: onClose },
      }),
    ]),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onPause(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') onClose();
  });
  return {
    form,
    open() {
      form.hidden = false;
      input.value = '';
      input.focus();
    },
    close: () => (form.hidden = true),
  };
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
      ? 'No active quest. Start or resume one from the quest log.'
      : 'No quests yet. Add a quest file to quests/ to begin.';
  const resumeLine = h('p', { class: 'quest-resume' });

  const actions = h('div', { class: 'quest-actions' });
  const pause = createPauseForm(
    (note) => {
      pause.close();
      on.pause(note);
    },
    () => {
      pause.close();
      actions.hidden = false;
    },
  );
  const activeOnly = [
    h('button', {
      class: 'btn-link',
      text: 'Open bundle',
      on: { click: on.openBundle },
    }),
    h('button', {
      class: 'btn-link',
      text: 'Pause quest',
      on: {
        click: () => {
          actions.hidden = true;
          pause.open();
        },
      },
    }),
  ];

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
      resumeLine,
      actions,
      pause.form,
    ],
  );
  actions.append(
    action,
    h('button', {
      class: 'btn-link',
      text: 'Speak with companion',
      on: { click: on.talk },
    }),
    ...activeOnly,
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
    update(current: Quest | null) {
      const objectives = current?.objectives ?? [];
      const total = objectives.length;
      const step = objectives.findIndex((o) => !o.done);
      const allDone = step < 0;
      mode = quest && !allDone ? 'complete' : 'next';

      const isActive = current?.status === 'active';
      for (const b of activeOnly) b.hidden = !isActive;
      if (!isActive) {
        pause.close();
        actions.hidden = false;
      }
      resumeLine.hidden = !(isActive && current?.resumeNote);
      resumeLine.textContent = current?.resumeNote
        ? `Left off: ${current.resumeNote}`
        : '';

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
