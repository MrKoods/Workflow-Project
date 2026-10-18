// Quest files: markdown with YAML frontmatter; objectives are the body's checkboxes.
// Edits are surgical (one checkbox char, or frontmatter keys) so hand-written
// notes, comments and line endings survive.
import { parseDocument } from 'yaml';
import {
  QUEST_STATUSES,
  type Bundle,
  type Quest,
  type QuestStatus,
} from './types.ts';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(\r?\n|$)/;
const CHECKBOX = /^(\s*[-*] \[)([ xX])(\]\s+)(.*\S)\s*$/;

export class QuestFileError extends Error {}

const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');

function split(text: string) {
  const m = FRONTMATTER.exec(text);
  if (!m) throw new QuestFileError('missing --- frontmatter --- block');
  return { yaml: m[1], body: text.slice(m[0].length), head: m[0] };
}

const strings = (v: unknown, field: string): string[] => {
  if (v == null) return [];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
  throw new QuestFileError(`${field} must be a list of strings`);
};

const optionalString = (v: unknown) =>
  v == null ? undefined : v instanceof Date ? v.toISOString() : String(v);

export function parseQuestFile(id: string, text: string): Quest {
  const { yaml, body } = split(text);
  const doc = parseDocument(yaml);
  if (doc.errors.length)
    throw new QuestFileError(`frontmatter: ${doc.errors[0].message}`);
  const fm = (doc.toJS() ?? {}) as Record<string, unknown>;

  if (typeof fm.title !== 'string' || !fm.title.trim()) {
    throw new QuestFileError('frontmatter needs a title');
  }
  const status = (fm.status ?? 'queued') as QuestStatus;
  if (!QUEST_STATUSES.includes(status)) {
    throw new QuestFileError(
      `status must be one of ${QUEST_STATUSES.join(', ')}`,
    );
  }
  const b = (fm.bundle ?? {}) as Record<string, unknown>;
  const bundle: Bundle = {
    folders: strings(b.folders, 'bundle.folders'),
    urls: strings(b.urls, 'bundle.urls'),
    apps: strings(b.apps, 'bundle.apps'),
  };

  const objectives = body
    .split(/\r?\n/)
    .map((line) => CHECKBOX.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ title: m[4], done: m[2] !== ' ' }));

  return {
    id,
    title: fm.title.trim(),
    doneWhen: typeof fm.doneWhen === 'string' ? fm.doneWhen : '',
    status,
    bundle,
    objectives,
    resumeNote: optionalString(fm.resumeNote),
    createdAt: optionalString(fm.createdAt),
    completedAt: optionalString(fm.completedAt),
  };
}

/** Tick or untick the index-th checkbox in the body. */
export function setObjectiveDone(
  text: string,
  index: number,
  done: boolean,
): string {
  const { head, body } = split(text);
  const eol = eolOf(text);
  let seen = -1;
  const lines = body.split(/\r?\n/).map((line) => {
    const m = CHECKBOX.exec(line);
    if (!m || ++seen !== index) return line;
    return `${m[1]}${done ? 'x' : ' '}${m[3]}${m[4]}`;
  });
  if (seen < index) throw new QuestFileError(`no objective #${index + 1}`);
  return head + lines.join(eol);
}

/** Set (or with undefined, remove) frontmatter keys, keeping comments and order. */
export function setFrontmatter(
  text: string,
  patch: Record<string, unknown>,
): string {
  const { yaml, body } = split(text);
  const eol = eolOf(text);
  const doc = parseDocument(yaml);
  if (doc.errors.length)
    throw new QuestFileError(`frontmatter: ${doc.errors[0].message}`);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) doc.delete(key);
    else doc.set(key, value);
  }
  const fm = doc.toString().replace(/\n$/, '').split('\n').join(eol);
  return `---${eol}${fm}${eol}---${eol}${body}`;
}
