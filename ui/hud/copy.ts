// Placeholder companion text per orb state. Real lines come from Claude in Task 5.
export const COMPANION_LINES = {
  listening: "I'm listening. Talk me through what you're seeing.",
  thinking: 'Thinking it through…',
  speaking: "Here's what I'd do next.",
  waiting: "Your move. I'll log what you get done.",
  working: "Opening this quest's tabs and folders. Keep going.",
} as const;

export const AI_LABELS = {
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  waiting: 'Your move',
  working: 'Party working',
} as const;

export const KIND_LABELS: Record<string, string> = {
  start: 'Started',
  pause: 'Paused',
  resume: 'Resumed',
  finish: 'Quest done',
  objective: 'Objective',
  decision: 'Decision',
  note: 'Note',
  agent: 'Agent',
  summary: 'Session',
};
