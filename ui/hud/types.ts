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

/** UI-only presentation state. Quest state comes from the orchestrator. */
export interface HudState {
  ai: AiState;
  slot: number; // active hotbar slot, -1 = none
  logOpen: boolean;
  calm: boolean;
}
