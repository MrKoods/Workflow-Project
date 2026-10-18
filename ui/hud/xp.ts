import { h, replay } from './dom';

const XP_PER_OBJECTIVE = 100;

// XP counts completed objectives only (CLAUDE.md rule 8).
export function createXp(objectiveCount: number) {
  const max = objectiveCount * XP_PER_OBJECTIVE;
  const count = h('span', { class: 'eyebrow xp-count' });
  const fill = h('div', { class: 'xp-fill' });
  const pop = h('span', {
    class: 'xp-pop',
    text: `+${XP_PER_OBJECTIVE} XP`,
    attrs: { 'aria-hidden': 'true' },
  });

  const el = h(
    'div',
    { class: 'xp', attrs: { role: 'group', 'aria-label': 'Session progress' } },
    [
      h('div', { class: 'xp-head' }, [
        h('span', { class: 'eyebrow xp-label', text: 'Session XP' }),
        count,
      ]),
      h('div', { class: 'xp-track' }, [fill]),
      pop,
    ],
  );

  return {
    el,
    update(done: number) {
      const xp = Math.min(done, objectiveCount) * XP_PER_OBJECTIVE;
      count.textContent = max ? `${xp} / ${max}` : '—';
      const pct = max ? Math.round((xp / max) * 100) : 0;
      fill.style.setProperty('--pct', `${pct}%`);
    },
    pop: () => replay(pop),
  };
}
