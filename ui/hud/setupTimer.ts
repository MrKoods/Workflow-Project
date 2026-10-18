import type { CockpitSnapshot } from '../../orchestrator/types';
import { h } from './dom';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Task 7: while a session's setup is being timed, show the running clock and
// "I'm working". Tap it (or press W) the moment real work begins.
export function createSetupTimer(onWorking: () => void) {
  const elapsed = h('span', {
    class: 'setup-elapsed',
    attrs: { 'aria-live': 'off' },
  });
  const button = h(
    'button',
    {
      class: 'btn-primary setup-working',
      attrs: { 'aria-keyshortcuts': 'W' },
      on: { click: onWorking },
    },
    [
      h('span', { class: 'btn-icon', attrs: { 'aria-hidden': 'true' } }),
      h('span', { text: "I'm working" }),
      h('kbd', { class: 'setup-key', text: 'W' }),
    ],
  );
  const el = h('div', { class: 'setup-timer', attrs: { hidden: '' } }, [
    h('span', { class: 'eyebrow', text: 'Setup time' }),
    elapsed,
    button,
  ]);

  let startedAt = 0;
  let tick = 0;
  const paint = () => (elapsed.textContent = clock(Date.now() - startedAt));

  return {
    el,
    get running() {
      return !el.hidden;
    },
    update(timer: CockpitSnapshot['setupTimer']) {
      const next = timer ? Date.parse(timer.startedAt) : 0;
      if (next === startedAt && !el.hidden === !!timer) return; // unchanged
      el.hidden = !timer;
      clearInterval(tick);
      startedAt = next;
      if (!timer) return;
      paint();
      tick = window.setInterval(paint, 1000);
    },
  };
}
