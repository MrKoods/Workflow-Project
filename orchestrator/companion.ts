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
} from './types.ts';

export const MODEL = 'claude-opus-5-5';
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
];

/** The per-turn system message: everything the companion should know right now. */
export function describeState(
  host: Pick<CompanionHost, 'snapshot'>,
  journal: JournalEntry[],
  now = new Date(),
): string {
  const { current, queue } = host.snapshot();
  const time = now.toLocaleString('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
  const lines = [`Live state, ${time}.`];

  if (current && current.status === 'active') {
    const step = current.objectives.findIndex((o) => !o.done);
    lines.push(
      `Active quest: "${current.title}". Done when: ${current.doneWhen || '(not set)'}.`,
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
      ? `Quest log: ${queue.map((q) => `"${q.title}" (${q.status})`).join(', ')}.`
      : 'Quest log: empty.',
  );
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
        return { content: JSON.stringify({ quest: current, queue }) };
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
