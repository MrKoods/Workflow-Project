// Bridge between the UI and the orchestrator. The UI gets a narrow API,
// never ipcRenderer itself (Electron IPC security guidance).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CockpitApi, CockpitSnapshot } from '../orchestrator/types';
import { IPC } from './ipc';

const api: CockpitApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.snapshot),
  completeObjective: () => ipcRenderer.invoke(IPC.completeObjective),
  startNextQuest: () => ipcRenderer.invoke(IPC.startNextQuest),
  activateQuest: (id) => ipcRenderer.invoke(IPC.activateQuest, id),
  pauseQuest: (note) => ipcRenderer.invoke(IPC.pauseQuest, note),
  openBundle: () => ipcRenderer.invoke(IPC.openBundle),
  onSnapshot(cb) {
    const listener = (_e: IpcRendererEvent, s: CockpitSnapshot) => cb(s);
    ipcRenderer.on(IPC.snapshot, listener);
    return () => ipcRenderer.removeListener(IPC.snapshot, listener);
  },
};

contextBridge.exposeInMainWorld('cockpit', api);
