// The companion speaks (Phase 1 Task 3). Text-to-speech runs here, where the
// key lives; audio streams to the window, which plays it gaplessly and says
// when each line has finished. One queue: lines play in order; push-to-talk
// (or a new quest) stops everything.
//
// Deepgram TTS checked 2026-10-18 (docs/PHASE-1.md): POST /v1/speak?model=…,
// "Authorization: Token <key>", audio streams back as it's generated.

export const SPEECH_RATE = 24000; // Hz, mono, 16-bit PCM to the window
const BYTES_PER_SEC = SPEECH_RATE * 2;
const MAX_CHARS = 1800; // Deepgram's per-request limit is 2,000

/** What the window gets (and plays, in order). */
export type SpeechMessage =
  | { type: 'chunk'; id: number; pcm: Uint8Array }
  | { type: 'end'; id: number }
  | { type: 'stop' };

export interface SpeechOptions {
  apiKey: string | undefined;
  /** Send to the window (IPC). */
  send: (msg: SpeechMessage) => void;
  /** Is speech on right now (Settings.speech)? */
  enabled: () => boolean;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

/** Turn a caption into something a voice should say. */
export function speakable(text: string): string {
  return text
    .replace(/[*_`#>]+/g, '') // markdown marks
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/…/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}

/**
 * Pull complete sentences off the front of streamed text. Returns the
 * sentences and what's left (an unfinished sentence).
 */
export function takeSentences(buffer: string): {
  done: string[];
  rest: string;
} {
  const done: string[] = [];
  // Punctuation followed by a non-space (3.5, e.g.) stays inside the sentence.
  const re = /(?:[^.!?]|[.!?](?=\S))*[.!?]+["')\]]*(?=\s|$)/y;
  let at = 0;
  for (;;) {
    re.lastIndex = at;
    const m = re.exec(buffer);
    // Only when something follows: "3.5" or a sentence still streaming isn't done.
    if (!m || re.lastIndex >= buffer.length) break;
    const s = m[0].trim();
    if (s) done.push(s);
    at = re.lastIndex;
  }
  return { done, rest: buffer.slice(at).trimStart() };
}

interface Line {
  id: number;
  text: string;
  voice: string;
  resolve: () => void;
  bytes: number;
  timer?: ReturnType<typeof setTimeout>;
}

export function createSpeech({
  apiKey,
  send,
  enabled,
  fetchImpl = fetch,
  log,
}: SpeechOptions) {
  let nextId = 1;
  const queue: Line[] = [];
  const playing = new Map<number, Line>(); // sent to the window, not yet finished
  let streaming: { line: Line; abort: AbortController } | null = null;

  const settle = (line: Line) => {
    clearTimeout(line.timer);
    playing.delete(line.id);
    line.resolve();
  };

  async function pump() {
    if (streaming) return;
    const line = queue.shift();
    if (!line) return;
    const abort = new AbortController();
    streaming = { line, abort };
    playing.set(line.id, line);
    const t0 = Date.now();
    try {
      const res = await fetchImpl(
        `https://api.deepgram.com/v1/speak?model=${line.voice}&encoding=linear16&sample_rate=${SPEECH_RATE}&container=none`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ text: line.text }),
          signal: abort.signal,
        },
      );
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      let first = true;
      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        if (first) log?.(`[speech] first audio ${Date.now() - t0} ms`);
        first = false;
        line.bytes += chunk.byteLength;
        send({ type: 'chunk', id: line.id, pcm: chunk });
      }
      send({ type: 'end', id: line.id });
      // If the window never reports back (hidden, reloaded), don't hang the
      // script: give up a little after the audio would have ended.
      line.timer = setTimeout(
        () => playing.has(line.id) && settle(line),
        (line.bytes / BYTES_PER_SEC) * 1000 + 2500,
      );
      line.timer.unref?.();
    } catch (e) {
      if (!abort.signal.aborted) log?.(`[speech] ${(e as Error).message}`);
      settle(line);
    } finally {
      // stopAll() may already have moved on to a newer line.
      if (streaming?.line === line) streaming = null;
      void pump();
    }
  }

  return {
    /** Speak a line in a voice; resolves when it has been heard (or skipped). */
    say(text: string, voice: string, force = false): Promise<void> {
      const clean = speakable(text);
      // force: a Settings preview plays even with speech turned off.
      if (!clean || !apiKey || (!force && !enabled())) return Promise.resolve();
      return new Promise((resolve) => {
        queue.push({ id: nextId++, text: clean, voice, resolve, bytes: 0 });
        void pump();
      });
    },
    /** The window finished playing a line. */
    played(id: number) {
      const line = playing.get(id);
      if (line && streaming?.line !== line) settle(line);
    },
    /** Barge-in / mute: stop talking now, drop what's queued. */
    stopAll() {
      streaming?.abort.abort();
      streaming = null;
      for (const line of [...queue.splice(0), ...playing.values()])
        settle(line);
      send({ type: 'stop' });
    },
    busy: () => !!streaming || playing.size > 0 || queue.length > 0,
  };
}

export type Speech = ReturnType<typeof createSpeech>;
