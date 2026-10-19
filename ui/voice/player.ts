// Plays the companion's speech (Phase 1 Task 3). The orchestrator streams
// 24 kHz 16-bit mono PCM per line; chunks are scheduled back to back so a
// line plays without gaps, and the next line starts right after. When a
// line's last chunk has played, the orchestrator is told (that's when a
// scripted beat may move on). Loudness feeds Bloom.
import type { CockpitApi, SpeechMessageView } from '../../orchestrator/types';

const RATE = 24000;

export interface PlayerHooks {
  /** 0..1 loudness of what's playing, ~60×/s while speaking. */
  onLevel(level: number): void;
  /** Speaking started / stopped. */
  onPlaying(playing: boolean): void;
}

export function createSpeechPlayer(api: CockpitApi, hooks: PlayerHooks) {
  let ctx: AudioContext | null = null;
  let gain: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let nextTime = 0;
  let volume = 0.8;
  let raf = 0;
  const sources = new Set<AudioBufferSourceNode>();
  const lastSource = new Map<number, AudioBufferSourceNode>();
  const leftover = new Map<number, Uint8Array>(); // an odd byte between chunks

  const audio = () => {
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: RATE });
      gain = ctx.createGain();
      gain.gain.value = volume;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      gain.connect(analyser).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  const playing = () => sources.size > 0;

  function meter() {
    cancelAnimationFrame(raf);
    const data = new Float32Array(512);
    const loop = () => {
      if (!playing() || !analyser) {
        hooks.onLevel(0);
        return;
      }
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      hooks.onLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function chunk(id: number, bytes: Uint8Array) {
    const c = audio();
    const prev = leftover.get(id);
    let buf = prev ? new Uint8Array([...prev, ...bytes]) : bytes;
    if (buf.length % 2) {
      leftover.set(id, buf.slice(-1));
      buf = buf.slice(0, -1);
    } else leftover.delete(id);
    if (!buf.length) return;
    const samples = new Int16Array(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    );
    const audioBuf = c.createBuffer(1, samples.length, RATE);
    const ch = audioBuf.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 0x8000;
    const src = c.createBufferSource();
    src.buffer = audioBuf;
    src.connect(gain!);
    // A small lead on the first chunk avoids a click; then back to back.
    nextTime = Math.max(nextTime, c.currentTime + 0.04);
    src.start(nextTime);
    nextTime += audioBuf.duration;
    const wasPlaying = playing();
    sources.add(src);
    lastSource.set(id, src);
    src.onended = () => {
      sources.delete(src);
      if (!playing()) hooks.onPlaying(false);
    };
    if (!wasPlaying) {
      hooks.onPlaying(true);
      meter();
    }
  }

  function end(id: number) {
    leftover.delete(id);
    const src = lastSource.get(id);
    lastSource.delete(id);
    if (!src || !sources.has(src)) {
      api.speechPlayed(id);
      return;
    }
    const prev = src.onended;
    src.onended = (ev) => {
      prev?.call(src, ev);
      api.speechPlayed(id);
    };
  }

  function stop() {
    for (const src of sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* not started yet */
      }
    }
    sources.clear();
    lastSource.clear();
    leftover.clear();
    nextTime = 0;
    hooks.onPlaying(false);
    hooks.onLevel(0);
  }

  api.onSpeech((m: SpeechMessageView) => {
    if (m.type === 'chunk') chunk(m.id, m.pcm);
    else if (m.type === 'end') end(m.id);
    else stop();
  });

  return {
    get playing() {
      return playing();
    },
    setVolume(v: number) {
      volume = v;
      if (gain) gain.gain.value = v;
    },
    stop,
  };
}

export type SpeechPlayer = ReturnType<typeof createSpeechPlayer>;
