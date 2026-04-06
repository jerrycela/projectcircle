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
      EventBus.emit('weapon-changed', 'axe');
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

    const subtype = slot === 'weapon'
      ? WEAPON_SUBTYPES[Math.floor(Math.random() * WEAPON_SUBTYPES.length)]
      : 'generic';

    let affixCount: number;
    if (typeof rarityDef.affixCount === 'number') {
      affixCount = rarityDef.affixCount;
    } else {
      affixCount = Phaser.Math.Between(rarityDef.affixCount.min, rarityDef.affixCount.max);
    }
    affixCount = Math.min(affixCount, pool.length);

    const shuffled = Phaser.Utils.Array.Shuffle([...pool]);
    const pickedAffixes = shuffled.slice(0, affixCount);

    const floorScale = 1 + (floor - 1) * 0.1;
    const stats: EquipmentItem['stats'] = {};

    for (const affix of pickedAffixes) {
      const baseRange = EQUIPMENT_BASE_RANGES[affix];
      if (!baseRange) continue;

      const baseValue = baseRange.min + Math.random() * (baseRange.max - baseRange.min);
      const finalValue = baseValue * rarityDef.valueMult * floorScale * (0.8 + Math.random() * 0.4);

      if (affix === 'damageFlat') {
        const rounded = Math.round(finalValue);
        stats.attackMin = rounded;
        stats.attackMax = rounded;
      } else {
        const key = affix as keyof typeof stats;
        if (affix === 'maxHp' || affix === 'armor' || affix === 'moveSpeed') {
          stats[key] = Math.round(finalValue);
        } else {
          stats[key] = Math.round(finalValue * 1000) / 1000;
        }
      }
    }

    if (stats.attackMin !== undefined && stats.attackMax !== undefined) {
      stats.attackMax = Math.max(stats.attackMax, stats.attackMin);
    }

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
