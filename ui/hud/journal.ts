import type { CockpitSnapshot, JournalEntry } from '../../orchestrator/types';
import { KIND_LABELS } from './copy';
import { h } from './dom';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Journal panel (hotbar slot 6, Task 6): today's entries, tomorrow's first
// quest once set, and End session (the companion debriefs and plans tomorrow).
export function createJournalPanel(on: {
  close: () => void;
  endSession: () => void;
}) {
  const list = h('ol', { class: 'journal-list' });
  const empty = h('p', {
    class: 'journal-empty',
    text: 'Nothing logged yet today.',
  });
  const tomorrow = h('p', { class: 'journal-tomorrow' });
  const endBtn = h('button', {
    class: 'btn-link',
    text: 'End session',
    on: { click: () => on.endSession() },
  });

  const el = h(
    'section',
    {
      class: 'journal-panel',
      attrs: { 'aria-label': 'Journal', hidden: '' },
    },
    [
      h('div', { class: 'journal-head' }, [
        h('span', {
          class: 'eyebrow journal-eyebrow',
          text: 'Journal · Today',
        }),
        endBtn,
        h('button', {
          class: 'btn-link',
          text: 'Close',
          on: { click: on.close },
        }),
      ]),
      tomorrow,
      empty,
      list,
    ],
  );

  return {
    el,
    setOpen(open: boolean) {
      el.hidden = !open;
    },
    get open() {
      return !el.hidden;
    },
    render(entries: JournalEntry[], snap: CockpitSnapshot, busy: boolean) {
      list.replaceChildren(
        ...entries.map((e) =>
          h('li', { class: 'journal-entry', attrs: { 'data-kind': e.kind } }, [
            h('span', { class: 'journal-time', text: time(e.at) }),
            h('span', {
              class: 'journal-kind',
              text: KIND_LABELS[e.kind] ?? e.kind,
            }),
            h('span', { class: 'journal-text', text: e.text }),
          ]),
        ),
      );
      empty.hidden = entries.length > 0;
      list.scrollTop = list.scrollHeight;
      tomorrow.hidden = !snap.firstQuest;
      tomorrow.textContent = snap.firstQuest
        ? `Tomorrow starts with "${snap.firstQuest.title}".`
        : '';
      endBtn.disabled = busy;
    },
  };
}
