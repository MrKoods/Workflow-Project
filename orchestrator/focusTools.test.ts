import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FocusEngine } from './focusEngine.ts';
import {
  FOCUS_TOOLS,
  FOCUS_TOOLS_ENABLED,
  FOCUS_TOOL_TIERS,
  focusToolBeat,
} from './focusTools.ts';
import { TOOLS } from './companion.ts';
import { parseQuestFile } from './questFile.ts';

const quest = parseQuestFile(
  'fiverr-profile',
  readFileSync(new URL('../quests/fiverr-profile.md', import.meta.url), 'utf8'),
);

test('focus tools: defined, not enabled, complete_step confirms', () => {
  assert.equal(FOCUS_TOOLS_ENABLED, false);
  assert.deepEqual(
    FOCUS_TOOLS.map((t) => t.name),
    ['focus_item', 'support_items', 'complete_step', 'offer_replies', 'say'],
  );
  const names = new Set(TOOLS.map((t) => t.name));
  assert.ok(FOCUS_TOOLS.every((t) => !names.has(t.name)));
  assert.ok(Object.values(FOCUS_TOOL_TIERS).every((t) => t.tier === 'read'));
  assert.equal(FOCUS_TOOL_TIERS.complete_step.needsConfirm, true);
});

test('focus tools: calls are validated against the quest on screen', () => {
  assert.deepEqual(focusToolBeat('focus_item', { itemId: 'bio' }, quest), {
    ok: true,
    beat: { focus: 'bio' },
    needsConfirm: false,
  });
  assert.equal(
    focusToolBeat('focus_item', { itemId: 'nope' }, quest).ok,
    false,
  );
  assert.equal(
    focusToolBeat('support_items', { ids: ['bio', 'x'] }, quest).ok,
    false,
  );
  assert.equal(
    focusToolBeat('support_items', { ids: ['bio', 'skills', 'acct'] }, quest)
      .ok,
    false,
  );
  assert.equal(focusToolBeat('offer_replies', { labels: [] }, quest).ok, false);
  assert.equal(focusToolBeat('say', { text: '' }, quest).ok, false);
  assert.equal(focusToolBeat('say', { text: 'hi' }, null).ok, false);
  assert.equal(focusToolBeat('rm_rf', {}, quest).ok, false);
});

test('focus tools: each call becomes engine.run(beat)', async () => {
  const e = new FocusEngine(quest.intro, quest.steps, { pace: 0 });
  const run = (name: string, input: unknown) => {
    const r = focusToolBeat(name, input, quest);
    assert.ok(r.ok);
    e.run(r.beat);
  };
  run('focus_item', { itemId: 'profile' });
  run('support_items', { ids: ['bio'] });
  assert.equal(e.itemState('profile'), 'hero');
  assert.equal(e.itemState('bio'), 'sup1');
  run('offer_replies', { labels: ['Looks good', 'Change it'] });
  assert.deepEqual(
    e.state().replies.map((r) => r.label),
    ['Looks good', 'Change it'],
  );
  run('complete_step', {});
  assert.equal(e.state().doneSteps, 1);
  assert.equal(e.mode(), 'm-comp');
  run('say', { text: 'Nice.' });
  for (let i = 0; i < 200 && e.state().caption.text !== 'Nice.'; i++)
    await new Promise((r) => setTimeout(r, 0));
  assert.equal(e.state().caption.text, 'Nice.');
  e.stop();
});
