// Quest templates (Phase 1 Task 7): a quest file in templates/ plus a
// `schedule:` line. On a scheduled day (once its time has passed) a fresh
// copy goes into quests/: nothing ticked, no resume note, tagged with the
// template id so a still-unfinished copy blocks the next one (no pile-up).
//
// schedule: "<days> [HH:MM]"
//   days = daily | weekdays | weekends | a list like mon,wed,fri
//   e.g. "weekdays 08:30", "daily", "mon,thu 09:00"
import { setFrontmatter } from './questFile.ts';

export interface Schedule {
  days: Set<number>; // 0 = Sunday … 6 = Saturday (Date.getDay)
  at?: { h: number; m: number };
}

const DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function parseSchedule(text: string): Schedule | null {
  const [days, time, ...rest] = text.trim().toLowerCase().split(/\s+/);
  if (!days || rest.length) return null;
  let set: number[];
  if (days === 'daily') set = [0, 1, 2, 3, 4, 5, 6];
  else if (days === 'weekdays') set = [1, 2, 3, 4, 5];
  else if (days === 'weekends') set = [0, 6];
  else {
    set = days.split(',').map((d) => DAY.indexOf(d.slice(0, 3)));
    if (!set.length || set.some((d) => d < 0)) return null;
  }
  let at: Schedule['at'];
  if (time) {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!m) return null;
    at = { h: Number(m[1]), m: Number(m[2]) };
  }
  return { days: new Set(set), at };
}

/** Is a copy due at this moment (right day, and past the time if one is set)? */
export function isDue(s: Schedule, now: Date): boolean {
  if (!s.days.has(now.getDay())) return false;
  if (!s.at) return true;
  return now.getHours() * 60 + now.getMinutes() >= s.at.h * 60 + s.at.m;
}

/** The `schedule:` value from a template's frontmatter, if any. */
export function scheduleOf(text: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const m = /^schedule:\s*["']?([^"'\r\n#]+?)["']?\s*(#.*)?$/m.exec(fm);
  return m ? m[1].trim() : null;
}

/** Template text -> today's quest file text. */
export function questFromTemplate(
  text: string,
  templateId: string,
  createdAt: string,
): string {
  const fresh = text.replace(/^(\s*[-*] \[)[xX](\])/gm, '$1 $2'); // untick
  return setFrontmatter(fresh, {
    schedule: undefined,
    status: 'queued',
    template: templateId,
    createdAt,
    resumeNote: undefined,
    pausedAt: undefined,
    completedAt: undefined,
  });
}

/** Quest text -> a template on a schedule (Quest Forge "save as template"). */
export function templateFromQuest(text: string, schedule: string): string {
  const fresh = text.replace(/^(\s*[-*] \[)[xX](\])/gm, '$1 $2');
  return setFrontmatter(fresh, {
    schedule,
    status: undefined,
    template: undefined,
    createdAt: undefined,
    resumeNote: undefined,
    pausedAt: undefined,
    completedAt: undefined,
  });
}
