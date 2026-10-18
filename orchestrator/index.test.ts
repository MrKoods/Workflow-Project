import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { createOrchestrator, type Orchestrator } from './index.ts';

let root: string;
let orch: Orchestrator;
const warnings: string[] = [];

const quest = (title: string, status: string, objectives: string[]) =>
  `---\ntitle: ${title}\nstatus: ${status}\n---\n${objectives.map((o) => `- [ ] ${o}`).join('\n')}\n`;

async function setup(files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) {
    await writeFile(path.join(root, 'quests', name), text);
  }
  orch = createOrchestrator({
    questsDir: path.join(root, 'quests'),
    journalDir: path.join(root, 'journal'),
    warn: (m) => warnings.push(m),
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
