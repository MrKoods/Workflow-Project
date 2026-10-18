import { h } from './dom';
import type { HudQuest } from './types';

// Left column: active quest, done-when, current objective, main action.
export function createQuest(
  quest: HudQuest,
  on: { complete: () => void; talk: () => void },
) {
  const total = quest.objectives.length;
  const stepLabel = h('div', { class: 'eyebrow quest-step' });
  const objectiveText = h('span');
  const actionLabel = h('span');

  const el = h(
    'section',
    { class: 'quest', attrs: { 'aria-label': 'Active quest' } },
    [
      h('div', { class: 'eyebrow quest-eyebrow', text: 'Active quest' }),
      h('h1', { class: 'quest-title', text: quest.title }),
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
