// What Echo can do beyond the quest engine (Nick, 2026-10-19: "full range").
// Builds the CompanionHost from the orchestrator plus Electron: settings,
// steps, Cockpit's screen and window, and other apps. Everything here is
// undoable except closing another app's window, which the companion asks
// about before calling windowAction(…, 'close') (CLAUDE.md rule 2).
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { app, shell, type BrowserWindow } from 'electron';
import { expandHome } from '../orchestrator/bundle.ts';
import type { Orchestrator } from '../orchestrator/index.ts';
import { HOTKEY_ACTIONS, type HotkeyAction } from '../orchestrator/keymap.ts';
import { VOICE_ID } from '../orchestrator/settings.ts';
import type {
  CompanionHost,
  Settings,
  UiCommand,
} from '../orchestrator/types.ts';
import {
  findApp,
  listWindows,
  windowAction,
  type WindowAction,
} from './windows.ts';

const WINDOW_ACTIONS = ['minimize', 'restore', 'maximize', 'focus', 'close'];

export function createEchoHost(opts: {
  orchestrator: Orchestrator;
  window: () => BrowserWindow | null;
  showWindow: () => void;
  sendUi: (cmd: UiCommand) => void;
  /** Global hotkeys Windows refused (another app owns them). */
  hotkeyTrouble: () => Partial<Record<HotkeyAction, string>>;
}): CompanionHost {
  const { orchestrator: o } = opts;
  const palettes = async () =>
    (
      await readdir(path.join(app.getAppPath(), 'skins', 'palettes')).catch(
        () => [],
      )
    )
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
  const voiceId = (v: unknown) => {
    if (typeof v !== 'string') return null;
    const id = v.startsWith('aura-2-')
      ? v
      : `aura-2-${v.trim().toLowerCase()}-en`;
    return VOICE_ID.test(id) ? id : null;
  };

  return {
    ...o,

    async changeSettings(input) {
      const before = o.snapshot().settings;
      const patch: Partial<Settings> = {};
      const refused: string[] = [];
      if (input.skin !== undefined) {
        const id = String(input.skin).toLowerCase();
        if ((await palettes()).includes(id)) patch.palette = id;
        else
          refused.push(
            `skin "${input.skin}" (have: ${(await palettes()).join(', ')})`,
          );
      }
      if (input.layout !== undefined)
        patch.layout = String(input.layout).toLowerCase() as Settings['layout'];
      if (input.voice_style !== undefined)
        patch.voice = input.voice_style as Settings['voice'];
      if (input.speech !== undefined) patch.speech = input.speech as boolean;
      if (input.volume !== undefined) patch.volume = Number(input.volume) / 100;
      if (input.name !== undefined) patch.companionName = String(input.name);
      if (input.wake_word !== undefined)
        patch.wakeWord = input.wake_word as boolean;
      if (input.calm !== undefined) patch.calm = input.calm as boolean;
      for (const [field, key] of [
        ['playful_voice', 'voicePlayful'],
        ['steady_voice', 'voiceSteady'],
      ] as const) {
        if (input[field] === undefined) continue;
        const id = voiceId(input[field]);
        if (id) patch[key] = id;
        else refused.push(`${field} "${input[field]}"`);
      }
      if (input.hotkeys && typeof input.hotkeys === 'object') {
        const keys: Partial<Record<HotkeyAction, string>> = {
          ...before.hotkeys,
        };
        for (const [a, c] of Object.entries(
          input.hotkeys as Record<string, unknown>,
        )) {
          if (!HOTKEY_ACTIONS.includes(a as HotkeyAction)) {
            refused.push(`unknown hotkey action "${a}"`);
            continue;
          }
          if (c === 'default') delete keys[a as HotkeyAction];
          else keys[a as HotkeyAction] = String(c);
        }
        patch.hotkeys = keys;
      }
      if (!Object.keys(patch).length && !refused.length)
        return 'Nothing to change.';
      const after = await o.setSettings(patch);
      // What actually stuck (invalid values are dropped by the settings store).
      const changed: string[] = [];
      for (const k of Object.keys(patch) as (keyof Settings)[]) {
        if (k === 'hotkeys') continue;
        if (JSON.stringify(after[k]) === JSON.stringify(patch[k]))
          changed.push(`${k} → ${JSON.stringify(after[k])}`);
        else
          refused.push(`${k} ${JSON.stringify(patch[k])} (not a valid value)`);
      }
      if (patch.hotkeys) {
        const trouble = opts.hotkeyTrouble();
        for (const [a, c] of Object.entries(patch.hotkeys) as [
          HotkeyAction,
          string,
        ][]) {
          if (after.hotkeys[a] !== c)
            refused.push(`hotkey ${a} = ${c} (invalid or clashes)`);
          else if (trouble[a])
            refused.push(`hotkey ${a} = ${c} (another app owns it)`);
          else if (before.hotkeys[a] !== c) changed.push(`${a} → ${c}`);
        }
      }
      return [
        changed.length ? `Changed: ${changed.join(', ')}.` : 'Nothing changed.',
        refused.length ? `Refused: ${refused.join('; ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    },

    setSteps: (which, done, id) => o.setSteps(which, done, id),
    goBackToStep: (step) => o.goBackToStep(step),

    viewStep(target) {
      const q = o.snapshot().current;
      if (!q) return 'No quest is on screen.';
      if (
        typeof target === 'number' &&
        (target < 0 || target >= q.steps.length)
      )
        return `Steps are numbered 1 to ${q.steps.length}.`;
      o.peekStep(target);
      const peek = o.focusView()?.peek;
      return peek == null
        ? 'Showing the current step.'
        : `Showing step ${peek + 1}: ${q.steps[peek].title} (progress unchanged).`;
    },

    async pauseActive(note) {
      const q = o.snapshot().current;
      if (q?.status !== 'active') return 'Nothing is active.';
      await o.pauseQuest(note);
      return `Paused "${q.title}".`;
    },

    async startNext() {
      const q = o.snapshot().current;
      if (q?.status === 'active') return `"${q.title}" is already active.`;
      await o.startNextQuest();
      const now = o.snapshot().current;
      return now?.status === 'active'
        ? `Started "${now.title}".`
        : 'Nothing is queued.';
    },

    archiveQuest: (id) => o.archiveQuest(id),

    async cockpitUi(action, tab) {
      const win = opts.window();
      const t = (['look', 'voice', 'keys'] as const).find((x) => x === tab);
      switch (action) {
        case 'show':
          opts.showWindow();
          return 'Cockpit is showing.';
        case 'hide':
          win?.hide();
          return 'Cockpit is hidden (the show/hide hotkey brings it back).';
        case 'minimize':
          if (win?.isFullScreen()) win.hide(); // a full-screen window can't minimize
          else win?.minimize();
          return 'Cockpit is minimized.';
        case 'open_settings':
          opts.showWindow();
          opts.sendUi({ type: 'settings', open: true, tab: t });
          return `Settings is open${t ? ` on ${t}` : ''}.`;
        case 'close_settings':
          opts.sendUi({ type: 'settings', open: false });
          return 'Settings is closed.';
        case 'open_journal':
        case 'close_journal':
          opts.sendUi({ type: 'journal', open: action === 'open_journal' });
          return `The journal is ${action === 'open_journal' ? 'open' : 'closed'}.`;
        case 'open_quest_log':
        case 'close_quest_log':
          opts.sendUi({ type: 'questLog', open: action === 'open_quest_log' });
          return `The quest log is ${action === 'open_quest_log' ? 'open' : 'closed'}.`;
      }
      return `Unknown action "${action}".`;
    },

    listWindows: () => listWindows(process.pid),

    async windowAction(id, action) {
      if (!WINDOW_ACTIONS.includes(action))
        return `Unknown action "${action}".`;
      const win = (await listWindows(process.pid)).find((w) => w.id === id);
      if (!win) return 'No such window (ids change; list the windows again).';
      const ok = await windowAction(id, action as WindowAction);
      const past: Record<string, string> = {
        minimize: 'Minimized',
        restore: 'Restored',
        maximize: 'Maximized',
        focus: 'Brought forward',
        close: 'Asked to close',
      };
      return ok
        ? `${past[action]} "${win.title}" (${win.app}).`
        : `Windows didn't let me ${action} "${win.title}".`;
    },

    async openApp(name) {
      const found = await findApp(name);
      if (!found) return `No app called "${name}" in the Start menu.`;
      const err = await shell.openPath(found.path);
      return err
        ? `Couldn't open ${found.name}: ${err}`
        : `Opened ${found.name}.`;
    },

    async openLink(url) {
      await shell.openExternal(url);
      return `Opened ${url} in the browser.`;
    },

    async openFolder(folder) {
      const full = path.resolve(expandHome(folder));
      const isDir = await stat(full).then(
        (s) => s.isDirectory(),
        () => false,
      );
      if (!isDir) return `There's no folder at ${full}.`;
      const err = await shell.openPath(full);
      return err ? `Couldn't open ${full}: ${err}` : `Opened ${full}.`;
    },
  };
}
