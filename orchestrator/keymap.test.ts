import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HOTKEYS,
  cleanHotkeys,
  comboOf,
  comboProblem,
  conflicts,
  effectiveHotkeys,
  matches,
  toAccelerator,
} from './keymap.ts';

const key = (
  code: string,
  mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>> = {},
) => ({
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

test('keymap: key events become the combos we show', () => {
  assert.equal(comboOf(key('KeyV', { ctrl: true, alt: true })), 'Ctrl+Alt+V');
  assert.equal(comboOf(key('ControlRight', { ctrl: true })), 'RightCtrl');
  assert.equal(comboOf(key('ArrowLeft')), 'Left');
  assert.equal(comboOf(key('Numpad6')), '6');
  assert.equal(comboOf(key('Comma', { ctrl: true })), 'Ctrl+,');
  assert.equal(
    comboOf(key('KeyP', { ctrl: true, shift: true })),
    'Ctrl+Shift+P',
  );
  assert.equal(comboOf(key('ControlLeft', { ctrl: true })), ''); // still choosing
  assert.ok(matches(key('F3'), 'F3'));
  assert.ok(!matches(key('F3', { shift: true }), 'F3'));
});

test('keymap: defaults are valid and never clash', () => {
  for (const h of HOTKEYS)
    assert.equal(comboProblem(h.action, h.default), null, h.action);
  assert.deepEqual(conflicts(effectiveHotkeys()), []);
});

test('keymap: rules for what a key can be', () => {
  assert.match(comboProblem('talkToggle', 'V')!, /Ctrl, Alt or Win/);
  assert.match(comboProblem('talkToggle', 'Shift+V')!, /Ctrl, Alt or Win/);
  assert.match(comboProblem('toggleWindow', 'RightCtrl')!, /normal key/);
  assert.match(comboProblem('journal', 'RightAlt')!, /push-to-talk/);
  assert.match(comboProblem('journal', 'Esc')!, /cancel/);
  assert.equal(comboProblem('pushToTalk', 'RightAlt'), null);
  assert.equal(comboProblem('pushToTalk', 'F9'), null);
  assert.equal(comboProblem('talkToggle', 'Ctrl+Shift+Space'), null);
  assert.match(comboProblem('journal', 'Hyper+J')!, /combination/);
});

test('keymap: saved overrides are cleaned; clashes fall back to defaults', () => {
  assert.deepEqual(
    cleanHotkeys({
      journal: 'J',
      talkToggle: 'V',
      nope: 'K',
      mute: 'M',
      calm: 5,
    }),
    { journal: 'J' }, // talkToggle invalid, nope unknown, mute = default, calm not a string
  );
  // newQuest -> "6" clashes with journal's default "6": dropped.
  assert.deepEqual(cleanHotkeys({ newQuest: '6' }), {});
  // Moving journal away frees "6".
  assert.deepEqual(cleanHotkeys({ newQuest: '6', journal: 'J' }), {
    newQuest: '6',
    journal: 'J',
  });
  assert.equal(effectiveHotkeys({ journal: 'J' }).journal, 'J');
});

test('keymap: global combos convert to Electron accelerators', () => {
  assert.equal(toAccelerator('Ctrl+Alt+V'), 'Control+Alt+V');
  assert.equal(toAccelerator('Win+Shift+Space'), 'Super+Shift+Space');
});
