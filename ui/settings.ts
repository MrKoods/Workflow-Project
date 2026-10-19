// Settings panel: Color skin swatches (live switch, persisted by the
// orchestrator). Palette-styled; lives inside the Orbit root.
import { VOICES, type CockpitApi, type Settings } from '../orchestrator/types';
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

  // Voice: same quest beats, different wording. Separate from the skin.
  // Auto = playful with the companion, steady (focus) while working a step.
  const VOICE_LABEL = {
    auto: 'Auto',
    steady: 'Steady',
    playful: 'Playful',
  } as const;
  const voices = VOICES.map((v) =>
    h('button', {
      class: 'set-opt',
      text: VOICE_LABEL[v],
      attrs: {
        type: 'button',
        'aria-pressed': 'false',
        ...(v === 'auto'
          ? { title: 'Playful with me, steady while you work a step' }
          : {}),
      },
      on: {
        click: async () => {
          settings = await api.setSettings({ voice: v });
          markVoice(v);
        },
      },
    }),
  );
  const markVoice = (v: Settings['voice']) =>
    voices.forEach((b, i) =>
      b.setAttribute('aria-pressed', String(VOICES[i] === v)),
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
      h('section', { class: 'set-sec' }, [
        h('h3', { text: 'Companion voice' }),
        h('div', { class: 'set-row' }, voices),
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
      markVoice(next.voice);
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
