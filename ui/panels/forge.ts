import type {
  AcceptResult,
  QuestDraft,
  QuestDraftInput,
} from '../../orchestrator/types';
import { h } from './dom';

const MAX_OBJECTIVES = 7;
const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// Quest Forge draft card (Task 5b): the companion drafts, you edit, then
// Accept writes the quest file or Discard drops it. Nothing is written before Accept.
export function createForgeCard(on: {
  accept: (draft: QuestDraftInput, start: boolean) => Promise<AcceptResult>;
  discard: () => void;
}) {
  const field = (id: string, label: string, control: HTMLElement) =>
    h('div', { class: 'forge-field' }, [
      h('label', { class: 'eyebrow', text: label, attrs: { for: id } }),
      control,
    ]);

  const title = h('input', {
    class: 'field',
    attrs: { id: 'forge-title', maxlength: '120' },
  });
  const doneWhen = h('input', {
    class: 'field',
    attrs: { id: 'forge-done', maxlength: '300' },
  });
  const objectiveList = h('ol', { class: 'forge-objectives' });
  const addObjective = h('button', {
    class: 'btn-link',
    text: 'Add objective',
    attrs: { type: 'button' },
    on: { click: () => addRow('', true) },
  });
  const folders = h('textarea', {
    class: 'field field-area',
    attrs: {
      id: 'forge-folders',
      rows: '2',
      placeholder: 'One per line, e.g. ~/Documents/Fiverr',
    },
  });
  const urls = h('textarea', {
    class: 'field field-area',
    attrs: {
      id: 'forge-urls',
      rows: '2',
      placeholder: 'One per line, e.g. https://www.fiverr.com',
    },
  });
  const error = h('p', { class: 'forge-error', attrs: { role: 'alert' } });

  const actions = h('div', { class: 'forge-actions' }, [
    h(
      'button',
      {
        class: 'btn-primary forge-accept',
        attrs: { type: 'button' },
        on: { click: () => onAccept() },
      },
      [
        h('span', { class: 'btn-icon', attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: 'Accept' }),
      ],
    ),
    h('button', {
      class: 'btn-link',
      text: 'Discard',
      attrs: { type: 'button' },
      on: { click: () => on.discard() },
    }),
  ]);
  const startRow = h('div', { class: 'forge-actions', attrs: { hidden: '' } }, [
    h('span', { class: 'forge-question', text: 'Start this now?' }),
    h('button', {
      class: 'btn-link',
      text: 'Start now',
      attrs: { type: 'button' },
      on: { click: () => submit(true) },
    }),
    h('button', {
      class: 'btn-link',
      text: 'Later',
      attrs: { type: 'button' },
      on: { click: () => submit(false) },
    }),
  ]);

  const el = h(
    'section',
    { class: 'forge', attrs: { 'aria-label': 'New quest draft', hidden: '' } },
    [
      h('div', { class: 'eyebrow forge-eyebrow', text: 'New quest · draft' }),
      // Only the fields scroll; Accept / Discard stay visible below them.
      h('div', { class: 'forge-body' }, [
        field('forge-title', 'Title', title),
        field('forge-done', 'Done when', doneWhen),
        h('div', { class: 'forge-field' }, [
          h('span', { class: 'eyebrow', text: 'Objectives' }),
          objectiveList,
          addObjective,
        ]),
        field('forge-folders', 'Folders', folders),
        field('forge-urls', 'Sites', urls),
      ]),
      error,
      actions,
      startRow,
    ],
  );
  // Ctrl+Enter anywhere in the card accepts it.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !actions.hidden) {
      e.preventDefault();
      onAccept();
    }
  });

  function addRow(text: string, focus = false) {
    if (objectiveList.childElementCount >= MAX_OBJECTIVES) return;
    const n = objectiveList.childElementCount + 1;
    const input = h('input', {
      class: 'field',
      attrs: { maxlength: '200', 'aria-label': `Objective ${n}` },
    });
    input.value = text;
    const row = h('li', { class: 'forge-objective' }, [
      input,
      h('button', {
        class: 'btn-link forge-remove',
        text: 'Remove',
        attrs: { type: 'button', 'aria-label': `Remove objective ${n}` },
        on: {
          click: () => {
            row.remove();
            syncAdd();
          },
        },
      }),
    ]);
    objectiveList.append(row);
    syncAdd();
    if (focus) input.focus();
  }
  const syncAdd = () => {
    addObjective.hidden = objectiveList.childElementCount >= MAX_OBJECTIVES;
  };

  const read = (): QuestDraftInput => ({
    title: title.value,
    doneWhen: doneWhen.value,
    objectives: [...objectiveList.querySelectorAll('input')]
      .map((i) => i.value.trim())
      .filter(Boolean),
    folders: lines(folders.value),
    urls: lines(urls.value),
  });

  let rev = -1;
  let hasActive = false;

  function onAccept() {
    error.textContent = '';
    // With nothing active, ask whether to start it; otherwise it's queued.
    if (hasActive) void submit(false);
    else {
      actions.hidden = true;
      startRow.hidden = false;
      startRow.querySelector('button')?.focus();
    }
  }

  async function submit(start: boolean) {
    const result = await on.accept(read(), start);
    if (!result.ok) {
      error.textContent = result.error;
      actions.hidden = false;
      startRow.hidden = true;
    }
  }

  return {
    el,
    update(draft: QuestDraft | null, activeQuest: boolean) {
      hasActive = activeQuest;
      el.hidden = !draft;
      if (!draft) {
        rev = -1;
        return;
      }
      if (draft.rev === rev) return; // keep the user's edits until the companion revises
      rev = draft.rev;
      title.value = draft.title;
      doneWhen.value = draft.doneWhen;
      objectiveList.replaceChildren();
      draft.objectives.forEach((o) => addRow(o));
      folders.value = draft.folders.join('\n');
      urls.value = draft.urls.join('\n');
      error.textContent = '';
      actions.hidden = false;
      startRow.hidden = true;
    },
  };
}
