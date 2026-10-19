// Quest Forge (PHASE-0 Task 5b): validate a drafted quest and write it as a
// new quest file in the Task 3 format. Never overwrites an existing file.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import type { QuestDraftInput } from './types.ts';

export const MAX_OBJECTIVES = 7;

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Check a draft against the quest schema. Returns the cleaned draft or what's wrong. */
export function validateDraft(
  input: unknown,
): { ok: true; draft: QuestDraftInput } | { ok: false; error: string } {
  const d = (input ?? {}) as Record<string, unknown>;
  const text = (v: unknown, field: string, max: number) => {
    if (typeof v !== 'string' || !oneLine(v)) throw `${field} is required.`;
    if (v.length > max) throw `${field} is too long (max ${max} characters).`;
    return oneLine(v);
  };
  const list = (v: unknown, field: string) => {
    if (v == null) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
      throw `${field} must be a list of strings.`;
    }
    return v.map(oneLine).filter(Boolean);
  };
  try {
    const objectives = list(d.objectives, 'objectives').map((o) => {
      if (o.length > 200)
        throw `Objective "${o.slice(0, 40)}…" is too long (max 200).`;
      return o;
    });
    if (objectives.length < 1 || objectives.length > MAX_OBJECTIVES) {
      throw `A quest needs 1-${MAX_OBJECTIVES} objectives (got ${objectives.length}).`;
    }
    const urls = list(d.urls, 'urls');
    for (const u of urls) {
      let ok = false;
      try {
        ok = ['http:', 'https:'].includes(new URL(u).protocol);
      } catch {
        // not a URL
      }
      if (!ok) throw `"${u}" is not an http(s) link.`;
    }
    const folders = list(d.folders, 'folders');
    for (const f of folders) {
      if (!/^(~[\\/]|[A-Za-z]:[\\/]|\/)/.test(f)) {
        throw `"${f}" must be a full path (C:/…, or ~/… for your user folder).`;
      }
    }
    return {
      ok: true,
      draft: {
        title: text(d.title, 'title', 120),
        doneWhen: text(d.doneWhen, 'doneWhen', 300),
        objectives,
        folders,
        urls,
      },
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'quest';

const scalar = (s: string) => stringify(s, { lineWidth: 0 }).trimEnd();

export function renderQuestFile(
  draft: QuestDraftInput,
  status: 'active' | 'queued',
  createdAt: string,
) {
  return [
    '---',
    `title: ${scalar(draft.title)}`,
    `doneWhen: ${scalar(draft.doneWhen)}`,
    `status: ${status}`,
    `createdAt: ${createdAt}`,
    'bundle:',
    `  folders: ${JSON.stringify(draft.folders)}`,
    `  urls: ${JSON.stringify(draft.urls)}`,
    '---',
    ...draft.objectives.map((o) => `- [ ] ${o}`),
    '',
  ].join('\n');
}

/** Write quests/<slug>.md; if taken, <slug>-2, -3, … Returns the new quest id. */
export async function writeNewQuest(
  questsDir: string,
  draft: QuestDraftInput,
  status: 'active' | 'queued',
  createdAt: string,
): Promise<string> {
  return writeNewFile(
    questsDir,
    slugify(draft.title),
    renderQuestFile(draft, status, createdAt),
  );
}

/** Write <dir>/<base>.md, or -2, -3 … if taken; never overwrites. Returns the id. */
export async function writeNewFile(
  dir: string,
  base: string,
  text: string,
): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    try {
      // 'wx' fails if the file exists, so an existing file is never overwritten.
      await writeFile(path.join(dir, `${id}.md`), text, { flag: 'wx' });
      return id;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error(`Too many files named ${base}`);
}
