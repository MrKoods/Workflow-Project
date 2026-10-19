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
import { readFile, writeFile } from 'node:fs/promises';
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
import { createMeasureLog } from '../orchestrator/measure.ts';
import { createTalk, TALK_RATE, type Talk } from '../orchestrator/talk.ts';
import {
  createSpeech,
  takeSentences,
  type Speech,
} from '../orchestrator/speech.ts';
import { VOICE_ID } from '../orchestrator/settings.ts';
import {
  effectiveHotkeys,
  toAccelerator,
  type HotkeyAction,
} from '../orchestrator/keymap.ts';
import type { ChatEvent } from '../orchestrator/types.ts';
import trayIconUrl from './assets/tray.png';
import { IPC } from './ipc';

// Global hotkeys come from Settings → Keys (defaults in orchestrator/keymap.ts:
// Ctrl+Alt+C show/hide, Ctrl+Alt+Q quit, Ctrl+Alt+V talk from any app).

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) app.quit();

// Dev aid: COCKPIT_USER_DATA=<dir> runs a separate profile (own instance
// lock), so a test run can start while the everyday Cockpit stays open.
if (process.env.COCKPIT_USER_DATA)
  app.setPath('userData', process.env.COCKPIT_USER_DATA);

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
  // Engine lines are spoken (Phase 1 Task 3); speech is created on startup.
  speak: (line, voice) =>
    speech?.say(line, voiceId(voice)) ?? Promise.resolve(),
});

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let companion: Companion | null = null;
let talk: Talk | null = null;
let speech: Speech | null = null;
/** The Deepgram voice for the voice in use (Settings: Playful / Steady). */
const voiceId = (voice: 'steady' | 'playful') => {
  const s = orchestrator.snapshot().settings;
  return voice === 'steady' ? s.voiceSteady : s.voicePlayful;
};
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
      // Ctrl+Alt+V talks while Cockpit is hidden: keep mic audio flowing.
      backgroundThrottling: false,
      // The companion speaks without a click first (Phase 1 Task 3).
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // Mic only (no camera, no screen), only for Cockpit's own window.
  const ses = win.webContents.session;
  const audioOnly = (types?: string[]) =>
    !!types?.length && types.every((t) => t === 'audio');
  ses.setPermissionRequestHandler((wc, permission, done, details) =>
    done(
      wc === win?.webContents &&
        permission === 'media' &&
        audioOnly((details as { mediaTypes?: string[] }).mediaTypes),
    ),
  );
  ses.setPermissionCheckHandler(
    (wc, permission, _origin, details) =>
      wc === win?.webContents &&
      permission === 'media' &&
      (details as { mediaType?: string }).mediaType !== 'video',
  );

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
          // "key:ArrowLeft" presses a key, "click:<selector>" clicks, instead of typing;
          // "wav:<file>" speaks a 16 kHz mono WAV through push-to-talk (real STT).
          const [, kind, arg] = /^(key|click|wav):(.+)$/.exec(reply) ?? [];
          if (kind === 'wav' && talk) {
            const buf = await readFile(arg);
            const at = buf.indexOf('data');
            if (buf.readUInt32LE(24) !== TALK_RATE || at < 0)
              throw new Error(`${arg}: needs a ${TALK_RATE} Hz WAV`);
            const pcm = buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at + 4));
            talk.start();
            for (let i = 0; i < pcm.length; i += 640) {
              talk.audio(new Uint8Array(pcm.subarray(i, i + 640)));
              await wait(20);
            }
            talk.stop();
            await wait(600);
            await capture(`${tag}a`);
            await untilWaiting();
            await wait(1200);
            await capture(`${tag}b`);
            continue;
          }
          if (kind) {
            if (kind === 'key') await press(arg);
            else
              await js(
                `document.querySelector(${JSON.stringify(arg)})?.click()`,
              );
            await wait(1800);
            await capture(`${tag}b`);
            continue;
          }
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

/** Tray menu, labelled with the current keys (Settings → Keys can change them). */
const updateTrayMenu = () => {
  if (!tray) return;
  const keys = effectiveHotkeys(orchestrator.snapshot().settings.hotkeys);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Show / hide   ${keys.toggleWindow}`, click: toggleWindow },
      { type: 'separator' },
      { label: `Quit   ${keys.quit}`, click: () => app.quit() },
    ]),
  );
};

const createTray = () => {
  tray = new Tray(nativeImage.createFromDataURL(trayIconUrl));
  tray.setToolTip('Cockpit');
  updateTrayMenu();
  tray.on('click', toggleWindow);
};

const GLOBAL_ACTIONS: Partial<Record<HotkeyAction, () => void>> = {
  toggleWindow: () => toggleWindow(),
  quit: () => app.quit(),
  // The renderer owns the mic, so it decides start vs. stop.
  talkToggle: () => win?.webContents.send(IPC.talkToggle),
};
let registered: Partial<Record<HotkeyAction, string>> = {};
/** Combos another app owns (Settings shows these). */
const hotkeyTrouble: Partial<Record<HotkeyAction, string>> = {};

const registerHotkeys = () => {
  const keys = effectiveHotkeys(orchestrator.snapshot().settings.hotkeys);
  for (const [action, run] of Object.entries(GLOBAL_ACTIONS) as [
    HotkeyAction,
    () => void,
  ][]) {
    const combo = keys[action];
    if (registered[action] === combo) continue;
    const old = registered[action];
    if (old) globalShortcut.unregister(toAccelerator(old));
    // register() can return true yet still lose to another app (see Electron
    // globalShortcut docs), so this only catches the obvious failure.
    if (globalShortcut.register(toAccelerator(combo), run)) {
      registered[action] = combo;
      delete hotkeyTrouble[action];
    } else {
      console.warn(`[cockpit] could not register ${combo}`);
      hotkeyTrouble[action] = combo;
      // Keep the key that worked before rather than having none.
      if (old && globalShortcut.register(toAccelerator(old), run))
        registered[action] = old;
      else delete registered[action];
    }
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
  let spoken = ''; // Claude's reply text not yet spoken (an unfinished sentence)
  companion = createCompanion({
    host: orchestrator,
    emit: (event) => {
      lastChatEvent = event.type;
      // Latency matters for a talking companion (FEATURES §7 #3): log it.
      const now = Date.now();
      if (event.type === 'user') turn = { start: now, firstText: 0 };
      // Speak Claude's reply sentence by sentence as it streams in.
      if (event.type === 'user') spoken = '';
      if (event.type === 'delta') {
        const { done, rest } = takeSentences(spoken + event.text);
        spoken = rest;
        for (const s of done)
          void speech?.say(s, voiceId(orchestrator.voiceNow()));
      }
      if (event.type === 'confirm')
        void speech?.say(event.text, voiceId(orchestrator.voiceNow()));
      if (event.type === 'done' && spoken.trim()) {
        void speech?.say(spoken, voiceId(orchestrator.voiceNow()));
        spoken = '';
      }
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
  // for is normal chat with Claude (ORBIT-UPGRADE Task 7). Typed and spoken
  // replies take the same path.
  /** Returns who answered: the quest script or Claude. Spoken questions get
   * quick answers (effort low; Nick 2026-10-18), typed ones the usual effort. */
  const reply = (text: string, spoken = false): 'script' | 'claude' => {
    const t = text.slice(0, 8000);
    if (orchestrator.focusReply(t)) return 'script';
    orchestrator.focusSay(t);
    void companion?.send(t, spoken ? { effort: 'low' } : {});
    return 'claude';
  };
  ipcMain.handle(IPC.reply, (_e, text: unknown) => {
    if (typeof text !== 'string' || !text.trim()) return;
    reply(text);
  });

  // Phase 1 Task 5: time each spoken turn, key release -> first word back.
  const voiceLog = createMeasureLog(journalDir);
  let voiceTurn: {
    releasedAt: number;
    transcriptMs: number;
    route: 'script' | 'claude';
  } | null = null;
  const firstAudio = () => {
    if (!voiceTurn) return;
    const t = voiceTurn;
    voiceTurn = null;
    if (Date.now() - t.releasedAt > 15_000) return; // speech was off; not a turn
    void voiceLog.addVoiceTurn({
      at: new Date(t.releasedAt).toISOString(),
      route: t.route,
      transcriptMs: t.transcriptMs,
      firstAudioMs: Date.now() - t.releasedAt,
    });
  };

  // The companion speaks (Phase 1 Task 3): text-to-speech runs here too.
  speech = createSpeech({
    apiKey: process.env.DEEPGRAM_API_KEY,
    send: (m) => win?.webContents.send(IPC.speech, m),
    enabled: () => orchestrator.snapshot().settings.speech,
    log: (line) => console.log(line),
    onAudio: () => firstAudio(),
  });
  ipcMain.on(IPC.speechPlayed, (_e, id: unknown) => {
    if (typeof id !== 'number') return;
    if (process.env.COCKPIT_SCREENSHOT)
      console.log(`[speech] line ${id} heard`);
    speech?.played(id);
  });
  ipcMain.handle(IPC.speechPreview, (_e, voice: unknown) => {
    if (typeof voice !== 'string' || !VOICE_ID.test(voice)) return;
    speech?.stopAll();
    return speech?.say(
      "Hey Nick. This is how I'd sound working through your quest with you.",
      voice,
      true,
    );
  });
  // Muting stops the companion mid-sentence; changed global keys take effect now.
  orchestrator.onChange((s) => {
    if (!s.settings.speech && speech?.busy()) speech.stopAll();
    if (app.isReady() && win) {
      registerHotkeys();
      updateTrayMenu();
    }
  });
  ipcMain.handle(IPC.hotkeyTrouble, () => ({ ...hotkeyTrouble }));

  // Push-to-talk (Phase 1 Task 2): speech-to-text runs here, not in the UI.
  talk = createTalk({
    apiKey: process.env.DEEPGRAM_API_KEY,
    onState: (s) => win?.webContents.send(IPC.talkState, s),
    onFinal: (text, releasedAt) => {
      const transcriptMs = Date.now() - releasedAt;
      voiceTurn = { releasedAt, transcriptMs, route: reply(text, true) };
    },
    log: (line) => console.log(line),
  });
  // Talking over the companion stops it (barge-in).
  ipcMain.handle(IPC.talkStart, () => {
    speech?.stopAll();
    talk?.start();
  });
  ipcMain.handle(IPC.talkStop, () => talk?.stop());
  ipcMain.handle(IPC.talkCancel, () => talk?.cancel());
  ipcMain.on(IPC.talkAudio, (_e, frame: unknown) => {
    // 20 ms of 16 kHz 16-bit mono = 640 bytes; anything far bigger is not ours.
    if (frame instanceof Uint8Array && frame.byteLength <= 16_000)
      talk?.audio(frame);
    else if (frame instanceof ArrayBuffer && frame.byteLength <= 16_000)
      talk?.audio(new Uint8Array(frame));
  });
  ipcMain.handle(IPC.peekStep, (_e, target: unknown) => {
    if (
      target === 'prev' ||
      target === 'next' ||
      target === 'current' ||
      (Number.isInteger(target) && (target as number) >= 0)
    )
      orchestrator.peekStep(target as number | 'prev' | 'next' | 'current');
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
  // Intentionally empty: quitting happens via the tray or the quit hotkey.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  orchestrator.stop();
});
