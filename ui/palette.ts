// Color skins (SKINS.md). A palette = one JSON token file in skins/palettes/;
// applying it only sets CSS variables on the root (+ tells listeners such as
// the Bloom renderer). Adding a palette = adding a file: the glob finds it.
export interface Palette {
  id: string;
  name: string;
  ground: { center: string; mid: string; edge: string };
  accent: string;
  reply: string;
  third: string;
  card: string; // "r,g,b" — used as rgba(var(--card), alpha)
  text: string;
  muted: string;
  onAccent: string;
  companion: { core: string; filamentsA: string; filamentsB: string };
  /** Hologram head (Tech HUD): surface material, cell size, second color, eye style.
   *  Optional: palettes without it are Classic (circuit, `reply` as tint, iris eyes). */
  holo?: {
    mat?: HoloMat;
    px?: number;
    tint: string;
    eye: HoloEyeStyle;
  };
}

export type HoloMat = 'circuit' | 'pixel' | 'pixel8';
export type HoloEyeStyle =
  | 'iris'
  | 'spark'
  | 'ring'
  | 'glow'
  | 'pixel'
  | 'scan';
/** The face family a palette belongs to (Settings → Look groups by it). */
export const faceOf = (p: Palette): 'circuit' | 'pixel' | 'classic' =>
  !p.holo
    ? 'classic'
    : (p.holo.mat ?? 'circuit') === 'circuit'
      ? 'circuit'
      : 'pixel';

/** What the head draws for a palette + the Hologram face setting (SKINS.md). */
export function holoLook(
  p: Palette,
  face: 'auto' | 'circuit' | 'pixel',
): { mat: HoloMat; px: number; tint: string; eye: HoloEyeStyle } {
  const own: HoloMat = p.holo?.mat ?? 'circuit';
  const ownPx = p.holo?.px ?? 3;
  const tint = p.holo?.tint ?? p.reply;
  const eye: HoloEyeStyle = p.holo?.eye ?? 'iris';
  if (face === 'circuit')
    return own === 'circuit'
      ? { mat: own, px: ownPx, tint, eye }
      : { mat: 'circuit', px: 3, tint, eye: 'iris' };
  if (face === 'pixel')
    return own !== 'circuit'
      ? { mat: own, px: ownPx, tint, eye }
      : { mat: 'pixel8', px: 3, tint, eye: 'pixel' };
  return { mat: own, px: ownPx, tint, eye };
}

// Ported from docs/reference/palette.ts unchanged.
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
  s.setProperty(
    '--bg',
    [
      `radial-gradient(ellipse 70% 60% at 50% 34%, ${p.ground.center} 0%, ${p.ground.mid} 55%, ${p.ground.edge} 100%)`,
      `linear-gradient(160deg, color-mix(in srgb, ${p.third} 7%, transparent) 0%, transparent 38%, transparent 62%, color-mix(in srgb, ${p.accent} 6%, transparent) 100%)`,
      p.ground.edge,
    ].join(', '),
  );
}

const files = import.meta.glob<Palette>('../skins/palettes/*.json', {
  eager: true,
  import: 'default',
});

// The three hologram palettes first (Ice is the default), then the rest in the order SKINS.md lists them;
// any palette added later goes at the end, alphabetically.
const ORDER = [
  'ice',
  'synapse',
  'solar',
  'glacier',
  'arcade',
  'phosphor',
  'aqua',
  'ember',
  'nebula',
  'aurora',
  'frost',
  'crimson',
  'eclipse',
];
export const PALETTES: Palette[] = Object.values(files).sort((a, b) => {
  const ra = ORDER.indexOf(a.id) >>> 0; // -1 -> large: unknown ids last
  const rb = ORDER.indexOf(b.id) >>> 0;
  return ra - rb || a.id.localeCompare(b.id);
});

export const DEFAULT_PALETTE = 'ice';

export const paletteById = (id: string): Palette =>
  PALETTES.find((p) => p.id === id) ??
  PALETTES.find((p) => p.id === DEFAULT_PALETTE)!;

type Listener = (p: Palette) => void;
const listeners = new Set<Listener>();
let current: Palette | null = null;

/** Apply a palette to the document root and notify listeners (e.g. Bloom). */
export function usePalette(id: string): Palette {
  const p = paletteById(id);
  if (current?.id === p.id) return p;
  current = p;
  applyPalette(document.documentElement, p);
  document.documentElement.dataset.palette = p.id;
  for (const fn of listeners) fn(p);
  return p;
}

export function onPalette(fn: Listener) {
  listeners.add(fn);
  if (current) fn(current);
  return () => listeners.delete(fn);
}

export const currentPalette = () => current;
