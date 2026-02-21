# Phase 3: Dungeon Core + Thief Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dungeon crystal (defense objective) and thief hero that rushes the crystal, creating split-attention gameplay.

**Architecture:** Crystal is a standalone entity (not BattleUnit) with HP, sprite, and HP bar. Thief is a new hero with `targetCrystal: true` flag on BattleUnit. Crystal-targeting units override normal AI movement to head for crystal, then attack it when in range. Thief is immune to one-time traps.

---

### Task 1: Add crystal positions to layout templates

**File:** `src/data/layouts/index.ts`

Add `crystalPosition` to each layout (relative to room origin):
- empty: `{ x: 175, y: 360 }` (center-bottom)
- corridor: `{ x: 175, y: 370 }` (end of corridor)
- fortress: `{ x: 175, y: 200 }` (inside fortress)
- split: `{ x: 175, y: 370 }` (center-bottom)
- arena: `{ x: 175, y: 180 }` (center of diamond)
- bottleneck: `{ x: 175, y: 330 }` (behind bottleneck)
- barricade: `{ x: 175, y: 360 }` (behind barricades)
- flanking: `{ x: 175, y: 320 }` (center-back)

### Task 2: Add crystal tracking to RunState

**Files:** `src/state/game-state.ts`, `src/state/actions.ts`

RunState additions:
- `crystalHP: number` (default 250)
- `crystalMaxHP: number` (default 250)
- `crystalsIntact: number` (count of rooms where crystal survived, default 0)

Actions:
- `damageCrystal(state, damage)` — reduce crystalHP
- `recordCrystalSurvival(state)` — increment crystalsIntact if crystalHP > 0
- `resetCrystalHP(state)` — reset to max for new room (NOT called — crystal persists)

### Task 3: Create thief hero definition + texture

**Files:**
- Create: `src/data/heroes/thief.ts`
- Modify: `src/data/registry.ts` (register thief)
- Modify: `src/utils/texture-factory.ts` (thief texture)
- Modify: `src/data/registry.ts` wave configs (add thief at distance 3+)

Thief stats:
```
id: 'thief', name: '盜賊'
HP: 40, ATK: 8, interval: 1.0s, speed: 150, range: 25
goldReward: 20, xpReward: 15
aiType: 'melee_aggressive'
```

### Task 4: Crystal rendering in battle-phase

Crystal entity fields in BattlePhase:
- `crystalSprite`, `crystalHPBar`, `crystalGlow`
- Position from layout's `crystalPosition`
- Render as glowing diamond shape
- Show HP bar above crystal

### Task 5: Crystal targeting + thief AI

BattleUnit addition: `targetCrystal: boolean`
- Thief: always true
- Regular heroes: 30% chance true (decided at spawn)

In applyMovement:
- If `targetCrystal` and crystal alive and unit done with waypoints:
  - Override AI movement toward crystal position
  - When within attack range, attack crystal

### Task 6: Thief trap immunity

In updateTraps (battle-phase.ts):
- Before processing one-time trap results, filter out results for thief units
- Thief identified by `definitionId === 'thief'`
- Persistent area effects (swamp, totem) still apply

### Task 7: Crystal survival reward

In battle end / result transition:
- If crystal HP > 0, increment `crystalsIntact`
- Show crystal survival status in result phase
- Gold bonus based on crystals intact (from design: 2-3 = +30%, 4 = +30% + extra choice, all = +30% + extra + rare trap)
