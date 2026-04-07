# SPEC-006: Elemental Reaction System

> Status: PROPOSED
> Priority: P0
> Phase: 6a
> Created: 2026-04-07
> Dual-reviewed: R1 Codex+Gemini (3P1+7P2 addressed), R2 Codex+Gemini (2P1+1P2 addressed in R3 fix)

## Goal

Add an elemental reaction system that differentiates combat from standard Diablo-like ARPGs.
Map hazards (water pools, torches) apply elemental states to the player; attacks transfer elements to enemies;
magic skills with innate elements trigger chain reactions when hitting elementally-charged enemies.

## Design Spec

### Element Definitions

| Element | Source Type | Source |
|---------|-----------|-------|
| WATER | Map hazard | Water Pool |
| FIRE | Map hazard | Torch |
| THUNDER | Skill innate | Thunderstorm (雷暴術) |
| WIND | Skill innate | Tornado (龍捲風) |

Map elements are "primer"; skill elements are "detonator".

### ElementalState

Standalone class in `src/systems/ElementalState.ts`.

```ts
interface ElementalStateData {
  element: Element | null;    // WATER | FIRE | THUNDER | WIND | null
  remainingMs: number | null; // Player: countdown in ms; Enemy: null (permanent)
}
```

**Player version:**
- Written when overlapping Water Pool or near Torch
- Duration: 10,000ms countdown (configurable via `ELEMENT_ATTACH_DURATION_MS`)
- Same element: refresh countdown
- Different element: overwrite + reset countdown
- Countdown paused when `gameplayLocked = true` (altar, equipment panel, floor transition)
- Cleared on: floor change, death, run restart
- Last 3 seconds: visual flicker to warn expiry
- Leaving hazard area does NOT clear — only countdown expiry clears
- **Same-frame multi-hazard rule:** If player overlaps Water Pool AND is within Torch proximity in the same frame, the closest hazard wins. `ElementalState.apply()` is called once per frame at most; hazards report candidates, and the closest one is applied.

**Enemy version:**
- Written when hit by an elemental attack
- No countdown — persists until consumed by a reaction
- Same element: no-op (already applied)
- Different element: overwrite

**Constraint:** Only one element at a time per entity.

### Element Application Rules

**Attack → Element transfer:**

| Attack Type | Element Carried |
|-------------|----------------|
| Auto-attack (melee) | Player's current elemental attachment (or none) |
| Physical skill (whirlwind, shadow-dash) | Player's current elemental attachment (or none) |
| Magic skill (tornado, thunderstorm) | Skill's innate `fixedElement` — ignores player attachment |

**SkillDefinition changes:**

```ts
interface SkillDefinition {
  // ... existing fields ...
  category: 'physical' | 'magic';
  fixedElement?: Element; // Only for magic skills
}
```

### Skill Pool (updated)

Remove `arcane-bolt`. Add `tornado` and `thunderstorm`. Skill slots: 2 → 3.

| Skill | Category | Innate Element | Role | Effect |
|-------|----------|---------------|------|--------|
| Whirlwind (旋風斬) | physical | — (carries player attachment) | Melee AOE | Unchanged from SPEC-005. Applies player's element to all hit enemies. |
| Shadow Dash (暗影衝刺) | physical | — (carries player attachment) | Mobility + path damage | Unchanged from SPEC-005. Applies player's element along dash path. |
| Tornado (龍捲風) | magic | WIND | Moving AOE | Launches a wind column that travels forward. See collision model below. |
| Thunderstorm (雷暴術) | magic | THUNDER | Zonal control | Strikes a target area in front of player. See collision model below. |

**Skill slot data structure change:**
`SkillManager.slots` must change from fixed tuple `[SkillSlot, SkillSlot]` to array with length driven by `GAME_CONFIG.SKILL_SLOT_COUNT = 3`. All related exports, imports (RunState), altar pick logic, and HUD event flows must be updated.

### New Skill: Tornado (龍捲風)

- MP Cost: 30
- Cooldown: 6s
- Cast duration: 200ms
- Projectile: circular AOE (radius 48px), moves in player's facing direction at 200px/s
- Max travel distance: 300px
- **Collision model:** Moving circle with 100ms tick interval. Each tick: overlap check against enemy group. Each enemy can be hit at most once per tick. Uses `hitThisTick: Set<Enemy>` reset every tick.
- Damage per tick: `floor(baseDamage * 0.4)` — low per-tick but multi-hit over travel
- Duration: ~1.5s travel time
- No residual trail — only active hitbox moves with the projectile
- On hit: builds `HitContext(attackElement=WIND)` and calls `ReactionResolver.resolve(enemy, hitContext)`. The resolver handles element application — the skill does NOT write ElementalState directly.

### New Skill: Thunderstorm (雷暴術)

- MP Cost: 35
- Cooldown: 8s
- Cast duration: 300ms
- Target area: circle (radius 80px) centered 120px in front of player's facing direction
- Damage: `floor(baseDamage * 1.8)` — single heavy hit
- All enemies in the circle take damage simultaneously
- On hit: builds `HitContext(attackElement=THUNDER)` and calls `ReactionResolver.resolve(enemy, hitContext)`. The resolver handles element application — the skill does NOT write ElementalState directly.

### Reaction System (ReactionResolver)

New file: `src/systems/ReactionResolver.ts`

**HitContext interface:**

```ts
interface HitContext {
  source: 'auto-attack' | 'skill';
  skillType?: string;          // e.g. 'tornado', 'thunderstorm'
  attackElement: Element | null;
  hitPosition: { x: number; y: number };
  alreadyHitIds: Set<number>;  // Entity IDs already processed in this cast/chain
  isSecondaryProc: boolean;    // true = this hit is from a reaction chain, not original attack
}
```

**Authoritative Damage Pipeline (single source of truth):**

All damage sources (CombatSystem auto-attack, SkillManager skill execution) MUST follow this exact sequence:

```
1. Calculate damage amount (but do NOT apply yet)
2. Snapshot enemy's current element
3. Build HitContext (attackElement from player attachment or skill fixedElement)
4. Call ReactionResolver.resolve(enemy, hitContext, snapshotElement)
   - If (snapshotElement + attackElement) matches reaction table:
     → Execute reaction effect (bonus damage, chain, stun, etc.)
     → Clear enemy's element (consumed by reaction)
   - Else if attackElement is not null:
     → Write/overwrite enemy's element (this is the ONLY place elements are written to enemies)
5. Apply original damage + any reaction bonus damage via enemy.takeDamage()
6. Death cleanup runs after damage application
```

**Critical: ReactionResolver is called BEFORE damage. Element writes are ONLY done by the resolver, never by skills or CombatSystem directly.**

**Reaction Table (MVP — 2 reactions only):**

| Enemy Element | Attack Element | Reaction | Effect |
|--------------|---------------|----------|--------|
| WATER | THUNDER | Electro Storm (感電風暴) | Chain lightning + stun |
| FIRE | WIND | Flame Burst (烈焰爆燃) | Explosion + fire spread |
| Any other combo | — | NO_REACTION | Attack element overwrites enemy element |

**Anti-recursion rule:** A secondary proc (`isSecondaryProc = true`) can apply elements but CANNOT trigger another reaction. This prevents infinite chain loops within a single cast.

### Reaction: Electro Storm (感電風暴)

Trigger: Thunderstorm hits an enemy with WATER element.

Effect:
1. The triggering enemy takes bonus damage: `floor(baseDamage * 0.5)` (configurable `ELECTRO_STORM_BONUS_RATIO`)
2. Chain lightning jumps to nearby enemies:
   - Jump radius: 120px (`CHAIN_LIGHTNING_RANGE`)
   - Max jumps: 4 (`CHAIN_LIGHTNING_MAX_JUMPS`)
   - Damage per jump: decays — 80%, 60%, 40%, 20% of bonus damage
   - Each enemy can only be hit once per chain (`visitedSet` + `alreadyHitIds`)
   - Jump targets do NOT need to be wet — lightning arcs freely
   - Search scope: enemies in current room only (not full map)
3. All hit enemies (including trigger target) are stunned

Stun details (see Crowd Control section below).

### Reaction: Flame Burst (烈焰爆燃)

Trigger: Tornado hits an enemy with FIRE element.

Effect:
1. The triggering enemy takes bonus explosion damage: `floor(baseDamage * 1.5)` (configurable `FLAME_BURST_BONUS_RATIO`)
2. The triggering enemy's FIRE element is consumed (cleared)
3. The tornado gains a temporary "flame aura" state for 1000ms:
   - Visual: tornado tints orange-red
   - Any enemy subsequently touched by the tornado during this aura automatically receives `ElementalState = FIRE`
   - This is a secondary proc — it applies the element but does NOT trigger another Flame Burst reaction (anti-recursion rule)
4. Enemies that receive FIRE from the flame aura can be detonated by a FUTURE tornado cast (not the current one)

### Crowd Control: Stun Layer

**Problem:** Enemy currently uses a single `state` enum for AI. Directly setting `state = STUNNED` conflicts with KNOCKBACK, CHARGING, SUMMONING, etc.

**Solution:** Add an independent crowd control layer to Enemy:

```ts
interface CrowdControlState {
  stunRemainingMs: number; // > 0 means stunned
}
```

- When `stunRemainingMs > 0`: enemy velocity = 0, cannot transition AI state, cannot attack
- AI state is FROZEN (not overwritten) — when stun expires, enemy resumes from the state it was in
- If enemy is in KNOCKBACK when stunned: knockback completes first (knockback duration is short ~200ms), then stun applies
- Stun duration: 1500ms (`ELECTRO_STUN_DURATION_MS`)
- Visual: electric particle effect on stunned enemy, slight blue-white tint

### Map Hazards

#### Water Pool (水潭)

New file: `src/entities/WaterPool.ts`

- Size: 2x2 tiles (128x128 px)
- Placement: room floors and corridors
- Interaction: Phaser overlap with player sprite
- On overlap: call `player.elementalState.apply(Element.WATER)` — refreshes countdown if already WATER, overwrites if different element
- Overlap callback uses a flag to avoid re-triggering every frame: only fire on first overlap, then set `isPlayerInside = true`; reset on overlap end
- Visual: dark blue semi-transparent rectangle (#1a3a5c, alpha 0.6), subtle wave animation (sin-based y-offset on child sprites)

#### Torch (火把)

New file: `src/entities/Torch.ts`

- Size: 1x1 tile (64x64 px)
- Placement: room walls only (not corridors)
- Interaction: proximity check (distance < 48px from player center), NOT overlap (torch is against wall)
- On proximity: call `player.elementalState.apply(Element.FIRE)`
- Same re-trigger guard as Water Pool
- Visual: orange rectangle placeholder (#cc6600), upward-drifting fire particle emitter (orange → red, lifespan 400ms)

#### Spawn Rules

- Room: 30% chance for 1-2 torches (wall-adjacent tiles), 20% chance for 1 water pool (floor tile)
- Corridor: water pools only, low chance (~10%)
- Altar rooms: NO hazards (avoid interfering with altar interaction)
- `DungeonGenerator` produces `hazards: HazardData[]` array in its output, containing `{ type, tileX, tileY }`. `GameScene` instantiates entities from this data.

### Architecture Summary

**New files:**
- `src/systems/ElementalState.ts` — element state class (player countdown + enemy permanent variants)
- `src/systems/ReactionResolver.ts` — reaction table, HitContext, resolve logic, anti-recursion
- `src/entities/WaterPool.ts` — water pool map hazard
- `src/entities/Torch.ts` — torch map hazard

**Modified files:**
- `src/config.ts` — element enum, reaction constants, new skill definitions, `SKILL_SLOT_COUNT = 3`, hazard spawn rates
- `src/entities/Player.ts` — attach ElementalState instance, expose it
- `src/entities/Enemy.ts` — attach ElementalState instance, add CrowdControlState, update `takeDamage()` signature to accept HitContext, stun logic in update loop
- `src/systems/CombatSystem.ts` — auto-attack builds HitContext with player element, calls ReactionResolver BEFORE damage (follows Authoritative Damage Pipeline)
- `src/systems/SkillManager.ts` — remove arcane-bolt, add tornado + thunderstorm, slots → array[3], physical/magic category, skill execution calls ReactionResolver
- `src/systems/DungeonGenerator.ts` — produce `hazards[]` data in generation output
- `src/scenes/GameScene.ts` — instantiate WaterPool/Torch from hazard data, setup overlap/proximity detection, pass hazard cleanup on floor transition
- `src/scenes/UIScene.ts` — 3rd skill button layout
- `src/systems/DebugManager.ts` — new commands: `setPlayerElement(element)`, `setEnemyElement(element)`, `clearElements()`, `triggerReaction(type)`, `listHazards()`

### Acceptance Criteria

1. Player overlapping Water Pool gains WATER attachment (blue tint visible)
2. Player near Torch gains FIRE attachment (orange tint visible)
3. Element attachment lasts 10s, tint flickers in last 3s, then clears
4. New element overwrites old element on player
5. Auto-attack transfers player's element to enemy (enemy shows element tint)
6. Whirlwind (physical) transfers player's element to all hit enemies
7. Shadow Dash (physical) transfers player's element along dash path
8. Tornado deals WIND damage, applies WIND element to enemies regardless of player attachment
9. Thunderstorm deals THUNDER damage, applies THUNDER element regardless of player attachment
10. WATER enemy hit by Thunderstorm triggers Electro Storm: chain lightning visual + stun
11. Chain lightning jumps up to 4 enemies within 120px, damage decays per jump
12. Stunned enemies freeze for 1.5s with electric visual, resume AI after
13. FIRE enemy hit by Tornado triggers Flame Burst: explosion damage + tornado gains flame aura
14. Flame aura tornado spreads FIRE element to subsequently touched enemies (no recursive reaction)
15. Enemies that gained FIRE from flame aura can be detonated by a future Tornado cast
16. Enemy element persists until consumed by reaction (no natural expiry)
17. Floor change / death clears player element; gameplayLocked pauses countdown
18. Stun does not overwrite enemy AI state — uses independent CC layer
19. 3 skill slots in HUD, all functional
20. Altar skill pick works with 4-skill pool and 3 slots
21. Water pools spawn in rooms (20%) and corridors (10%)
22. Torches spawn in rooms only (30%, wall-adjacent)
23. Altar rooms have no hazards
24. DungeonGenerator outputs hazards[] data; GameScene instantiates from data
25. Debug commands: setPlayerElement, setEnemyElement, clearElements, triggerReaction, listHazards all functional
26. Settlement order: snapshot element → resolve reaction → apply damage → death cleanup
27. Anti-recursion: secondary procs apply elements but do not trigger reactions
