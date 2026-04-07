# Hostage Rescue & Companion Nurturing System — Design Document

**Date:** 2026-04-07
**Spec:** openspec/007-hostage-companion-system.md
**Status:** Design complete, dual review passed (with revisions)

## Summary

Add hostage rooms to dungeon floors with caged companion NPCs guarded by elite Wardens. Players rescue companions to unlock them in a collection album, then raise affection by gifting companion-specific tokens and generic resources to unlock 3 tiers of portrait art. All progress persists via localStorage.

## Key Design Decisions

1. **Panel over town scene** — No town scene exists. Album panel in UIScene provides gifting and collection viewing at low implementation cost.
2. **Companion-specific tokens as primary affection source** — Tokens drop from element-matched enemies, creating targeted farming loops. Gold/material as universal fallback.
3. **Repeat rescue for bonus affection (+15)** — Already-rescued companions still appear in dungeons. Re-rescuing grants +15 affection, keeping hostage rooms relevant on every run.
4. **localStorage persistence with schema version** — Companion progress survives death. Versioned schema (v1) for future migration.
5. **4 element companions + 1 non-element** — Ember/Coral/Volt/Flora map to existing Fire/Water/Thunder/Wind elements. Luna is non-elemental (drops from high floors) to avoid adding undefined elements.
6. **Existing material system unchanged** — No refactoring of material types. New token items tracked separately in CompanionManager.
7. **Depth-gated portrait stages** — Stage 2 requires floor 3+, Stage 3 requires floor 5+. Prevents degenerate low-floor farming.
8. **Enemy element assignment** — Add optional `element` field to EnemyConfig. Prerequisite for token drop logic.

## Dual Review Findings (Resolved)

| Issue | Resolution |
|-------|------------|
| Poison/Dark elements don't exist in codebase | Flora→Wind, Luna→non-element with floor-based drops |
| HOSTAGE room state machine undefined | Follows normal UNVISITED→ACTIVE→CLEARED; cleared on Warden kill |
| No enemy element field | Add optional `element?: Element` to EnemyConfig |
| Gold gift ratio too low (+1/100g) | Raised to +5/100g |
| No depth gating on stages | Stage 2: floor 3+, Stage 3: floor 5+ |
| "Environment-adjacent" drop undefined | Removed; v1 uses element-only drops |
| Floor assignment ambiguity | Always assign all 5, never skip |
| No affection cap | Caps at 600 (Stage 3 max) |
| Repeat rescue too low (+10) | Raised to +15 |
| No schema version | Added `version: 1` to persistence schema |
| Missing ACs | Expanded from 34 to 50 ACs |

## Architecture

### New Files (3)
- `src/entities/Hostage.ts` — Caged NPC entity (Container-based, state machine: CAGED→RESCUED→FREED)
- `src/systems/CompanionManager.ts` — State management + localStorage + floor assignment + run mapping
- `src/ui/CompanionPanel.ts` — Album overview + detail + gifting UI

### Modified Files (7)
- `src/config.ts` — Companion definitions, Warden enemy def, token drop tables, enemy element assignments
- `src/systems/DungeonGenerator.ts` — HOSTAGE room marking, hostage room allocation
- `src/systems/LootSystem.ts` — Token drop logic on enemy kill
- `src/scenes/GameScene.ts` — CompanionManager init, Hostage/Warden spawning, rescue flow, HOSTAGE room enemy skip
- `src/scenes/UIScene.ts` — Companions HUD button, rescue button overlay, token notification
- `src/ui/HUD.ts` — Companions button
- `src/debug/DebugManager.ts` — 4 new debug commands

### Data Flow
1. DungeonGenerator creates rooms → marks one as HOSTAGE with companionId
2. CompanionManager generates run-level floor-to-companion mapping (stored in RunState)
3. GameScene spawns Hostage entity + Wardens when player enters hostage room (skips regular enemy spawning)
4. CombatSystem handles Warden combat (existing enemy logic)
5. All Wardens dead → room CLEARED → EventBus `hostage-guards-defeated` → cage becomes interactable
6. Player interacts → rescue sequence → CompanionManager.rescue(id) → EventBus `companion-rescued`
7. Enemy kills anywhere → LootSystem checks enemy element + floor against token drop table → spawns token loot
8. Token pickup → CompanionManager adds to inventory → floating notification → EventBus `companion-token-collected`
9. Album panel → player gifts tokens/resources → CompanionManager.gift() → resource deduction → affection changes → depth gate check → stage unlock

## Scope Boundaries

**In scope:**
- Hostage room generation and rescue interaction
- Warden elite enemy type
- Enemy element field assignment (prerequisite)
- CompanionManager with versioned localStorage
- Token drops from element-matched and floor-gated enemies
- Album panel (overview + detail + gifting with "Gift All")
- Depth-gated portrait unlock stages
- Token collection notifications
- Debug API extensions (4 commands)
- Placeholder graphics for all visuals

**Out of scope:**
- Town/base scene
- Companion combat participation
- Animated rescue cutscenes (simple tween only)
- Real portrait art (placeholders only)
- Material system refactoring (no new material types)
- Sound effects (placeholder-ready event hooks only)
- Heart-shaped progress bar (use rectangular with gradient)
