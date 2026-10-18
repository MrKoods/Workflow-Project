import { h } from './dom';

// Background layers + brand. What they look like (aurora, snow, embers…) is up to the skin.
export function createAtmosphere(particleCount: number): HTMLElement[] {
  const particles = h('div', {
    class: 'hud-particles',
    attrs: { 'aria-hidden': 'true' },
  });
  for (let j = 0; j < particleCount; j++) {
    particles.append(
      h('span', {
        class: 'particle',
        vars: {
          '--x': `${((j * 37.3) % 100).toFixed(1)}%`,
          '--y': `${(j * 31) % 200}px`,
          '--size': `${2 + (j % 3)}px`,
          '--dur': `${10 + ((j * 7) % 10)}s`,
          '--delay': `${-((j * 1.3) % 16).toFixed(1)}s`,
        },
      }),
    );
  }
  const hidden = { 'aria-hidden': 'true' };
  return [
    h('div', { class: 'hud-sky', attrs: hidden }),
    h('div', { class: 'hud-light hud-light--task', attrs: hidden }),
    h('div', { class: 'hud-light hud-light--companion', attrs: hidden }),
    particles,
    h('div', { class: 'hud-vignette', attrs: hidden }),
    h('header', { class: 'brand' }, [
      h('span', { class: 'brand-mark', attrs: hidden }),
      h('span', { class: 'brand-name', text: 'Cockpit' }),
    ]),
  ];
}
