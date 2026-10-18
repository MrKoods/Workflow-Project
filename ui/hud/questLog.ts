import { h } from './dom';

// Bottom-right: queued quests, hidden until asked for (one active quest at a time).
export function createQuestLog(queue: string[], onToggle: () => void) {
  const list = h(
    'ul',
    { class: 'quest-log', attrs: { id: 'quest-log' } },
    queue.map((q) => h('li', { class: 'quest-log-item', text: q })),
  );
  const toggle = h('button', {
    class: 'btn-link quest-log-toggle',
    attrs: { 'aria-controls': 'quest-log' },
    on: { click: onToggle },
  });

  return {
    els: [toggle, list],
    update(open: boolean) {
      list.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open
        ? 'Close quest log'
        : `Quest log · ${queue.length}`;
    },
  };
}
