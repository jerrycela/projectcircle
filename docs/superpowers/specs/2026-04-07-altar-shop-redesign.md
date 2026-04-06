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
  → Altar enters COOLDOWN (transitions to IDLE when player leaves range)
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
- `altar-session-closed`: emitted by UpgradePanel when shop is closed (X button) or by any teardown path. Payload: `{ altar: Altar, reason: 'close-button' | 'teardown' | 'debug' }`. Altar listens and transitions OPEN → COOLDOWN.
- `ui-input-lock` / `ui-input-unlock` + `gameplay-lock`: single lock acquired at session start (skill phase or shop), released only when shop closes. Phase transition (skill → shop) does NOT unlock/resume — continuous single lock throughout entire altar session.
- **Invariant**: any altar session end path (normal close, scene shutdown, debug force-close) MUST emit `altar-session-closed` and release the single lock. UpgradePanel's `destroy()` method must call cleanup if session is active.
- Stat changes are applied via `StatsManager.addBonus()` / `StatsManager.incrementLevel()`. StatsManager is responsible for emitting any stat-changed events — UpgradePanel does not emit stat events directly.

## Skill Pick Panel

- 3 random skill cards, pick 1
- 2 skill slots; if full: picking owned skill = upgrade, new skill = replace (slot selection UI)
- 1 free reroll, subsequent rerolls cost 20G flat (not escalating). Reroll button disabled + dimmed if gold < 20.
- Rerolled cards are drawn from remaining pool; duplicates with current 3 cards are allowed (pool is small).
- Skip button available (skips skill phase, proceeds to shop)
- Only appears on first altar activation per floor (gated by `skillOffered` flag)
- After selection/skip, auto-transitions to upgrade shop (instant cut, no animation)
- If skill pool is empty (all skills learned at max level), skip skill phase entirely, go straight to shop

### Skill Level System

Add `level: number` to SkillSlot (default 1 when learned). Each skill has max level 3.

| Skill | Lv1 | Lv2 | Lv3 |
|-------|-----|-----|-----|
| Whirlwind | 1.5x dmg, r=100 | 1.8x dmg, r=110 | 2.1x dmg, r=120 |
| Shadow Dash | 0.8x dmg, d=150 | 1.0x dmg, d=170 | 1.2x dmg, d=190 |
| Arcane Bolt | 2.0x dmg, pierce=2 | 2.4x dmg, pierce=3 | 2.8x dmg, pierce=4 |

Scaling rule: `damageMultiplier += 0.3 per level` for Whirlwind/Arcane Bolt, `+0.2` for Shadow Dash. Secondary stat (radius/distance/pierce) increases by fixed amount per level as shown.

Implementation: add `levelScaling` array to `SkillDefinition` in config.ts. `SkillSlot` gains `level: number`. `SkillManager.upgradeSkill(type)` increments level (capped at 3). `calcSkillDamage` and `executeSkill` read current level to pick multiplier/params.

Skill card in altar UI shows current level if owned: "Whirlwind Lv.1 → Lv.2".

### Skill Phase Flow Detail

```
Skill panel opens (3 random cards)
  ├─ Select owned skill (level < max) → upgrade it → skillOffered=true → shop
  ├─ Select owned skill (level = max) → not possible (maxed skills excluded from pool)
  ├─ Select new skill (slots available) → learn it at Lv.1 → skillOffered=true → shop
  ├─ Select new skill (slots full) → slot selection modal
  │     ├─ Pick slot to replace → replace (new at Lv.1) → skillOffered=true → shop
  │     └─ Cancel → return to skill panel (same 3 cards, can re-pick)
  ├─ Reroll (free 1st, then 20G) → new 3 cards → same flow
  └─ Skip → skillOffered=true → shop
```

Skill pool for card draw: all skills where either (a) player doesn't own it, or (b) player owns it at level < max. Maxed skills are excluded.

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
- Closes shop, emits `altar-session-closed`, unlocks input, altar transitions OPEN → COOLDOWN

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

1. **Altar.ts** — Replace CONSUMED with COOLDOWN, add `skillOffered` flag, COOLDOWN→IDLE on leave range
2. **UpgradePanel.ts** — Major rewrite: two-phase flow (skill pick + shop grid), new grid layout, destroy cleanup
3. **config.ts** — Add `levelScaling` to SkillDefinition, add reroll cost constant
4. **SkillManager.ts** — Add `level` to SkillSlot, add `upgradeSkill()`, update `calcSkillDamage`/`executeSkill` for level scaling, update `exportState`/`importState`
5. **StatsManager.ts** — No changes (level tracking already supports this)
6. **GameScene.ts** — Update altar-activated handler for two-phase flow
7. **UIScene.ts** — Update panel mounting if needed
8. **DebugManager.ts** — Add debug commands: `resetSkillOffered()`, `openShop()`, `setSkillLevel(type, level)`

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| All 6 stats maxed | Shop opens normally, all cells show MAX. Player can browse and close. |
| 0 gold, first visit | Skill phase runs normally (skills are free). Then shop opens with all cells dimmed. |
| 0 gold, subsequent visit | Shop opens with all cells dimmed. Player can browse and close. |
| Skill pool empty (first visit) | Skip skill phase, go straight to shop. `skillOffered` set to true. |
| Player has 2 skills at max level (first visit) | All owned skills excluded from pool (maxed). Only unowned skills appear. If no unowned skills either → pool empty → skip to shop. |
| Session interrupted (scene shutdown) | UpgradePanel.destroy() emits `altar-session-closed` with reason `teardown`, releases lock. |
| Reroll with insufficient gold | Reroll button disabled + dimmed. Click does nothing. |

## Acceptance Criteria

| AC | Description | Verification |
|----|-------------|-------------|
| 1 | Approaching altar and stopping 500ms opens session | Walk to altar, stop, observe panel opens |
| 2 | First visit: skill pick appears before shop | `__debug.teleportToRoom(altarRoom)`, approach altar, verify skill panel first |
| 3 | Subsequent visits: shop opens directly | Close shop, walk away, return → verify no skill panel |
| 4 | Shop displays 6 upgrades in 3x2 grid | `__debug.giveGold(9999)`, open shop, verify all 6 cells visible with correct data |
| 5 | Purchase deducts gold, updates cell | Buy Attack+, verify gold decreased by cost, cell shows Lv+1 and new price |
| 6 | Unaffordable cell shows flash text | Set gold to 0 via `__debug.giveGold(-9999)`, click cell, verify flash |
| 7 | MAX cells visually distinct, non-interactive | `__debug` max out a stat, verify cell shows MAX, click does nothing |
| 8 | Gold display updates in real-time | Buy 3 items in succession, verify gold label updates each time |
| 9 | X closes shop, unlocks input | Click X, verify joystick/movement works immediately |
| 10 | No re-trigger while standing still | Close shop, do NOT move, wait 2s → altar must not reopen |
| 11 | Re-activatable after leaving range | Close shop, walk away (>60px), return, stop → altar reopens |
| 12 | Skill→shop lock continuous | Open altar first time, observe no input flicker during transition |
| 13 | skillOffered persists per floor | First visit select skill → close → reopen → verify no skill panel |
| 14 | Slot replace cancel returns to skill panel | With 2 skills, pick new skill → cancel replace → verify back at same 3 cards |
| 15 | Debug commands work | `__debug.resetSkillOffered()` → reopen altar → skill panel appears again |
| 16 | Skill upgrade works | Own whirlwind Lv1, pick whirlwind from altar → verify Lv2, damage increased |
| 17 | Reroll costs 20G after first free | Use free reroll (new cards), then verify 20G deducted on second reroll |
| 18 | Session cleanup on teardown | Force scene restart during open panel → verify no stuck lock state |

## Out of Scope

- New upgrade types or new skills
- Visual asset changes (still using Graphics API placeholders)
- Sound effects
- Skill rebalancing beyond level scaling defined above
