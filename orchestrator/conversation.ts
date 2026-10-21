// Open-mic conversation (Nick, 2026-10-21): after the wake word (or one click
// on Talk), every reply is hands-free. You speak, it sends when you pause,
// Echo answers, and once Echo is completely quiet (reply finished AND its
// audio played) the mic reopens for your next turn. The mic is never open
// while Echo speaks, so it can't hear itself.
//
// Ends on: silence in a follow-up turn, a goodbye ("that's all"), Esc / End,
// a speech error, or a reply that never finishes.

/** How long a follow-up turn waits for you to start talking. */
export const FOLLOW_UP_SILENCE_MS = 8000;
/** Echo must be quiet this long before the mic reopens (no clipped tails). */
export const QUIET_MS = 700;
/** Give up on a reply that hasn't finished after this long. */
export const REPLY_TIMEOUT_MS = 3 * 60_000;
const POLL_MS = 100;

const GOODBYES = [
  "that's all",
  'thats all',
  "that's it",
  'thats it',
  'never mind',
  'nevermind',
  'stop listening',
  'bye',
  'goodbye',
  'good bye',
  "i'm done",
  'im done',
  "we're done",
  'thanks that is all',
  "thanks that's all",
  "thank you that's all",
  'nothing',
  'nothing else',
];

/** The whole utterance is a goodbye (a goodbye inside a sentence is not). */
export function isGoodbye(text: string): boolean {
  const t = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return GOODBYES.includes(t);
}

export type ConversationEnd =
  | 'silence'
  | 'goodbye'
  | 'cancel'
  | 'error'
  | 'off'
  | 'timeout';

export interface ConversationOptions {
  /** Echo isn't thinking or speaking and nobody is talking. */
  quiet: () => boolean;
  /** Open the mic for the next turn (hands-free). */
  listen: () => void;
  /** Settings → Keep listening. Off = one turn per wake word, as before. */
  enabled: () => boolean;
  /** Told when the conversation starts or ends (the UI shows it). */
  onChange?: (active: boolean) => void;
  log?: (line: string) => void;
  /** Test seams. */
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}

export function createConversation(o: ConversationOptions) {
  const now = o.now ?? Date.now;
  const every = o.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const stopEvery =
    o.clearInterval ??
    ((id) => clearInterval(id as ReturnType<typeof setInterval>));
  let on = false;
  let poll: unknown = null;

  const stopPoll = () => {
    if (poll !== null) stopEvery(poll);
    poll = null;
  };
  const set = (v: boolean) => {
    if (v === on) return;
    on = v;
    o.onChange?.(v);
  };

  const convo = {
    active: () => on,
    /** The wake word fired (or Talk was clicked): this turn starts a conversation. */
    begin() {
      if (!o.enabled()) return;
      stopPoll();
      set(true);
      o.log?.('[convo] started');
    },
    /** Your words went to Echo: reopen the mic once Echo is done answering. */
    sent() {
      if (!on) return;
      stopPoll();
      const since = now();
      let quietFrom = 0;
      poll = every(() => {
        if (!on) return stopPoll();
        const t = now();
        if (t - since > REPLY_TIMEOUT_MS) return convo.end('timeout');
        if (!o.quiet()) {
          quietFrom = 0;
          return;
        }
        quietFrom ||= t;
        if (t - quietFrom < QUIET_MS) return;
        stopPoll();
        o.log?.('[convo] listening for your reply');
        o.listen();
      }, POLL_MS);
      (poll as { unref?: () => void })?.unref?.();
    },
    end(reason: ConversationEnd) {
      stopPoll();
      if (!on) return;
      set(false);
      o.log?.(`[convo] ended (${reason})`);
    },
  };
  return convo;
}

export type Conversation = ReturnType<typeof createConversation>;
