import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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

// ---- Quest file v2 (ORBIT-UPGRADE Task 3) ----------------------------------

const repoQuest = (name: string) =>
  readFileSync(new URL(`../quests/${name}`, import.meta.url), 'utf8');

test('v2: the demo quest loads items, intro and steps', () => {
  const q = parseQuestFile('fiverr-profile', repoQuest('fiverr-profile.md'));
  assert.equal(q.format, 2);
  assert.equal(q.voice, 'playful');
  assert.deepEqual(Object.keys(q.items), [
    'acct',
    'acctck',
    'profile',
    'bio',
    'skills',
    'verify',
  ]);
  assert.deepEqual(
    Object.values(q.items).map((i) => i.type),
    ['link', 'checklist', 'link', 'draft', 'tags', 'checklist'],
  );
  assert.equal(q.intro.length, 2);
  assert.deepEqual(
    q.steps.map((s) => s.id),
    ['account', 'profile', 'skills', 'verify'],
  );
  assert.deepEqual(
    q.steps.map((s) => s.short),
    ['Seller account', 'Profile', 'Skills', 'Verify'],
  );
  assert.deepEqual(q.steps[0].beats[0], {
    say: "Here's the door. Click through and claim your seller account. I'll keep watch from here.",
    focus: 'acct',
    support: ['acctck'],
  });
  assert.equal(q.steps[3].beats.at(-2)?.end, true);
  // Objectives mirror the steps; progress comes from the body's checkboxes.
  assert.deepEqual(
    q.objectives.map((o) => o.title),
    q.steps.map((s) => s.title),
  );
  assert.ok(q.objectives.every((o) => !o.done));
});

test('v1: the Phase 0 quests still load, with one generic step per objective', () => {
  for (const name of [
    'fiverr-profile-v1.md',
    'fiverr-gig.md',
    'pre-market-prep.md',
  ]) {
    const q = parseQuestFile(name, repoQuest(name));
    assert.equal(q.format, 1, name);
    assert.equal(q.steps.length, q.objectives.length, name);
    assert.deepEqual(q.items, {});
    assert.deepEqual(q.intro, []);
  }
  const q = parseQuestFile('p', repoQuest('pre-market-prep.md'));
  assert.deepEqual(q.steps[0], {
    id: 'objective-1',
    title: 'Review overnight moves',
    short: 'Review overnight…',
    icon: '•',
    beats: [
      { say: "Step 1: Review overnight moves. Say done when it's finished." },
      { replies: [{ label: 'Done' }] },
      { stepDone: true },
    ],
  });
  assert.deepEqual(q.steps.at(-1)!.beats.at(-1), { stepDone: true, end: true });
  assert.ok(q.steps.every((s) => s.short.length <= 17));
});

test('v2: v2 files without checkboxes count every step as not done', () => {
  const q = parseQuestFile(
    'x',
    '---\ntitle: X\nsteps:\n  - { title: One, beats: [{ say: hi }] }\n  - { title: Two, beats: [{ say: yo }] }\n---\nJust notes.\n',
  );
  assert.deepEqual(q.objectives, [
    { title: 'One', done: false },
    { title: 'Two', done: false },
  ]);
  assert.deepEqual(
    q.steps.map((s) => [s.id, s.icon]),
    [
      ['step-1', '•'],
      ['step-2', '•'],
    ],
  );
});

test('v2: bad items and beats are rejected with the field path', () => {
  const bad = (fm: string) => () =>
    parseQuestFile('x', `---\ntitle: X\n${fm}\n---\n`);
  assert.throws(bad('steps: []'), /steps must be a non-empty list/);
  assert.throws(
    bad('steps:\n  - { title: A, beats: [{ focus: nope }] }'),
    /steps\[0\]\.beats\[0\]\.focus: no item "nope"/,
  );
  assert.throws(
    bad(
      'items:\n  a: { type: video, title: A }\nsteps:\n  - { title: A, beats: [{ say: x }] }',
    ),
    /items\.a\.type/,
  );
  assert.throws(
    bad(
      'items:\n  a: { type: link, title: A, url: "file:///c:/x" }\nsteps:\n  - { title: A, beats: [{ say: x }] }',
    ),
    /items\.a\.url must be http/,
  );
  assert.throws(
    bad(
      'items:\n  a: { type: draft, title: A, text: T }\nsteps:\n  - { title: A, beats: [{ tick: a }] }',
    ),
    /tick must name a checklist/,
  );
});

test('v2: frontmatter edits keep the steps parseable', () => {
  const text = repoQuest('fiverr-profile.md');
  const edited = setFrontmatter(text, {
    status: 'paused',
    resumeNote: 'Back soon',
  });
  const q = parseQuestFile('f', edited);
  assert.equal(q.status, 'paused');
  assert.equal(q.steps.length, 4);
  assert.deepEqual(q.items, parseQuestFile('f', text).items);
  assert.match(edited, /# Cockpit quest file, v2/); // comments survive
});
