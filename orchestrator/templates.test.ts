import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseQuestFile } from './questFile.ts';
import {
  isDue,
  parseSchedule,
  questFromTemplate,
  scheduleOf,
  templateFromQuest,
} from './templates.ts';

// 2026-10-19 is a Monday; 2026-10-18 a Sunday.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);

test('templates: schedules parse; bad ones are refused', () => {
  assert.deepEqual([...parseSchedule('weekdays 08:30')!.days], [1, 2, 3, 4, 5]);
  assert.deepEqual(parseSchedule('weekdays 08:30')!.at, { h: 8, m: 30 });
  assert.deepEqual([...parseSchedule('Mon,Thursday')!.days], [1, 4]);
  assert.equal(parseSchedule('daily')!.at, undefined);
  for (const bad of [
    '',
    'someday',
    'mon 25:00',
    'daily 8',
    'daily 08:30 extra',
  ])
    assert.equal(parseSchedule(bad), null, bad);
});

test('templates: due on the right day, once the time has passed', () => {
  const s = parseSchedule('weekdays 08:30')!;
  assert.equal(isDue(s, at(19, 8, 29)), false); // Monday, too early
  assert.equal(isDue(s, at(19, 8, 30)), true);
  assert.equal(isDue(s, at(18, 10)), false); // Sunday
  assert.equal(isDue(parseSchedule('weekends')!, at(18, 0)), true);
});

const TEMPLATE = `---
title: Pre-market prep
doneWhen: Today's plan has entry, invalidation and size
schedule: weekdays 08:30   # every trading day
bundle:
  urls: []
---
- [x] Review overnight moves
- [ ] Mark key levels
`;

test('templates: a template becomes a fresh queued quest, and back', () => {
  assert.equal(scheduleOf(TEMPLATE), 'weekdays 08:30');
  const text = questFromTemplate(
    TEMPLATE,
    'pre-market-prep',
    '2026-10-19T08:31:00.000Z',
  );
  const q = parseQuestFile('pre-market-prep-2026-10-19', text);
  assert.equal(q.status, 'queued');
  assert.equal(q.template, 'pre-market-prep');
  assert.deepEqual(
    q.objectives.map((o) => o.done),
    [false, false],
  );
  assert.equal(scheduleOf(text), null);

  const back = templateFromQuest(text, 'mon,wed 09:00');
  assert.equal(scheduleOf(back), 'mon,wed 09:00');
  assert.doesNotMatch(back, /template:|status:|createdAt:/);
});
