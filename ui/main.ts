// Renderer entry: apply the saved color skin, then mount the screen (Tech HUD
// or Orbit layout), its companion (Holo head or Bloom) and the Settings panel
// from the orchestrator's snapshot + focus view.
import './orbit/orbit.css';
import './orbit/panels.css';
import './settings.css';
import './hud/hud.css';
import { BloomRenderer, type CompanionState } from './companion/bloom';
import { HoloRenderer } from './companion/holo';
import { mountOrbit } from './orbit';
import {
  currentPalette,
  holoLook,
  onPalette,
  usePalette,
  type Palette,
} from './palette';
import { setHotkeys } from './keys';
import { createSettingsPanel } from './settings';
import { createSpeechPlayer } from './voice/player';
import { chime } from './voice/chime';
import { createTalkControl } from './voice/talk';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

Promise.all([window.cockpit.getSnapshot(), window.cockpit.getFocus()]).then(
  ([snapshot, focus]) => {
    usePalette(snapshot.settings.palette);
    setHotkeys(snapshot.settings.hotkeys);
    const settings = createSettingsPanel(window.cockpit);
    settings.update(snapshot.settings);

    // The companion: Holo head in the Tech HUD, Bloom in Orbit (same API).
    let bloom: BloomRenderer | HoloRenderer | null = null;
    let layout = snapshot.settings.layout;
    let companionState: CompanionState = focus?.companion ?? 'waiting';
    let refresh = () => {};
    let toast = (message: string) => console.warn('[talk]', message);
    // The companion's voice: real audio drives Bloom while it speaks; the
    // typewriter pulses only stand in when speech is off.
    const player = createSpeechPlayer(window.cockpit, {
      onLevel: (level) => bloom?.setVoiceLevel(level),
      onPlaying: () => refresh(),
    });
    player.setVolume(snapshot.settings.volume);
    const typedLevel = (level: number) => {
      if (!player.playing) bloom?.setVoiceLevel(level);
    };
    // Push-to-talk: the mic level drives Bloom while listening.
    const talk = createTalkControl(window.cockpit, {
      onLevel: (level) => bloom?.setVoiceLevel(level),
      onActive: () => refresh(),
      onError: (message) => toast(message),
      onWake: () => chime(volume),
    });
    // Wake word: listen only while it's switched on AND its model is loaded.
    let volume = snapshot.settings.volume;
    let wakeWanted = snapshot.settings.wakeWord;
    let wakeReady = false;
    const syncWake = () => talk.setWake(wakeWanted && wakeReady);
    window.cockpit.onWakeStatus((s) => {
      wakeReady = s.state === 'ready';
      syncWake();
      settings.setWakeStatus(s);
    });
    void window.cockpit.getWakeStatus().then((s) => {
      wakeReady = s.state === 'ready';
      syncWake();
      settings.setWakeStatus(s);
    });
    const orbit = mountOrbit(
      document.getElementById('app')!,
      window.cockpit,
      snapshot,
      focus,
      settings,
      {
        onCompanion: (state) => {
          companionState = state;
          bloom?.setState(state);
        },
        onVoice: typedLevel,
        onLine: (text) => {
          if (bloom instanceof HoloRenderer) bloom.setLine(text);
        },
        talk,
        speaking: () => player.playing,
      },
    );
    const { canvas } = orbit;
    refresh = orbit.refresh;
    toast = orbit.toast;
    // The panel lives inside the Orbit root so it shares its fonts.
    document.querySelector('.fx')!.append(...settings.els);

    // One companion at a time on the same canvas; swapped when the layout changes.
    let calm = snapshot.settings.calm;
    const applyCalm = () => bloom?.setCalm(calm || reducedMotion.matches);
    // The head's face: the skin's own material, or the forced one (Settings → Look).
    let face = snapshot.settings.holoFace;
    const paint = (p: Palette) => {
      if (bloom instanceof HoloRenderer) {
        const look = holoLook(p, face);
        bloom.setMaterial(look.mat, look.px);
        bloom.setPalette(p.accent, p.reply, p.third, look);
      } else bloom?.setPalette(p.accent, p.reply, p.third);
    };
    const mountCompanion = () => {
      bloom?.stop();
      bloom =
        layout === 'hud' ? new HoloRenderer(canvas) : new BloomRenderer(canvas);
      applyCalm();
      const p = currentPalette();
      if (p) paint(p);
      bloom.setState(companionState);
      bloom.start();
    };
    mountCompanion();
    onPalette(paint);
    window.cockpit.onVoice(typedLevel);
    // Hidden or minimized: stop drawing the companion; back on screen: resume.
    let shown = true;
    window.cockpit.onVisible((v) => {
      if (v === shown) return;
      shown = v;
      if (v) bloom?.start();
      else bloom?.stop();
    });
    reducedMotion.addEventListener('change', applyCalm);
    window.cockpit.onSnapshot((s) => {
      settings.update(s.settings);
      calm = s.settings.calm;
      applyCalm();
      player.setVolume(s.settings.volume);
      volume = s.settings.volume;
      wakeWanted = s.settings.wakeWord;
      syncWake();
      setHotkeys(s.settings.hotkeys);
      if (s.settings.holoFace !== face) {
        face = s.settings.holoFace;
        const p = currentPalette();
        if (p) paint(p);
      }
      if (s.settings.layout !== layout) {
        layout = s.settings.layout;
        mountCompanion();
      }
    });
  },
);
