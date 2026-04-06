# Phase 5b: Enemy Diversity Design Spec

## Overview

Add 5 new enemy types to replace the single-spider model. Data-driven EnemyConfig architecture with 4 AI behavior modes (chase, charge, shield, summon). Enemies unlock progressively by floor.

## Decisions

- **Scope**: 5 new enemies (Goblin, Bat, Skeleton Swordsman, Skeleton Shieldbearer, Skeleton Summoner)
- **Architecture**: EnemyConfig data-driven (方案 1) — single Enemy class, aiType branching
- **Spawn strategy**: Progressive unlock (F1 spider only, F2+ goblin, F3+ bat/skeleton swordsman, F4+ shieldbearer, F5+ summoner)
- **Bat behavior**: Charge pattern (patrol → windup → charge → stunned)

## EnemyConfig Interface

```typescript
interface EnemyConfig {
  type: string;
  textureKey: string;
  size: number;
  hp: number;
  speed: number;
  attack: number;
  attackCooldown: number;  // 0 for charge/summon AI (field ignored by those AI types)
  attackRange: number;     // 0 for summon AI (field ignored)
  aiType: 'chase' | 'charge' | 'shield' | 'summon';
  chargeConfig?: {
    chargeSpeed: number;
    windupMs: number;
    stunMs: number;
    maxDistance: number;
    triggerRange: number;
  };
  summonConfig?: {
    summonType: string;
    summonInterval: number;
    maxMinions: number;
    windupMs: number;
    cooldownMs: number;
    retreatDistance: number;
    minionHpScale: number;  // multiplied AFTER floor scaling: finalHp = baseHp * floorHpScale * minionHpScale
    minionAtkScale: number; // same: finalAtk = baseAtk * floorAtkScale * minionAtkScale
  };
  shieldConfig?: {
    shieldArc: number;       // degrees, frontal arc that reduces damage
    damageReduction: number; // 0-1, multiplier on incoming damage from front
    turnRate: number;        // degrees per second the shieldbearer can rotate
  };
  maxPerRoom?: number;       // optional cap on how many of this type can spawn per room
  unlockFloor: number;
  spawnWeight: number;
}
```

## Enemy Definitions

| Enemy | HP | Speed | ATK | Cooldown | Range | AI | Unlock | Weight | Texture |
|-------|-----|-------|-----|----------|-------|----|--------|--------|---------|
| Spider | 50 | 80 | 10 | 1500ms | 30px | chase | F1 | 10 | Dark red circle 30px |
| Goblin | 40 | 72 | 15 | 1200ms | 35px | chase | F2 | 8 | Green triangle 28px |
| Bat | 30 | 60/280 | 12 | 0 | 30px | charge | F3 | 5 | Purple diamond 24px |
| Skeleton Swordsman | 70 | 65 | 18 | 1400ms | 35px | chase | F3 | 6 | White square 32px |
| Skeleton Shieldbearer | 100 | 50 | 12 | 1800ms | 30px | shield | F4 | 4 | Gray-white square + line 34px |
| Skeleton Summoner | 60 | 40 | 8 | 0 | 0 | summon | F5 | 3 | Light purple circle + cross 30px |

All HP/ATK values are F1 baselines, scaled by FloorManager's hpScale/atkScale.

## AI Behaviors

### Chase AI (Spider, Goblin, Skeleton Swordsman)

Existing behavior, unchanged. States: `IDLE → CHASING → ATTACKING → KNOCKBACK`

- Moves toward player using `physics.moveToObject`
- Attacks when within range, respects cooldown
- Knockback on taking damage

### Charge AI (Bat)

New states: `PATROL → WINDUP → CHARGING → STUNNED`

| State | Behavior | Transition |
|-------|----------|------------|
| PATROL | Move toward player at 60 px/s | Player within 200px → WINDUP |
| WINDUP | Stop movement, lock target position (player's current pos), shake + tint red (0xff4444), 500ms | Timer expires → CHARGING |
| CHARGING | Move in straight line toward locked position at 280 px/s, no tracking | Hit player (deal damage) → STUNNED; Hit wall → STUNNED; Traveled 400px → STUNNED |
| STUNNED | No movement, alpha flicker 0.5, 800ms | Timer expires → PATROL |

- KNOCKBACK still applies when hit by player (interrupts any state)
- Charge damage uses the bat's base attack value
- **Collision rules during charge**: "Hit wall" = `body.blocked.any` (tile walls or world bounds). Enemy-to-enemy collision is **ignored** during charge (bat passes through other enemies). Bat cannot cross room boundaries (existing wall collider handles this). `maxDistance` measured from charge start position using Euclidean distance.

### Shield AI (Skeleton Shieldbearer)

States: `IDLE → CHASING → ATTACKING → KNOCKBACK`

Same as chase AI with one addition:

- **Frontal shield**: The shieldbearer tracks a `facingAngle` with a **turn rate of 180 deg/s** (not instant). Each frame, `facingAngle` rotates toward the player at most `turnRate * delta` degrees. This means a fast-moving player can outpace the shield rotation.
- When taking damage via `takeDamage(amount, sourceX, sourceY, knockbackX, knockbackY)`, calculate the angle from (sourceX, sourceY) to the enemy position, compare with `facingAngle`
- If the angle difference is within 60 degrees (120-degree frontal arc total): damage is multiplied by 0.5
- At zero distance (source overlaps enemy): no damage reduction (fallback)
- Visual: the short line on the texture rotates to indicate shield/facing direction

Player counterplay: circle around to attack from behind. The shieldbearer's slow speed (50 px/s) + limited turn rate (180 deg/s) makes flanking viable.

### Summon AI (Skeleton Summoner)

States: `IDLE → RETREATING → SUMMONING → COOLDOWN → KNOCKBACK`

| State | Behavior | Transition |
|-------|----------|------------|
| RETREATING | Maintain 180px distance from player. If player < 180px, move away. If player > 220px, move toward (prevent infinite kiting). | Every 4s if minion count < max → SUMMONING |
| SUMMONING | Stop movement, 1s windup (body pulses bright), spawn 1 Skeleton Swordsman minion (hp x0.5, atk x0.5) near self | Spawn complete → COOLDOWN |
| COOLDOWN | Continue retreating behavior, 3s timer before next summon allowed | Timer expires → back to RETREATING (eligible to summon again) |

Minion rules:
- Enemy class gains: `isSummon: boolean` (default false), `owner: Enemy | null` (default null)
- Summoner holds `minions: Enemy[]` array
- When a minion dies (player kills it): minion calls `owner.minions.remove(self)` before die()
- Minions do NOT count toward room clear condition (`checkRoomClearing` filters out `isSummon === true`)
- Minions do NOT drop loot (skip `enemy-killed` event emission)
- Minion scaling formula: `finalHp = baseSkelSwordsmanHp * floorHpScale * minionHpScale(0.5)`, ATK same pattern
- Max 3 minions alive at once per summoner
- When summoner dies: set all minions' `owner = null` first, then batch `die()` on each (prevents recursive callbacks). Burst visual effect on minion death-by-summoner.

## Enemy State Model

Expand the existing `EnemyState` enum to include all new states:

```typescript
export const EnemyState = {
  // Shared
  IDLE: 'IDLE',
  KNOCKBACK: 'KNOCKBACK',
  // Chase / Shield AI
  CHASING: 'CHASING',
  ATTACKING: 'ATTACKING',
  // Charge AI (Bat)
  PATROL: 'PATROL',
  WINDUP: 'WINDUP',
  CHARGING: 'CHARGING',
  STUNNED: 'STUNNED',
  // Summon AI
  RETREATING: 'RETREATING',
  SUMMONING: 'SUMMONING',
  COOLDOWN: 'COOLDOWN',
} as const;
```

Each AI type only uses its relevant subset. The `updateAI` method branches by `config.aiType` and only transitions between states valid for that AI.

## Damage API Change

`Enemy.takeDamage` signature changes from `(amount, knockbackX, knockbackY)` to `(amount, sourceX, sourceY, knockbackX, knockbackY)`. The `sourceX/sourceY` is the attacker's position, used by Shield AI to determine frontal arc. CombatSystem already has player position available, so this is a trivial change.

## Spawn System

### FloorManager.getSpawnTable(floor)

Returns array of `{ config: EnemyConfig, weight: number }` for all enemies where `unlockFloor <= floor`.

Weight adjustment: On the floor where an enemy first unlocks, its weight is multiplied by 1.5 to ensure the player encounters the new type.

### GameScene.spawnEnemiesInRoom changes

1. Call `floorManager.getSpawnTable(currentFloor)` to get available enemies
2. For each enemy to spawn, weighted random select from the table, respecting `maxPerRoom` caps
3. Construct `new Enemy(scene, x, y, roomIndex, config, hpScale, atkScale)`

Room composition caps (via `maxPerRoom` in EnemyConfig):
- Skeleton Summoner: maxPerRoom = 1
- Skeleton Shieldbearer: maxPerRoom = 2
- All others: no cap (undefined)

## File Changes

| File | Change |
|------|--------|
| `src/config.ts` | Add `EnemyConfig` interface, `ENEMY_DEFS` constant, remove `SPIDER_*` constants |
| `src/entities/Enemy.ts` | Constructor accepts `EnemyConfig`, `updateAI` branches by `aiType`, new states for charge/shield/summon, `takeDamage` adds sourceX/sourceY, `isSummon`/`owner`/`minions` fields |
| `src/systems/CombatSystem.ts` | Pass player position (sourceX, sourceY) to `enemy.takeDamage()` |
| `src/systems/FloorManager.ts` | Add `getSpawnTable(floor)` method |
| `src/scenes/GameScene.ts` | Update `spawnEnemiesInRoom` to use spawn table, handle summoner minion tracking |
| `src/scenes/BootScene.ts` | Add 5 new placeholder textures |
| `src/debug/DebugManager.ts` | Add `spawnEnemy(type)` and `listEnemyTypes()` commands |

## Placeholder Visuals

| Enemy | Shape | Color | Size |
|-------|-------|-------|------|
| Spider | Circle | 0x8b0000 (dark red) | 30px |
| Goblin | Triangle | 0x228b22 (forest green) | 28px |
| Bat | Diamond | 0x6a0dad (purple) | 24px |
| Skeleton Swordsman | Square | 0xcccccc (light gray) | 32px |
| Skeleton Shieldbearer | Square + front line | 0xaaaaaa (gray) | 34px |
| Skeleton Summoner | Circle + cross | 0x9966cc (light purple) | 30px |

## Debug API Additions

- `window.__debug.spawnEnemy(type: string)` — spawn specific enemy type near player
- `window.__debug.listEnemyTypes()` — list all enemy types and their unlock floors

## Acceptance Criteria

1. [ ] EnemyConfig interface and ENEMY_DEFS constant exist in config.ts
2. [ ] Enemy constructor accepts EnemyConfig, no more hardcoded SPIDER_* references
3. [ ] Spider behavior unchanged from Phase 5a
4. [ ] Goblin spawns from F2, chase AI, green triangle visual
5. [ ] Bat spawns from F3, charge AI with windup→charge→stun cycle
6. [ ] Bat windup has visual telegraph (shake + red tint)
7. [ ] Bat charge locks direction, does not track player mid-charge
8. [ ] Bat has 800ms stun after charge (player can counterattack)
9. [ ] Skeleton Swordsman spawns from F3, chase AI, white square visual
10. [ ] Skeleton Shieldbearer spawns from F4, frontal 120-degree shield reduces damage by 50%
11. [ ] Skeleton Summoner spawns from F5, retreats from player, summons minions every 4s (max 3)
12. [ ] Summoner minions marked isSummon, don't count for room clear, die when summoner dies
13. [ ] FloorManager.getSpawnTable returns weighted enemy list by floor
14. [ ] New enemies first appear with 1.5x weight bonus on unlock floor
15. [ ] All enemy HP/ATK scale with FloorManager hpScale/atkScale
16. [ ] BootScene generates all 6 placeholder textures
17. [ ] DebugManager: spawnEnemy(type) and listEnemyTypes() work
18. [ ] GameState snapshot includes enemy type information
19. [ ] Shieldbearer turn rate limits facing rotation (player can outflank)
20. [ ] takeDamage API includes sourceX/sourceY for shield arc calculation
21. [ ] Summoner minions don't drop loot, don't emit enemy-killed
22. [ ] Summoner death clears owner reference before batch-killing minions
23. [ ] Bat charge ignores enemy-to-enemy collision (passes through)
24. [ ] Room composition: max 1 summoner, max 2 shieldbearers per room
