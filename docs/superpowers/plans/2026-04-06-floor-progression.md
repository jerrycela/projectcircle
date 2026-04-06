# Floor Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-floor dungeon progression with difficulty scaling, staircase transition, and Roguelite death mechanics.

**Architecture:** Scene restart with RunState data passing. FloorManager owns floor/difficulty state. Staircase entity triggers transitions. EventBus cleaned up on shutdown. Old death overlay replaced with auto-restart flow.

**Tech Stack:** Phaser 3, Arcade Physics, TypeScript, Vite

**Spec:** `openspec/004-floor-progression.md` / `docs/superpowers/specs/2026-04-06-floor-progression-design.md`

---

## Wave 1: Foundation (parallel — no dependencies between tasks)

Three independent systems that don't touch each other's files.

### Task 1: FloorManager

**Files:**
- Create: `src/systems/FloorManager.ts`

- [ ] **Step 1: Create FloorManager**

```typescript
// src/systems/FloorManager.ts
import { GAME_CONFIG } from '../config';

export interface FloorConfig {
  roomCount: { min: number; max: number };
  roomSize: { min: number; max: number };
  enemiesPerRoom: { min: number; max: number };
  enemyHpScale: number;
  enemyAtkScale: number;
}

export interface FloorState {
  currentFloor: number;
  highestFloor: number;
}

export class FloorManager {
  public currentFloor: number;
  public highestFloor: number;

  constructor(state?: FloorState) {
    this.currentFloor = state?.currentFloor ?? 1;
    this.highestFloor = state?.highestFloor ?? 1;
  }

  getFloorConfig(): FloorConfig {
    const f = this.currentFloor;
    return {
      roomCount: {
        min: Math.min(GAME_CONFIG.ROOM_COUNT.min + Math.floor(f / 3), 14),
        max: Math.min(GAME_CONFIG.ROOM_COUNT.max + Math.floor(f / 3), 16),
      },
      roomSize: {
        min: GAME_CONFIG.ROOM_SIZE.min,
        max: Math.min(GAME_CONFIG.ROOM_SIZE.max + Math.floor(f / 5), 14),
      },
      enemiesPerRoom: {
        min: Math.min(GAME_CONFIG.ENEMIES_PER_ROOM.min + Math.floor(f / 4), 8),
        max: Math.min(GAME_CONFIG.ENEMIES_PER_ROOM.max + Math.floor(f / 4), 12),
      },
      enemyHpScale: 1.0 + (f - 1) * 0.15,
      enemyAtkScale: 1.0 + (f - 1) * 0.10,
    };
  }

  advanceFloor(): void {
    this.currentFloor++;
    this.highestFloor = Math.max(this.highestFloor, this.currentFloor);
  }

  resetToFloor1(): void {
    this.currentFloor = 1;
  }

  exportState(): FloorState {
    return { currentFloor: this.currentFloor, highestFloor: this.highestFloor };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors (FloorManager is standalone, no imports depend on it yet)

- [ ] **Step 3: Commit**

```bash
git add src/systems/FloorManager.ts
git commit -m "feat: add FloorManager with difficulty scaling formulas"
```

---

### Task 2: StatsManager export/import

**Files:**
- Modify: `src/systems/StatsManager.ts`

- [ ] **Step 1: Add exportState and importState to StatsManager**

After the existing `incrementLevel` method, add:

```typescript
  exportState(): { bonuses: StatBlock; levels: Record<string, number> } {
    return {
      bonuses: { ...this.bonuses },
      levels: { ...this.levels },
    };
  }

  importState(state: { bonuses: StatBlock; levels: Record<string, number> }): void {
    this.bonuses = { ...state.bonuses };
    this.levels = { ...state.levels };
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/systems/StatsManager.ts
git commit -m "feat: add StatsManager export/import for cross-floor persistence"
```

---

### Task 3: Staircase entity + BootScene texture

**Files:**
- Create: `src/entities/Staircase.ts`
- Modify: `src/scenes/BootScene.ts`

- [ ] **Step 1: Add staircase texture to BootScene**

In `BootScene.generateTextures()`, after the altar texture block (line ~121), add:

```typescript
    // staircase: 48x48 green down-arrow
    const staircase = this.make.graphics({ x: 0, y: 0 }, false);
    staircase.fillStyle(0x00ff66);
    staircase.fillTriangle(24, 38, 10, 18, 38, 18); // down arrow head
    staircase.fillRect(18, 6, 12, 16); // arrow shaft
    staircase.generateTexture('staircase', 48, 48);
    staircase.destroy();
```

- [ ] **Step 2: Create Staircase entity**

```typescript
// src/entities/Staircase.ts
import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import type { Player } from './Player';
import type { GameScene } from '../scenes/GameScene';

type StaircaseState = 'HIDDEN' | 'REVEALED' | 'ACTIVATED';

export class Staircase extends Phaser.GameObjects.Image {
  private staircaseState: StaircaseState = 'HIDDEN';
  private playerRef: Player;

  constructor(scene: Phaser.Scene, x: number, y: number, player: Player) {
    super(scene, x, y, 'staircase');
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
    this.setDepth(10);
    this.playerRef = player;
    this.setVisible(false);
  }

  reveal(): void {
    if (this.staircaseState !== 'HIDDEN') return;
    this.staircaseState = 'REVEALED';
    this.setVisible(true);

    // Glow pulse tween
    this.scene.tweens.add({
      targets: this,
      alpha: { from: 0.6, to: 1.0 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    console.log('[Staircase] Revealed');
  }

  update(): void {
    if (this.staircaseState !== 'REVEALED') return;
    if ((this.scene as GameScene).gameplayLocked) return;

    const dx = this.playerRef.x - this.x;
    const dy = this.playerRef.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < GAME_CONFIG.ALTAR_ACTIVATE_RANGE) {
      // Player must be stopped
      const body = this.playerRef.body as Phaser.Physics.Arcade.Body;
      const velMag = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
      if (velMag < 5) {
        this.staircaseState = 'ACTIVATED';
        console.log('[Staircase] Activated — triggering floor transition');
        (this.scene as GameScene).triggerFloorTransition();
      }
    }
  }

  getState(): StaircaseState {
    return this.staircaseState;
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Error about `triggerFloorTransition` not existing on GameScene — this is expected, will be added in Wave 2.

- [ ] **Step 4: Commit**

```bash
git add src/entities/Staircase.ts src/scenes/BootScene.ts
git commit -m "feat: add Staircase entity and texture"
```

---

## Wave 2: Core Integration (sequential — GameScene is the hub)

### Task 4: DungeonGenerator accepts FloorConfig

**Files:**
- Modify: `src/systems/DungeonGenerator.ts`

- [ ] **Step 1: Update generate() signature**

Change `tryGenerate` to accept config params, and update `generate()`:

Replace the `tryGenerate` function signature (line 114):
```typescript
function tryGenerate(roomCount: number, roomSizeMin?: number, roomSizeMax?: number): DungeonData | null {
```

Inside `tryGenerate`, replace lines 115-118:
```typescript
  const width = GAME_CONFIG.MAP_WIDTH;
  const height = GAME_CONFIG.MAP_HEIGHT;
  const roomMin = roomSizeMin ?? GAME_CONFIG.ROOM_SIZE.min;
  const roomMax = roomSizeMax ?? GAME_CONFIG.ROOM_SIZE.max;
```

Replace the `generate()` export (line 199) with:
```typescript
export interface GenerateOptions {
  roomCount?: { min: number; max: number };
  roomSize?: { min: number; max: number };
}

export function generate(options?: GenerateOptions): DungeonData {
  const minRoomCount = options?.roomCount?.min ?? GAME_CONFIG.ROOM_COUNT.min;
  const maxRoomCount = options?.roomCount?.max ?? GAME_CONFIG.ROOM_COUNT.max;
  const roomSizeMin = options?.roomSize?.min;
  const roomSizeMax = options?.roomSize?.max;

  for (let roomCount = maxRoomCount; roomCount >= minRoomCount; roomCount--) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = tryGenerate(roomCount, roomSizeMin, roomSizeMax);
      if (result !== null) {
        console.log(`[DungeonGenerator] Generated dungeon with ${result.rooms.length} rooms (target: ${roomCount})`);
        assignAltarRoom(result.rooms);
        return result;
      }
    }
  }

  // Absolute fallback: single room in center
  console.warn('[DungeonGenerator] All retries exhausted, using fallback single room');
  const grid = initGrid(GAME_CONFIG.MAP_WIDTH, GAME_CONFIG.MAP_HEIGHT);
  const fallbackRoom: Room = {
    x: 20, y: 20, width: 10, height: 10,
    centerX: 25, centerY: 25,
    state: RoomState.UNVISITED,
  };
  carveRoom(grid, fallbackRoom);
  return { grid, rooms: [fallbackRoom] };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (generate() is backwards compatible — no args = old behavior)

- [ ] **Step 3: Commit**

```bash
git add src/systems/DungeonGenerator.ts
git commit -m "feat: DungeonGenerator accepts optional FloorConfig params"
```

---

### Task 5: Enemy accepts scaling params

**Files:**
- Modify: `src/entities/Enemy.ts`

- [ ] **Step 1: Add hpScale and atkScale to Enemy constructor**

Change the constructor signature (line 33):
```typescript
  constructor(scene: Phaser.Scene, x: number, y: number, roomIndex: number, hpScale = 1, atkScale = 1) {
```

Replace lines 37-38:
```typescript
    this.hp = Math.round(GAME_CONFIG.SPIDER_HP * hpScale);
    this.maxHp = Math.round(GAME_CONFIG.SPIDER_HP * hpScale);
```

Replace line 40:
```typescript
    this.attackDamage = Math.round(GAME_CONFIG.SPIDER_ATTACK * atkScale);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (default params = backwards compatible)

- [ ] **Step 3: Commit**

```bash
git add src/entities/Enemy.ts
git commit -m "feat: Enemy constructor accepts hpScale/atkScale"
```

---

### Task 6: RunState + GameScene floor transition

This is the largest task — wires everything together.

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add RunState interface and imports**

At the top of GameScene.ts, add import:
```typescript
import { FloorManager } from '../systems/FloorManager';
import type { FloorConfig, FloorState } from '../systems/FloorManager';
import type { StatBlock } from '../systems/StatsManager';
import { Staircase } from '../entities/Staircase';
```

After the imports, before the class, add:
```typescript
export interface RunState {
  statsManagerState: { bonuses: StatBlock; levels: Record<string, number> };
  playerHp: number;
  playerMp: number;
  playerGold: number;
  playerMaterials: { wood: number; ore: number; cloth: number };
  floorManagerState: FloorState;
}
```

- [ ] **Step 2: Add FloorManager and Staircase to GameScene fields**

Add to the class fields (after `private altar?: Altar;`):
```typescript
  public floorManager!: FloorManager;
  private staircase?: Staircase;
  private runState?: RunState;
```

- [ ] **Step 3: Add init() method for RunState restoration**

Add before `create()`:
```typescript
  init(data?: RunState): void {
    this.runState = data;
  }
```

- [ ] **Step 4: Modify create() to use RunState and FloorManager**

Replace the beginning of `create()` (lines 50-93). The new version:

```typescript
  create(): void {
    console.log('GameScene started');

    // Restore or create FloorManager
    this.floorManager = new FloorManager(this.runState?.floorManagerState);

    // Restore or create StatsManager
    this.statsManager = new StatsManager();
    if (this.runState?.statsManagerState) {
      this.statsManager.importState(this.runState.statsManagerState);
    }

    // Generate dungeon with floor-scaled config
    const floorConfig = this.floorManager.getFloorConfig();
    const { grid, rooms } = generate({
      roomCount: floorConfig.roomCount,
      roomSize: floorConfig.roomSize,
    });
    this.grid = grid;
    this.rooms = rooms;

    const tileSize = GAME_CONFIG.TILE_SIZE;
    const mapPixelWidth = GAME_CONFIG.MAP_WIDTH * tileSize;
    const mapPixelHeight = GAME_CONFIG.MAP_HEIGHT * tileSize;

    // Create groups — floors first so they render under walls
    const floorGroup = this.add.group();
    this.wallGroup = this.physics.add.staticGroup();

    for (let gy = 0; gy < GAME_CONFIG.MAP_HEIGHT; gy++) {
      for (let gx = 0; gx < GAME_CONFIG.MAP_WIDTH; gx++) {
        const worldX = gx * tileSize;
        const worldY = gy * tileSize;

        if (grid[gy][gx] === 0) {
          const tile = this.add.image(worldX, worldY, 'floor-tile');
          tile.setOrigin(0, 0);
          floorGroup.add(tile);
        } else {
          const tile = this.wallGroup.create(worldX, worldY, 'wall-tile') as Phaser.Physics.Arcade.Image;
          tile.setOrigin(0, 0);
          tile.refreshBody();
        }
      }
    }

    this.physics.world.setBounds(0, 0, mapPixelWidth, mapPixelHeight);
    this.cameras.main.setBounds(0, 0, mapPixelWidth, mapPixelHeight);
    this.cameras.main.setBackgroundColor('#000000');

    // Spawn player at center of first room
    const firstRoom = rooms[0];
    const spawnX = firstRoom.centerX * tileSize + tileSize / 2;
    const spawnY = firstRoom.centerY * tileSize + tileSize / 2;
    this.player = new Player(this, spawnX, spawnY, this.statsManager);

    // Restore player state from RunState
    if (this.runState) {
      this.player.hp = this.runState.playerHp;
      this.player.mp = this.runState.playerMp;
      this.player.gold = this.runState.playerGold;
      this.player.materials = { ...this.runState.playerMaterials };
      // Update maxHp from stats (may have bonus)
      this.player.maxHp = this.statsManager.getStat('maxHp');
    }
```

The rest of `create()` from `this.physics.add.collider(this.player, this.wallGroup)` onward stays the same, EXCEPT:

- [ ] **Step 5: Replace spawnEnemiesInRoom call with scaled version**

In `create()`, replace line 132 (`this.spawnEnemiesInRoom(0);`):
```typescript
    this.spawnEnemiesInRoom(0, floorConfig.enemyHpScale, floorConfig.enemyAtkScale, floorConfig.enemiesPerRoom);
```

- [ ] **Step 6: Add Staircase creation after altar spawn**

After the altar spawn block (after `this.altar = new Altar(...)`), add:
```typescript
    // Spawn staircase (hidden until all rooms cleared)
    const staircaseRoom = this.pickStaircaseRoom();
    if (staircaseRoom !== null) {
      const room = this.rooms[staircaseRoom];
      const sx = room.centerX * tileSize + tileSize / 2;
      const sy = room.centerY * tileSize + tileSize / 2;
      this.staircase = new Staircase(this, sx, sy, this.player);
    }
```

Add the helper method to the class:
```typescript
  private pickStaircaseRoom(): number | null {
    // Prefer non-ALTAR, non-spawn (index 0) rooms
    const candidates = this.rooms
      .map((r, i) => ({ room: r, index: i }))
      .filter(({ room, index }) => index > 0 && room.state !== RoomState.ALTAR);

    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)].index;
    }

    // Fallback: allow spawn room if only ALTAR + spawn exist
    if (this.rooms.length > 0) {
      return 0;
    }

    return null;
  }
```

- [ ] **Step 7: Update spawnEnemiesInRoom to accept scaling**

Replace the `spawnEnemiesInRoom` method signature (line 275):
```typescript
  spawnEnemiesInRoom(roomIndex: number, hpScale = 1, atkScale = 1, countOverride?: { min: number; max: number }): void {
```

Replace the count calculation (lines 281-284):
```typescript
    const countRange = countOverride ?? GAME_CONFIG.ENEMIES_PER_ROOM;
    const count = Phaser.Math.Between(countRange.min, countRange.max);
```

Replace the enemy creation line (line 318):
```typescript
        const enemy = new Enemy(this, wx, wy, roomIndex, hpScale, atkScale);
```

- [ ] **Step 8: Update detectPlayerRoom to pass floor scaling on first visit**

In `detectPlayerRoom()`, replace the spawn block (lines 236-238):
```typescript
          if (room.state === RoomState.UNVISITED) {
            room.state = RoomState.ACTIVE;
            const fc = this.floorManager.getFloorConfig();
            this.spawnEnemiesInRoom(i, fc.enemyHpScale, fc.enemyAtkScale, fc.enemiesPerRoom);
          }
```

- [ ] **Step 9: Add floor-cleared detection to checkRoomClearing**

At the end of `checkRoomClearing()`, after the for loop closes, add:
```typescript
    // Check if all combat rooms are cleared (excluding ALTAR rooms)
    const allCleared = this.rooms.every(
      r => r.state === RoomState.CLEARED || r.state === RoomState.ALTAR || r.state === RoomState.UNVISITED === false
    );
    // More precise: all non-ALTAR rooms that have been visited must be CLEARED
    const combatRooms = this.rooms.filter(r => r.state !== RoomState.ALTAR);
    const allCombatCleared = combatRooms.length > 0 && combatRooms.every(r => r.state === RoomState.CLEARED);
    if (allCombatCleared && this.staircase?.getState() === 'HIDDEN') {
      EventBus.emit('floor-cleared');
      this.staircase.reveal();
    }
```

Remove the first `allCleared` block (the imprecise one) — only keep the `combatRooms` block.

- [ ] **Step 10: Add staircase update to update loop**

In `update()`, after `this.altar?.update(time, delta);` (line 216), add:
```typescript
    this.staircase?.update();
```

- [ ] **Step 11: Add triggerFloorTransition method**

Add to the class:
```typescript
  triggerFloorTransition(): void {
    this.gameplayLocked = true;
    this.physics.pause();
    EventBus.emit('gameplay-lock', true);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const runState: RunState = {
        statsManagerState: this.statsManager.exportState(),
        playerHp: this.player.hp,
        playerMp: this.player.mp,
        playerGold: this.player.gold,
        playerMaterials: { ...this.player.materials },
        floorManagerState: (() => {
          this.floorManager.advanceFloor();
          return this.floorManager.exportState();
        })(),
      };
      this.scene.restart(runState);
    });
  }
```

- [ ] **Step 12: Add triggerDeath method**

Add to the class:
```typescript
  triggerDeath(): void {
    this.gameplayLocked = true;
    this.physics.pause();
    EventBus.emit('gameplay-lock', true);
    EventBus.emit('show-death-text', this.floorManager.currentFloor);

    this.time.delayedCall(1500, () => {
      const runState: RunState = {
        statsManagerState: this.statsManager.exportState(),
        playerHp: this.statsManager.getStat('maxHp'),
        playerMp: GAME_CONFIG.PLAYER_MP,
        playerGold: 0,
        playerMaterials: { wood: 0, ore: 0, cloth: 0 },
        floorManagerState: {
          currentFloor: 1,
          highestFloor: this.floorManager.highestFloor,
        },
      };
      this.scene.restart(runState);
    });
  }
```

- [ ] **Step 13: Update player-died handler**

Replace the `player-died` EventBus handler in `create()`:
```typescript
    EventBus.on('player-died', () => {
      this.combatSystem.onPlayerDied();
      this.triggerDeath();
    });
```

- [ ] **Step 14: Add fade-in on create and emit scene-ready**

At the very end of `create()`, before the debug manager block, add:
```typescript
    // Fade in on floor entry
    if (this.runState) {
      this.cameras.main.fadeIn(300, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this.gameplayLocked = false;
        this.physics.resume();
        EventBus.emit('gameplay-lock', false);
      });
      // Keep locked during fade
      this.gameplayLocked = true;
      this.physics.pause();
    }

    EventBus.emit('scene-ready');
```

- [ ] **Step 15: Update onShutdown to clean GameScene's own EventBus listeners**

Replace `onShutdown()`:
```typescript
  private onShutdown(): void {
    this.combatSystem?.destroy();
    this.lootSystem?.destroy();
    // Only remove listeners that GameScene registered
    // Do NOT use removeAllListeners() — it would kill UIScene's listeners too
    EventBus.off('joystick-move');
    EventBus.off('joystick-stop');
    EventBus.off('player-died');
    EventBus.off('gameplay-lock');
    EventBus.off('altar-consumed');
    EventBus.off('floor-cleared');
  }
```

- [ ] **Step 16: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 17: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: wire floor transitions, RunState persistence, and death restart"
```

---

## Wave 3: UI + Death (parallel — UIScene and HUD are independent of each other)

### Task 7: HUD floor label

**Files:**
- Modify: `src/ui/HUD.ts`

- [ ] **Step 1: Update floor label to read FloorManager**

In `HUD.update()`, after `const p = gameScene.player;` (line 101), add:
```typescript
    // Update floor label
    const floor = gameScene.floorManager?.currentFloor ?? 1;
    this.floorText.setText(`Floor ${floor}`);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/HUD.ts
git commit -m "feat: HUD displays dynamic floor number"
```

---

### Task 8: UIScene death flow replacement

**Files:**
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Replace death overlay with death text**

Remove the `showDeathScreen()` method entirely (lines 40-93).
Remove the `restartGame()` method entirely (lines 95-106).
Remove the `deathOverlay` field (line 12).

Remove the `show-death-screen` EventBus listener in `create()`.

Add a new field:
```typescript
  private deathText?: Phaser.GameObjects.Text;
```

Add new EventBus listeners in `create()`:
```typescript
    EventBus.on('show-death-text', (floor: number) => {
      this.showDeathText(floor);
    });

    EventBus.on('scene-ready', () => {
      this.destroyDeathText();
    });
```

Add the new methods:
```typescript
  private showDeathText(floor: number): void {
    if (this.deathText) return;

    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;

    this.deathText = this.add.text(cx, cy, `You Died - Floor ${floor}`, {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.deathText.setOrigin(0.5, 0.5);
    this.deathText.setDepth(200);
  }

  private destroyDeathText(): void {
    if (this.deathText) {
      this.deathText.destroy();
      this.deathText = undefined;
    }
  }
```

- [ ] **Step 2: Simplify UIScene create()**

GameScene's `onShutdown` only removes its own listeners (not UIScene's). So UIScene listeners survive across GameScene restarts. No complex rebind needed.

Replace the entire `create()` method:
```typescript
  create(): void {
    console.log('UIScene started');
    this.joystick = new Joystick(this);
    this.hud = new HUD(this);
    this.upgradePanel = new UpgradePanel(this);

    EventBus.on('altar-activated', () => {
      const gameScene = this.scene.get('GameScene') as GameScene;
      if (gameScene?.statsManager && gameScene?.player) {
        this.upgradePanel.show(gameScene.statsManager, gameScene.player);
      }
    });

    EventBus.on('show-death-text', (floor: number) => {
      this.showDeathText(floor);
    });

    EventBus.on('scene-ready', () => {
      this.destroyDeathText();
    });
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/scenes/UIScene.ts
git commit -m "feat: replace death overlay with auto-restart death text"
```

---

## Wave 4: Debug + Polish (parallel)

### Task 9: DebugManager updates

**Files:**
- Modify: `src/debug/DebugManager.ts`

- [ ] **Step 1: Update GameState interface**

Add to `dungeon` in the GameState interface:
```typescript
    highestFloor: number;
```

- [ ] **Step 2: Update buildStateSnapshot**

Replace the `dungeon.floor` line:
```typescript
        floor: this.scene.floorManager?.currentFloor ?? 1,
        highestFloor: this.scene.floorManager?.highestFloor ?? 1,
```

- [ ] **Step 3: Add setFloor and revealStaircase to debug API**

In `setupDebugAPI()`, add after `getStateSnapshot`:
```typescript
      setFloor: (n: number) => {
        const floor = Math.max(1, n);
        // Build RunState preserving current player state
        const player = this.scene.player;
        if (!player) { console.log('[Debug] setFloor: player not ready'); return; }
        const runState = {
          statsManagerState: this.scene.statsManager.exportState(),
          playerHp: player.hp,
          playerMp: player.mp,
          playerGold: player.gold,
          playerMaterials: { ...player.materials },
          floorManagerState: {
            currentFloor: floor,
            highestFloor: Math.max(this.scene.floorManager.highestFloor, floor),
          },
        };
        console.log(`[Debug] setFloor: jumping to floor ${floor}`);
        this.scene.scene.restart(runState);
      },
      revealStaircase: () => {
        const staircase = (this.scene as any).staircase;
        if (!staircase) { console.log('[Debug] revealStaircase: no staircase found'); return; }
        staircase.reveal();
        console.log('[Debug] revealStaircase: forced reveal');
      },
```

- [ ] **Step 4: Add setFloor and revealStaircase to DebugAPI interface**

```typescript
  setFloor(n: number): void;
  revealStaircase(): void;
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/debug/DebugManager.ts
git commit -m "feat: DebugManager floor display, setFloor, revealStaircase"
```

---

### Task 10: CombatSystem death cleanup

**Files:**
- Modify: `src/systems/CombatSystem.ts`

- [ ] **Step 1: Remove show-death-screen emit from onPlayerDied**

`CombatSystem.onPlayerDied()` currently emits `show-death-screen`. GameScene now handles death via `triggerDeath()`. Remove the emit:

Replace `onPlayerDied()` (line 239):
```typescript
  onPlayerDied(): void {
    // Physics pause is handled by GameScene.triggerDeath()
    // Death screen is handled by GameScene emitting 'show-death-text'
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/systems/CombatSystem.ts
git commit -m "refactor: remove show-death-screen from CombatSystem (handled by GameScene)"
```

---

## Wave 5: Build + QA

### Task 11: Full build verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Vite build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit all uncommitted changes**

```bash
git add -A
git commit -m "chore: build verification for floor progression"
```

### Task 12: QA Loop

- [ ] **Step 1: Deploy to preview**

Run: `npx vite build && npx gh-pages -d dist`

- [ ] **Step 2: Run QA with debug API**

Use `?debug=1` and verify all 12 AC:
- AC1: `__debug.killAllEnemies()` per room, verify staircase appears
- AC2: Walk to staircase, verify fade transition
- AC3: Check enemy HP on floor 3 via snapshot
- AC4: Play 3+ floors, observe room count variation
- AC5: HUD shows "Floor X"
- AC6: Take damage on F1, verify same HP on F2
- AC7: Die on F3, verify upgrades intact + gold=0
- AC8: `__debug.setFloor(3)`, `__debug.revealStaircase()`
- AC9: Use altar on F2+
- AC10: Monitor snapshot body count across 5 transitions
- AC11: Try joystick during fade
- AC12: Die and verify no Restart button

---

## Parallel Execution Map

```
Wave 1 (parallel):  [Task 1: FloorManager] [Task 2: StatsManager] [Task 3: Staircase+Texture]
                              |                      |                       |
Wave 2 (sequential): [Task 4: DungeonGen] -> [Task 5: Enemy] -> [Task 6: GameScene Integration]
                                                                            |
Wave 3 (parallel):                        [Task 7: HUD] [Task 8: UIScene Death]
                                                |              |
Wave 4 (parallel):              [Task 9: DebugManager] [Task 10: CombatSystem]
                                          |                    |
Wave 5 (sequential):                [Task 11: Build] -> [Task 12: QA]
```

**Wave 1** tasks touch completely separate files — safe to run 3 agents in parallel.
**Wave 2** is sequential because Task 6 depends on Tasks 4 and 5 being done.
**Wave 3** tasks touch separate files (HUD.ts vs UIScene.ts) — safe to run 2 agents in parallel.
**Wave 4** tasks touch separate files — safe to run 2 agents in parallel.
**Wave 5** must be sequential (build then QA).
