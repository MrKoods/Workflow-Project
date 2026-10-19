// Renderer entry: apply the saved color skin, load the orchestrator's
// snapshot, then mount the HUD and the Settings panel.
import './hud.css';
import './settings.css';
import { mountHud } from './hud';
import { bridgeLegacyTokens } from './hud/legacyPalette';
import { usePalette } from './palette';
import { createSettingsPanel } from './settings';
import { loadSkin } from './skin';

// The legacy HUD still needs Frostbound's fonts/shapes until Orbit replaces it (Task 5).
const SKIN = 'frostbound';

Promise.all([loadSkin(SKIN), window.cockpit.getSnapshot()]).then(
  ([tokens, snapshot]) => {
    bridgeLegacyTokens();
    usePalette(snapshot.settings.palette);
    mountHud(document.getElementById('app')!, window.cockpit, tokens, snapshot);

    const settings = createSettingsPanel(window.cockpit);
    document.body.append(...settings.els);
    settings.update(snapshot.settings);
    window.cockpit.onSnapshot((s) => settings.update(s.settings));

    // Debug: Ctrl+Shift+P cycles palettes (persisted like a Settings click).
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.code === 'KeyP')) {
        e.preventDefault();
        settings.cycle();
      } else if (e.key === 'Escape' && settings.open) settings.toggle(false);
    });
  },
);
