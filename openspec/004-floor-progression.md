# SPEC-004: Multi-Floor Progression

> Status: PROPOSED
> Priority: P0
> Phase: 5a
> Created: 2026-04-06
> Dual-reviewed: Codex (gpt-5.4) + Gemini (gemini-2.5-pro) — 5 P1 addressed

## Goal

Add floor progression: clear all rooms -> find staircase -> descend to harder floor.
Death resets to Floor 1 but preserves upgrades (Roguelite model).

## Design Spec

See `docs/superpowers/specs/2026-04-06-floor-progression-design.md` for full design.

## Summary

- FloorManager: floor state + difficulty scaling (exact formulas)
- Staircase entity: HIDDEN -> REVEALED -> ACTIVATED state machine
- Scene restart with RunState data passing for floor transitions
- EventBus.removeAllListeners() on shutdown for cleanup
- New death flow: auto-restart to Floor 1 (replaces old overlay)
- HUD floor label: "Floor X"
- DungeonGenerator accepts FloorConfig parameter
- Enemy accepts hpScale/atkScale
- DebugManager: setFloor(n), revealStaircase()
- StatsManager: exportState() / importState()

## Acceptance Criteria

AC1-AC12: See design spec.
