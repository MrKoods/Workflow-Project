// Quest items as Orbit cards (markup: docs/reference/markup-snapshot.html).
// One stable <section class="it"> per item, built once per quest; afterwards
// only its state class changes (hero / sup1 / sup2 / done / off) so the CSS
// transitions do the pop-out, glide and tuck-back. Never re-create on state.
import type { ItemState, QuestItem } from '../../orchestrator/types';
import { h } from '../panels/dom';

const ICON: Record<QuestItem['type'], string> = {
  link: '↗',
  checklist: '☑',
  draft: '✎',
  tags: '◆',
};
const KIND: Record<QuestItem['type'], string> = {
  link: 'Link · opens in your browser',
  checklist: 'Checklist',
  draft: 'Draft · from your companion',
  tags: 'Suggested · copy them in',
};

const urlLabel = (url: string) => {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
  } catch {
    return url;
  }
};

export interface ItemCard {
  id: string;
  el: HTMLElement;
  setState(state: ItemState): void;
  /** Checklists: the engine ticked `n` boxes so far. */
  setTicks(n: number): void;
}

export function createItemCard(
  id: string,
  item: QuestItem,
  onAction: (id: string) => void,
): ItemCard {
  const cta = (label: string) =>
    h(
      'button',
      {
        class: 'cta',
        attrs: { type: 'button' },
        on: {
          click: (e) => {
            e.stopPropagation();
            onAction(id);
          },
        },
      },
      [label + ' ', h('span', { text: '→', attrs: { 'aria-hidden': 'true' } })],
    );

  const head: Node[] = [
    h('span', {
      class: 'ic',
      text: ICON[item.type],
      attrs: { 'aria-hidden': 'true' },
    }),
    h('span', { class: 'itt' }, [
      h('b', { text: item.title }),
      h('span', { text: KIND[item.type] }),
    ]),
  ];
  const body: Node[] = [];
  let after: Node | null = null;
  let setTicks = (_n: number) => {};

  switch (item.type) {
    case 'link':
      body.push(
        h('div', { class: 'bbar' }, [
          h('i'),
          h('i'),
          h('i'),
          h('span', { text: urlLabel(item.url) }),
        ]),
        h(
          'div',
          { class: 'pg' },
          item.preview.map(([label, value]) =>
            h('div', { class: 'pf' }, [
              h('label', { text: label }),
              h('span', { text: value }),
            ]),
          ),
        ),
      );
      after = cta(item.cta);
      break;
    case 'checklist': {
      // Ticked by the engine while you work, or by clicking a box yourself.
      const on = new Set<number>();
      const cnt = h('span', { class: 'cnt' });
      const boxes = item.checks.map((text, i) =>
        h(
          'span',
          {
            class: 'ck',
            attrs: { role: 'checkbox', 'aria-checked': 'false', tabindex: '0' },
            on: {
              click: () => toggle(i),
              keydown: (e) => {
                const k = (e as KeyboardEvent).key;
                if (k === ' ' || k === 'Enter') {
                  e.preventDefault();
                  toggle(i);
                }
              },
            },
          },
          [h('i', { attrs: { 'aria-hidden': 'true' } }), text],
        ),
      );
      const paint = () => {
        boxes.forEach((b, i) => {
          b.classList.toggle('on', on.has(i));
          b.setAttribute('aria-checked', String(on.has(i)));
        });
        cnt.textContent = `${on.size}/${boxes.length}`;
      };
      const toggle = (i: number) => {
        if (on.has(i)) on.delete(i);
        else on.add(i);
        paint();
      };
      let ticked = 0;
      setTicks = (n) => {
        for (; ticked < n; ticked++) {
          const next = boxes.findIndex((_, i) => !on.has(i));
          if (next >= 0) on.add(next);
        }
        paint();
      };
      head.push(cnt);
      body.push(h('div', { class: 'cks' }, boxes));
      paint();
      break;
    }
    case 'draft':
      body.push(h('p', { class: 'nt', text: item.text }));
      after = cta(item.cta);
      break;
    case 'tags':
      body.push(
        h(
          'div',
          { class: 'tags' },
          item.tags.map((t) => h('span', { class: 'tg', text: t })),
        ),
      );
      after = cta(item.cta);
      break;
  }

  const el = h(
    'section',
    {
      class: 'it off',
      vars: { '--d': '0' },
      attrs: { 'aria-label': item.title },
    },
    [h('div', { class: 'ih' }, head), h('div', { class: 'ib' }, body), after],
  );
  let state: ItemState = 'off';
  return {
    id,
    el,
    setState(next) {
      if (next === state) return;
      el.classList.replace(state, next);
      el.setAttribute('aria-hidden', String(next === 'off' || next === 'done'));
      el.inert = next === 'off' || next === 'done';
      state = next;
    },
    setTicks: (n) => setTicks(n),
  };
}
