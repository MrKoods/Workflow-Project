# Cockpit — Skins (visual system)

> Decision record. Updated 2026-10-18. Replaces all earlier versions (Quest HUD skins; Flow / Tech HUD / Portal skins).
> Live prototypes: "Cockpit Visual Direction" design canvas — https://claude.ai/artifact/FdDxmuzioUQjpmP1u4kyVq
> Look at the bottom section: **Orbit color skins** (7 boards; switch palettes live bottom-left).

## Decisions
- **One layout: Orbit.** Your quest's steps orbit the companion. The layout is fixed for now.
- **Skins = color palettes only** (for now). A skin changes colors and gradients. It does not change the layout, fonts, shapes or motion.
- **Default palette: Aqua.**
- **Switching is live** from Settings → Color skin (no restart). The choice persists.
- **Voice is separate from skin:** Steady or Playful (default Playful). Same quest beats, different wording.
- **Archived** (kept on the canvas, not built): Frostbound / Gilded / Forge / Strike, Flow, Tech HUD, Portal. Frostbound's look survives as the **Frost** palette.

## How Orbit works (what every palette shares)
1. **Opening:** the companion (Bloom) is large in the center; the quest's steps sit on a tilted ring around it as "planets". The ring turns so the first step is at the front with an **Up next** glow. The companion asks if you're ready.
2. **You say yes:** that step's work **pops out of the front of the orbit** (with a short tether line) and becomes the center card. Its helpers appear small on the right. The companion and ring rise to the top; the companion keeps talking from the left. The planet shows **In progress**.
3. **You finish:** the card **tucks back into its planet**, which turns ✓ **Done** and keeps orbiting. The ring turns to bring the next step to the front. Focus returns to the companion for one beat ("That's one down… Ready?").
4. **Repeat** until the quest is done. The software sequences the orbit; you never hunt for the next thing.
5. **Always:** gentle wobble and particles on the ring (never frozen), calm mode + reduced motion supported.

**Companion visual: Bloom.** Bright core + ~30 light filaments. Speaking: filaments reach out with the voice level and rings ripple outward. Listening: filaments curl in, rings ripple inward. Thinking: filaments swirl (third color). Your move: calm, reply color. Working: medium swirl.

**Fonts (fixed for all palettes):** Bricolage Grotesque (titles, planets) · Manrope (UI) · Newsreader (companion captions).

## The palettes

| Palette | Ground (center → mid → edge) | Accent | Reply / done | Third (thinking, filaments) | Card base (rgb) | Feel |
|---|---|---|---|---|---|---|
| **Aqua** (default) | #07101C → #020409 → #000 | #7DE3FF | #C6FF8A | #B18CFF | 4,8,14 | Cool, crisp |
| **Ember** | #1C0D05 → #070302 → #000 | #FFB15C | #FFE08A | #FF5E7A | 14,8,5 | Warm fire |
| **Nebula** | #180A2A → #06030C → #000 | #C79BFF | #7EF2D4 | #FF7AC8 | 11,6,18 | Cosmic violet |
| **Aurora** | #04201A → #010806 → #000 | #5CF2B0 | #E6FF7A | #4FB6FF | 4,12,10 | Northern lights |
| **Frost** | #0C1C30 → #03070E → #000 | #BDF4FF | #6BFFB8 | #9FA8FF | 6,12,20 | Ice (old Frostbound) |
| **Crimson** | #1E0509 → #070103 → #000 | #FF5C6C | #FFD27A | #B07CFF | 14,4,6 | Intense |
| **Eclipse** | #151517 → #050506 → #000 | #F2EFEA | #F4C77B | #8E8EA0 | 10,10,11 | Monochrome + gold |

Ground = a radial gradient (center → mid → edge) plus a faint diagonal tint (third color at 7% top-left, accent at 6% bottom-right).

## How a palette is built (implementation rule)
A palette = **one JSON token file**. Nothing else.

```
skins/palettes/aqua.json  ember.json  nebula.json  aurora.json  frost.json  crimson.json  eclipse.json
```

```json
{
  "id": "aqua", "name": "Aqua",
  "ground": { "center": "#07101C", "mid": "#020409", "edge": "#000000" },
  "accent": "#7DE3FF", "reply": "#C6FF8A", "third": "#B18CFF",
  "card": "4,8,14", "text": "#E9F3FA", "muted": "#7A8796", "onAccent": "#06080A",
  "companion": { "core": "#7DE3FF", "filamentsA": "#B18CFF", "filamentsB": "#C6FF8A" }
}
```

`applyPalette()` (see `reference/palette.ts`) turns tokens into CSS variables on the root (`--acc --acc2 --c3 --card --bg --edge --saybg --chipbg --text --muted --acctext`) and passes the three colors to the Bloom renderer. **Components never hard-code a color.**

**Test (falsifiable):** adding an 8th palette = adding one JSON file. If it needs any CSS or component edit, the palette boundary is leaking. Grep check: no hue hex colors outside `skins/palettes/` (neutral black/white/grey are fine).
