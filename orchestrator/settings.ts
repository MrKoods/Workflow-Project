// User settings (FEATURES §4 Settings): one small JSON file next to state.json.
// Unknown or malformed values fall back to defaults, so a bad edit can't break startup.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanHotkeys } from './keymap.ts';
import { VOICES, type Settings } from './types.ts';

export const DEFAULT_SETTINGS: Settings = {
  palette: 'aqua',
  voice: 'auto',
  calm: false,
  speech: true,
  volume: 0.8,
  // Nick's pick (2026-10-18): Thalia for both until he chooses otherwise.
  voicePlayful: 'aura-2-thalia-en',
  voiceSteady: 'aura-2-thalia-en',
  wakeWord: false, // off until Nick switches it on (mic stays open while on)
  hotkeys: {},
};

/** A Deepgram Aura-2 English voice id. */
export const VOICE_ID = /^aura-2-[a-z]{2,20}-en$/;

const SETTINGS_VERSION = 2;

const PALETTE_ID = /^[a-z0-9-]{1,40}$/;

/** Keep only valid fields from untrusted input (renderer IPC or a hand-edited file). */
export function cleanSettings(input: unknown): Partial<Settings> {
  const v = (input ?? {}) as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (typeof v.palette === 'string' && PALETTE_ID.test(v.palette))
    out.palette = v.palette;
  if (VOICES.includes(v.voice as Settings['voice']))
    out.voice = v.voice as Settings['voice'];
  if (typeof v.calm === 'boolean') out.calm = v.calm;
  if (typeof v.speech === 'boolean') out.speech = v.speech;
  if (typeof v.wakeWord === 'boolean') out.wakeWord = v.wakeWord;
  if (typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1)
    out.volume = v.volume;
  if (typeof v.voicePlayful === 'string' && VOICE_ID.test(v.voicePlayful))
    out.voicePlayful = v.voicePlayful;
  if (typeof v.voiceSteady === 'string' && VOICE_ID.test(v.voiceSteady))
    out.voiceSteady = v.voiceSteady;
  // The whole override map is sent each time; invalid entries are dropped.
  if (v.hotkeys !== undefined) out.hotkeys = cleanHotkeys(v.hotkeys);
  return out;
}

export function createSettingsStore(file: string) {
  let current: Settings = { ...DEFAULT_SETTINGS };
  return {
    async load() {
      try {
        const saved = JSON.parse(await readFile(file, 'utf8'));
        // Files written before Auto existed (no version) stored the old
        // default "playful"; they move to auto once (Nick, 2026-10-18).
        if (saved && !saved.version) delete saved.voice;
        current = { ...DEFAULT_SETTINGS, ...cleanSettings(saved) };
      } catch {
        current = { ...DEFAULT_SETTINGS };
      }
      return current;
    },
    get: () => current,
    /** Merge valid fields and save; returns the new settings. */
    async set(patch: unknown) {
      current = { ...current, ...cleanSettings(patch) };
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(
        file,
        JSON.stringify({ version: SETTINGS_VERSION, ...current }, null, 2),
      );
      return current;
    },
  };
}
