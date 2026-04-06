import Phaser from 'phaser';
import { UPGRADE_DEFS } from '../config';
import type { UpgradeDefinition } from '../config';
import type { StatsManager, StatBlock } from '../systems/StatsManager';
import type { Player } from '../entities/Player';
import EventBus from '../systems/EventBus';

interface CardData {
  key: string;
  def: UpgradeDefinition;
  cost: number;
  level: number;
}

export class UpgradePanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;
  private statsManager!: StatsManager;
  private player!: Player;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(300);
    this.container.setVisible(false);
  }

  show(statsManager: StatsManager, player: Player): void {
    if (this.visible) return;
    this.statsManager = statsManager;
    this.player = player;
    this.visible = true;

    // Clear previous content
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    // Background overlay — interactive to block click-through
    const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    bg.setInteractive();
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(width / 2, 100, 'Choose an Upgrade', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    // Generate 3 random upgrade cards
    const cards = this.pickRandomUpgrades(3);

    // If no upgrades available (all maxed), close immediately
    if (cards.length === 0) {
      this.showFlash(width / 2, height / 2, 'All upgrades maxed!');
      this.scene.time.delayedCall(800, () => this.close());
      return;
    }

    const cardW = 300;
    const cardH = 140;
    const gap = 16;
    const startY = 180;

    cards.forEach((card, i) => {
      const cy = startY + i * (cardH + gap) + cardH / 2;
      this.createCard(width / 2, cy, cardW, cardH, card);
    });

    // Skip button
    const skipY = startY + cards.length * (cardH + gap) + 30;
    const skipBg = this.scene.add.rectangle(width / 2, skipY, 120, 40, 0x333333);
    skipBg.setStrokeStyle(1, 0x666666);
    skipBg.setInteractive({ useHandCursor: true });
    skipBg.on('pointerover', () => skipBg.setFillStyle(0x555555));
    skipBg.on('pointerout', () => skipBg.setFillStyle(0x333333));
    skipBg.on('pointerdown', () => this.close());
    this.container.add(skipBg);

    const skipText = this.scene.add.text(width / 2, skipY, 'Skip', {
      fontSize: '18px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    });
    skipText.setOrigin(0.5, 0.5);
    this.container.add(skipText);

    this.container.setVisible(true);

    // Lock input + gameplay
    EventBus.emit('ui-input-lock');
    EventBus.emit('gameplay-lock', true);
  }

  private close(): void {
    if (!this.visible) return;
    this.visible = false;
    this.container.setVisible(false);
    this.container.removeAll(true);

    // Unlock input + gameplay
    EventBus.emit('ui-input-unlock');
    EventBus.emit('gameplay-lock', false);

    // Tell altar to consume
    EventBus.emit('altar-consumed');
  }

  private pickRandomUpgrades(count: number): CardData[] {
    const available: CardData[] = [];

    for (const [key, def] of Object.entries(UPGRADE_DEFS)) {
      const level = this.statsManager.getLevel(key);
      if (level >= def.maxLevel) continue;
      const cost = def.baseCost + level * def.costScale;
      available.push({ key, def, cost, level });
    }

    // Shuffle and take up to count
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }

    return available.slice(0, count);
  }

  private createCard(
    cx: number, cy: number,
    w: number, h: number,
    card: CardData,
  ): void {
    const canAfford = this.player.gold >= card.cost;
    const alpha = canAfford ? 1.0 : 0.5;

    // Card background
    const cardBg = this.scene.add.rectangle(cx, cy, w, h, 0x222222, alpha);
    cardBg.setStrokeStyle(2, canAfford ? 0xffcc00 : 0x666666);
    cardBg.setInteractive({ useHandCursor: canAfford });
    this.container.add(cardBg);

    // Name
    const nameText = this.scene.add.text(cx - w / 2 + 20, cy - 40, card.def.name, {
      fontSize: '20px',
      color: canAfford ? '#ffcc00' : '#666666',
      fontFamily: 'monospace',
    });
    this.container.add(nameText);

    // Description
    const descText = this.scene.add.text(cx - w / 2 + 20, cy - 10, card.def.description, {
      fontSize: '14px',
      color: canAfford ? '#cccccc' : '#555555',
      fontFamily: 'monospace',
    });
    this.container.add(descText);

    // Level
    const levelText = this.scene.add.text(cx - w / 2 + 20, cy + 16, `Lv ${card.level} -> ${card.level + 1}`, {
      fontSize: '12px',
      color: canAfford ? '#888888' : '#444444',
      fontFamily: 'monospace',
    });
    this.container.add(levelText);

    // Cost
    const costText = this.scene.add.text(cx + w / 2 - 20, cy + 40, `${card.cost} G`, {
      fontSize: '16px',
      color: canAfford ? '#ffcc00' : '#663300',
      fontFamily: 'monospace',
    });
    costText.setOrigin(1, 0.5);
    this.container.add(costText);

    // Click handler
    cardBg.on('pointerdown', () => {
      if (!canAfford) {
        this.showFlash(cx, cy - 60, 'Not enough gold');
        return;
      }
      this.purchaseUpgrade(card, cx, cy);
    });

    // Hover
    if (canAfford) {
      cardBg.on('pointerover', () => cardBg.setFillStyle(0x333333));
      cardBg.on('pointerout', () => cardBg.setFillStyle(0x222222));
    }
  }

  private purchaseUpgrade(card: CardData, cx: number, cy: number): void {
    // Deduct gold
    this.player.gold -= card.cost;
    EventBus.emit('player-gold-changed', this.player.gold);

    // Apply stat bonuses
    card.def.statKeys.forEach((key, i) => {
      this.statsManager.addBonus(key as keyof StatBlock, card.def.effectPerLevel[i]);
    });

    // Increment level
    this.statsManager.incrementLevel(card.key);

    // Update player maxHp live (must happen before MaxHP heal)
    this.player.maxHp = this.statsManager.getStat('maxHp');

    // Special: Max HP+ also heals by the upgrade amount (e.g. +30 HP, not full heal)
    if (card.key === 'maxHp') {
      this.player.hp = Math.min(this.player.hp + card.def.effectPerLevel[0], this.player.maxHp);
      EventBus.emit('player-hp-changed', this.player.hp, this.player.maxHp);
    }

    // Confirmation text
    const effectLabel = card.def.description;
    this.showFlash(cx, cy - 60, effectLabel);

    // Close after brief delay
    this.scene.time.delayedCall(400, () => this.close());
  }

  private showFlash(x: number, y: number, message: string): void {
    const text = this.scene.add.text(x, y, message, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(310);

    this.scene.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.Out',
      onComplete: () => text.destroy(),
    });
  }
}
