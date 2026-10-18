// Task 7: measure setup time ("start quest" -> "first real work action") and
// compare it with a manual baseline. Plain JSONL files next to the journal.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { localDay } from './journal.ts';

export type SetupTrigger = 'start' | 'resume' | 'launch';
export type SetupEnd = 'tap' | 'timeout' | 'objective';

export interface SetupTime {
  questId: string;
  questTitle: string;
  trigger: SetupTrigger;
  startedAt: string;
  endedAt: string;
  seconds: number;
  /** Only a tap on "I'm working" is a confirmed measurement. */
  confirmed: boolean;
  endedBy: SetupEnd;
}

export interface Baseline {
  at: string;
  minutes: number;
  note?: string;
}

/** CONTEXT.md §12: less than ~30% reduction means bundles aren't the win. */
export const TARGET_REDUCTION = 0.3;

async function readJsonl<T>(file: string): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line) as T] : [];
    } catch {
      return [];
    }
  });
}

export function createMeasureLog(dir: string) {
  const times = path.join(dir, 'setup-times.jsonl');
  const baselines = path.join(dir, 'baseline.jsonl');
  const append = async (file: string, value: unknown) => {
    await mkdir(dir, { recursive: true });
    await appendFile(file, JSON.stringify(value) + '\n');
  };
  return {
    addTime: (t: SetupTime) => append(times, t),
    addBaseline: (b: Baseline) => append(baselines, b),
    readTimes: () => readJsonl<SetupTime>(times),
    readBaselines: () => readJsonl<Baseline>(baselines),
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function summarize(times: SetupTime[], baselines: Baseline[]) {
  const confirmed = times.filter((t) => t.confirmed);
  const days = new Set(confirmed.map((t) => localDay(new Date(t.startedAt))));
  const cockpit = median(confirmed.map((t) => t.seconds));
  const baseline = median(baselines.map((b) => b.minutes * 60));
  const reduction =
    cockpit !== null && baseline ? (baseline - cockpit) / baseline : null;
  return {
    sessions: times.length,
    confirmed: confirmed.length,
    days: days.size,
    medianSeconds: cockpit,
    baselineMedianSeconds: baseline,
    baselineCount: baselines.length,
    reduction,
  };
}

/** Local "YYYY-MM-DD HH:MM" (the log stores UTC ISO times). */
const localStamp = (iso: string) => {
  const d = new Date(iso);
  const hm = [d.getHours(), d.getMinutes()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return `${localDay(d)} ${hm}`;
};

const fmt = (s: number | null) =>
  s === null
    ? '-'
    : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function formatReport(
  times: SetupTime[],
  baselines: Baseline[],
): string {
  const s = summarize(times, baselines);
  const lines = ['Cockpit setup time (start quest -> first real work)', ''];
  for (const t of times) {
    lines.push(
      `  ${localStamp(t.startedAt)}  ${fmt(t.seconds).padStart(6)}  ${t.confirmed ? '   ' : '(?)'} ${t.trigger.padEnd(6)} ${t.questTitle}`,
    );
  }
  if (!times.length) lines.push('  (no sessions yet)');
  lines.push(
    '',
    `Sessions: ${s.sessions}, confirmed: ${s.confirmed} on ${s.days} day(s). (?) = no "I'm working" tap; not counted.`,
    `Median with Cockpit: ${fmt(s.medianSeconds)}`,
    `Median baseline:     ${fmt(s.baselineMedianSeconds)} (${s.baselineCount} timed run${s.baselineCount === 1 ? '' : 's'})`,
  );
  if (s.reduction === null) {
    lines.push(
      '',
      s.baselineCount
        ? 'Reduction: needs at least one confirmed Cockpit session.'
        : 'Reduction: add your manual baseline first: npm run measure -- baseline <minutes> [note]',
    );
  } else {
    const pct = Math.round(s.reduction * 100);
    lines.push(
      `Reduction: ${pct}% (target >= ${TARGET_REDUCTION * 100}%)`,
      s.reduction >= TARGET_REDUCTION
        ? 'Verdict: bundles are cutting setup time. Keep going.'
        : 'Verdict: under the 30% bar, so bundles alone are not the win yet (CONTEXT.md §12).',
    );
  }
  if (s.days < 5) {
    lines.push(`Phase 0 needs 5 separate days: ${s.days}/5 so far.`);
  }
  return lines.join('\n');
}
