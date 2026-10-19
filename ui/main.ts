// Renderer entry: apply the saved color skin, then mount the Orbit screen
// and the Settings panel from the orchestrator's snapshot + focus view.
import './orbit/orbit.css';
import './orbit/panels.css';
import './settings.css';
import { mountOrbit } from './orbit';
import { usePalette } from './palette';
import { createSettingsPanel } from './settings';

Promise.all([window.cockpit.getSnapshot(), window.cockpit.getFocus()]).then(
  ([snapshot, focus]) => {
    usePalette(snapshot.settings.palette);
    const settings = createSettingsPanel(window.cockpit);
    settings.update(snapshot.settings);
    window.cockpit.onSnapshot((s) => settings.update(s.settings));

    mountOrbit(
      document.getElementById('app')!,
      window.cockpit,
      snapshot,
      focus,
      settings,
    );
    // The panel lives inside the Orbit root so it shares its fonts.
    document.querySelector('.fx')!.append(...settings.els);

    // Debug: Ctrl+Shift+P cycles palettes (persisted like a Settings click).
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.code === 'KeyP')) {
        e.preventDefault();
        settings.cycle();
      }
    });
  },
);
