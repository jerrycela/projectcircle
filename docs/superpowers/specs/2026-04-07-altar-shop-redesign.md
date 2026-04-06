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

New states: IDLE → IN_RANGE → ARMING → OPEN → IDLE (cycle back)

- Remove CONSUMED state
- Add `skillOffered: boolean` flag per altar instance, set to true after first activation on current floor
- On panel close: altar returns to IDLE, not CONSUMED
- Altar visual stays at full alpha (no dimming)

## Skill Pick Panel (Unchanged)

- 3 random skill cards, pick 1
- 2 skill slots; if full: picking owned skill = upgrade, new skill = replace (slot selection UI)
- 1 free reroll, subsequent rerolls cost gold
- Skip button available
- Only appears on first altar activation per floor
- After selection/skip, auto-transitions to upgrade shop

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
- "Not enough gold" flash text on clicking unaffordable cell
- Max HP+ also heals player by 30 (existing behavior preserved)

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

## Out of Scope

- New upgrade types
- Changing skill system mechanics
- Visual asset changes (still using Graphics API placeholders)
- Sound effects
