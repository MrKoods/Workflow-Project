import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FocusEngine } from './focusEngine.ts';
import { createOrchestrator } from './index.ts';
import { parseQuestFile } from './questFile.ts';

const DEMO = readFileSync(
  new URL('../quests/fiverr-profile.md', import.meta.url),
  'utf8',
);

/** Resolve once `cond()` holds, letting zero-delay engine timers run. */
async function until(cond: () => boolean, what: string, tries = 5000) {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Answer every reply prompt with "yeah", or "done" when a step is open. */
const answer = (inStep: boolean) => (inStep ? 'done' : 'yeah');

test('headless: the demo quest plays through on "yeah" and "done"', async () => {
  const q = parseQuestFile('fiverr-profile', DEMO);
  const doneCalls: [number, boolean][] = [];
  const e = new FocusEngine(q.intro, q.steps, {
    pace: 0,
    onStepDone: (k, end) => doneCalls.push([k, end]),
  });
  const heroes: string[] = [];
  e.subscribe((s) => {
    if (heroes.at(-1) !== s.hero) heroes.push(s.hero);
  });
  e.start();

  const typed: string[] = [];
  while (!e.state().complete) {
    await until(
      () => e.waitingForReply() || e.state().complete,
      'a reply prompt',
    );
    if (e.state().complete) break;
    const word = answer(e.mode() === 'm-task');
    typed.push(word);
    e.reply(word);
  }
  e.stop();

  assert.deepEqual(
    heroes.filter((h) => h !== 'companion'),
    ['acct', 'profile', 'skills', 'verify'],
  );
  assert.deepEqual(heroes, [
    'companion',
    'acct',
    'companion',
    'profile',
    'companion',
    'skills',
    'companion',
    'verify',
    'companion',
  ]);
  const s = e.state();
  assert.equal(s.doneSteps, 4);
  assert.equal(s.complete, true);
  assert.deepEqual(doneCalls, [
    [0, false],
    [1, false],
    [2, false],
    [3, true],
  ]);
  assert.ok(typed.every((w) => w === 'yeah' || w === 'done'));
  assert.deepEqual(
    e.planets().map((p) => [p.state, p.icon]),
    [
      ['done', '✓'],
      ['done', '✓'],
      ['done', '✓'],
      ['done', '✓'],
    ],
  );
});

test('engine: an "answer" reply keeps the step; unknown text asks again', async () => {
  const q = parseQuestFile('fiverr-profile', DEMO);
  const e = new FocusEngine(q.intro, q.steps, { pace: 0 });
  e.start();
  await until(() => e.waitingForReply(), 'intro prompt');
  e.reply('Give me a sec');
  assert.equal(e.waitingForReply(), false); // no double advance while it answers
  await until(() => e.waitingForReply(), 'prompt again');
  assert.equal(
    e.state().caption.text,
    "Take your time. I'm not going anywhere.",
  );
  assert.equal(e.state().stepIndex, -1);
  e.reply('what is the weather');
  await until(() => e.waitingForReply(), 'prompt after unknown');
  assert.match(e.state().caption.text, /Say "done"/);
  assert.equal(e.mode(), 'm-comp');
  e.reply('yeah');
  await until(() => e.mode() === 'm-task', 'first card');
  assert.equal(e.itemState('acct'), 'hero');
  assert.equal(e.itemState('acctck'), 'sup1');
  assert.equal(e.itemState('profile'), 'off');
  assert.equal(e.planets()[0].state, 'pulled');
  e.stop();
});

let root: string;
async function orchestratorFor(files: Record<string, string>) {
  root = await mkdtemp(path.join(tmpdir(), 'cockpit-focus-'));
  await mkdir(path.join(root, 'quests'));
  for (const [n, t] of Object.entries(files))
    await writeFile(path.join(root, 'quests', n), t);
  const orch = createOrchestrator({
    questsDir: path.join(root, 'quests'),
    journalDir: path.join(root, 'journal'),
    stateFile: path.join(root, 'journal', 'state.json'),
    documentsDir: path.join(root, 'Documents'),
    opener: { openPath: async () => '', openExternal: async () => {} },
    warn: () => {},
    focusPace: 0,
  });
  await orch.start();
  return orch;
}

test('orchestrator: playing the demo ticks every step in the file and finishes the quest', async () => {
  const orch = await orchestratorFor({ 'fiverr-profile.md': DEMO });
  try {
    assert.equal(orch.focusView()?.questId, 'fiverr-profile');
    while (!orch.focusView()?.complete) {
      await until(
        () => !!orch.focusView()?.waiting || !!orch.focusView()?.complete,
        'a reply prompt',
      );
      if (orch.focusView()?.complete) break;
      assert.equal(
        orch.focusReply(answer(orch.focusView()!.mode === 'm-task')),
        true,
      );
    }
    const file = path.join(root, 'quests', 'fiverr-profile.md');
    await until(
      () => orch.snapshot().current?.status === 'done',
      'quest done in the file',
    );
    const text = await readFile(file, 'utf8');
    assert.equal((text.match(/- \[x\]/g) ?? []).length, 4);
    assert.match(text, /status: done/);
    assert.equal(orch.focusReply('anything'), orch.focusWaiting());
    assert.equal(orch.focusView()?.doneSteps, 4);
  } finally {
    orch.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test('orchestrator: a quest with done steps resumes at its first open step', async () => {
  const resumed = DEMO.replace(
    '- [ ] Create your seller account\n- [ ] Customize your profile',
    '- [x] Create your seller account\n- [x] Customize your profile',
  ).replace('status: active', 'status: active\nresumeNote: Skills page open');
  const orch = await orchestratorFor({ 'fiverr-profile.md': resumed });
  try {
    await until(() => !!orch.focusView()?.waiting, 'resume prompt');
    const v = orch.focusView()!;
    assert.equal(v.doneSteps, 2);
    assert.equal(v.mode, 'm-comp');
    assert.deepEqual(
      v.planets.map((p) => p.state),
      ['done', 'done', 'upnext', 'later'],
    );
    assert.equal(v.orbitDeg, 90 - 2 * 90);
    assert.equal(
      v.caption.text,
      'Welcome back. You left off: Skills page open. Next up: Add skills + languages. Ready?',
    );
    orch.focusReply('yeah');
    await until(() => orch.focusView()?.items.skills === 'hero', 'skills card');
  } finally {
    orch.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test('engine: questions and unmatched text are not replies; chips stay up', async () => {
  const q = parseQuestFile('fiverr-profile', DEMO);
  const e = new FocusEngine(q.intro, q.steps, { pace: 0 });
  e.start();
  await until(() => e.waitingForReply(), 'intro prompt');
  assert.equal(e.matches('yeah'), true);
  assert.equal(e.matches("Let's dive in"), true);
  assert.equal(e.matches('what goes in my bio?'), false); // "in" alone isn't a yes
  assert.equal(e.matches('tell me about pricing'), false);
  e.echo('tell me about pricing');
  assert.equal(e.waitingForReply(), true);
  assert.equal(e.state().caption.text, 'tell me about pricing');
  assert.equal(e.state().replies.length, 2);
  e.reply('yeah');
  await until(() => e.mode() === 'm-task', 'first card');
  await until(() => e.waitingForReply(), 'step prompt');
  assert.equal(e.matches('Which email?'), true); // a chip label still matches
  e.stop();
});
