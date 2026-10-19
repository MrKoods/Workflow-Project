// Renderer entry: apply the saved color skin, then mount the Orbit screen,
// the Bloom companion and the Settings panel from the orchestrator's
// snapshot + focus view.
import './orbit/orbit.css';
import './orbit/panels.css';
import './settings.css';
import { BloomRenderer } from './companion/bloom';
import { mountOrbit } from './orbit';
import { onPalette, usePalette } from './palette';
import { createSettingsPanel } from './settings';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

Promise.all([window.cockpit.getSnapshot(), window.cockpit.getFocus()]).then(
  ([snapshot, focus]) => {
    usePalette(snapshot.settings.palette);
    const settings = createSettingsPanel(window.cockpit);
    settings.update(snapshot.settings);

    let bloom: BloomRenderer | null = null;
    const { canvas } = mountOrbit(
      document.getElementById('app')!,
      window.cockpit,
      snapshot,
      focus,
      settings,
      {
        onCompanion: (state) => bloom?.setState(state),
        onVoice: (level) => bloom?.setVoiceLevel(level),
      },
    );
    // The panel lives inside the Orbit root so it shares its fonts.
    document.querySelector('.fx')!.append(...settings.els);

    // Bloom (Task 6): one instance; palette colors, engine state, voice level, calm.
    let calm = snapshot.settings.calm;
    const applyCalm = () => bloom?.setCalm(calm || reducedMotion.matches);
    bloom = new BloomRenderer(canvas);
    applyCalm();
    onPalette((p) => bloom!.setPalette(p.accent, p.reply, p.third));
    bloom.setState(focus?.companion ?? 'waiting');
    bloom.start();
    window.cockpit.onVoice((level) => bloom!.setVoiceLevel(level));
    reducedMotion.addEventListener('change', applyCalm);
    window.cockpit.onSnapshot((s) => {
      settings.update(s.settings);
      calm = s.settings.calm;
      applyCalm();
    });

    // Debug: Ctrl+Shift+P cycles palettes (persisted like a Settings click).
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.code === 'KeyP')) {
        e.preventDefault();
        settings.cycle();
      }
    });
  },
);
