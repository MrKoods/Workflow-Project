// Bridge between the UI and the orchestrator. The UI gets a narrow API,
// never ipcRenderer itself (Electron IPC security guidance).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CockpitApi, CockpitSnapshot } from '../orchestrator/types';
import { IPC } from './ipc';

const api: CockpitApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.snapshot),
  completeObjective: () => ipcRenderer.invoke(IPC.completeObjective),
  startNextQuest: () => ipcRenderer.invoke(IPC.startNextQuest),
  onSnapshot(cb) {
    const listener = (_e: IpcRendererEvent, s: CockpitSnapshot) => cb(s);
    ipcRenderer.on(IPC.snapshot, listener);
    return () => ipcRenderer.removeListener(IPC.snapshot, listener);
  },
};

contextBridge.exposeInMainWorld('cockpit', api);
