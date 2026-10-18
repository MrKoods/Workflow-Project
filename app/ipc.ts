// IPC channel names, shared by main.ts and preload.ts.
export const IPC = {
  snapshot: 'cockpit:snapshot',
  completeObjective: 'cockpit:complete-objective',
  startNextQuest: 'cockpit:start-next-quest',
} as const;
