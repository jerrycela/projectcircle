import Phaser from 'phaser';
import type { EquipmentItem } from '../config';

export const LootType = {
  gold: 'gold',
  wood: 'wood',
  ore: 'ore',
  cloth: 'cloth',
  healthOrb: 'healthOrb',
  equipment: 'equipment',
} as const;

export type LootType = typeof LootType[keyof typeof LootType];

const TEXTURE_MAP: Record<LootType, string> = {
  gold: 'loot-gold',
  wood: 'loot-wood',
  ore: 'loot-ore',
  cloth: 'loot-cloth',
  healthOrb: 'loot-health-orb',
  equipment: 'loot-equipment',
};

export class Loot extends Phaser.GameObjects.Image {
  public lootType: LootType;
  public value: number;
  public rarity?: string;
  public equipmentData?: EquipmentItem;

  private bobTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    lootType: LootType,
    value: number,
    rarity?: string,
  ) {
    super(scene, x, y, TEXTURE_MAP[lootType]);
    this.setOrigin(0.5, 0.5);

    this.lootType = lootType;
    this.value = value;
    this.rarity = rarity;

    scene.add.existing(this);

    this.startBob();
    this.playSpawnAnimation();
  }

  private startBob(): void {
    const baseY = this.y;
    this.bobTween = this.scene.tweens.add({
      targets: this,
      y: baseY - 3,
      duration: 600,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private playSpawnAnimation(): void {
    this.setScale(0);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
  }

  collect(): void {
    this.bobTween?.destroy();
    this.bobTween = undefined;
    this.equipmentData = undefined;
    this.setActive(false);
    this.setVisible(false);
  }
}
