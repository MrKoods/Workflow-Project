// The orchestrator owns all quest state (CLAUDE.md rule 4). The UI only sees
// snapshots and asks for changes through the preload bridge.
import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createFolders,
  describeOpen,
  expandHome,
  isInside,
  openBundle,
  type Opener,
} from './bundle.ts';
import { validateDraft, writeNewQuest } from './forge.ts';
import {
  createMeasureLog,
  type SetupEnd,
  type SetupTrigger,
} from './measure.ts';
import { createJournal, localDay } from './journal.ts';
import { createSettingsStore } from './settings.ts';
import {
  parseQuestFile,
  setFrontmatter,
  setObjectiveDone,
  setObjectives,
} from './questFile.ts';
import type {
  AcceptResult,
  CockpitSnapshot,
  CompleteResult,
  Quest,
  QuestChanges,
  QuestDraft,
  QuestDraftInput,
  QueueItem,
} from './types.ts';

export interface OrchestratorOptions {
  questsDir: string;
  journalDir: string;
  /** Small JSON file for app state that isn't quest content (e.g. last bundle open). */
  stateFile: string;
  /** User settings (default: settings.json next to stateFile). */
  settingsFile?: string;
  /** The user's Documents folder: the only place create_folder may write. */
  documentsDir: string;
  opener: Opener;
  warn?: (msg: string) => void;
  now?: () => Date;
  /** Task 7: stop an unconfirmed setup timer after this long (default 10 min). */
  setupTimeoutMs?: number;
}

interface LocalState {
  lastBundleOpen?: { questId: string; day: string };
  /** Set by End session: the quest the next day starts with. */
  firstQuest?: { questId: string; setOn: string };
}

export function createOrchestrator({
  questsDir,
  journalDir,
  stateFile,
  settingsFile = path.join(path.dirname(stateFile), 'settings.json'),
  documentsDir,
  opener,
  warn = console.warn,
  now = () => new Date(),
  setupTimeoutMs = 10 * 60 * 1000,
}: OrchestratorOptions) {
  const journal = createJournal(journalDir, now);
  const measure = createMeasureLog(journalDir);
  const settings = createSettingsStore(settingsFile);
  const listeners = new Set<(s: CockpitSnapshot) => void>();
  let quests: Quest[] = [];
  let justFinished: string | null = null; // keeps a finished quest on screen until the next starts
  let notice: CockpitSnapshot['notice'] = null;
  let draft: QuestDraft | null = null; // Quest Forge card, in memory until Accept
  let firstQuest: LocalState['firstQuest'] | null = null; // mirrors state.json
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
      draft,
      setupTimer: setupTimer
        ? {
            questId: setupTimer.quest.id,
            startedAt: setupTimer.startedAt.toISOString(),
          }
        : null,
      firstQuest: firstQuest
        ? {
            id: firstQuest.questId,
            title:
              quests.find((q) => q.id === firstQuest!.questId)?.title ??
              firstQuest.questId,
            setOn: firstQuest.setOn,
          }
        : null,
      settings: settings.get(),
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

  // ---- Task 7: setup timer ("start quest" -> "I'm working") -------------
  let setupTimer: {
    quest: Quest;
    trigger: SetupTrigger;
    startedAt: Date;
    timeout: NodeJS.Timeout;
  } | null = null;

  function startTimer(quest: Quest, trigger: SetupTrigger) {
    if (setupTimer) clearTimeout(setupTimer.timeout);
    const timeout = setTimeout(
      () => void serial(() => endTimer('timeout')),
      setupTimeoutMs,
    );
    timeout.unref?.();
    setupTimer = { quest, trigger, startedAt: now(), timeout };
  }

  function dropTimer() {
    if (setupTimer) clearTimeout(setupTimer.timeout);
    setupTimer = null;
  }

  async function endTimer(endedBy: SetupEnd) {
    if (!setupTimer) return;
    const { quest, trigger, startedAt } = setupTimer;
    dropTimer();
    const endedAt =
      endedBy === 'timeout'
        ? new Date(startedAt.getTime() + setupTimeoutMs)
        : now();
    await measure.addTime({
      questId: quest.id,
      questTitle: quest.title,
      trigger,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      seconds: Math.max(
        0,
        Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
      ),
      confirmed: endedBy === 'tap',
      endedBy,
    });
    if (endedBy === 'tap') {
      const secs = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
      say(
        `Setup took ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}. Logged.`,
      );
    }
    emit();
  }

  /** Open a quest's bundle; with a trigger, this is a session start and the setup timer runs. */
  async function openAndTell(quest: Quest, trigger?: SetupTrigger) {
    if (trigger) startTimer(quest, trigger);
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
    await openAndTell(active()!, resuming ? 'resume' : 'start');
  }

  async function pause(quest: Quest, note?: string) {
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
    await journal.add({ kind: 'pause', questId: quest.id, text: resumeNote });
    if (setupTimer?.quest.id === quest.id) dropTimer(); // no work started: nothing to measure
    return resumeNote;
  }

  return {
    async start() {
      await settings.load();
      await load();
      firstQuest = (await readState()).firstQuest ?? null;

      // A new day after End session: start with the quest that was set for it,
      // if nothing else is active. Either way the plan has done its job.
      const today = localDay(now());
      if (firstQuest && firstQuest.setOn !== today) {
        const planned = quests.find(
          (q) =>
            q.id === firstQuest!.questId &&
            (q.status === 'queued' || q.status === 'paused'),
        );
        firstQuest = null;
        const { firstQuest: _done, ...rest } = await readState();
        await writeState(rest);
        if (planned && !active()) await serial(() => activate(planned));
      }

      // First launch of the day re-opens the active quest's bundle; later restarts don't.
      const quest = active();
      const last = (await readState()).lastBundleOpen;
      if (
        quest &&
        (last?.questId !== quest.id || last.day !== localDay(now()))
      ) {
        await serial(() => openAndTell(quest, 'launch'));
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
      dropTimer();
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
        // v2: write the whole step checklist, so a file without boxes gets them.
        await edit(quest.id, (t) =>
          quest.format === 2
            ? setObjectives(
                t,
                quest.objectives.map((o, i) => ({
                  title: o.title,
                  done: o.done || i === index,
                })),
              )
            : setObjectiveDone(t, index, true),
        );
        // Finishing an objective means work started; time unknown, so unconfirmed.
        if (setupTimer?.quest.id === quest.id) await endTimer('objective');
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
        await pause(quest, note);
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

    // ---- Quest Forge (Task 5b) -------------------------------------------

    /** Companion tool draft_quest: show (or revise) the draft card. Writes nothing. */
    setDraft(input: QuestDraftInput) {
      draft = { ...input, rev: (draft?.rev ?? 0) + 1 };
      emit();
    },

    /** The user pressed Accept: validate their (possibly edited) card and write the file. */
    acceptDraft: (input: unknown, start: boolean) =>
      serial(async (): Promise<AcceptResult> => {
        const checked = validateDraft(input);
        if (!checked.ok) return checked;
        await load();
        // One active quest: start now only if nothing else is active.
        const status = start && !active() ? 'active' : 'queued';
        await mkdir(questsDir, { recursive: true });
        const id = await writeNewQuest(
          questsDir,
          checked.draft,
          status,
          now().toISOString(),
        );
        await journal.add({
          kind: status === 'active' ? 'start' : 'decision',
          questId: id,
          text:
            status === 'active'
              ? checked.draft.title
              : `Created quest "${checked.draft.title}" (queued)`,
        });
        draft = null;
        justFinished = null;
        await reload();
        if (status === 'active') await openAndTell(active()!, 'start');
        else {
          say(`Queued "${checked.draft.title}". It's in the quest log.`);
          emit();
        }
        return { ok: true, id, status };
      }),

    discardDraft: () =>
      serial(async () => {
        draft = null;
        emit();
      }),

    /** Companion tool update_quest (after the user confirms): title, done-when, objectives. */
    updateQuest: (id: string, changes: QuestChanges) =>
      serial(async (): Promise<string> => {
        await load();
        const quest = quests.find((q) => q.id === id);
        if (!quest) return `No quest with id "${id}".`;
        if (changes.objectives && quest.format === 2)
          return 'This quest has scripted steps (quest file v2); its steps can only be changed in the file.';
        const patch: Record<string, string> = {};
        if (changes.title !== undefined) patch.title = changes.title;
        if (changes.doneWhen !== undefined) patch.doneWhen = changes.doneWhen;
        // Reuse the draft rules so an edited quest is as valid as a new one.
        const checked = validateDraft({
          title: patch.title ?? quest.title,
          doneWhen: patch.doneWhen ?? (quest.doneWhen || '-'),
          objectives:
            changes.objectives ?? quest.objectives.map((o) => o.title),
        });
        if (!checked.ok) return checked.error;
        if (Object.keys(patch).length) {
          await edit(id, (t) => setFrontmatter(t, patch));
        }
        if (changes.objectives) {
          // Keep the done flag of objectives whose title didn't change.
          const done = new Set(
            quest.objectives.filter((o) => o.done).map((o) => o.title),
          );
          const list = checked.draft.objectives.map((title) => ({
            title,
            done: done.has(title),
          }));
          await edit(id, (t) => setObjectives(t, list));
        }
        await journal.add({
          kind: 'decision',
          questId: id,
          text: `Edited quest "${checked.draft.title}"`,
        });
        await reload();
        return `Updated "${checked.draft.title}".`;
      }),

    /** Companion tool set_active_quest: pause the current quest (with a resume note) and switch. */
    switchQuest: (id: string) =>
      serial(async (): Promise<string> => {
        await load();
        const target = quests.find((q) => q.id === id);
        if (!target) return `No quest with id "${id}".`;
        if (target.status === 'active')
          return `"${target.title}" is already active.`;
        if (target.status === 'done')
          return `"${target.title}" is already done.`;
        const current = active();
        if (current) {
          const step = current.objectives.findIndex((o) => !o.done);
          await pause(
            current,
            `Paused to switch to "${target.title}"` +
              (step >= 0
                ? `, was on objective ${step + 1}: ${current.objectives[step].title}`
                : ''),
          );
          await load();
        }
        await activate(quests.find((q) => q.id === id)!);
        return current
          ? `Paused "${current.title}" and started "${target.title}".`
          : `Started "${target.title}".`;
      }),

    /** Resolve a folder for create_folder: must be inside Documents. */
    folderInDocuments(folder: string) {
      const docs = path.resolve(documentsDir);
      const full = path.resolve(docs, expandHome(folder));
      return isInside(full, docs) ? full : null;
    },

    /** Companion tool create_folder (after the user confirms). */
    createFolder: (folder: string) =>
      serial(async (): Promise<string> => {
        const docs = path.resolve(documentsDir);
        const full = path.resolve(docs, expandHome(folder));
        if (!isInside(full, docs))
          return `Only folders inside ${docs} can be created.`;
        await mkdir(full, { recursive: true });
        await journal.add({
          kind: 'decision',
          questId: active()?.id,
          text: `Created folder ${full}`,
        });
        return `Created ${full}.`;
      }),

    /** Settings → Color skin etc. Invalid fields are ignored. */
    setSettings: (patch: unknown) =>
      serial(async () => {
        const next = await settings.set(patch);
        emit();
        return next;
      }),

    /** Task 7: the user tapped "I'm working": log the setup time. */
    markWorking: () => serial(() => endTimer('tap')),

    /** Companion tool: a journal note in its own words. */
    addJournalNote: (text: string) =>
      serial(async () => {
        await journal.add({ kind: 'note', questId: active()?.id, text });
        emit(); // the journal panel refreshes on snapshots
      }),

    /** Today's journal, oldest first (journal panel). */
    journalToday: () => journal.day(now()),

    /**
     * Companion tool end_session: log the debrief and set the quest the next
     * day starts with (it becomes active on the first launch of the next day).
     */
    recordSession: (summary: string, firstQuestId?: string) =>
      serial(async (): Promise<string> => {
        await load();
        let planned: Quest | undefined;
        if (firstQuestId) {
          planned = quests.find((q) => q.id === firstQuestId);
          if (!planned || planned.status === 'done') {
            return `No open quest with id "${firstQuestId}".`;
          }
        }
        await journal.add({
          kind: 'summary',
          questId: active()?.id,
          text: summary,
        });
        const { firstQuest: _old, ...rest } = await readState();
        firstQuest = planned
          ? { questId: planned.id, setOn: localDay(now()) }
          : null;
        await writeState(firstQuest ? { ...rest, firstQuest } : rest);
        say(
          planned
            ? `Session logged. Tomorrow starts with "${planned.title}".`
            : 'Session logged.',
        );
        emit();
        return planned
          ? `Saved the summary. Tomorrow starts with "${planned.title}".`
          : 'Saved the summary. No first quest set for tomorrow.';
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
