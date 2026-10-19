// Push-to-talk in the renderer (Phase 1 Task 2): owns the mic and the talk
// keys; the orchestrator owns speech-to-text. Hold Right Ctrl in Cockpit, or
// tap Ctrl+Alt+V anywhere (sent over IPC as a toggle), or click the mic
// button. Esc cancels. Right Ctrl + another key is a shortcut, so it cancels.
import type { CockpitApi } from '../../orchestrator/types';
import { pressed, released } from '../keys';

const MIC_IDLE_CLOSE_MS = 30_000; // keep the mic warm briefly between presses

export interface TalkHooks {
  /** 0..1 loudness while talking (Bloom listens to it). */
  onLevel(level: number): void;
  /** Talking started / ended on this side (before the server answers). */
  onActive(active: boolean): void;
  onError(message: string): void;
}

export function createTalkControl(api: CockpitApi, hooks: TalkHooks) {
  let active = false;
  let held = false; // started by Right Ctrl (vs. toggle / button)
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let opening: Promise<void> | null = null;
  let closeTimer = 0;

  async function openMic() {
    if (ctx) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(
      new URL('./pcm-worklet.js', import.meta.url),
    );
    const node = new AudioWorkletNode(ctx, 'pcm16', { numberOfOutputs: 0 });
    node.port.onmessage = (
      e: MessageEvent<{ pcm: ArrayBuffer; rms: number }>,
    ) => {
      if (!active) return;
      api.talkAudio(e.data.pcm);
      hooks.onLevel(Math.min(1, e.data.rms * 6));
    };
    ctx.createMediaStreamSource(stream).connect(node);
  }

  function closeMic() {
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    ctx = null;
    stream = null;
    opening = null;
  }

  function end(send: boolean) {
    if (!active) return;
    active = false;
    held = false;
    hooks.onActive(false);
    hooks.onLevel(0);
    void (send ? api.talkStop() : api.talkCancel());
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(closeMic, MIC_IDLE_CLOSE_MS);
  }

  const control = {
    get active() {
      return active;
    },
    start(byKey = false) {
      if (active) return;
      active = true;
      held = byKey;
      clearTimeout(closeTimer);
      hooks.onActive(true);
      // Open the speech connection and the mic in parallel.
      void api.talkStart();
      opening ??= openMic().catch((err: Error) => {
        closeMic();
        end(false);
        hooks.onError(
          err.name === 'NotAllowedError'
            ? 'Microphone blocked. Allow it for Cockpit in Windows Settings → Privacy → Microphone.'
            : `Microphone unavailable: ${err.message}`,
        );
      });
    },
    stop: () => end(true),
    cancel: () => end(false),
    toggle() {
      if (active) end(true);
      else control.start(false);
    },
  };

  // Keys. Capture phase, so Esc while talking doesn't also close a panel.
  window.addEventListener(
    'keydown',
    (e) => {
      if (pressed(e, 'pushToTalk')) {
        e.preventDefault();
        if (!e.repeat && !active) control.start(true);
        return;
      }
      if (active && e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        end(false);
        return;
      }
      // Push-to-talk key + another key (Right Ctrl + C…) is a shortcut, not talking.
      if (held) end(false);
    },
    true,
  );
  window.addEventListener('keyup', (e) => {
    if (held && released(e, 'pushToTalk')) end(true);
  });
  // Alt+Tab while holding would lose the key-up: send what we have.
  window.addEventListener('blur', () => {
    if (held) end(true);
  });
  api.onTalkToggle(() => control.toggle());

  return control;
}

export type TalkControl = ReturnType<typeof createTalkControl>;
