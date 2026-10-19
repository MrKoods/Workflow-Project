// Wake word pipeline on the real openWakeWord models (Phase 1 Task 6), with
// "Hey Jarvis" as the stand-in until Nick's trained "Hey Echo" model exists.
// Skipped when the models aren't downloaded (wake/ is gitignored).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as ort from 'onnxruntime-web';
import { WakeDetector } from './wakeCore.ts';
import { createOnnxRunner } from './wakeOnnx.ts';

const wakeDir = new URL('../wake/', import.meta.url);
const model = (name: string) => new URL(name, wakeDir);
const have = [
  'melspectrogram.onnx',
  'embedding_model.onnx',
  'hey_jarvis_v0.1.onnx',
].every((n) => existsSync(model(n)));

/** 16 kHz mono 16-bit WAV -> samples, padded with 1 s of silence each side. */
function clip(name: string): Int16Array {
  const buf = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  const at = buf.indexOf('data');
  const data = buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at + 4));
  const pcm = new Int16Array(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.length),
  );
  const out = new Int16Array(pcm.length + 32000);
  out.set(pcm, 16000);
  return out;
}

async function bestScore(name: string) {
  ort.env.wasm.numThreads = 1;
  const runner = await createOnnxRunner(ort, {
    mel: readFileSync(model('melspectrogram.onnx')),
    embed: readFileSync(model('embedding_model.onnx')),
    wake: readFileSync(model('hey_jarvis_v0.1.onnx')),
  });
  const det = new WakeDetector(runner);
  const pcm = clip(name);
  let best = 0;
  let fired = false;
  // Feed it the way the mic does: 20 ms frames.
  for (let i = 0; i < pcm.length; i += 320) {
    const r = await det.push(pcm.subarray(i, i + 320));
    best = Math.max(best, r.score);
    fired ||= r.fired;
  }
  return { best, fired, frames: runner.frames };
}

test(
  'wake: "Hey Jarvis" fires, ordinary speech does not',
  { skip: !have && 'wake models not downloaded' },
  async () => {
    const a = await bestScore('wake-hey-jarvis.wav');
    const b = await bestScore('wake-hey-jarvis-2.wav');
    const no = await bestScore('wake-negative.wav');
    console.log(
      `  scores: hey jarvis ${a.best.toFixed(3)} / ${b.best.toFixed(3)}, other speech ${no.best.toFixed(3)} (frames ${a.frames})`,
    );
    assert.ok(a.fired && b.fired, 'the wake phrase should fire');
    assert.ok(!no.fired, 'ordinary speech should not fire');
  },
);

test('wake: picks Nick\'s "echo" model over a stand-in, and names it', async () => {
  const { pickWakeModel, wakeWordName } = await import('./wakeListener.ts');
  const files = [
    'melspectrogram.onnx',
    'embedding_model.onnx',
    'hey_jarvis_v0.1.onnx',
  ];
  assert.equal(pickWakeModel(files), 'hey_jarvis_v0.1.onnx');
  assert.equal(pickWakeModel([...files, 'hey_echo.onnx']), 'hey_echo.onnx');
  assert.equal(pickWakeModel(['melspectrogram.onnx', 'silero_vad.onnx']), null);
  assert.equal(wakeWordName('hey_jarvis_v0.1.onnx'), 'Hey Jarvis');
  assert.equal(wakeWordName('hey_echo.onnx'), 'Hey Echo');
});
