// Renderer entry: load the skin, then mount the HUD.
import './hud.css';
import { mountHud } from './hud';
import { SAMPLE_HUD } from './hud/sample';
import { loadSkin } from './skin';

// Skin choice moves to Settings (persisted) in Phase 3.
const SKIN = 'frostbound';

loadSkin(SKIN).then((tokens) =>
  mountHud(document.getElementById('app')!, SAMPLE_HUD, tokens),
);
