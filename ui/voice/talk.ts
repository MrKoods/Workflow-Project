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
  /** Hands-free listening began: the wake word (chime) or a conversation follow-up (soft cue). */
  onWake?(followUp: boolean): void;
}

export function createTalkControl(api: CockpitApi, hooks: TalkHooks) {
  let active = false;
  let held = false; // started by the push-to-talk key (vs. toggle / button)
  let auto = false; // started by the wake word; the orchestrator ends it
  let wakeOn = false; // wake word listening: mic stays open, frames to the detector
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let opening: Promise<void> | null = null;
  let closeTimer = 0;
  let conversation = false; // an open-mic conversation is on (main says)

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
      if (active) {
        api.talkAudio(e.data.pcm);
        hooks.onLevel(Math.min(1, e.data.rms * 6));
      } else if (wakeOn) api.wakeAudio(e.data.pcm); // local detection only
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
    auto = false;
    hooks.onActive(false);
    hooks.onLevel(0);
    void (send ? api.talkStop() : api.talkCancel());
    scheduleClose();
  }
  function scheduleClose() {
    clearTimeout(closeTimer);
    if (!wakeOn) closeTimer = window.setTimeout(closeMic, MIC_IDLE_CLOSE_MS);
  }
  function openForWake() {
    opening ??= openMic().catch((err: Error) => {
      closeMic();
      hooks.onError(`Microphone unavailable for the wake word: ${err.message}`);
    });
  }

  // Hands-free: the orchestrator started talking after the wake word (or
  // reopened the mic for the next turn of a conversation), and ends it when
  // you stop speaking (its state goes back to idle).
  api.onTalkAuto(({ followUp }) => {
    if (active) return;
    active = true;
    auto = true;
    held = false;
    clearTimeout(closeTimer);
    hooks.onActive(true);
    hooks.onWake?.(followUp);
    opening ??= openMic().catch((err: Error) => {
      closeMic();
      hooks.onError(`Microphone unavailable: ${err.message}`);
    });
  });
  api.onConversation((on) => {
    conversation = on;
    hooks.onActive(active); // repaint the Talk button
  });
  api.onTalkState((s) => {
    if (auto && active && s.phase === 'idle') {
      active = false;
      auto = false;
      hooks.onActive(false);
      hooks.onLevel(0);
      scheduleClose();
    }
  });

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
    /** Talk button / Ctrl+Alt+V: talking -> send now; in a conversation ->
     *  end it; otherwise start a hands-free conversation. */
    toggle() {
      if (active) end(true);
      else if (conversation) void api.talkCancel();
      else void api.talkHandsFree();
    },
    get conversation() {
      return conversation;
    },
    /** Wake word on (model loaded) / off: keeps the mic open while on. */
    setWake(on: boolean) {
      if (on === wakeOn) return;
      wakeOn = on;
      if (on) {
        clearTimeout(closeTimer);
        openForWake();
      } else if (!active) scheduleClose();
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
