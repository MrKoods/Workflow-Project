// Push-to-talk speech-to-text (Phase 1 Task 2). The orchestrator owns the
// Deepgram live connection (CLAUDE.md rule 4); the renderer only sends mic
// audio while the talk key is held. Audio leaves the PC only between start()
// and stop()/cancel().
//
// Deepgram live API checked 2026-10-18 (docs/PHASE-1.md): wss /v1/listen,
// header "Authorization: Token <key>", binary linear16 frames, JSON control
// messages Finalize / CloseStream, Results with is_final / from_finalize.

export const TALK_RATE = 16000; // Hz, mono, 16-bit PCM from the renderer
const MAX_TALK_MS = 60_000; // a held key can't stream forever
const FINAL_TIMEOUT_MS = 3000; // after release, wait this long for the last words

export type TalkPhase = 'idle' | 'connecting' | 'listening' | 'finishing';
export interface TalkState {
  phase: TalkPhase;
  /** What has been heard so far (final words + the current guess). */
  partial: string;
  error?: string;
}

/** The parts of the WHATWG WebSocket this module uses (fake in tests). */
export interface TalkSocket {
  readonly readyState: number;
  binaryType: string;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  send(data: string | Uint8Array): void;
  close(): void;
}

export interface TalkOptions {
  apiKey: string | undefined;
  onState: (state: TalkState) => void;
  /** The final transcript of one press (never called with empty text). */
  onFinal: (text: string) => void;
  /** Test seam: open a socket. Defaults to Node's WebSocket with the auth header. */
  connect?: (url: string, apiKey: string) => TalkSocket;
  /** Optional timing log (release -> final transcript). */
  log?: (line: string) => void;
}

export const LISTEN_URL =
  'wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16' +
  `&sample_rate=${TALK_RATE}&channels=1&interim_results=true&smart_format=true&endpointing=300`;

const OPEN = 1;

const defaultConnect = (url: string, apiKey: string): TalkSocket =>
  // Node's WebSocket (undici) accepts headers in the options object.
  new WebSocket(url, {
    headers: { Authorization: `Token ${apiKey}` },
  } as never) as unknown as TalkSocket;

export function createTalk({
  apiKey,
  onState,
  onFinal,
  connect = defaultConnect,
  log,
}: TalkOptions) {
  let state: TalkState = { phase: 'idle', partial: '' };
  let ws: TalkSocket | null = null;
  let pending: Uint8Array[] = [];
  let finals: string[] = [];
  let interim = '';
  let releasedAt = 0;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let finalTimer: ReturnType<typeof setTimeout> | undefined;

  const set = (patch: Partial<TalkState>) => {
    state = { ...state, ...patch };
    onState(state);
  };
  const heard = () => [...finals, interim].filter(Boolean).join(' ').trim();

  function close(socket: TalkSocket | null) {
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try {
      if (socket.readyState === OPEN)
        socket.send(JSON.stringify({ type: 'CloseStream' }));
      socket.close();
    } catch {
      /* already closed */
    }
  }

  function reset(error?: string) {
    clearTimeout(maxTimer);
    clearTimeout(finalTimer);
    close(ws);
    ws = null;
    pending = [];
    finals = [];
    interim = '';
    set({ phase: 'idle', partial: '', error });
  }

  function finish() {
    const text = heard();
    if (releasedAt)
      log?.(
        `[talk] final transcript ${Date.now() - releasedAt} ms after release`,
      );
    reset();
    if (text) onFinal(text);
  }

  const talk = {
    state: () => state,

    /** Talk key pressed: open the connection; audio is buffered until it's up. */
    start() {
      if (state.phase !== 'idle') return;
      if (!apiKey) {
        set({
          phase: 'idle',
          partial: '',
          error:
            'No speech key. Add DEEPGRAM_API_KEY to .env and restart Cockpit.',
        });
        return;
      }
      releasedAt = 0;
      set({ phase: 'connecting', partial: '', error: undefined });
      const socket = connect(LISTEN_URL, apiKey);
      ws = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        if (ws !== socket) return;
        for (const frame of pending) socket.send(frame);
        pending = [];
        if (state.phase === 'connecting') set({ phase: 'listening' });
        // Released before the socket opened: finalize now.
        if (state.phase === 'finishing')
          socket.send(JSON.stringify({ type: 'Finalize' }));
      };
      socket.onmessage = (ev) => {
        if (ws !== socket) return;
        let m: {
          type?: string;
          is_final?: boolean;
          from_finalize?: boolean;
          channel?: { alternatives?: { transcript?: string }[] };
          description?: string;
        };
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.type === 'Results') {
          const text = m.channel?.alternatives?.[0]?.transcript ?? '';
          if (m.is_final) {
            if (text) finals.push(text);
            interim = '';
          } else interim = text;
          set({ partial: heard() });
          if (state.phase === 'finishing' && m.from_finalize) finish();
        } else if (m.type === 'Error') {
          reset(`Speech error: ${m.description ?? 'unknown'}`);
        }
      };
      socket.onerror = () => {
        if (ws === socket) reset('Could not reach the speech service.');
      };
      socket.onclose = () => {
        if (ws !== socket) return;
        // Closed while finishing: keep what we heard.
        if (state.phase === 'finishing') finish();
        else if (state.phase !== 'idle') reset('The speech connection closed.');
      };
      maxTimer = setTimeout(() => talk.stop(), MAX_TALK_MS);
      maxTimer.unref?.(); // never keeps the process alive on its own
    },

    /** One 16 kHz 16-bit mono PCM frame from the mic. */
    audio(frame: Uint8Array) {
      if (state.phase === 'connecting') pending.push(frame);
      else if (state.phase === 'listening' && ws?.readyState === OPEN)
        ws.send(frame);
    },

    /** Talk key released: flush and wait for the last words, then send them. */
    stop() {
      if (state.phase !== 'connecting' && state.phase !== 'listening') return;
      releasedAt = Date.now();
      const wasOpen = state.phase === 'listening';
      set({ phase: 'finishing' });
      if (wasOpen && ws) ws.send(JSON.stringify({ type: 'Finalize' }));
      finalTimer = setTimeout(finish, FINAL_TIMEOUT_MS);
      finalTimer.unref?.();
    },

    /** Esc (or another key with Right Ctrl): drop everything, send nothing. */
    cancel() {
      if (state.phase !== 'idle') reset();
    },
  };
  return talk;
}

export type Talk = ReturnType<typeof createTalk>;
