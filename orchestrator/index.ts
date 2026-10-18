// The orchestrator owns all quest state (CLAUDE.md rule 4). The UI only sees
// snapshots and asks for changes through the preload bridge.
import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createFolders,
  describeOpen,
  openBundle,
  type Opener,
} from './bundle.ts';
import { createJournal, localDay } from './journal.ts';
import {
  parseQuestFile,
  setFrontmatter,
  setObjectiveDone,
} from './questFile.ts';
import type {
  CockpitSnapshot,
  CompleteResult,
  Quest,
  QueueItem,
} from './types.ts';

export interface OrchestratorOptions {
  questsDir: string;
  journalDir: string;
  /** Small JSON file for app state that isn't quest content (e.g. last bundle open). */
  stateFile: string;
  opener: Opener;
  warn?: (msg: string) => void;
  now?: () => Date;
}

interface LocalState {
  lastBundleOpen?: { questId: string; day: string };
}

export function createOrchestrator({
  questsDir,
  journalDir,
  stateFile,
  opener,
  warn = console.warn,
  now = () => new Date(),
}: OrchestratorOptions) {
  const journal = createJournal(journalDir);
  const listeners = new Set<(s: CockpitSnapshot) => void>();
  let quests: Quest[] = [];
  let justFinished: string | null = null; // keeps a finished quest on screen until the next starts
  let notice: CockpitSnapshot['notice'] = null;
  let watcher: FSWatcher | null = null;

  // Mutations run one at a time so two clicks can't race on the same file.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };

  const fileOf = (id: string) => path.join(questsDir, `${id}.md`);
  const active = () => quests.find((q) => q.status === 'active');

  async function edit(id: string, change: (text: string) => string) {
    const file = fileOf(id);
    const next = change(await readFile(file, 'utf8'));
    const tmp = path.join(questsDir, `.${id}.md.tmp`);
    await writeFile(tmp, next, 'utf8');
    await rename(tmp, file);
  }

  async function readState(): Promise<LocalState> {
    try {
      return JSON.parse(await readFile(stateFile, 'utf8'));
    } catch {
      return {};
    }
  }
  async function writeState(state: LocalState) {
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(stateFile, JSON.stringify(state, null, 2));
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
      active() ??
      quests.find((q) => q.id === justFinished && q.status === 'done') ??
      null;
    const waiting = (status: QueueItem['status']) =>
      quests
        .filter((q) => q.status === status)
        .map(({ id, title, resumeNote }) => ({
          id,
          title,
          status,
          resumeNote,
        }));
    return {
      current,
      queue: [...waiting('paused'), ...waiting('queued')],
      notice,
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

  const say = (text: string, action?: 'create-folders') => {
    notice = { seq: (notice?.seq ?? 0) + 1, text, action };
  };

  // Folders the last bundle open couldn't find; offered to the user to create.
  let missingFolders: { questId: string; folders: string[] } | null = null;

  async function openAndTell(quest: Quest) {
    const result = await openBundle(quest.bundle, opener);
    await writeState({
      ...(await readState()),
      lastBundleOpen: { questId: quest.id, day: localDay(now()) },
    });
    missingFolders = result.missingFolders.length
      ? { questId: quest.id, folders: result.missingFolders }
      : null;
    say(describeOpen(result), missingFolders ? 'create-folders' : undefined);
    emit();
  }

  async function activate(quest: Quest) {
    const resuming = quest.status === 'paused';
    await edit(quest.id, (t) =>
      setFrontmatter(t, { status: 'active', pausedAt: undefined }),
    );
    await journal.add({
      kind: resuming ? 'resume' : 'start',
      questId: quest.id,
      text: quest.title,
    });
    justFinished = null;
    await reload();
    await openAndTell(active()!);
  }

  return {
    async start() {
      await load();

      // First launch of the day re-opens the active quest's bundle; later restarts don't.
      const quest = active();
      const last = (await readState()).lastBundleOpen;
      if (
        quest &&
        (last?.questId !== quest.id || last.day !== localDay(now()))
      ) {
        await serial(() => openAndTell(quest));
      }

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
        const quest = active();
        const index = quest?.objectives.findIndex((o) => !o.done) ?? -1;
        if (!quest || index < 0) return null;

        const objective = quest.objectives[index].title;
        await edit(quest.id, (t) => setObjectiveDone(t, index, true));
        await journal.add({
          kind: 'objective',
          questId: quest.id,
          text: objective,
        });
        // The resume note described where you left off; once you've moved on, it's stale.
        if (quest.resumeNote) {
          await edit(quest.id, (t) =>
            setFrontmatter(t, { resumeNote: undefined }),
          );
        }

        const questComplete = quest.objectives.every(
          (o, i) => o.done || i === index,
        );
        if (questComplete) {
          await edit(quest.id, (t) =>
            setFrontmatter(t, {
              status: 'done',
              completedAt: now().toISOString(),
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

    /** Activate the first queued quest (or, failing that, the first paused one). */
    startNextQuest: () =>
      serial(async () => {
        await load();
        if (active()) return;
        const next =
          quests.find((q) => q.status === 'queued') ??
          quests.find((q) => q.status === 'paused');
        if (next) await activate(next);
      }),

    /** Start a queued quest or resume a paused one; only when nothing is active. */
    activateQuest: (id: string) =>
      serial(async () => {
        await load();
        if (active()) return;
        const quest = quests.find(
          (q) =>
            q.id === id && (q.status === 'queued' || q.status === 'paused'),
        );
        if (quest) await activate(quest);
      }),

    /** Pause the active quest, saving where you left off. */
    pauseQuest: (note?: string) =>
      serial(async () => {
        await load();
        const quest = active();
        if (!quest) return;
        const step = quest.objectives.findIndex((o) => !o.done);
        const resumeNote =
          note?.trim() ||
          (step >= 0
            ? `Paused on objective ${step + 1}: ${quest.objectives[step].title}`
            : 'Paused');
        await edit(quest.id, (t) =>
          setFrontmatter(t, {
            status: 'paused',
            resumeNote,
            pausedAt: now().toISOString(),
          }),
        );
        await journal.add({
          kind: 'pause',
          questId: quest.id,
          text: resumeNote,
        });
        say(`Paused "${quest.title}". Pick it up from the quest log.`);
        await reload();
      }),

    /** Re-open the active quest's folders and sites. */
    openBundle: () =>
      serial(async () => {
        await load();
        const quest = active();
        if (quest) await openAndTell(quest);
      }),

    /** Companion tool: a journal note in its own words. */
    addJournalNote: (text: string) =>
      serial(async () => {
        await journal.add({ kind: 'note', questId: active()?.id, text });
      }),

    /**
     * Companion tool: open one entry of the active quest's bundle. Only exact
     * bundle entries open, so the model can't open arbitrary paths or URLs.
     */
    openBundleItem: (item: string) =>
      serial(async () => {
        await load();
        const quest = active();
        if (!quest) return 'No active quest.';
        const { folders, urls, apps } = quest.bundle;
        const pick = (list: string[]) => list.filter((x) => x === item);
        const one = {
          folders: pick(folders),
          urls: pick(urls),
          apps: pick(apps),
        };
        if (!one.folders.length && !one.urls.length && !one.apps.length) {
          return `"${item}" is not in this quest's bundle. Bundle: ${JSON.stringify(quest.bundle)}`;
        }
        return describeOpen(await openBundle(one, opener));
      }),

    /** The most recent journal entries from today, oldest first. */
    recentJournal: async (limit: number) =>
      (await journal.day(now())).slice(-limit),

    /** User clicked "Create folder": make the missing folders (home folder only) and open them. */
    createMissingFolders: () =>
      serial(async () => {
        await load();
        const quest = active();
        if (!quest || missingFolders?.questId !== quest.id) return;
        const { created, refused } = await createFolders(
          missingFolders.folders,
          opener,
        );
        missingFolders = null;
        for (const folder of created) {
          await journal.add({
            kind: 'decision',
            questId: quest.id,
            text: `Created folder ${folder}`,
          });
        }
        say(
          [
            created.length ? `Created and opened ${created.join(', ')}.` : '',
            refused.length
              ? `Didn't create ${refused.join(', ')}: only folders inside your user folder.`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
        emit();
      }),
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
