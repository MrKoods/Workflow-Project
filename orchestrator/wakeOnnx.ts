// The WakeRunner on onnxruntime-web (WebAssembly): the same code runs in the
// Cockpit window and in Node tests. The ort module is passed in because the
// window and Node load it differently.
import type * as Ort from 'onnxruntime-web';
import type { WakeRunner } from './wakeCore.ts';

export interface WakeModels {
  mel: Uint8Array; // melspectrogram.onnx
  embed: Uint8Array; // embedding_model.onnx
  wake: Uint8Array; // e.g. hey_echo.onnx (trained) or hey_jarvis_v0.1.onnx (stand-in)
}

export async function createOnnxRunner(
  ort: typeof Ort,
  models: WakeModels,
): Promise<WakeRunner> {
  const opts: Ort.InferenceSession.SessionOptions = {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  };
  const [mel, embed, wake] = await Promise.all([
    ort.InferenceSession.create(models.mel, opts),
    ort.InferenceSession.create(models.embed, opts),
    ort.InferenceSession.create(models.wake, opts),
  ]);
  const out = (
    r: Ort.InferenceSession.OnnxValueMapType,
    s: Ort.InferenceSession,
  ) => (r[s.outputNames[0]] as Ort.Tensor).data as Float32Array;

  // The wake model's input is [1, N, 96]; N is usually 16.
  const meta = (wake as unknown as { inputMetadata?: { shape?: unknown[] }[] })
    .inputMetadata?.[0]?.shape?.[1];
  const frames = typeof meta === 'number' && meta > 0 ? meta : 16;

  return {
    frames,
    async mel(samples) {
      const t = new ort.Tensor('float32', samples, [1, samples.length]);
      return out(await mel.run({ [mel.inputNames[0]]: t }), mel);
    },
    async embed(window) {
      const t = new ort.Tensor('float32', window, [1, 76, 32, 1]);
      return out(await embed.run({ [embed.inputNames[0]]: t }), embed);
    },
    async score(features) {
      const t = new ort.Tensor('float32', features, [1, frames, 96]);
      return out(await wake.run({ [wake.inputNames[0]]: t }), wake)[0];
    },
  };
}
