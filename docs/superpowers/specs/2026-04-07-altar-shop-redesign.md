# Phase 5e: Altar Shop Redesign

## Summary

Redesign the altar from a "pick 1 of 3 random cards" system into a two-phase interaction: skill pick (three-choose-one) followed by a repeatable upgrade shop with grid UI.

## Goals

- Altar stat upgrades work like a shop: all 6 upgrades visible, buy as many as you can afford
- Skill selection preserved as three-choose-one (first visit per floor only)
- Altar is reusable within a floor (not consumed after use)
- Shop UI uses a 3x2 grid layout (reference: Rumble Raiders talent screen)

## Interaction Flow

```
Player approaches altar (60px range)
  → Stops for 500ms
  → First time this floor:
      → Skill pick panel (3 random skills, pick 1)
        → Select / Skip
        → Auto-transition to upgrade shop
  → Subsequent visits:
      → Directly open upgrade shop
  → Shop: free browsing, buy any affordable upgrade, press X to close
  → Altar remains active (returns to IDLE state)
```

## Altar State Machine Changes

Current states: IDLE → IN_RANGE → ARMING → OPEN → CONSUMED

New states: IDLE → IN_RANGE → ARMING → OPEN → COOLDOWN → IDLE

- Replace CONSUMED with COOLDOWN
- COOLDOWN: entered when panel closes. Altar ignores proximity while in COOLDOWN. Transitions to IDLE only when player leaves the 60px range.
- This prevents re-trigger when player is still standing near the altar after closing shop.
- Add `skillOffered: boolean` flag per altar instance. Set to `true` after skill phase completes (selection made or skip pressed). Opening skill panel without completing does NOT set this flag.
- Altar visual stays at full alpha (no dimming)

### Event Contract

- `altar-activated`: emitted by Altar when ARMING timer completes. Payload: altar instance reference.
- `altar-session-closed`: emitted by UpgradePanel when shop is closed (X button). Altar listens and transitions OPEN → COOLDOWN.
- `ui-input-lock` / `ui-input-unlock` + `gameplay-lock`: single lock acquired at session start (skill phase or shop), released only when shop closes. Phase transition (skill → shop) does NOT unlock/resume — continuous single lock throughout entire altar session.

## Skill Pick Panel

- 3 random skill cards, pick 1
- 2 skill slots; if full: picking owned skill = upgrade, new skill = replace (slot selection UI)
- 1 free reroll, subsequent rerolls cost gold
- Skip button available (skips skill phase, proceeds to shop)
- Only appears on first altar activation per floor (gated by `skillOffered` flag)
- After selection/skip, auto-transitions to upgrade shop (instant cut, no animation)
- If skill pool is empty (all skills learned + maxed), skip skill phase entirely, go straight to shop

### Skill Phase Flow Detail

```
Skill panel opens (3 random cards)
  ├─ Select owned skill → upgrade it → skillOffered=true → shop
  ├─ Select new skill (slots available) → learn it → skillOffered=true → shop
  ├─ Select new skill (slots full) → slot selection modal
  │     ├─ Pick slot to replace → replace → skillOffered=true → shop
  │     └─ Cancel → return to skill panel (same 3 cards, can re-pick)
  ├─ Reroll (free 1st, paid after) → new 3 cards → same flow
  └─ Skip → skillOffered=true → shop
```

## Upgrade Shop UI

### Layout: 3x2 Grid (450px wide)

```
┌─────────────────────────────────────┐
│           UPGRADES (title)          │
│                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐
│  │  [icon]  │ │  [icon]  │ │  [icon]  │
│  │  Attack  │ │  Max HP  │ │  Armor  │
│  │  +8      │ │  +30    │ │  +0     │
│  │  50G     │ │  15G    │ │  15G    │
│  │ Lv.2/10  │ │ Lv.1/10 │ │ Lv.0/10 │
│  └─────────┘ └─────────┘ └─────────┘
│  ┌─────────┐ ┌─────────┐ ┌─────────┐
│  │  [icon]  │ │  [icon]  │ │  [icon]  │
│  │CritDmg  │ │Recovery │ │MoveSpd  │
│  │  +0%    │ │  +0     │ │  +0     │
│  │  25G    │ │  20G    │ │  30G    │
│  │ Lv.0/5  │ │ Lv.0/5  │ │ Lv.0/3  │
│  └─────────┘ └─────────┘ └─────────┘
│                                     │
│    Gold: 160                   (X)  │
└─────────────────────────────────────┘
```

### Grid Cell Content

Each cell displays:
1. Icon (Graphics API placeholder — colored shape per upgrade type)
2. Upgrade name
3. Cumulative bonus (e.g., "+8" for Attack at Lv.2 means 2 × +4)
4. Next purchase cost
5. Current level / max level

### Cell States

| State | Border | Alpha | Interaction |
|-------|--------|-------|-------------|
| Affordable | Gold (0xffcc00) | 1.0 | Clickable, hover highlight |
| Too expensive | Gray (0x666666) | 0.5 | Click shows "Not enough gold" |
| MAX level | Gray (0x666666) | 0.7 | Shows "MAX", not clickable |

### Purchase Behavior

- Click affordable cell → gold deducted, stat applied, cell refreshes (level +1, new cost, bonus updated)
- Gold display updates immediately
- Cell border/alpha states refresh after each purchase
- "Not enough gold" flash text on clicking unaffordable cell (centered on cell, 800ms duration, throttled — max 1 per second)
- MAX level cells: click does nothing (no feedback needed)
- Max HP+ also heals player by 30, clamped to maxHp (existing behavior preserved)

### Close Button

- X button bottom-right corner
- Closes shop, unlocks input, altar returns to IDLE

## Stat Upgrade Definitions (Unchanged)

| Upgrade | Effect/Level | Max | Base Cost | Cost Scale |
|---------|-------------|-----|-----------|-----------|
| Attack+ | +4 min/max damage | 10 | 20G | +15/lv |
| Armor+ | +3 damage reduction | 10 | 15G | +10/lv |
| Crit Damage+ | +0.10 multiplier | 5 | 25G | +20/lv |
| Recovery+ | +1 HP/s | 5 | 20G | +15/lv |
| Move Speed+ | +15 speed | 3 | 30G | +20/lv |
| Max HP+ | +30 HP + heal 30 | 10 | 15G | +10/lv |

Cost formula: `baseCost + currentLevel × costScale`

## Files to Modify

1. **Altar.ts** — Remove CONSUMED state, add `skillOffered` flag, cycle back to IDLE on close
2. **UpgradePanel.ts** — Major rewrite: split into two phases (skill pick + shop grid), new grid layout
3. **config.ts** — No changes (upgrade definitions unchanged)
4. **StatsManager.ts** — No changes (level tracking already supports this)
5. **GameScene.ts** — Update altar-activated handler for two-phase flow
6. **UIScene.ts** — Update panel mounting if needed
7. **DebugManager.ts** — Add debug commands for new altar flow (e.g., reset skillOffered)

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| All 6 stats maxed | Shop opens normally, all cells show MAX. Player can browse and close. |
| 0 gold, first visit | Skill phase runs normally (skills are free). Then shop opens with all cells dimmed. |
| 0 gold, subsequent visit | Shop opens with all cells dimmed. Player can browse and close. |
| Skill pool empty (first visit) | Skip skill phase, go straight to shop. `skillOffered` set to true. |
| Player has 2 skills, all maxed (first visit) | Skill panel shows 3 cards. Selecting owned = upgrade. Selecting new = replace slot. |

## Acceptance Criteria

1. Approaching altar and stopping for 500ms opens the altar session
2. First visit per floor: skill three-choose-one appears before shop
3. Subsequent visits: shop opens directly (no skill phase)
4. Shop displays all 6 upgrades in 3x2 grid with correct level/cost/bonus
5. Clicking affordable cell purchases upgrade, deducts gold, updates cell immediately
6. Clicking unaffordable cell shows "Not enough gold" flash
7. MAX level cells are visually distinct and non-interactive
8. Gold display updates in real-time after each purchase
9. X button closes shop and unlocks input
10. After closing shop, altar does NOT re-trigger while player stands still in range
11. After player walks away and returns, altar can be activated again
12. Skill→shop transition maintains input lock throughout (no flicker)
13. `skillOffered` flag persists correctly — only one skill phase per floor
14. Slot replacement cancel returns to skill panel, does not skip to shop
15. DebugManager has commands to test altar flow (reset skillOffered, open shop directly)

## Out of Scope

- New upgrade types
- Changing skill system mechanics
- Visual asset changes (still using Graphics API placeholders)
- Sound effects
