import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  renderQuestFile,
  slugify,
  validateDraft,
  writeNewQuest,
} from './forge.ts';
import { parseQuestFile } from './questFile.ts';

const DRAFT = {
  title: 'Launch my AI automation gig on Fiverr',
  doneWhen: 'Gig published with packages: copy, images & 2 samples',
  objectives: [
    'Research what sells',
    'Pick niche + 3 packages',
    'Write "gig" copy',
  ],
  folders: ['~/Documents/Fiverr'],
  urls: ['https://www.fiverr.com'],
};

test('validateDraft cleans whitespace and enforces the schema', () => {
  const ok = validateDraft({ ...DRAFT, title: '  Launch\n my  gig ' });
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.draft.title, 'Launch my gig');

  const err = (patch: object) => {
    const r = validateDraft({ ...DRAFT, ...patch });
    return r.ok ? '' : r.error;
  };
  assert.match(err({ title: '' }), /title is required/);
  assert.match(err({ objectives: [] }), /1-7 objectives/);
  assert.match(err({ objectives: Array(8).fill('x') }), /1-7 objectives/);
  assert.match(err({ urls: ['file:///C:/Windows'] }), /not an http\(s\) link/);
  assert.match(err({ folders: ['Fiverr'] }), /must be a full path/);
  assert.match(err({ folders: 'C:/x' }), /must be a list/);
  assert.equal(err({ folders: [], urls: [] }), '');
});

test('slugify makes lowercase-dashed ids', () => {
  assert.equal(
    slugify('Launch my AI automation gig on Fiverr!'),
    'launch-my-ai-automation-gig-on-fiverr',
  );
  assert.equal(slugify('  Pre-market   prep  '), 'pre-market-prep');
  assert.equal(slugify('!!!'), 'quest');
  assert.ok(slugify('x'.repeat(100)).length <= 60);
});

test('rendered file round-trips through the Task 3 parser', () => {
  const text = renderQuestFile(DRAFT, 'queued', '2026-10-18T09:00:00.000Z');
  const q = parseQuestFile('x', text);
  assert.equal(q.title, DRAFT.title);
  assert.equal(q.doneWhen, DRAFT.doneWhen);
  assert.equal(q.status, 'queued');
  assert.deepEqual(q.bundle, {
    folders: DRAFT.folders,
    urls: DRAFT.urls,
    apps: [],
  });
  assert.deepEqual(
    q.objectives.map((o) => o.title),
    DRAFT.objectives,
  );
  assert.ok(q.objectives.every((o) => !o.done));
});

test('writeNewQuest never overwrites: -2, -3', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cockpit-forge-'));
  try {
    await writeFile(
      path.join(dir, 'launch-my-ai-automation-gig-on-fiverr.md'),
      'keep me',
    );
    const a = await writeNewQuest(dir, DRAFT, 'queued', 'now');
    const b = await writeNewQuest(dir, DRAFT, 'queued', 'now');
    assert.equal(a, 'launch-my-ai-automation-gig-on-fiverr-2');
    assert.equal(b, 'launch-my-ai-automation-gig-on-fiverr-3');
    assert.equal(
      await readFile(
        path.join(dir, 'launch-my-ai-automation-gig-on-fiverr.md'),
        'utf8',
      ),
      'keep me',
    );
    assert.equal((await readdir(dir)).length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
