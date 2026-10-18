import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import started from 'electron-squirrel-startup';
import { createOrchestrator } from '../orchestrator/index.ts';
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
const orchestrator = createOrchestrator({
  questsDir:
    process.env.COCKPIT_QUESTS_DIR ?? path.join(app.getAppPath(), 'quests'),
  journalDir:
    process.env.COCKPIT_JOURNAL_DIR ??
    path.join(app.getAppPath(), 'journal', 'local'),
});

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

const createWindow = () => {
  win = new BrowserWindow({
    show: false,
    frame: false,
    fullscreen: true,
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

  win.once('ready-to-show', () => win?.show());

  // No menu bar, so wire DevTools to F12 ourselves.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Dev aid: COCKPIT_SCREENSHOT=<file.png> captures the window once it has
  // settled. COCKPIT_SCREENSHOT_KEYS="F2,F2" presses keys first.
  const shot = process.env.COCKPIT_SCREENSHOT;
  if (shot) {
    win.webContents.once('did-finish-load', async () => {
      await wait(2500);
      for (const key of process.env.COCKPIT_SCREENSHOT_KEYS?.split(',') ?? []) {
        win?.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
        win?.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
        await wait(300);
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
  orchestrator.onChange((s) => win?.webContents.send(IPC.snapshot, s));
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
