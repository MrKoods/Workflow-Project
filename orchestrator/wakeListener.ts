// The wake word in the main process (Phase 1 Task 6). The window streams mic
// frames here over local IPC only while the wake word is switched on;
// detection runs on this PC (onnxruntime-web, WebAssembly) and nothing goes
// to a speech service until the word fires.
//
// Models live in wake/ (gitignored): openWakeWord's two feature models plus
// one wake model. A file with "echo" in its name wins (Nick's trained
// "Hey Echo", docs/WAKE-WORD.md); otherwise any other wake model is used as a
// stand-in (e.g. openWakeWord's hey_jarvis_v0.1.onnx).
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { WakeDetector } from './wakeCore.ts';
import { createOnnxRunner } from './wakeOnnx.ts';

const FEATURES = ['melspectrogram.onnx', 'embedding_model.onnx'];
const NOT_WAKE = new Set([...FEATURES, 'silero_vad.onnx']);

export interface WakeStatus {
  state: 'off' | 'loading' | 'ready' | 'missing' | 'error';
  /** "Hey Echo", "Hey Jarvis" … from the model's file name. */
  word?: string;
  /** True until a model with "echo" in its name is in wake/. */
  standIn?: boolean;
  error?: string;
}

/** The wake model to use from a folder listing, or null. */
export function pickWakeModel(files: string[]): string | null {
  const models = files.filter(
    (f) => f.toLowerCase().endsWith('.onnx') && !NOT_WAKE.has(f.toLowerCase()),
  );
  return models.find((f) => /echo/i.test(f)) ?? models.sort()[0] ?? null;
}

/** "hey_echo.onnx" -> "Hey Echo"; "hey_jarvis_v0.1.onnx" -> "Hey Jarvis". */
export function wakeWordName(file: string): string {
  return file
    .replace(/\.onnx$/i, '')
    .replace(/_v\d+(\.\d+)*$/i, '')
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function createWakeListener({
  dir,
  onWake,
  onStatus,
  threshold = 0.5,
  log,
}: {
  dir: string;
  onWake: () => void;
  onStatus: (s: WakeStatus) => void;
  threshold?: number;
  log?: (line: string) => void;
}) {
  let status: WakeStatus = { state: 'off' };
  let detector: WakeDetector | null = null;
  let loading: Promise<void> | null = null;
  let on = false;

  const set = (s: WakeStatus) => {
    status = s;
    onStatus(s);
  };

  async function load() {
    const files = await readdir(dir).catch(() => [] as string[]);
    const wake = pickWakeModel(files);
    if (!wake || !FEATURES.every((f) => files.includes(f))) {
      set({ state: 'missing' });
      return;
    }
    set({ state: 'loading' });
    try {
      // External in the main bundle (vite.main.config.mts): it finds its own .wasm files.
      const ort = await import('onnxruntime-web');
      ort.env.wasm.numThreads = 1;
      const [mel, embed, model] = await Promise.all(
        [...FEATURES, wake].map((f) => readFile(path.join(dir, f))),
      );
      detector = new WakeDetector(
        await createOnnxRunner(ort, { mel, embed, wake: model }),
        { threshold },
      );
      const word = wakeWordName(wake);
      log?.(`[wake] listening for "${word}" (${wake})`);
      set({ state: on ? 'ready' : 'off', word, standIn: !/echo/i.test(wake) });
    } catch (e) {
      detector = null;
      set({ state: 'error', error: (e as Error).message });
    }
  }

  return {
    status: () => status,
    /** Switch on (loads the models the first time). */
    async enable() {
      on = true;
      loading ??= load();
      await loading;
      if (detector) set({ ...status, state: 'ready' });
    },
    disable() {
      on = false;
      detector?.reset();
      if (status.state === 'ready') set({ ...status, state: 'off' });
    },
    /** One 16 kHz 16-bit mono frame from the mic. */
    feed(frame: Uint8Array) {
      if (!on || !detector) return;
      const pcm = new Int16Array(
        frame.buffer.slice(
          frame.byteOffset,
          frame.byteOffset + (frame.byteLength & ~1),
        ),
      );
      void detector.push(pcm).then((r) => {
        if (r.fired && on) {
          log?.(`[wake] heard "${status.word}" (score ${r.score.toFixed(2)})`);
          detector?.reset();
          onWake();
        }
      });
    },
    /** After a turn, start fresh (no stale audio from before). */
    reset: () => detector?.reset(),
  };
}

export type WakeListener = ReturnType<typeof createWakeListener>;
