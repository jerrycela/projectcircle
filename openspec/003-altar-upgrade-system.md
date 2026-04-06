# Phase 4: Altar Upgrade System Design

## Overview

Add an altar room to each dungeon floor where the player spends gold to choose 1 of 3 upgrade options. Combines the exploration feel of altar-based upgrades with the "pick one" satisfaction of card selection.

## Core Loop Addition

```
Kill enemies → Collect gold → Find altar room → Choose 1 of 3 upgrades → Get stronger → Next room
```

## Components

### 1. StatsManager (new: `src/systems/StatsManager.ts`)

Centralized player stat management. Owned by GameScene, injected into Player on creation. New instance created on each game restart (no global singleton).

```
StatsManager {
  baseStats: { attackMin, attackMax, armor, critChance, critDamage, recovery, moveSpeed, maxHp }
  bonuses:   { attackMin, attackMax, armor, critChance, critDamage, recovery, moveSpeed, maxHp }
  levels:    { attack, armor, critDamage, recovery, moveSpeed, maxHp }  // track upgrade levels per type

  getStat(key) → base + bonus
  addBonus(key, amount)
  getLevel(upgradeType) → current level
  incrementLevel(upgradeType)
}
```

- GameScene creates StatsManager in `create()`, passes to Player and CombatSystem
- Player reads `maxHp`, `moveSpeed` from StatsManager
- CombatSystem reads `attackMin`, `attackMax`, `critChance`, `critDamage` from StatsManager
- Attack bonus is a flat offset applied to both min and max: `damage = Phaser.Math.Between(getStat('attackMin'), getStat('attackMax'))`
- On game restart: new GameScene creates new StatsManager (fresh state)

### 2. Altar Entity (new: `src/entities/Altar.ts`)

A static game object placed in one room per floor.

- Visual: white bordered circle (placeholder), 48x48
- Placed at center of a designated "altar room"

**State machine:**
```
IDLE → IN_RANGE → ARMING(500ms) → OPEN → CONSUMED
```

| Transition | Condition |
|------------|-----------|
| IDLE → IN_RANGE | player distance < 60px |
| IN_RANGE → IDLE | player distance >= 60px |
| IN_RANGE → ARMING | player velocity magnitude < 5 (effectively stopped) |
| ARMING → IN_RANGE | player velocity magnitude >= 5 OR player distance >= 60px |
| ARMING → OPEN | 500ms timer completes |
| OPEN → CONSUMED | panel closes (upgrade selected or skipped) |

- IN_RANGE: show "Upgrade" prompt text above altar
- ARMING: prompt text pulses (alpha oscillation)
- OPEN: emit `'altar-activated'` event, physics pauses
- CONSUMED: altar alpha 0.3, no further interaction

### 3. Altar Room in Dungeon Generator

Modify `DungeonGenerator.generate()`:
- After placing rooms, pick one non-spawn room (index > 0) and set initial state to `ALTAR`
- **Fallback**: if total rooms < 3, skip altar placement entirely (no altar this floor)
- ALTAR rooms are excluded from enemy spawning

New room state: `RoomState.ALTAR`

**Cross-system contract for ALTAR state:**
- `GameScene.detectPlayerRoom()`: entering ALTAR room does NOT change state to ACTIVE, no enemy spawn
- `GameScene.checkRoomClearing()`: ALTAR rooms are skipped (never participate in cleared check)
- `GameScene.spawnEnemiesInRoom()`: early return if room state is ALTAR
- `Enemy.updateAI()`: enemies never bind to or chase into ALTAR room index

### 4. Upgrade Panel (new: `src/ui/UpgradePanel.ts`, rendered in UIScene)

Full-screen overlay triggered when altar emits `'altar-activated'`.

**Layout (portrait 450x800):**
- Background: black overlay alpha 0.7
- Title: "Choose an Upgrade" centered, y=100
- 3 cards vertically stacked, 300x140 each, 16px gap, centered
- Each card shows: icon area (left) + name + description + cost
- "Skip" button at bottom (close without spending)

**Card content:**
Each activation generates 3 random upgrades from the available pool (no duplicates, max-level upgrades excluded). If fewer than 3 available, show only what's available.

| Upgrade | Effect per level | Cost = `base + currentLevel * scale` | Max level |
|---------|-----------------|--------------------------------------|-----------|
| Attack+ | +4 to attackMin AND attackMax | 20 + currentLevel * 15 | 10 |
| Armor+ | +3 armor | 15 + currentLevel * 10 | 10 |
| Crit Damage+ | +0.10 crit damage multiplier | 25 + currentLevel * 20 | 5 |
| Recovery+ | +1 HP/s regen | 20 + currentLevel * 15 | 5 |
| Move Speed+ | +15 speed | 30 + currentLevel * 20 | 3 |
| Max HP+ | +30 max HP (and heal +30 current HP) | 15 + currentLevel * 10 | 10 |

- `currentLevel` = level BEFORE purchase (0 = never bought, cost = base)
- Max-level upgrades are removed from the random pool

**Input locking:**
- On panel open: emit `'ui-input-lock'` → Joystick calls `resetJoystick()` and ignores all pointer events while locked
- On panel close: emit `'ui-input-unlock'` → Joystick resumes normal operation
- UpgradePanel's background rect is interactive and consumes all pointer events (prevents click-through)

**Interaction:**
1. Panel open: physics pauses, input locked
2. Tap card → check gold sufficient → deduct gold → apply bonus via StatsManager → show floating "+4 ATK" confirmation text → close panel
3. If gold insufficient: card appears dimmed (alpha 0.5), tap shows "Not enough gold" flash text (no action)
4. Skip button closes panel without spending
5. Panel close: physics resumes, input unlocked
6. Altar transitions to CONSUMED state

### 5. Recovery System

Add HP regeneration in GameScene.update():
- `recovery = statsManager.getStat('recovery')`
- Each frame: `player.hp = Math.min(player.hp + recovery * delta/1000, player.maxHp)`
- Only regenerates when recovery > 0

### 6. Armor System

Add damage reduction in Player.takeDamage():
- `armor = statsManager.getStat('armor')`
- `reducedDamage = Math.max(1, amount - armor)`
- Minimum 1 damage always applied

## File Changes Summary

| File | Change |
|------|--------|
| `src/systems/StatsManager.ts` | **New** — centralized stat management with level tracking |
| `src/entities/Altar.ts` | **New** — altar game object with state machine |
| `src/ui/UpgradePanel.ts` | **New** — upgrade card UI with input locking |
| `src/systems/DungeonGenerator.ts` | Add ALTAR room state + altar room selection + fallback |
| `src/scenes/GameScene.ts` | Create StatsManager, spawn altar, recovery regen, ALTAR room handling |
| `src/scenes/BootScene.ts` | Generate altar placeholder texture |
| `src/scenes/UIScene.ts` | Mount UpgradePanel, listen for altar-activated, input lock relay |
| `src/entities/Player.ts` | Accept StatsManager, use for speed/maxHp, add armor reduction |
| `src/systems/CombatSystem.ts` | Accept StatsManager, use for attack/crit stats |
| `src/ui/Joystick.ts` | Listen for ui-input-lock/unlock events |
| `src/config.ts` | Add upgrade definitions (base cost, scale, max level, effect) |

Estimated: ~350 lines new code, ~80 lines modified across existing files.

## Acceptance Criteria

1. Each dungeon floor has exactly 1 altar room (no enemies, altar at center); skipped if < 3 rooms
2. Walking near altar shows "Upgrade" text prompt
3. Stopping near altar for 0.5s opens upgrade panel with 3 random options (max-level excluded)
4. Selecting an upgrade deducts gold, applies stat bonus, shows confirmation text
5. HUD reflects gold decrease; Max HP+ visibly grows HP bar
6. Altar becomes inactive (dimmed) after one use per floor
7. Skip button closes panel without cost
8. Insufficient gold: card is dimmed, cannot select
9. Recovery regen and armor reduction work correctly in combat
10. Joystick is disabled while upgrade panel is open, no residual movement on close

## Risks

- **StatsManager migration**: Changing how Player/CombatSystem read stats — mitigated by keeping same formulas, just moving data source
- **Altar room selection edge case**: Handled by fallback (skip if < 3 rooms)

## Out of Scope

- Sound effects
- Card rarity visual effects
- Skill-type upgrades (fire aura, chain lightning, etc.) — future phase
- Multi-floor progression (floor 2+)
- Save/load upgrade state
- Additional stat display in HUD (attack/armor/etc.) — future iteration
