// IPC channel names, shared by main.ts and preload.ts.
export const IPC = {
  snapshot: 'cockpit:snapshot',
  completeObjective: 'cockpit:complete-objective',
  startNextQuest: 'cockpit:start-next-quest',
  activateQuest: 'cockpit:activate-quest',
  pauseQuest: 'cockpit:pause-quest',
  openBundle: 'cockpit:open-bundle',
  createMissingFolders: 'cockpit:create-missing-folders',
  chatSend: 'cockpit:chat-send',
  chatAnswer: 'cockpit:chat-answer',
  chatEvent: 'cockpit:chat-event',
} as const;
