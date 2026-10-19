import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import started from 'electron-squirrel-startup';
import Anthropic from '@anthropic-ai/sdk';
import {
  CompanionError,
  END_SESSION_MESSAGE,
  createCompanion,
  type Companion,
  type Effort,
} from '../orchestrator/companion.ts';
import { createOrchestrator } from '../orchestrator/index.ts';
import type { ChatEvent } from '../orchestrator/types.ts';
import trayIconUrl from './assets/tray.png';
import { IPC } from './ipc';

// Hotkeys decided 2026-10-17 (docs/FEATURES.md §0).
const TOGGLE_KEY = 'Control+Alt+C';
const QUIT_KEY = 'Control+Alt+Q';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) app.quit();

// One Cockpit at a time; a second launch just brings the first one forward.
const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) {
  console.log('[cockpit] already running; handing off to that instance');
  app.quit();
}

// Quest files and the journal live in the repo during Phase 0; env vars override.
// Secrets live in a gitignored .env (CLAUDE.md rule 6) and stay in the main
// process: the UI never sees the key.
try {
  process.loadEnvFile(path.join(app.getAppPath(), '.env'));
} catch {
  // No .env yet: the companion reports the missing key in the chat.
}

const journalDir =
  process.env.COCKPIT_JOURNAL_DIR ??
  path.join(app.getAppPath(), 'journal', 'local');

// COCKPIT_DRY_OPEN=1 logs bundle opens instead of launching Explorer/the browser.
const opener = process.env.COCKPIT_DRY_OPEN
  ? {
      openPath: async (p: string) => (
        console.log(`[cockpit] would open ${p}`),
        ''
      ),
      openExternal: async (u: string) =>
        void console.log(`[cockpit] would open ${u}`),
    }
  : {
      openPath: (p: string) => shell.openPath(p),
      openExternal: (u: string) => shell.openExternal(u),
    };

const orchestrator = createOrchestrator({
  questsDir:
    process.env.COCKPIT_QUESTS_DIR ?? path.join(app.getAppPath(), 'quests'),
  journalDir,
  stateFile: path.join(journalDir, 'state.json'),
  documentsDir: app.getPath('documents'),
  opener,
});

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let companion: Companion | null = null;
let lastChatEvent: ChatEvent['type'] | null = null;

/** The design size orbit.css is built for (see fitZoom). */
const STAGE = { width: 1440, height: 900 };

const createWindow = () => {
  // Dev aid: COCKPIT_WINDOW_SIZE=1100x900 opens a window of that size
  // instead of full screen (narrow-screen layout checks).
  const size = /^(\d{3,4})x(\d{3,4})$/.exec(
    process.env.COCKPIT_WINDOW_SIZE ?? '',
  );
  win = new BrowserWindow({
    show: false,
    frame: false,
    fullscreen: !size,
    ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Orbit is laid out in fixed px for a 1440×900 stage (docs/reference). Zoom
  // the whole page so that stage fills the window: zoom also raises
  // devicePixelRatio, so text and the Bloom canvas render sharp at any size.
  // Height decides on 16:9/16:10 screens (2560×1440 → 1.6, a 1600×900 stage);
  // width decides on narrow ones. Other monitors: revisit when we test them.
  const fitZoom = () => {
    if (!win) return;
    const [w, h] = win.getContentSize();
    const factor = Math.min(h / STAGE.height, w / STAGE.width);
    win.webContents.setZoomFactor(Math.max(0.5, Math.min(3, factor)));
  };
  win.webContents.on('did-finish-load', fitZoom);
  win.on('resize', fitZoom);
  win.once('ready-to-show', () => {
    fitZoom();
    win?.show();
  });

  // Dev: echo renderer console output (incl. uncaught errors) to the terminal.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.webContents.on('console-message', (event) => {
      const { level, message } = event as unknown as {
        level: string;
        message: string;
      };
      if (level !== 'debug' && level !== 'info')
        console.log(`[renderer ${level}] ${message}`);
    });
  }

  // No menu bar, so wire DevTools to F12 ourselves.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Dev aid: COCKPIT_SCREENSHOT=<file.png> captures the window once it has
  // settled. Optional, in order: COCKPIT_SCREENSHOT_KEYS="F2,F2" presses keys;
  // COCKPIT_SCREENSHOT_CHAT="…" sends a message and waits for the reply (or a
  // confirmation prompt); COCKPIT_SCREENSHOT_AFTER_KEYS presses keys after
  // that (e.g. Space on a focused Confirm) and waits for the reply again.
  const shot = process.env.COCKPIT_SCREENSHOT;
  if (shot) {
    const press = async (keys?: string) => {
      // "Tab,Control+Enter,Space": comma-separated, modifiers joined with +.
      for (const combo of keys?.split(',').filter(Boolean) ?? []) {
        const parts = combo.split('+');
        const keyCode = parts.pop()!;
        const modifiers = parts.map((m) => m.toLowerCase()) as Array<
          'control' | 'shift' | 'alt' | 'meta'
        >;
        win?.webContents.sendInputEvent({
          type: 'keyDown',
          keyCode,
          modifiers,
        });
        win?.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
        await wait(300);
      }
    };
    // Wait for the chat to finish or ask; give up early if nothing starts.
    const settleChat = async () => {
      for (let t = 0; t < 180; t++) {
        await wait(500);
        if (['done', 'confirm', 'error'].includes(lastChatEvent ?? '')) return;
        if (t >= 8 && lastChatEvent === null) return;
      }
    };
    // In dev, Vite can reload the page once while it optimizes dependencies,
    // so wait for Orbit to be mounted and no reload for 2.5 s.
    let lastLoad = Date.now();
    win.webContents.on('did-finish-load', () => (lastLoad = Date.now()));
    win.webContents.once('did-finish-load', async () => {
      for (let t = 0; t < 120; t++) {
        await wait(500);
        const mounted = await win?.webContents
          .executeJavaScript('!!document.querySelector(".orbt")')
          .catch(() => false);
        if (mounted && Date.now() - lastLoad > 2500) break;
      }
      await press(process.env.COCKPIT_SCREENSHOT_KEYS);
      // COCKPIT_SCREENSHOT_CLICK=".slot:nth-child(6)" clicks an element.
      const click = process.env.COCKPIT_SCREENSHOT_CLICK;
      if (click) {
        await win?.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(click)})?.click()`,
        );
        await wait(800);
      }
      const say = process.env.COCKPIT_SCREENSHOT_CHAT;
      if (say && companion) {
        void companion.send(say);
        await settleChat();
        if (process.env.COCKPIT_SCREENSHOT_AFTER_KEYS) {
          lastChatEvent = null;
          await press(process.env.COCKPIT_SCREENSHOT_AFTER_KEYS);
          await settleChat();
        }
      }
      // COCKPIT_FPS=1 logs the frame rate over 5 s (Bloom + orbit animating).
      if (process.env.COCKPIT_FPS) {
        const fps = await win?.webContents
          .executeJavaScript(`new Promise((done) => {
          const times = [];
          const tick = (t) => { times.push(t); if (t - times[0] < 5000) requestAnimationFrame(tick); else {
            const gaps = times.slice(1).map((x, i) => x - times[i]).sort((a, b) => a - b);
            done({ fps: +((times.length - 1) / ((t - times[0]) / 1000)).toFixed(1),
                   p95ms: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1),
                   worstMs: +gaps.at(-1).toFixed(1) });
          } };
          requestAnimationFrame(tick);
        })`);
        console.log(`[cockpit] frame rate: ${JSON.stringify(fps)}`);
      }
      // COCKPIT_SCREENSHOT_REPLIES="yeah,done,…" types each reply into the
      // Say box when the focus engine waits for one; captures <shot>-NNa.png
      // mid-motion (600 ms) and <shot>-NNb.png once settled. It also checks
      // that item cards are never removed or re-created (stable elements).
      const replies = process.env.COCKPIT_SCREENSHOT_REPLIES;
      if (replies) {
        const js = (code: string) => win!.webContents.executeJavaScript(code);
        const capture = async (name: string) => {
          const image = await win?.webContents.capturePage();
          if (image)
            await writeFile(
              shot.replace(/\.png$/, `-${name}.png`),
              image.toPNG(),
            );
        };
        const untilWaiting = async () => {
          for (let t = 0; t < 400 && !orchestrator.focusWaiting(); t++)
            await wait(100);
        };
        await js(`(() => {
          const p = (window.__probe = { removed: 0, added: 0, moves: [] });
          document.querySelectorAll('.it').forEach((el, i) => (el.dataset.probe = String(i)));
          new MutationObserver((ms) => ms.forEach((m) => {
            if (m.type === 'childList') {
              m.removedNodes.forEach((n) => n.classList?.contains('it') && p.removed++);
              m.addedNodes.forEach((n) => n.classList?.contains('it') && p.added++);
            } else if (m.target.classList.contains('it')) {
              p.moves.push(m.target.dataset.probe + ':' + m.target.className.replace('it ', ''));
            }
          })).observe(document.querySelector('.fx'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        })()`);
        let n = 0;
        for (const reply of replies.split(',')) {
          await untilWaiting();
          const tag = String(++n).padStart(2, '0');
          await js(
            `(() => { const i = document.getElementById('sayOrb'); i.value = ${JSON.stringify(reply)}; i.form.requestSubmit(); })()`,
          );
          await wait(600);
          await capture(`${tag}a`);
          await untilWaiting();
          await wait(1200); // let the CSS transitions finish
          await capture(`${tag}b`);
        }
        const probe = await js(
          `JSON.stringify({ ...window.__probe, cards: document.querySelectorAll('.it').length, probed: document.querySelectorAll('.it[data-probe]').length })`,
        );
        console.log(`[cockpit] stability probe: ${probe}`);
      }
      await wait(1500);
      const image = await win?.webContents.capturePage();
      if (image) await writeFile(shot, image.toPNG());
      console.log(`[cockpit] screenshot -> ${shot}`);
      app.quit();
    });
  }

  win.on('closed', () => {
    win = null;
  });
};

const showWindow = () => {
  if (!win) return createWindow();
  win.show();
  win.focus();
};

const toggleWindow = () => {
  if (win?.isVisible() && win.isFocused()) win.hide();
  else showWindow();
};

const createTray = () => {
  tray = new Tray(nativeImage.createFromDataURL(trayIconUrl));
  tray.setToolTip('Cockpit');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / hide   Ctrl+Alt+C', click: toggleWindow },
      { type: 'separator' },
      { label: 'Quit   Ctrl+Alt+Q', click: () => app.quit() },
    ]),
  );
  tray.on('click', toggleWindow);
};

const registerHotkeys = () => {
  // register() can return true yet still lose to another app (see Electron
  // globalShortcut docs), so this only catches the obvious failure.
  if (!globalShortcut.register(TOGGLE_KEY, toggleWindow)) {
    console.warn(`[cockpit] could not register ${TOGGLE_KEY}`);
  }
  if (!globalShortcut.register(QUIT_KEY, () => app.quit())) {
    console.warn(`[cockpit] could not register ${QUIT_KEY}`);
  }
};

app.on('second-instance', showWindow);

const connectOrchestrator = async () => {
  await orchestrator.start();
  ipcMain.handle(IPC.snapshot, () => orchestrator.snapshot());
  ipcMain.handle(IPC.completeObjective, () => orchestrator.completeObjective());
  ipcMain.handle(IPC.startNextQuest, () => orchestrator.startNextQuest());
  // Renderer input is untrusted: check types and sizes before it reaches the orchestrator.
  ipcMain.handle(IPC.activateQuest, (_e, id: unknown) => {
    if (typeof id !== 'string' || !/^[\w.-]{1,200}$/.test(id)) return;
    return orchestrator.activateQuest(id);
  });
  ipcMain.handle(IPC.pauseQuest, (_e, note: unknown) =>
    orchestrator.pauseQuest(typeof note === 'string' ? note.slice(0, 500) : ''),
  );
  ipcMain.handle(IPC.openBundle, () => orchestrator.openBundle());
  ipcMain.handle(IPC.createMissingFolders, () =>
    orchestrator.createMissingFolders(),
  );
  // The draft is re-validated in the orchestrator; only the start flag is checked here.
  ipcMain.handle(IPC.acceptDraft, (_e, draft: unknown, start: unknown) =>
    orchestrator.acceptDraft(draft, start === true),
  );
  ipcMain.handle(IPC.discardDraft, () => orchestrator.discardDraft());
  ipcMain.handle(IPC.journalToday, () => orchestrator.journalToday());
  ipcMain.handle(IPC.markWorking, () => orchestrator.markWorking());
  // Validated field by field in orchestrator/settings.ts.
  ipcMain.handle(IPC.setSettings, (_e, patch: unknown) =>
    orchestrator.setSettings(patch),
  );
  ipcMain.handle(IPC.endSession, () => companion?.send(END_SESSION_MESSAGE));
  orchestrator.onChange((s) => win?.webContents.send(IPC.snapshot, s));
  // Orbit: engine view on every change; voice level on every typewriter tick.
  ipcMain.handle(IPC.focus, () => orchestrator.focusView());
  orchestrator.onFocus((v) => win?.webContents.send(IPC.focus, v));
  orchestrator.onVoice((level) => win?.webContents.send(IPC.voice, level));

  let client: Anthropic | null = null;
  let turn: { start: number; firstText: number } | null = null;
  companion = createCompanion({
    host: orchestrator,
    emit: (event) => {
      lastChatEvent = event.type;
      // Latency matters for a talking companion (FEATURES §7 #3): log it.
      const now = Date.now();
      if (event.type === 'user') turn = { start: now, firstText: 0 };
      if (event.type === 'delta' && turn && !turn.firstText) {
        turn.firstText = now;
        console.log(`[companion] first text after ${now - turn.start} ms`);
      }
      if (event.type === 'action' && turn) {
        console.log(`[companion] "${event.text}" after ${now - turn.start} ms`);
      }
      if ((event.type === 'done' || event.type === 'error') && turn) {
        console.log(
          `[companion] turn ${event.type} after ${now - turn.start} ms`,
        );
        turn = null;
      }
      win?.webContents.send(IPC.chatEvent, event);
    },
    client: () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new CompanionError(
          'No API key yet. Add ANTHROPIC_API_KEY to .env (see .env.example) and restart Cockpit.',
        );
      }
      return (client ??= new Anthropic());
    },
    effort: (process.env.COCKPIT_EFFORT as Effort | undefined) ?? 'medium',
  });
  ipcMain.handle(IPC.chatSend, (_e, text: unknown) => {
    if (typeof text !== 'string') return;
    return companion?.send(text.slice(0, 8000));
  });
  // Engine first (reply chips, "yeah"/"done"); anything it isn't waiting
  // for is normal chat with Claude (ORBIT-UPGRADE Task 7).
  ipcMain.handle(IPC.reply, (_e, text: unknown) => {
    if (typeof text !== 'string' || !text.trim()) return;
    const t = text.slice(0, 8000);
    if (orchestrator.focusReply(t)) return;
    orchestrator.focusSay(t);
    return companion?.send(t);
  });
  ipcMain.handle(IPC.itemAction, async (_e, id: unknown) => {
    if (typeof id !== 'string' || !/^[\w.-]{1,100}$/.test(id)) return;
    const result = await orchestrator.itemAction(id);
    if (result?.copy) clipboard.writeText(result.copy);
  });
  ipcMain.handle(IPC.chatAnswer, (_e, id: unknown, ok: unknown) => {
    if (typeof id === 'string') companion?.answer(id, ok === true);
  });
};

app.whenReady().then(async () => {
  if (!isPrimary) return;
  await connectOrchestrator();
  createWindow();
  createTray();
  registerHotkeys();
});

// Hiding the window is normal; Cockpit lives in the tray until you quit.
app.on('window-all-closed', () => {
  // Intentionally empty: quitting happens via tray or Ctrl+Alt+Q.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  orchestrator.stop();
});
