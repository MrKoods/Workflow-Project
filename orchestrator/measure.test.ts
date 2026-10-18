import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatReport, summarize, type SetupTime } from './measure.ts';

const t = (
  startedAt: string,
  seconds: number,
  confirmed = true,
): SetupTime => ({
  questId: 'q',
  questTitle: 'Q',
  trigger: 'start',
  startedAt,
  endedAt: startedAt,
  seconds,
  confirmed,
  endedBy: confirmed ? 'tap' : 'timeout',
});

test('summarize: medians, confirmed-only, distinct days, reduction', () => {
  const times = [
    t('2026-10-18T09:00:00', 60),
    t('2026-10-18T14:00:00', 120),
    t('2026-10-19T09:00:00', 90),
    t('2026-10-20T09:00:00', 600, false),
  ];
  const s = summarize(times, [
    { at: 'x', minutes: 5 },
    { at: 'y', minutes: 7 },
    { at: 'z', minutes: 6 },
  ]);
  assert.equal(s.sessions, 4);
  assert.equal(s.confirmed, 3);
  assert.equal(s.days, 2);
  assert.equal(s.medianSeconds, 90);
  assert.equal(s.baselineMedianSeconds, 360);
  assert.equal(s.reduction, 0.75);
});

test('report: asks for a baseline first, then gives a verdict', () => {
  assert.match(
    formatReport([t('2026-10-18T09:00:00', 60)], []),
    /add your manual baseline first/,
  );
  const good = formatReport(
    [t('2026-10-18T09:00:00', 60)],
    [{ at: 'x', minutes: 5 }],
  );
  assert.match(good, /Reduction: 80%/);
  assert.match(good, /cutting setup time/);
  assert.match(good, /1\/5 so far/);
  const bad = formatReport(
    [t('2026-10-18T09:00:00', 280)],
    [{ at: 'x', minutes: 5 }],
  );
  assert.match(bad, /under the 30% bar/);
  assert.match(
    formatReport([t('2026-10-18T09:00:00', 600, false)], []),
    /\(\?\)/,
  );
});
