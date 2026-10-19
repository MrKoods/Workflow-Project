// Shared between the orchestrator (main process) and the UI (type-only imports there).

export const QUEST_STATUSES = ['active', 'paused', 'queued', 'done'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export const VOICES = ['steady', 'playful'] as const;

/** Persisted user settings (FEATURES §4). */
export interface Settings {
  /** Color skin id = file name in skins/palettes/ (default aqua). */
  palette: string;
  voice: (typeof VOICES)[number];
  calm: boolean;
}

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

/** A quest the companion drafted (Quest Forge), shown as an editable card. */
export interface QuestDraftInput {
  title: string;
  doneWhen: string;
  objectives: string[];
  folders: string[];
  urls: string[];
}

export interface QuestDraft extends QuestDraftInput {
  /** Bumped on every revision so the card knows to refresh its fields. */
  rev: number;
}

export type AcceptResult =
  | { ok: true; id: string; status: 'active' | 'queued' }
  | { ok: false; error: string };

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
  /** Quest Forge draft awaiting Accept / Discard. */
  draft: QuestDraft | null;
  /** Task 7: running while a session's setup is being timed (until "I'm working"). */
  setupTimer: { questId: string; startedAt: string } | null;
  /** Set by End session: the quest the next day starts with. */
  firstQuest: { id: string; title: string; setOn: string } | null;
  settings: Settings;
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
  | 'note' // written by the companion via add_journal_entry
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
  /** Send a chat message to the companion; replies stream back through onChat. */
  sendChat(text: string): Promise<void>;
  /** Answer a confirmation the companion asked for (e.g. completing an objective). */
  answerConfirm(id: string, ok: boolean): Promise<void>;
  onChat(cb: (event: ChatEvent) => void): () => void;
  onSnapshot(cb: (snapshot: CockpitSnapshot) => void): () => void;
  /** Quest Forge: write the (possibly edited) draft as a new quest file. */
  acceptDraft(draft: QuestDraftInput, start: boolean): Promise<AcceptResult>;
  discardDraft(): Promise<void>;
  /** Today's journal entries, oldest first. */
  getJournal(): Promise<JournalEntry[]>;
  /** Ask the companion for a debrief; it logs it and sets tomorrow's first quest. */
  endSession(): Promise<void>;
  /** Task 7: stop the setup timer ("I'm working"). */
  markWorking(): Promise<void>;
  /** Merge and persist settings (palette, voice, calm); the new snapshot follows. */
  setSettings(patch: Partial<Settings>): Promise<Settings>;
}

/** Changes the companion can make to an existing quest (after the user confirms). */
export interface QuestChanges {
  title?: string;
  doneWhen?: string;
  objectives?: string[];
}

/** Orb states the companion drives while it works. */
export type CompanionState = 'thinking' | 'speaking' | 'working' | 'waiting';

/** Streamed from the companion (main process) to the UI. */
export type ChatEvent =
  | { type: 'user'; text: string }
  | { type: 'state'; ai: CompanionState }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'action'; text: string } // a short line about a tool the companion ran
  | { type: 'confirm'; id: string; text: string }
  | { type: 'confirmed'; id: string; ok: boolean }
  | { type: 'objective-completed'; result: CompleteResult }
  | { type: 'error'; text: string };

/** What the companion's tools need from the orchestrator. */
export interface CompanionHost {
  snapshot(): CockpitSnapshot;
  completeObjective(): Promise<CompleteResult | null>;
  addJournalNote(text: string): Promise<void>;
  openBundleItem(item: string): Promise<string>;
  recentJournal(limit: number): Promise<JournalEntry[]>;
  /** Show (or replace) the Quest Forge draft card. Writes nothing. */
  setDraft(draft: QuestDraftInput): void;
  /** Apply validated changes to a quest file. Errors come back as a string. */
  updateQuest(id: string, changes: QuestChanges): Promise<string>;
  /** Make a quest active, pausing the current one with a resume note. */
  switchQuest(id: string): Promise<string>;
  /** Resolve a folder path if it may be created (inside Documents); null otherwise. */
  folderInDocuments(folder: string): string | null;
  createFolder(folder: string): Promise<string>;
  /** Log the session debrief and set the quest the next day starts with. */
  recordSession(summary: string, firstQuestId?: string): Promise<string>;
}
