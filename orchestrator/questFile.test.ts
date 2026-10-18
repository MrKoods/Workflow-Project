import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseQuestFile,
  QuestFileError,
  setFrontmatter,
  setObjectiveDone,
} from './questFile.ts';

const SAMPLE = `---
title: Launch my AI automation gig on Fiverr
doneWhen: Gig published   # keep this comment
status: active
bundle:
  folders: ["~/Documents/Fiverr"]
  urls: ["https://www.fiverr.com"]
---
Notes stay put.

- [x] Research what sells
- [ ] Pick niche + 3 packages
* [X] Write gig copy
- [ ] Make gig images
`;

test('parses frontmatter, bundle and checkbox objectives', () => {
  const q = parseQuestFile('fiverr-gig', SAMPLE);
  assert.equal(q.title, 'Launch my AI automation gig on Fiverr');
  assert.equal(q.doneWhen, 'Gig published');
  assert.equal(q.status, 'active');
  assert.deepEqual(q.bundle, {
    folders: ['~/Documents/Fiverr'],
    urls: ['https://www.fiverr.com'],
    apps: [],
  });
  assert.deepEqual(
    q.objectives.map((o) => [o.title, o.done]),
    [
      ['Research what sells', true],
      ['Pick niche + 3 packages', false],
      ['Write gig copy', true],
      ['Make gig images', false],
    ],
  );
});

test('status defaults to queued; bad files throw QuestFileError', () => {
  assert.equal(
    parseQuestFile('x', '---\ntitle: T\n---\n- [ ] a\n').status,
    'queued',
  );
  assert.throws(() => parseQuestFile('x', 'no frontmatter'), QuestFileError);
  assert.throws(() => parseQuestFile('x', '---\ndoneWhen: y\n---\n'), /title/);
  assert.throws(
    () => parseQuestFile('x', '---\ntitle: T\nstatus: maybe\n---\n'),
    /status/,
  );
  assert.throws(
    () => parseQuestFile('x', '---\ntitle: T\nbundle:\n  urls: 5\n---\n'),
    /bundle.urls/,
  );
});

test('setObjectiveDone ticks only the nth checkbox and keeps everything else', () => {
  const next = setObjectiveDone(SAMPLE, 1, true);
  assert.equal(next, SAMPLE.replace('- [ ] Pick niche', '- [x] Pick niche'));
  assert.throws(() => setObjectiveDone(SAMPLE, 9, true), /no objective #10/);
});

test('setFrontmatter keeps comments and body, preserves CRLF', () => {
  const next = setFrontmatter(SAMPLE, {
    status: 'done',
    completedAt: '2026-10-17T12:00:00.000Z',
  });
  assert.match(next, /# keep this comment/);
  assert.match(
    next,
    /\n {2}folders: \["~\/Documents\/Fiverr"\]\n/,
    'bundle not reformatted',
  );
  const long = setFrontmatter(
    SAMPLE.replace('Gig published', 'x'.repeat(120)),
    { status: 'done' },
  );
  assert.match(long, new RegExp(`doneWhen: x{120}`), 'long lines not folded');
  assert.match(next, /status: done/);
  assert.ok(next.endsWith(SAMPLE.slice(SAMPLE.indexOf('Notes stay put.'))));
  assert.equal(
    parseQuestFile('x', next).completedAt,
    '2026-10-17T12:00:00.000Z',
  );

  const crlf = SAMPLE.replace(/\n/g, '\r\n');
  const out = setObjectiveDone(
    setFrontmatter(crlf, { status: 'done' }),
    1,
    true,
  );
  assert.ok(!/[^\r]\n/.test(out), 'no bare LF introduced');
  assert.equal(parseQuestFile('x', out).objectives[1].done, true);
});
