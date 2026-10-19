import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSpeech,
  speakable,
  takeSentences,
  type SpeechMessage,
} from './speech.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A fetch that streams the given chunks (or fails / hangs). */
function fakeFetch(behavior: 'ok' | 'fail' | 'hang' = 'ok') {
  const calls: { url: string; body: string; auth: string }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: String(init.body),
      auth: (init.headers as Record<string, string>).Authorization,
    });
    if (behavior === 'fail') return new Response('nope', { status: 500 });
    if (behavior === 'hang')
      return new Promise((_, reject) =>
        init.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      );
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(4800)); // 0.1 s at 24 kHz
        c.enqueue(new Uint8Array(4800));
        c.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function setup(behavior: 'ok' | 'fail' | 'hang' = 'ok', enabled = true) {
  const sent: SpeechMessage[] = [];
  const f = fakeFetch(behavior);
  const speech = createSpeech({
    apiKey: 'k',
    send: (m) => sent.push(m),
    enabled: () => enabled,
    fetchImpl: f.impl,
  });
  return { speech, sent, calls: f.calls };
}

test('speakable: strips markdown and links, keeps words', () => {
  assert.equal(
    speakable('**Open** the page: https://fiverr.com/join … then `done`'),
    'Open the page: the link . then done',
  );
});

test('takeSentences: whole sentences only, numbers stay intact', () => {
  assert.deepEqual(takeSentences('Hello there. How are'), {
    done: ['Hello there.'],
    rest: 'How are',
  });
  assert.deepEqual(takeSentences('It has 3.5 stars. Next one! And'), {
    done: ['It has 3.5 stars.', 'Next one!'],
    rest: 'And',
  });
  // The last sentence waits for more text (could still be "3.5").
  assert.deepEqual(takeSentences('All good.'), { done: [], rest: 'All good.' });
});

test('speech: streams a line to the window; resolves when it was played', async () => {
  const { speech, sent, calls } = setup();
  let heard = false;
  const p = speech
    .say('That is one down.', 'aura-2-thalia-en')
    .then(() => (heard = true));
  for (let i = 0; i < 20 && !sent.some((m) => m.type === 'end'); i++)
    await tick();
  assert.match(
    calls[0].url,
    /model=aura-2-thalia-en&encoding=linear16&sample_rate=24000/,
  );
  assert.equal(calls[0].auth, 'Token k');
  assert.deepEqual(JSON.parse(calls[0].body), { text: 'That is one down.' });
  assert.deepEqual(
    sent.map((m) => m.type),
    ['chunk', 'chunk', 'end'],
  );
  assert.equal(heard, false); // streamed, not yet heard
  speech.played(1);
  await p;
  assert.equal(heard, true);
});

test('speech: lines play in order; stopAll drops the rest and tells the window', async () => {
  const { speech, sent, calls } = setup();
  const done: string[] = [];
  void speech.say('One.', 'v-a').then(() => done.push('one'));
  void speech.say('Two.', 'v-a').then(() => done.push('two'));
  for (let i = 0; i < 20 && calls.length < 2; i++) await tick();
  assert.equal(calls.length, 2); // second fetch starts after the first streamed
  speech.stopAll();
  await tick();
  assert.deepEqual(done, ['one', 'two']); // nobody waits forever
  assert.equal(sent.at(-1)?.type, 'stop');
  assert.equal(speech.busy(), false);
});

test('speech: muted, failing or stopped mid-request never blocks the script', async () => {
  const muted = setup('ok', false);
  await muted.speech.say('Hi.', 'v');
  assert.equal(muted.calls.length, 0);

  const failing = setup('fail');
  await failing.speech.say('Hi.', 'v'); // resolves despite HTTP 500

  const hanging = setup('hang');
  const p = hanging.speech.say('Hi.', 'v');
  await tick();
  hanging.speech.stopAll();
  await p;
  assert.equal(hanging.speech.busy(), false);
});
