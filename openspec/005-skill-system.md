# SPEC-005: Active Skill System

> Status: PROPOSED
> Priority: P0
> Phase: 5c
> Created: 2026-04-06
> Dual-reviewed: Codex (gpt-5.4) + Gemini (gemini-2.5-pro) — R1: 6 P1 + 8 P2 addressed, R2: 0 P1 remaining

## Goal

Add 3 active skills (MP-consuming, button-triggered) with 2 skill slots on the HUD.
Skills are acquired through the existing Altar 3-pick-1 system.
Gives MP a purpose and adds tactical depth to combat.

## Design Spec

### Skills (3 types)

| Skill | MP Cost | Cooldown | Effect |
|-------|---------|----------|--------|
| Whirlwind | 25 | 4s | AOE slash: 360-degree attack hitting all enemies within 100px radius. |
| Shadow Dash | 20 | 3s | Dash up to 150px in facing direction. Invincible during dash (200ms). Damages enemies along path. |
| Arcane Bolt | 30 | 5s | Fires a projectile (speed 350px/s, range 300px). Hits up to 3 enemies (pierces first 2). |

#### Damage Formula (R1 fix: explicit formula, no crit)

All skill damage = `floor(Phaser.Math.Between(statsManager.getStat('attackMin'), statsManager.getStat('attackMax')) * multiplier)`.
Skills **do not** trigger critical hits. Damage numbers are cyan (#00ffff).

| Skill | Multiplier |
|-------|-----------|
| Whirlwind | 1.5x |
| Shadow Dash | 0.8x |
| Arcane Bolt | 2.0x |

#### Shadow Dash Wall Resolution (R1 fix: wall collision)

Dash uses a **swept check** before moving:
1. Compute target position: `player.pos + facingDir * 150px`
2. Use `scene.physics.moveTo()` with body collision — Arcade Physics will stop the player at the wall automatically
3. Dash duration is fixed 200ms regardless of actual distance traveled
4. If player is stationary (no last move direction), use `player.scaleX` to determine direction (1=right, -1=left)
5. Path damage: swept rectangle **32px wide** along the dash line, each enemy hit at most once per cast

#### Arcane Bolt Lifecycle (R1 fix: cleanup)

- Projectile is a Physics.Image added to a dedicated `projectileGroup` on GameScene
- On hit (3rd enemy or first non-pierceable): destroy projectile
- On max range: destroy projectile
- On scene `shutdown` event: destroy all projectiles in group
- Each enemy tracked in a `Set<Enemy>` per projectile to prevent duplicate hits from overlap jitter
- `pierceCount` means **pass through** N enemies; stops on the (N+1)th hit. So pierceCount=2 means hits 3 total.

### Skill State Machine (R1 fix: explicit states)

Each skill slot has a state:
```
EMPTY -> READY -> CASTING -> COOLDOWN -> READY
```

- `EMPTY`: no skill assigned, button shows "+"
- `READY`: skill available, button active
- `CASTING`: skill animation in progress (200-300ms depending on skill), button grayed
- `COOLDOWN`: timer counting down, clockwise dark overlay on button
- Transitions: tap button (READY->CASTING) -> animation complete (CASTING->COOLDOWN) -> timer expires (COOLDOWN->READY)

### Combat Interaction (R1 fix: auto-attack suppression)

- **Auto-attack is suppressed while any skill is in CASTING state.** CombatSystem checks `skillManager.isCasting()` before `tryPlayerAttack()`.
- After CASTING ends, auto-attack cooldown timer is NOT reset (resumes from where it was).
- Skills CAN be used while moving (unlike auto-attack which requires standing still).
- Skills CANNOT be used while `gameplayLocked` is true.
- If `gameplayLocked` becomes true during CASTING (e.g., staircase triggered), the current animation completes but no further casts are allowed until unlocked. (R2 fix)

### Skill Slots

- Player has **2 skill button slots** on HUD (right side)
- Slots start empty. Skills acquired from Altar.
- Skills persist across floors (same as upgrades). **Skills also persist on death** (same as stat upgrades — R1 fix: consistent with roguelite upgrade model).

### Skill Acquisition (Altar Integration)

- Add 3 skill entries to the Altar 3-pick-1 pool alongside existing stat upgrades
- Skill cards show: skill name, MP cost, cooldown, effect description
- If player already has a skill, it won't appear again (no duplicate skills; no skill leveling in this phase)
- **If player already has 2 skills, no skill cards appear in the pool** (R1 fix: removes replace prompt complexity)
- Pool: 6 stat upgrades + up to 3 skills (minus acquired) = 7-9 total options, pick 3 random

### UI: Skill Buttons

Position: right side of screen, vertically stacked.

```
Layout (450x800 screen):
  Right side:
    Slot 1: center (390, 620)  -- 80px diameter
    Slot 2: center (390, 720)  -- 80px diameter

  Empty slot: dark circle with "+" icon, 40% alpha
  Filled slot: skill icon (Graphics-drawn) + MP cost label below
  Cooldown: clockwise dark overlay (like Rumble Raiders)
  Not enough MP: desaturated + red MP cost text
```

#### Pointer Ownership (R1 fix: joystick conflict)

- Screen divided: **left half (x < 225)** = joystick zone, **right half (x >= 225)** = skill button zone
- Skill buttons consume their pointer on `pointerdown` first (higher priority via `setInteractive({ useHandCursor: false })` on UIScene)
- Joystick only activates on pointers in left half
- Multi-touch: one pointer for joystick + one pointer for skill button simultaneously supported

Touch feedback:
- Hitbox: 100px diameter (larger than visual 80px)
- Press feedback: scale 0.9 + darken, 100ms
- Cooldown/no-MP press: brief **shake animation** (2px x-oscillation, 3 cycles, 150ms) + no activation (R1 fix: disabled tap feedback)

### Skill Execution Flow

1. Player taps skill button in right-half screen zone
2. **First check: `gameplayLocked`** — if true, return immediately (R1 fix: must be first guard)
3. Check: has skill? state === READY? enough MP?
4. Deduct MP, set state to CASTING, start skill animation
5. Execute skill effect (spawn visuals + deal damage)
6. On animation complete: set state to COOLDOWN, start cooldown timer
7. On cooldown expire: set state to READY
8. EventBus emit `skill-used` with skill type (for HUD/debug)

### Visual Effects

| Skill | Visual |
|-------|--------|
| Whirlwind | White expanding ring (radius 0 -> 100px), 300ms, with 4 slash marks at 90-degree intervals |
| Shadow Dash | Ghost trail (3 afterimages at 50ms intervals, fading alpha 0.6->0), player teleports to destination |
| Arcane Bolt | Blue-purple circle projectile (radius 8px), particle trail (3 small circles/frame), explode on final hit/max range |

### Camera Effects

| Skill | Camera |
|-------|--------|
| Whirlwind | Shake 100ms, intensity 0.005 |
| Shadow Dash | None (already has motion) |
| Arcane Bolt | None |

### State Persistence (RunState)

Add to scene restart data:
- `playerSkills: string[]` — array of acquired skill type keys (max 2)
- Cooldowns are NOT persisted — always reset on floor transition (R1 fix: removed ambiguity)

Death: skills persist (same as upgrades). Gold resets. HP/MP refill.

### Config (config.ts)

```typescript
export interface SkillDefinition {
  type: string;
  name: string;
  description: string;
  mpCost: number;
  cooldownMs: number;
  castDurationMs: number;
  damageMultiplier: number;
  // Skill-specific params
  radius?: number;           // whirlwind: 100
  dashDistance?: number;      // shadow dash: 150
  dashDurationMs?: number;   // shadow dash: 200
  dashPathWidth?: number;    // shadow dash: 32
  projectileSpeed?: number;  // arcane bolt: 350
  projectileRange?: number;  // arcane bolt: 300
  pierceCount?: number;      // arcane bolt: 2 (hits 3 total)
}

export const SKILL_DEFS: Record<string, SkillDefinition> = { ... };
```

### DebugManager Updates

New commands:
- `giveSkill(type: string)` — add skill to player slot (bypass altar)
- `removeSkills()` — clear all skills
- `listSkills()` — show current skills and states
- `castSkill(slot: number)` — force-cast skill in slot 0 or 1 (R1 fix: QA hook)
- `setSkillCooldown(type: string, ms: number)` — override cooldown for testing (R1 fix: QA hook)
- `getSkillCooldown(slot: number)` — read remaining cooldown ms for QA verification (R2 fix)
- `setMp(value)` — already exists
- `healFull()` — already restores MP

State snapshot additions:
- `playerSkills: string[]`
- `skillStates: Record<string, string>` (EMPTY/READY/CASTING/COOLDOWN per slot)
- `skillCooldowns: Record<string, number>`

### Files Changed

| File | Change |
|------|--------|
| `src/config.ts` | Add SKILL_DEFS, SkillDefinition interface |
| `src/systems/SkillManager.ts` | **NEW** — skill state machine, cooldowns, execution, isCasting() |
| `src/ui/SkillButton.ts` | **NEW** — single skill button component with state rendering |
| `src/ui/HUD.ts` | Add 2 SkillButton instances, wire to SkillManager |
| `src/scenes/UIScene.ts` | Wire skill button tap events, pointer zone ownership |
| `src/scenes/GameScene.ts` | Create SkillManager + projectileGroup, pass to RunState, wire EventBus |
| `src/entities/Player.ts` | Add skills array |
| `src/systems/CombatSystem.ts` | Add isCasting() check before auto-attack, skill damage helpers |
| `src/ui/UpgradePanel.ts` | Support skill cards in pool, filter when 2 skills owned |
| `src/debug/DebugManager.ts` | Add skill debug commands + snapshot |
| `src/scenes/BootScene.ts` | No new textures needed (Graphics API) |
| `src/ui/Joystick.ts` | Restrict activation to left-half pointers |

## Acceptance Criteria

### Core Mechanics
| AC | Description | Verification |
|----|------------|-------------|
| AC1 | Whirlwind deals 1.5x damage to all enemies within 100px radius, costs 25 MP, 4s cooldown | `giveSkill('whirlwind')` + spawn enemies + cast, check damage numbers (cyan) |
| AC2 | Shadow Dash moves player up to 150px in facing direction, invincible during 200ms, 0.8x damage along 32px-wide path | `giveSkill('shadow-dash')` + position near enemies + cast, verify position change + damage |
| AC3 | Shadow Dash stops at walls (no wall embedding) | Dash toward wall, verify player stops at wall boundary |
| AC4 | Shadow Dash uses scaleX direction when stationary | Stand still, cast, verify dash goes in facing direction |
| AC5 | Arcane Bolt fires at 350px/s, pierces 2 enemies (hits 3 total), 2.0x damage, costs 30 MP, 5s cooldown | `giveSkill('arcane-bolt')` + line up 4 enemies, verify 3 hit + bolt stops |
| AC6 | Arcane Bolt destroyed on max range, scene restart, and enemy hit limit | Cast bolt into empty space, verify disappears at 300px; restart scene, verify no orphans |
| AC7 | Skills cannot be used when MP < cost (button desaturated + red MP text) | `setMp(5)` + tap skill button, verify no activation + shake feedback |
| AC8 | Skills cannot be used during cooldown (clockwise overlay shown) | Cast skill, immediately tap again, verify blocked |
| AC9 | Skills CAN be used while moving | Hold joystick + tap skill, verify skill fires |
| AC10 | Auto-attack suppressed during CASTING state | Stand near enemy, cast Whirlwind, verify no auto-attack during animation |
| AC11 | gameplayLocked blocks skill use (first guard) | Open altar, tap skill button, verify no activation |

### Acquisition
| AC | Description | Verification |
|----|------------|-------------|
| AC12 | Skills appear in Altar 3-pick-1 pool | Open altar, verify skill cards can appear |
| AC13 | Already-acquired skills don't appear in pool | `giveSkill('whirlwind')` + open altar, verify whirlwind absent |
| AC14 | When player has 2 skills, no skill cards in pool | `giveSkill('whirlwind')` + `giveSkill('shadow-dash')` + open altar, verify only stat cards |
| AC15 | Skills persist across floor transitions | Acquire skill, descend, verify skill still equipped |

### UI
| AC | Description | Verification |
|----|------------|-------------|
| AC16 | 2 skill slots on right side (80px visual, 100px touch) | Visual inspection |
| AC17 | Empty slots show "+" placeholder | Start fresh, verify "+" icons |
| AC18 | Cooldown shown as clockwise dark overlay | Cast skill, verify overlay animation |
| AC19 | Press feedback: scale 0.9 + darken on tap | Tap skill button, verify visual feedback |
| AC20 | Disabled tap shows shake animation | Tap during cooldown or insufficient MP, verify shake |
| AC21 | Skill buttons don't conflict with joystick (pointer zone split) | Tap right side while moving with joystick on left, verify both work |

### State
| AC | Description | Verification |
|----|------------|-------------|
| AC22 | Skills persist on death (same as upgrades) | Die with skills, verify skills still equipped on respawn |
| AC23 | Skills in RunState for floor transitions | `getStateSnapshot()`, verify playerSkills field |

### Debug
| AC | Description | Verification |
|----|------------|-------------|
| AC24 | `giveSkill(type)` adds skill | Console command, verify slot filled |
| AC25 | `removeSkills()` clears all | Console command, verify empty slots |
| AC26 | `castSkill(slot)` force-casts | Console command, verify skill fires |
| AC27 | State snapshot includes skills, states, cooldowns | `getStateSnapshot()`, verify fields |

### Visual
| AC | Description | Verification |
|----|------------|-------------|
| AC28 | Whirlwind: expanding ring + slash marks | Visual inspection after cast |
| AC29 | Shadow Dash: ghost trail afterimages | Visual inspection after cast |
| AC30 | Arcane Bolt: projectile with particle trail + explode on end | Visual inspection after cast |
| AC31 | Skill damage numbers are cyan (#00ffff) | Check damage number color |
