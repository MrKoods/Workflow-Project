// Bridge between the UI and the orchestrator. The UI gets a narrow API,
// never ipcRenderer itself (Electron IPC security guidance).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  ChatEvent,
  CockpitApi,
  CockpitSnapshot,
  FocusView,
  SpeechMessageView,
  TalkStateView,
  UiCommand,
  WakeStatusView,
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
  getFocus: () => ipcRenderer.invoke(IPC.focus),
  reply: (text) => ipcRenderer.invoke(IPC.reply, text),
  itemAction: (id) => ipcRenderer.invoke(IPC.itemAction, id),
  peekStep: (target) => ipcRenderer.invoke(IPC.peekStep, target),
  talkStart: () => ipcRenderer.invoke(IPC.talkStart),
  talkStop: () => ipcRenderer.invoke(IPC.talkStop),
  talkCancel: () => ipcRenderer.invoke(IPC.talkCancel),
  talkAudio: (frame) => ipcRenderer.send(IPC.talkAudio, frame),
  onTalkState(cb) {
    const listener = (_e: IpcRendererEvent, s: TalkStateView) => cb(s);
    ipcRenderer.on(IPC.talkState, listener);
    return () => ipcRenderer.removeListener(IPC.talkState, listener);
  },
  onSpeech(cb) {
    const listener = (_e: IpcRendererEvent, m: SpeechMessageView) => cb(m);
    ipcRenderer.on(IPC.speech, listener);
    return () => ipcRenderer.removeListener(IPC.speech, listener);
  },
  speechPlayed: (id) => ipcRenderer.send(IPC.speechPlayed, id),
  speechPreview: (voiceId) => ipcRenderer.invoke(IPC.speechPreview, voiceId),
  hotkeyTrouble: () => ipcRenderer.invoke(IPC.hotkeyTrouble),
  wakeAudio: (frame) => ipcRenderer.send(IPC.wakeAudio, frame),
  getWakeStatus: () => ipcRenderer.invoke(IPC.wakeStatus),
  onWakeStatus(cb) {
    const listener = (_e: IpcRendererEvent, s: WakeStatusView) => cb(s);
    ipcRenderer.on(IPC.wakeStatus, listener);
    return () => ipcRenderer.removeListener(IPC.wakeStatus, listener);
  },
  onUiCommand(cb) {
    const listener = (_e: IpcRendererEvent, cmd: UiCommand) => cb(cmd);
    ipcRenderer.on(IPC.uiCommand, listener);
    return () => ipcRenderer.removeListener(IPC.uiCommand, listener);
  },
  onTalkAuto(cb) {
    const listener = () => cb();
    ipcRenderer.on(IPC.talkAuto, listener);
    return () => ipcRenderer.removeListener(IPC.talkAuto, listener);
  },
  onTalkToggle(cb) {
    const listener = () => cb();
    ipcRenderer.on(IPC.talkToggle, listener);
    return () => ipcRenderer.removeListener(IPC.talkToggle, listener);
  },
  onFocus(cb) {
    const listener = (_e: IpcRendererEvent, v: FocusView | null) => cb(v);
    ipcRenderer.on(IPC.focus, listener);
    return () => ipcRenderer.removeListener(IPC.focus, listener);
  },
  onVoice(cb) {
    const listener = (_e: IpcRendererEvent, level: number) => cb(level);
    ipcRenderer.on(IPC.voice, listener);
    return () => ipcRenderer.removeListener(IPC.voice, listener);
  },
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
