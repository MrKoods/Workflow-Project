// Shared between the orchestrator (main process) and the UI (type-only imports there).

export const QUEST_STATUSES = ['active', 'paused', 'queued', 'done'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export interface Objective {
  title: string;
  done: boolean;
}

export interface Bundle {
  folders: string[];
  urls: string[];
  apps: string[];
}

export interface Quest {
  id: string; // file name without .md
  title: string;
  doneWhen: string;
  status: QuestStatus;
  bundle: Bundle;
  objectives: Objective[];
  resumeNote?: string;
  createdAt?: string;
  pausedAt?: string;
  completedAt?: string;
}

export interface QueueItem {
  id: string;
  title: string;
  status: 'queued' | 'paused';
  resumeNote?: string;
}

export interface CockpitSnapshot {
  /** The active quest, or the one just finished this session (so the HUD can show "Quest complete"). */
  current: Quest | null;
  /** Paused quests first, then queued, each in file-name order. */
  queue: QueueItem[];
  /** Latest one-line message for the companion (e.g. what the bundle opened). New seq = new message. */
  notice: {
    seq: number;
    text: string;
    /** An action the user can take on it, e.g. create the folders that were missing. */
    action?: 'create-folders';
  } | null;
}

export interface CompleteResult {
  objective: string;
  questComplete: boolean;
}

export type JournalKind =
  | 'start'
  | 'pause'
  | 'resume'
  | 'finish'
  | 'objective'
  | 'decision'
  | 'agent'
  | 'summary';

export interface JournalEntry {
  kind: JournalKind;
  questId?: string;
  text: string;
  at: string; // ISO timestamp
}

/** What the preload exposes as window.cockpit. */
export interface CockpitApi {
  getSnapshot(): Promise<CockpitSnapshot>;
  completeObjective(): Promise<CompleteResult | null>;
  startNextQuest(): Promise<void>;
  /** Start a queued quest or resume a paused one; only when nothing is active. */
  activateQuest(id: string): Promise<void>;
  /** Pause the active quest; an empty note becomes "Paused on objective N: …". */
  pauseQuest(note?: string): Promise<void>;
  /** Re-open the active quest's folders and sites. */
  openBundle(): Promise<void>;
  /** Create (inside the home folder) and open the folders the last bundle open couldn't find. */
  createMissingFolders(): Promise<void>;
  onSnapshot(cb: (snapshot: CockpitSnapshot) => void): () => void;
}
