# Phase 5a: Multi-Floor Progression Design

## Overview

Add floor progression to the dungeon. Players clear all rooms on a floor, find a staircase, and descend to a harder floor. Death resets to Floor 1 but preserves upgrades (Roguelite model).

## Core Loop Update

```
Kill enemies -> Collect gold -> Find altar -> Upgrade -> Clear all rooms -> Find staircase -> Next floor (harder)
                                                                                    |
                                                                             Death -> Floor 1 (keep upgrades, lose gold)
```

## Components

### 1. FloorManager (`src/systems/FloorManager.ts`)

Owns floor state and difficulty scaling. Created once per game session, persisted across floors.

```
FloorManager {
  currentFloor: number      // starts at 1
  highestFloor: number      // historical max (in-memory only, no localStorage)

  getFloorConfig() -> FloorConfig
  advanceFloor()            // floor++, highestFloor = max(highestFloor, floor)
  resetToFloor1()           // currentFloor = 1 (highestFloor unchanged)
}
```

#### FloorConfig (exact formulas)

```typescript
interface FloorConfig {
  roomCount: { min: number; max: number };
  roomSize: { min: number; max: number };
  enemiesPerRoom: { min: number; max: number };
  enemyHpScale: number;
  enemyAtkScale: number;
}
```

**Difficulty formulas:**

| Stat | Formula | Example Floor 5 |
|------|---------|-----------------|
| enemyHpScale | `1.0 + (floor - 1) * 0.15` | 1.60 |
| enemyAtkScale | `1.0 + (floor - 1) * 0.10` | 1.40 |
| roomCount.min | `clamp(BASE_MIN + floor(currentFloor / 3), 6, 14)` | 7 |
| roomCount.max | `clamp(BASE_MAX + floor(currentFloor / 3), 8, 16)` | 11 |
| roomSize.min | `BASE_SIZE_MIN` (no change) | 5 |
| roomSize.max | `clamp(BASE_SIZE_MAX + floor(currentFloor / 5), 10, 14)` | 11 |
| enemiesPerRoom.min | `clamp(BASE_ENEMY_MIN + floor(currentFloor / 4), 3, 8)` | 4 |
| enemiesPerRoom.max | `clamp(BASE_ENEMY_MAX + floor(currentFloor / 4), 6, 12)` | 7 |

Base values come from existing GAME_CONFIG. `floor()` = Math.floor. All clamped to prevent runaway growth.

### 2. RunState Ownership

Problem: GameScene currently creates StatsManager and Player in `create()`. Floor transitions must preserve player state without full scene restart.

**Solution: Scene restart with data passing.**

GameScene uses `this.scene.restart(runStateData)` for floor transitions. `init(data)` receives persisted state.

```typescript
interface RunState {
  // Persisted across floors:
  statsManagerState: { bonuses: StatBlock; levels: Record<string, number> };
  playerHp: number;
  playerMp: number;
  playerGold: number;
  playerMaterials: { wood: number; ore: number; cloth: number };
  floorManagerState: { currentFloor: number; highestFloor: number };

  // Reset on death:
  // gold -> 0, hp -> maxHp, mp -> maxMp
  // statsManagerState preserved
}
```

**GameScene lifecycle:**
- `init(data?)`: If data exists, restore RunState. If not, fresh game.
- `create()`: Build dungeon using FloorManager.getFloorConfig(), create Player with restored stats.
- Scene restart triggers full Phaser cleanup (display list, physics, tweens, timers) automatically.

**StatsManager changes:**
- Add `exportState()`: returns `{ bonuses, levels }`
- Add `importState(state)`: restores bonuses and levels

**Why scene restart over in-scene rebuild:** Phaser's `scene.restart()` handles cleanup of display objects, physics bodies, tweens, and timers automatically. Manual teardown is error-prone with the current EventBus singleton pattern.

**EventBus cleanup:** CombatSystem, Altar, and other systems bind listeners via `EventBus.on()` but never call `off()`. Add cleanup:
- GameScene `shutdown` event handler: remove only GameScene's own listeners (`joystick-move`, `joystick-stop`, `player-died`, `gameplay-lock`, `altar-consumed`, `floor-cleared`).
- Do NOT use `removeAllListeners()` — UIScene runs parallel and its listeners must survive GameScene restarts.

### 3. Staircase Entity (`src/entities/Staircase.ts`)

State machine: `HIDDEN -> REVEALED -> ACTIVATED`

| State | Condition | Visual |
|-------|-----------|--------|
| HIDDEN | Floor not cleared | Invisible, no physics body |
| REVEALED | All combat rooms CLEARED | Green down-arrow Graphics, depth 10 |
| ACTIVATED | Player within trigger range | Triggers floor transition |

**Placement rules:**
- Spawned at floor creation in a random room (not the ALTAR room, not the spawn room)
- Position: room center (`centerX * TILE_SIZE + TILE_SIZE / 2`)
- Trigger radius: `GAME_CONFIG.ALTAR_ACTIVATE_RANGE` (60px, same as Altar)
- No physics body needed (proximity check in update, same pattern as Altar)
- Render depth: 10 (above floor tiles, below player)
- **Fallback:** If only ALTAR + spawn rooms exist, allow staircase in spawn room

**Floor-cleared condition:**
All rooms where `room.state !== 'ALTAR'` must be `CLEARED`. ALTAR rooms are excluded from the clear check because they have no enemies.

Detection: GameScene already runs `checkRoomClearing()` in update. After transitioning a room to CLEARED, check if all non-ALTAR rooms are CLEARED. If so, emit `EventBus.emit('floor-cleared')`.

### 4. Floor Transition Flow

```
All non-ALTAR rooms CLEARED
  -> EventBus 'floor-cleared'
  -> Staircase: HIDDEN -> REVEALED (setVisible, add glow tween)
  -> Player walks to Staircase
  -> Distance < ALTAR_ACTIVATE_RANGE
  -> Staircase: REVEALED -> ACTIVATED
  -> Set gameplayLocked = true (see Input Lock below)
  -> Camera fade out (300ms, black)
  -> On fade complete:
    -> Build RunState from current Player + StatsManager + FloorManager
    -> FloorManager.advanceFloor()
    -> GameScene.scene.restart(runState)
  -> init(runState): restore state
  -> create(): build new dungeon, place player at spawn room
  -> Camera fade in (300ms)
  -> Set gameplayLocked = false after fade in complete
```

### 5. Death Flow

```
Player HP <= 0
  -> EventBus 'player-died'
  -> Set gameplayLocked = true
  -> Player: red tint + shrink tween (200ms)
  -> UIScene: show "You Died - Floor X" centered text (white, 24px)
  -> Wait 1500ms
  -> Build RunState:
    -> statsManagerState: preserved (keep upgrades)
    -> playerHp: StatsManager.getStat('maxHp')  (full heal)
    -> playerMp: GAME_CONFIG.PLAYER_MP           (full heal)
    -> playerGold: 0                              (reset)
    -> playerMaterials: { wood: 0, ore: 0, cloth: 0 }  (reset)
    -> floorManagerState: { currentFloor: 1, highestFloor: kept }
  -> GameScene.scene.restart(runState)
  -> UIScene: destroy death text on 'scene-ready' event
```

**Replaces existing death flow:** Remove current `show-death-screen` EventBus event and UIScene death overlay with Restart button. The new auto-restart flow is the only death path.

### 6. Input Lock (Comprehensive)

When `gameplayLocked = true` (set during fade transitions and death):

| System | Locked behavior |
|--------|----------------|
| Player movement | `update()` early return (existing) |
| Physics | `this.physics.world.pause()` (existing) |
| Joystick | `EventBus.emit('gameplay-lock')` disables input (existing) |
| CombatSystem | Skip attack scan when `gameplayLocked` (existing) |
| Altar interaction | Altar.update() checks `scene.gameplayLocked` early return (existing) |
| Staircase | Staircase.update() checks `scene.gameplayLocked` early return (**new**) |
| UpgradePanel | Already blocked by gameplayLocked (**existing**) |
| Debug API | Debug commands still work during lock (intentional for QA) |
| HUD | Continues updating (intentional, shows final state) |

Existing `gameplayLocked` + `gameplay-lock` event already covers most cases. Only Staircase needs the new check.

### 7. DungeonGenerator Changes

Current signature: `generate()` reads GAME_CONFIG directly.

New signature:
```typescript
export function generate(config?: Partial<FloorConfig>): { grid, rooms, corridors }
```

If config provided, use `config.roomCount` and `config.roomSize` instead of GAME_CONFIG defaults. Fallback to GAME_CONFIG if not provided (backwards compatible).

### 8. Enemy Changes

Current: `spawnEnemiesInRoom()` creates enemies with `GAME_CONFIG.SPIDER_HP` / `SPIDER_ATTACK`.

New: Accept scaling parameters.
```typescript
spawnEnemiesInRoom(roomIndex: number, hpScale = 1, atkScale = 1, countOverride?: { min: number; max: number }): void
```

Enemy construction:
```typescript
const hp = Math.round(GAME_CONFIG.SPIDER_HP * hpScale);
const attack = Math.round(GAME_CONFIG.SPIDER_ATTACK * atkScale);
```

### 9. HUD Changes

Add floor display text: `Floor X` at top-left (above HP bar). White, 13px monospace. Updated from FloorManager on scene create and floor transitions.

HUD currently has `HP_BAR_Y = 26` with comment "below floor label" — this Y offset already accounts for a floor label. Add the floor text at Y=8.

### 10. DebugManager Updates

**GameState.dungeon.floor:** Read from `this.scene.floorManager.currentFloor` (currently hardcoded to 1).

**New debug commands:**

`__debug.setFloor(n: number)`:
- Clamp n to >= 1
- Build RunState from current player state
- Set floorManagerState.currentFloor = n
- Update highestFloor = max(highestFloor, n)
- Trigger GameScene.scene.restart(runState)
- Player HP/MP/gold preserved (not a death)

`__debug.revealStaircase()`:
- Force Staircase to REVEALED state regardless of room clear status
- For testing staircase interaction without clearing all rooms

**GameState interface additions:**
```typescript
player: {
  // ... existing fields ...
  armor: number;        // already added in P3 fix
  recovery: number;     // already added in P3 fix
  critDamage: number;   // already added in P3 fix
  moveSpeed: number;    // already added in P3 fix
};
dungeon: {
  floor: number;        // from FloorManager (was hardcoded 1)
  highestFloor: number; // from FloorManager
  // ... existing fields ...
};
```

## Acceptance Criteria

| AC | Description | Verification |
|----|-------------|-------------|
| AC1 | Staircase appears in random non-ALTAR, non-spawn room when all combat rooms cleared | Debug: killAllEnemies per room, verify staircase visible |
| AC2 | Walking to staircase triggers fade transition to next floor | Visual: fade out/in, new dungeon layout |
| AC3 | Next floor enemies have scaled HP/ATK per formula | Debug: getStateSnapshot on floor 3, verify enemy HP ~= base*1.3 |
| AC4 | Room count/size varies per floor (random wave) | Play 5 floors, observe variation |
| AC5 | HUD shows "Floor X" updated on each transition | Visual check |
| AC6 | HP/MP/gold/upgrades preserved across floors (not healed) | Debug: take damage on F1, verify same HP on F2 |
| AC7 | Death: back to Floor 1, HP/MP full, gold=0, upgrades kept | Debug: die on F3, verify upgrades intact, gold=0 |
| AC8 | DebugManager: floor in snapshot, setFloor(n), revealStaircase() | Console: __debug.setFloor(3), verify floor 3 dungeon |
| AC9 | Altar spawns and works normally on each floor | Use altar on F2+, verify upgrade applies |
| AC10 | No memory leak across 10 floor transitions | Monitor object count in debug snapshot |
| AC11 | Input fully locked during transitions (no movement/attack/altar) | Try joystick during fade, verify no response |
| AC12 | Old death overlay removed, new auto-restart death flow works | Die and verify no Restart button, auto returns to F1 |

## Files Modified

| File | Change |
|------|--------|
| `src/systems/FloorManager.ts` | **NEW** — floor state + difficulty scaling |
| `src/entities/Staircase.ts` | **NEW** — staircase entity with state machine |
| `src/systems/StatsManager.ts` | Add exportState() / importState() |
| `src/systems/DungeonGenerator.ts` | Accept FloorConfig parameter |
| `src/scenes/GameScene.ts` | init/create RunState flow, floor-cleared detection, EventBus cleanup, staircase management |
| `src/scenes/UIScene.ts` | New death text, remove old death overlay |
| `src/entities/Enemy.ts` | Accept hpScale/atkScale in constructor |
| `src/ui/HUD.ts` | Add floor label |
| `src/debug/DebugManager.ts` | setFloor, revealStaircase, floor in snapshot |
| `src/config.ts` | No changes needed (FloorManager computes from existing constants) |

## Risk Areas

1. **EventBus cleanup on scene restart** — Must call `EventBus.removeAllListeners()` in GameScene shutdown handler. Test by checking listener count after 5 transitions.
2. **RunState serialization** — Phaser scene restart passes data as plain object, so no class instances. StatsManager export/import must use plain objects.
3. **UIScene independence** — UIScene runs parallel to GameScene. It must handle GameScene restarts gracefully (re-acquire GameScene reference on 'scene-ready' event).
