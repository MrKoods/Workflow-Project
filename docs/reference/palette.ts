// Cockpit · palette loader (reference). A "color skin" = one JSON token file in skins/palettes/.
// Applying a palette only sets CSS variables on the root + tells the companion renderer its colors.
export interface Palette {
  id: string; name: string;
  ground: { center: string; mid: string; edge: string };
  accent: string; reply: string; third: string;
  card: string;            // "r,g,b" — used as rgba(var(--card), alpha)
  text: string; muted: string; onAccent: string;
  companion: { core: string; filamentsA: string; filamentsB: string };
}

export function applyPalette(root: HTMLElement, p: Palette): void {
  const s = root.style;
  s.setProperty('--acc', p.accent);
  s.setProperty('--acc2', p.reply);
  s.setProperty('--c3', p.third);
  s.setProperty('--card', p.card);
  s.setProperty('--text', p.text);
  s.setProperty('--muted', p.muted);
  s.setProperty('--acctext', p.onAccent);
  s.setProperty('--edge', `color-mix(in srgb, ${p.accent} 17%, transparent)`);
  s.setProperty('--saybg', `rgba(${p.card}, .9)`);
  s.setProperty('--chipbg', `rgba(${p.card}, .85)`);
  s.setProperty('--bg', [
    `radial-gradient(ellipse 70% 60% at 50% 34%, ${p.ground.center} 0%, ${p.ground.mid} 55%, ${p.ground.edge} 100%)`,
    `linear-gradient(160deg, color-mix(in srgb, ${p.third} 7%, transparent) 0%, transparent 38%, transparent 62%, color-mix(in srgb, ${p.accent} 6%, transparent) 100%)`,
    p.ground.edge,
  ].join(', '));
}

// Persist the choice (Settings.palette) and re-apply on launch. Switching is live; no restart needed.
