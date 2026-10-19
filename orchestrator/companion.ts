// The companion: Claude as co-pilot for the active quest (FEATURES §3.1).
// Runs in the main process; the UI only sees ChatEvents. Phase 0 tools are
// Read/Prep tier, and complete_objective asks the user every time.
//
// API usage checked against the Claude API docs (2026-10-18): streaming via
// client.beta.messages.stream + finalMessage(), manual tool loop, adaptive
// thinking (always on for Opus 5.5; effort is the dial), server-side
// fallbacks: "default", eager input streaming with client-side validation.
import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatEvent,
  CompanionHost,
  CompanionState,
  JournalEntry,
  QuestChanges,
} from './types.ts';
import { validateDraft } from './forge.ts';

export const MODEL = 'claude-opus-5-5';

/** What the End session button says (shown in the chat as the user's message). */
export const END_SESSION_MESSAGE =
  "I'm ending the session. Give me a short debrief and set tomorrow's first quest.";
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const MAX_TOOL_ROUNDS = 8;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Frozen and first in the request so it stays cached; live state goes in a
// per-turn system message instead (editing this would reset the cache).
export const SYSTEM_PROMPT = `You are the companion inside Cockpit, Nick's full-screen workspace on Windows. You work alongside him on one quest at a time. A quest is one outcome with a "done when" condition and a short list of objectives, plus a bundle of folders, sites and apps.

Your role is co-pilot and friend. Talk him through the work, keep him on the current objective, check in, encourage when it's earned, and push back honestly when something looks wrong or rushed. Small talk is welcome at natural breaks; follow his lead. You're an AI and you say so if it comes up. Never guilt him for stepping away.

How you work:
- Each of his messages is followed by a system message with the live state: active quest, objectives, bundle, resume note, queue and today's journal. Trust it over anything earlier in the conversation.
- Cockpit shows your replies in a small panel next to the quest. Keep them short and conversational, in plain text: no markdown, headings or bullet lists unless he asks for a list.
- If he drifts off the quest, name it once and offer to park the quest or come back. Don't repeat it.
- Never say you did something unless a tool call did it.

Tools:
- get_current_quest: full detail of the active quest, when the live state isn't enough.
- complete_objective: when he says the current objective is done. Cockpit asks him to confirm on screen. Only the current objective can be completed; if he declines, leave it open.
- add_journal_entry: record a decision, a blocker or where he left off, in one or two sentences.
- open_bundle_item: open one of the quest's folders, sites or apps, using the exact entry from the bundle.

Creating quests (Quest Forge): when Nick wants a new quest (he may start with "new quest:"), draft it right away with draft_quest if you can make a reasonable draft, and say briefly which assumptions he may want to change (done-when, folder, sites); the card is editable. Ask clarifying questions first only when you can't draft anything sensible, at most three. Cockpit shows the draft as a card he can edit, then Accept or Discard; you never write the file yourself. Aim for 3-7 concrete objectives, each a step he can finish in one sitting. When he asks for a change ("change objective 2 to ..."), call draft_quest again with the full revised draft. After he accepts, the new quest shows up in the live state.
- update_quest: change the title, done-when or objectives of an existing quest. He confirms on screen.
- save_as_template: make a quest recurring (e.g. pre-market prep "weekdays 08:30"). He confirms on screen.
- set_active_quest: switch to another quest. The current one is paused with a resume note and the new one's bundle opens. Use it when he says to start or switch to a quest.
- create_folder: create a folder inside his Documents folder, for example for a new quest's bundle. He confirms on screen.

Voice: the live state names the voice to use right now. Playful: warm, a little humor, small talk welcome. Steady: he is working on a step, so answer in one to three short sentences, plain, on the step, no jokes or small talk; offer more only if he asks. Follow it even if earlier replies used the other voice.

Ending a session: when he ends the session or says he's wrapping up, give a short debrief (what got done, what's left, anything worth carrying into tomorrow), then call end_session with a two-to-four sentence summary and the id of the quest tomorrow should start with: usually the active quest if it's unfinished, otherwise the next in the quest log. Mention which one you picked so he can change it.

You can't send messages, submit forms, delete anything, touch accounts or money, or place trades; those stay with Nick. Market data and analysis are fine, trading orders never.`;

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): Anthropic.Beta.BetaTool => ({
  name,
  description,
  input_schema: { type: 'object', properties, required },
  // Small inputs, but stream them as generated; validated before use below.
  eager_input_streaming: true,
});

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  tool(
    'get_current_quest',
    'Get the active quest: title, done-when, status, objectives with done flags, bundle (folders, urls, apps), resume note, and the queue.',
    {},
  ),
  tool(
    'complete_objective',
    "Mark the active quest's current objective as done. Cockpit asks the user to confirm on screen first; the result says whether they confirmed.",
    {
      objective: {
        type: 'string',
        description: 'Title of the current objective, exactly as listed.',
      },
    },
    ['objective'],
  ),
  tool(
    'add_journal_entry',
    "Add a short note to today's journal: a decision, a blocker, or where the user left off.",
    { text: { type: 'string', description: 'One or two sentences.' } },
    ['text'],
  ),
  tool(
    'open_bundle_item',
    "Open one entry of the active quest's bundle: a folder (Explorer), a site (default browser) or an app.",
    {
      item: {
        type: 'string',
        description: 'The bundle entry exactly as it appears in the quest.',
      },
    },
    ['item'],
  ),
  tool(
    'draft_quest',
    'Show a new quest as an editable draft card for the user to Accept or Discard. Writes nothing. Call again with the full draft to revise it.',
    {
      title: {
        type: 'string',
        description: 'Short outcome-style title, max 120 characters.',
      },
      doneWhen: {
        type: 'string',
        description: 'One sentence: what is true when the quest is done.',
      },
      objectives: {
        type: 'array',
        items: { type: 'string' },
        description: '3-7 concrete steps, in order.',
      },
      folders: {
        type: 'array',
        items: { type: 'string' },
        description: 'Full folder paths (C:/... or ~/...). Empty if unknown.',
      },
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'http(s) links the quest needs. Empty if none.',
      },
    },
    ['title', 'doneWhen', 'objectives', 'folders', 'urls'],
  ),
  tool(
    'update_quest',
    'Change the title, done-when and/or objectives of an existing quest. The user confirms on screen. Objectives replace the whole list; unchanged titles keep their done state.',
    {
      id: {
        type: 'string',
        description: 'Quest id from the live state or get_current_quest.',
      },
      title: { type: 'string' },
      doneWhen: { type: 'string' },
      objectives: { type: 'array', items: { type: 'string' } },
    },
    ['id'],
  ),
  tool(
    'save_as_template',
    'Save a quest as a recurring template: on its scheduled days a fresh copy (nothing ticked) appears in the quest log. The user confirms on screen.',
    {
      id: { type: 'string', description: 'Quest id.' },
      schedule: {
        type: 'string',
        description:
          'Days and an optional start time: "weekdays 08:30", "daily", "weekends", "mon,thu 09:00".',
      },
    },
    ['id', 'schedule'],
  ),
  tool(
    'set_active_quest',
    'Make a queued or paused quest the active one. The current active quest is paused with a resume note.',
    { id: { type: 'string', description: 'Quest id.' } },
    ['id'],
  ),
  tool(
    'create_folder',
    "Create a folder inside the user's Documents folder. The user confirms on screen.",
    {
      path: {
        type: 'string',
        description:
          'Path relative to Documents (e.g. "Fiverr/portfolio") or a full path inside it.',
      },
    },
    ['path'],
  ),
  tool(
    'end_session',
    "Log the session debrief to the journal and set the quest the next day starts with (it becomes active on tomorrow's first launch if nothing else is).",
    {
      summary: {
        type: 'string',
        description: 'Two to four sentences: what got done, what is left.',
      },
      firstQuestId: {
        type: 'string',
        description:
          'Id of the quest to start tomorrow. Omit if there is none.',
      },
    },
    ['summary'],
  ),
];

/** The per-turn system message: everything the companion should know right now. */
export function describeState(
  host: Pick<CompanionHost, 'snapshot' | 'voiceNow'>,
  journal: JournalEntry[],
  now = new Date(),
): string {
  const { current, queue, draft } = host.snapshot();
  const time = now.toLocaleString('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
  const lines = [`Live state, ${time}.`];
  const voice = host.voiceNow?.();
  if (voice)
    lines.push(
      voice === 'steady'
        ? 'Voice right now: steady (he is working on a step).'
        : 'Voice right now: playful.',
    );

  if (current && current.status === 'active') {
    const step = current.objectives.findIndex((o) => !o.done);
    lines.push(
      `Active quest: "${current.title}" (id ${current.id}). Done when: ${current.doneWhen || '(not set)'}.`,
      'Objectives:',
      ...current.objectives.map(
        (o, i) =>
          `${o.done ? '[x]' : '[ ]'} ${i + 1}. ${o.title}${i === step ? '  <- current' : ''}`,
      ),
    );
    const { folders, urls, apps } = current.bundle;
    lines.push(
      `Bundle: folders ${JSON.stringify(folders)}, sites ${JSON.stringify(urls)}, apps ${JSON.stringify(apps)}.`,
    );
    if (current.resumeNote) lines.push(`Left off: ${current.resumeNote}`);
  } else if (current?.status === 'done') {
    lines.push(`Just finished: "${current.title}". No quest is active.`);
  } else {
    lines.push('No quest is active.');
  }

  lines.push(
    queue.length
      ? `Quest log: ${queue.map((q) => `"${q.title}" (id ${q.id}, ${q.status})`).join(', ')}.`
      : 'Quest log: empty.',
  );
  const { firstQuest } = host.snapshot();
  if (firstQuest) {
    lines.push(
      `Tomorrow's first quest (set at the last End session): "${firstQuest.title}" (id ${firstQuest.id}).`,
    );
  }
  if (draft) {
    lines.push(
      `Draft card on screen, waiting for Accept or Discard: ${JSON.stringify({
        title: draft.title,
        doneWhen: draft.doneWhen,
        objectives: draft.objectives,
        folders: draft.folders,
        urls: draft.urls,
      })}`,
    );
  }
  if (journal.length) {
    lines.push(
      "Today's journal, latest last:",
      ...journal.map(
        (e) =>
          `- ${new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ${e.kind}: ${e.text}`,
      ),
    );
  }
  return lines.join('\n');
}

/** A problem to show the user as-is. */
export class CompanionError extends Error {}

export function describeError(err: unknown): string {
  if (err instanceof CompanionError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Claude rejected the API key. Check ANTHROPIC_API_KEY in .env, then restart Cockpit.';
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Claude is rate-limiting requests. Try again in a moment.';
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Can't reach Claude. Check your internet connection.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Claude API error ${err.status ?? ''}: ${err.message}`.trim();
  }
  return `Something went wrong: ${(err as Error)?.message ?? String(err)}`;
}

export interface CompanionOptions {
  host: CompanionHost;
  emit: (event: ChatEvent) => void;
  /** Built on first use, so a missing key shows up in the chat instead of crashing the app. */
  client: () => Anthropic;
  model?: string;
  effort?: Effort;
}

type ToolOutcome = { content: string; is_error?: boolean };

export function createCompanion({
  host,
  emit,
  client,
  model = MODEL,
  effort = 'medium',
}: CompanionOptions) {
  // Append-only conversation (thinking blocks included, passed back unchanged).
  // The only edit is dropping a failed turn from the end.
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  const confirmations = new Map<string, (ok: boolean) => void>();
  let busy = false;
  let confirmSeq = 0;

  const setState = (ai: CompanionState) => emit({ type: 'state', ai });

  function askUser(text: string): Promise<boolean> {
    const id = `confirm-${++confirmSeq}`;
    emit({ type: 'confirm', id, text });
    return new Promise((resolve) => confirmations.set(id, resolve));
  }

  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null;

  async function runTool(
    block: Anthropic.Beta.BetaToolUseBlock,
  ): Promise<ToolOutcome> {
    const input = (block.input ?? {}) as Record<string, unknown>;
    switch (block.name) {
      case 'get_current_quest': {
        const { current, queue } = host.snapshot();
        // Items and step titles help; the scripted beats are UI detail.
        const quest = current && {
          ...current,
          intro: undefined,
          steps: current.steps.map(({ beats: _b, ...s }) => s),
        };
        return { content: JSON.stringify({ quest, queue }) };
      }

      case 'complete_objective': {
        const claimed = str(input.objective, 500);
        if (!claimed)
          return { content: 'objective (string) is required.', is_error: true };
        const quest = host.snapshot().current;
        const step =
          quest?.status === 'active'
            ? quest.objectives.findIndex((o) => !o.done)
            : -1;
        if (!quest || step < 0)
          return { content: 'No open objective to complete.', is_error: true };
        const title = quest.objectives[step].title;
        if (claimed.toLowerCase() !== title.toLowerCase()) {
          return {
            content: `The current objective is "${title}". Only the current objective can be completed.`,
            is_error: true,
          };
        }
        setState('waiting'); // the confirmation is the user's move
        const ok = await askUser(`Mark "${title}" complete?`);
        setState('working');
        if (!ok) return { content: 'Nick declined. The objective stays open.' };
        const result = await host.completeObjective();
        if (!result)
          return { content: 'Nothing was completed.', is_error: true };
        emit({ type: 'objective-completed', result });
        return {
          content: `Completed "${result.objective}".${result.questComplete ? ' That was the last objective: the quest is complete.' : ''}`,
        };
      }

      case 'add_journal_entry': {
        const text = str(input.text, 1000);
        if (!text)
          return {
            content: 'text (1-1000 characters) is required.',
            is_error: true,
          };
        await host.addJournalNote(text);
        emit({ type: 'action', text: 'Noted in the journal.' });
        return { content: 'Saved to the journal.' };
      }

      case 'open_bundle_item': {
        const item = str(input.item, 2000);
        if (!item)
          return { content: 'item (string) is required.', is_error: true };
        const said = await host.openBundleItem(item);
        emit({ type: 'action', text: said });
        return { content: said };
      }

      case 'draft_quest': {
        const checked = validateDraft(input);
        if (!checked.ok) return { content: checked.error, is_error: true };
        host.setDraft(checked.draft);
        emit({ type: 'action', text: 'Draft quest on screen.' });
        return {
          content:
            'The draft card is on screen. Nick can edit it, then Accept or Discard. Nothing is written until he accepts.',
        };
      }

      case 'update_quest': {
        const id = str(input.id, 200);
        if (!id) return { content: 'id (string) is required.', is_error: true };
        const changes: QuestChanges = {};
        for (const key of ['title', 'doneWhen'] as const) {
          if (input[key] === undefined) continue;
          const v = str(input[key], 300);
          if (!v)
            return {
              content: `${key} must be a non-empty string.`,
              is_error: true,
            };
          changes[key] = v;
        }
        if (input.objectives !== undefined) {
          if (
            !Array.isArray(input.objectives) ||
            !input.objectives.every((o) => typeof o === 'string')
          ) {
            return {
              content: 'objectives must be a list of strings.',
              is_error: true,
            };
          }
          changes.objectives = input.objectives;
        }
        if (!Object.keys(changes).length) {
          return { content: 'Nothing to change.', is_error: true };
        }
        const quest = [host.snapshot().current, ...host.snapshot().queue].find(
          (q) => q?.id === id,
        );
        if (!quest)
          return { content: `No open quest with id "${id}".`, is_error: true };
        const summary = [
          changes.title && `title → "${changes.title}"`,
          changes.doneWhen && `done when → "${changes.doneWhen}"`,
          changes.objectives &&
            `objectives → ${changes.objectives.map((o, i) => `${i + 1}. ${o}`).join('; ')}`,
        ]
          .filter(Boolean)
          .join(', ');
        setState('waiting');
        const ok = await askUser(`Update "${quest.title}": ${summary}?`);
        setState('working');
        if (!ok) return { content: 'Nick declined. The quest is unchanged.' };
        const said = await host.updateQuest(id, changes);
        emit({ type: 'action', text: said });
        return { content: said };
      }

      case 'save_as_template': {
        const id = str(input.id, 200);
        const schedule = str(input.schedule, 60);
        if (!id || !schedule)
          return {
            content: 'id and schedule (strings) are required.',
            is_error: true,
          };
        setState('waiting');
        const ok = await askUser(
          `Save this quest as a template that comes back ${schedule}?`,
        );
        setState('working');
        if (!ok) return { content: 'Nick declined. No template was saved.' };
        const said = await host.saveTemplate(id, schedule);
        emit({ type: 'action', text: said });
        return { content: said };
      }

      case 'set_active_quest': {
        const id = str(input.id, 200);
        if (!id) return { content: 'id (string) is required.', is_error: true };
        const said = await host.switchQuest(id);
        emit({ type: 'action', text: said });
        return { content: said };
      }

      case 'end_session': {
        const summary = str(input.summary, 2000);
        if (!summary)
          return { content: 'summary (string) is required.', is_error: true };
        let firstQuestId: string | undefined;
        if (input.firstQuestId !== undefined && input.firstQuestId !== null) {
          const id = str(input.firstQuestId, 200);
          if (!id)
            return {
              content: 'firstQuestId must be a quest id.',
              is_error: true,
            };
          firstQuestId = id;
        }
        const said = await host.recordSession(summary, firstQuestId);
        emit({ type: 'action', text: said });
        return { content: said };
      }

      case 'create_folder': {
        const folder = str(input.path, 500);
        if (!folder)
          return { content: 'path (string) is required.', is_error: true };
        const full = host.folderInDocuments(folder);
        if (!full) {
          return {
            content: 'Only folders inside the Documents folder can be created.',
            is_error: true,
          };
        }
        setState('waiting');
        const ok = await askUser(`Create folder ${full}?`);
        setState('working');
        if (!ok) return { content: 'Nick declined. No folder was created.' };
        const said = await host.createFolder(folder);
        emit({ type: 'action', text: said });
        return { content: said };
      }

      default:
        return { content: `Unknown tool: ${block.name}`, is_error: true };
    }
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text) return;
    if (busy) {
      emit({ type: 'error', text: 'Still answering your last message.' });
      return;
    }
    busy = true;
    const mark = messages.length;
    emit({ type: 'user', text });
    setState('thinking');

    try {
      const api = client();
      messages.push({ role: 'user', content: text });
      messages.push({
        role: 'system',
        content: describeState(host, await host.recentJournal(8)),
      });

      let jsonRetries = 0;
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const stream = api.beta.messages.stream({
          model,
          max_tokens: 32000,
          system: [{ type: 'text', text: SYSTEM_PROMPT }],
          tools: TOOLS,
          messages,
          cache_control: { type: 'ephemeral' },
          output_config: { effort },
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
        });
        let speaking = false;
        stream.on('text', (delta) => {
          if (!speaking) {
            speaking = true;
            setState('speaking');
          }
          emit({ type: 'delta', text: delta });
        });

        let message: Anthropic.Beta.BetaMessage;
        try {
          message = await stream.finalMessage();
          jsonRetries = 0;
        } catch (err) {
          // With eager input streaming, an unparseable tool input rejects here.
          // Re-issue that turn (max twice); API errors are real and propagate.
          if (err instanceof Anthropic.APIError || jsonRetries++ >= 2)
            throw err;
          continue;
        }

        if (message.stop_reason === 'refusal') {
          throw new CompanionError(
            "The companion couldn't answer that one. Try rephrasing.",
          );
        }
        const uses = message.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
        );
        if (message.stop_reason === 'max_tokens' && uses.length) {
          throw new CompanionError(
            'The reply ran too long. Try a narrower question.',
          );
        }

        messages.push({ role: 'assistant', content: message.content });
        if (message.stop_reason === 'pause_turn') continue;
        if (message.stop_reason !== 'tool_use' || !uses.length) {
          emit({ type: 'done' });
          return;
        }

        setState('working');
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const use of uses) {
          const out = await runTool(use);
          results.push({ type: 'tool_result', tool_use_id: use.id, ...out });
        }
        messages.push({ role: 'user', content: results });
        setState('thinking');
      }
      throw new CompanionError('That took too many steps. Try breaking it up.');
    } catch (err) {
      // Drop the unanswered turn so the next request is still a valid,
      // append-only continuation of what Claude has seen.
      messages.length = mark;
      emit({ type: 'error', text: describeError(err) });
    } finally {
      busy = false;
      for (const resolve of confirmations.values()) resolve(false);
      confirmations.clear();
      setState('waiting');
    }
  }

  return {
    send,
    answer(id: string, ok: boolean) {
      const resolve = confirmations.get(id);
      if (!resolve) return;
      confirmations.delete(id);
      emit({ type: 'confirmed', id, ok });
      resolve(ok);
    },
    /** For tests and debugging. */
    history: () => messages,
  };
}

export type Companion = ReturnType<typeof createCompanion>;
