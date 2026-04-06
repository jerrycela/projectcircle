# Phase 5d: Equipment System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add equipment drops, equip/unequip with comparison UI, equipment management panel, and weapon sprite switching.

**Architecture:** EquipmentManager handles 4 slots + item generation. StatsManager gains a third `equipmentBonuses` layer. CombatSystem reads weapon modifiers live. Two new UI panels (compare + manage). LootSystem skips magnet for equipment, uses overlap pickup instead.

**Tech Stack:** Phaser 3, TypeScript, Arcade Physics

**Spec:** `docs/superpowers/specs/2026-04-07-equipment-system-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/config.ts` | Modify | Add EQUIPMENT_RARITY_DEFS, EQUIPMENT_STAT_POOLS, EQUIPMENT_BASE_RANGES, WEAPON_TYPE_DEFS, EquipmentItem/EquipmentSlot types |
| `src/systems/StatsManager.ts` | Modify | Add equipmentBonuses third layer |
| `src/systems/EquipmentManager.ts` | Create | Equipment slots, generation, equip/unequip, weapon modifiers, state export |
| `src/systems/CombatSystem.ts` | Modify | Inject EquipmentManager, use weapon modifiers |
| `src/systems/LootSystem.ts` | Modify | Skip magnet for equipment, overlap pickup, generate equipment items |
| `src/entities/Loot.ts` | Modify | Add equipmentData field, rarity glow |
| `src/entities/Player.ts` | Modify | Listen weapon-changed, swap weaponSprite |
| `src/scenes/BootScene.ts` | Modify | Add 3 weapon placeholder textures |
| `src/scenes/GameScene.ts` | Modify | Init EquipmentManager, buildRunState() helper, wire events |
| `src/scenes/UIScene.ts` | Modify | Init EquipmentComparePanel + EquipmentPanel, wire events |
| `src/ui/EquipmentComparePanel.ts` | Create | Pickup comparison UI (equip vs discard) |
| `src/ui/EquipmentPanel.ts` | Create | Equipment management panel (view + unequip) |
| `src/ui/HUD.ts` | Modify | Add equipment button |
| `src/debug/DebugManager.ts` | Modify | Add 4 equipment debug commands + snapshot |

---

### Task 1: Equipment Config + Types

**Files:**
- Modify: `src/config.ts` (append after line 319)

- [ ] **Step 1: Add equipment types and config definitions**

Add the following to the end of `src/config.ts`:

```typescript
// ---- Equipment System ----

export type EquipmentSlot = 'weapon' | 'armor' | 'helmet' | 'accessory';
export type EquipmentRarity = 'white' | 'green' | 'blue' | 'purple';

export interface EquipmentItem {
  id: number;
  slot: EquipmentSlot;
  subtype: string;
  rarity: EquipmentRarity;
  stats: Partial<Record<keyof import('./systems/StatsManager').StatBlock, number>>;
  name: string;
}

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'helmet', 'accessory'];

export const EQUIPMENT_RARITY_DEFS: Record<EquipmentRarity, {
  affixCount: number | { min: number; max: number };
  valueMult: number;
  dropWeight: number;
  color: number;
  label: string;
}> = {
  white:  { affixCount: 1,              valueMult: 1.0, dropWeight: 0.60, color: 0xffffff, label: 'Common' },
  green:  { affixCount: { min: 1, max: 2 }, valueMult: 1.3, dropWeight: 0.25, color: 0x00ff00, label: 'Uncommon' },
  blue:   { affixCount: 2,              valueMult: 1.6, dropWeight: 0.12, color: 0x3399ff, label: 'Rare' },
  purple: { affixCount: 3,              valueMult: 1.9, dropWeight: 0.03, color: 0x9933ff, label: 'Epic' },
};

export const EQUIPMENT_STAT_POOLS: Record<EquipmentSlot, string[]> = {
  weapon:    ['damageFlat', 'critChance', 'critDamage'],
  armor:     ['armor', 'maxHp'],
  helmet:    ['armor', 'maxHp', 'recovery'],
  accessory: ['critChance', 'critDamage', 'moveSpeed', 'recovery'],
};

// Base range per affix at floor 1. Floor scaling: value * (1 + (floor-1) * 0.1)
export const EQUIPMENT_BASE_RANGES: Record<string, { min: number; max: number }> = {
  damageFlat: { min: 3, max: 8 },       // added to both attackMin and attackMax
  armor:      { min: 2, max: 5 },
  maxHp:      { min: 15, max: 40 },
  critChance: { min: 0.01, max: 0.03 },  // internal 0-1 scale
  critDamage: { min: 0.05, max: 0.15 },
  recovery:   { min: 0.5, max: 1.5 },
  moveSpeed:  { min: 8, max: 20 },
};

export const WEAPON_TYPE_DEFS: Record<string, {
  label: string;
  attackSpeedMult: number;
  rangeMult: number;
  damageMult: number;
}> = {
  axe:    { label: 'Axe',    attackSpeedMult: 1.0,  rangeMult: 1.0, damageMult: 1.0 },
  sword:  { label: 'Sword',  attackSpeedMult: 1.25, rangeMult: 1.0, damageMult: 0.85 },
  hammer: { label: 'Hammer', attackSpeedMult: 0.7,  rangeMult: 1.2, damageMult: 1.4 },
};

export const WEAPON_SUBTYPES = ['axe', 'sword', 'hammer'] as const;

// Name prefixes per rarity for generated equipment names
export const EQUIPMENT_NAME_PREFIXES: Record<EquipmentRarity, string[]> = {
  white:  ['Worn', 'Old', 'Plain'],
  green:  ['Sturdy', 'Refined', 'Solid'],
  blue:   ['Superior', 'Fine', 'Enchanted'],
  purple: ['Legendary', 'Cursed', 'Ancient'],
};

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  helmet: 'Helmet',
  accessory: 'Accessory',
};
```

- [ ] **Step 2: Fix StatBlock import to avoid circular dependency**

The `EquipmentItem.stats` type references `StatBlock`. To avoid circular imports, change the stats type to use inline keys:

```typescript
// Replace the stats line in EquipmentItem interface with:
export interface EquipmentItem {
  id: number;
  slot: EquipmentSlot;
  subtype: string;
  rarity: EquipmentRarity;
  stats: Partial<Record<'attackMin' | 'attackMax' | 'armor' | 'critChance' | 'critDamage' | 'recovery' | 'moveSpeed' | 'maxHp', number>>;
  name: string;
}
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/config.ts
git commit -m "feat(equipment): add equipment types, rarity defs, stat pools, and weapon type configs"
```

---

### Task 2: StatsManager Third Layer

**Files:**
- Modify: `src/systems/StatsManager.ts`

- [ ] **Step 1: Add equipmentBonuses layer and methods**

In `StatsManager` class, add a third stat layer. Modify these sections:

After line 19 (`private levels: Record<string, number> = {};`), add:
```typescript
private equipmentBonuses: Partial<StatBlock> = {};
```

Modify `getStat` (line 50-52) to:
```typescript
getStat(key: StatKey): number {
  return this.baseStats[key] + this.bonuses[key] + (this.equipmentBonuses[key] ?? 0);
}
```

Add new methods after `incrementLevel` (after line 64):
```typescript
setEquipmentBonuses(stats: Partial<StatBlock>): void {
  this.equipmentBonuses = { ...stats };
}

clearEquipmentBonuses(): void {
  this.equipmentBonuses = {};
}

getEquipmentBonuses(): Partial<StatBlock> {
  return { ...this.equipmentBonuses };
}
```

Modify `exportState` (line 66-71) to include equipment bonuses:
```typescript
exportState(): { bonuses: StatBlock; levels: Record<string, number>; equipmentBonuses: Partial<StatBlock> } {
  return {
    bonuses: { ...this.bonuses },
    levels: { ...this.levels },
    equipmentBonuses: { ...this.equipmentBonuses },
  };
}
```

Modify `importState` (line 73-76) to restore equipment bonuses:
```typescript
importState(state: { bonuses: StatBlock; levels: Record<string, number>; equipmentBonuses?: Partial<StatBlock> }): void {
  this.bonuses = { ...state.bonuses };
  this.levels = { ...state.levels };
  this.equipmentBonuses = state.equipmentBonuses ? { ...state.equipmentBonuses } : {};
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/systems/StatsManager.ts
git commit -m "feat(equipment): add equipmentBonuses third layer to StatsManager"
```

---

### Task 3: EquipmentManager Core

**Files:**
- Create: `src/systems/EquipmentManager.ts`

- [ ] **Step 1: Create EquipmentManager**

```typescript
import Phaser from 'phaser';
import type { StatsManager, StatBlock } from './StatsManager';
import type { Player } from '../entities/Player';
import EventBus from './EventBus';
import {
  EQUIPMENT_RARITY_DEFS,
  EQUIPMENT_STAT_POOLS,
  EQUIPMENT_BASE_RANGES,
  WEAPON_TYPE_DEFS,
  WEAPON_SUBTYPES,
  EQUIPMENT_NAME_PREFIXES,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS,
} from '../config';
import type {
  EquipmentItem,
  EquipmentSlot,
  EquipmentRarity,
} from '../config';

export class EquipmentManager {
  private statsManager: StatsManager;
  private player: Player;
  private equipped: Record<EquipmentSlot, EquipmentItem | null> = {
    weapon: null,
    armor: null,
    helmet: null,
    accessory: null,
  };
  private nextId: number = 0;

  constructor(statsManager: StatsManager, player: Player) {
    this.statsManager = statsManager;
    this.player = player;
  }

  equip(item: EquipmentItem): EquipmentItem | null {
    const old = this.equipped[item.slot];
    this.equipped[item.slot] = item;
    this.recalcBonuses();

    if (item.slot === 'weapon') {
      EventBus.emit('weapon-changed', item.subtype);
    }

    return old;
  }

  unequip(slot: EquipmentSlot): EquipmentItem | null {
    const old = this.equipped[slot];
    if (!old) return null;

    this.equipped[slot] = null;
    this.recalcBonuses();

    if (slot === 'weapon') {
      EventBus.emit('weapon-changed', 'axe'); // default
    }

    return old;
  }

  getEquipped(slot: EquipmentSlot): EquipmentItem | null {
    return this.equipped[slot];
  }

  getAllEquipped(): Record<EquipmentSlot, EquipmentItem | null> {
    return { ...this.equipped };
  }

  private recalcBonuses(): void {
    const merged: Partial<StatBlock> = {};

    for (const slot of EQUIPMENT_SLOTS) {
      const item = this.equipped[slot];
      if (!item) continue;

      for (const [key, value] of Object.entries(item.stats)) {
        const statKey = key as keyof StatBlock;
        merged[statKey] = (merged[statKey] ?? 0) + value;
      }
    }

    this.statsManager.setEquipmentBonuses(merged);
    this.syncPlayerStats();
  }

  private syncPlayerStats(): void {
    const newMaxHp = this.statsManager.getStat('maxHp');
    const oldMaxHp = this.player.maxHp;
    this.player.maxHp = newMaxHp;

    // Clamp HP: if maxHp decreased, cap current HP
    if (this.player.hp > newMaxHp) {
      this.player.hp = newMaxHp;
    }

    if (oldMaxHp !== newMaxHp) {
      EventBus.emit('player-hp-changed', this.player.hp, this.player.maxHp);
    }
  }

  generateEquipment(slot: EquipmentSlot, rarity: EquipmentRarity, floor: number): EquipmentItem {
    const rarityDef = EQUIPMENT_RARITY_DEFS[rarity];
    const pool = EQUIPMENT_STAT_POOLS[slot];

    // Determine subtype
    const subtype = slot === 'weapon'
      ? WEAPON_SUBTYPES[Math.floor(Math.random() * WEAPON_SUBTYPES.length)]
      : 'generic';

    // Determine affix count (capped by pool size)
    let affixCount: number;
    if (typeof rarityDef.affixCount === 'number') {
      affixCount = rarityDef.affixCount;
    } else {
      affixCount = Phaser.Math.Between(rarityDef.affixCount.min, rarityDef.affixCount.max);
    }
    affixCount = Math.min(affixCount, pool.length);

    // Shuffle pool and pick first N
    const shuffled = Phaser.Utils.Array.Shuffle([...pool]);
    const pickedAffixes = shuffled.slice(0, affixCount);

    // Roll stat values
    const floorScale = 1 + (floor - 1) * 0.1;
    const stats: EquipmentItem['stats'] = {};

    for (const affix of pickedAffixes) {
      const baseRange = EQUIPMENT_BASE_RANGES[affix];
      if (!baseRange) continue;

      const baseValue = baseRange.min + Math.random() * (baseRange.max - baseRange.min);
      const finalValue = baseValue * rarityDef.valueMult * floorScale * (0.8 + Math.random() * 0.4);

      if (affix === 'damageFlat') {
        // damageFlat applies to both attackMin and attackMax
        const rounded = Math.round(finalValue);
        stats.attackMin = rounded;
        stats.attackMax = rounded;
      } else {
        const key = affix as keyof typeof stats;
        // Round integers for HP/armor/moveSpeed, keep decimals for crit/recovery
        if (affix === 'maxHp' || affix === 'armor' || affix === 'moveSpeed') {
          stats[key] = Math.round(finalValue);
        } else {
          stats[key] = Math.round(finalValue * 1000) / 1000; // 3 decimal precision
        }
      }
    }

    // Ensure attackMax >= attackMin after all bonuses
    if (stats.attackMin !== undefined && stats.attackMax !== undefined) {
      stats.attackMax = Math.max(stats.attackMax, stats.attackMin);
    }

    // Generate name
    const prefixes = EQUIPMENT_NAME_PREFIXES[rarity];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const slotLabel = slot === 'weapon' ? WEAPON_TYPE_DEFS[subtype].label : EQUIPMENT_SLOT_LABELS[slot];
    const name = `${prefix} ${slotLabel}`;

    return {
      id: this.nextId++,
      slot,
      subtype,
      rarity,
      stats,
      name,
    };
  }

  getWeaponModifiers(): { attackSpeedMult: number; rangeMult: number; damageMult: number } {
    const weapon = this.equipped.weapon;
    const subtype = weapon?.subtype ?? 'axe';
    const def = WEAPON_TYPE_DEFS[subtype];
    if (!def) {
      return { attackSpeedMult: 1, rangeMult: 1, damageMult: 1 };
    }
    return {
      attackSpeedMult: def.attackSpeedMult,
      rangeMult: def.rangeMult,
      damageMult: def.damageMult,
    };
  }

  exportState(): { equipped: Record<EquipmentSlot, EquipmentItem | null>; nextId: number } {
    return {
      equipped: {
        weapon: this.equipped.weapon ? { ...this.equipped.weapon } : null,
        armor: this.equipped.armor ? { ...this.equipped.armor } : null,
        helmet: this.equipped.helmet ? { ...this.equipped.helmet } : null,
        accessory: this.equipped.accessory ? { ...this.equipped.accessory } : null,
      },
      nextId: this.nextId,
    };
  }

  importState(state: { equipped: Record<EquipmentSlot, EquipmentItem | null>; nextId: number }): void {
    this.equipped = {
      weapon: state.equipped.weapon ? { ...state.equipped.weapon } : null,
      armor: state.equipped.armor ? { ...state.equipped.armor } : null,
      helmet: state.equipped.helmet ? { ...state.equipped.helmet } : null,
      accessory: state.equipped.accessory ? { ...state.equipped.accessory } : null,
    };
    this.nextId = state.nextId;
    this.recalcBonuses();
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/systems/EquipmentManager.ts
git commit -m "feat(equipment): add EquipmentManager with slots, generation, and stat recalc"
```

---

### Task 4: CombatSystem Weapon Modifiers

**Files:**
- Modify: `src/systems/CombatSystem.ts`

- [ ] **Step 1: Inject EquipmentManager and use weapon modifiers**

Add import at top (after line 7):
```typescript
import type { EquipmentManager } from './EquipmentManager';
```

Modify constructor (line 16-19) to accept EquipmentManager:
```typescript
private equipmentManager?: EquipmentManager;

constructor(scene: GameScene, statsManager: StatsManager, skillManager?: SkillManager, equipmentManager?: EquipmentManager) {
  this.scene = scene;
  this.statsManager = statsManager;
  this.skillManager = skillManager;
  this.equipmentManager = equipmentManager;
```

Modify `tryPlayerAttack` (line 39-56) to use weapon cooldown:
```typescript
private tryPlayerAttack(time: number): void {
  const player = this.scene.player;

  if (this.skillManager?.isCasting()) return;
  if (player.isMoving) return;

  // Weapon-modified cooldown
  const mods = this.equipmentManager?.getWeaponModifiers() ?? { attackSpeedMult: 1, rangeMult: 1, damageMult: 1 };
  const cooldown = GAME_CONFIG.ATTACK_COOLDOWN / mods.attackSpeedMult;
  if (time - this.lastAttackTime < cooldown) return;

  // Weapon-modified range
  const range = GAME_CONFIG.ATTACK_RANGE * mods.rangeMult;
  const enemy = this.findNearestEnemyInRange(range);
  if (!enemy) return;

  this.lastAttackTime = time;
  this.executePlayerAttack(player, enemy, mods.damageMult);
}
```

Modify `findNearestEnemyInRange` (line 59-81) to accept range parameter:
```typescript
private findNearestEnemyInRange(range?: number): Enemy | null {
  const player = this.scene.player;
  const enemies = this.scene.enemyGroup.getChildren() as Enemy[];
  const r = range ?? GAME_CONFIG.ATTACK_RANGE;
  const rangeSq = r * r;
```

Modify `executePlayerAttack` (line 83-125) to accept damageMult:
```typescript
private executePlayerAttack(player: Phaser.GameObjects.Container, enemy: Enemy, damageMult: number = 1): void {
  let damage = Phaser.Math.Between(
    this.statsManager.getStat('attackMin'),
    this.statsManager.getStat('attackMax'),
  );

  // Apply weapon damage multiplier
  damage = Math.round(damage * damageMult);

  let isCrit = false;
  if (Math.random() < this.statsManager.getStat('critChance')) {
    damage = Math.floor(damage * this.statsManager.getStat('critDamage'));
    isCrit = true;
  }
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors (GameScene hasn't passed equipmentManager yet — that's Task 7)

- [ ] **Step 3: Commit**

```bash
git add src/systems/CombatSystem.ts
git commit -m "feat(equipment): inject EquipmentManager into CombatSystem for weapon modifiers"
```

---

### Task 5: Loot Entity + LootSystem Changes

**Files:**
- Modify: `src/entities/Loot.ts`
- Modify: `src/systems/LootSystem.ts`

- [ ] **Step 1: Add equipmentData to Loot entity**

In `src/entities/Loot.ts`, add import and field:

After line 1 (`import Phaser from 'phaser';`), add:
```typescript
import type { EquipmentItem } from '../config';
```

In the `Loot` class, after line 26 (`public rarity?: string;`), add:
```typescript
public equipmentData?: EquipmentItem;
```

In the constructor (line 30-49), add after `this.rarity = rarity;` (line 43):
```typescript
// equipmentData is set externally after construction
```

In the `collect` method (line 74-79), add cleanup:
```typescript
collect(): void {
  this.bobTween?.destroy();
  this.bobTween = undefined;
  this.equipmentData = undefined;
  this.setActive(false);
  this.setVisible(false);
}
```

- [ ] **Step 2: Modify LootSystem to skip magnet for equipment + use overlap**

In `src/systems/LootSystem.ts`, add import after line 7:
```typescript
import type { EquipmentManager } from './EquipmentManager';
```

Add EquipmentManager field and constructor parameter. Modify constructor (line 42-48):
```typescript
private equipmentManager?: EquipmentManager;

constructor(scene: Phaser.Scene, player: Player, lootGroup: Phaser.GameObjects.Group, equipmentManager?: EquipmentManager) {
  this.scene = scene;
  this.player = player;
  this.lootGroup = lootGroup;
  this.equipmentManager = equipmentManager;

  EventBus.on('enemy-killed', this.onEnemyKilled, this);
}
```

Modify `onEnemyKilled` (line 50-75) to generate actual equipment:
```typescript
private onEnemyKilled(enemy: Enemy): void {
  const baseX = enemy.x;
  const baseY = enemy.y;

  for (const entry of DROP_TABLE) {
    if (Math.random() < entry.chance) {
      const value = entry.type === LootType.gold
        ? Phaser.Math.Between(5, 15)
        : entry.value;

      const ox = Phaser.Math.Between(-10, 10);
      const oy = Phaser.Math.Between(-10, 10);

      this.spawnLoot(baseX + ox, baseY + oy, entry.type, value);
    }
  }

  // Equipment roll (3%)
  if (Math.random() < 0.03 && this.equipmentManager) {
    const ox = Phaser.Math.Between(-10, 10);
    const oy = Phaser.Math.Between(-10, 10);
    const rarity = rollEquipmentRarity();
    const slot = EQUIPMENT_SLOTS[Math.floor(Math.random() * EQUIPMENT_SLOTS.length)] as import('../config').EquipmentSlot;
    const floor = (this.scene as unknown as { floorManager?: { currentFloor: number } }).floorManager?.currentFloor ?? 1;
    const item = this.equipmentManager.generateEquipment(slot, rarity, floor);

    const loot = this.spawnLoot(baseX + ox, baseY + oy, LootType.equipment, 0, rarity);
    loot.equipmentData = item;
  }
}
```

Add import for EQUIPMENT_SLOTS at the top of the file:
```typescript
import { GAME_CONFIG, EQUIPMENT_SLOTS } from '../config';
```
(replacing the existing `import { GAME_CONFIG } from '../config';`)

Modify `update` (line 117-156) to skip equipment from magnet:
```typescript
update(): void {
  const items = this.lootGroup.getChildren() as Loot[];
  const px = this.player.x;
  const py = this.player.y;
  const range = GAME_CONFIG.LOOT_MAGNET_RANGE;

  for (const loot of items) {
    if (!loot.active) continue;
    if (this.pulling.has(loot)) continue;

    const dx = px - loot.x;
    const dy = py - loot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Equipment: no magnet, use overlap pickup instead
    if (loot.lootType === LootType.equipment) {
      if (dist < 24 && loot.equipmentData) {
        EventBus.emit('equipment-pickup', loot.equipmentData, loot);
      }
      continue;
    }

    if (dist < range) {
      this.pulling.add(loot);

      const magnetTween = this.scene.tweens.add({
        targets: loot,
        x: px,
        y: py,
        duration: 200,
        ease: 'Cubic.easeIn',
        onUpdate: () => {
          const cdx = this.player.x - loot.x;
          const cdy = this.player.y - loot.y;
          if (Math.sqrt(cdx * cdx + cdy * cdy) < 10) {
            this.collectLoot(loot);
            magnetTween.stop();
          }
        },
        onComplete: () => {
          if (loot.active) {
            this.collectLoot(loot);
          }
        },
      });
    }
  }
}
```

Remove the equipment case from `collectLoot` (line 185-188) since equipment is now handled by the pickup event:
```typescript
case LootType.equipment:
  // Handled by equipment-pickup event in update()
  break;
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/entities/Loot.ts src/systems/LootSystem.ts
git commit -m "feat(equipment): equipment loot skips magnet, uses overlap pickup with generated items"
```

---

### Task 6: Weapon Placeholder Textures + Player Sprite Swap

**Files:**
- Modify: `src/scenes/BootScene.ts`
- Modify: `src/entities/Player.ts`

- [ ] **Step 1: Add weapon textures in BootScene**

In `src/scenes/BootScene.ts`, add after the `player-weapon` texture (after line 27):

```typescript
// weapon-axe: 30x10 brown rectangle (default weapon)
const weaponAxe = this.make.graphics({ x: 0, y: 0 }, false);
weaponAxe.fillStyle(0x8b6914);
weaponAxe.fillRect(0, 0, 30, 10);
weaponAxe.generateTexture('weapon-axe', 30, 10);
weaponAxe.destroy();

// weapon-sword: 32x6 silver narrow rectangle
const weaponSword = this.make.graphics({ x: 0, y: 0 }, false);
weaponSword.fillStyle(0xc0c0c0);
weaponSword.fillRect(0, 0, 32, 6);
weaponSword.generateTexture('weapon-sword', 32, 6);
weaponSword.destroy();

// weapon-hammer: 24x14 dark gray wide rectangle
const weaponHammer = this.make.graphics({ x: 0, y: 0 }, false);
weaponHammer.fillStyle(0x666666);
weaponHammer.fillRect(0, 0, 24, 14);
weaponHammer.generateTexture('weapon-hammer', 24, 14);
weaponHammer.destroy();
```

- [ ] **Step 2: Add weapon-changed listener to Player**

In `src/entities/Player.ts`, add at the end of the constructor (after line 50, before closing `}`):

```typescript
// Listen for weapon type changes
EventBus.on('weapon-changed', (subtype: string) => {
  const textureKey = `weapon-${subtype}`;
  if (this.scene.textures.exists(textureKey)) {
    this.weaponSprite.setTexture(textureKey);
  }
});
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/scenes/BootScene.ts src/entities/Player.ts
git commit -m "feat(equipment): add weapon placeholder textures and sprite swap on weapon-changed"
```

---

### Task 7: GameScene Integration + buildRunState()

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add EquipmentManager import and field**

Add import after line 19:
```typescript
import { EquipmentManager } from '../systems/EquipmentManager';
import type { EquipmentItem, EquipmentSlot } from '../config';
```

Add field after line 36 (`public skillManager!: SkillManager;`):
```typescript
public equipmentManager!: EquipmentManager;
```

- [ ] **Step 2: Extend RunState interface**

Modify the `RunState` interface (line 21-29) to add equipment:
```typescript
export interface RunState {
  statsManagerState: { bonuses: StatBlock; levels: Record<string, number>; equipmentBonuses?: Partial<StatBlock> };
  playerHp: number;
  playerMp: number;
  playerGold: number;
  playerMaterials: { wood: number; ore: number; cloth: number };
  floorManagerState: FloorState;
  playerSkills?: string[];
  playerEquipment?: Record<EquipmentSlot, EquipmentItem | null>;
  equipmentNextId?: number;
}
```

- [ ] **Step 3: Init EquipmentManager in create()**

After player state restoration (after line 139), add:
```typescript
// Equipment manager
this.equipmentManager = new EquipmentManager(this.statsManager, this.player);
if (this.runState?.playerEquipment) {
  this.equipmentManager.importState({
    equipped: this.runState.playerEquipment,
    nextId: this.runState.equipmentNextId ?? 0,
  });
}
```

Modify LootSystem construction (line 199) to pass equipmentManager:
```typescript
this.lootSystem = new LootSystem(this, this.player, this.lootGroup, this.equipmentManager);
```

Modify CombatSystem construction (line 211) to pass equipmentManager:
```typescript
this.combatSystem = new CombatSystem(this, this.statsManager, this.skillManager, this.equipmentManager);
```

- [ ] **Step 4: Add buildRunState() helper and refactor restart paths**

Add new method after `triggerDeath` (after line 519):
```typescript
buildRunState(overrides?: Partial<RunState>): RunState {
  const equipState = this.equipmentManager.exportState();
  const base: RunState = {
    statsManagerState: this.statsManager.exportState(),
    playerHp: this.player.hp,
    playerMp: this.player.mp,
    playerGold: this.player.gold,
    playerMaterials: { ...this.player.materials },
    floorManagerState: this.floorManager.exportState(),
    playerSkills: this.skillManager.exportState().skills,
    playerEquipment: equipState.equipped,
    equipmentNextId: equipState.nextId,
  };
  return { ...base, ...overrides };
}
```

Refactor `triggerFloorTransition` (line 474-495):
```typescript
triggerFloorTransition(): void {
  this.gameplayLocked = true;
  this.physics.pause();
  EventBus.emit('gameplay-lock', true);

  this.cameras.main.fadeOut(300, 0, 0, 0);
  this.cameras.main.once('camerafadeoutcomplete', () => {
    this.floorManager.advanceFloor();
    const runState = this.buildRunState({
      floorManagerState: this.floorManager.exportState(),
    });
    this.scene.restart(runState);
  });
}
```

Refactor `triggerDeath` (line 497-519):
```typescript
triggerDeath(): void {
  this.gameplayLocked = true;
  this.physics.pause();
  EventBus.emit('gameplay-lock', true);
  EventBus.emit('show-death-text', this.floorManager.currentFloor);

  this.time.delayedCall(1500, () => {
    const runState = this.buildRunState({
      playerHp: this.statsManager.getStat('maxHp'),
      playerMp: GAME_CONFIG.PLAYER_MP,
      playerGold: 0,
      playerMaterials: { wood: 0, ore: 0, cloth: 0 },
      floorManagerState: {
        currentFloor: 1,
        highestFloor: this.floorManager.highestFloor,
      },
    });
    this.scene.restart(runState);
  });
}
```

- [ ] **Step 5: Wire equipment-pickup event**

In `create()`, after the skill-acquired listener (after line 225), add:
```typescript
// Equipment pickup — forward to UIScene
EventBus.on('equipment-pickup', (item: EquipmentItem, loot: import('../entities/Loot').Loot) => {
  // Pause gameplay while compare panel is shown
  this.gameplayLocked = true;
  this.physics.pause();
  EventBus.emit('gameplay-lock', true);
  EventBus.emit('show-equipment-compare', item, loot);
});

EventBus.on('equipment-compare-done', () => {
  this.gameplayLocked = false;
  this.physics.resume();
  EventBus.emit('gameplay-lock', false);
});
```

Add cleanup in `onShutdown` (line 266-281):
```typescript
EventBus.off('equipment-pickup');
EventBus.off('equipment-compare-done');
```

- [ ] **Step 6: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat(equipment): integrate EquipmentManager, buildRunState helper, equipment pickup wiring"
```

---

### Task 8: EquipmentComparePanel

**Files:**
- Create: `src/ui/EquipmentComparePanel.ts`

- [ ] **Step 1: Create the comparison panel**

```typescript
import Phaser from 'phaser';
import EventBus from '../systems/EventBus';
import type { EquipmentItem, EquipmentSlot } from '../config';
import {
  EQUIPMENT_RARITY_DEFS,
  EQUIPMENT_SLOT_LABELS,
  WEAPON_TYPE_DEFS,
} from '../config';
import type { Loot } from '../entities/Loot';
import type { GameScene } from '../scenes/GameScene';

const PANEL_W = 400;
const PANEL_H = 360;
const CARD_W = 175;
const CARD_H = 240;
const CARD_GAP = 10;
const BTN_W = 140;
const BTN_H = 44;

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '12px',
  color: '#ffffff',
  fontFamily: 'monospace',
};

const STAT_LABELS: Record<string, string> = {
  attackMin: 'ATK Min',
  attackMax: 'ATK Max',
  armor: 'Armor',
  maxHp: 'Max HP',
  critChance: 'Crit %',
  critDamage: 'Crit DMG',
  recovery: 'Regen',
  moveSpeed: 'Speed',
};

function formatStatValue(key: string, value: number): string {
  if (key === 'critChance') return `${(value * 100).toFixed(1)}%`;
  if (key === 'critDamage') return `${(value * 100).toFixed(0)}%`;
  if (key === 'recovery') return value.toFixed(1);
  return String(Math.round(value));
}

export class EquipmentComparePanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setVisible(false);

    EventBus.on('show-equipment-compare', this.show, this);
  }

  private show = (newItem: EquipmentItem, loot: Loot): void => {
    if (this.visible) return;
    this.visible = true;

    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    const equipped = gameScene?.equipmentManager?.getEquipped(newItem.slot) ?? null;

    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;

    this.container.removeAll(true);

    // Background overlay
    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.6);
    this.container.add(overlay);

    // Panel background
    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;
    const bg = this.scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x111111, 0.95);
    bg.setStrokeStyle(2, 0x444444);
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(cx, panelY + 16, 'Equipment Compare', {
      ...TEXT_STYLE,
      fontSize: '16px',
    });
    title.setOrigin(0.5, 0);
    this.container.add(title);

    // Slot label
    const slotLabel = this.scene.add.text(cx, panelY + 38, EQUIPMENT_SLOT_LABELS[newItem.slot], {
      ...TEXT_STYLE,
      fontSize: '11px',
      color: '#aaaaaa',
    });
    slotLabel.setOrigin(0.5, 0);
    this.container.add(slotLabel);

    // Cards
    const cardsY = panelY + 58;
    const leftX = cx - CARD_GAP / 2 - CARD_W / 2;
    const rightX = cx + CARD_GAP / 2 + CARD_W / 2;

    this.createCard(leftX, cardsY, equipped, 'Equipped');
    this.createCard(rightX, cardsY, newItem, 'New Drop');

    // Buttons
    const btnsY = cardsY + CARD_H + 16;
    this.createButton(cx - BTN_W / 2 - 10, btnsY, 'Equip', 0x006600, () => {
      gameScene.equipmentManager.equip(newItem);
      loot.collect();
      this.hide();
    });
    this.createButton(cx + BTN_W / 2 + 10, btnsY, 'Discard', 0x660000, () => {
      loot.collect();
      this.hide();
    });

    this.container.setVisible(true);
  };

  private createCard(cx: number, topY: number, item: EquipmentItem | null, label: string): void {
    const rarityColor = item ? EQUIPMENT_RARITY_DEFS[item.rarity].color : 0x444444;

    // Card background
    const cardBg = this.scene.add.rectangle(cx, topY + CARD_H / 2, CARD_W, CARD_H, 0x222222);
    cardBg.setStrokeStyle(2, rarityColor);
    this.container.add(cardBg);

    // Label (Equipped / New Drop)
    const headerText = this.scene.add.text(cx, topY + 8, label, {
      ...TEXT_STYLE,
      fontSize: '10px',
      color: '#888888',
    });
    headerText.setOrigin(0.5, 0);
    this.container.add(headerText);

    if (!item) {
      const emptyText = this.scene.add.text(cx, topY + CARD_H / 2, 'None', {
        ...TEXT_STYLE,
        color: '#666666',
      });
      emptyText.setOrigin(0.5, 0.5);
      this.container.add(emptyText);
      return;
    }

    // Item name
    const nameText = this.scene.add.text(cx, topY + 26, item.name, {
      ...TEXT_STYLE,
      fontSize: '13px',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`,
    });
    nameText.setOrigin(0.5, 0);
    this.container.add(nameText);

    // Rarity label
    const rarityLabel = this.scene.add.text(cx, topY + 44, EQUIPMENT_RARITY_DEFS[item.rarity].label, {
      ...TEXT_STYLE,
      fontSize: '10px',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`,
    });
    rarityLabel.setOrigin(0.5, 0);
    this.container.add(rarityLabel);

    // Weapon subtype
    if (item.slot === 'weapon' && WEAPON_TYPE_DEFS[item.subtype]) {
      const wtd = WEAPON_TYPE_DEFS[item.subtype];
      const subtypeText = this.scene.add.text(cx, topY + 58, `${wtd.label} | SPD ${wtd.attackSpeedMult}x RNG ${wtd.rangeMult}x DMG ${wtd.damageMult}x`, {
        ...TEXT_STYLE,
        fontSize: '9px',
        color: '#aaaaaa',
      });
      subtypeText.setOrigin(0.5, 0);
      this.container.add(subtypeText);
    }

    // Stats
    let statY = item.slot === 'weapon' ? topY + 76 : topY + 62;
    for (const [key, value] of Object.entries(item.stats)) {
      if (value === undefined) continue;
      const display = `${STAT_LABELS[key] ?? key}: +${formatStatValue(key, value)}`;
      const statText = this.scene.add.text(cx - CARD_W / 2 + 12, statY, display, {
        ...TEXT_STYLE,
        fontSize: '11px',
      });
      statText.setOrigin(0, 0);
      this.container.add(statText);
      statY += 16;
    }
  }

  private createButton(cx: number, cy: number, label: string, color: number, callback: () => void): void {
    const btn = this.scene.add.rectangle(cx, cy, BTN_W, BTN_H, color);
    btn.setStrokeStyle(1, 0xffffff);
    btn.setInteractive({ useHandCursor: true });

    const btnText = this.scene.add.text(cx, cy, label, {
      ...TEXT_STYLE,
      fontSize: '14px',
    });
    btnText.setOrigin(0.5, 0.5);

    btn.on('pointerdown', () => {
      btn.setScale(0.95);
    });
    btn.on('pointerup', () => {
      btn.setScale(1);
      callback();
    });
    btn.on('pointerout', () => {
      btn.setScale(1);
    });

    this.container.add([btn, btnText]);
  }

  private hide(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.container.removeAll(true);
    EventBus.emit('equipment-compare-done');
  }

  destroy(): void {
    EventBus.off('show-equipment-compare', this.show, this);
    this.container.destroy();
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/EquipmentComparePanel.ts
git commit -m "feat(equipment): add EquipmentComparePanel for pickup comparison UI"
```

---

### Task 9: EquipmentPanel (Management UI)

**Files:**
- Create: `src/ui/EquipmentPanel.ts`

- [ ] **Step 1: Create the equipment management panel**

```typescript
import Phaser from 'phaser';
import EventBus from '../systems/EventBus';
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_RARITY_DEFS,
  EQUIPMENT_SLOT_LABELS,
} from '../config';
import type { EquipmentSlot } from '../config';
import type { GameScene } from '../scenes/GameScene';

const PANEL_W = 380;
const PANEL_H = 400;
const ROW_H = 80;

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '12px',
  color: '#ffffff',
  fontFamily: 'monospace',
};

const STAT_LABELS: Record<string, string> = {
  attackMin: 'ATK Min',
  attackMax: 'ATK Max',
  armor: 'Armor',
  maxHp: 'Max HP',
  critChance: 'Crit %',
  critDamage: 'Crit DMG',
  recovery: 'Regen',
  moveSpeed: 'Speed',
};

function formatStatValue(key: string, value: number): string {
  if (key === 'critChance') return `${(value * 100).toFixed(1)}%`;
  if (key === 'critDamage') return `${(value * 100).toFixed(0)}%`;
  if (key === 'recovery') return value.toFixed(1);
  return String(Math.round(value));
}

export class EquipmentPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setVisible(false);

    EventBus.on('show-equipment-panel', this.show, this);
  }

  private show = (): void => {
    if (this.visible) return;
    this.visible = true;

    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    if (!gameScene?.equipmentManager) return;

    EventBus.emit('ui-input-lock', true);
    EventBus.emit('gameplay-lock', true);

    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;

    this.container.removeAll(true);

    // Overlay
    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.6);
    this.container.add(overlay);

    // Panel
    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;
    const bg = this.scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x111111, 0.95);
    bg.setStrokeStyle(2, 0x444444);
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(cx, panelY + 14, 'My Equipment', {
      ...TEXT_STYLE,
      fontSize: '16px',
    });
    title.setOrigin(0.5, 0);
    this.container.add(title);

    // Close button
    const closeBtn = this.scene.add.text(panelX + PANEL_W - 16, panelY + 10, 'X', {
      ...TEXT_STYLE,
      fontSize: '18px',
      color: '#ff4444',
    });
    closeBtn.setOrigin(0.5, 0);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.hide());
    this.container.add(closeBtn);

    // Equipment rows
    let rowY = panelY + 44;
    for (const slot of EQUIPMENT_SLOTS) {
      this.createRow(panelX + 10, rowY, PANEL_W - 20, slot, gameScene);
      rowY += ROW_H + 4;
    }

    this.container.setVisible(true);
  };

  private createRow(x: number, y: number, width: number, slot: EquipmentSlot, gameScene: GameScene): void {
    const item = gameScene.equipmentManager.getEquipped(slot);
    const rarityColor = item ? EQUIPMENT_RARITY_DEFS[item.rarity].color : 0x444444;

    // Row background
    const rowBg = this.scene.add.rectangle(x + width / 2, y + ROW_H / 2, width, ROW_H, 0x1a1a1a);
    rowBg.setStrokeStyle(1, rarityColor);
    this.container.add(rowBg);

    // Slot label
    const slotText = this.scene.add.text(x + 10, y + 6, `[${EQUIPMENT_SLOT_LABELS[slot]}]`, {
      ...TEXT_STYLE,
      fontSize: '11px',
      color: '#888888',
    });
    this.container.add(slotText);

    if (!item) {
      const emptyText = this.scene.add.text(x + 100, y + 6, '(empty)', {
        ...TEXT_STYLE,
        color: '#555555',
      });
      this.container.add(emptyText);
      return;
    }

    // Item name
    const nameText = this.scene.add.text(x + 100, y + 6, item.name, {
      ...TEXT_STYLE,
      fontSize: '13px',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`,
    });
    this.container.add(nameText);

    // Stats summary
    const statParts: string[] = [];
    for (const [key, value] of Object.entries(item.stats)) {
      if (value === undefined) continue;
      statParts.push(`${STAT_LABELS[key] ?? key}+${formatStatValue(key, value)}`);
    }
    const statsText = this.scene.add.text(x + 10, y + 28, statParts.join('  '), {
      ...TEXT_STYLE,
      fontSize: '10px',
      color: '#cccccc',
    });
    this.container.add(statsText);

    // Unequip button
    const unequipBtn = this.scene.add.text(x + width - 30, y + 6, 'X', {
      ...TEXT_STYLE,
      fontSize: '16px',
      color: '#ff6666',
    });
    unequipBtn.setOrigin(0.5, 0);
    unequipBtn.setInteractive({ useHandCursor: true });
    unequipBtn.on('pointerup', () => {
      gameScene.equipmentManager.unequip(slot);
      // Refresh panel
      this.hide();
      this.show();
    });
    this.container.add(unequipBtn);
  }

  private hide(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.container.removeAll(true);
    EventBus.emit('ui-input-lock', false);
    EventBus.emit('gameplay-lock', false);
  }

  destroy(): void {
    EventBus.off('show-equipment-panel', this.show, this);
    this.container.destroy();
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/EquipmentPanel.ts
git commit -m "feat(equipment): add EquipmentPanel for viewing and unequipping gear"
```

---

### Task 10: HUD Equipment Button + UIScene Wiring

**Files:**
- Modify: `src/ui/HUD.ts`
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Add equipment button to HUD**

In `src/ui/HUD.ts`, add a field after line 42 (`private floorText`):
```typescript
private equipBtn: Phaser.GameObjects.Text;
```

Add button creation at the end of the constructor (after line 103, before closing `}`):
```typescript
// Equipment button — top right, below materials
this.equipBtn = scene.add.text(
  camW - GOLD_PADDING,
  44,
  '[Equip]',
  { ...TEXT_STYLE, fontSize: '13px', color: '#aaaaff' },
);
this.equipBtn.setOrigin(1, 0);
this.equipBtn.setDepth(11);
this.equipBtn.setInteractive({ useHandCursor: true });
this.equipBtn.on('pointerup', () => {
  EventBus.emit('show-equipment-panel');
});
```

Add EventBus import if not already present — check line 2, it already imports `SKILL_DEFS` from config. Add:
```typescript
import EventBus from '../systems/EventBus';
```

- [ ] **Step 2: Wire panels in UIScene**

In `src/scenes/UIScene.ts`, add imports:
```typescript
import { EquipmentComparePanel } from '../ui/EquipmentComparePanel';
import { EquipmentPanel } from '../ui/EquipmentPanel';
```

Add fields after line 12 (`private upgradePanel!: UpgradePanel;`):
```typescript
private equipmentComparePanel!: EquipmentComparePanel;
private equipmentPanel!: EquipmentPanel;
```

In `create()`, after line 22 (`this.upgradePanel = new UpgradePanel(this);`):
```typescript
this.equipmentComparePanel = new EquipmentComparePanel(this);
this.equipmentPanel = new EquipmentPanel(this);
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/ui/HUD.ts src/scenes/UIScene.ts
git commit -m "feat(equipment): add HUD equipment button, wire compare and management panels in UIScene"
```

---

### Task 11: DebugManager Equipment Commands

**Files:**
- Modify: `src/debug/DebugManager.ts`

- [ ] **Step 1: Add equipment commands to debug API**

Add imports at top (after line 6):
```typescript
import type { EquipmentItem, EquipmentSlot, EquipmentRarity } from '../config';
import { EQUIPMENT_SLOTS, EQUIPMENT_RARITY_DEFS } from '../config';
```

In the `DebugAPI` interface (after line 49), add:
```typescript
giveEquipment(slot?: string, rarity?: string, subtype?: string): void;
removeEquipment(slot: string): void;
removeAllEquipment(): void;
listEquipment(): void;
```

In the debug object (after the skill commands section, around line 330), add:
```typescript
// ---- Equipment commands
giveEquipment: (slot?: string, rarity?: string, subtype?: string) => {
  const em = this.scene.equipmentManager;
  if (!em) { console.log('[Debug] giveEquipment: equipmentManager not ready'); return; }

  const targetSlot = (slot && EQUIPMENT_SLOTS.includes(slot as EquipmentSlot) ? slot : EQUIPMENT_SLOTS[Math.floor(Math.random() * EQUIPMENT_SLOTS.length)]) as EquipmentSlot;
  const targetRarity = (rarity && rarity in EQUIPMENT_RARITY_DEFS ? rarity : 'blue') as EquipmentRarity;
  const floor = this.scene.floorManager?.currentFloor ?? 1;

  const item = em.generateEquipment(targetSlot, targetRarity, floor);
  if (subtype && targetSlot === 'weapon') {
    item.subtype = subtype;
  }
  const old = em.equip(item);
  console.log(`[Debug] giveEquipment: equipped ${item.rarity} ${item.name} (id:${item.id}). Replaced: ${old?.name ?? 'none'}`);
  console.table(item.stats);
},

removeEquipment: (slot: string) => {
  const em = this.scene.equipmentManager;
  if (!em) { console.log('[Debug] removeEquipment: equipmentManager not ready'); return; }
  if (!EQUIPMENT_SLOTS.includes(slot as EquipmentSlot)) {
    console.log(`[Debug] removeEquipment: invalid slot "${slot}". Use: ${EQUIPMENT_SLOTS.join(', ')}`);
    return;
  }
  const old = em.unequip(slot as EquipmentSlot);
  console.log(`[Debug] removeEquipment(${slot}): removed ${old?.name ?? 'nothing'}`);
},

removeAllEquipment: () => {
  const em = this.scene.equipmentManager;
  if (!em) { console.log('[Debug] removeAllEquipment: equipmentManager not ready'); return; }
  for (const slot of EQUIPMENT_SLOTS) {
    em.unequip(slot);
  }
  console.log('[Debug] removeAllEquipment: all slots cleared');
},

listEquipment: () => {
  const em = this.scene.equipmentManager;
  if (!em) { console.log('[Debug] listEquipment: equipmentManager not ready'); return; }
  for (const slot of EQUIPMENT_SLOTS) {
    const item = em.getEquipped(slot);
    if (item) {
      console.log(`[${slot}] ${item.rarity} ${item.name} (${item.subtype})`);
      console.table(item.stats);
    } else {
      console.log(`[${slot}] empty`);
    }
  }
},
```

- [ ] **Step 2: Update setFloor to use buildRunState**

Modify the `setFloor` command (around line 255-273) to use the new helper:
```typescript
setFloor: (n: number) => {
  const floor = Math.max(1, n);
  const player = this.scene.player;
  if (!player) { console.log('[Debug] setFloor: player not ready'); return; }
  const runState = this.scene.buildRunState({
    floorManagerState: {
      currentFloor: floor,
      highestFloor: Math.max(this.scene.floorManager.highestFloor, floor),
    },
  });
  console.log(`[Debug] setFloor: jumping to floor ${floor}`);
  this.scene.scene.restart(runState);
},
```

- [ ] **Step 3: Add equipment to state snapshot**

In `buildStateSnapshot` (around line 354), add equipment data after the `player` section:
```typescript
// In the return object, add after the player section:
equipment: (() => {
  const em = this.scene.equipmentManager;
  if (!em) return { weapon: null, armor: null, helmet: null, accessory: null };
  const all = em.getAllEquipped();
  return {
    weapon: all.weapon ? { name: all.weapon.name, rarity: all.weapon.rarity, subtype: all.weapon.subtype, stats: all.weapon.stats } : null,
    armor: all.armor ? { name: all.armor.name, rarity: all.armor.rarity, stats: all.armor.stats } : null,
    helmet: all.helmet ? { name: all.helmet.name, rarity: all.helmet.rarity, stats: all.helmet.stats } : null,
    accessory: all.accessory ? { name: all.accessory.name, rarity: all.accessory.rarity, stats: all.accessory.stats } : null,
  };
})(),
```

Update the `GameState` interface to include the equipment section:
```typescript
equipment: {
  weapon: { name: string; rarity: string; subtype: string; stats: Record<string, number> } | null;
  armor: { name: string; rarity: string; stats: Record<string, number> } | null;
  helmet: { name: string; rarity: string; stats: Record<string, number> } | null;
  accessory: { name: string; rarity: string; stats: Record<string, number> } | null;
};
```

- [ ] **Step 4: Verify build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/debug/DebugManager.ts
git commit -m "feat(equipment): add debug commands giveEquipment/removeEquipment/listEquipment + snapshot"
```

---

### Task 12: Build Verification + QA Prep

- [ ] **Step 1: Full build check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Verify all RunState paths include equipment**

Check that `buildRunState()` is used by:
- `triggerFloorTransition()`
- `triggerDeath()`
- debug `setFloor()`

Run: `grep -n "buildRunState\|scene.restart" src/scenes/GameScene.ts src/debug/DebugManager.ts`
Expected: All restart paths go through `buildRunState()`

- [ ] **Step 4: Deploy for QA**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx vite build && npx gh-pages -d dist`
Expected: Deployed to GitHub Pages

- [ ] **Step 5: Run QA loop**

Delegate to Sonnet subagent per CLAUDE.md QA rules. AC list:

| # | AC | Verification |
|---|-----|-------------|
| 1 | Equipment drops from enemies at ~3% rate | Kill 50+ enemies with `__debug.setInvincible(true)`, count equipment drops |
| 2 | Equipment has correct rarity distribution (white 60%, green 25%, blue 12%, purple 3%) | Use `__debug.giveEquipment()` with each rarity, verify colors |
| 3 | Equipment does NOT magnet — must walk over to pick up | Drop equipment, verify it stays on ground while other loot magnets |
| 4 | Comparison panel shows on equipment pickup | Walk over equipment, verify panel appears |
| 5 | Comparison panel shows equipped vs new item with stat diff | Have equipped item, pick up new one, verify both cards show |
| 6 | "Equip" button equips new item, destroys old | Click equip, verify stats change |
| 7 | "Discard" button destroys new item, keeps current | Click discard, verify no change |
| 8 | Gameplay locked during comparison panel | Verify joystick/auto-attack disabled while panel open |
| 9 | Equipment panel opens from HUD button | Click [Equip] button, verify panel shows |
| 10 | Equipment panel shows all 4 slots | Verify weapon/armor/helmet/accessory rows visible |
| 11 | Unequip button removes gear and updates stats | Click X on equipped item, verify removal |
| 12 | Weapon sprite changes on weapon equip (axe/sword/hammer) | `__debug.giveEquipment('weapon', 'blue', 'sword')`, verify sprite |
| 13 | StatsManager reflects equipment bonuses | `__debug.getStateSnapshot()`, check stats include equipment bonuses |
| 14 | Equipment preserved on floor transition | Equip items, descend stairs, verify still equipped |
| 15 | Equipment preserved on death | Equip items, die, verify still equipped on F1 |
| 16 | CombatSystem uses weapon modifiers (speed/range/damage) | Equip sword vs hammer, observe attack speed difference |
| 17 | `__debug.giveEquipment()` works with all params | Test various slot/rarity/subtype combos |
| 18 | `__debug.removeEquipment()` and `removeAllEquipment()` work | Execute and verify |
| 19 | `__debug.listEquipment()` prints all slots | Execute and verify console output |
| 20 | State snapshot includes equipment section | `__debug.getStateSnapshot().equipment` has all 4 slots |
| 21 | Affix count respects pool size cap | Armor slot: blue rarity = 2 affixes max (pool has 2). Verify no crash |
| 22 | Floor scaling increases equipment stats on higher floors | Compare equipment generated on F1 vs F5 |
| 23 | critChance values use 0-1 internal scale | `__debug.giveEquipment('accessory')`, check stats show small decimals |
| 24 | Equipment rarity glow visible on ground | Drop equipment, verify colored visual |
