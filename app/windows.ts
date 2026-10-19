// Other apps' windows, for Echo (Nick, 2026-10-19: "full range"). Windows has
// no Node API for this, so a short PowerShell script calls user32 directly.
// List top-level windows; minimize / restore / maximize / focus / close one.
// Close sends WM_CLOSE (the polite close: apps can still ask to save); the
// companion asks Nick before closing anything (CLAUDE.md rule 2).
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

export interface WindowInfo {
  id: string; // HWND as a decimal string
  title: string;
  app: string; // process name, e.g. "chrome"
  state: 'normal' | 'minimized' | 'maximized';
}
export type WindowAction =
  | 'minimize'
  | 'restore'
  | 'maximize'
  | 'focus'
  | 'close';

const TYPES = `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CockpitWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  public static List<string> List() {
    var rows = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true; // visible, not owned
      int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);
      if (cloaked != 0) return true; // hidden UWP / other desktops
      int n = GetWindowTextLength(h); if (n == 0) return true;
      var sb = new StringBuilder(n + 1); GetWindowText(h, sb, sb.Capacity);
      uint pid; GetWindowThreadProcessId(h, out pid);
      string st = IsIconic(h) ? "minimized" : (IsZoomed(h) ? "maximized" : "normal");
      rows.Add(h.ToInt64() + "\\t" + pid + "\\t" + st + "\\t" + sb.ToString());
      return true;
    }, IntPtr.Zero);
    return rows;
  }
  public static bool Act(long id, string a) {
    var h = new IntPtr(id);
    if (!IsWindowVisible(h)) return false;
    switch (a) {
      case "minimize": return ShowWindow(h, 6);
      case "restore": return ShowWindow(h, 9);
      case "maximize": return ShowWindow(h, 3);
      case "close": return PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero);
      case "focus":
        if (IsIconic(h)) ShowWindow(h, 9);
        keybd_event(0x12, 0, 0, UIntPtr.Zero); // a tap of Alt lets a background
        keybd_event(0x12, 0, 2, UIntPtr.Zero); // process bring a window forward
        return SetForegroundWindow(h);
    }
    return false;
  }
}
'@
`;

function powershell(script: string): Promise<string> {
  // -EncodedCommand (UTF-16LE base64) avoids every quoting problem.
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) =>
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded,
      ],
      { windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) =>
        err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout),
    ),
  );
}

/** Top-level app windows, minus Cockpit's own (process `selfPid`). */
export async function listWindows(selfPid: number): Promise<WindowInfo[]> {
  const out = await powershell(`${TYPES}
$rows = [CockpitWin]::List()
foreach ($r in $rows) {
  $p = $r.Split([char]9, 4)
  $name = (Get-Process -Id ([int]$p[1]) -ErrorAction SilentlyContinue).ProcessName
  [Console]::Out.WriteLine(($p[0], $p[1], $p[2], $name, $p[3]) -join [char]9)
}`);
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split('\t'))
    .filter((p) => p.length >= 5 && Number(p[1]) !== selfPid)
    .map(([id, , state, app, ...title]) => ({
      id,
      app: app || 'unknown',
      state: state as WindowInfo['state'],
      title: title.join('\t'),
    }))
    .filter((w) => w.title !== 'Program Manager'); // the desktop itself
}

export async function windowAction(
  id: string,
  action: WindowAction,
): Promise<boolean> {
  if (!/^\d{1,20}$/.test(id)) return false;
  const out = await powershell(`${TYPES}
[Console]::Out.Write([CockpitWin]::Act([long]${id}, '${action}'))`);
  return out.trim().toLowerCase() === 'true';
}

// ---- Opening apps: only Start-menu shortcuts (never arbitrary commands) ----

const MENU = ['Microsoft', 'Windows', 'Start Menu', 'Programs'];
const START_MENUS = [
  path.join(process.env.ProgramData ?? 'C:/ProgramData', ...MENU),
  path.join(process.env.APPDATA ?? '', ...MENU),
];

async function shortcuts(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await shortcuts(full, depth + 1)));
    else if (/\.(lnk|url)$/i.test(e.name)) out.push(full);
  }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The Start-menu shortcut that best matches `name` ("chrome", "discord",
 * "visual studio code"), skipping uninstallers and help links.
 */
export async function findApp(
  name: string,
): Promise<{ name: string; path: string } | null> {
  const want = norm(name);
  if (!want) return null;
  const all = (await Promise.all(START_MENUS.map((d) => shortcuts(d)))).flat();
  let best: { name: string; path: string; score: number } | null = null;
  for (const p of all) {
    const label = path.basename(p).replace(/\.(lnk|url)$/i, '');
    const n = norm(label);
    if (/\b(uninstall|readme|help|documentation|release notes)\b/.test(n))
      continue;
    const score =
      n === want
        ? 100
        : n.startsWith(want)
          ? 80
          : n.split(' ').includes(want)
            ? 70
            : n.includes(want)
              ? 50
              : 0;
    if (
      score &&
      (!best ||
        score > best.score ||
        (score === best.score && label.length < best.name.length))
    )
      best = { name: label, path: p, score };
  }
  return best && { name: best.name, path: best.path };
}
