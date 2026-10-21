# Cockpit — Skins (visual system)

> Decision record. Updated 2026-10-20 (Tech HUD + hologram head added as the default layout; Circuit / Pixel hologram faces).
> Live prototypes: "Cockpit Visual Direction" design canvas — https://claude.ai/artifact/FdDxmuzioUQjpmP1u4kyVq
> Boards: **Focus A2** (Tech HUD + hologram head), **Circuit + Pixel, round 2** (Ice / Synapse / Solar), **Orbit color skins**.

## Decisions
- **Two layouts, one setting** (`Settings.layout`, Control Deck → Look → Interface, live):
  - **Tech HUD** (default, 2026-10-20): frame modules — 01 Companion · 02 Comms · center view · 03 Handed to you · 04 Completed. The talking **hologram head** (Circuit particles) is big in the center view; when a step's card comes up the head docks into 01, the card takes the view, helpers go to 03, finished cards stack in 04. Steps run as a rail across the top of the view. Same engine and markup as Orbit (`ui/hud/hud.css` restyles `.fx.orbt.hud`).
  - **Orbit**: your quest's steps orbit the Bloom companion (below).
- **Skins = color palettes** and work in both layouts. A palette may add `holo: { mat, px, tint, eye }` for the hologram: surface material (`circuit` default · `pixel` dotted CRT · `pixel8` solid 8-bit), pixel cell size `px` (CSS px, default 3), second color `tint`, and eye style (iris / spark / ring / glow / pixel / scan).
- **Hologram face** (`Settings.holoFace`, Control Deck → Look, shown in the Tech HUD only): **Auto** (default) uses the skin's own `holo.mat` (no `holo` block = circuit) · **Circuit** always circuit · **Pixel** the skin's pixel material, else `pixel8` at px 3. When the forced face differs from the skin's own, the eyes become iris (circuit) or pixel (pixel). Echo can change it (`change_settings` → `face`).
- **Skin groups** in Control Deck → Look come from `holo.mat`: **Circuit skins** (Ice, Synapse, Solar) · **Pixel skins** (Glacier, Arcade, Phosphor) · **Classic** (no `holo` block: the other 7). A new palette file lands in its group with no code change. Picking a Circuit or Pixel skin while the face is forced the other way sets the face back to Auto, so the skin always shows its own face.
- **Default palette: Ice** (Tech HUD). Aqua stays the Orbit look.
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
| **Ice** (default) | #06111F → #02050B → #000 | #5AB8FF | #BFE9FF | #B48CFF | 3,8,16 | Hologram · white-hot pulses, iris eyes |
| **Synapse** | #0A0A1E → #04030B → #000 | #3FE0FF | #9FFFE0 | #9F7BFF | 5,5,14 | Hologram · cyan → magenta (tint #FF4FD8), spark eyes |
| **Solar** | #1A0C04 → #080402 → #000 | #FFB547 | #FFE08A | #FF7A3D | 14,8,4 | Hologram · gold → coral (tint #FF4F6B), ring eyes |
| **Glacier** | #0A1220 → #03040B → #000 | #9FE8FF | #E6FFFF | #C79BFF | 4,6,14 | Pixel · fine solid 8-bit (px 3), ice → violet (tint #8C6BFF), pixel eyes |
| **Arcade** | #1A0618 → #07020A → #000 | #FF4FB8 | #FFD27A | #FFE066 | 10,3,10 | Pixel · chunky 8-bit (px 4), pink → cyan shadows (tint #3FE0FF), scan eyes |
| **Phosphor** | #06140A → #020703 → #000 | #5CFF8A | #C8FF6B | #4FD8FF | 2,8,4 | Pixel · dotted green CRT (px 3, tint #E8FF6B), pixel eyes |
| **Aqua** | #07101C → #020409 → #000 | #7DE3FF | #C6FF8A | #B18CFF | 4,8,14 | Cool, crisp |
| **Ember** | #1C0D05 → #070302 → #000 | #FFB15C | #FFE08A | #FF5E7A | 14,8,5 | Warm fire |
| **Nebula** | #180A2A → #06030C → #000 | #C79BFF | #7EF2D4 | #FF7AC8 | 11,6,18 | Cosmic violet |
| **Aurora** | #04201A → #010806 → #000 | #5CF2B0 | #E6FF7A | #4FB6FF | 4,12,10 | Northern lights |
| **Frost** | #0C1C30 → #03070E → #000 | #BDF4FF | #6BFFB8 | #9FA8FF | 6,12,20 | Ice (old Frostbound) |
| **Crimson** | #1E0509 → #070103 → #000 | #FF5C6C | #FFD27A | #B07CFF | 14,4,6 | Intense |
| **Eclipse** | #151517 → #050506 → #000 | #F2EFEA | #F4C77B | #8E8EA0 | 10,10,11 | Monochrome + gold |

Ground = a radial gradient (center → mid → edge) plus a faint diagonal tint (third color at 7% top-left, accent at 6% bottom-right).

## Hologram faces (Tech HUD)
Face shape, mouth shapes, nose, blink, head motion, emitter cone and the HUD layout are the same for every face; only the surface, the eyes and the colors change (`ui/companion/holo.ts`).
- **Circuit** (70 × 120 grid): twinkling particles + right-angle circuit traces with data pulses.
- **Pixel** (`pixel`, 58 × 100): every surface point snaps to a cell grid (cell = px × devicePixelRatio, first point wins); dotted CRT brightness = depth × scan band.
- **8-bit** (`pixel8`, round(124·3/px) × round(170·3/px)): solid cells shaded from a surface normal (light from the upper left + a rim). A gap fill (across, down, across again) closes the cells the grid skips, so the face has no dark specks.
- Both pixel faces: every third row dimmer (scanlines), 4 color steps (accent → tint) × 5 brightness steps, a soft halo square under each cell, the voice level lifts brightness, no circuit traces. **Glitch:** every 2.6 s for 0.16 s (and sometimes on loud syllables) a horizontal band shifts 1-3 cells sideways and turns tint-colored; never in calm mode.
- Eyes: **pixel** = cells stepping from white at the gaze center out to tint; **scan** = a faint fill with a light bar sweeping side to side (faster while speaking, fastest while thinking).
- Measured on Nick's PC at 2560 × 1440 (head big in the center, window alone; draw time per frame): Ice 6.8 ms · Synapse 6.7 · Solar 6.2 · Glacier 11.2 · Arcade 6.5 · Phosphor 3.4 · Aqua + Pixel 11.2. A 60 fps frame allows 16.7 ms.

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
