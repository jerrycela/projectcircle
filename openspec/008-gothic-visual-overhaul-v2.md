# 008 — Gothic Visual Overhaul v2

## Overview

Transform the game's visual presentation from "flat prototype with gothic tints" to "authentic Diablo I pixel-art dungeon crawler." The core problem is over-reliance on procedural Graphics API drawing (which can't produce texture/material feel) and lack of environmental depth (walls = dark blocks, floors = tinted tiles). This spec covers environment, UI, typography, and atmosphere in 3 phases.

## Constraints & Assumptions

- Primary textures/frames as PNG assets (nano-banana generated); simple shapes (shadows, overlays, masks, icon glyphs) may use Graphics API
- Game is portrait 450x800 at camera zoom 1.6x
- Tile grid is 64x64px per tile, 50x50 map
- FogOfWar, vignette, and CRT noise overlay already exist — enhance, don't replace
- `?debug=1` already gates all physics debug visuals (hitboxes, etc.) — no changes needed
- Performance target: 60fps on desktop, 45+ fps on mobile Safari. Phase 1 ends with a performance checkpoint (measure FPS before proceeding to Phase 2)
- No combat/numbers/progression logic changes; UI input affordance adjustments (touch target size, visual feedback) are allowed and must be regression-tested
- Renderer: game uses `Phaser.AUTO`. Blend mode effects (MULTIPLY) must be visually acceptable in both WebGL and Canvas. If MULTIPLY renders differently in Canvas, fall back to a low-alpha (0.04) normal overlay with warm tint

---

## Phase 1 — Environment (Walls, Floors, Atmosphere)

This phase has the highest visual impact. It transforms the dungeon from "tinted rectangles" to "a place that looks like you're exploring it."

### 1.1 Wall Rendering Overhaul

#### New Assets Required
| Asset | Size | Description |
|-------|------|-------------|
| `wall-top.png` | 64x64 | Top-down view of worn stone brick wall surface. Dark grey-brown, visible mortar lines, moss/crack details. Must tile seamlessly. |
| `wall-face.png` | 64x24 | South-facing wall facade strip. Visible stone bricks with depth shading — darker at top (shadow under coping), lighter at bottom. Gothic arch detail optional. |

#### Rendering Logic (GameScene.create)
Replace current wall rendering (lines 140-151) with 3-layer system:

```
For each grid cell (gx, gy):
  if wall (grid[gy][gx] === 1):
    Render wall-top.png at (gx*64, gy*64), depth=2, tint=GOTHIC_COLORS.WALL_TINT
    
    // South-facing facade: only if cell below is floor
    if (gy+1 < MAP_HEIGHT && grid[gy+1][gx] === 0):
      Render wall-face.png at (gx*64, (gy+1)*64 - 16), depth=4
      // wall-face.png is 64x24. Placed at y=(gy+1)*64-16 means:
      //   top edge at gy*64+48 (covers wall bottom 16px)
      //   bottom edge at (gy+1)*64+8 (overlaps floor top 8px)
      // Shadow strip on floor below facade
      Render shadow rectangle: (gx*64, (gy+1)*64+8), w=64, h=12,
        color=0x000000, alpha=0.35, depth=1
```

- Wall-top tiles use `wallGroup.create()` (keep physics body)
- Wall-face and shadow are `scene.add.image()` (no physics, display only)

#### Depth Table (GameScene, complete)
| Layer | Depth | Notes |
|-------|-------|-------|
| Floor tiles | 0 | `floor-tile-v2` images |
| Floor debris | 0.5 | Bones, dust overlays |
| Floor shadow strips | 1 | Shadow cast by walls |
| Water pools | 1 | WaterPool entity |
| Wall-top | 2 | Physics bodies in wallGroup |
| Torch body | 2 | Torch entity (Rectangle) |
| Torch particles | 3 | Fire particle children |
| Wall-face | 4 | South-facing facade strip (above torch to avoid z-fight) |
| Ground spot | 5 | FogOfWar orange ground light |
| Altar | 5 | Altar entity |
| Altar text | 6 | "Upgrade" prompt |
| Staircase | 10 | Staircase entity |
| Player/Enemies | 10-15 | Container-based entities |
| Combat arc | 50 | Attack sweep visual |
| Skill effects | 75-81 | Tornado, whirlwind, thunderstorm |
| Enemy sparks | 86 | Elemental reaction sparks |
| FogOfWar RT | 90 | RenderTexture darkness |
| Vignette | 91 | Radial gradient (camera-fixed) |
| Warm overlay | 91.5 | MULTIPLY tint (camera-fixed, created after vignette) |
| FogOfWar warm | 91 | ADD blend orange glow (world-space) |
| CRT noise | 92 | Tile sprite noise (camera-fixed) |
| Damage/skill text | 100 | Floating combat numbers |

#### Edge Case: Map Boundaries
- When `gy+1 >= MAP_HEIGHT`, skip facade/shadow (no floor below)
- When `gy-1 >= 0 && grid[gy-1][gx] === 0`, optionally add a north edge highlight line (1px, STONE_HIGHLIGHT) for top-of-wall coping visibility

### 1.2 Floor Tile Upgrade

#### New Assets Required
| Asset | Size | Description |
|-------|------|-------------|
| `floor-tile-v2.png` | 64x64 | Cracked, worn dark stone slab pavement. Visible slab edges, subtle cracks, slightly uneven coloring. Must tile seamlessly. Dark grey-brown base. |
| `floor-debris-01.png` | 32x32 | Scattered small bones on transparent background |
| `floor-debris-02.png` | 32x32 | Dust pile / cobweb on transparent background |

#### Rendering Logic
- Replace `floor-tile` with `floor-tile-v2` in BootScene preload and GameScene floor rendering
- Keep existing tint `0x3a3228`
- After placing all floor tiles, scatter debris overlays:
  - For each floor tile, 8% chance to place a random debris sprite
  - Debris sprite: `scene.add.image()`, depth=0.5, random rotation (0/90/180/270), alpha=0.6
  - Skip tiles with any wall in 4-neighborhood (N/S/E/W) to avoid debris floating on wall edges
  - Acceptable density range: 5-10% (exact % depends on map layout)

### 1.3 Atmosphere Enhancement

#### Warm Color Filter
- Add a full-screen tint overlay in GameScene (created **after** vignette image, before noise):
  - `scene.add.rectangle(vigW/2, vigH/2, vigW, vigH, 0xaa7744, 0.06)`
  - `setScrollFactor(0)`, `setBlendMode(Phaser.BlendModes.MULTIPLY)`, depth=91.5
  - This gives everything a warm sepia/tarnished gold tone
  - **Canvas fallback**: if `game.renderer.type === Phaser.CANVAS`, use normal blend with alpha 0.04 instead of MULTIPLY

#### FogOfWar Tuning
- Increase warm overlay alpha: `0.08` → `0.12` (line 106 in FogOfWar.ts)
- Increase warm overlay radius: `PLAYER_LIGHT_RADIUS * 0.5` → `PLAYER_LIGHT_RADIUS * 0.65`
- Add a second warm layer at torch positions:
  - For each torch, draw `fillStyle(0xff6622, 0.06)` circle at `(torch.x, torch.y)` (tile center), radius = `TORCH_LIGHT_RADIUS * 0.4`
  - This gives torches a warmer, more orange glow vs the player's gold glow

#### Vignette Tuning
- Current: inner radius `vigH * 0.25`, outer `vigH * 0.65`, max alpha 0.55
- Change: inner radius `vigH * 0.20`, outer `vigH * 0.55`, max alpha 0.65
- This makes corners darker, enhancing the "tunnel vision" oppressive feel

---

## Phase 2 — UI Polish (Globes, Typography)

### 2.1 Globe Frame Upgrade

#### New Assets Required
| Asset | Size | Description |
|-------|------|-------------|
| `globe-frame.png` | 84x84 | Heavy carved dark stone circular frame with runic engravings. Transparent center (42px diameter hole). 4-5 visible rune marks around the ring. Oxidized metal/dark stone texture. |

#### Implementation (Globe.ts)
- Remove `drawStoneCircle()` call from constructor
- Replace `frameGraphics` (Graphics object) with `scene.add.image(x, y, 'globe-frame')`
- Frame image: depth=21, centered on globe center
- Keep all existing liquid/mask/specular logic unchanged
- Add inner shadow ring: after liquid, before frame — `fillStyle(0x000000, 0.3)`, stroke circle at `r-1`, lineWidth=2

### 2.2 Typography

#### Font Selection
- Primary: "Pirata One" from Google Fonts (free, Gothic/pirate style, good at small sizes)
- Fallback: monospace (current)

#### Preload (local bundling approach)
- Download "Pirata One" `.woff2` from Google Fonts and save to `public/assets/fonts/PirataOne-Regular.woff2`
- Add `@font-face` in `index.html` `<style>` block:
  ```css
  @font-face {
    font-family: 'Pirata One';
    src: url('/assets/fonts/PirataOne-Regular.woff2') format('woff2');
    font-display: swap;
  }
  ```
- In BootScene `create()` (not preload), gate on font ready with timeout:
  ```typescript
  const fontReady = Promise.race([
    document.fonts.load('16px "Pirata One"'),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ]);
  await fontReady;
  this.scene.start('GameScene');
  ```
- This ensures: (a) no external network dependency at runtime, (b) 3s timeout fallback to monospace, (c) no blocking of Phaser's asset pipeline

#### GothicTheme.ts Changes
- Change all `fontFamily: 'monospace'` → `fontFamily: '"Pirata One", monospace'`
- Increase body fontSize: `'13px'` → `'14px'` (Pirata One reads slightly smaller than monospace)
- Increase title fontSize: `'18px'` → `'20px'`

#### Files with hardcoded `fontFamily: 'monospace'` (must also update)
- `src/ui/SkillButton.ts` (lines 56, 65) — plus/mp text
- `src/ui/InitialSkillPanel.ts` (lines 99, 134) — category badge, element tag
- `src/entities/Altar.ts` (line 24) — upgrade prompt
- `src/systems/CombatSystem.ts` (line 186) — damage numbers
- `src/systems/SkillManager.ts` (line 304) — skill level text

All should be changed to use `GOTHIC_FONTS.BODY` spread or at minimum `fontFamily: '"Pirata One", monospace'`.

#### Text Color Refinements
- Gold text (`GOTHIC_FONTS.GOLD`): keep `#c9a44a` — already good
- Item drop text: change bright green to moss green `#7a9a5a`
- Category badges in InitialSkillPanel: change `#4488ff` → `#6688cc` (muted blue), `#ff8844` → `#cc7744` (muted orange)

---

## Phase 3 — HUD Overhaul (Skill Bar, DPad, Panels)

### 3.1 Skill Buttons: Circle → Square

#### New Assets Required
| Asset | Size | Description |
|-------|------|-------------|
| `skill-frame.png` | 60x60 | Square stone frame with carved border. Dark stone texture, visible chisel marks. Transparent center (50x50 area). |

#### SkillButton.ts Rewrite
- Replace all circle-based rendering with rectangle-based:
  - `VISUAL_RADIUS` → `VISUAL_SIZE = 50` (width/height)
  - `TOUCH_RADIUS` → `TOUCH_SIZE = 60`
  - `fillCircle` → `fillRect`
  - `drawStoneCircle` → `scene.add.image(x, y, 'skill-frame')`, depth=21
- Cooldown overlay: change arc sweep to top-to-bottom rect fill:
  ```typescript
  // ratio 1.0 = full cooldown, 0.0 = ready
  const fillH = VISUAL_SIZE * ratio;
  overlayGraphics.fillRect(x - VISUAL_SIZE/2, y - VISUAL_SIZE/2, VISUAL_SIZE, fillH);
  ```
- Skill icons: keep procedural drawing, adjust coordinates from circular to square center
- Press feedback: use `setScale((VISUAL_SIZE - 6) / VISUAL_SIZE)` on press, `setScale(1)` on release (same pattern as current PRESSED_RADIUS approach but for square)
- Hit zone: already rectangular (`Zone`), just update dimensions

### 3.2 HUD Background

#### New Assets Required
| Asset | Size | Description |
|-------|------|-------------|
| `hud-bg.png` | 450x200 | Bottom HUD panel background. Worn stone slab or aged parchment texture. Darker at top (fades into game view), full opacity at bottom. |

#### Implementation (HUD.ts)
- Add background image at (225, 700) in UIScene, depth=19 (under all HUD elements)
- `setScrollFactor(0)` (UIScene doesn't scroll, but for safety)

### 3.3 DPad Gothic Enhancement

#### DPad.ts Changes (minor)
- Replace arrow triangles with runic direction symbols:
  - Up: inverted triangle with crossbar (runic "up" glyph)
  - Down/Left/Right: rotated variants
- Alternative (simpler): keep arrows but add subtle stone crack lines across each key face
- Increase `KEY_SIZE: 32` → `36` for better touch target on mobile

### 3.4 InitialSkillPanel Restyle

#### New Assets Required
| Asset | Size | Description |
|-------|------|-------------|
| `card-bg.png` | 300x140 | Parchment/stone tablet card background with aged edges. Slightly yellowed or grey-brown. |

#### Implementation
- Replace `drawGothicPanel()` call with `scene.add.image()` using `card-bg.png`
- Keep stone frame border via `drawStoneFrame()` overlay (or bake into card-bg.png)
- Category badges: replace text with small runic icon sprites (optional — text with muted colors from Phase 2 is acceptable)

---

## Asset Generation Prompts (nano-banana)

All prompts should include this style anchor prefix:

> **Style Anchor:** Diablo I (1996) pixel art style. Top-down 3/4 perspective. Dark, gothic, medieval dungeon aesthetic. Limited color palette: dark browns, greys, muted greens. Worn, aged, cracked textures. No modern gradients or clean edges. Everything looks ancient and weathered. Pixel art at native resolution, no anti-aliasing. Transparent PNG where specified.

### Environment Prompts
1. **wall-top.png**: "64x64 pixel art tile, top-down view of a stone brick dungeon wall. Dark grey-brown bricks with visible mortar lines. Subtle moss in cracks. Seamlessly tileable. [Style Anchor]"
2. **wall-face.png**: "64x24 pixel art strip, south-facing dungeon wall facade viewed from above at slight angle. Stone bricks with depth — darker shadow at top, lighter at bottom. Gothic arch carved into stone. [Style Anchor]"
3. **floor-tile-v2.png**: "64x64 pixel art tile, top-down view of cracked stone slab dungeon floor. Irregular slab edges, hairline cracks, subtle color variation. Dark grey-brown. Seamlessly tileable. [Style Anchor]"
4. **floor-debris-01.png**: "32x32 pixel art, scattered small bones (2-3 fragments) on transparent background. Aged yellow-grey bone color. [Style Anchor]"
5. **floor-debris-02.png**: "32x32 pixel art, small dust pile with cobweb strand on transparent background. Grey-brown dust. [Style Anchor]"

### UI Prompts
6. **globe-frame.png**: "84x84 pixel art, circular stone frame for health/mana globe. Heavy carved dark stone ring with 4 runic symbols. Oxidized bronze/dark stone texture. Transparent 42px circle in center. [Style Anchor]"
7. **skill-frame.png**: "60x60 pixel art, square stone frame for skill button. Dark carved stone border with chisel marks. Transparent 50x50 center. [Style Anchor]"
8. **hud-bg.png**: "450x200 pixel art, horizontal stone slab panel for bottom HUD. Dark worn stone texture. Top edge fades to transparency (gradient alpha). [Style Anchor]"
9. **card-bg.png**: "300x140 pixel art, aged parchment/stone tablet background for skill selection card. Slightly yellowed edges, subtle cracks. [Style Anchor]"

---

## Acceptance Criteria

### Phase 1 — Environment
- [ ] AC-01: wall-top.png is loaded and replaces current wall rendering (dark tinted blocks → textured brick surface)
- [ ] AC-02: Walls with floor below (south side) show wall-face.png facade strip covering wall bottom 16px + floor top 8px
- [ ] AC-03: Shadow strip (64x16, black, 35% alpha) renders on floor tiles directly south of walls
- [ ] AC-04: Facade and shadow only render when `grid[gy+1][gx] === 0` (floor below wall)
- [ ] AC-05: floor-tile-v2.png replaces current floor-tile (cracked stone slab instead of dot pattern)
- [ ] AC-06: 5-10% of floor tiles have a debris overlay sprite (bones or dust) at depth 0.5
- [ ] AC-07: Debris sprites do not appear on tiles with wall in 4-neighborhood (N/S/E/W)
- [ ] AC-08: Warm color filter (MULTIPLY blend or Canvas fallback, 0xaa7744, 6% alpha) covers full screen at depth 91.5, scroll-fixed
- [ ] AC-09: FogOfWar warm overlay alpha increased from 0.08 to 0.12, radius from 0.5 to 0.65 of player light
- [ ] AC-10: Torch positions emit a warm orange glow (0xff6622, 6% alpha, 40% of torch light radius)
- [ ] AC-11: Vignette inner radius decreased (0.25→0.20), outer decreased (0.65→0.55), max alpha increased (0.55→0.65)
- [ ] AC-12: No visual regressions — player, enemies, loot, altar, staircase all remain visible and correctly layered
- [ ] AC-13: Performance checkpoint after Phase 1: measure FPS via `game.loop.actualFps` in debug console. Pass: 60fps desktop, 45+ fps mobile Safari

### Phase 2 — UI Polish
- [ ] AC-14: Globe stone circle frame replaced with globe-frame.png asset
- [ ] AC-15: Globe liquid fill, wave animation, specular highlight unchanged
- [ ] AC-16: Inner shadow ring (0x000000, 30% alpha, 2px) visible inside globe frame
- [ ] AC-17: "Pirata One" font loaded from local woff2 and used for all in-game text (GothicTheme + 5 hardcoded files)
- [ ] AC-18: Fallback to monospace if font fails to load within 3s timeout (no blank text)
- [ ] AC-19: Body text 14px, title text 20px (increased from 13/18)
- [ ] AC-20: Item drop text uses moss green (#7a9a5a) instead of bright green
- [ ] AC-21: Category badges use muted colors (blue=#6688cc, orange=#cc7744)

### Phase 3 — HUD Overhaul
- [ ] AC-22: Skill buttons are square (50x50) with skill-frame.png border
- [ ] AC-23: Cooldown overlay renders as top-to-bottom rectangle fill (not arc)
- [ ] AC-24: Skill icons (whirlwind, dash, tornado, thunderstorm) render correctly in square frame
- [ ] AC-25: Press feedback: button visually shrinks via setScale((50-6)/50) on press, restores on release
- [ ] AC-26: hud-bg.png renders behind all bottom HUD elements at depth 19
- [ ] AC-27: DPad keys enlarged to 36x36 for better mobile touch targets
- [ ] AC-28: InitialSkillPanel cards use card-bg.png background instead of procedural drawGothicPanel
- [ ] AC-29: Skill selection panel text uses Pirata One font with correct sizing

### Cross-cutting
- [ ] AC-30: All new PNG assets loaded in BootScene.preload
- [ ] AC-31: No TypeScript errors (`npx tsc --noEmit` passes)
- [ ] AC-32: Production build succeeds (`npm run build`)
- [ ] AC-33: Debug mode (`?debug=1`) still shows physics bodies correctly over new visuals
- [ ] AC-34: All existing game systems (combat, loot, altar, staircase, companions, skills) work without regression

---

## File Change Summary

### New Files
- `public/assets/wall-top.png`
- `public/assets/wall-face.png`
- `public/assets/floor-tile-v2.png`
- `public/assets/floor-debris-01.png`
- `public/assets/floor-debris-02.png`
- `public/assets/globe-frame.png`
- `public/assets/skill-frame.png`
- `public/assets/hud-bg.png`
- `public/assets/card-bg.png`
- `public/assets/fonts/PirataOne-Regular.woff2`

### Modified Files
| File | Changes |
|------|---------|
| `src/scenes/BootScene.ts` | Add new asset keys to preload, font-ready gate in create() |
| `src/scenes/GameScene.ts` | Wall 3-layer rendering, floor debris scatter, warm filter, vignette tuning |
| `src/effects/FogOfWar.ts` | Warm overlay alpha/radius increase, torch warm glow |
| `src/ui/GothicTheme.ts` | Font family change, font size adjustments, new color constants |
| `src/ui/Globe.ts` | Replace frameGraphics with image, add inner shadow |
| `src/ui/SkillButton.ts` | Circle→square rewrite, cooldown rect, frame image, font family |
| `src/ui/HUD.ts` | Add hud-bg image, adjust positioning for square skills |
| `src/ui/DPad.ts` | KEY_SIZE 32→36 |
| `src/ui/InitialSkillPanel.ts` | Card background image, muted badge colors, font family |
| `src/entities/Altar.ts` | Font family → GOTHIC_FONTS |
| `src/systems/CombatSystem.ts` | Font family → GOTHIC_FONTS |
| `src/systems/SkillManager.ts` | Font family → GOTHIC_FONTS |
| `index.html` | @font-face for Pirata One (local woff2) |

### Deleted Files
None — `floor-tile.png` and `wall-tile.png` kept for backward compatibility, just no longer referenced after migration.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| nano-banana generates non-tileable textures | Wall/floor seams visible | Prompt specifies "seamlessly tileable"; visual QA check after generation; manual touch-up if needed |
| Pirata One font renders poorly at small sizes on mobile | Illegible text | Set minimum fontSize=12px; fallback to monospace; test on actual device |
| Wall facade adds 1000+ extra sprites | FPS drop on mobile | Facade sprites are static + camera-culled by Phaser; measure before/after FPS |
| MULTIPLY blend warm filter darkens scene too much | Scene too dark to play | Alpha starts at 6% (very subtle); easily tunable; can switch to SCREEN blend if needed |
| Square skill buttons break existing touch muscle memory | Player confusion | Square buttons occupy same screen region; touch zone size similar (60x60 vs 60px diameter) |

---

## QA Verification Methods

All visual ACs are verified via agent-browser screenshot inspection by a Sonnet subagent (per project QA rules).

| AC Range | Method |
|----------|--------|
| AC-01 to AC-07 | Launch `?debug=1`, navigate to rooms. Screenshot walls/floors. Verify textures, facades, shadows, debris visually. Count debris tiles via console: `document.querySelectorAll('[data-debris]')` or check spawn log. |
| AC-08 to AC-11 | Screenshot center + corner of viewport. Compare warm tint, vignette darkness vs. baseline (pre-change screenshot). |
| AC-12 | Play through 2 floors. Verify all entity types render at correct depth (no z-fighting). |
| AC-13 | In debug console: `game.loop.actualFps` after 10s of gameplay. Desktop >= 60, mobile >= 45. |
| AC-14 to AC-16 | Screenshot HP/MP globes. Verify PNG frame, liquid animation (record 2s GIF), inner shadow ring. |
| AC-17 to AC-21 | Screenshot text-heavy screens (HUD, skill panel, altar, equipment). Verify font change. For AC-18: block font file in DevTools Network tab, reload, verify monospace fallback. |
| AC-22 to AC-29 | Screenshot skill bar, DPad, skill selection panel. Tap skill to verify cooldown rectangle fill. |
| AC-30 | Check BootScene console output for all asset load confirmations. |
| AC-31 | `npx tsc --noEmit` — exit code 0 |
| AC-32 | `npm run build` — exit code 0 |
| AC-33 | Launch with `?debug=1`, verify purple hitboxes visible over new wall textures. |
| AC-34 | Play 3 floors with combat, loot, altar, staircase, skills, companions. No crashes or broken interactions. |

---

## Review History

### Round 1 (2026-04-08)
- Codex (GPT-5.4): READINESS 64%, VERDICT NO — 5 P1, 6 P2, 2 P3
- Gemini (2.5 Pro): READINESS 90%, VERDICT YES — 1 P1, 2 P2, 1 P3
- All P1s resolved: constraint wording, wall-face Y coord, font preload, MULTIPLY fallback, font file list
- All P2s addressed: depth table, debris rules, overlay depth, torch anchor, press feedback
