import assert from 'node:assert/strict';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { insideHome } from './bundle.ts';
import { createOrchestrator, type Orchestrator } from './index.ts';

let root: string;
let orch: Orchestrator;
let clock: Date;
const warnings: string[] = [];
const opened: string[] = [];

const fakeOpener = {
  openPath: async (p: string) => (opened.push(p), ''),
  openExternal: async (u: string) => void opened.push(u),
};

const quest = (
  title: string,
  status: string,
  objectives: string[],
  extra = '',
) =>
  `---\ntitle: ${title}\nstatus: ${status}\n${extra}---\n${objectives.map((o) => `- [ ] ${o}`).join('\n')}\n`;

const read = (name: string) =>
  readFile(path.join(root, 'quests', name), 'utf8');

async function setup(files: Record<string, string> = {}) {
  for (const [name, text] of Object.entries(files)) {
    await writeFile(path.join(root, 'quests', name), text);
  }
  orch?.stop();
  orch = createOrchestrator({
    questsDir: path.join(root, 'quests'),
    journalDir: path.join(root, 'journal'),
    stateFile: path.join(root, 'state.json'),
    opener: fakeOpener,
    warn: (m) => warnings.push(m),
    now: () => clock,
  });
  await orch.start();
}

async function journal() {
  const dir = path.join(root, 'journal');
  const [file] = await readdir(dir);
  return (await readFile(path.join(dir, file), 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'cockpit-test-'));
  await import('node:fs/promises').then((fs) =>
    fs.mkdir(path.join(root, 'quests')),
  );
  warnings.length = 0;
  opened.length = 0;
  clock = new Date(2026, 9, 18, 9, 0);
});
afterEach(async () => {
  orch?.stop();
  await rm(root, { recursive: true, force: true });
});

test('keeps one active quest; extras are queued in their files and journaled', async () => {
  await setup({
    'a.md': quest('A', 'active', ['a1']),
    'b.md': quest('B', 'active', ['b1']),
    'c.md': quest('C', 'queued', ['c1']),
  });
  const s = orch.snapshot();
  assert.equal(s.current?.id, 'a');
  assert.deepEqual(
    s.queue.map((q) => q.id),
    ['b', 'c'],
  );
  assert.match(
    await readFile(path.join(root, 'quests', 'b.md'), 'utf8'),
    /status: queued/,
  );
  assert.equal((await journal())[0].kind, 'decision');
});

test('skips malformed files with a warning', async () => {
  await setup({ 'a.md': quest('A', 'active', ['a1']), 'bad.md': 'nope' });
  assert.equal(orch.snapshot().current?.id, 'a');
  assert.match(warnings[0], /skipped quests\/bad\.md/);
});

test('completes objectives in order, finishes the quest, then starts the next', async () => {
  await setup({
    'a.md': quest('A', 'active', ['a1', 'a2']),
    'b.md': quest('B', 'queued', ['b1']),
  });

  assert.deepEqual(await orch.completeObjective(), {
    objective: 'a1',
    questComplete: false,
  });
  assert.match(
    await readFile(path.join(root, 'quests', 'a.md'), 'utf8'),
    /- \[x\] a1\n- \[ \] a2/,
  );

  assert.deepEqual(await orch.completeObjective(), {
    objective: 'a2',
    questComplete: true,
  });
  const done = orch.snapshot().current;
  assert.equal(done?.id, 'a', 'finished quest stays on screen');
  assert.equal(done?.status, 'done');
  assert.equal(
    await orch.completeObjective(),
    null,
    'nothing left to complete',
  );

  await orch.startNextQuest();
  assert.equal(orch.snapshot().current?.id, 'b');
  assert.deepEqual(orch.snapshot().queue, []);

  assert.deepEqual(
    (await journal()).map((e) => [e.kind, e.text]),
    [
      ['objective', 'a1'],
      ['objective', 'a2'],
      ['finish', 'A'],
      ['start', 'B'],
    ],
  );
});

test('emits a snapshot after changes', async () => {
  await setup({ 'a.md': quest('A', 'active', ['a1', 'a2']) });
  const seen: number[] = [];
  orch.onChange((s) =>
    seen.push(s.current!.objectives.filter((o) => o.done).length),
  );
  await orch.completeObjective();
  assert.ok(seen.includes(1));
});

test('picks up edits made outside the app', async () => {
  await setup({ 'a.md': quest('A', 'active', ['a1']) });
  const changed = new Promise<string | undefined>((resolve) =>
    orch.onChange((s) => resolve(s.current?.title)),
  );
  await writeFile(
    path.join(root, 'quests', 'a.md'),
    quest('A renamed', 'active', ['a1']),
  );
  assert.equal(await changed, 'A renamed');
});

const fwd = (p: string) => p.split(path.sep).join('/');
const BUNDLE = (dir: string) =>
  `bundle:\n  folders: ["${fwd(dir)}", "${fwd(dir)}/missing"]\n  urls: ["https://example.com", "file:///C:/Windows"]\n`;

test('first launch of the day opens the active bundle; restarts that day do not', async () => {
  await setup({ 'a.md': quest('A', 'active', ['a1'], BUNDLE(root)) });
  assert.deepEqual(opened, [root, 'https://example.com/']);
  assert.equal(
    orch.snapshot().notice?.text,
    `Opened 2 of 4. Not found: ${fwd(root)}/missing. Couldn't open: file:///C:/Windows (only http/https links open).`,
  );

  opened.length = 0;
  await setup(); // restart, same day
  assert.deepEqual(opened, []);

  clock = new Date(2026, 9, 19, 9, 0);
  await setup(); // next day
  assert.equal(opened.length, 2);
});

test('pause saves a note; resume reopens the bundle; next objective clears the note', async () => {
  await setup({
    'a.md': quest('A', 'active', ['a1', 'a2'], BUNDLE(root)),
    'b.md': quest('B', 'queued', ['b1']),
  });
  opened.length = 0;

  await orch.pauseQuest('  halfway through the copy  ');
  let s = orch.snapshot();
  assert.equal(s.current, null);
  assert.deepEqual(
    s.queue.map((q) => [q.id, q.status, q.resumeNote]),
    [
      ['a', 'paused', 'halfway through the copy'],
      ['b', 'queued', undefined],
    ],
  );
  const paused = await read('a.md');
  assert.match(paused, /\nstatus: paused\n/);
  assert.match(paused, /\nresumeNote: halfway through the copy\n/);
  assert.match(paused, /\npausedAt: 2026-10-18T/);
  assert.match(
    paused,
    /\n {2}folders: \[".*", ".*\/missing"\]\n/,
    'bundle kept on one line',
  );

  await orch.activateQuest('a');
  s = orch.snapshot();
  assert.equal(s.current?.id, 'a');
  assert.equal(s.current?.resumeNote, 'halfway through the copy');
  assert.doesNotMatch(await read('a.md'), /pausedAt/);
  assert.equal(opened.length, 2, 'bundle reopened on resume');

  await orch.completeObjective();
  assert.equal(orch.snapshot().current?.resumeNote, undefined);

  const kinds = (await journal()).map((e) => e.kind);
  assert.deepEqual(kinds, ['pause', 'resume', 'objective']);
});

test('empty pause note becomes "Paused on objective N"; only one quest can be activated', async () => {
  await setup({
    'a.md': quest('A', 'active', ['a1', 'a2']),
    'b.md': quest('B', 'queued', ['b1']),
  });
  await orch.activateQuest('b'); // refused: A is active
  assert.equal(orch.snapshot().current?.id, 'a');

  await orch.completeObjective();
  await orch.pauseQuest('');
  assert.equal(
    orch.snapshot().queue[0].resumeNote,
    'Paused on objective 2: a2',
  );

  await orch.startNextQuest(); // queued before paused
  assert.equal(orch.snapshot().current?.id, 'b');
});

test('missing folders are offered; creating them works inside home only', async () => {
  const outside = path.parse(root).root + 'cockpit-test-outside-' + Date.now();
  const wanted = path.join(root, 'new', 'sub');
  await setup({
    'a.md': quest(
      'A',
      'active',
      ['a1'],
      `bundle:\n  folders: ["${fwd(wanted)}", "${fwd(outside)}"]\n`,
    ),
  });
  assert.equal(orch.snapshot().notice?.action, 'create-folders');
  opened.length = 0;

  await orch.createMissingFolders();
  assert.ok((await stat(wanted)).isDirectory(), 'created inside home');
  await assert.rejects(stat(outside), 'nothing created outside home');
  assert.deepEqual(opened, [wanted]);
  assert.match(
    orch.snapshot().notice!.text,
    /^Created and opened .*new\/sub\. Didn't create .*cockpit-test-outside/,
  );
  assert.equal(orch.snapshot().notice?.action, undefined);
  assert.match((await journal()).at(-1).text, /^Created folder .*new\/sub$/);

  await orch.createMissingFolders(); // nothing pending any more
  assert.deepEqual(opened, [wanted]);
});

test('insideHome boundaries', () => {
  const home = path.resolve('/home/nick');
  assert.equal(insideHome(path.join(home, 'Documents', 'Fiverr'), home), true);
  assert.equal(insideHome(home, home), false);
  assert.equal(insideHome(path.resolve('/home/nick2/x'), home), false);
  assert.equal(insideHome(path.join(home, '..', 'other'), home), false);
});
