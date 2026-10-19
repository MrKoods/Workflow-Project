// Shared between the orchestrator (main process) and the UI (type-only imports there).
import type { HotkeyAction } from './keymap.ts';

export const QUEST_STATUSES = ['active', 'paused', 'queued', 'done'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

/**
 * Companion voice. auto (default) = playful while the companion has the floor
 * (intro, between steps, wrap-up), steady while a step's card is up (Nick,
 * 2026-10-18). steady / playful pin one voice.
 */
export const VOICES = ['auto', 'steady', 'playful'] as const;
/** The voice actually in use at a moment. */
export type VoiceNow = 'steady' | 'playful';

/** Persisted user settings (FEATURES §4). */
export interface Settings {
  /** Color skin id = file name in skins/palettes/ (default aqua). */
  palette: string;
  voice: (typeof VOICES)[number];
  calm: boolean;
  /** The companion speaks out loud (Phase 1). Off = captions only. */
  speech: boolean;
  /** Speech volume 0..1. */
  volume: number;
  /** Deepgram voice for the Playful and the Steady voice (aura-2-<name>-en). */
  voicePlayful: string;
  voiceSteady: string;
  /** Listen for the wake word (Phase 1 Task 6). Keeps the mic open on this PC. */
  wakeWord: boolean;
  /** Hotkey overrides by action (defaults in orchestrator/keymap.ts). */
  hotkeys: Partial<Record<HotkeyAction, string>>;
}

export interface Objective {
  title: string;
  done: boolean;
}

// ---- Quest file v2 (Orbit): items + scripted beats (docs/reference/demo-quest.md) ----

export type ItemType = 'link' | 'checklist' | 'draft' | 'tags';
export type QuestItem =
  | {
      type: 'link';
      title: string;
      url: string;
      cta: string;
      preview: [string, string][];
    }
  | { type: 'checklist'; title: string; checks: string[] }
  | { type: 'draft'; title: string; cta: string; text: string }
  | { type: 'tags'; title: string; cta: string; tags: string[] };

/** A reply chip. With `answer` the companion answers and the step stays; without, it advances. */
export interface Reply {
  label: string;
  answer?: string;
}
/** One scripted moment in a quest (see orchestrator/focusEngine.ts). */
export interface Beat {
  say?: string;
  /** Steady wording of `say`, used when the voice in use is steady. */
  steady?: string;
  focus?: string;
  support?: string[];
  tick?: string;
  stepDone?: boolean;
  end?: boolean;
  replies?: Reply[];
}
export interface Step {
  id: string;
  title: string;
  short: string;
  icon: string;
  beats: Beat[];
}

// ---- Focus engine view (what the Orbit UI renders; orchestrator/focusEngine.ts) ----

export type ItemState = 'hero' | 'sup1' | 'sup2' | 'done' | 'off';
export type FocusMode = 'm-comp' | 'm-task';
export type FocusCompanionState =
  | 'waiting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'working';
export interface PlanetView {
  k: number;
  label: string;
  icon: string;
  state: 'later' | 'upnext' | 'pulled' | 'done';
}

/** Everything the Orbit screen needs, pushed on every engine change. */
export interface FocusView {
  /** The quest this engine runs; items/steps come from the snapshot's quest. */
  questId: string;
  mode: FocusMode;
  items: Record<string, ItemState>;
  planets: PlanetView[];
  orbitDeg: number;
  /** 360 / number of steps. */
  stepAngle: number;
  companion: FocusCompanionState;
  caption: { who: 'companion' | 'you'; text: string };
  log: { who: string; text: string }[];
  replies: Reply[];
  /** Checklist item id -> boxes ticked so far. */
  ticks: Record<string, number>;
  stepIndex: number;
  doneSteps: number;
  complete: boolean;
  /** True while a reply moves the script on (else free text goes to Claude). */
  waiting: boolean;
  /** The voice in use right now (auto follows the mode). */
  voice: VoiceNow;
  /** Swap: the step being looked at, or null for the live step. */
  peek: number | null;
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
  /** One per step, from the body's checkboxes (step progress for v1 and v2). */
  objectives: Objective[];
  /** 1 = Phase 0 file (steps generated from objectives), 2 = Orbit file with items/intro/steps. */
  format: 1 | 2;
  items: Record<string, QuestItem>;
  intro: Beat[];
  steps: Step[];
  /** Per-quest voice (auto | steady | playful); a Settings choice other than auto wins. */
  voice?: (typeof VOICES)[number];
  resumeNote?: string;
  createdAt?: string;
  pausedAt?: string;
  completedAt?: string;
  /** Made from templates/<id>.md (Phase 1 Task 7). */
  template?: string;
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
  /** The active quest, or the one just finished this session (so Orbit can show "Quest complete"). */
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

/** Speech audio for the window (mirrors orchestrator/speech.ts SpeechMessage). */
export type SpeechMessageView =
  | { type: 'chunk'; id: number; pcm: Uint8Array }
  | { type: 'end'; id: number }
  | { type: 'stop' };

/** Wake word status (mirrors orchestrator/wakeListener.ts WakeStatus). */
export interface WakeStatusView {
  state: 'off' | 'loading' | 'ready' | 'missing' | 'error';
  word?: string;
  standIn?: boolean;
  error?: string;
}

/** Push-to-talk state for the UI (mirrors orchestrator/talk.ts TalkState). */
export interface TalkStateView {
  auto?: boolean;
  phase: 'idle' | 'connecting' | 'listening' | 'finishing';
  partial: string;
  error?: string;
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
  /** Orbit: the focus engine's current view (null when no quest is on screen). */
  getFocus(): Promise<FocusView | null>;
  onFocus(cb: (view: FocusView | null) => void): () => void;
  /** Companion voice level 0..1 while it "speaks" (feeds Bloom). */
  onVoice(cb: (level: number) => void): () => void;
  /** Swap to another step on the orbit (view and use; steps finish in order). */
  peekStep(target: number | 'prev' | 'next' | 'current'): Promise<void>;
  /** Reply chip or Say box: goes to the engine if it's waiting, else to Claude. */
  reply(text: string): Promise<void>;
  /** Push-to-talk (Phase 1): open the speech connection / send / drop. */
  talkStart(): Promise<void>;
  talkStop(): Promise<void>;
  talkCancel(): Promise<void>;
  /** One 16 kHz 16-bit mono PCM frame while talking (fire and forget). */
  talkAudio(frame: ArrayBuffer): void;
  onTalkState(cb: (state: TalkStateView) => void): () => void;
  /** Companion speech audio (Phase 1 Task 3): play it, then report played(id). */
  onSpeech(cb: (msg: SpeechMessageView) => void): () => void;
  speechPlayed(id: number): void;
  /** Wake word: mic frames to the local detector (fire and forget). */
  wakeAudio(frame: ArrayBuffer): void;
  getWakeStatus(): Promise<WakeStatusView>;
  onWakeStatus(cb: (s: WakeStatusView) => void): () => void;
  /** The wake word fired: talking has started hands-free. */
  onTalkAuto(cb: () => void): () => void;
  /** Global hotkeys Windows wouldn't give us (another app owns them). */
  hotkeyTrouble(): Promise<Partial<Record<HotkeyAction, string>>>;
  /** Settings: hear a voice say a sample line. */
  speechPreview(voiceId: string): Promise<void>;
  /** Ctrl+Alt+V from any app: start or stop talking. */
  onTalkToggle(cb: () => void): () => void;
  /** An item's button (open link / copy draft or tags). */
  itemAction(itemId: string): Promise<void>;
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
  /** Save a quest as a template on a schedule (Phase 1 Task 7). Errors come back as a string. */
  saveTemplate(id: string, schedule: string): Promise<string>;
  /** Make a quest active, pausing the current one with a resume note. */
  switchQuest(id: string): Promise<string>;
  /** Resolve a folder path if it may be created (inside Documents); null otherwise. */
  folderInDocuments(folder: string): string | null;
  createFolder(folder: string): Promise<string>;
  /** The companion voice in use right now (Orbit focus engine). */
  voiceNow?(): VoiceNow;
  /** Log the session debrief and set the quest the next day starts with. */
  recordSession(summary: string, firstQuestId?: string): Promise<string>;
}
