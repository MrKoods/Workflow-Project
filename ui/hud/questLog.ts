import type { QueueItem } from '../../orchestrator/types';
import { h } from './dom';

// Bottom-right: paused and queued quests, hidden until asked for (one active quest at a time).
// When nothing is active, each item can be resumed or started from here.
export function createQuestLog(
  onToggle: () => void,
  onActivate: (id: string) => void,
) {
  const list = h('ul', { class: 'quest-log', attrs: { id: 'quest-log' } });
  const toggle = h('button', {
    class: 'btn-link quest-log-toggle',
    attrs: { 'aria-controls': 'quest-log' },
    on: { click: onToggle },
  });

  return {
    els: [toggle, list],
    update(queue: QueueItem[], open: boolean, canActivate: boolean) {
      list.replaceChildren(
        ...queue.map((q) =>
          h(
            'li',
            { class: 'quest-log-item', attrs: { 'data-status': q.status } },
            [
              h('span', { class: 'quest-log-title', text: q.title }),
              q.status === 'paused'
                ? h('span', { class: 'quest-log-tag', text: 'Paused' })
                : null,
              canActivate
                ? h('button', {
                    class: 'btn-link quest-log-action',
                    text: q.status === 'paused' ? 'Resume' : 'Start',
                    attrs: {
                      'aria-label': `${q.status === 'paused' ? 'Resume' : 'Start'} ${q.title}`,
                    },
                    on: { click: () => onActivate(q.id) },
                  })
                : null,
            ],
          ),
        ),
      );
      list.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open
        ? 'Close quest log'
        : `Quest log · ${queue.length}`;
    },
  };
}
