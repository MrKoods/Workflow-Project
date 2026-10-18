// Append-only journal: one JSON line per entry, one file per local day.
import { appendFile, mkdir } from 'node:fs/promises';
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
  };
}

export type Journal = ReturnType<typeof createJournal>;
