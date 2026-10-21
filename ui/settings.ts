// Settings → the "Control Deck": one glass panel over the orbit with three
// sections. Look (color skins as live mini scenes, calm mode), Voice (speech,
// volume, style, a voice for Playful and one for Steady, with previews) and
// Keys (every hotkey as keycaps; click Change and press new keys). Every
// change saves at once through the orchestrator. Palette variables only.
import {
  HOTKEYS,
  comboOf,
  comboProblem,
  effectiveHotkeys,
  hotkeyDef,
  type HotkeyAction,
} from '../orchestrator/keymap';
import type {
  CockpitApi,
  Settings,
  WakeStatusView,
} from '../orchestrator/types';
import { hotkey } from './keys';
import { h } from './panels/dom';
import {
  PALETTES,
  currentPalette,
  faceOf,
  usePalette,
  type Palette,
} from './palette';
import { VOICE_OPTIONS } from './voice/voices';

type Tab = 'look' | 'voice' | 'keys';

// A word for each skin's mood (SKINS.md "Feel"); new skins just show none.
const FEEL: Record<string, string> = {
  ice: 'Hologram · white-hot pulses',
  synapse: 'Hologram · cyan to magenta',
  solar: 'Hologram · gold to coral',
  glacier: 'Pixel · fine, ice to violet',
  arcade: 'Pixel · chunky 8-bit, pink to cyan',
  phosphor: 'Pixel · green CRT dots',
  aqua: 'Cool, crisp',
  ember: 'Warm fire',
  nebula: 'Cosmic violet',
  aurora: 'Northern lights',
  frost: 'Ice',
  crimson: 'Intense',
  eclipse: 'Monochrome + gold',
};

const STYLE_TEXT: Record<Settings['voice'], string> = {
  auto: 'Playful while you talk between steps, steady and focused while a step is open.',
  steady: 'Calm and to the point, all the time.',
  playful: 'Warm and a little funny, all the time.',
};

const keycaps = (combo: string) =>
  h(
    'span',
    { class: 'caps' },
    combo.split(/\+(?!$)/).map((k) => h('kbd', { text: k })),
  );

const toggle = (
  label: string,
  hint: string,
  onChange: (on: boolean) => void,
) => {
  const input = h('input', { attrs: { type: 'checkbox', role: 'switch' } });
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label', { class: 'cd-toggle' }, [
    h('span', { class: 'cd-tg-text' }, [
      h('b', { text: label }),
      h('small', { text: hint }),
    ]),
    input,
    h('i', { attrs: { 'aria-hidden': 'true' } }),
  ]);
  return { el, set: (on: boolean) => (input.checked = on) };
};

export function createSettingsPanel(api: CockpitApi) {
  let settings: Settings | null = null;
  let tab: Tab = 'look';
  const save = async (patch: Partial<Settings>) => {
    settings = await api.setSettings(patch);
    paint();
  };

  // ---- Look ----------------------------------------------------------------
  const skinCard = (p: Palette) =>
    h(
      'button',
      {
        class: 'cd-skin',
        attrs: { type: 'button', 'aria-pressed': 'false', 'data-id': p.id },
        // The card is a tiny Orbit scene drawn from the palette file itself.
        vars: {
          '--g1': p.ground.center,
          '--g2': p.ground.mid,
          '--g3': p.ground.edge,
          '--pa': p.accent,
          '--pr': p.reply,
          '--pt': p.third,
        },
        on: { click: () => void chooseSkin(p.id) },
      },
      [
        h('span', { class: 'cd-scene', attrs: { 'aria-hidden': 'true' } }, [
          h('i', { class: 'cd-ring' }),
          h('i', { class: 'cd-core' }),
          h('i', { class: 'cd-moon' }),
          h('i', { class: 'cd-chip' }),
        ]),
        h('span', { class: 'cd-skin-name' }, [
          h('b', { text: p.name }),
          h('small', { text: FEEL[p.id] ?? '' }),
        ]),
        h('em', { class: 'cd-active', text: 'Active' }),
      ],
    );
  const skins = PALETTES.map(skinCard);
  const layoutBtns = (
    [
      ['hud', 'Tech HUD'],
      ['orbit', 'Orbit'],
    ] as const
  ).map(([v, label]) =>
    h('button', {
      class: 'cd-seg-btn',
      text: label,
      attrs: { type: 'button', 'aria-pressed': 'false', 'data-v': v },
      on: { click: () => void save({ layout: v }) },
    }),
  );
  const layoutText = h('p', { class: 'cd-note' });
  const faceBtns = (
    [
      ['auto', 'Auto'],
      ['circuit', 'Circuit'],
      ['pixel', 'Pixel'],
    ] as const
  ).map(([v, label]) =>
    h('button', {
      class: 'cd-seg-btn',
      text: label,
      attrs: { type: 'button', 'aria-pressed': 'false', 'data-v': v },
      on: { click: () => void save({ holoFace: v }) },
    }),
  );
  const faceText = h('p', { class: 'cd-note' });
  const faceRow = h('div', { class: 'cd-row cd-row-col' }, [
    h('b', { class: 'cd-sub', text: 'Hologram face' }),
    h(
      'div',
      {
        class: 'cd-seg',
        attrs: { role: 'group', 'aria-label': 'Hologram face' },
      },
      faceBtns,
    ),
    faceText,
  ]);
  // Skins grouped by the face they carry (holo.mat; none = Classic), so a new
  // palette file lands in the right group with no code change.
  const GROUPS = [
    ['circuit', 'Circuit skins'],
    ['pixel', 'Pixel skins'],
    ['classic', 'Classic'],
  ] as const;
  const skinGroups = GROUPS.map(([g, title]) => {
    const cards = skins.filter(
      (c) => faceOf(PALETTES.find((p) => p.id === c.dataset.id)!) === g,
    );
    return cards.length
      ? [
          h('h4', { class: 'cd-group', text: title }),
          h('div', { class: 'cd-skins' }, cards),
        ]
      : [];
  }).flat();
  async function chooseSkin(id: string) {
    usePalette(id); // instant; the save follows
    // A circuit or pixel skin always shows its own face: clear a forced face
    // that points the other way.
    const g = faceOf(PALETTES.find((p) => p.id === id)!);
    const face = settings?.holoFace ?? 'auto';
    const patch: Partial<Settings> = { palette: id };
    if (g !== 'classic' && face !== 'auto' && face !== g)
      patch.holoFace = 'auto';
    await save(patch);
  }
  const calm = toggle(
    'Calm mode',
    'Slower, quieter motion. Windows “reduce motion” does the same.',
    (on) => void save({ calm: on }),
  );
  const lookPane = h(
    'section',
    { class: 'cd-pane', attrs: { 'data-tab': 'look' } },
    [
      h('header', { class: 'cd-pane-head' }, [
        h('h3', { text: 'Interface' }),
        h('p', {
          text: 'Tech HUD: modules around a talking hologram head. Orbit: your steps circle the Bloom companion.',
        }),
      ]),
      h('div', { class: 'cd-row cd-row-col' }, [
        h(
          'div',
          {
            class: 'cd-seg',
            attrs: { role: 'group', 'aria-label': 'Interface' },
          },
          layoutBtns,
        ),
        layoutText,
      ]),
      faceRow,
      h('header', { class: 'cd-pane-head' }, [
        h('h3', { text: 'Color skin' }),
        h('p', {
          text: 'Each skin recolors everything at once, in either interface. Circuit and Pixel skins also set the hologram’s face and eyes.',
        }),
      ]),
      ...skinGroups,
      calm.el,
    ],
  );

  // ---- Voice -----------------------------------------------------------------
  const nameInput = h('input', {
    class: 'cd-name',
    attrs: {
      type: 'text',
      maxlength: '24',
      'aria-label': 'Companion name',
      spellcheck: 'false',
    },
  });
  nameInput.addEventListener('change', () => {
    const v = nameInput.value.trim();
    if (v) void save({ companionName: v });
    else nameInput.value = settings?.companionName ?? '';
  });
  const speak = toggle(
    'Speaks out loud',
    'Off = captions only. Push-to-talk keeps working.',
    (on) => void save({ speech: on }),
  );
  const wake = toggle(
    'Wake word',
    'Say it and start talking, no key needed. The mic stays open on this PC; nothing is sent until the word is heard.',
    (on) => void save({ wakeWord: on }),
  );
  const convo = toggle(
    'Keep listening',
    'After the wake word, the mic reopens when I finish answering, so you just keep talking. Stay quiet a few seconds or say “that’s all” to end.',
    (on) => void save({ conversation: on }),
  );
  const wakeNote = h('p', { class: 'cd-note cd-wake-note' });
  let wakeStatus: WakeStatusView = { state: 'off' };
  const paintWake = () => {
    const s = wakeStatus;
    const on = settings?.wakeWord;
    wakeNote.textContent =
      s.state === 'missing'
        ? 'No wake model in the wake/ folder (see docs/WAKE-WORD.md).'
        : s.state === 'error'
          ? `The wake model didn't load: ${s.error}`
          : s.state === 'loading'
            ? 'Loading the wake model…'
            : on
              ? `Listening for “${s.word}”.`
              : s.word
                ? `Wake word: “${s.word}”.`
                : '';
  };
  const volume = h('input', {
    class: 'cd-range',
    attrs: {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      'aria-label': 'Speech volume',
    },
  });
  const volumeOut = h('output', { class: 'cd-range-val' });
  volume.addEventListener(
    'input',
    () => (volumeOut.textContent = `${volume.value}%`),
  );
  volume.addEventListener(
    'change',
    () => void save({ volume: Number(volume.value) / 100 }),
  );

  const styleBtns = (['auto', 'steady', 'playful'] as const).map((v) =>
    h('button', {
      class: 'cd-seg-btn',
      text: v === 'auto' ? 'Auto' : v === 'steady' ? 'Steady' : 'Playful',
      attrs: { type: 'button', 'aria-pressed': 'false', 'data-v': v },
      on: { click: () => void save({ voice: v }) },
    }),
  );
  const styleText = h('p', { class: 'cd-note' });

  const slot = (
    key: 'voicePlayful' | 'voiceSteady',
    title: string,
    hint: string,
  ) => {
    const cards = VOICE_OPTIONS.map((o) => {
      const play = h('button', {
        class: 'cd-play',
        text: '▶',
        attrs: { type: 'button', 'aria-label': `Hear ${o.name}` },
        on: {
          click: (e) => {
            e.stopPropagation();
            play.classList.add('on');
            void api
              .speechPreview(o.id)
              .finally(() => play.classList.remove('on'));
          },
        },
      });
      const pick = () => void save({ [key]: o.id });
      return h(
        'div',
        {
          class: 'cd-voice',
          attrs: {
            role: 'button',
            tabindex: '0',
            'aria-pressed': 'false',
            'data-id': o.id,
          },
          on: {
            click: pick,
            keydown: (e) => {
              const k = (e as KeyboardEvent).key;
              if (k === 'Enter' || k === ' ') {
                e.preventDefault();
                pick();
              }
            },
          },
        },
        [
          h('span', { class: 'cd-wave', attrs: { 'aria-hidden': 'true' } }, [
            h('i'),
            h('i'),
            h('i'),
            h('i'),
            h('i'),
          ]),
          h('span', { class: 'cd-voice-text' }, [
            h('b', { text: o.name }),
            h('small', { text: `${o.kind} · ${o.traits}` }),
          ]),
          play,
        ],
      );
    });
    const el = h('div', { class: 'cd-slot' }, [
      h('div', { class: 'cd-slot-head' }, [
        h('b', { text: title }),
        h('small', { text: hint }),
      ]),
      h('div', { class: 'cd-voices' }, cards),
    ]);
    return {
      el,
      paint: (id: string) =>
        cards.forEach((c) =>
          c.setAttribute('aria-pressed', String(c.dataset.id === id)),
        ),
    };
  };
  const playfulSlot = slot(
    'voicePlayful',
    'Playful voice',
    'Intro, between steps, wrap-up',
  );
  const steadySlot = slot(
    'voiceSteady',
    'Steady voice',
    'While a step’s card is open',
  );

  const voicePane = h(
    'section',
    { class: 'cd-pane', attrs: { 'data-tab': 'voice' } },
    [
      h('header', { class: 'cd-pane-head' }, [
        h('h3', { text: 'Your companion’s voice' }),
        h('p', {
          text: 'Press ▶ to hear a voice. Speech runs on Deepgram; nothing is sent unless you hold the talk key.',
        }),
      ]),
      h('div', { class: 'cd-row' }, [
        h('span', { class: 'cd-row-label' }, [h('b', { text: 'Name' })]),
        nameInput,
        h('small', {
          class: 'cd-note',
          text: 'Shown on screen and used by the companion.',
        }),
      ]),
      speak.el,
      wake.el,
      wakeNote,
      convo.el,
      h('div', { class: 'cd-row' }, [
        h('span', { class: 'cd-row-label' }, [h('b', { text: 'Volume' })]),
        volume,
        volumeOut,
      ]),
      h('div', { class: 'cd-row cd-row-col' }, [
        h('span', { class: 'cd-row-label' }, [h('b', { text: 'Style' })]),
        h(
          'div',
          {
            class: 'cd-seg',
            attrs: { role: 'group', 'aria-label': 'Voice style' },
          },
          styleBtns,
        ),
        styleText,
      ]),
      playfulSlot.el,
      steadySlot.el,
    ],
  );

  // ---- Keys ------------------------------------------------------------------
  let capturing: HotkeyAction | null = null;
  const keyMsg = h('p', {
    class: 'cd-key-msg',
    attrs: { 'aria-live': 'polite' },
  });
  const say = (text: string, bad = false) => {
    keyMsg.textContent = text;
    keyMsg.classList.toggle('bad', bad);
  };
  const rows = new Map<
    HotkeyAction,
    {
      caps: HTMLElement;
      change: HTMLButtonElement;
      reset: HTMLButtonElement;
      row: HTMLElement;
    }
  >();
  const groups = [...new Set(HOTKEYS.map((k) => k.group))];
  const keyList = h(
    'div',
    { class: 'cd-keys' },
    groups.map((g) =>
      h('div', { class: 'cd-key-group' }, [
        h('h4', { text: g === 'Anywhere' ? 'Anywhere in Windows' : g }),
        ...HOTKEYS.filter((k) => k.group === g).map((k) => {
          const caps = h('span', { class: 'cd-caps' });
          const change = h('button', {
            class: 'cd-mini',
            text: 'Change',
            attrs: { type: 'button' },
            on: { click: () => startCapture(k.action) },
          });
          const reset = h('button', {
            class: 'cd-mini cd-ghost',
            text: 'Reset',
            attrs: { type: 'button' },
            on: { click: () => void setKey(k.action, k.default) },
          });
          const row = h('div', { class: 'cd-key' }, [
            h('span', { class: 'cd-key-label' }, [
              h('b', { text: k.label }),
              k.scope === 'global'
                ? h('em', { class: 'cd-badge', text: 'global' })
                : null,
              k.hold ? h('em', { class: 'cd-badge', text: 'hold' }) : null,
            ]),
            caps,
            h('span', { class: 'cd-key-btns' }, [change, reset]),
          ]);
          rows.set(k.action, { caps, change, reset, row });
          return row;
        }),
      ]),
    ),
  );
  const resetAll = h('button', {
    class: 'cd-mini cd-ghost',
    text: 'Reset all keys',
    attrs: { type: 'button' },
    on: {
      click: () =>
        void save({ hotkeys: {} }).then(() =>
          say('All keys are back to their defaults.'),
        ),
    },
  });
  const keysPane = h(
    'section',
    { class: 'cd-pane', attrs: { 'data-tab': 'keys' } },
    [
      h('header', { class: 'cd-pane-head cd-pane-head-row' }, [
        h('span', {}, [
          h('h3', { text: 'Hotkeys' }),
          h('p', {
            text: 'Click Change, then press the new keys. Esc cancels, and always means cancel / close.',
          }),
        ]),
        resetAll,
      ]),
      keyMsg,
      keyList,
    ],
  );

  function startCapture(action: HotkeyAction) {
    capturing = action;
    say(`Press the new keys for “${hotkeyDef(action).label}”…`);
    paintKeys();
  }

  async function setKey(
    action: HotkeyAction,
    combo: string,
    swapWith?: HotkeyAction,
  ) {
    const overrides = { ...settings?.hotkeys };
    const before = effectiveHotkeys(overrides);
    if (swapWith) overrides[swapWith] = before[action];
    overrides[action] = combo;
    for (const a of [action, swapWith])
      if (a && overrides[a] === hotkeyDef(a).default) delete overrides[a];
    await save({ hotkeys: overrides });
    if (effectiveHotkeys(settings?.hotkeys)[action] !== combo) {
      say('That key couldn’t be saved.', true);
      return;
    }
    // Global keys: Windows may refuse one another app already owns.
    if (hotkeyDef(action).scope === 'global') {
      const trouble = await api.hotkeyTrouble();
      if (trouble[action]) {
        const back = { ...settings?.hotkeys };
        if (before[action] === hotkeyDef(action).default) delete back[action];
        else back[action] = before[action];
        await save({ hotkeys: back });
        say(`Another app already uses ${combo}. Kept ${before[action]}.`, true);
        return;
      }
    }
    say(
      swapWith
        ? `Swapped: “${hotkeyDef(swapWith).label}” is now ${before[action]}.`
        : `${hotkeyDef(action).label}: ${combo}`,
    );
  }

  // Capture before anything else (talk keys, Orbit keys, Esc closing the deck).
  window.addEventListener(
    'keydown',
    (e) => {
      if (!capturing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        capturing = null;
        say('');
        paintKeys();
        return;
      }
      const combo = comboOf(e);
      if (!combo) return; // still holding modifiers
      const action = capturing;
      const problem = comboProblem(action, combo);
      if (problem) {
        say(`${combo}: ${problem}`, true);
        return;
      }
      const keys = effectiveHotkeys(settings?.hotkeys);
      const clash = (Object.keys(keys) as HotkeyAction[]).find(
        (a) => a !== action && keys[a] === combo,
      );
      capturing = null;
      if (clash) {
        // Offer a swap rather than refusing (when the old key suits the other action).
        if (comboProblem(clash, keys[action])) {
          say(
            `${combo} is used by “${hotkeyDef(clash).label}”. Change that one first.`,
            true,
          );
        } else {
          say(`${combo} is used by “${hotkeyDef(clash).label}”. `, true);
          keyMsg.append(
            h('button', {
              class: 'cd-mini',
              text: 'Swap them',
              attrs: { type: 'button' },
              on: { click: () => void setKey(action, combo, clash) },
            }),
          );
        }
        paintKeys();
        return;
      }
      void setKey(action, combo);
    },
    true,
  );

  function paintKeys() {
    const keys = effectiveHotkeys(settings?.hotkeys);
    for (const [action, r] of rows) {
      const live = capturing === action;
      r.row.classList.toggle('capturing', live);
      r.caps.replaceChildren(
        live
          ? h('span', { class: 'cd-press', text: 'Press keys…' })
          : keycaps(keys[action]),
      );
      r.change.textContent = live ? 'Listening' : 'Change';
      r.reset.hidden = keys[action] === hotkeyDef(action).default;
    }
  }

  // ---- shell -----------------------------------------------------------------
  const tabs: { id: Tab; icon: string; title: string; sub: string }[] = [
    { id: 'look', icon: '◐', title: 'Look', sub: 'Color skins & motion' },
    {
      id: 'voice',
      icon: '◉',
      title: 'Voice',
      sub: 'How your companion sounds',
    },
    {
      id: 'keys',
      icon: '⌘',
      title: 'Keys',
      sub: 'Every hotkey, yours to change',
    },
  ];
  const tabBtns = tabs.map((t) =>
    h(
      'button',
      {
        class: 'cd-tab',
        attrs: {
          type: 'button',
          role: 'tab',
          'data-tab': t.id,
          'aria-selected': 'false',
        },
        on: {
          click: () => {
            tab = t.id;
            capturing = null;
            say('');
            paint();
          },
        },
      },
      [
        h('span', {
          class: 'cd-tab-ic',
          text: t.icon,
          attrs: { 'aria-hidden': 'true' },
        }),
        h('span', {}, [h('b', { text: t.title }), h('small', { text: t.sub })]),
      ],
    ),
  );
  const status = h('div', { class: 'cd-status' });
  const panes = [lookPane, voicePane, keysPane];
  const closeBtn = h('button', {
    class: 'cd-close',
    text: '✕',
    attrs: { type: 'button', 'aria-label': 'Close settings' },
    on: { click: () => setOpen(false) },
  });
  const deck = h(
    'div',
    {
      class: 'cd-deck',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Settings',
        tabindex: '-1',
      },
    },
    [
      h(
        'nav',
        {
          class: 'cd-rail',
          attrs: { role: 'tablist', 'aria-label': 'Settings sections' },
        },
        [
          h('div', { class: 'cd-brand' }, [
            h('b', { text: 'Control deck' }),
            h('small', { text: 'Changes save instantly' }),
          ]),
          ...tabBtns,
          status,
        ],
      ),
      h('div', { class: 'cd-body' }, [closeBtn, ...panes]),
    ],
  );
  const overlay = h('div', { class: 'cd-overlay', attrs: { hidden: '' } }, [
    deck,
  ]);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) setOpen(false);
  });

  function paint() {
    if (!settings) return;
    const s = settings;
    tabBtns.forEach((b) =>
      b.setAttribute('aria-selected', String(b.dataset.tab === tab)),
    );
    panes.forEach((p) => (p.hidden = p.dataset.tab !== tab));
    const pal = currentPalette()?.id ?? s.palette;
    skins.forEach((c) =>
      c.setAttribute('aria-pressed', String(c.dataset.id === pal)),
    );
    layoutBtns.forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.v === s.layout)),
    );
    layoutText.textContent =
      s.layout === 'hud'
        ? 'Hologram head in the middle; the work slides into the center module.'
        : 'Bloom in the middle; the current step pops out of the orbit.';
    faceRow.hidden = s.layout !== 'hud';
    faceBtns.forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.v === s.holoFace)),
    );
    faceText.textContent = {
      auto: 'Each skin brings its own face: circuit particles or pixels.',
      circuit: 'Always circuit particles and traces, whatever the skin.',
      pixel: 'Always pixels; skins without a pixel face get fine 8-bit pixels.',
    }[s.holoFace];
    calm.set(s.calm);
    speak.set(s.speech);
    if (document.activeElement !== nameInput) nameInput.value = s.companionName;
    wake.set(s.wakeWord);
    convo.set(s.conversation);
    paintWake();
    volume.value = String(Math.round(s.volume * 100));
    volumeOut.textContent = `${volume.value}%`;
    styleBtns.forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.v === s.voice)),
    );
    styleText.textContent = STYLE_TEXT[s.voice];
    playfulSlot.paint(s.voicePlayful);
    steadySlot.paint(s.voiceSteady);
    status.replaceChildren(
      h('span', {}, ['Talk ', keycaps(hotkey('pushToTalk'))]),
      h('span', {}, ['Settings ', keycaps(hotkey('settings'))]),
    );
    paintKeys();
  }

  function setOpen(open: boolean) {
    overlay.hidden = !open;
    capturing = null;
    say('');
    if (open) {
      paint();
      deck.focus(); // the deck, so no tab shows a stray focus ring
    }
  }

  return {
    els: [overlay],
    get open() {
      return !overlay.hidden;
    },
    toggle: (open: boolean = overlay.hidden === true) => setOpen(open),
    /** Open on a tab (Echo: "open the voice settings"). */
    openTab(t?: Tab) {
      if (t) tab = t;
      setOpen(true);
    },
    /** Apply settings from a snapshot (startup, or changed elsewhere). */
    update(next: Settings) {
      settings = next;
      usePalette(next.palette);
      if (!overlay.hidden) paint();
    },
    /** The wake word's state from the orchestrator (model loaded, stand-in…). */
    setWakeStatus(s: WakeStatusView) {
      wakeStatus = s;
      paintWake();
    },
    /** Hotkey: next color skin. */
    cycle() {
      const i = PALETTES.findIndex((p) => p.id === currentPalette()?.id);
      void chooseSkin(PALETTES[(i + 1) % PALETTES.length].id);
    },
    get settings() {
      return settings;
    },
  };
}

export type SettingsPanel = ReturnType<typeof createSettingsPanel>;
