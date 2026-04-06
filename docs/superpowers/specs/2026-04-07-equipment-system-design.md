# Phase 5d: Equipment System Design

**Date:** 2026-04-07
**Scope:** Equipment drops + equip/unequip + comparison UI + management panel + weapon sprites
**Out of scope:** Crafting station, town scene, inventory/backpack

## 1. Data Model

### EquipmentItem Interface

```typescript
interface EquipmentItem {
  id: number              // Incrementing counter (EquipmentManager.nextId++)
  slot: EquipmentSlot     // 'weapon' | 'armor' | 'helmet' | 'accessory'
  subtype: string         // weapon: 'axe'|'sword'|'hammer'; others: 'generic'
  rarity: EquipmentRarity // 'white' | 'green' | 'blue' | 'purple'
  stats: Partial<StatBlock> // Rolled stat bonuses
  name: string            // Generated name (e.g. "Refined Sword")
}

type EquipmentSlot = 'weapon' | 'armor' | 'helmet' | 'accessory'
type EquipmentRarity = 'white' | 'green' | 'blue' | 'purple'
```

### Rarity Table

| Rarity | Affix Count | Value Multiplier | Drop Weight |
|--------|-------------|------------------|-------------|
| White  | 1           | 1.0x             | 60%         |
| Green  | 1-2         | 1.3x             | 25%         |
| Blue   | 2 (fixed)   | 1.6x             | 12%         |
| Purple | 3 (fixed)   | 1.9x             | 3%          |

Expected affix budget: white 1.0 / green 1.95 / blue 3.2 / purple 5.7

### Stat Pools Per Slot

- **Weapon:** damageFlat (adds both attackMin + attackMax), critChance, critDamage
- **Armor:** armor, maxHp
- **Helmet:** armor, maxHp, recovery
- **Accessory:** critChance, critDamage, moveSpeed, recovery

**Generation rules:**
- `rollCount = min(rarityAffixCount, slotPool.length)` — never exceed pool size
- No duplicate stat picks per item
- Value = `baseRange[stat] * rarityMultiplier * random(0.8~1.2)`
- All stat units match StatsManager internals (critChance = 0.05 means 5%, UI converts to %)
- Floor scaling: `baseRange[stat] * (1 + (floor - 1) * 0.1)` — +10% per floor

### Weapon Type Definitions (WEAPON_TYPE_DEFS in config.ts)

| Weapon  | Attack Speed Mult | Range Mult | Damage Mult | Effective DPS |
|---------|-------------------|------------|-------------|---------------|
| Axe     | 1.0x              | 1.0x       | 1.0x        | 1.00          |
| Sword   | 1.25x             | 1.0x       | 0.85x       | 1.06          |
| Hammer  | 0.7x              | 1.2x       | 1.4x        | 0.98          |

## 2. System Integration

### StatsManager Changes

Add third layer:

```typescript
private equipmentBonuses: Partial<StatBlock> = {}

getStat(key): number {
  return (this.baseStats[key] ?? 0) + (this.bonuses[key] ?? 0) + (this.equipmentBonuses[key] ?? 0)
}

setEquipmentBonuses(stats: Partial<StatBlock>): void  // Full replace
clearEquipmentBonuses(): void                          // Reset to {}
```

### EquipmentManager (new file: src/systems/EquipmentManager.ts)

**State:**
```typescript
equipped: Record<EquipmentSlot, EquipmentItem | null> = {
  weapon: null, armor: null, helmet: null, accessory: null
}
private nextId: number = 0
```

**Dependencies:** StatsManager, Player (ref), EventBus

**Core methods:**
- `equip(item: EquipmentItem): EquipmentItem | null` — place in slot, return old item, call recalcBonuses()
- `unequip(slot: EquipmentSlot): EquipmentItem | null` — clear slot, return old item, call recalcBonuses()
- `recalcBonuses()` — merge all 4 slots' stats → statsManager.setEquipmentBonuses(merged) → syncPlayerStats()
- `syncPlayerStats()` — update player.maxHp from statsManager.getStat('maxHp'), player.hp = min(player.hp, player.maxHp), emit player-hp-changed
- `generateEquipment(slot, rarity, floor): EquipmentItem` — roll random equipment per rules above
- `getWeaponModifiers(): { attackSpeedMult, rangeMult, damageMult }` — lookup WEAPON_TYPE_DEFS by equipped weapon subtype, default = axe if no weapon
- `exportState() / importState()` — for RunState cross-floor persistence

### CombatSystem Changes

Inject EquipmentManager dependency. On each attack, query live:

```typescript
const mods = this.equipmentManager.getWeaponModifiers()
const cooldown = 800 / mods.attackSpeedMult
const range = 150 * mods.rangeMult
const damage = this.rollDamage() * mods.damageMult
```

No caching — weapon swap takes effect immediately.

### buildRunState() Unified Helper

New method `GameScene.buildRunState(overrides?): RunState` used by ALL restart paths:
- `triggerFloorTransition()` → buildRunState()
- `triggerDeath()` → buildRunState({ gold: 0, hp: maxHp, mp: maxMp })
- debug `setFloor()` → buildRunState()

RunState additions:
```typescript
playerEquipment?: Record<EquipmentSlot, EquipmentItem | null>
equipmentNextId?: number  // Preserve ID counter across floors
```

Death: equipment preserved (same as upgrades).

## 3. Equipment Pickup + Comparison Panel UI

### Pickup Flow

1. Enemy dies → LootSystem rolls 3% equipment chance
2. Hit → equipmentManager.generateEquipment(randomSlot, rolledRarity, currentFloor)
3. Spawn Loot entity (type=equipment) with equipmentData field
4. **Equipment does NOT magnet** — player must walk over it (physics overlap)
5. Overlap → emit `equipment-pickup` → pause game → show comparison panel

### EquipmentComparePanel (new file: src/ui/EquipmentComparePanel.ts)

**Trigger:** `equipment-pickup` event

**Layout (450x800 portrait):**
```
+-------------------------+
|     Equipment Compare   |
+------------+------------+
|  Equipped  |  New Drop  |
|  [Name]    |  [Name]    |
|  [Rarity]  |  [Rarity]  |
|            |            |
|  ATK +10   |  ATK +15 ^ |
|  CRT  5%   |  CRT  3% v |
|  ARM  0    |  (none)    |
+------------+------------+
|  [Equip]      [Discard] |
+-------------------------+
```

**Spec:**
- Left card: current slot equipment (show "None" if empty)
- Right card: new equipment
- Stat diff marked with green arrow (better) / red arrow (worse)
- Rarity border color: white / green (#00ff00) / blue (#3399ff) / purple (#9933ff)
- Weapon cards show subtype (axe/sword/hammer) + speed/range/damage multipliers
- Stat display: critChance/critDamage shown as % in UI (internal value * 100)
- "Equip" → equipmentManager.equip(newItem), old item destroyed
- "Discard" → new item destroyed
- Panel close → unlock gameplay, destroy ground Loot entity

**Locking:** Same as UpgradePanel — emit `ui-input-lock` + `gameplay-lock: true`

### EquipmentPanel (new file: src/ui/EquipmentPanel.ts)

**Trigger:** HUD "Equipment" button (top-right, new)

**Layout:**
```
+-------------------------+
|   My Equipment     [X]  |
+-------------------------+
| [Weapon] Refined Sword x|
|  ATK+15  CRT+3%        |
|-------------------------|
| [Armor]  Iron Plate   x|
|  ARM+8   HP+50         |
|-------------------------|
| [Helmet] (empty)        |
|-------------------------|
| [Accessory] (empty)     |
+-------------------------+
```

**Spec:**
- 4 rows, each showing slot name + equipment name (rarity color) + stat summary
- x button = unequip (equipmentManager.unequip(slot), item destroyed)
- Empty slots shown grayed out
- Same gameplay lock mechanism

## 4. Weapon Sprite Switching

- Player.weaponSprite texture swaps on weapon change
- BootScene adds 3 weapon placeholder textures (colored rectangles + label, same style as enemy placeholders)
- Default (no weapon equipped) = axe texture
- Trigger: EquipmentManager.equip() emits `weapon-changed` event → Player listens and calls weaponSprite.setTexture()

## 5. LootSystem Changes

**Generation:**
- onEnemyKilled(): equipment roll success → call equipmentManager.generateEquipment()
- Loot entity gains optional `equipmentData?: EquipmentItem` field
- Equipment loot visual: rarity-colored glow circle (white/green/blue/purple tinted)

**Collection:**
- Equipment type EXCLUDED from magnet logic (distance check skips equipment)
- Uses physics overlap instead: player touches → emit `equipment-pickup` with EquipmentItem data
- All other loot types (gold/wood/ore/cloth/healthOrb) unchanged

**Slot randomization:** Equal weight across 4 slots

## 6. DebugManager Additions

| Command | Function |
|---------|----------|
| `giveEquipment(slot?, rarity?, subtype?)` | Generate + auto-equip, all params optional (default: random) |
| `removeEquipment(slot)` | Unequip specific slot |
| `removeAllEquipment()` | Unequip all 4 slots |
| `listEquipment()` | Print all 4 slots with details |

**StateSnapshot additions:**
```typescript
equipment: {
  weapon: { name, rarity, subtype, stats } | null
  armor: { name, rarity, stats } | null
  helmet: { name, rarity, stats } | null
  accessory: { name, rarity, stats } | null
}
```

## 7. New Files Summary

| File | Purpose | Est. Lines |
|------|---------|------------|
| src/systems/EquipmentManager.ts | Equipment state, generation, stat calc | ~250 |
| src/ui/EquipmentComparePanel.ts | Pickup comparison UI | ~200 |
| src/ui/EquipmentPanel.ts | Equipment management UI | ~180 |

## 8. Modified Files Summary

| File | Changes |
|------|---------|
| src/config.ts | WEAPON_TYPE_DEFS, EQUIPMENT_RARITY_DEFS, EQUIPMENT_STAT_POOLS, EQUIPMENT_BASE_RANGES |
| src/systems/StatsManager.ts | equipmentBonuses third layer |
| src/systems/CombatSystem.ts | Inject EquipmentManager, weapon modifiers on attack |
| src/systems/LootSystem.ts | Equipment generation, skip magnet, overlap pickup |
| src/entities/Player.ts | Listen weapon-changed, swap weaponSprite texture |
| src/entities/Loot.ts | equipmentData field, rarity glow visual |
| src/scenes/GameScene.ts | buildRunState() helper, EquipmentManager init, wire events |
| src/scenes/BootScene.ts | 3 weapon placeholder textures |
| src/scenes/UIScene.ts | EquipmentComparePanel + EquipmentPanel init |
| src/ui/HUD.ts | Equipment button (top-right) |
| src/debug/DebugManager.ts | 4 equipment debug commands + snapshot |

## 9. Dual Review Resolution

Reviewed by Codex (gpt-5.4) READINESS 68% VERDICT NO + Gemini (gemini-2.5-pro) READINESS 85% VERDICT YES.

All P1/P2 findings resolved in this spec:
- P1: Pickup decision flow → Section 3 comparison panel
- P1: maxHp player sync → Section 2 syncPlayerStats()
- P2: CombatSystem weapon contract → Section 2 inject EquipmentManager
- P2: attackMin/Max split → Section 1 damageFlat affix
- P2: Affix count pool cap → Section 1 rollCount = min(rolled, poolSize)
- P2: critChance unit → Section 1 "all stat units match StatsManager internals"
- P2: RunState multi-entry → Section 2 buildRunState() helper
- P2: unequip flow → Section 2 recalcBonuses()
