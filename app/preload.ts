// Bridge between the UI and the orchestrator. The UI gets a narrow API,
// never ipcRenderer itself (Electron IPC security guidance).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  ChatEvent,
  CockpitApi,
  CockpitSnapshot,
} from '../orchestrator/types';
import { IPC } from './ipc';

const api: CockpitApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.snapshot),
  completeObjective: () => ipcRenderer.invoke(IPC.completeObjective),
  startNextQuest: () => ipcRenderer.invoke(IPC.startNextQuest),
  activateQuest: (id) => ipcRenderer.invoke(IPC.activateQuest, id),
  pauseQuest: (note) => ipcRenderer.invoke(IPC.pauseQuest, note),
  openBundle: () => ipcRenderer.invoke(IPC.openBundle),
  createMissingFolders: () => ipcRenderer.invoke(IPC.createMissingFolders),
  acceptDraft: (draft, start) =>
    ipcRenderer.invoke(IPC.acceptDraft, draft, start),
  discardDraft: () => ipcRenderer.invoke(IPC.discardDraft),
  getJournal: () => ipcRenderer.invoke(IPC.journalToday),
  endSession: () => ipcRenderer.invoke(IPC.endSession),
  markWorking: () => ipcRenderer.invoke(IPC.markWorking),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  sendChat: (text) => ipcRenderer.invoke(IPC.chatSend, text),
  answerConfirm: (id, ok) => ipcRenderer.invoke(IPC.chatAnswer, id, ok),
  onChat(cb) {
    const listener = (_e: IpcRendererEvent, event: ChatEvent) => cb(event);
    ipcRenderer.on(IPC.chatEvent, listener);
    return () => ipcRenderer.removeListener(IPC.chatEvent, listener);
  },
  onSnapshot(cb) {
    const listener = (_e: IpcRendererEvent, s: CockpitSnapshot) => cb(s);
    ipcRenderer.on(IPC.snapshot, listener);
    return () => ipcRenderer.removeListener(IPC.snapshot, listener);
  },
};

contextBridge.exposeInMainWorld('cockpit', api);
