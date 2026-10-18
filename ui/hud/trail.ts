import { h, svg } from './dom';
import type { Objective } from '../../orchestrator/types';
import type { BundleItem } from './types';

// The trail is drawn in a 1440×340 box stretched to the window width.
const W = 1440;
const H = 340;
const trailY = (x: number) =>
  200 + 42 * Math.sin((x / W) * Math.PI * 2 * 1.1 + 0.5);
const contextY = (x: number) =>
  50 + 14 * Math.sin((x / W) * Math.PI * 2 * 1.6 + 2.0);

const pathFor = (fy: (x: number) => number) => {
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 24) pts.push(`${x},${fy(x).toFixed(1)}`);
  return 'M' + pts.join(' L');
};

// Spread n points across 12%..84% (the prototype's spacing for 5), keeping the ends clear.
const spread = (n: number, from: number, to: number) =>
  Array.from({ length: n }, (_, i) =>
    n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1),
  );

type NodeState = 'done' | 'now' | 'next';

export function createTrail(titles: string[], bundle: BundleItem[]) {
  const flow = pathFor(trailY);
  const stroke = (cls: string, d: string) =>
    svg('path', { class: cls, d, 'vector-effect': 'non-scaling-stroke' });
  const layer = (cls: string, paths: SVGElement[]) =>
    svg(
      'svg',
      {
        class: cls,
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: 'none',
        'aria-hidden': 'true',
      },
      paths,
    );

  // Progress is its own layer clipped to --prog. Dash tricks (pathLength +
  // dashoffset) break under non-scaling-stroke once the viewBox is stretched.
  const progress = layer('trail-svg trail-svg--progress', [
    stroke('trail-progress', flow),
  ]);

  const el = h(
    'section',
    { class: 'trail', attrs: { 'aria-label': 'Quest trail' } },
    [
      layer('trail-svg', [
        stroke('trail-context', pathFor(contextY)),
        stroke('trail-glow', flow),
        stroke('trail-base', flow),
        stroke('trail-pulse', flow),
      ]),
      progress,
    ],
  );

  // Bundle items float along the upper context line.
  const fx = spread(bundle.length, 0.08, 0.9);
  bundle.forEach((item, i) => {
    el.append(
      h(
        'span',
        {
          class: 'trail-frag',
          vars: {
            '--x': `${(fx[i] * 100).toFixed(2)}%`,
            '--y': `${contextY(fx[i] * W).toFixed(1)}px`,
            '--delay': `${(i * 0.8).toFixed(1)}s`,
          },
        },
        [
          h('span', {
            class: 'trail-frag-pip',
            attrs: {
              'aria-hidden': 'true',
              ...(item.stale ? { 'data-stale': '' } : {}),
            },
          }),
          item.name,
        ],
      ),
    );
  });

  // Nodes are display-only: progress changes through the orchestrator, not by clicking the trail.
  const xs = spread(titles.length, 0.12, 0.84);
  const marker = h('span', {
    class: 'trail-marker',
    attrs: { 'aria-hidden': 'true' },
  });
  const nodes = titles.map((title, i) => {
    const y = trailY(xs[i] * W);
    const x = `${(xs[i] * 100).toFixed(2)}%`;
    const shape = h('span', { class: 'trail-node-shape' });
    const node = h(
      'span',
      {
        class: 'trail-node',
        vars: { '--x': x, '--y': `${y.toFixed(1)}px` },
        attrs: { role: 'img' },
      },
      [shape],
    );
    const label = h('span', {
      class: 'trail-label',
      text: title,
      attrs: { 'aria-hidden': 'true' },
      vars: { '--x': x, '--y': `${(y + 24).toFixed(1)}px` },
    });
    el.append(node, label);
    return { node, shape, label, title, x, y };
  });
  el.append(marker);

  return {
    el,
    update(objectives: Objective[]) {
      const step = objectives.findIndex((o) => !o.done);
      const allDone = step < 0;
      nodes.forEach((n, i) => {
        const state: NodeState = objectives[i]?.done
          ? 'done'
          : i === step
            ? 'now'
            : 'next';
        n.shape.dataset.state = state;
        n.label.dataset.state = state;
        n.node.setAttribute(
          'aria-label',
          `Objective ${i + 1}, ${state === 'now' ? 'current' : state}: ${n.title}`,
        );
      });
      marker.hidden = allDone;
      if (!allDone) {
        marker.style.setProperty('--x', nodes[step].x);
        marker.style.setProperty('--y', `${nodes[step].y.toFixed(1)}px`);
      }
      const progX = allDone ? 1 : xs[step];
      progress.style.setProperty('--prog', `${(progX * 100).toFixed(2)}%`);
    },
  };
}
