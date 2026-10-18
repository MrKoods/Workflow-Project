// The orchestrator owns all quest state (CLAUDE.md rule 4). The UI only sees
// snapshots and asks for changes through the preload bridge.
import { watch, type FSWatcher } from 'node:fs';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createJournal } from './journal.ts';
import {
  parseQuestFile,
  setFrontmatter,
  setObjectiveDone,
} from './questFile.ts';
import type { CockpitSnapshot, CompleteResult, Quest } from './types.ts';

export interface OrchestratorOptions {
  questsDir: string;
  journalDir: string;
  warn?: (msg: string) => void;
}

export function createOrchestrator({
  questsDir,
  journalDir,
  warn = console.warn,
}: OrchestratorOptions) {
  const journal = createJournal(journalDir);
  const listeners = new Set<(s: CockpitSnapshot) => void>();
  let quests: Quest[] = [];
  let justFinished: string | null = null; // keeps a finished quest on screen until the next starts
  let watcher: FSWatcher | null = null;

  // Mutations run one at a time so two clicks can't race on the same file.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };

  const fileOf = (id: string) => path.join(questsDir, `${id}.md`);

  async function edit(id: string, change: (text: string) => string) {
    const file = fileOf(id);
    const next = change(await readFile(file, 'utf8'));
    const tmp = path.join(questsDir, `.${id}.md.tmp`);
    await writeFile(tmp, next, 'utf8');
    await rename(tmp, file);
  }

  async function load() {
    const names = (await readdir(questsDir).catch(() => [] as string[]))
      .filter((n) => n.endsWith('.md') && !n.startsWith('.'))
      .sort();
    const loaded: Quest[] = [];
    for (const name of names) {
      const id = name.slice(0, -3);
      try {
        loaded.push(
          parseQuestFile(
            id,
            await readFile(path.join(questsDir, name), 'utf8'),
          ),
        );
      } catch (e) {
        warn(`[orchestrator] skipped quests/${name}: ${(e as Error).message}`);
      }
    }
    quests = loaded;

    // One active quest at a time (CLAUDE.md rule 1): keep the first, queue the rest.
    const [, ...extra] = quests.filter((q) => q.status === 'active');
    for (const q of extra) {
      await edit(q.id, (t) => setFrontmatter(t, { status: 'queued' }));
      q.status = 'queued';
      await journal.add({
        kind: 'decision',
        questId: q.id,
        text: `Moved "${q.title}" to the queue: only one quest can be active.`,
      });
    }
  }

  function snapshot(): CockpitSnapshot {
    const current =
      quests.find((q) => q.status === 'active') ??
      quests.find((q) => q.id === justFinished && q.status === 'done') ??
      null;
    return {
      current,
      queue: quests
        .filter((q) => q.status === 'queued')
        .map(({ id, title }) => ({ id, title })),
    };
  }

  const emit = () => {
    const s = snapshot();
    for (const fn of listeners) fn(s);
  };

  async function reload() {
    await load();
    emit();
  }

  return {
    async start() {
      await load();
      // Quest files are plain markdown: edits from VS Code or Claude Code show up live.
      let timer: NodeJS.Timeout | undefined;
      try {
        watcher = watch(questsDir, (_event, name) => {
          if (
            name &&
            (!String(name).endsWith('.md') || String(name).startsWith('.'))
          )
            return;
          clearTimeout(timer);
          timer = setTimeout(() => void serial(reload), 150);
        });
      } catch (e) {
        warn(
          `[orchestrator] not watching ${questsDir}: ${(e as Error).message}`,
        );
      }
    },

    stop() {
      watcher?.close();
      listeners.clear();
    },

    snapshot,

    onChange(fn: (s: CockpitSnapshot) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Tick the active quest's next open objective; finishes the quest on the last one. */
    completeObjective: () =>
      serial(async (): Promise<CompleteResult | null> => {
        await load();
        const quest = quests.find((q) => q.status === 'active');
        const index = quest?.objectives.findIndex((o) => !o.done) ?? -1;
        if (!quest || index < 0) return null;

        const objective = quest.objectives[index].title;
        await edit(quest.id, (t) => setObjectiveDone(t, index, true));
        await journal.add({
          kind: 'objective',
          questId: quest.id,
          text: objective,
        });

        const questComplete = quest.objectives.every(
          (o, i) => o.done || i === index,
        );
        if (questComplete) {
          await edit(quest.id, (t) =>
            setFrontmatter(t, {
              status: 'done',
              completedAt: new Date().toISOString(),
            }),
          );
          await journal.add({
            kind: 'finish',
            questId: quest.id,
            text: quest.title,
          });
          justFinished = quest.id;
        }
        await reload();
        return { objective, questComplete };
      }),

    /** Activate the first queued quest, if nothing is active. */
    startNextQuest: () =>
      serial(async () => {
        await load();
        if (quests.some((q) => q.status === 'active')) return;
        const next = quests.find((q) => q.status === 'queued');
        if (!next) return;
        await edit(next.id, (t) => setFrontmatter(t, { status: 'active' }));
        await journal.add({
          kind: 'start',
          questId: next.id,
          text: next.title,
        });
        justFinished = null;
        await reload();
      }),
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
