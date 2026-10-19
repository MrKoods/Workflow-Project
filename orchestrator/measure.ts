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
  /** Which screen ran the session; records from before Orbit have none (= the Phase 0 HUD). */
  layout?: 'hud' | 'orbit';
}

export const layoutOf = (t: SetupTime) => t.layout ?? 'hud';

/** ORBIT-UPGRADE Task 8: compare Orbit with the Phase 0 HUD over this many sessions. */
export const COMPARE_SESSIONS = 5;

export interface Baseline {
  at: string;
  minutes: number;
  note?: string;
}

/** Phase 1 Task 5: one spoken turn, from key release to the first word heard back. */
export interface VoiceTurn {
  at: string; // ISO time of the key release
  /** script = the quest engine answered; claude = it went to Claude. */
  route: 'script' | 'claude';
  transcriptMs: number; // release -> final transcript
  firstAudioMs: number; // release -> first audio of the reply
}

/** Targets from FEATURES §0 (2026-10-18, Task 1): medians, release -> first word. */
export const VOICE_TARGET_MS = { script: 600, claude: 2200 } as const;

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
  const turns = path.join(dir, 'voice-turns.jsonl');
  return {
    addVoiceTurn: (t: VoiceTurn) => append(turns, t),
    readVoiceTurns: () => readJsonl<VoiceTurn>(turns),
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
  const byLayout = (l: 'hud' | 'orbit') => {
    const xs = confirmed.filter((t) => layoutOf(t) === l).map((t) => t.seconds);
    return { count: xs.length, medianSeconds: median(xs) };
  };
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
    hud: byLayout('hud'),
    orbit: byLayout('orbit'),
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

export function formatVoiceReport(turns: VoiceTurn[]): string {
  const lines = [
    'Spoken turns: key release -> first word of the reply (medians)',
    '',
  ];
  for (const route of ['script', 'claude'] as const) {
    const xs = turns.filter((t) => t.route === route);
    const audio = median(xs.map((t) => t.firstAudioMs));
    const stt = median(xs.map((t) => t.transcriptMs));
    const target = VOICE_TARGET_MS[route];
    const name = route === 'script' ? 'Scripted replies' : 'Claude replies  ';
    lines.push(
      audio === null
        ? `  ${name}: no turns yet`
        : `  ${name}: ${Math.round(audio)} ms (transcript ${Math.round(stt!)} ms) over ${xs.length} turn${xs.length === 1 ? '' : 's'}, target < ${target} ms: ${audio < target ? 'OK' : 'TOO SLOW'}`,
    );
  }
  return lines.join('\n');
}

export function formatReport(
  times: SetupTime[],
  baselines: Baseline[],
): string {
  const s = summarize(times, baselines);
  const lines = ['Cockpit setup time (start quest -> first real work)', ''];
  for (const t of times) {
    lines.push(
      `  ${localStamp(t.startedAt)}  ${fmt(t.seconds).padStart(6)}  ${t.confirmed ? '   ' : '(?)'} ${layoutOf(t).padEnd(5)} ${t.trigger.padEnd(6)} ${t.questTitle}`,
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
  lines.push(
    '',
    `Orbit vs Phase 0 HUD (confirmed): Orbit ${fmt(s.orbit.medianSeconds)} over ${s.orbit.count}/${COMPARE_SESSIONS} sessions, HUD ${fmt(s.hud.medianSeconds)} over ${s.hud.count}.`,
  );
  if (s.orbit.count >= COMPARE_SESSIONS && s.hud.medianSeconds !== null) {
    lines.push(
      s.orbit.medianSeconds! < s.hud.medianSeconds
        ? 'Orbit is faster to first real work. Focus switching earns its place.'
        : 'Orbit is not faster than the HUD on this number (FEATURES §3.8: the focus model is wrong, or needs tuning).',
    );
  } else if (!s.hud.count) {
    lines.push(
      'No HUD sessions were recorded, so Orbit is compared with the manual baseline only.',
    );
  }
  if (s.days < 5) {
    lines.push(`Phase 0 needs 5 separate days: ${s.days}/5 so far.`);
  }
  return lines.join('\n');
}
