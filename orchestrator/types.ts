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
  completedAt?: string;
}

export interface CockpitSnapshot {
  /** The active quest, or the one just finished this session (so the HUD can show "Quest complete"). */
  current: Quest | null;
  queue: { id: string; title: string }[];
}

export interface CompleteResult {
  objective: string;
  questComplete: boolean;
}

export type JournalKind =
  | 'start'
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
  onSnapshot(cb: (snapshot: CockpitSnapshot) => void): () => void;
}
