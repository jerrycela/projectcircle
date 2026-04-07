# 007 — Hostage Rescue & Companion Nurturing System

## Overview

Players discover caged hostages in dungeon rooms guarded by elite "Warden" enemies. Rescuing hostages unlocks companions in a collection album. Players raise affection by gifting companion-specific tokens (primary) and generic resources (secondary), unlocking 3 tiers of portrait art. All companion progress persists via localStorage across deaths and runs.

## 1. Dungeon Hostage Rooms

### Room Generation
- DungeonGenerator marks one room per floor as `HOSTAGE` type
- Cannot overlap with starting room or altar room
- Floors 1-5: each floor guarantees one unique companion (randomized order per run, always all 5 assigned — never skip unlocked companions)
- After all 5 unlocked: each floor randomly selects one of the 5 companions

### Room State Machine
- HOSTAGE rooms follow normal room state flow: `UNVISITED` → `ACTIVE` → `CLEARED`
- Room transitions to `CLEARED` when all Wardens are killed (same as normal combat rooms)
- Rescue interaction is optional — room counts toward floor progression regardless
- No regular enemies spawn in HOSTAGE rooms — only Wardens

### Hostage Room Layout
- Room contains: caged NPC (Hostage entity) + 1-2 Warden guards
- Visual: grey grid-line cage placeholder + companion-colored circle NPC
- Pre-rescue: 0x000033 overlay at 30% alpha (cold tone)
- Post-rescue: tween overlay to 0% alpha over 0.5s (warm shift), cage disappears

### Warden (Elite Guard)
- Based on Enemy entity with dedicated config entry
- Stats: HP x2, ATK x1.5 relative to floor's base enemy
- Visual: larger body, red-tinted, crown/skull marker (child image above enemy container)
- 1 Warden on floors 1-3, 2 Wardens on floors 4+
- Counts as elite for loot purposes (including Volt token drops)

## 2. Rescue Interaction

### Trigger
- All Wardens in the hostage room defeated → cage becomes interactable
- Player moves within interaction range (64px) → "Rescue" button appears (bottom-right, temporarily hides other HUD buttons to avoid overlap)

### Rescue Sequence
1. Player taps rescue button
2. All damage sources suppressed (not just reduction — full immunity including DoT)
3. 1-1.5s rescue animation (slash cage bars / magic circle)
4. Cage breaks, NPC shows heart + gratitude text
5. Reward popup: "+30 Affection" (first rescue) or "+10 Affection" (repeat)
6. Hostage entity transitions: `CAGED` → `RESCUED` (animation plays) → `FREED` (NPC alpha tweens to 0 over 2s, then entity destroyed)

### Player Dies Before Rescue
- If player dies after Wardens are killed but before tapping rescue, the hostage is NOT rescued
- On next run, a new companion is assigned to the floor per the shuffle algorithm

### Affection from Rescue
- First rescue of a companion: unlock + 30 affection
- Repeat rescue of already-unlocked companion: +15 affection

## 3. Five Companions

| # | Name  | Element | Theme Color | Token Name        | Token Drop Source                         |
|---|-------|---------|-------------|-------------------|-------------------------------------------|
| 1 | Ember | Fire    | #FF6B35     | Flameheart Stone  | Fire-element enemies (15%)                |
| 2 | Coral | Water   | #4ECDC4     | Tidal Pearl       | Water-element enemies (15%)               |
| 3 | Volt  | Thunder | #FFE66D     | Thundershard      | Thunder-element enemies (15%), Wardens (10%) |
| 4 | Flora | Wind    | #95E06C     | Verdant Seed      | Wind-element enemies (15%), any enemy (3%) |
| 5 | Luna  | None    | #B388FF     | Moonshade Crystal | Any enemy on floor 8+ (5%), Wardens on floor 8+ (15%) |

### Enemy Element Assignment (Prerequisite)
- Add optional `element?: Element` field to `EnemyConfig` in config.ts
- Assign elements to existing enemy definitions based on their type
- Enemies without an element field have no element (default)
- Wardens have no element but count as elite (relevant for Volt and Luna drops)

### Token Drop Rates

| Source Type                  | Drop Rate | Applicable Companions |
|------------------------------|-----------|----------------------|
| Matching element enemy killed | 15%      | Ember, Coral, Volt, Flora |
| Any enemy killed (universal) | 3%        | Flora only            |
| Warden killed                | 10%       | Volt only             |
| Any enemy on floor 8+        | 5%        | Luna only             |
| Warden on floor 8+           | 15%       | Luna only             |

- When multiple drop conditions match, roll each independently (can drop multiple token types)

### Token Visual
- Small diamond-shaped placeholder in companion's theme color
- Collected via existing loot pickup system (walk over to collect)
- On collect: brief glow particle + EventBus `companion-token-collected`

## 4. Affection & Portrait System

### Affection Stages

| Stage | Threshold | Depth Gate         | Unlock                            |
|-------|-----------|--------------------|------------------------------------|
| 1     | 100       | None               | Base portrait (daily outfit)       |
| 2     | 300       | highestFloor >= 3  | Advanced portrait (special outfit) |
| 3     | 600       | highestFloor >= 5  | Final portrait (full illustration) |

- Affection caps at 600 (Stage 3 max). Gift buttons grey out at cap.
- Depth gate: even if affection exceeds threshold, stage won't unlock until player has reached the required floor. Album panel shows "Reach floor X to unlock" when gated.

### Affection Sources

| Source           | Affection | Notes                          |
|------------------|-----------|--------------------------------|
| First rescue     | +30       | Unlocks companion              |
| Repeat rescue    | +15       | Each dungeon re-rescue         |
| Gift token       | +25 each  | Primary source                 |
| Gift gold        | +5 / 100g | Universal fallback             |
| Gift material    | +5 each   | Universal, uses unified `material` resource |

### Portrait Placeholders
- Fixed container: 300x400px for all stages
- Stage 1: light theme color fill, text "Daily Outfit"
- Stage 2: medium theme color fill, text "Special Outfit"
- Stage 3: deep theme color fill, text "Full Portrait"
- Locked: grey fill + lock icon + "Need X more affection" (or "Reach floor X")

## 5. Companion Album Panel (UI)

### Entry Point
- New "Companions" button on HUD (same row as equipment button)
- Opens album panel, pauses game (same pattern as EquipmentPanel)

### Overview Page
- 5 slots in a row
- Locked: grey silhouette + "???"
- Unlocked: theme-colored circle avatar + name + affection progress bar (rectangular bar, blue→pink→gold gradient based on affection %)
- Tap to enter detail page

### Detail Page
- Left: current highest unlocked portrait placeholder (300x400 fixed container)
- Right top: name + element icon + affection progress bar
- Right middle: 3-stage unlock status (checkmark / lock + affection gap or floor requirement)
- Right bottom: gift area
  - Companion token count + "Gift" button + "Gift All" button
  - Gold amount + "Gift 100g" button
  - Material count + "Gift" button
  - Buttons greyed out when insufficient resources or affection at cap (600)
- Gift feedback: affection number bounce animation, bar fill, stage unlock flash effect (glow + new portrait reveal)
- Back button to overview

### Token Collection Notification
- When tokens are picked up in dungeon, brief floating text near HUD: "[Token Name] +1"
- Uses existing loot popup pattern

## 6. CompanionManager (System)

### Responsibilities
- Manage 5 companion states: unlocked, affection, token inventory
- Read/write localStorage (key: `darkdungeon_companions`)
- Provide API: `rescue(id)`, `gift(id, type, amount)`, `getState()`, `getCompanion(id)`
- Determine which companion appears on each floor
- Track run-level floor-to-companion mapping (stored in RunState)

### Persistence Schema
```typescript
interface CompanionSaveData {
  version: 1;
  companions: {
    [companionId: string]: {
      unlocked: boolean;
      affection: number;
      tokens: number;
    };
  };
}
```

### Floor Assignment
- On new run: shuffle companions 1-5 → assign to floors 1-5 (always all 5, including already-unlocked for repeat rescue)
- Store mapping in RunState so floor transitions preserve assignment
- Floor 6+: random selection from all 5 (seeded from run seed if available)

## 7. Entity Definitions

### Hostage Entity
- Extends Phaser.GameObjects.Container
- States: `CAGED` → `RESCUED` → `FREED`
  - `CAGED`: idle, cage visible, NPC inside, waiting for interaction
  - `RESCUED`: rescue animation playing (1-1.5s), cage breaking
  - `FREED`: NPC fades out (alpha tween 2s), entity destroyed on complete
- Components: cage graphic (grey grid) + NPC circle (theme color)
- Interaction zone: 64px radius
- Associated companionId for data linkage

### Warden Enemy Config
```typescript
{
  type: 'warden',
  aiType: 'chase',
  baseHp: floorBaseHp * 2,
  baseAtk: floorBaseAtk * 1.5,
  speed: 80,
  size: 24,       // larger than normal (normal = 16)
  color: 0xCC0000,
  xpReward: floorBaseXp * 3,
  lootMultiplier: 2,
  isElite: true
}
```

## 8. Integration Points

### DungeonGenerator
- New RoomState value: `HOSTAGE` (used only during generation to mark the room; at runtime uses standard UNVISITED/ACTIVE/CLEARED flow)
- `generate()` includes hostage room allocation logic
- Returns hostage room info: `{ room, companionId }` in generation result

### LootSystem
- New drop type: companion tokens
- On `enemy-killed`: check enemy element and floor against token drop table
- Roll each applicable drop condition independently
- Tokens added to CompanionManager inventory (not Player materials)

### config.ts
- Add `element?: Element` to EnemyConfig interface
- Assign elements to existing enemy definitions
- Add `COMPANION_DEFS` array with 5 companion definitions
- Add `TOKEN_DROP_TABLE` with drop conditions
- Add Warden to `ENEMY_DEFS`

### EventBus Events

| Event                        | Trigger                    | Payload                           |
|------------------------------|----------------------------|-----------------------------------|
| `hostage-room-entered`       | Player enters hostage room | `{ companionId }`                |
| `hostage-guards-defeated`    | All wardens killed in room | `{ companionId }`                |
| `companion-rescued`          | Rescue completed           | `{ companionId, isFirst }`       |
| `companion-unlocked`         | First rescue               | `{ companionId }`                |
| `companion-affection-changed`| Affection value changed    | `{ companionId, newValue, delta }`|
| `companion-stage-unlocked`   | Portrait stage unlocked    | `{ companionId, stage }`         |
| `companion-token-dropped`    | Token loot spawned         | `{ companionId, tokenType }`     |
| `companion-token-collected`  | Token picked up            | `{ companionId, amount }`        |

### GameScene
- Create CompanionManager in `create()`
- Pass run-level floor-to-companion mapping to CompanionManager
- Spawn Hostage + Wardens when player enters hostage room
- Skip regular enemy spawning for HOSTAGE-marked rooms
- Wire rescue button through UIScene

### UIScene
- Add "Companions" HUD button
- Mount CompanionPanel
- Rescue button overlay during hostage interaction (hides other action buttons)
- Token collection notification popup

### DebugManager Extensions
- `unlockCompanion(id)` — unlock specific companion
- `setAffection(id, value)` — set affection level
- `giveToken(id, count)` — give companion tokens
- `unlockAllCompanions()` — unlock all at max affection
- `setHighestFloor(n)` — already exists, useful for testing depth gates

## 9. Acceptance Criteria

### Hostage Room Generation
- [ ] AC-1: Each floor 1-5 has exactly one HOSTAGE room with a unique companion (randomized order per run, all 5 assigned)
- [ ] AC-2: Floors 6+ have one HOSTAGE room with a random companion
- [ ] AC-3: HOSTAGE room never overlaps with starting room or altar room
- [ ] AC-4: Hostage room contains cage visual + companion-colored NPC + 1-2 Wardens
- [ ] AC-5: No regular enemies spawn in HOSTAGE rooms — only Wardens
- [ ] AC-6: Floor-to-companion mapping persists across floor transitions within a run

### Room State
- [ ] AC-7: HOSTAGE room transitions to CLEARED when all Wardens are killed
- [ ] AC-8: HOSTAGE room counts toward floor-clearing for staircase reveal

### Rescue Mechanics
- [ ] AC-9: Rescue button appears only after all Wardens in room are defeated
- [ ] AC-10: Rescue button appears when player is within 64px of hostage
- [ ] AC-11: Rescue button hides other HUD action buttons while visible
- [ ] AC-12: During rescue animation (1-1.5s), all damage sources suppressed
- [ ] AC-13: First rescue unlocks companion + grants 30 affection
- [ ] AC-14: Repeat rescue of unlocked companion grants 15 affection
- [ ] AC-15: Hostage entity transitions CAGED → RESCUED → FREED (fade out 2s, then destroyed)

### Warden Enemy
- [ ] AC-16: Warden has 2x floor HP, 1.5x floor ATK, larger visual (24px vs 16px)
- [ ] AC-17: 1 Warden on floors 1-3, 2 Wardens on floors 4+
- [ ] AC-18: Warden drops loot at 2x multiplier and is flagged as elite

### Enemy Element Assignment
- [ ] AC-19: EnemyConfig has optional `element` field
- [ ] AC-20: Existing enemy definitions have appropriate elements assigned

### Companion Tokens
- [ ] AC-21: Matching element enemies drop companion tokens at 15% rate
- [ ] AC-22: Flora tokens drop from any enemy at 3% rate
- [ ] AC-23: Luna tokens drop from any enemy on floor 8+ at 5%, Wardens on floor 8+ at 15%
- [ ] AC-24: Volt tokens drop from Wardens at 10%
- [ ] AC-25: Tokens display as diamond-shaped theme-colored loot with glow on collect
- [ ] AC-26: Tokens stored in CompanionManager, not Player materials
- [ ] AC-27: Token collection shows floating notification near HUD

### Affection & Portraits
- [ ] AC-28: Gifting token grants +25 affection per token
- [ ] AC-29: Gifting 100 gold grants +5 affection, deducts 100 gold from player
- [ ] AC-30: Gifting 1 material grants +5 affection, deducts 1 material from player
- [ ] AC-31: Stage 1 unlocks at 100 affection (no depth gate)
- [ ] AC-32: Stage 2 unlocks at 300 affection AND highestFloor >= 3
- [ ] AC-33: Stage 3 unlocks at 600 affection AND highestFloor >= 5
- [ ] AC-34: Affection caps at 600; gift buttons grey out at cap
- [ ] AC-35: Depth-gated stages show "Reach floor X to unlock" in album
- [ ] AC-36: Portrait placeholders use fixed 300x400 container with correct color/text per stage
- [ ] AC-37: Locked portraits show grey + lock icon + remaining affection or floor requirement

### Album Panel UI
- [ ] AC-38: "Companions" button on HUD opens album panel and pauses game
- [ ] AC-39: Overview shows 5 slots (silhouette+??? for locked, avatar+name+bar for unlocked)
- [ ] AC-40: Detail page shows portrait, affection bar, 3-stage status, gift buttons
- [ ] AC-41: Gift buttons greyed when insufficient resources or at affection cap
- [ ] AC-42: "Gift All" button for tokens gifts entire stack at once
- [ ] AC-43: Gift feedback: number animation + bar fill + stage unlock effect

### Persistence
- [ ] AC-44: Companion state persists in localStorage with version field
- [ ] AC-45: Loading a fresh game with existing save data restores all companion progress
- [ ] AC-46: Companion progress survives player death (not reset on death/new run)

### Debug API
- [ ] AC-47: `unlockCompanion(id)` unlocks specified companion
- [ ] AC-48: `setAffection(id, value)` sets affection to exact value
- [ ] AC-49: `giveToken(id, count)` adds tokens to inventory
- [ ] AC-50: `unlockAllCompanions()` unlocks all 5 at max affection (600)
