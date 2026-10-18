import { h, svg } from './dom';

// Slots 1–6 (FEATURES §3.4). Panels are stubs in Phase 0.
export const SLOTS = [
  { name: 'Quests', icon: 'M5 21V4M5 4h11l-2 4 2 4H5' },
  {
    name: 'Files',
    icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  },
  {
    name: 'Web',
    icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  },
  { name: 'Comms', icon: 'M4 5h16v11H9l-5 4z' },
  { name: 'Inbox', icon: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5' },
  {
    name: 'Journal',
    icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  },
] as const;

export function createHotbar(onPick: (index: number) => void) {
  const buttons = SLOTS.map((slot, i) =>
    h(
      'button',
      {
        class: 'slot',
        attrs: { 'aria-label': slot.name, 'aria-pressed': 'false' },
        on: { click: () => onPick(i) },
      },
      [
        h('span', { class: 'slot-medallion' }, [
          svg(
            'svg',
            {
              width: '20',
              height: '20',
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '1.6',
              'stroke-linejoin': 'round',
              'aria-hidden': 'true',
            },
            [svg('path', { d: slot.icon })],
          ),
        ]),
        h('span', { class: 'slot-key', text: `${i + 1} ${slot.name}` }),
      ],
    ),
  );
  const el = h(
    'nav',
    { class: 'hotbar', attrs: { 'aria-label': 'Workspace hotbar' } },
    buttons,
  );

  return {
    el,
    update(active: number) {
      buttons.forEach((b, i) =>
        b.setAttribute('aria-pressed', String(i === active)),
      );
    },
  };
}
