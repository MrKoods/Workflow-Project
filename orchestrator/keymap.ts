// Hotkeys as named actions (Settings → Keys). A combo is written the way it
// shows on screen: modifiers then one key, e.g. "Ctrl+Alt+V", "RightCtrl",
// "Left", "6", "F3", "Ctrl+,". The same strings work in the window (matched
// against KeyboardEvent.code) and for global shortcuts (converted to an
// Electron accelerator). Shared by the orchestrator, main and the UI.

export type HotkeyScope = 'global' | 'app';
export type HotkeyAction =
  | 'toggleWindow'
  | 'quit'
  | 'talkToggle'
  | 'pushToTalk'
  | 'stepPrev'
  | 'stepNext'
  | 'stepCurrent'
  | 'newQuest'
  | 'journal'
  | 'working'
  | 'mute'
  | 'calm'
  | 'nextSkin'
  | 'settings'
  | 'debugCompanion';

export interface HotkeyDef {
  action: HotkeyAction;
  label: string;
  group: 'Anywhere' | 'Talk' | 'Orbit' | 'Quest' | 'Look & sound' | 'Debug';
  scope: HotkeyScope;
  default: string;
  /** Held down (push-to-talk) rather than pressed. */
  hold?: boolean;
}

export const HOTKEYS: HotkeyDef[] = [
  {
    action: 'toggleWindow',
    label: 'Show / hide Cockpit',
    group: 'Anywhere',
    scope: 'global',
    default: 'Ctrl+Alt+C',
  },
  {
    action: 'quit',
    label: 'Quit Cockpit',
    group: 'Anywhere',
    scope: 'global',
    default: 'Ctrl+Alt+Q',
  },
  {
    action: 'talkToggle',
    label: 'Talk from any app (tap, tap)',
    group: 'Anywhere',
    scope: 'global',
    default: 'Ctrl+Alt+V',
  },
  {
    action: 'pushToTalk',
    label: 'Push to talk (hold)',
    group: 'Talk',
    scope: 'app',
    default: 'RightCtrl',
    hold: true,
  },
  {
    action: 'stepPrev',
    label: 'Previous step',
    group: 'Orbit',
    scope: 'app',
    default: 'Left',
  },
  {
    action: 'stepNext',
    label: 'Next step',
    group: 'Orbit',
    scope: 'app',
    default: 'Right',
  },
  {
    action: 'stepCurrent',
    label: 'Back to the current step',
    group: 'Orbit',
    scope: 'app',
    default: 'Home',
  },
  {
    action: 'newQuest',
    label: 'New quest',
    group: 'Quest',
    scope: 'app',
    default: '1',
  },
  {
    action: 'journal',
    label: 'Journal',
    group: 'Quest',
    scope: 'app',
    default: '6',
  },
  {
    action: 'working',
    label: "I'm working (stop the setup timer)",
    group: 'Quest',
    scope: 'app',
    default: 'W',
  },
  {
    action: 'mute',
    label: 'Mute / unmute the companion',
    group: 'Look & sound',
    scope: 'app',
    default: 'M',
  },
  {
    action: 'calm',
    label: 'Calm mode',
    group: 'Look & sound',
    scope: 'app',
    default: 'F3',
  },
  {
    action: 'nextSkin',
    label: 'Next color skin',
    group: 'Look & sound',
    scope: 'app',
    default: 'Ctrl+Shift+P',
  },
  {
    action: 'settings',
    label: 'Open settings',
    group: 'Look & sound',
    scope: 'app',
    default: 'Ctrl+,',
  },
  {
    action: 'debugCompanion',
    label: 'Cycle companion states',
    group: 'Debug',
    scope: 'app',
    default: 'F2',
  },
];

export const HOTKEY_ACTIONS = HOTKEYS.map((h) => h.action);
const DEF = new Map(HOTKEYS.map((h) => [h.action, h]));
export const hotkeyDef = (a: HotkeyAction) => DEF.get(a)!;

const MODS = ['Ctrl', 'Alt', 'Shift', 'Win'] as const;
/** Keys that are only ever modifiers. Lone RightCtrl/RightAlt are allowed for holds. */
const LONE_MODIFIER = new Set(['RightCtrl', 'RightAlt', 'RightShift']);

// KeyboardEvent.code -> the name we show and store.
const CODE_NAMES: Record<string, string> = {
  ControlRight: 'RightCtrl',
  AltRight: 'RightAlt',
  ShiftRight: 'RightShift',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Escape: 'Esc',
};

/** The key part of a KeyboardEvent.code, or null for a modifier/unknown key. */
export function keyName(code: string): string | null {
  if (CODE_NAMES[code]) return CODE_NAMES[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (m) return m[1];
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return null; // ControlLeft, ShiftLeft, MetaLeft, … and unknown keys
}

interface KeyLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** The combo a key event stands for ("" for a lone left-hand modifier). */
export function comboOf(e: KeyLike): string {
  const key = keyName(e.code);
  if (!key) return '';
  if (LONE_MODIFIER.has(key)) return key; // its own modifier flag is set; ignore it
  const mods = [
    e.ctrlKey && 'Ctrl',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.metaKey && 'Win',
  ].filter(Boolean);
  return [...mods, key].join('+');
}

export const matches = (e: KeyLike, combo: string) =>
  !!combo && comboOf(e) === combo;

function parts(combo: string) {
  const all = combo.split('+');
  // "Ctrl++" style isn't used; "Ctrl+," splits fine.
  const key = all.pop() ?? '';
  return { mods: all, key };
}

/** Why a combo can't be used for an action, or null if it can. */
export function comboProblem(
  action: HotkeyAction,
  combo: string,
): string | null {
  const def = hotkeyDef(action);
  if (!def) return 'Unknown action.';
  const { mods, key } = parts(combo);
  if (!key || !mods.every((m) => (MODS as readonly string[]).includes(m)))
    return 'Not a key combination.';
  if (new Set(mods).size !== mods.length) return 'Not a key combination.';
  if (key === 'Esc') return 'Esc is kept for cancel / close.';
  if (LONE_MODIFIER.has(key)) {
    if (mods.length) return 'Not a key combination.';
    if (def.scope === 'global') return 'Global keys need a normal key.';
    if (!def.hold) return 'A lone modifier only works for push-to-talk.';
  }
  if (def.scope === 'global') {
    if (LONE_MODIFIER.has(key)) return 'Global keys need a normal key.';
    if (!mods.some((m) => m === 'Ctrl' || m === 'Alt' || m === 'Win'))
      return 'Global keys need Ctrl, Alt or Win, so they never eat your typing.';
  }
  return null;
}

/** Saved overrides on top of the defaults. */
export function effectiveHotkeys(
  overrides: Partial<Record<HotkeyAction, string>> = {},
): Record<HotkeyAction, string> {
  return Object.fromEntries(
    HOTKEYS.map((h) => [h.action, overrides[h.action] ?? h.default]),
  ) as Record<HotkeyAction, string>;
}

/** Actions that share a combo with another action. */
export function conflicts(keys: Record<HotkeyAction, string>): HotkeyAction[] {
  const seen = new Map<string, HotkeyAction[]>();
  for (const [a, c] of Object.entries(keys) as [HotkeyAction, string][])
    seen.set(c, [...(seen.get(c) ?? []), a]);
  return [...seen.values()].filter((v) => v.length > 1).flat();
}

/** Keep only valid, non-default, non-conflicting overrides (untrusted input). */
export function cleanHotkeys(
  input: unknown,
): Partial<Record<HotkeyAction, string>> {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<Record<HotkeyAction, string>> = {};
  for (const [a, c] of Object.entries(input as Record<string, unknown>)) {
    if (!DEF.has(a as HotkeyAction) || typeof c !== 'string' || c.length > 40)
      continue;
    if (comboProblem(a as HotkeyAction, c)) continue;
    if (c !== hotkeyDef(a as HotkeyAction).default) out[a as HotkeyAction] = c;
  }
  // A clash drops the overrides involved (defaults never clash).
  for (const a of conflicts(effectiveHotkeys(out))) delete out[a];
  return out;
}

/** "Ctrl+Alt+V" -> "Control+Alt+V" for Electron's globalShortcut. */
export function toAccelerator(combo: string): string {
  const { mods, key } = parts(combo);
  const map: Record<string, string> = { Ctrl: 'Control', Win: 'Super' };
  const k: Record<string, string> = { Esc: 'Escape' };
  return [...mods.map((m) => map[m] ?? m), k[key] ?? key].join('+');
}
