// Phase 1 Task 1: measure the voice loop per speech provider.
//   npm run voice-latency                 -> every provider with a key in .env
//   npm run voice-latency -- --wav me.wav --runs 5
// Times, per run: (a) end of speech -> final transcript (STT, audio streamed
// at real-time pace), (b) Claude's first sentence (companion model, at the
// companion's effort and at low), (c) text -> first audio byte (TTS).
// Writes sample sentences to journal/local/voice-samples/ to listen to.
// Endpoints checked against the providers' docs on 2026-10-18 (PHASE-1.md).
import Anthropic from '@anthropic-ai/sdk';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MODEL } from '../orchestrator/companion.ts';

const RATE = 16000; // Hz, mono, 16-bit little-endian PCM everywhere
const CHUNK_MS = 20;
const PHRASE = "Okay, the account is made. What's next?";
const SAMPLES = {
  playful:
    "That's one down. Next, we make you look like the obvious hire. Want to see your bio?",
  steady:
    'Open the sign-up page and create your seller account with your work email.',
};

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const RUNS = Math.max(1, Number(arg('runs') ?? 5));
const now = () => performance.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- audio helpers ----------------------------------------------------------
function wav(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
/** The PCM data of a 16 kHz mono 16-bit WAV (or raw PCM if no RIFF header). */
function pcmOf(buf: Buffer): Buffer {
  if (buf.subarray(0, 4).toString() !== 'RIFF') return buf;
  if (buf.readUInt32LE(24) !== RATE || buf.readUInt16LE(22) !== 1)
    throw new Error(`WAV must be ${RATE} Hz mono 16-bit`);
  let at = 12;
  while (at + 8 <= buf.length) {
    const id = buf.subarray(at, at + 4).toString();
    const size = buf.readUInt32LE(at + 4);
    if (id === 'data') return buf.subarray(at + 8, at + 8 + size);
    at += 8 + size;
  }
  throw new Error('WAV has no data chunk');
}
/** Stream PCM at real-time pace; resolves at the moment the last chunk is sent. */
async function pace(pcm: Buffer, send: (chunk: Buffer, last: boolean) => void) {
  const bytes = (RATE * 2 * CHUNK_MS) / 1000;
  const start = now();
  for (let i = 0, n = 0; i < pcm.length; i += bytes, n++) {
    const wait = start + n * CHUNK_MS - now();
    if (wait > 0) await sleep(wait);
    send(pcm.subarray(i, i + bytes), i + bytes >= pcm.length);
  }
  return now();
}

// ---- providers --------------------------------------------------------------
interface Provider {
  name: string;
  tts(text: string): Promise<{ firstByteMs: number; pcm: Buffer }>;
  stt(pcm: Buffer): Promise<{ finalMs: number; text: string }>;
}

function elevenLabs(key: string): Provider {
  const base = 'https://api.elevenlabs.io/v1';
  let voice = process.env.ELEVENLABS_VOICE_ID;
  const voiceId = async () => {
    if (voice) return voice;
    const res = await fetch(`${base}/voices`, {
      headers: { 'xi-api-key': key },
    });
    if (!res.ok) throw new Error(`ElevenLabs voices: HTTP ${res.status}`);
    const { voices } = (await res.json()) as {
      voices: { voice_id: string; name: string }[];
    };
    if (!voices?.length)
      throw new Error('ElevenLabs: no voices on this account');
    console.log(
      `  (ElevenLabs voice: ${voices[0].name}; set ELEVENLABS_VOICE_ID to choose)`,
    );
    return (voice = voices[0].voice_id);
  };
  return {
    name: 'ElevenLabs',
    async tts(text) {
      const id = await voiceId();
      const t0 = now();
      const res = await fetch(
        `${base}/text-to-speech/${id}/stream?output_format=pcm_16000`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'content-type': 'application/json' },
          body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
        },
      );
      if (!res.ok || !res.body)
        throw new Error(
          `ElevenLabs TTS: HTTP ${res.status} ${await res.text()}`,
        );
      return readAudio(res.body, t0);
    },
    stt(pcm) {
      const url =
        'wss://api.elevenlabs.io/v1/speech-to-text/realtime' +
        `?model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=manual`;
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, {
          headers: { 'xi-api-key': key },
        } as never);
        let ended = 0;
        const fail = (e: unknown) => (ws.close(), reject(e));
        const timer = setTimeout(
          () => fail(new Error('ElevenLabs STT: timed out')),
          30000,
        );
        ws.onerror = () => fail(new Error('ElevenLabs STT: socket error'));
        ws.onmessage = async (ev) => {
          const m = JSON.parse(String(ev.data));
          if (m.message_type === 'session_started') {
            ended = await pace(pcm, (chunk, last) =>
              ws.send(
                JSON.stringify({
                  message_type: 'input_audio_chunk',
                  audio_base_64: chunk.toString('base64'),
                  commit: last,
                  sample_rate: RATE,
                }),
              ),
            );
          } else if (m.message_type === 'committed_transcript' && ended) {
            clearTimeout(timer);
            ws.close();
            resolve({ finalMs: now() - ended, text: m.text });
          } else if (m.error)
            fail(new Error(`ElevenLabs STT: ${m.message_type}: ${m.error}`));
        };
      });
    },
  };
}

function deepgram(key: string): Provider {
  const auth = { Authorization: `Token ${key}` };
  return {
    name: 'Deepgram',
    async tts(text) {
      const model = process.env.DEEPGRAM_VOICE ?? 'aura-2-thalia-en';
      const t0 = now();
      const res = await fetch(
        `https://api.deepgram.com/v1/speak?model=${model}&encoding=linear16&sample_rate=${RATE}&container=none`,
        {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      if (!res.ok || !res.body)
        throw new Error(`Deepgram TTS: HTTP ${res.status} ${await res.text()}`);
      return readAudio(res.body, t0);
    },
    stt(pcm) {
      const url =
        'wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16' +
        `&sample_rate=${RATE}&channels=1&interim_results=true&smart_format=true&endpointing=300`;
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, { headers: auth } as never);
        ws.binaryType = 'arraybuffer';
        let ended = 0;
        const parts: string[] = [];
        const fail = (e: unknown) => (ws.close(), reject(e));
        const timer = setTimeout(
          () => fail(new Error('Deepgram STT: timed out')),
          30000,
        );
        ws.onerror = () => fail(new Error('Deepgram STT: socket error'));
        ws.onopen = async () => {
          ended = await pace(pcm, (chunk) => ws.send(new Uint8Array(chunk)));
          ws.send(JSON.stringify({ type: 'Finalize' }));
        };
        ws.onmessage = (ev) => {
          const m = JSON.parse(String(ev.data));
          if (m.type === 'Results' && m.is_final) {
            const t = m.channel?.alternatives?.[0]?.transcript ?? '';
            if (t) parts.push(t);
            if (ended && (m.from_finalize || m.speech_final)) {
              clearTimeout(timer);
              ws.send(JSON.stringify({ type: 'CloseStream' }));
              ws.close();
              resolve({ finalMs: now() - ended, text: parts.join(' ') });
            }
          } else if (m.type === 'Error')
            fail(new Error(`Deepgram STT: ${m.description}`));
        };
      });
    },
  };
}

async function readAudio(body: ReadableStream<Uint8Array>, t0: number) {
  let firstByteMs = -1;
  const chunks: Buffer[] = [];
  for await (const c of body) {
    if (firstByteMs < 0) firstByteMs = now() - t0;
    chunks.push(Buffer.from(c));
  }
  return { firstByteMs, pcm: pcmOf(Buffer.concat(chunks)) };
}

// ---- Claude: time to the first full sentence ------------------------------
async function claudeFirstSentence(
  client: Anthropic,
  text: string,
  effort: 'low' | 'medium',
) {
  const t0 = now();
  let firstText = -1;
  let out = '';
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort },
    system:
      'You are a voice companion helping Nick set up his Fiverr seller profile. Reply in one or two short spoken sentences.',
    messages: [{ role: 'user', content: text }],
  } as Anthropic.MessageStreamParams);
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
      if (firstText < 0) firstText = now() - t0;
      out += ev.delta.text;
      if (/[.!?](\s|$)/.test(out)) {
        stream.abort();
        return { firstTextMs: firstText, sentenceMs: now() - t0 };
      }
    }
  }
  return { firstTextMs: firstText, sentenceMs: now() - t0 };
}

// ---- report -----------------------------------------------------------------
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ms = (xs: number[]) =>
  xs.length
    ? `${Math.round(median(xs))} ms median, ${Math.round(Math.max(...xs))} worst`
    : '-';

async function main() {
  const providers: Provider[] = [];
  if (process.env.ELEVENLABS_API_KEY)
    providers.push(elevenLabs(process.env.ELEVENLABS_API_KEY));
  if (process.env.DEEPGRAM_API_KEY)
    providers.push(deepgram(process.env.DEEPGRAM_API_KEY));
  // --claude-only: just the Claude leg (needs no speech keys).
  const claudeOnly = process.argv.includes('--claude-only');
  if (claudeOnly) providers.length = 0;
  else if (!providers.length) {
    console.error(
      'No speech provider keys found. Add ELEVENLABS_API_KEY and/or DEEPGRAM_API_KEY to .env (see .env.example), or run with --claude-only.',
    );
    process.exit(1);
  }
  const samples = path.join(
    import.meta.dirname,
    '..',
    'journal',
    'local',
    'voice-samples',
  );
  await mkdir(samples, { recursive: true });

  // Input speech: Nick's recording, or the phrase spoken by a provider.
  const wavArg = arg('wav');
  const input = wavArg
    ? pcmOf(await readFile(wavArg))
    : providers.length
      ? (await providers[providers.length - 1].tts(PHRASE)).pcm
      : Buffer.alloc(0);
  if (providers.length)
    console.log(
      `Input: ${wavArg ?? `"${PHRASE}" (synthesized)`}, ${(input.length / 2 / RATE).toFixed(1)} s, ${RUNS} runs\n`,
    );

  const totals: string[] = [];
  let claudeMs = Infinity;
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic();
    for (const effort of ['medium', 'low'] as const) {
      const first: number[] = [];
      const sentence: number[] = [];
      for (let i = 0; i < Math.min(RUNS, 3); i++) {
        const r = await claudeFirstSentence(client, PHRASE, effort);
        first.push(r.firstTextMs);
        sentence.push(r.sentenceMs);
      }
      console.log(
        `Claude (${MODEL}, effort ${effort}): first text ${ms(first)}; first sentence ${ms(sentence)}`,
      );
      claudeMs = Math.min(claudeMs, median(sentence));
    }
    console.log();
  }

  for (const p of providers) {
    const stt: number[] = [];
    const tts: number[] = [];
    let heard = '';
    for (let i = 0; i < RUNS; i++) {
      try {
        const s = await p.stt(input);
        stt.push(s.finalMs);
        heard = s.text;
      } catch (e) {
        console.log(`  ${p.name} STT run ${i + 1}: ${(e as Error).message}`);
      }
      try {
        tts.push((await p.tts(SAMPLES.steady)).firstByteMs);
      } catch (e) {
        console.log(`  ${p.name} TTS run ${i + 1}: ${(e as Error).message}`);
      }
    }
    for (const [kind, line] of Object.entries(SAMPLES)) {
      try {
        const { pcm } = await p.tts(line);
        await writeFile(
          path.join(samples, `${p.name.toLowerCase()}-${kind}.wav`),
          wav(pcm),
        );
      } catch {
        /* reported above */
      }
    }
    console.log(`${p.name}`);
    console.log(`  heard:              "${heard}"`);
    console.log(`  STT end of speech -> final: ${ms(stt)}`);
    console.log(`  TTS text -> first audio:    ${ms(tts)}`);
    if (stt.length && tts.length && Number.isFinite(claudeMs)) {
      const total = median(stt) + claudeMs + median(tts);
      totals.push(`  ${p.name}: ~${Math.round(total)} ms`);
    }
  }
  if (totals.length)
    console.log(
      `\nEstimated release-key -> first word (STT + Claude first sentence at best effort + TTS, medians; add ~50 ms playback buffer):\n${totals.join('\n')}`,
    );
  console.log(`\nListen: ${samples}`);
}

await main();
