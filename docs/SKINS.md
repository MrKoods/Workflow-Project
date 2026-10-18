# Cockpit — Skins (visual system)

> Decision record. Saved 2026-10-17. Supersedes §15 "Visual language" in CONTEXT.md.
> Live prototypes: "Cockpit Visual Direction" design canvas — https://claude.ai/artifact/FdDxmuzioUQjpmP1u4kyVq (bottom row = the four skins).

## Decisions
- **Layout is fixed: "Quest HUD" flow.** Quest title + current objective on the left, companion orb on the right, a flowing glowing trail of objectives along the bottom, XP bar top-center, hotbar bottom-center, quest log bottom-right.
- **Look is swappable: skins.** Every skin runs the same layout and logic; a skin only changes fonts, colors, button/marker shapes, particles and celebration animation.
- **Default skin: Frostbound** (final version below).
- **Switching:** live from a Settings → Skins panel; choice persists and loads on next launch. (Restart only needed if a future skin changes the *layout*, not just the look.)
- **Kept across all skins:** the voice-reactive orb (listening / thinking / speaking / your move / agents working), dark ground with the brightest element = current task, calm-mode switch, reduced-motion support.

## The four skins

| Skin | Title font | Body font | Ground | Task color | Companion color | Main button | Hotbar slots | Particles | Completion moment |
|---|---|---|---|---|---|---|---|---|---|
| **Frostbound** (default) | Aboreto | Alegreya Sans + Noto Sans Runic (rune accents) | #050A12 night blue | Ice cyan #7FE7FF / white #EAFBFF | Aurora green #6BFFB8 | Frozen-glass capsule, spinning snowflake, frost creeps in on hover | Ice hexagons | Aurora + snowfall | "Objective Complete" freezes in from blur |
| **Gilded Relic** | Cormorant SC (gold-leaf gradient) | Barlow Condensed | #0A0806 obsidian | Gold #E8B84A | Violet #B49CFF | Six-sided gold plate with diamond gems | Gold medallions | Gold dust | Gilded banner |
| **Ember Forge** | Grenze Gotisch (molten fill) | Barlow Semi Condensed | #0E0705 volcanic | Molten orange #FF7A1A | Steel blue #8FB8FF | Riveted metal plate, molten seam | Forged shields | Embers + floor heat | "Objective Forged" hammer-in |
| **Strike** | Teko | Barlow | #0B0D10 graphite | Volt yellow #E6FF4F | Electric blue #3D9BFF | Notched volt plate + key hint | Loadout slots | Diagonal texture, giant step number | Volt band wipe "Objective Secured" |

### Frostbound — final details
- Runes frame the "Active quest" label (ᚠ … ᚱ); faint glowing rune band under the title; runes as bullets in the quest log and on the "Speak with companion" link.
- Orb: aurora-green rings and core; turns ice-cyan when it's your move.
- Trail: ice-blue progress line, green pulses traveling along it, hexagon objective markers, crystal chevron over the current one.
- XP bar: segmented ice.

## How a skin is built (implementation rule)
A skin = one token file + one stylesheet. Components never hard-code colors or fonts.

```
skins/
  frostbound/  tokens.json  skin.css  (particles: snow, aurora)
  gilded/      tokens.json  skin.css
  forge/       tokens.json  skin.css
  strike/      tokens.json  skin.css
```

Token groups: `font.title`, `font.body`, `color.ground`, `color.task`, `color.taskBright`, `color.companion`, `color.muted`, `shape.button`, `shape.marker`, `shape.slot`, `fx.particles`, `fx.celebration`, `orb.palette`, `orb.handoffPalette`.

**Test (falsifiable):** adding a fifth skin should touch only its own folder. If it requires editing any component, the skin boundary is leaking — fix that before adding more skins.
