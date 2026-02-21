# Phase 2: Level Layout System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add obstacle-based level layouts with waypoint navigation, making each room a unique tactical puzzle.

**Architecture:** Define `LevelLayout` data types in schemas, create 8 hand-crafted layout templates, store selected layout ID in RunState. BattlePhase reads layout on enter, renders obstacles as static physics bodies, and enemies follow waypoints around obstacles before engaging in normal AI combat. Launch pad positions come from the layout instead of being hardcoded.

**Tech Stack:** TypeScript, Phaser 3 (Arcade Physics), procedural pixel art textures

**Key Coordinates:**
- Room pixel area: (20, 20) to (370, 420) = 350x400
- ROOM_X=20, ROOM_Y=20, ROOM_WIDTH=350, ROOM_HEIGHT=400
- Current hardcoded launch pads: (107.5, 348) and (282.5, 348)
- Breach positions: up=(195,20), down=(195,420), left=(20,220), right=(370,220)

---

### Task 1: Add LevelLayout types to schemas

**Files:**
- Modify: `src/data/schemas.ts` (append after PlacedTrapData interface, ~line 224)

**Step 1: Add the types**

Add the following types after the `PlacedTrapData` interface (after line 224):

```typescript
// ============ Level Layout System ============

export interface ObstacleData {
  readonly x: number          // pixels relative to ROOM_X
  readonly y: number          // pixels relative to ROOM_Y
  readonly width: number      // pixels
  readonly height: number     // pixels
  readonly type: 'wall' | 'destructible'
  readonly hp?: number        // only for 'destructible', default 100
}

export interface WaypointPath {
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>  // relative to ROOM_X/ROOM_Y
}

export interface LaunchPadPosition {
  readonly x: number  // relative to ROOM_X
  readonly y: number  // relative to ROOM_Y
}

export interface LevelLayout {
  readonly id: string
  readonly name: string
  readonly obstacles: readonly ObstacleData[]
  readonly launchPads: readonly LaunchPadPosition[]
  readonly waypoints: Readonly<Record<string, WaypointPath>>  // key = breach direction
  readonly allowedBreachDirections: readonly string[]
  readonly crystalPosition?: { readonly x: number; readonly y: number }  // Phase 3
  readonly maxTraps?: number  // optional trap placement limit
}
```

**Step 2: Verify compilation**

Run: `/Users/admin/ProjectCircle/node_modules/.bin/tsc --noEmit --project /Users/admin/ProjectCircle/tsconfig.json`
Expected: zero errors

---

### Task 2: Add RunState field for current layout

**Files:**
- Modify: `src/state/game-state.ts` (add `currentLayoutId` to RunState)
- Modify: `src/state/actions.ts` (add `setRoomLayout` action)

**Step 1: Add field to RunState**

In `game-state.ts`, add to the RunState interface (~line 45, before closing brace):
```typescript
  currentLayoutId: string | null     // level layout template for current battle
```

Update `createInitialRunState()` (~line 78, before closing brace):
```typescript
    currentLayoutId: null,
```

**Step 2: Add action**

In `actions.ts`, add after `clearPlacedTraps`:
```typescript
/**
 * Set the current room layout
 */
export function setRoomLayout(state: RunState, layoutId: string | null): RunState {
  return {
    ...state,
    currentLayoutId: layoutId,
  }
}
```

**Step 3: Verify compilation**

---

### Task 3: Create obstacle textures in texture-factory

**Files:**
- Modify: `src/utils/texture-factory.ts`

**Step 1: Add texture keys**

Add to `TEXTURE_KEYS` object (~line 36, before closing):
```typescript
  OBSTACLE_WALL: 'tex_obstacle_wall',         // 16x16
  OBSTACLE_CRATE: 'tex_obstacle_crate',       // 16x16
```

**Step 2: Add color palettes** (after existing palettes)

```typescript
// Stone pillar obstacle
const STONE_BASE = 0x3a3a4a
const STONE_LIGHT = 0x4a4a5e
const STONE_DARK = 0x2a2a36
const STONE_HIGHLIGHT = 0x5a5a6e

// Wooden crate obstacle
const CRATE_BASE = 0x8b6914
const CRATE_LIGHT = 0xa88030
const CRATE_DARK = 0x6b4f0e
const CRATE_NAIL = 0xaaaaaa
```

**Step 3: Add generator functions**

Add a `generateStoneWallTexture(scene)` function:
- 16x16 pixel art of a stone pillar face
- Gray tones with mortar lines (horizontal at y=5 and y=11)
- Highlight on top-left edge, shadow on bottom-right

Add a `generateCrateTexture(scene)`:
- 16x16 pixel art of a wooden crate
- Brown tones with plank lines (horizontal at y=5, y=10)
- Small nail dots at (3,3), (12,3), (3,12), (12,12)
- Darker border all around

**Step 4: Register in `generateAllTextures`**

Call both new generators from `generateAllTextures()`.

**Step 5: Verify compilation**

---

### Task 4: Create 8 level layout templates

**Files:**
- Create: `src/data/layouts/index.ts`

**Design principles:**
- All coordinates relative to ROOM origin (0,0 = ROOM_X,ROOM_Y in pixels)
- Room interior: 350w x 400h. Keep 10px margin from walls.
- Obstacles use multiples of 32 for nice alignment with tile size
- Each layout has 2-3 waypoint paths (one per allowed breach direction)
- Waypoints guide enemies through gaps in obstacles to the room interior

**Step 1: Create the layout data file**

```typescript
import type { LevelLayout } from '../schemas'

export const LEVEL_LAYOUTS: readonly LevelLayout[] = [
  // Layout 0: Empty (for first rooms, distance=1)
  {
    id: 'empty',
    name: '空房間',
    obstacles: [],
    launchPads: [
      { x: 87.5, y: 328 },   // left pad (25% width, 82% height)
      { x: 262.5, y: 328 },  // right pad
    ],
    waypoints: {
      up:    { points: [] },
      down:  { points: [] },
      left:  { points: [] },
      right: { points: [] },
    },
    allowedBreachDirections: ['up', 'left', 'right', 'down'],
  },

  // Layout 1: Corridor - S-curve formed by offset walls
  {
    id: 'corridor',
    name: '蛇行走廊',
    obstacles: [
      { x: 0,   y: 100, width: 200, height: 24, type: 'wall' },   // left wall extends right
      { x: 150, y: 220, width: 200, height: 24, type: 'wall' },   // right wall extends left
    ],
    launchPads: [
      { x: 175, y: 350 },  // center pad
    ],
    waypoints: {
      up:   { points: [{ x: 280, y: 60 }, { x: 280, y: 160 }, { x: 70, y: 160 }, { x: 70, y: 280 }, { x: 175, y: 320 }] },
      left: { points: [{ x: 60, y: 60 }, { x: 280, y: 60 }, { x: 280, y: 160 }, { x: 70, y: 280 }, { x: 175, y: 320 }] },
      right:{ points: [{ x: 280, y: 160 }, { x: 70, y: 160 }, { x: 70, y: 280 }, { x: 175, y: 320 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
  },

  // Layout 2: Fortress - central block with two gaps
  {
    id: 'fortress',
    name: '中央堡壘',
    obstacles: [
      { x: 100, y: 150, width: 150, height: 24, type: 'wall' },  // top wall
      { x: 100, y: 250, width: 150, height: 24, type: 'wall' },  // bottom wall
      { x: 100, y: 174, width: 24,  height: 76, type: 'wall' },  // left wall (connects top-bottom)
    ],
    launchPads: [
      { x: 87.5, y: 350 },
      { x: 262.5, y: 350 },
    ],
    waypoints: {
      up:   { points: [{ x: 175, y: 80 }, { x: 300, y: 200 }, { x: 250, y: 320 }] },
      left: { points: [{ x: 50, y: 200 }, { x: 50, y: 300 }, { x: 175, y: 320 }] },
      right:{ points: [{ x: 300, y: 200 }, { x: 250, y: 320 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
  },

  // Layout 3: Split - vertical wall dividing room into two lanes
  {
    id: 'split',
    name: '分岔路',
    obstacles: [
      { x: 163, y: 60, width: 24, height: 220, type: 'wall' },  // center divider (gap at top and bottom)
    ],
    launchPads: [
      { x: 80, y: 350 },
      { x: 270, y: 350 },
    ],
    waypoints: {
      up:   { points: [{ x: 80, y: 60 }, { x: 80, y: 320 }] },  // left lane
      left: { points: [{ x: 80, y: 200 }, { x: 80, y: 320 }] },
      right:{ points: [{ x: 270, y: 200 }, { x: 270, y: 320 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
  },

  // Layout 4: Arena - four pillars in diamond
  {
    id: 'arena',
    name: '競技場',
    obstacles: [
      { x: 151, y: 80,  width: 48, height: 48, type: 'wall' },   // top
      { x: 50,  y: 176, width: 48, height: 48, type: 'wall' },   // left
      { x: 252, y: 176, width: 48, height: 48, type: 'wall' },   // right
      { x: 151, y: 272, width: 48, height: 48, type: 'wall' },   // bottom
    ],
    launchPads: [
      { x: 87.5, y: 370 },
      { x: 262.5, y: 370 },
    ],
    waypoints: {
      up:   { points: [{ x: 100, y: 60 }, { x: 100, y: 200 }, { x: 175, y: 340 }] },
      left: { points: [{ x: 40, y: 120 }, { x: 120, y: 250 }, { x: 175, y: 340 }] },
      right:{ points: [{ x: 310, y: 120 }, { x: 230, y: 250 }, { x: 175, y: 340 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
  },

  // Layout 5: Bottleneck - narrow choke point in the middle
  {
    id: 'bottleneck',
    name: '瓶頸道',
    obstacles: [
      { x: 0,   y: 170, width: 120, height: 24, type: 'wall' },  // left narrows
      { x: 230, y: 170, width: 120, height: 24, type: 'wall' },  // right narrows
    ],
    launchPads: [
      { x: 175, y: 340 },
    ],
    waypoints: {
      up:   { points: [{ x: 175, y: 80 }, { x: 175, y: 210 }, { x: 175, y: 310 }] },
      left: { points: [{ x: 50, y: 120 }, { x: 175, y: 210 }, { x: 175, y: 310 }] },
      right:{ points: [{ x: 300, y: 120 }, { x: 175, y: 210 }, { x: 175, y: 310 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
  },

  // Layout 6: Barricade - destructible crates blocking direct path
  {
    id: 'barricade',
    name: '路障陣',
    obstacles: [
      { x: 60,  y: 120, width: 48, height: 48, type: 'destructible', hp: 80 },
      { x: 240, y: 120, width: 48, height: 48, type: 'destructible', hp: 80 },
      { x: 150, y: 200, width: 48, height: 48, type: 'destructible', hp: 80 },
      { x: 60,  y: 280, width: 48, height: 48, type: 'destructible', hp: 80 },
      { x: 240, y: 280, width: 48, height: 48, type: 'destructible', hp: 80 },
    ],
    launchPads: [
      { x: 87.5, y: 360 },
      { x: 262.5, y: 360 },
    ],
    waypoints: {
      up:   { points: [{ x: 175, y: 60 }, { x: 175, y: 160 }, { x: 175, y: 320 }] },
      left: { points: [{ x: 50, y: 200 }, { x: 120, y: 320 }] },
      right:{ points: [{ x: 300, y: 200 }, { x: 230, y: 320 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
  },

  // Layout 7: Flanking - obstacles force enemies to split
  {
    id: 'flanking',
    name: '包夾陣',
    obstacles: [
      { x: 130, y: 60,  width: 90, height: 24, type: 'wall' },   // top center wall
      { x: 0,   y: 200, width: 100, height: 24, type: 'wall' },  // left wall mid
      { x: 250, y: 200, width: 100, height: 24, type: 'wall' },  // right wall mid
    ],
    launchPads: [
      { x: 60, y: 340 },
      { x: 175, y: 360 },
      { x: 290, y: 340 },
    ],
    waypoints: {
      up:   { points: [{ x: 60, y: 50 }, { x: 60, y: 160 }, { x: 175, y: 310 }] },
      left: { points: [{ x: 50, y: 160 }, { x: 175, y: 310 }] },
      right:{ points: [{ x: 300, y: 160 }, { x: 175, y: 310 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
  },
]

/**
 * Get layout by ID
 */
export function getLayoutById(id: string): LevelLayout | undefined {
  return LEVEL_LAYOUTS.find(l => l.id === id)
}

/**
 * Get a random layout appropriate for room distance.
 * Distance 1: always empty.
 * Distance 2+: random non-empty layout.
 */
export function selectLayoutForDistance(distance: number): LevelLayout {
  if (distance <= 1) {
    return LEVEL_LAYOUTS[0]  // empty
  }
  // Pick random non-empty layout
  const candidates = LEVEL_LAYOUTS.filter(l => l.id !== 'empty')
  return candidates[Math.floor(Math.random() * candidates.length)]
}
```

**Step 2: Verify compilation**

---

### Task 5: Add waypoint following to BattleUnit and AI movement

**Files:**
- Modify: `src/phases/battle-phase.ts`

This is the most critical task. Enemies need to follow waypoints before engaging in normal combat.

**Step 1: Add waypoint fields to BattleUnit interface**

Add to BattleUnit (~line 136):
```typescript
  waypointPath: Array<{ x: number; y: number }>  // waypoints to follow (absolute coords)
  currentWaypointIndex: number                     // index into waypointPath (-1 = done)
```

**Step 2: Initialize in all BattleUnit creation sites**

In every place that creates a BattleUnit, add:
```typescript
  waypointPath: [],
  currentWaypointIndex: -1,
```

(Same 4 sites as the knockbackUntil fix: createUnit, createMonsterUnit x2, chicken factory)

**Step 3: Assign waypoints when spawning enemies**

In `spawnHero()` (~line 959), after the unit is created, assign waypoints from the layout:
```typescript
// Assign waypoints from layout
if (this.currentLayout && this.currentLayout.waypoints[this.breachDirection]) {
  const wp = this.currentLayout.waypoints[this.breachDirection]
  if (wp.points.length > 0) {
    unit.waypointPath = wp.points.map(p => ({ x: ROOM_X + p.x, y: ROOM_Y + p.y }))
    unit.currentWaypointIndex = 0
  }
}
```

**Step 4: Modify applyMovement to handle waypoints**

In `applyMovement()`, add waypoint logic BEFORE the normal AI movement block. After the knockback check and spawning/stationary checks:

```typescript
// Waypoint navigation: follow path before engaging in AI combat
if (unit.waypointPath.length > 0 && unit.currentWaypointIndex >= 0 && unit.currentWaypointIndex < unit.waypointPath.length) {
  const wp = unit.waypointPath[unit.currentWaypointIndex]
  const dx = wp.x - unit.sprite.x
  const dy = wp.y - unit.sprite.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist < 10) {
    // Reached waypoint, advance to next
    unit.currentWaypointIndex += 1
    if (unit.currentWaypointIndex >= unit.waypointPath.length) {
      // All waypoints done, switch to normal AI
      unit.currentWaypointIndex = -1
    }
  } else {
    // Move toward waypoint
    body.setVelocity(
      (dx / dist) * unit.moveSpeed,
      (dy / dist) * unit.moveSpeed
    )
    return  // Skip normal AI movement
  }
}
```

**Step 5: Prevent attacks while following waypoints**

In the update loop where `shouldAttack` is processed (~line 1513-1516), add:
```typescript
// Don't attack while following waypoints
if (unit.waypointPath.length > 0 && unit.currentWaypointIndex >= 0) continue;
```

Wait - actually enemies should be able to attack if a monster is right next to them even while pathing. Better approach: let the AI still calculate, but override movement with waypoint movement. Attacks can still happen if in range. So skip step 5 — just let attacks happen naturally.

**Step 6: Add `currentLayout` field to BattlePhase**

Add to BattlePhase class fields (~line 233):
```typescript
  private currentLayout: LevelLayout | null = null
```

Import at the top of the file:
```typescript
import type { LevelLayout } from '../data/schemas'
import { getLayoutById, selectLayoutForDistance } from '../data/layouts/index'
```

In `enter()`, after reading roomDistance (~line 302):
```typescript
// Load level layout
const layoutId = gameStore.getState().run.currentLayoutId
if (layoutId) {
  this.currentLayout = getLayoutById(layoutId) ?? null
}
if (!this.currentLayout) {
  this.currentLayout = selectLayoutForDistance(this.roomDistance)
}
```

**Step 7: Verify compilation**

---

### Task 6: Render obstacles in battle room

**Files:**
- Modify: `src/phases/battle-phase.ts`

**Step 1: Add obstacle tracking arrays to BattlePhase**

Add class fields (~line 255):
```typescript
  // Obstacle system
  private obstacleSprites: Array<{
    sprite: Phaser.GameObjects.TileSprite
    data: ObstacleData
    hp: number
    maxHp: number
    hpBar: Phaser.GameObjects.Graphics | null
    body: Phaser.Physics.Arcade.Body | null
  }> = []
  private obstacleGroup: Phaser.Physics.Arcade.StaticGroup | null = null
```

Import `ObstacleData`:
```typescript
import type { LevelLayout, ObstacleData } from '../data/schemas'
```

**Step 2: Create `renderObstacles()` method**

Add after `drawBattleRoom()`:
```typescript
private renderObstacles(): void {
  if (!this.currentLayout) return

  this.obstacleGroup = this.scene.physics.add.staticGroup()

  for (const obs of this.currentLayout.obstacles) {
    const absX = ROOM_X + obs.x
    const absY = ROOM_Y + obs.y
    const centerX = absX + obs.width / 2
    const centerY = absY + obs.height / 2

    // Choose texture based on type
    const textureKey = obs.type === 'wall' ? TEXTURE_KEYS.OBSTACLE_WALL : TEXTURE_KEYS.OBSTACLE_CRATE

    // Create tiled sprite to fill obstacle area
    const tileSprite = this.scene.add.tileSprite(
      absX, absY, obs.width, obs.height, textureKey
    ).setOrigin(0, 0).setScale(2, 2).setDepth(5)

    // Adjust tileSprite dimensions for scale
    tileSprite.setSize(obs.width / 2, obs.height / 2)
    tileSprite.setDisplaySize(obs.width, obs.height)

    // Add to physics
    this.scene.physics.add.existing(tileSprite, true)  // true = static
    this.obstacleGroup.add(tileSprite)

    // Set physics body size to match visual
    const body = tileSprite.body as Phaser.Physics.Arcade.StaticBody
    body.setSize(obs.width, obs.height)
    body.setOffset(0, 0)

    // HP bar for destructibles
    let hpBar: Phaser.GameObjects.Graphics | null = null
    if (obs.type === 'destructible') {
      hpBar = this.scene.add.graphics().setDepth(6)
      const hp = obs.hp ?? 100
      this.drawObstacleHPBar(hpBar, centerX, absY - 6, hp, hp)
    }

    this.obstacleSprites.push({
      sprite: tileSprite,
      data: obs,
      hp: obs.type === 'destructible' ? (obs.hp ?? 100) : Infinity,
      maxHp: obs.type === 'destructible' ? (obs.hp ?? 100) : Infinity,
      hpBar,
      body,
    })
  }

  // Add colliders: obstacles block both ally and enemy groups
  if (this.allyGroup) {
    this.scene.physics.add.collider(this.allyGroup, this.obstacleGroup)
  }
  if (this.enemyGroup) {
    this.scene.physics.add.collider(this.enemyGroup, this.obstacleGroup)
  }
}

private drawObstacleHPBar(g: Phaser.GameObjects.Graphics, x: number, y: number, hp: number, maxHp: number): void {
  g.clear()
  const w = 30
  const h = 3
  // Background
  g.fillStyle(0x333333, 0.8)
  g.fillRect(x - w / 2, y, w, h)
  // HP fill
  const ratio = Math.max(0, hp / maxHp)
  g.fillStyle(0xcc8844, 1)
  g.fillRect(x - w / 2, y, w * ratio, h)
}
```

**Step 3: Call `renderObstacles()` in `enter()`**

After `this.createLaunchPads()` (~line 333):
```typescript
this.renderObstacles()
```

**Step 4: Clean up obstacles in `cleanupAll()`**

In the cleanup method, add:
```typescript
for (const obs of this.obstacleSprites) {
  obs.sprite.destroy()
  obs.hpBar?.destroy()
}
this.obstacleSprites = []
this.obstacleGroup?.destroy(true)
this.obstacleGroup = null
```

**Step 5: Verify compilation**

---

### Task 7: Layout-based launch pad positions

**Files:**
- Modify: `src/phases/battle-phase.ts`

Currently launch pads are hardcoded at line 63-68:
```typescript
const LAUNCH_PADS = [
  { x: ROOM_X + ROOM_WIDTH * 0.25, y: ROOM_Y + ROOM_HEIGHT * 0.82 },
  { x: ROOM_X + ROOM_WIDTH * 0.75, y: ROOM_Y + ROOM_HEIGHT * 0.82 },
]
```

**Step 1: Make launch pads dynamic**

Add a class field:
```typescript
private activeLaunchPads: Array<{ x: number; y: number }> = []
```

In `enter()`, after loading the layout, compute launch pad positions:
```typescript
if (this.currentLayout && this.currentLayout.launchPads.length > 0) {
  this.activeLaunchPads = this.currentLayout.launchPads.map(lp => ({
    x: ROOM_X + lp.x,
    y: ROOM_Y + lp.y,
  }))
} else {
  this.activeLaunchPads = [...LAUNCH_PADS]  // fallback to default
}
```

**Step 2: Replace LAUNCH_PADS references with activeLaunchPads**

Search for all uses of `LAUNCH_PADS` in battle-phase.ts and replace with `this.activeLaunchPads`. Key locations:
- `createLaunchPads()`: iterate `this.activeLaunchPads` instead of `LAUNCH_PADS`
- Launch pad click detection: use `this.activeLaunchPads[i]`
- Monster launch position: `this.activeLaunchPads[this.activeLaunchPadIndex]`
- Any `.length` checks

Note: Keep the `LAUNCH_PADS` const as fallback default. Only the runtime references change to use `this.activeLaunchPads`.

**Step 3: Handle launch pad count changes**

Some layouts have 1 or 3 pads. The UI code that draws launch pads (`createLaunchPads`) already iterates over an array, so it should work. But verify:
- `activeLaunchPadIndex` stays within bounds
- Picker UI "click a launch pad" works with variable pad count

**Step 4: Verify compilation**

---

### Task 8: Handle launched monsters bouncing off obstacles

**Files:**
- Modify: `src/phases/battle-phase.ts`

Launched monsters (`isLaunching = true`) have `collideWorldBounds: false` and use manual room-wall bounce in `checkLaunchLanding()`. They also need to bounce off obstacles.

**Step 1: Add obstacle overlap check in launch update**

In the launch update loop (where `checkLaunchLanding` is called for launching units), add obstacle bounce detection:

```typescript
// Check obstacle collision for launching monsters
if (unit.isLaunching && this.obstacleSprites.length > 0) {
  const body = unit.sprite.body as Phaser.Physics.Arcade.Body
  const ux = unit.sprite.x
  const uy = unit.sprite.y
  const ur = Math.max(unit.sprite.displayWidth, unit.sprite.displayHeight) / 3

  for (const obs of this.obstacleSprites) {
    if (obs.hp <= 0) continue
    const ox = ROOM_X + obs.data.x
    const oy = ROOM_Y + obs.data.y
    const ow = obs.data.width
    const oh = obs.data.height

    // Simple AABB vs circle collision
    const closestX = Math.max(ox, Math.min(ux, ox + ow))
    const closestY = Math.max(oy, Math.min(uy, oy + oh))
    const dx = ux - closestX
    const dy = uy - closestY
    const distSq = dx * dx + dy * dy

    if (distSq < ur * ur) {
      // Determine bounce axis
      if (Math.abs(dx) > Math.abs(dy)) {
        body.velocity.x = -body.velocity.x * LAUNCH_BOUNCE
        unit.sprite.x += dx > 0 ? 2 : -2
      } else {
        body.velocity.y = -body.velocity.y * LAUNCH_BOUNCE
        unit.sprite.y += dy > 0 ? 2 : -2
      }

      // Damage destructible obstacles on monster impact
      if (obs.data.type === 'destructible') {
        const impactDamage = 20
        obs.hp -= impactDamage
        if (obs.hpBar) {
          this.drawObstacleHPBar(obs.hpBar, ROOM_X + obs.data.x + obs.data.width / 2, ROOM_Y + obs.data.y - 6, obs.hp, obs.maxHp)
        }
        if (obs.hp <= 0) {
          this.destroyObstacle(obs)
        }
      }
      break  // one collision per frame
    }
  }
}
```

**Step 2: Add `destroyObstacle()` method**

```typescript
private destroyObstacle(obs: typeof this.obstacleSprites[0]): void {
  // Particle burst
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist = 10 + Math.random() * 15
    const p = this.scene.add.circle(
      obs.sprite.x + obs.data.width / 2, obs.sprite.y + obs.data.height / 2,
      2, obs.data.type === 'destructible' ? 0x8b6914 : 0x3a3a4a, 0.8
    ).setDepth(10)
    this.scene.tweens.add({
      targets: p,
      x: p.x + Math.cos(angle) * dist,
      y: p.y + Math.sin(angle) * dist,
      alpha: 0,
      duration: 300,
      onComplete: () => p.destroy(),
    })
  }

  // Remove physics body and visual
  obs.sprite.destroy()
  obs.hpBar?.destroy()
  if (obs.body) {
    this.obstacleGroup?.remove(obs.sprite)
  }
  obs.hp = 0
}
```

**Step 3: Verify compilation**

---

### Task 9: Wire layout selection into game flow

**Files:**
- Modify: `src/phases/explore-phase.ts`

**Step 1: Import layout selection**

Add import:
```typescript
import { selectLayoutForDistance } from '../data/layouts/index'
import { setRoomLayout } from '../state/actions'
```

**Step 2: Assign layout when entering battle**

Find where explore-phase transitions to battle (look for `scene.data.set('breachDirection', ...)` or similar). After setting breach direction and room distance, add:

```typescript
// Select level layout for this room
const layout = selectLayoutForDistance(roomDistance)
gameStore.dispatchRunState(run => setRoomLayout(run, layout.id))
```

Also need to filter breach directions by what the layout allows:
```typescript
// Only offer doors that the layout supports
// (or pick layout after direction is chosen and filter layouts by direction)
```

The simpler approach: pick layout AFTER the breach direction is chosen (since the player chooses door direction first, then layout is selected). Check that the chosen direction is in `layout.allowedBreachDirections`. If not, re-roll.

**Step 3: Clear layout on room transition**

When transitioning away from battle (in result phase or wherever RunState is cleaned between rooms), clear:
```typescript
gameStore.dispatchRunState(run => setRoomLayout(run, null))
```

**Step 4: Verify compilation**

---

### Task 10: Validate breach direction against layout

**Files:**
- Modify: `src/phases/battle-phase.ts`

**Step 1: After loading layout in `enter()`, validate breach direction**

```typescript
// Validate breach direction against layout
if (this.currentLayout && !this.currentLayout.allowedBreachDirections.includes(this.breachDirection)) {
  // Fallback: pick first allowed direction
  this.breachDirection = this.currentLayout.allowedBreachDirections[0] ?? 'up'
}
```

**Step 2: Verify compilation**

---

## Execution Notes

**Testing:** After all tasks, verify visually at localhost:3003:
1. Room 1 (distance=1) should still be an empty room (no obstacles)
2. Room 2+ should show obstacles (stone pillars and/or wooden crates)
3. Enemies should navigate around obstacles via waypoints
4. Launched monsters should bounce off obstacles
5. Destructible crates should break when hit by monsters
6. Launch pads should be positioned per layout

**Key risk:** The obstacle-physics collider may conflict with existing ally-enemy collider. If units get stuck on obstacle corners, may need to add a small offset or rounded collision shape.
