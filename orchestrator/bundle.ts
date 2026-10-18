// Opening a quest's bundle: folders and apps via the OS, sites in the default browser.
// Prep tier (CLAUDE.md rule 2): opens things, never creates or changes them.
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Bundle } from './types.ts';

/** Electron's shell in the app; a fake in tests and dry runs. */
export interface Opener {
  /** Resolves '' on success, or an error message (Electron shell.openPath contract). */
  openPath(fullPath: string): Promise<string>;
  openExternal(url: string): Promise<void>;
}

export interface BundleOpenResult {
  opened: string[];
  missing: string[];
  failed: string[];
}

export const expandHome = (p: string) =>
  p.replace(/^~(?=$|[\\/])/, os.homedir());

async function exists(p: string, kind: 'dir' | 'file') {
  try {
    const s = await stat(p);
    return kind === 'dir' ? s.isDirectory() : s.isFile();
  } catch {
    return false;
  }
}

export async function openBundle(
  bundle: Bundle,
  opener: Opener,
): Promise<BundleOpenResult> {
  const result: BundleOpenResult = { opened: [], missing: [], failed: [] };

  const openLocal = async (item: string, kind: 'dir' | 'file') => {
    const full = path.resolve(expandHome(item));
    if (!(await exists(full, kind))) return result.missing.push(item);
    const error = await opener.openPath(full);
    if (error) result.failed.push(`${item} (${error})`);
    else result.opened.push(item);
  };

  for (const folder of bundle.folders) await openLocal(folder, 'dir');
  for (const app of bundle.apps) await openLocal(app, 'file');

  for (const raw of bundle.urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      result.failed.push(`${raw} (not a link)`);
      continue;
    }
    // Only web links: a quest file must not be able to launch arbitrary protocol handlers.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      result.failed.push(`${raw} (only http/https links open)`);
      continue;
    }
    try {
      await opener.openExternal(url.href);
      result.opened.push(raw);
    } catch (e) {
      result.failed.push(`${raw} (${(e as Error).message})`);
    }
  }
  return result;
}

/** One line for the companion to say about what opened. */
export function describeOpen({ opened, missing, failed }: BundleOpenResult) {
  const total = opened.length + missing.length + failed.length;
  if (total === 0) return 'This quest has no folders or sites yet.';
  const head =
    opened.length === total
      ? `Opened ${total === 1 ? 'your quest item' : `all ${total} quest items`}.`
      : `Opened ${opened.length} of ${total}.`;
  const tail = [
    missing.length ? `Not found: ${missing.join(', ')}.` : '',
    failed.length ? `Couldn't open: ${failed.join(', ')}.` : '',
  ];
  return [head, ...tail].filter(Boolean).join(' ');
}
