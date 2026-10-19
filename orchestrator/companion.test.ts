import assert from 'node:assert/strict';
import { test } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_SETTINGS } from './settings.ts';
import {
  CompanionError,
  createCompanion,
  describeState,
  MODEL,
  SYSTEM_PROMPT,
} from './companion.ts';
import type {
  ChatEvent,
  CockpitSnapshot,
  CompanionHost,
  Quest,
} from './types.ts';

type Scripted =
  | { text?: string; tools?: { name: string; input: unknown }[]; stop?: string }
  | Error;

/** A stand-in for client.beta.messages.stream that replays scripted turns. */
function fakeClient(script: Scripted[]) {
  const calls: any[] = [];
  let n = 0;
  const client = {
    beta: {
      messages: {
        stream(params: any) {
          calls.push(structuredClone(params));
          const turn = script[n++];
          let onText: ((t: string) => void) | undefined;
          return {
            on(event: string, cb: (t: string) => void) {
              if (event === 'text') onText = cb;
              return this;
            },
            async finalMessage() {
              if (!turn) throw new Error('script ran out');
              if (turn instanceof Error) throw turn;
              if (turn.text) onText?.(turn.text);
              const content: any[] = [
                { type: 'thinking', thinking: '', signature: `sig-${n}` },
              ];
              if (turn.text) content.push({ type: 'text', text: turn.text });
              for (const [i, t] of (turn.tools ?? []).entries()) {
                content.push({
                  type: 'tool_use',
                  id: `tu-${n}-${i}`,
                  name: t.name,
                  input: t.input,
                });
              }
              return {
                content,
                stop_reason:
                  turn.stop ?? (turn.tools ? 'tool_use' : 'end_turn'),
              };
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}

function fakeHost() {
  const quest: Quest = {
    id: 'q',
    title: 'Launch the gig',
    doneWhen: 'Gig is live',
    status: 'active',
    bundle: {
      folders: ['~/Documents/Fiverr'],
      urls: ['https://www.fiverr.com'],
      apps: [],
    },
    format: 1,
    items: {},
    intro: [],
    steps: [],
    objectives: [
      { title: 'Research what sells', done: false },
      { title: 'Write gig copy', done: false },
    ],
  };
  const log: string[] = [];
  const host: CompanionHost = {
    snapshot: (): CockpitSnapshot => ({
      current: quest,
      queue: [],
      draft: null,
      firstQuest: null,
      setupTimer: null,
      settings: DEFAULT_SETTINGS,
      notice: null,
    }),
    async completeObjective() {
      const i = quest.objectives.findIndex((o) => !o.done);
      quest.objectives[i].done = true;
      log.push(`complete:${quest.objectives[i].title}`);
      return { objective: quest.objectives[i].title, questComplete: false };
    },
    async addJournalNote(text) {
      log.push(`note:${text}`);
    },
    async openBundleItem(item) {
      log.push(`open:${item}`);
      return 'Opened your quest item.';
    },
    async recentJournal() {
      return [];
    },
    setDraft(d) {
      log.push(`draft:${d.title}:${d.objectives.length}`);
    },
    async updateQuest(id, changes) {
      log.push(`update:${id}:${JSON.stringify(changes)}`);
      return 'Updated.';
    },
    async saveTemplate(id, schedule) {
      log.push(`template:${id}:${schedule}`);
      return 'Saved.';
    },
    async switchQuest(id) {
      log.push(`switch:${id}`);
      return 'Switched.';
    },
    folderInDocuments: (f) =>
      f.startsWith('..') ? null : `C:/Users/nick/Documents/${f}`,
    async recordSession(summary, id) {
      log.push('session:' + summary + ':' + (id ?? '-'));
      return 'Saved the summary.';
    },
    async createFolder(f) {
      log.push(`mkdir:${f}`);
      return 'Created.';
    },
    async changeSettings(input) {
      log.push(`settings:${JSON.stringify(input)}`);
      return 'Changed.';
    },
    async setSteps(which, done, id) {
      log.push(`steps:${JSON.stringify(which)}:${done}:${id ?? ''}`);
      return 'Steps set.';
    },
    async goBackToStep(step) {
      log.push(`back:${step}`);
      return 'Back.';
    },
    viewStep(target) {
      log.push(`view:${target}`);
      return 'Showing.';
    },
    async pauseActive(note) {
      log.push(`pause:${note}`);
      return 'Paused.';
    },
    async startNext() {
      log.push('next');
      return 'Started.';
    },
    async archiveQuest(id) {
      log.push(`archive:${id}`);
      return 'Archived.';
    },
    async cockpitUi(action, tab) {
      log.push(`ui:${action}:${tab ?? ''}`);
      return 'Done.';
    },
    async listWindows() {
      return [
        { id: '42', app: 'chrome', title: 'YouTube', state: 'normal' as const },
      ];
    },
    async windowAction(id, action) {
      log.push(`window:${id}:${action}`);
      return 'Ok.';
    },
    async openApp(name) {
      log.push(`app:${name}`);
      return 'Opened.';
    },
    async openLink(url) {
      log.push(`link:${url}`);
      return 'Opened.';
    },
    async openFolder(p) {
      log.push(`folder:${p}`);
      return 'Opened.';
    },
  };
  return { host, log, quest };
}

function setup(script: Scripted[], clientFactory?: () => Anthropic) {
  const { client, calls } = fakeClient(script);
  const { host, log } = fakeHost();
  const events: ChatEvent[] = [];
  const companion = createCompanion({
    host,
    client: clientFactory ?? (() => client),
    emit: (e) => {
      events.push(e);
      // Auto-answer confirmations per test via `answers`.
      if (e.type === 'confirm')
        queueMicrotask(() => companion.answer(e.id, answers.shift() ?? false));
    },
  });
  const answers: boolean[] = [];
  return { companion, calls, events, log, answers };
}

const kinds = (events: ChatEvent[]) =>
  events.map((e) => (e.type === 'state' ? `state:${e.ai}` : e.type));

test('plain reply: streams text, drives orb states, sends the documented request shape', async () => {
  const { companion, calls, events } = setup([
    { text: 'Morning. Start with the top 10 gigs.' },
  ]);
  await companion.send('  hi  ');

  assert.deepEqual(kinds(events), [
    'user',
    'state:thinking',
    'state:speaking',
    'delta',
    'done',
    'state:waiting',
  ]);
  const p = calls[0];
  assert.equal(p.model, MODEL);
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, [
    'server-side-fallback-2026-07-01',
    'mid-conversation-output-config-2026-07-01',
  ]);
  assert.deepEqual(p.cache_control, { type: 'ephemeral' });
  assert.deepEqual(p.output_config, { effort: 'medium' });
  assert.equal(
    p.thinking,
    undefined,
    'Opus 5.5: thinking is always on; no param',
  );
  assert.equal(p.system[0].text, SYSTEM_PROMPT);
  assert.deepEqual(
    p.tools.map((t: any) => t.name),
    [
      'get_current_quest',
      'complete_objective',
      'add_journal_entry',
      'open_bundle_item',
      'draft_quest',
      'update_quest',
      'save_as_template',
      'set_active_quest',
      'create_folder',
      'change_settings',
      'set_steps',
      'go_back_to_step',
      'view_step',
      'quest_control',
      'cockpit_ui',
      'list_windows',
      'window_control',
      'open_app',
      'open_link',
      'open_folder',
      'end_session',
    ],
  );
  assert.deepEqual(
    p.messages.map((m: any) => m.role),
    ['user', 'system'],
  );
  assert.equal(p.messages[0].content, 'hi');
  assert.match(p.messages[1].content, /Active quest: "Launch the gig"/);
  assert.match(
    p.messages[1].content,
    /\[ \] 1\. Research what sells {2}<- current/,
  );
  assert.deepEqual(
    companion.history().map((m) => m.role),
    ['user', 'system', 'assistant'],
  );
});

test('complete_objective completes right away (no confirmation) and reports back', async () => {
  const { companion, calls, events, log, answers } = setup([
    {
      text: 'Nice.',
      tools: [
        {
          name: 'complete_objective',
          input: { objective: 'research what sells' },
        },
      ],
    },
    { text: 'Done. Gig copy next.' },
  ]);
  void answers;
  await companion.send('research is done');

  assert.deepEqual(log, ['complete:Research what sells']);
  assert.ok(!kinds(events).includes('confirm'));
  assert.ok(events.some((e) => e.type === 'objective-completed'));
  const toolResult = calls[1].messages.at(-1).content[0];
  assert.equal(toolResult.type, 'tool_result');
  assert.equal(toolResult.content, 'Completed "Research what sells".');
  // Assistant turn passed back unchanged, thinking block included.
  assert.equal(calls[1].messages[2].content[0].signature, 'sig-1');
});

test('a wrong objective is refused without asking', async () => {
  const wrong = setup([
    {
      tools: [
        { name: 'complete_objective', input: { objective: 'Write gig copy' } },
      ],
    },
    { text: 'Right, research first.' },
  ]);
  await wrong.companion.send('copy is done');
  assert.ok(!kinds(wrong.events).includes('confirm'));
  const result = wrong.calls[1].messages.at(-1).content[0];
  assert.equal(result.is_error, true);
  assert.match(result.content, /current objective is "Research what sells"/);
});

test('invalid tool input is returned as an error result, not run', async () => {
  const { companion, calls, log } = setup([
    {
      tools: [
        { name: 'add_journal_entry', input: { text: '' } },
        { name: 'open_bundle_item', input: { item: 42 } },
      ],
    },
    { text: 'Let me try that again later.' },
  ]);
  await companion.send('note that');
  assert.deepEqual(log, []);
  const results = calls[1].messages.at(-1).content;
  assert.equal(results.length, 2, 'all results in one user message');
  assert.ok(results.every((r: any) => r.is_error));
});

test('API errors and refusals roll the turn back so history stays valid', async () => {
  const failing = setup([
    new Anthropic.APIConnectionError({ message: 'offline' }),
  ]);
  await failing.companion.send('hello?');
  assert.deepEqual(failing.companion.history(), []);
  assert.equal(
    (failing.events.find((e) => e.type === 'error') as any).text,
    "Can't reach Claude. Check your internet connection.",
  );

  const refused = setup([{ text: 'partial', stop: 'refusal' }]);
  await refused.companion.send('something');
  assert.deepEqual(refused.companion.history(), []);
  assert.ok(refused.events.some((e) => e.type === 'error'));
});

test('follow-up turns resend history unchanged (append-only)', async () => {
  const { companion, calls } = setup([{ text: 'First.' }, { text: 'Second.' }]);
  await companion.send('one');
  await companion.send('two');
  assert.deepEqual(calls[1].messages.slice(0, 3), [
    calls[0].messages[0],
    calls[0].messages[1],
    { role: 'assistant', content: companion.history()[2].content },
  ]);
  assert.deepEqual(
    calls[1].messages.slice(3).map((m: any) => m.role),
    ['user', 'system'],
  );
});

test('a missing key is reported in the chat, nothing is sent', async () => {
  const { companion, calls, events } = setup([], () => {
    throw new CompanionError('No API key.');
  });
  await companion.send('hi');
  assert.equal(calls.length, 0);
  assert.equal(
    (events.find((e) => e.type === 'error') as any).text,
    'No API key.',
  );
  assert.deepEqual(companion.history(), []);
});

test('describeState covers no-quest and journal cases', () => {
  const text = describeState(
    {
      snapshot: () => ({
        current: null,
        queue: [{ id: 'p', title: 'Prep', status: 'queued' }],
        draft: null,
        firstQuest: null,
        setupTimer: null,
        settings: DEFAULT_SETTINGS,
        notice: null,
      }),
    },
    [{ kind: 'note', text: 'Chose gym niche', at: '2026-10-18T09:05:00.000Z' }],
  );
  assert.match(text, /No quest is active\./);
  assert.match(text, /Quest log: "Prep" \(id p, queued\)\./);
  assert.match(text, /note: Chose gym niche/);
});

test('draft_quest validates and shows the card without writing anything', async () => {
  const good = {
    title: 'Launch my AI automation gig on Fiverr',
    doneWhen: 'Gig is live',
    objectives: ['Research', 'Packages', 'Copy'],
    folders: ['~/Documents/Fiverr'],
    urls: ['https://www.fiverr.com'],
  };
  const { companion, calls, log } = setup([
    { tools: [{ name: 'draft_quest', input: { ...good, objectives: [] } }] },
    { tools: [{ name: 'draft_quest', input: good }] },
    { text: 'Card is up.' },
  ]);
  await companion.send('new quest: fiverr gig');
  const bad = calls[1].messages.at(-1).content[0];
  assert.equal(bad.is_error, true);
  assert.match(bad.content, /1-7 objectives/);
  assert.deepEqual(log, ['draft:Launch my AI automation gig on Fiverr:3']);
  assert.match(
    calls[2].messages.at(-1).content[0].content,
    /Nothing is written until he accepts/,
  );
});

test('update_quest and create_folder run directly; outside-Documents folders are refused', async () => {
  const { companion, log, answers, calls } = setup([
    {
      tools: [
        { name: 'update_quest', input: { id: 'q', objectives: ['A', 'B'] } },
        { name: 'create_folder', input: { path: '../Windows' } },
        { name: 'create_folder', input: { path: 'Fiverr/portfolio' } },
      ],
    },
    { text: 'Done.' },
  ]);
  void answers;
  await companion.send('rename objectives and make folders');
  assert.deepEqual(log, [
    'update:q:{"objectives":["A","B"]}',
    'mkdir:Fiverr/portfolio',
  ]);
  const [upd, outside, made] = calls[1].messages.at(-1).content;
  assert.equal(upd.content, 'Updated.');
  assert.equal(outside.is_error, true);
  assert.equal(made.content, 'Created.');
});

test('set_active_quest switches via the orchestrator', async () => {
  const { companion, log } = setup([
    { tools: [{ name: 'set_active_quest', input: { id: 'pre-market-prep' } }] },
    { text: 'Switched.' },
  ]);
  await companion.send('start pre-market prep now');
  assert.deepEqual(log, ['switch:pre-market-prep']);
});

test('end_session logs the debrief and sets the first quest', async () => {
  const { companion, log, calls } = setup([
    {
      text: 'Good session.',
      tools: [
        {
          name: 'end_session',
          input: { summary: 'Research done.', firstQuestId: 'q' },
        },
      ],
    },
    { tools: [{ name: 'end_session', input: { summary: '' } }] },
    { text: 'Done.' },
  ]);
  await companion.send("I'm ending the session.");
  assert.deepEqual(log, ['session:Research done.:q']);
  assert.equal(calls[2].messages.at(-1).content[0].is_error, true);
});

test('spoken turns: per-message effort, append-only, back to the default after', async () => {
  const { companion, calls } = setup([
    { text: 'Short answer.' },
    { text: 'Longer answer.' },
    { text: 'Again.' },
  ]);
  const effortMsgs = (i: number) =>
    (
      calls[i].messages as {
        role: string;
        output_config?: { effort: string };
      }[]
    )
      .filter((m) => m.role === 'system' && m.output_config)
      .map((m) => m.output_config!.effort);
  await companion.send('quick one', { effort: 'low' });
  assert.deepEqual(effortMsgs(0), ['low']);
  assert.equal(calls[0].output_config.effort, 'medium'); // top level never changes
  await companion.send('typed question'); // back to medium, appended
  assert.deepEqual(effortMsgs(1), ['low', 'medium']);
  await companion.send('another typed one'); // no change, nothing new
  assert.deepEqual(effortMsgs(2), ['low', 'medium']);
});

test('operating Cockpit: tools act directly; only closing a window asks', async () => {
  const { companion, log, answers, events, calls } = setup([
    {
      tools: [
        { name: 'change_settings', input: { skin: 'ember', volume: 40 } },
        { name: 'set_steps', input: { all: true, done: false } },
        { name: 'set_steps', input: { steps: [2], done: true, quest_id: 'q' } },
        { name: 'go_back_to_step', input: { step: 1 } },
        { name: 'view_step', input: { target: '2' } },
        { name: 'quest_control', input: { action: 'pause', note: 'lunch' } },
        { name: 'cockpit_ui', input: { action: 'open_settings', tab: 'keys' } },
        {
          name: 'window_control',
          input: { window_id: '42', action: 'minimize' },
        },
        { name: 'open_app', input: { name: 'discord' } },
        { name: 'open_link', input: { url: 'file:///c:/evil' } },
      ],
    },
    {
      tools: [
        { name: 'window_control', input: { window_id: '42', action: 'close' } },
      ],
    },
    {
      tools: [
        { name: 'window_control', input: { window_id: '42', action: 'close' } },
      ],
    },
    { text: 'Done.' },
  ]);
  answers.push(false, true); // first close: no; second: yes
  await companion.send('do all the things');
  assert.deepEqual(log, [
    'settings:{"skin":"ember","volume":40}',
    'steps:"all":false:',
    'steps:[2]:true:q',
    'back:1',
    'view:1', // step 2 -> 0-based 1
    'pause:lunch',
    'ui:open_settings:keys',
    'window:42:minimize', // no question for minimize
    'app:discord',
    'window:42:close', // only after he said yes
  ]);
  assert.equal(events.filter((e) => e.type === 'confirm').length, 2);
  const firstRound = calls[1].messages.at(-1).content;
  assert.equal(firstRound.at(-1).is_error, true); // file:// link refused
  assert.equal(
    calls[2].messages.at(-1).content[0].content,
    'Nick said no. The window stays open.',
  );
});
