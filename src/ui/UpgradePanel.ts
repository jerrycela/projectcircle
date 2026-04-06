import Phaser from 'phaser';
import { UPGRADE_DEFS, SKILL_DEFS } from '../config';
import type { UpgradeDefinition, SkillDefinition } from '../config';
import type { StatsManager, StatBlock } from '../systems/StatsManager';
import type { Player } from '../entities/Player';
import type { SkillManager } from '../systems/SkillManager';
import EventBus from '../systems/EventBus';

interface CardData {
  key: string;
  def: UpgradeDefinition;
  cost: number;
  level: number;
}

interface SkillCardData {
  key: string;
  def: SkillDefinition;
}

export class UpgradePanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;
  private statsManager!: StatsManager;
  private player!: Player;
  private skillManager?: SkillManager;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(300);
    this.container.setVisible(false);
  }

  show(statsManager: StatsManager, player: Player, skillManager?: SkillManager): void {
    if (this.visible) return;
    this.statsManager = statsManager;
    this.player = player;
    this.skillManager = skillManager;
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

    // Generate 3 random upgrade/skill cards from combined pool
    const { upgradeCards, skillCards } = this.pickRandomOptions(3);
    const totalCards = upgradeCards.length + skillCards.length;

    // If no options available, close immediately
    if (totalCards === 0) {
      this.showFlash(width / 2, height / 2, 'All upgrades maxed!');
      this.scene.time.delayedCall(800, () => this.close());
      return;
    }

    const cardW = 300;
    const cardH = 140;
    const gap = 16;
    const startY = 180;

    let cardIndex = 0;
    upgradeCards.forEach((card) => {
      const cy = startY + cardIndex * (cardH + gap) + cardH / 2;
      this.createCard(width / 2, cy, cardW, cardH, card);
      cardIndex++;
    });

    skillCards.forEach((card) => {
      const cy = startY + cardIndex * (cardH + gap) + cardH / 2;
      this.createSkillCard(width / 2, cy, cardW, cardH, card);
      cardIndex++;
    });

    // Skip button
    const skipY = startY + totalCards * (cardH + gap) + 30;
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

  private pickRandomOptions(count: number): { upgradeCards: CardData[]; skillCards: SkillCardData[] } {
    const upgradePool: CardData[] = [];
    const skillPool: SkillCardData[] = [];

    // Stat upgrades
    for (const [key, def] of Object.entries(UPGRADE_DEFS)) {
      const level = this.statsManager.getLevel(key);
      if (level >= def.maxLevel) continue;
      const cost = def.baseCost + level * def.costScale;
      upgradePool.push({ key, def, cost, level });
    }

    // Skills — only include if player has < 2 skills
    const ownedSkillCount = this.skillManager?.getSkillCount() ?? 0;
    if (ownedSkillCount < 2) {
      for (const [key, def] of Object.entries(SKILL_DEFS)) {
        // Skip already-owned skills
        if (this.skillManager?.hasSkill(key)) continue;
        skillPool.push({ key, def });
      }
    }

    // Combine and shuffle
    const combined: Array<{ isSkill: boolean; index: number }> = [
      ...upgradePool.map((_, i) => ({ isSkill: false, index: i })),
      ...skillPool.map((_, i) => ({ isSkill: true, index: i })),
    ];

    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    const selected = combined.slice(0, count);
    const selectedUpgrades = selected.filter(c => !c.isSkill).map(c => upgradePool[c.index]);
    const selectedSkills = selected.filter(c => c.isSkill).map(c => skillPool[c.index]);

    return { upgradeCards: selectedUpgrades, skillCards: selectedSkills };
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

  private createSkillCard(
    cx: number, cy: number,
    w: number, h: number,
    card: SkillCardData,
  ): void {
    // Skill cards are always free — no gold cost
    const cardBg = this.scene.add.rectangle(cx, cy, w, h, 0x1a1a33, 1.0);
    cardBg.setStrokeStyle(2, 0x9933ff);
    cardBg.setInteractive({ useHandCursor: true });
    this.container.add(cardBg);

    // "SKILL" badge top-right
    const badgeText = this.scene.add.text(cx + w / 2 - 12, cy - h / 2 + 8, 'SKILL', {
      fontSize: '10px',
      color: '#cc66ff',
      fontFamily: 'monospace',
    });
    badgeText.setOrigin(1, 0);
    this.container.add(badgeText);

    // Name
    const nameText = this.scene.add.text(cx - w / 2 + 20, cy - 42, card.def.name, {
      fontSize: '20px',
      color: '#cc66ff',
      fontFamily: 'monospace',
    });
    this.container.add(nameText);

    // Description
    const descText = this.scene.add.text(cx - w / 2 + 20, cy - 12, card.def.description, {
      fontSize: '13px',
      color: '#aaaacc',
      fontFamily: 'monospace',
    });
    this.container.add(descText);

    // MP cost + cooldown line
    const cdSec = (card.def.cooldownMs / 1000).toFixed(0);
    const statsLine = `MP: ${card.def.mpCost} | CD: ${cdSec}s`;
    const statsText = this.scene.add.text(cx - w / 2 + 20, cy + 14, statsLine, {
      fontSize: '12px',
      color: '#7777aa',
      fontFamily: 'monospace',
    });
    this.container.add(statsText);

    // "FREE" label (no gold cost)
    const freeText = this.scene.add.text(cx + w / 2 - 20, cy + 40, 'FREE', {
      fontSize: '16px',
      color: '#cc66ff',
      fontFamily: 'monospace',
    });
    freeText.setOrigin(1, 0.5);
    this.container.add(freeText);

    // Click handler
    cardBg.on('pointerdown', () => {
      this.acquireSkill(card, cx, cy);
    });

    // Hover
    cardBg.on('pointerover', () => cardBg.setFillStyle(0x2a2a44));
    cardBg.on('pointerout', () => cardBg.setFillStyle(0x1a1a33));
  }

  private acquireSkill(card: SkillCardData, cx: number, cy: number): void {
    // Emit skill-acquired event — GameScene handles addSkill()
    EventBus.emit('skill-acquired', card.key);
    this.showFlash(cx, cy - 60, `${card.def.name} acquired!`);
    this.scene.time.delayedCall(400, () => this.close());
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
