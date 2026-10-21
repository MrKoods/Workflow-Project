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
import { isInside } from './bundle.ts';
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
    documentsDir: path.join(root, 'Documents'),
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

test('isInside boundaries', () => {
  const home = path.resolve('/home/nick');
  assert.equal(isInside(path.join(home, 'Documents', 'Fiverr'), home), true);
  assert.equal(isInside(home, home), false);
  assert.equal(isInside(path.resolve('/home/nick2/x'), home), false);
  assert.equal(isInside(path.join(home, '..', 'other'), home), false);
});

const DRAFT = {
  title: 'Gym follow-ups',
  doneWhen: 'Every trial lead has a reply',
  objectives: ['Pull leads', 'Draft replies', 'Send'],
  folders: [],
  urls: [],
};

test('Quest Forge: accept writes a file; start now only when nothing is active; discard writes nothing', async () => {
  await setup({ 'a.md': quest('A', 'active', ['a1']) });
  orch.setDraft(DRAFT);
  assert.equal(orch.snapshot().draft?.rev, 1);
  orch.setDraft({ ...DRAFT, title: 'Gym follow-ups v2' });
  assert.equal(orch.snapshot().draft?.rev, 2);

  await orch.discardDraft();
  assert.equal(orch.snapshot().draft, null);
  assert.deepEqual((await readdir(path.join(root, 'quests'))).sort(), ['a.md']);

  // A is active, so "start" is ignored and the new quest is queued.
  const queued = await orch.acceptDraft(DRAFT, true);
  assert.deepEqual(queued, {
    ok: true,
    id: 'gym-follow-ups',
    status: 'queued',
  });
  assert.equal(orch.snapshot().current?.id, 'a');
  assert.ok(orch.snapshot().queue.some((q) => q.id === 'gym-follow-ups'));

  const bad = await orch.acceptDraft({ ...DRAFT, objectives: [] }, false);
  assert.equal(bad.ok, false);

  await orch.pauseQuest('');
  const started = await orch.acceptDraft(
    { ...DRAFT, title: 'Script episode' },
    true,
  );
  assert.deepEqual(started, {
    ok: true,
    id: 'script-episode',
    status: 'active',
  });
  assert.equal(orch.snapshot().current?.id, 'script-episode');
  assert.match(
    await read('script-episode.md'),
    /^---\ntitle: Script episode\n/,
  );
});

test('updateQuest keeps done flags and notes; switchQuest pauses the current quest', async () => {
  await setup({
    'a.md':
      '---\ntitle: A\nstatus: active\n---\nNotes up top.\n\n- [x] a1\n- [ ] a2\n\nNotes below.\n',
    'b.md': quest('B', 'queued', ['b1']),
  });
  assert.equal(
    await orch.updateQuest('a', { objectives: ['a1', 'a2 renamed', 'a3'] }),
    'Updated "A".',
  );
  assert.equal(
    await read('a.md'),
    '---\ntitle: A\nstatus: active\n---\nNotes up top.\n\n- [x] a1\n- [ ] a2 renamed\n- [ ] a3\n\nNotes below.\n',
  );
  assert.match(
    await orch.updateQuest('a', { objectives: [] }),
    /1-7 objectives/,
  );
  assert.match(await orch.updateQuest('nope', { title: 'X' }), /No quest/);

  assert.equal(await orch.switchQuest('b'), 'Paused "A" and started "B".');
  const s = orch.snapshot();
  assert.equal(s.current?.id, 'b');
  assert.equal(
    s.queue.find((q) => q.id === 'a')?.resumeNote,
    'Paused to switch to "B", was on objective 2: a2 renamed',
  );
});

test('createFolder only inside Documents', async () => {
  await setup({ 'a.md': quest('A', 'active', ['a1']) });
  const docs = path.join(root, 'Documents');
  assert.equal(
    orch.folderInDocuments('Fiverr/portfolio'),
    path.join(docs, 'Fiverr', 'portfolio'),
  );
  assert.equal(orch.folderInDocuments('../Windows'), null);
  assert.equal(orch.folderInDocuments(root), null);
  assert.equal(
    await orch.createFolder('Fiverr/portfolio'),
    `Created ${path.join(docs, 'Fiverr', 'portfolio')}.`,
  );
  assert.ok((await stat(path.join(docs, 'Fiverr', 'portfolio'))).isDirectory());
  assert.match(await orch.createFolder('../escape'), /Only folders inside/);
  await assert.rejects(stat(path.join(root, 'escape')));
});

test('End session: summary journaled; next day starts with the planned quest once', async () => {
  await setup({
    'a.md': quest('A', 'active', ['a1']),
    'b.md': quest('B', 'queued', ['b1']),
  });
  assert.match(await orch.recordSession('Good day.', 'nope'), /No open quest/);
  assert.equal(
    await orch.recordSession('Good day.', 'b'),
    'Saved the summary. Tomorrow starts with "B".',
  );
  assert.deepEqual(orch.snapshot().firstQuest, {
    id: 'b',
    title: 'B',
    setOn: '2026-10-18',
  });
  assert.equal((await orch.journalToday()).at(-1)?.kind, 'summary');

  // Same day restart: nothing changes.
  await setup();
  assert.equal(orch.snapshot().current?.id, 'a');
  assert.ok(orch.snapshot().firstQuest);

  // Next day, but A is still active: the plan is dropped, A stays.
  clock = new Date(2026, 9, 19, 8, 0);
  await setup();
  assert.equal(orch.snapshot().current?.id, 'a');
  assert.equal(orch.snapshot().firstQuest, null);
});

test('End session: planned quest becomes active next day when nothing is', async () => {
  await setup({
    'a.md': quest('A', 'active', ['a1']),
    'b.md': quest('B', 'queued', ['b1']),
  });
  await orch.pauseQuest('done for today');
  await orch.recordSession('Paused A.', 'b');
  opened.length = 0;
  clock = new Date(2026, 9, 19, 8, 0);
  await setup();
  assert.equal(orch.snapshot().current?.id, 'b');
  assert.equal(orch.snapshot().firstQuest, null);
  const kinds = (await orch.journalToday()).map((e) => e.kind);
  assert.deepEqual(kinds, ['start']);
});

const setupTimes = async () => {
  try {
    return (
      await readFile(path.join(root, 'journal', 'setup-times.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

test('Setup timer: starts on start/resume/launch, tap confirms, pause drops, objective ends unconfirmed', async () => {
  await setup({
    'a.md': quest('A', 'active', ['a1', 'a2']),
    'b.md': quest('B', 'queued', ['b1']),
  });
  // First launch of the day opened A's bundle: timer running.
  assert.equal(orch.snapshot().setupTimer?.questId, 'a');
  clock = new Date(clock.getTime() + 95_000);
  await orch.markWorking();
  assert.equal(orch.snapshot().setupTimer, null);
  assert.equal(orch.snapshot().notice?.text, 'Setup took 1:35. Logged.');

  await orch.pauseQuest(''); // no timer running: nothing logged
  await orch.activateQuest('a'); // resume: timer runs
  assert.equal(orch.snapshot().setupTimer?.questId, 'a');
  await orch.pauseQuest(''); // paused before working: dropped
  assert.equal(orch.snapshot().setupTimer, null);

  await orch.activateQuest('b');
  clock = new Date(clock.getTime() + 30_000);
  await orch.completeObjective();

  const rows = await setupTimes();
  assert.deepEqual(
    rows.map((r) => [r.questId, r.trigger, r.seconds, r.confirmed, r.endedBy]),
    [
      ['a', 'launch', 95, true, 'tap'],
      ['b', 'start', 30, false, 'objective'],
    ],
  );
});

test('Setup timer: times out unconfirmed', async () => {
  for (const f of ['a.md'])
    await writeFile(path.join(root, 'quests', f), quest('A', 'active', ['a1']));
  orch?.stop();
  orch = createOrchestrator({
    questsDir: path.join(root, 'quests'),
    journalDir: path.join(root, 'journal'),
    stateFile: path.join(root, 'state.json'),
    documentsDir: path.join(root, 'Documents'),
    opener: fakeOpener,
    now: () => clock,
    setupTimeoutMs: 30,
  });
  await orch.start();
  await new Promise((r) => setTimeout(r, 80));
  const rows = await setupTimes();
  assert.deepEqual(
    rows.map((r) => [r.seconds, r.confirmed, r.endedBy]),
    [[0, false, 'timeout']],
  );
  assert.equal(orch.snapshot().setupTimer, null);
});

test('settings default to ice/hud/auto, persist, and ignore invalid fields', async () => {
  await setup();
  assert.deepEqual(orch.snapshot().settings, {
    palette: 'ice',
    layout: 'hud',
    holoFace: 'auto',
    voice: 'auto',
    calm: false,
    speech: true,
    volume: 0.8,
    voicePlayful: 'aura-2-thalia-en',
    voiceSteady: 'aura-2-thalia-en',
    companionName: 'Echo',
    wakeWord: false,
    conversation: true,
    hotkeys: {},
  });
  await orch.setSettings({ hotkeys: { journal: 'J', talkToggle: 'V' } });
  assert.deepEqual(orch.snapshot().settings.hotkeys, { journal: 'J' }); // invalid global dropped
  await orch.setSettings({
    voicePlayful: 'aura-2-apollo-en',
    voiceSteady: '../x',
    volume: 3,
  });
  assert.equal(orch.snapshot().settings.voicePlayful, 'aura-2-apollo-en');
  assert.equal(orch.snapshot().settings.voiceSteady, 'aura-2-thalia-en');
  assert.equal(orch.snapshot().settings.volume, 0.8);
  await orch.setSettings({ palette: 'ember', voice: 'loud', calm: 'yes' });
  await orch.setSettings({ layout: 'orbit' });
  await orch.setSettings({ layout: 'sideways' });
  assert.equal(orch.snapshot().settings.layout, 'orbit');
  await orch.setSettings({ holoFace: 'pixel' });
  await orch.setSettings({ holoFace: 'voxel' });
  assert.equal(orch.snapshot().settings.holoFace, 'pixel');
  await orch.setSettings({ palette: '../../evil' });
  assert.equal(orch.snapshot().settings.palette, 'ember');
  assert.equal(orch.snapshot().settings.voice, 'auto');
  await orch.setSettings({ voice: 'steady' });

  await setup(); // restart: read back from settings.json
  assert.equal(orch.snapshot().settings.palette, 'ember');
  assert.equal(orch.snapshot().settings.voice, 'steady');
  assert.equal(orch.snapshot().settings.layout, 'orbit');
  assert.equal(orch.snapshot().settings.holoFace, 'pixel');
  // A file from before Auto existed (no version) moves to auto once, and a
  // file from before the Tech HUD (version < 3) moves to hud + ice once.
  await writeFile(
    path.join(root, 'settings.json'),
    JSON.stringify({ palette: 'frost', voice: 'playful', calm: true }),
  );
  await setup();
  assert.equal(orch.snapshot().settings.palette, 'ice');
  assert.equal(orch.snapshot().settings.layout, 'hud');
  assert.equal(orch.snapshot().settings.voice, 'auto');
  assert.equal(orch.snapshot().settings.calm, true);
  await writeFile(
    path.join(root, 'settings.json'),
    JSON.stringify({ version: 3, palette: 'frost', layout: 'orbit' }),
  );
  await setup();
  assert.equal(orch.snapshot().settings.palette, 'frost');
  assert.equal(orch.snapshot().settings.layout, 'orbit');
  await writeFile(path.join(root, 'settings.json'), '{not json');
  await setup();
  assert.equal(orch.snapshot().settings.palette, 'ice');
});

test('v2: completing a step ticks its box (written if missing), adds XP + journal', async () => {
  await setup({
    'v2.md': `---\ntitle: V2\nstatus: active\nsteps:\n  - { title: One, beats: [{ say: hi }] }\n  - { title: Two, beats: [{ say: yo }] }\n---\nNotes.\n`,
  });
  const r = await orch.completeObjective();
  assert.deepEqual(r, { objective: 'One', questComplete: false });
  assert.match(await read('v2.md'), /Notes\.\n- \[x\] One\n- \[ \] Two\n$/);
  assert.equal(
    orch.snapshot().current?.objectives.filter((o) => o.done).length,
    1,
  );
  assert.equal(
    await orch.updateQuest('v2', { objectives: ['A'] }),
    'This quest has scripted steps (quest file v2); its steps can only be changed in the file.',
  );
  const r2 = await orch.completeObjective();
  assert.equal(r2?.questComplete, true);
  assert.match(await read('v2.md'), /status: done/);
  const kinds = (await journal()).map((e) => e.kind);
  assert.deepEqual(kinds.filter((k) => k === 'objective').length, 2);
  assert.ok(kinds.includes('finish'));
});

test('templates: a fresh copy on scheduled days, no pile-up, save as template', async () => {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.join(root, 'templates'));
  await writeFile(
    path.join(root, 'templates', 'prep.md'),
    '---\ntitle: Prep\nschedule: weekdays 08:30\n---\n- [x] Levels\n- [ ] Plan\n',
  );
  clock = new Date(2026, 9, 18, 9, 0); // Sunday: not due
  await setup();
  assert.equal(orch.snapshot().current, null);

  clock = new Date(2026, 9, 19, 8, 0); // Monday, before 08:30
  await setup();
  assert.equal(orch.snapshot().current, null);

  clock = new Date(2026, 9, 19, 9, 0); // Monday 09:00: due, nothing active -> starts
  await setup();
  const q = orch.snapshot().current!;
  assert.equal(q.id, 'prep-2026-10-19');
  assert.equal(q.template, 'prep');
  assert.deepEqual(
    q.objectives.map((o) => o.done),
    [false, false],
  );
  assert.match(await read('prep-2026-10-19.md'), /template: prep/);

  await setup(); // same day again: no second copy
  clock = new Date(2026, 9, 20, 9, 0); // Tuesday, Monday's copy unfinished: none
  await setup();
  assert.deepEqual(
    (await readdir(path.join(root, 'quests'))).filter((n) =>
      n.startsWith('prep'),
    ),
    ['prep-2026-10-19.md'],
  );

  // Saving a quest as a template (the companion's save_as_template).
  assert.match(
    await orch.saveTemplate('prep-2026-10-19', 'someday'),
    /Can't read the schedule/,
  );
  assert.match(
    await orch.saveTemplate('prep-2026-10-19', 'daily'),
    /Saved "Prep" as a template, daily/,
  );
  const saved = await readFile(
    path.join(root, 'templates', 'prep-2.md'),
    'utf8',
  );
  assert.match(saved, /schedule: daily/);
  assert.doesNotMatch(saved, /status:|template:/);
});

test('settings: the companion name is cleaned', async () => {
  await setup();
  await orch.setSettings({ companionName: '  Nova  ' });
  assert.equal(orch.snapshot().settings.companionName, 'Nova');
  await orch.setSettings({ companionName: '<script>' });
  await orch.setSettings({ companionName: '' });
  assert.equal(orch.snapshot().settings.companionName, 'Nova');
});

test('echo: tick/untick steps, go back to a step, archive a quest', async () => {
  await setup({
    'a.md': quest('A', 'active', ['one', 'two', 'three']),
    'b.md': quest('B', 'queued', ['b1']),
  });
  const done = () => orch.snapshot().current?.objectives.map((o) => o.done);

  assert.match(await orch.setSteps([1, 2], true), /Ticked steps 1, 2 of "A"/);
  assert.deepEqual(done(), [true, true, false]);
  assert.match(await orch.setSteps([9], true), /numbered 1 to 3/);

  // Untick all: back to the start.
  await orch.setSteps('all', false);
  assert.deepEqual(done(), [false, false, false]);

  // Tick all: the quest finishes; unticking reopens it.
  await orch.setSteps('all', true);
  assert.match(await read('a.md'), /status: done/);
  await orch.setSteps([3], false, 'a');
  assert.match(await read('a.md'), /status: active/);
  assert.doesNotMatch(await read('a.md'), /completedAt/);

  // Go back to step 2: steps 2 and 3 open again.
  await orch.setSteps('all', false);
  await orch.setSteps([1, 2, 3], true);
  await orch.setSteps([3], false);
  assert.equal(await orch.goBackToStep(2), 'Back to step 2: two.');
  assert.deepEqual(done(), [true, false, false]);

  // Archive: moved, never deleted.
  assert.match(await orch.archiveQuest('b'), /Archived "B"/);
  assert.deepEqual(await readdir(path.join(root, 'quests', 'archive')), [
    'b.md',
  ]);
  assert.ok(!orch.snapshot().queue.some((q) => q.id === 'b'));
});
