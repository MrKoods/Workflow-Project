// Score a wake model on test clips through Cockpit's own detector.
//   npm run wake-eval -- <model.onnx> <clips dir>
// Clips: 16 kHz mono WAVs; names starting with "pos" should fire, others not.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-web';
import { WakeDetector } from '../orchestrator/wakeCore.ts';
import { createOnnxRunner } from '../orchestrator/wakeOnnx.ts';

const [modelPath, dir] = process.argv.slice(2);
if (!modelPath || !dir) {
  console.error('Usage: npm run wake-eval -- <model.onnx> <clips dir>');
  process.exit(1);
}
const wakeDir = path.join(import.meta.dirname, '..', 'wake');
ort.env.wasm.numThreads = 1;

function pcmOf(file: string): Int16Array {
  const buf = readFileSync(file);
  const at = buf.indexOf('data');
  const data = buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at + 4));
  const pcm = new Int16Array(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.length),
  );
  const out = new Int16Array(pcm.length + 32000); // 1 s of silence each side
  out.set(pcm, 16000);
  return out;
}

const runner = await createOnnxRunner(ort, {
  mel: readFileSync(path.join(wakeDir, 'melspectrogram.onnx')),
  embed: readFileSync(path.join(wakeDir, 'embedding_model.onnx')),
  wake: readFileSync(modelPath),
});

let ok = 0;
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.wav'))
  .sort();
for (const f of files) {
  const det = new WakeDetector(runner);
  const pcm = pcmOf(path.join(dir, f));
  let best = 0;
  let fired = 0;
  for (let i = 0; i < pcm.length; i += 320) {
    const r = await det.push(pcm.subarray(i, i + 320), i / 16); // ms of audio
    best = Math.max(best, r.score);
    if (r.fired) fired++;
  }
  const want = f.startsWith('pos');
  const pass = want ? fired > 0 : fired === 0;
  if (pass) ok++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${f.padEnd(22)} best ${best.toFixed(3)}  fired ${fired}x  (${want ? 'should fire' : 'should not'})`,
  );
}
console.log(`\n${ok}/${files.length} as expected (threshold 0.5)`);
