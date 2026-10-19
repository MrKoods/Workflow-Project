import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTalk,
  LISTEN_URL,
  type TalkSocket,
  type TalkState,
} from './talk.ts';

class FakeSocket implements TalkSocket {
  readyState = 0;
  binaryType = 'blob';
  sent: (string | Uint8Array)[] = [];
  closed = false;
  onopen: TalkSocket['onopen'] = null;
  onmessage: TalkSocket['onmessage'] = null;
  onerror: TalkSocket['onerror'] = null;
  onclose: TalkSocket['onclose'] = null;
  send(data: string | Uint8Array) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  result(transcript: string, extra: Record<string, unknown> = {}) {
    this.onmessage?.({
      data: JSON.stringify({
        type: 'Results',
        channel: { alternatives: [{ transcript }] },
        ...extra,
      }),
    });
  }
  controls() {
    return this.sent.filter((s): s is string => typeof s === 'string');
  }
}

function setup(apiKey: string | undefined = 'k') {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const states: TalkState[] = [];
  const finals: string[] = [];
  const talk = createTalk({
    apiKey,
    onState: (s) => states.push(s),
    onFinal: (t) => finals.push(t),
    connect: (url, key) => {
      urls.push(`${url}|${key}`);
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });
  return { talk, sockets, urls, states, finals };
}

const frame = (n: number) => new Uint8Array([n, n]);

test('talk: buffers audio until the socket opens, then streams it', () => {
  const { talk, sockets, urls } = setup();
  talk.start();
  assert.equal(talk.state().phase, 'connecting');
  assert.deepEqual(urls, [`${LISTEN_URL}|k`]);
  talk.audio(frame(1));
  talk.audio(frame(2));
  assert.equal(sockets[0].sent.length, 0);
  sockets[0].open();
  assert.equal(talk.state().phase, 'listening');
  talk.audio(frame(3));
  assert.deepEqual(sockets[0].sent, [frame(1), frame(2), frame(3)]);
  talk.cancel();
});

test('talk: release finalizes; the final words become one reply', () => {
  const { talk, sockets, states, finals } = setup();
  talk.start();
  const s = sockets[0];
  s.open();
  s.result('okay the', { is_final: false });
  assert.equal(talk.state().partial, 'okay the');
  s.result('Okay, the account is made.', { is_final: true });
  talk.stop();
  assert.equal(talk.state().phase, 'finishing');
  assert.deepEqual(s.controls(), ['{"type":"Finalize"}']);
  s.result("What's next?", { is_final: true, from_finalize: true });
  assert.deepEqual(finals, ["Okay, the account is made. What's next?"]);
  assert.equal(talk.state().phase, 'idle');
  assert.ok(s.closed);
  assert.ok(s.controls().includes('{"type":"CloseStream"}'));
  assert.ok(states.some((x) => x.partial === 'Okay, the account is made.'));
});

test('talk: released before the socket opened still finalizes', () => {
  const { talk, sockets, finals } = setup();
  talk.start();
  talk.audio(frame(1));
  talk.stop();
  sockets[0].open();
  assert.deepEqual(sockets[0].sent[0], frame(1));
  assert.deepEqual(sockets[0].controls(), ['{"type":"Finalize"}']);
  sockets[0].result('yeah', { is_final: true, from_finalize: true });
  assert.deepEqual(finals, ['yeah']);
});

test('talk: cancel sends nothing on; silence sends nothing', () => {
  const { talk, sockets, finals } = setup();
  talk.start();
  sockets[0].open();
  sockets[0].result('never mind', { is_final: true });
  talk.cancel();
  assert.equal(talk.state().phase, 'idle');
  assert.ok(sockets[0].closed);
  assert.deepEqual(finals, []);

  talk.start(); // a second press opens a fresh socket
  sockets[1].open();
  talk.stop();
  sockets[1].result('', { is_final: true, from_finalize: true });
  assert.deepEqual(finals, []); // nothing heard, nothing sent
});

test('talk: no key or a dropped connection reports an error and goes idle', () => {
  const none = setup('');
  none.talk.start();
  assert.equal(none.talk.state().phase, 'idle');
  assert.match(none.talk.state().error ?? '', /DEEPGRAM_API_KEY/);
  assert.equal(none.sockets.length, 0);

  const { talk, sockets } = setup();
  talk.start();
  sockets[0].onerror?.({});
  assert.equal(talk.state().phase, 'idle');
  assert.match(talk.state().error ?? '', /speech service/);
});

test('talk (wake word): sends after a pause, cancels if nothing is said', async () => {
  const { talk, sockets, finals } = setup();
  talk.start({ auto: true });
  assert.equal(talk.state().auto, true);
  sockets[0].open();
  sockets[0].result('hey can you', { is_final: false });
  sockets[0].result('Hey, can you open the bio?', {
    is_final: true,
    speech_final: true,
  });
  assert.equal(talk.state().phase, 'finishing'); // stopped by itself
  assert.deepEqual(sockets[0].controls(), ['{"type":"Finalize"}']);
  sockets[0].result('', { is_final: true, from_finalize: true });
  assert.deepEqual(finals, ['Hey, can you open the bio?']);
  assert.equal(talk.state().auto, false);

  // A pause before any words doesn't end it; key presses never end on pauses.
  talk.start();
  sockets[1].open();
  sockets[1].result('', { is_final: true, speech_final: true });
  sockets[1].result('still talking', { is_final: true, speech_final: true });
  assert.equal(talk.state().phase, 'listening');
  talk.cancel();
});
