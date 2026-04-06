# Phase 4: Altar Upgrade System Design

## Overview

Add an altar room to each dungeon floor where the player spends gold to choose 1 of 3 upgrade options. Combines the exploration feel of altar-based upgrades with the "pick one" satisfaction of card selection.

## Core Loop Addition

```
Kill enemies → Collect gold → Find altar room → Choose 1 of 3 upgrades → Get stronger → Next room
```

## Components

### 1. StatsManager (new: `src/systems/StatsManager.ts`)

Centralized player stat management. Replaces raw properties on Player with computed values that account for base stats + upgrade bonuses.

```
StatsManager {
  baseStats: { attack, armor, critChance, critDamage, recovery, moveSpeed }
  bonuses: { attack, armor, critChance, critDamage, recovery, moveSpeed }
  
  getStat(key) → base + bonus
  addBonus(key, amount)
  reset() → clear all bonuses (on new run)
}
```

- Player reads stats from StatsManager instead of GAME_CONFIG directly
- CombatSystem uses `statsManager.getStat('attack')` for damage calc
- Player.speed uses `statsManager.getStat('moveSpeed')`

### 2. Altar Entity (new: `src/entities/Altar.ts`)

A static game object placed in one room per floor.

- Visual: white bordered circle (placeholder), 48x48
- Placed at center of a designated "altar room" (not the spawn room, not rooms with enemies)
- Interaction: player walks within 60px → show "Upgrade" prompt text above altar
- Activation: player stops within range for 0.5s → open upgrade panel
- One-time use per floor (altar dims after use)

### 3. Altar Room in Dungeon Generator

Modify `DungeonGenerator.generate()`:
- After placing rooms, pick one non-spawn room and mark it as `ALTAR` state
- This room spawns no enemies
- Altar entity is placed at room center

New room state: `RoomState.ALTAR`

### 4. Upgrade Panel (new: `src/ui/UpgradePanel.ts`, rendered in UIScene)

Full-screen overlay triggered when player activates altar.

**Layout (portrait 450x800):**
- Background: black overlay alpha 0.7
- Title: "Choose an Upgrade" centered, y=100
- 3 cards vertically stacked, 300x140 each, 16px gap, centered
- Each card shows: icon area (left) + name + description + cost
- "Skip" button at bottom (close without spending)

**Card content:**
Each activation generates 3 random upgrades from the pool (no duplicates):

| Upgrade | Effect per level | Cost formula | Max level |
|---------|-----------------|--------------|-----------|
| Attack+ | +4 attack (min & max) | 20 + level * 15 | 10 |
| Armor+ | +3 armor | 15 + level * 10 | 10 |
| Crit Damage+ | +10% crit damage | 25 + level * 20 | 5 |
| Recovery+ | +1 HP/s regen | 20 + level * 15 | 5 |
| Move Speed+ | +15 speed | 30 + level * 20 | 3 |
| Max HP+ | +30 max HP | 15 + level * 10 | 10 |

**Interaction:**
1. Physics pauses on panel open
2. Player taps a card → check gold sufficient → deduct gold → apply bonus via StatsManager → close panel
3. If gold insufficient: card appears dimmed, tap shows "Not enough gold" flash text
4. Skip button closes panel without spending
5. Physics resumes on panel close
6. Altar becomes inactive (visual: alpha 0.3, no more interaction)

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
| `src/systems/StatsManager.ts` | **New** — centralized stat management |
| `src/entities/Altar.ts` | **New** — altar game object |
| `src/ui/UpgradePanel.ts` | **New** — upgrade card UI |
| `src/systems/DungeonGenerator.ts` | Add ALTAR room state + altar room selection |
| `src/scenes/GameScene.ts` | Integrate StatsManager, spawn altar, handle recovery |
| `src/scenes/BootScene.ts` | Generate altar placeholder texture |
| `src/scenes/UIScene.ts` | Mount UpgradePanel, listen for altar activation |
| `src/entities/Player.ts` | Use StatsManager for speed, add armor reduction |
| `src/systems/CombatSystem.ts` | Use StatsManager for attack/crit stats |
| `src/config.ts` | Add upgrade cost constants |

Estimated: ~300 lines new code, ~50 lines modified across existing files.

## Acceptance Criteria

1. Each dungeon floor has exactly 1 altar room (no enemies, altar at center)
2. Walking near altar shows "Upgrade" text prompt
3. Stopping near altar opens upgrade panel with 3 random options
4. Selecting an upgrade deducts gold and immediately applies stat bonus
5. HUD reflects updated stats (gold decreases, HP bar may grow for Max HP+)
6. Altar becomes inactive after one use per floor
7. Skip button closes panel without cost
8. Insufficient gold: card is dimmed, cannot select
9. Recovery regen and armor reduction work correctly in combat

## Risks

- **Panel touch conflicts with joystick**: Panel renders in UIScene above everything, joystick input should be blocked while panel is open (physics is paused, so this is naturally handled)
- **StatsManager migration**: Changing how Player reads stats could break existing combat math — need careful integration
- **Altar room selection**: Must ensure at least 3 rooms exist (spawn + altar + 1 combat room minimum). Current min is 6 rooms, so safe.

## Out of Scope

- Sound effects
- Card rarity visual effects
- Skill-type upgrades (fire aura, chain lightning, etc.) — future phase
- Multi-floor progression (floor 2+)
- Save/load upgrade state
