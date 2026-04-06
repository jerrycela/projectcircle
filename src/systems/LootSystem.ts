import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import { Loot, LootType } from '../entities/Loot';
import type { LootType as LootTypeT } from '../entities/Loot';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import EventBus from './EventBus';

const EQUIPMENT_RARITIES = ['white', 'green', 'blue', 'purple'] as const;
type EquipmentRarity = typeof EQUIPMENT_RARITIES[number];

function rollEquipmentRarity(): EquipmentRarity {
  const r = Math.random();
  if (r < 0.60) return 'white';
  if (r < 0.85) return 'green';
  if (r < 0.97) return 'blue';
  return 'purple';
}

interface SpawnEntry {
  type: LootTypeT;
  chance: number;
  value: number;
}

const DROP_TABLE: SpawnEntry[] = [
  { type: LootType.gold,      chance: 0.80, value: 0 }, // value randomized per drop
  { type: LootType.wood,      chance: 0.40, value: 1 },
  { type: LootType.ore,       chance: 0.25, value: 1 },
  { type: LootType.cloth,     chance: 0.20, value: 1 },
  { type: LootType.healthOrb, chance: 0.15, value: GAME_CONFIG.HEALTH_ORB_HEAL },
];

export class LootSystem {
  private scene: Phaser.Scene;
  private player: Player;
  public lootGroup: Phaser.GameObjects.Group;

  // Track loot items currently being pulled to avoid duplicate tweens
  private pulling: Set<Loot> = new Set();

  constructor(scene: Phaser.Scene, player: Player, lootGroup: Phaser.GameObjects.Group) {
    this.scene = scene;
    this.player = player;
    this.lootGroup = lootGroup;

    EventBus.on('enemy-killed', this.onEnemyKilled, this);
  }

  private onEnemyKilled(enemy: Enemy): void {
    const baseX = enemy.x;
    const baseY = enemy.y;

    // Roll drop table
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
    if (Math.random() < 0.03) {
      const ox = Phaser.Math.Between(-10, 10);
      const oy = Phaser.Math.Between(-10, 10);
      const rarity = rollEquipmentRarity();
      this.spawnLoot(baseX + ox, baseY + oy, LootType.equipment, 0, rarity);
    }
  }

  spawnLoot(x: number, y: number, type: LootTypeT, value: number, rarity?: string): Loot {
    // Reuse inactive loot from group if available
    const existing = this.lootGroup.getFirstDead(false) as Loot | null;

    if (existing) {
      existing.lootType = type;
      existing.value = value;
      existing.rarity = rarity;
      existing.setTexture(
        type === LootType.gold ? 'loot-gold' :
        type === LootType.wood ? 'loot-wood' :
        type === LootType.ore ? 'loot-ore' :
        type === LootType.cloth ? 'loot-cloth' :
        type === LootType.healthOrb ? 'loot-health-orb' :
        'loot-equipment'
      );
      existing.setPosition(x, y);
      existing.setActive(true);
      existing.setVisible(true);
      existing.setScale(0);
      this.pulling.delete(existing);

      // Pop-in animation
      this.scene.tweens.add({
        targets: existing,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: 'Back.easeOut',
      });

      return existing;
    }

    const loot = new Loot(this.scene, x, y, type, value, rarity);
    this.lootGroup.add(loot);
    return loot;
  }

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

      if (dist < range) {
        this.pulling.add(loot);

        this.scene.tweens.add({
          targets: loot,
          x: px,
          y: py,
          duration: 200,
          ease: 'Cubic.easeIn',
          onUpdate: () => {
            // Check if player moved significantly — re-target
            const cdx = this.player.x - loot.x;
            const cdy = this.player.y - loot.y;
            if (Math.sqrt(cdx * cdx + cdy * cdy) < 10) {
              this.collectLoot(loot);
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

  private collectLoot(loot: Loot): void {
    if (!loot.active) return;

    this.pulling.delete(loot);
    loot.collect();

    switch (loot.lootType) {
      case LootType.gold:
        this.player.addGold(loot.value);
        break;

      case LootType.wood:
        this.player.addMaterial('wood', loot.value);
        break;

      case LootType.ore:
        this.player.addMaterial('ore', loot.value);
        break;

      case LootType.cloth:
        this.player.addMaterial('cloth', loot.value);
        break;

      case LootType.healthOrb:
        this.player.heal(loot.value);
        break;

      case LootType.equipment:
        console.log(`[LootSystem] Equipment found! Rarity: ${loot.rarity ?? 'white'}`);
        EventBus.emit('player-equipment-found', { rarity: loot.rarity ?? 'white' });
        break;
    }
  }

  destroy(): void {
    EventBus.off('enemy-killed', this.onEnemyKilled, this);
  }
}
