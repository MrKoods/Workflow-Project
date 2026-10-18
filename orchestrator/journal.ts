// Append-only journal: one JSON line per entry, one file per local day.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { JournalEntry } from './types.ts';

export const localDay = (d: Date) =>
  [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');

export function createJournal(dir: string) {
  return {
    async add(entry: Omit<JournalEntry, 'at'>) {
      const now = new Date();
      const line: JournalEntry = { ...entry, at: now.toISOString() };
      await mkdir(dir, { recursive: true });
      await appendFile(
        path.join(dir, `${localDay(now)}.jsonl`),
        JSON.stringify(line) + '\n',
      );
    },

    /** Entries for one local day (today by default); unreadable lines are skipped. */
    async day(d = new Date()): Promise<JournalEntry[]> {
      let text: string;
      try {
        text = await readFile(path.join(dir, `${localDay(d)}.jsonl`), 'utf8');
      } catch {
        return [];
      }
      return text.split('\n').flatMap((line) => {
        try {
          return line.trim() ? [JSON.parse(line) as JournalEntry] : [];
        } catch {
          return [];
        }
      });
    },
  };
}

export type Journal = ReturnType<typeof createJournal>;
