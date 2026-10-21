import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createConversation,
  isGoodbye,
  QUIET_MS,
  REPLY_TIMEOUT_MS,
} from './conversation.ts';

// A hand-cranked clock: tick(ms) advances time and runs the poll.
function rig(enabled = true) {
  let t = 0;
  let fn: (() => void) | null = null;
  let quiet = false;
  const listens: number[] = [];
  const changes: boolean[] = [];
  const c = createConversation({
    quiet: () => quiet,
    listen: () => listens.push(t),
    enabled: () => enabled,
    onChange: (v) => changes.push(v),
    now: () => t,
    setInterval: (f) => ((fn = f), 1),
    clearInterval: () => (fn = null),
  });
  const tick = (ms: number) => {
    for (let i = 0; i < ms; i += 100) {
      t += 100;
      fn?.();
    }
  };
  return {
    c,
    tick,
    listens,
    changes,
    setQuiet: (q: boolean) => (quiet = q),
  };
}

test('conversation: reopens the mic only after Echo is quiet for a moment', () => {
  const r = rig();
  r.c.begin();
  assert.equal(r.c.active(), true);
  r.c.sent();
  r.tick(5000); // Echo thinking + speaking: not quiet
  assert.deepEqual(r.listens, []);
  r.setQuiet(true);
  r.tick(QUIET_MS - 100);
  assert.deepEqual(r.listens, []); // not yet: no clipped tails
  r.tick(200);
  assert.equal(r.listens.length, 1);
  r.tick(5000);
  assert.equal(r.listens.length, 1); // once per reply
  r.setQuiet(false);
  r.c.sent(); // next turn
  r.tick(300);
  r.setQuiet(true);
  r.tick(QUIET_MS + 100);
  assert.equal(r.listens.length, 2);
  assert.deepEqual(r.changes, [true]);
});

test('conversation: a blip of sound resets the quiet wait', () => {
  const r = rig();
  r.c.begin();
  r.c.sent();
  r.setQuiet(true);
  r.tick(500);
  r.setQuiet(false); // next sentence of the reply starts playing
  r.tick(100);
  r.setQuiet(true);
  r.tick(500);
  assert.deepEqual(r.listens, []);
  r.tick(300);
  assert.equal(r.listens.length, 1);
});

test('conversation: end stops it; off means one turn; stuck replies time out', () => {
  const r = rig();
  r.c.begin();
  r.c.sent();
  r.c.end('goodbye');
  r.setQuiet(true);
  r.tick(2000);
  assert.deepEqual(r.listens, []);
  assert.deepEqual(r.changes, [true, false]);

  const off = rig(false);
  off.c.begin();
  off.c.sent();
  off.setQuiet(true);
  off.tick(2000);
  assert.equal(off.c.active(), false);
  assert.deepEqual(off.listens, []);

  const stuck = rig();
  stuck.c.begin();
  stuck.c.sent();
  stuck.tick(REPLY_TIMEOUT_MS + 200);
  assert.equal(stuck.c.active(), false);
});

test('goodbye: the whole utterance only', () => {
  for (const s of [
    "That's all.",
    'never mind',
    'Bye!',
    "I'm done",
    'Stop listening',
  ])
    assert.equal(isGoodbye(s), true, s);
  for (const s of [
    "that's all the skills I need",
    'bye the way, open the journal',
    'done',
    'I am done with step 2',
  ])
    assert.equal(isGoodbye(s), false, s);
});
