// Settings panel: Color skin swatches (live switch, persisted by the
// orchestrator). Palette-styled; lives inside the Orbit root.
import type { CockpitApi, Settings } from '../orchestrator/types';
import { h } from './panels/dom';
import { PALETTES, currentPalette, usePalette } from './palette';

export function createSettingsPanel(api: CockpitApi) {
  let settings: Settings | null = null;

  const swatches = PALETTES.map((p) =>
    h(
      'button',
      {
        class: 'sw-pal',
        // Swatch = gradient accent → reply, straight from the palette file.
        vars: { '--sa': p.accent, '--sb': p.reply },
        attrs: { type: 'button', 'aria-pressed': 'false', title: p.name },
        on: { click: () => void choose(p.id) },
      },
      [
        h('i', { attrs: { 'aria-hidden': 'true' } }),
        h('span', { text: p.name }),
      ],
    ),
  );

  const panel = h(
    'div',
    {
      class: 'settings-panel',
      attrs: { role: 'dialog', 'aria-label': 'Settings', hidden: '' },
    },
    [
      h('div', { class: 'set-head' }, [
        h('b', { text: 'Settings' }),
        h('button', {
          class: 'set-close',
          text: 'Close',
          attrs: { type: 'button' },
          on: { click: () => toggle(false) },
        }),
      ]),
      h('section', { class: 'set-sec' }, [
        h('h3', { text: 'Color skin' }),
        h('div', { class: 'set-swatches' }, swatches),
      ]),
    ],
  );

  const button = h('button', {
    class: 'settings-btn',
    text: 'Settings',
    attrs: { type: 'button', 'aria-haspopup': 'dialog' },
    on: { click: () => toggle() },
  });

  const toggle = (open = panel.hidden) => {
    panel.hidden = !open;
    if (open) swatches.find((s) => s.ariaPressed === 'true')?.focus();
  };

  const mark = (id: string) =>
    swatches.forEach((s, i) =>
      s.setAttribute('aria-pressed', String(PALETTES[i].id === id)),
    );

  async function choose(id: string) {
    usePalette(id); // instant; the save follows
    mark(id);
    settings = await api.setSettings({ palette: id });
  }

  return {
    els: [button, panel],
    get open() {
      return !panel.hidden;
    },
    toggle,
    /** Apply settings from a snapshot (startup, or changed elsewhere). */
    update(next: Settings) {
      settings = next;
      usePalette(next.palette);
      mark(currentPalette()!.id);
    },
    /** Debug hotkey Ctrl+Shift+P: next palette. */
    cycle() {
      const i = PALETTES.findIndex((p) => p.id === currentPalette()?.id);
      void choose(PALETTES[(i + 1) % PALETTES.length].id);
    },
    get settings() {
      return settings;
    },
  };
}

export type SettingsPanel = ReturnType<typeof createSettingsPanel>;
