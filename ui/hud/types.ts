export const AI_STATES = [
  'listening',
  'thinking',
  'speaking',
  'waiting',
  'working',
] as const;
export type AiState = (typeof AI_STATES)[number];

export interface BundleItem {
  name: string;
  stale?: boolean;
}

export interface HudQuest {
  title: string;
  doneWhen: string;
  objectives: string[];
  bundle: BundleItem[];
}

export interface HudModel {
  quest: HudQuest;
  queue: string[];
}

export interface HudState {
  ai: AiState;
  step: number; // index of the current objective; === objectives.length when done
  slot: number; // active hotbar slot, -1 = none
  logOpen: boolean;
  calm: boolean;
}
