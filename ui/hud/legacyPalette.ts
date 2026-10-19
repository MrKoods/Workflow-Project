// TEMPORARY (ORBIT-UPGRADE Task 2 → removed with the old HUD in Task 5):
// point the Frostbound color tokens at the palette variables so the legacy
// HUD recolors live too. Derived shades are color-mix()es of palette colors.
const mix = (a: string, pct: number, b: string) =>
  `color-mix(in srgb, ${a} ${pct}%, ${b})`;
const card = 'rgb(var(--card))';

const MAP: Record<string, string> = {
  '--color-ground': card,
  '--color-ground-glow': mix('var(--acc)', 12, card),
  '--color-shadow': mix(card, 40, 'black'),
  '--color-task': 'var(--acc)',
  '--color-task-bright': mix('var(--acc)', 25, 'white'),
  '--color-task-deep': mix('var(--acc)', 65, 'black'),
  '--color-ice': mix('var(--acc)', 70, 'white'),
  '--color-frost': mix('var(--acc)', 40, 'white'),
  '--color-white': 'white',
  '--color-mist': mix('var(--text)', 70, 'var(--acc)'),
  '--color-companion': 'var(--acc2)',
  '--color-companion-bright': mix('var(--acc2)', 20, 'white'),
  '--color-companion-soft': mix('var(--acc2)', 70, 'white'),
  '--color-companion-text': mix('var(--acc2)', 65, 'var(--muted)'),
  '--color-companion-done': mix('var(--acc2)', 75, 'black'),
  '--color-aurora': 'var(--c3)',
  '--color-text': 'var(--text)',
  '--color-text-bright': mix('var(--text)', 80, 'white'),
  '--color-muted': 'var(--muted)',
  '--color-muted-dim': mix('var(--muted)', 80, 'black'),
  '--color-muted-deep': mix('var(--muted)', 65, 'black'),
  '--color-log-text': mix('var(--text)', 70, 'var(--muted)'),
  '--color-slot-text': mix('var(--text)', 70, 'var(--acc)'),
  '--color-stale': mix('var(--muted)', 35, card),
  '--color-ink': mix(card, 80, 'black'),
  '--orb-palette-core1': mix('var(--acc2)', 15, 'white'),
  '--orb-palette-core2': mix('var(--acc2)', 75, 'white'),
  '--orb-palette-core3': mix('var(--acc2)', 55, 'black'),
  '--orb-palette-core4': mix('var(--acc2)', 12, 'black'),
  '--orb-handoff-palette-core1': 'white',
  '--orb-handoff-palette-core2': mix('var(--acc)', 70, 'white'),
  '--orb-handoff-palette-core3': mix('var(--acc)', 55, 'black'),
  '--orb-handoff-palette-core4': mix('var(--acc)', 12, 'black'),
};

export function bridgeLegacyTokens(root = document.documentElement) {
  for (const [prop, value] of Object.entries(MAP))
    root.style.setProperty(prop, value);
}
