import { h } from './dom';

// Bottom-right: queued quests, hidden until asked for (one active quest at a time).
export function createQuestLog(onToggle: () => void) {
  const list = h('ul', { class: 'quest-log', attrs: { id: 'quest-log' } });
  const toggle = h('button', {
    class: 'btn-link quest-log-toggle',
    attrs: { 'aria-controls': 'quest-log' },
    on: { click: onToggle },
  });

  return {
    els: [toggle, list],
    update(queue: string[], open: boolean) {
      list.replaceChildren(
        ...queue.map((q) => h('li', { class: 'quest-log-item', text: q })),
      );
      list.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open
        ? 'Close quest log'
        : `Quest log · ${queue.length}`;
    },
  };
}
