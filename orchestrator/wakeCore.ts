// Wake word detection (Phase 1 Task 6): openWakeWord's streaming pipeline,
// re-implemented from openwakeword/utils.py + model.py (checked 2026-10-18):
//   16 kHz int16 audio, 1280 samples (80 ms) at a time, cast to float32
//   (NOT scaled to ±1) -> melspectrogram.onnx over the last 1280 + 480
//   samples -> 8 new frames × 32 bins, scaled x/10 + 2 -> embedding_model.onnx
//   on the last 76 frames -> one 96-value embedding per step -> the wake model
//   on the last N embeddings (N from its input shape) -> a 0..1 score.
// Everything runs locally; nothing leaves the PC until the word is heard.

export const WAKE_RATE = 16000;
const CHUNK = 1280; // 80 ms
const CONTEXT = 480; // 3 × 160-sample hops of extra context for the mel model
const MEL_BINS = 32;
const MEL_WINDOW = 76;
const EMBED = 96;

/** The three ONNX models, behind a tiny interface (onnxruntime in app and tests). */
export interface WakeRunner {
  /** float32 audio (int16 values) -> mel frames, row-major [frames][32]. */
  mel(samples: Float32Array): Promise<Float32Array>;
  /** [76][32] mel window -> one 96-value embedding. */
  embed(window: Float32Array): Promise<Float32Array>;
  /** [frames][96] embeddings -> score 0..1. */
  score(features: Float32Array): Promise<number>;
  /** How many embeddings the wake model reads (its input shape [1, N, 96]). */
  frames: number;
}

export interface WakeOptions {
  threshold?: number; // default 0.5 (openWakeWord's suggested starting point)
  /** Ignore further hits for this long after one fires. */
  refractoryMs?: number;
}

export class WakeDetector {
  private tail = new Float32Array(CONTEXT); // last 480 samples of the previous chunk
  private pending: number[] = []; // samples not yet making up a full chunk
  private mel: Float32Array[] = []; // recent mel frames
  private feats: Float32Array[] = []; // recent embeddings
  private steps = 0;
  private quietUntil = 0;
  private busy: Promise<unknown> = Promise.resolve();
  private readonly threshold: number;
  private readonly refractoryMs: number;

  private readonly runner: WakeRunner;

  // (No parameter properties: Node's type stripping runs the tests.)
  constructor(runner: WakeRunner, opts: WakeOptions = {}) {
    this.runner = runner;
    this.threshold = opts.threshold ?? 0.5;
    this.refractoryMs = opts.refractoryMs ?? 2000;
    // openWakeWord starts the mel buffer as ones (so early windows are full).
    for (let i = 0; i < MEL_WINDOW; i++)
      this.mel.push(new Float32Array(MEL_BINS).fill(1));
  }

  /**
   * Feed 16 kHz int16 audio; resolves with the best score of the chunks it
   * completed and whether the word fired. Calls are processed in order.
   */
  push(
    pcm: Int16Array,
    now = Date.now(),
  ): Promise<{ score: number; fired: boolean }> {
    const run = this.busy.then(() => this.process(pcm, now));
    this.busy = run.catch(() => {});
    return run;
  }

  private async process(pcm: Int16Array, now: number) {
    for (const s of pcm) this.pending.push(s);
    let best = 0;
    let fired = false;
    while (this.pending.length >= CHUNK) {
      const chunk = this.pending.splice(0, CHUNK);
      const input = new Float32Array(CONTEXT + CHUNK);
      input.set(this.tail, 0);
      for (let i = 0; i < CHUNK; i++) input[CONTEXT + i] = chunk[i];
      this.tail = input.slice(CHUNK); // the last 480 samples

      const mel = await this.runner.mel(input);
      for (let f = 0; f + MEL_BINS <= mel.length; f += MEL_BINS) {
        const frame = new Float32Array(MEL_BINS);
        for (let b = 0; b < MEL_BINS; b++) frame[b] = mel[f + b] / 10 + 2;
        this.mel.push(frame);
      }
      if (this.mel.length > MEL_WINDOW * 2)
        this.mel.splice(0, this.mel.length - MEL_WINDOW);

      const window = new Float32Array(MEL_WINDOW * MEL_BINS);
      this.mel
        .slice(-MEL_WINDOW)
        .forEach((fr, i) => window.set(fr, i * MEL_BINS));
      this.feats.push(await this.runner.embed(window));
      const n = this.runner.frames;
      if (this.feats.length > n) this.feats.splice(0, this.feats.length - n);

      this.steps++;
      // Like openWakeWord: no scores until the feature buffer is meaningful.
      if (this.feats.length < n || this.steps <= 5) continue;
      const features = new Float32Array(n * EMBED);
      this.feats.forEach((e, i) => features.set(e, i * EMBED));
      const score = await this.runner.score(features);
      best = Math.max(best, score);
      if (score >= this.threshold && now >= this.quietUntil) {
        fired = true;
        this.quietUntil = now + this.refractoryMs;
      }
    }
    return { score: best, fired };
  }

  /** Forget the audio so far (e.g. after talking, before listening again). */
  reset() {
    this.pending = [];
    this.tail = new Float32Array(CONTEXT);
    this.feats = [];
    this.steps = 0;
  }
}
