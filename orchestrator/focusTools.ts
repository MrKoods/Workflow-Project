// ORBIT-UPGRADE Task 9 (groundwork only): tools that would let Claude drive
// the Orbit sequence live. NOT enabled: they are not in companion.ts TOOLS.
// Each call is validated against the quest on screen and becomes one
// engine.run(beat).
//
// Permission tiers (CLAUDE.md rule 2): focus_item, support_items,
// offer_replies and say only change what is on screen (Read tier, run
// freely). complete_step ticks the step in the quest file and adds XP, so
// like Phase 0's complete_objective it must ask the user every time
// (`needsConfirm`). Opening, sending or submitting anything still goes
// through the existing tools and tiers; none of these do that.
import type Anthropic from '@anthropic-ai/sdk';
import type { Beat, Quest } from './types.ts';

/** Flip only when the live mode ships (and add FOCUS_TOOLS to the companion's tools). */
export const FOCUS_TOOLS_ENABLED = false;

export type FocusToolName =
  | 'focus_item'
  | 'support_items'
  | 'complete_step'
  | 'offer_replies'
  | 'say';

export const FOCUS_TOOL_TIERS: Record<
  FocusToolName,
  { tier: 'read'; needsConfirm: boolean }
> = {
  focus_item: { tier: 'read', needsConfirm: false },
  support_items: { tier: 'read', needsConfirm: false },
  offer_replies: { tier: 'read', needsConfirm: false },
  say: { tier: 'read', needsConfirm: false },
  complete_step: { tier: 'read', needsConfirm: true },
};

const tool = (
  name: FocusToolName,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): Anthropic.Beta.BetaTool => ({
  name,
  description,
  input_schema: { type: 'object', properties, required },
});

export const FOCUS_TOOLS: Anthropic.Beta.BetaTool[] = [
  tool(
    'focus_item',
    "Pop one of the current quest's items out of the orbit as the center card (it becomes the hero).",
    { itemId: { type: 'string', description: 'An item id from the quest.' } },
    ['itemId'],
  ),
  tool(
    'support_items',
    'Show up to two helper items small on the right, next to the center card.',
    {
      ids: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 2,
        description: 'Item ids from the quest.',
      },
    },
    ['ids'],
  ),
  tool(
    'complete_step',
    'The current step is done: put its cards away, return focus to the companion and turn the orbit to the next step. Cockpit asks the user to confirm first.',
    {},
  ),
  tool(
    'offer_replies',
    'Show reply chips and wait for the user to pick one (or type).',
    {
      labels: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 4,
      },
    },
    ['labels'],
  ),
  tool(
    'say',
    'Say one short line as the companion caption.',
    { text: { type: 'string', maxLength: 400 } },
    ['text'],
  ),
];

export type FocusToolResult =
  | { ok: true; beat: Beat; needsConfirm: boolean }
  | { ok: false; error: string };

/** Validate a tool call against the quest on screen and turn it into a beat. */
export function focusToolBeat(
  name: string,
  input: unknown,
  quest: Quest | null,
): FocusToolResult {
  if (!quest) return { ok: false, error: 'No quest on screen.' };
  const v = (input ?? {}) as Record<string, unknown>;
  const item = (id: unknown) =>
    typeof id === 'string' && quest.items[id] ? id : null;
  const known = Object.keys(quest.items).join(', ') || '(none)';
  switch (name) {
    case 'focus_item': {
      const id = item(v.itemId);
      if (!id) return { ok: false, error: `Unknown item. Items: ${known}` };
      return { ok: true, beat: { focus: id }, needsConfirm: false };
    }
    case 'support_items': {
      const ids = Array.isArray(v.ids) ? v.ids.map(item) : [null];
      if (ids.length > 2 || ids.some((x) => !x))
        return { ok: false, error: `Up to 2 known item ids. Items: ${known}` };
      return {
        ok: true,
        beat: { support: ids as string[] },
        needsConfirm: false,
      };
    }
    case 'complete_step':
      return { ok: true, beat: { stepDone: true }, needsConfirm: true };
    case 'offer_replies': {
      const labels = Array.isArray(v.labels) ? v.labels : [];
      if (
        !labels.length ||
        labels.length > 4 ||
        !labels.every(
          (l) => typeof l === 'string' && l.trim() && l.length <= 40,
        )
      )
        return { ok: false, error: '1–4 labels, each up to 40 characters.' };
      return {
        ok: true,
        beat: { replies: labels.map((label: string) => ({ label })) },
        needsConfirm: false,
      };
    }
    case 'say': {
      if (typeof v.text !== 'string' || !v.text.trim() || v.text.length > 400)
        return { ok: false, error: 'text: one line, up to 400 characters.' };
      return { ok: true, beat: { say: v.text.trim() }, needsConfirm: false };
    }
    default:
      return { ok: false, error: `Unknown focus tool "${name}".` };
  }
}
