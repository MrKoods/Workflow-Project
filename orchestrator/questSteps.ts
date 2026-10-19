// Quest file v2 (Orbit): validate `items`, `intro`, `steps` from the
// frontmatter, or build generic steps from a v1 file's objectives.
// Bad input throws QuestFileError with the path of the bad field.
import type { Beat, QuestItem, Reply, Step } from './types.ts';

export class QuestFileError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, at: string): string => {
  if (typeof v !== 'string' || !v.trim())
    throw new QuestFileError(`${at} must be a non-empty string`);
  return v;
};
const optStr = (v: unknown, at: string) => (v == null ? undefined : str(v, at));
const strList = (v: unknown, at: string): string[] => {
  if (!Array.isArray(v) || !v.length)
    throw new QuestFileError(`${at} must be a non-empty list`);
  return v.map((x, i) => str(x, `${at}[${i}]`));
};

function item(v: unknown, at: string): QuestItem {
  if (!isObj(v)) throw new QuestFileError(`${at} must be a mapping`);
  const title = str(v.title, `${at}.title`);
  switch (v.type) {
    case 'link': {
      const url = str(v.url, `${at}.url`);
      if (!/^https?:\/\//i.test(url))
        throw new QuestFileError(`${at}.url must be http(s)`);
      const preview = (v.preview ?? []) as unknown;
      if (
        !Array.isArray(preview) ||
        !preview.every(
          (r) =>
            Array.isArray(r) &&
            r.length === 2 &&
            r.every((c) => typeof c === 'string'),
        )
      )
        throw new QuestFileError(`${at}.preview must be [label, value] pairs`);
      return {
        type: 'link',
        title,
        url,
        cta: optStr(v.cta, `${at}.cta`) ?? 'Open',
        preview: preview as [string, string][],
      };
    }
    case 'checklist':
      return {
        type: 'checklist',
        title,
        checks: strList(v.checks, `${at}.checks`),
      };
    case 'draft':
      return {
        type: 'draft',
        title,
        cta: optStr(v.cta, `${at}.cta`) ?? 'Copy',
        text: str(v.text, `${at}.text`),
      };
    case 'tags':
      return {
        type: 'tags',
        title,
        cta: optStr(v.cta, `${at}.cta`) ?? 'Copy all',
        tags: strList(v.tags, `${at}.tags`),
      };
    default:
      throw new QuestFileError(
        `${at}.type must be link, checklist, draft or tags`,
      );
  }
}

function replies(v: unknown, at: string): Reply[] {
  if (!Array.isArray(v) || !v.length)
    throw new QuestFileError(`${at} must be a non-empty list`);
  return v.map((r, i) => {
    if (!isObj(r)) throw new QuestFileError(`${at}[${i}] must be a mapping`);
    const answer = optStr(r.answer, `${at}[${i}].answer`);
    return answer
      ? { label: str(r.label, `${at}[${i}].label`), answer }
      : { label: str(r.label, `${at}[${i}].label`) };
  });
}

function beat(v: unknown, at: string, items: Record<string, QuestItem>): Beat {
  if (!isObj(v)) throw new QuestFileError(`${at} must be a mapping`);
  const ref = (id: unknown, field: string) => {
    const s = str(id, `${at}.${field}`);
    if (!items[s]) throw new QuestFileError(`${at}.${field}: no item "${s}"`);
    return s;
  };
  const b: Beat = {};
  if (v.say != null) b.say = str(v.say, `${at}.say`);
  if (v.focus != null) b.focus = ref(v.focus, 'focus');
  if (v.support != null) {
    if (!Array.isArray(v.support) || v.support.length > 2)
      throw new QuestFileError(`${at}.support must list up to 2 item ids`);
    b.support = v.support.map((id) => ref(id, 'support'));
  }
  if (v.tick != null) {
    b.tick = ref(v.tick, 'tick');
    if (items[b.tick].type !== 'checklist')
      throw new QuestFileError(`${at}.tick must name a checklist item`);
  }
  if (v.stepDone === true) b.stepDone = true;
  if (v.end === true) b.end = true;
  if (v.replies != null) b.replies = replies(v.replies, `${at}.replies`);
  if (!Object.keys(b).length) throw new QuestFileError(`${at} is empty`);
  return b;
}

const beats = (v: unknown, at: string, items: Record<string, QuestItem>) => {
  if (!Array.isArray(v)) throw new QuestFileError(`${at} must be a list`);
  return v.map((b, i) => beat(b, `${at}[${i}]`, items));
};

/** A v2 file has `steps` in its frontmatter. */
export const isV2 = (fm: Obj) => fm.steps != null;

export function parseV2(fm: Obj) {
  if (fm.items != null && !isObj(fm.items))
    throw new QuestFileError('items must be a mapping');
  const items: Record<string, QuestItem> = {};
  for (const [id, v] of Object.entries((fm.items ?? {}) as Obj))
    items[id] = item(v, `items.${id}`);

  const intro = fm.intro == null ? [] : beats(fm.intro, 'intro', items);
  if (!Array.isArray(fm.steps) || !fm.steps.length)
    throw new QuestFileError('steps must be a non-empty list');
  const ids = new Set<string>();
  const steps: Step[] = fm.steps.map((v, k) => {
    const at = `steps[${k}]`;
    if (!isObj(v)) throw new QuestFileError(`${at} must be a mapping`);
    const id = str(v.id ?? `step-${k + 1}`, `${at}.id`);
    if (ids.has(id)) throw new QuestFileError(`${at}.id "${id}" is repeated`);
    ids.add(id);
    const title = str(v.title, `${at}.title`);
    return {
      id,
      title,
      short: optStr(v.short, `${at}.short`) ?? shortLabel(title),
      icon: optStr(v.icon, `${at}.icon`) ?? '•',
      beats: beats(v.beats, `${at}.beats`, items),
    };
  });
  return { items, intro, steps };
}

/** ~16 characters for a planet label: cut at a word boundary, then "…". */
export function shortLabel(text: string, max = 16): string {
  const t = text.trim();
  if (t.length <= max) return t;
  // Look one past max so a cut that lands on a word's end keeps that word.
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, '');
  const keep = cut.length >= 4 && cut.length <= max ? cut : t.slice(0, max - 1);
  return keep.replace(/[\s,.;:–-]+$/, '') + '…';
}

/** v1 → steps: one generic beat sequence per objective (ORBIT-UPGRADE Task 3). */
export function stepsFromObjectives(titles: string[]): Step[] {
  return titles.map((title, k) => ({
    id: `objective-${k + 1}`,
    title,
    short: shortLabel(title),
    icon: '•',
    beats: [
      { say: `Step ${k + 1}: ${title}. Say done when it's finished.` },
      { replies: [{ label: 'Done' }] },
      k === titles.length - 1
        ? { stepDone: true, end: true }
        : { stepDone: true },
    ],
  }));
}
