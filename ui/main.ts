// Renderer entry: load the skin and the orchestrator's snapshot, then mount the HUD.
import './hud.css';
import { mountHud } from './hud';
import { loadSkin } from './skin';

// Skin choice moves to Settings (persisted) in Phase 3.
const SKIN = 'frostbound';

Promise.all([loadSkin(SKIN), window.cockpit.getSnapshot()]).then(
  ([tokens, snapshot]) =>
    mountHud(document.getElementById('app')!, window.cockpit, tokens, snapshot),
);
