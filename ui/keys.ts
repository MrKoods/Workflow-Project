// The window's live hotkeys (Settings → Keys). Updated from every snapshot,
// so a rebound key works the moment it's saved.
import {
  effectiveHotkeys,
  keyName,
  matches,
  type HotkeyAction,
} from '../orchestrator/keymap';

let keys = effectiveHotkeys();

export const setHotkeys = (
  overrides: Partial<Record<HotkeyAction, string>> = {},
) => {
  keys = effectiveHotkeys(overrides);
};

export const hotkey = (action: HotkeyAction) => keys[action];

/**
 * Did this key event press the action's key? While typing in a text field,
 * only combos with Ctrl / Alt / Win count (plain keys are just typing).
 */
export function pressed(e: KeyboardEvent, action: HotkeyAction): boolean {
  if (!matches(e, keys[action])) return false;
  const typing = !!(e.target as HTMLElement | null)?.closest?.(
    'input, textarea, [contenteditable]',
  );
  return !typing || /^(Ctrl|Alt|Win)\+/.test(keys[action]);
}

/** Was this key-up the release of the action's (held) key? */
export const released = (e: KeyboardEvent, action: HotkeyAction) =>
  keyName(e.code) === keys[action].split('+').pop();
