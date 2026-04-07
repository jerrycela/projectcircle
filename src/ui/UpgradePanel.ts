import Phaser from 'phaser';
import { UPGRADE_DEFS, SKILL_DEFS, GAME_CONFIG } from '../config';
import type { UpgradeDefinition, SkillDefinition } from '../config';
import type { StatsManager, StatBlock } from '../systems/StatsManager';
import type { Player } from '../entities/Player';
import type { SkillManager } from '../systems/SkillManager';
import type { Altar } from '../entities/Altar';
import EventBus from '../systems/EventBus';

type PanelPhase = 'SKILL_PICK' | 'SHOP' | 'CLOSED';

export class UpgradePanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private phase: PanelPhase = 'CLOSED';
  private statsManager!: StatsManager;
  private player!: Player;
  private skillManager!: SkillManager;
  private altar: Altar | null = null;
  private sessionActive: boolean = false;

  // Skill pick state
  private currentSkillCards: string[] = [];
  private rerollsUsed: number = 0;

  // Flash throttle
  private lastFlashTime: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(300);
    this.container.setVisible(false);
  }

  show(statsManager: StatsManager, player: Player, skillManager: SkillManager, altar: Altar): void {
    if (this.sessionActive) return;
    this.statsManager = statsManager;
    this.player = player;
    this.skillManager = skillManager;
    this.altar = altar;
    this.sessionActive = true;
    this.rerollsUsed = 0;

    // Lock input for entire session
    EventBus.emit('ui-input-lock');
    EventBus.emit('gameplay-lock', true);

    // Decide phase: skill pick first (if not yet offered), then shop
    if (!altar.skillOffered) {
      const pool = this.getEligibleSkillPool();
      if (pool.length > 0) {
        this.showSkillPick(pool);
      } else {
        // No skills available — skip to shop
        altar.skillOffered = true;
        this.showShop();
      }
    } else {
      this.showShop();
    }
  }

  // ------------------------------------------------------------------ SKILL PICK PHASE

  private getEligibleSkillPool(): string[] {
    const pool: string[] = [];
    for (const key of Object.keys(SKILL_DEFS)) {
      if (this.skillManager.hasSkill(key)) {
        // Owned — only include if level < max
        if (this.skillManager.getSkillLevel(key) < GAME_CONFIG.SKILL_MAX_LEVEL) {
          pool.push(key);
        }
      } else {
        // Not owned — always include
        pool.push(key);
      }
    }
    return pool;
  }

  private drawSkillCards(pool: string[]): string[] {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(3, shuffled.length));
  }

  private showSkillPick(pool: string[]): void {
    this.phase = 'SKILL_PICK';
    this.currentSkillCards = this.drawSkillCards(pool);
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;

    // Background overlay
    const bg = this.scene.add.rectangle(width / 2, this.scene.cameras.main.height / 2, width, this.scene.cameras.main.height, 0x000000, 0.7);
    bg.setInteractive();
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(width / 2, 80, 'Choose a Skill', {
      fontSize: '24px', color: '#cc66ff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    // Skill cards
    const cardW = 300;
    const cardH = 140;
    const gap = 16;
    const startY = 160;

    this.currentSkillCards.forEach((skillKey, i) => {
      const cy = startY + i * (cardH + gap) + cardH / 2;
      this.createSkillCard(width / 2, cy, cardW, cardH, skillKey);
    });

    // Buttons row
    const buttonY = startY + this.currentSkillCards.length * (cardH + gap) + 30;

    // Reroll button
    const rerollCost = this.rerollsUsed === 0 ? 0 : GAME_CONFIG.ALTAR_REROLL_COST;
    const canReroll = rerollCost === 0 || this.player.gold >= rerollCost;
    const rerollLabel = this.rerollsUsed === 0 ? 'Reroll (Free)' : `Reroll (${rerollCost}G)`;

    const rerollBg = this.scene.add.rectangle(width / 2 - 80, buttonY, 140, 40, 0x333333, canReroll ? 1.0 : 0.5);
    rerollBg.setStrokeStyle(1, canReroll ? 0x9933ff : 0x666666);
    if (canReroll) {
      rerollBg.setInteractive({ useHandCursor: true });
      rerollBg.on('pointerover', () => rerollBg.setFillStyle(0x555555));
      rerollBg.on('pointerout', () => rerollBg.setFillStyle(0x333333));
      rerollBg.on('pointerdown', () => {
        if (rerollCost > 0) {
          this.player.gold -= rerollCost;
          EventBus.emit('player-gold-changed', this.player.gold);
        }
        this.rerollsUsed++;
        const newPool = this.getEligibleSkillPool();
        this.showSkillPick(newPool);
      });
    }
    this.container.add(rerollBg);

    const rerollText = this.scene.add.text(width / 2 - 80, buttonY, rerollLabel, {
      fontSize: '14px', color: canReroll ? '#cc66ff' : '#666666', fontFamily: 'monospace',
    });
    rerollText.setOrigin(0.5, 0.5);
    this.container.add(rerollText);

    // Skip button
    const skipBg = this.scene.add.rectangle(width / 2 + 80, buttonY, 100, 40, 0x333333);
    skipBg.setStrokeStyle(1, 0x666666);
    skipBg.setInteractive({ useHandCursor: true });
    skipBg.on('pointerover', () => skipBg.setFillStyle(0x555555));
    skipBg.on('pointerout', () => skipBg.setFillStyle(0x333333));
    skipBg.on('pointerdown', () => {
      if (this.altar) this.altar.skillOffered = true;
      this.showShop();
    });
    this.container.add(skipBg);

    const skipText = this.scene.add.text(width / 2 + 80, buttonY, 'Skip', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    skipText.setOrigin(0.5, 0.5);
    this.container.add(skipText);

    this.container.setVisible(true);
  }

  private createSkillCard(cx: number, cy: number, w: number, h: number, skillKey: string): void {
    const def = SKILL_DEFS[skillKey];
    const isOwned = this.skillManager.hasSkill(skillKey);
    const currentLevel = this.skillManager.getSkillLevel(skillKey);

    const cardBg = this.scene.add.rectangle(cx, cy, w, h, 0x1a1a33, 1.0);
    cardBg.setStrokeStyle(2, 0x9933ff);
    cardBg.setInteractive({ useHandCursor: true });
    this.container.add(cardBg);

    // Badge
    const badgeLabel = isOwned ? `Lv.${currentLevel} -> ${currentLevel + 1}` : 'NEW';
    const badgeText = this.scene.add.text(cx + w / 2 - 12, cy - h / 2 + 8, badgeLabel, {
      fontSize: '10px', color: '#cc66ff', fontFamily: 'monospace',
    });
    badgeText.setOrigin(1, 0);
    this.container.add(badgeText);

    // Name
    const nameText = this.scene.add.text(cx - w / 2 + 20, cy - 42, def.name, {
      fontSize: '20px', color: '#cc66ff', fontFamily: 'monospace',
    });
    this.container.add(nameText);

    // Description
    const descText = this.scene.add.text(cx - w / 2 + 20, cy - 12, def.description, {
      fontSize: '13px', color: '#aaaacc', fontFamily: 'monospace',
    });
    this.container.add(descText);

    // Stats line
    const cdSec = (def.cooldownMs / 1000).toFixed(0);
    const statsLine = `MP: ${def.mpCost} | CD: ${cdSec}s`;
    const statsText = this.scene.add.text(cx - w / 2 + 20, cy + 14, statsLine, {
      fontSize: '12px', color: '#7777aa', fontFamily: 'monospace',
    });
    this.container.add(statsText);

    // FREE label
    const freeText = this.scene.add.text(cx + w / 2 - 20, cy + 40, 'FREE', {
      fontSize: '16px', color: '#cc66ff', fontFamily: 'monospace',
    });
    freeText.setOrigin(1, 0.5);
    this.container.add(freeText);

    // Click
    cardBg.on('pointerdown', () => {
      this.onSkillCardClicked(skillKey, cx, cy);
    });

    cardBg.on('pointerover', () => cardBg.setFillStyle(0x2a2a44));
    cardBg.on('pointerout', () => cardBg.setFillStyle(0x1a1a33));
  }

  private onSkillCardClicked(skillKey: string, cx: number, cy: number): void {
    const def = SKILL_DEFS[skillKey];
    const isOwned = this.skillManager.hasSkill(skillKey);

    if (isOwned) {
      // Upgrade existing skill
      this.skillManager.upgradeSkill(skillKey);
      const newLevel = this.skillManager.getSkillLevel(skillKey);
      this.showFlash(cx, cy - 60, `${def.name} -> Lv.${newLevel}!`);
      if (this.altar) this.altar.skillOffered = true;
      this.scene.time.delayedCall(400, () => this.showShop());
    } else {
      // Learn new skill
      const slotCount = this.skillManager.getSkillCount();
      if (slotCount < GAME_CONFIG.SKILL_SLOT_COUNT) {
        // Has empty slot
        this.skillManager.addSkill(skillKey);
        this.showFlash(cx, cy - 60, `${def.name} acquired!`);
        if (this.altar) this.altar.skillOffered = true;
        this.scene.time.delayedCall(400, () => this.showShop());
      } else {
        // Slots full — show replace modal
        this.showReplaceModal(skillKey);
      }
    }
  }

  private showReplaceModal(newSkillKey: string): void {
    this.container.removeAll(true);
    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);
    bg.setInteractive();
    this.container.add(bg);

    const title = this.scene.add.text(width / 2, 120, 'Replace which skill?', {
      fontSize: '22px', color: '#ff6666', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    // New skill info
    const newDef = SKILL_DEFS[newSkillKey];
    const newInfo = this.scene.add.text(width / 2, 160, `New: ${newDef.name}`, {
      fontSize: '16px', color: '#cc66ff', fontFamily: 'monospace',
    });
    newInfo.setOrigin(0.5, 0.5);
    this.container.add(newInfo);

    // Show two slot buttons
    for (let i = 0; i < GAME_CONFIG.SKILL_SLOT_COUNT; i++) {
      const slotType = this.skillManager.getSlotType(i);
      const slotLevel = this.skillManager.getSlotLevel(i);
      if (!slotType) continue;
      const slotDef = SKILL_DEFS[slotType];
      if (!slotDef) continue;

      const btnY = 240 + i * 100;
      const btnBg = this.scene.add.rectangle(width / 2, btnY, 280, 70, 0x332222);
      btnBg.setStrokeStyle(2, 0xff6666);
      btnBg.setInteractive({ useHandCursor: true });
      this.container.add(btnBg);

      const slotText = this.scene.add.text(width / 2, btnY - 12, `Slot ${i + 1}: ${slotDef.name} Lv.${slotLevel}`, {
        fontSize: '16px', color: '#ff9999', fontFamily: 'monospace',
      });
      slotText.setOrigin(0.5, 0.5);
      this.container.add(slotText);

      const replaceLabel = this.scene.add.text(width / 2, btnY + 14, 'Replace', {
        fontSize: '12px', color: '#ff6666', fontFamily: 'monospace',
      });
      replaceLabel.setOrigin(0.5, 0.5);
      this.container.add(replaceLabel);

      btnBg.on('pointerover', () => btnBg.setFillStyle(0x443333));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x332222));
      btnBg.on('pointerdown', () => {
        this.skillManager.replaceSkill(i, newSkillKey);
        this.showFlash(width / 2, btnY - 60, `${newDef.name} acquired!`);
        if (this.altar) this.altar.skillOffered = true;
        this.scene.time.delayedCall(400, () => this.showShop());
      });
    }

    // Cancel button — return to skill panel with same cards
    const cancelY = 240 + GAME_CONFIG.SKILL_SLOT_COUNT * 100 + 20;
    const cancelBg = this.scene.add.rectangle(width / 2, cancelY, 120, 40, 0x333333);
    cancelBg.setStrokeStyle(1, 0x666666);
    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(0x555555));
    cancelBg.on('pointerout', () => cancelBg.setFillStyle(0x333333));
    cancelBg.on('pointerdown', () => {
      this.showSkillPickWithCards(this.currentSkillCards);
    });
    this.container.add(cancelBg);

    const cancelText = this.scene.add.text(width / 2, cancelY, 'Cancel', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    cancelText.setOrigin(0.5, 0.5);
    this.container.add(cancelText);
  }

  private showSkillPickWithCards(cards: string[]): void {
    this.currentSkillCards = cards;
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;

    const bg = this.scene.add.rectangle(width / 2, this.scene.cameras.main.height / 2, width, this.scene.cameras.main.height, 0x000000, 0.7);
    bg.setInteractive();
    this.container.add(bg);

    const title = this.scene.add.text(width / 2, 80, 'Choose a Skill', {
      fontSize: '24px', color: '#cc66ff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    const cardW = 300;
    const cardH = 140;
    const gap = 16;
    const startY = 160;

    cards.forEach((skillKey, i) => {
      const cy = startY + i * (cardH + gap) + cardH / 2;
      this.createSkillCard(width / 2, cy, cardW, cardH, skillKey);
    });

    // Buttons
    const buttonY = startY + cards.length * (cardH + gap) + 30;

    // Reroll
    const rerollCost = this.rerollsUsed === 0 ? 0 : GAME_CONFIG.ALTAR_REROLL_COST;
    const canReroll = rerollCost === 0 || this.player.gold >= rerollCost;
    const rerollLabel = this.rerollsUsed === 0 ? 'Reroll (Free)' : `Reroll (${rerollCost}G)`;

    const rerollBg = this.scene.add.rectangle(width / 2 - 80, buttonY, 140, 40, 0x333333, canReroll ? 1.0 : 0.5);
    rerollBg.setStrokeStyle(1, canReroll ? 0x9933ff : 0x666666);
    if (canReroll) {
      rerollBg.setInteractive({ useHandCursor: true });
      rerollBg.on('pointerover', () => rerollBg.setFillStyle(0x555555));
      rerollBg.on('pointerout', () => rerollBg.setFillStyle(0x333333));
      rerollBg.on('pointerdown', () => {
        if (rerollCost > 0) {
          this.player.gold -= rerollCost;
          EventBus.emit('player-gold-changed', this.player.gold);
        }
        this.rerollsUsed++;
        const newPool = this.getEligibleSkillPool();
        this.showSkillPick(newPool);
      });
    }
    this.container.add(rerollBg);

    const rerollText = this.scene.add.text(width / 2 - 80, buttonY, rerollLabel, {
      fontSize: '14px', color: canReroll ? '#cc66ff' : '#666666', fontFamily: 'monospace',
    });
    rerollText.setOrigin(0.5, 0.5);
    this.container.add(rerollText);

    // Skip
    const skipBg = this.scene.add.rectangle(width / 2 + 80, buttonY, 100, 40, 0x333333);
    skipBg.setStrokeStyle(1, 0x666666);
    skipBg.setInteractive({ useHandCursor: true });
    skipBg.on('pointerover', () => skipBg.setFillStyle(0x555555));
    skipBg.on('pointerout', () => skipBg.setFillStyle(0x333333));
    skipBg.on('pointerdown', () => {
      if (this.altar) this.altar.skillOffered = true;
      this.showShop();
    });
    this.container.add(skipBg);

    const skipText = this.scene.add.text(width / 2 + 80, buttonY, 'Skip', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    skipText.setOrigin(0.5, 0.5);
    this.container.add(skipText);

    this.container.setVisible(true);
  }

  // ------------------------------------------------------------------ SHOP PHASE

  private showShop(): void {
    this.phase = 'SHOP';
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    // Background
    const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    bg.setInteractive();
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(width / 2, 60, 'UPGRADES', {
      fontSize: '24px', color: '#ffcc00', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    // 3x2 Grid
    const upgradeKeys = Object.keys(UPGRADE_DEFS);
    const cols = 3;
    const cellW = 120;
    const cellH = 130;
    const gapX = 12;
    const gapY = 12;
    const gridW = cols * cellW + (cols - 1) * gapX;
    const gridStartX = (width - gridW) / 2 + cellW / 2;
    const gridStartY = 130;

    upgradeKeys.forEach((key, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridStartX + col * (cellW + gapX);
      const cy = gridStartY + row * (cellH + gapY) + cellH / 2;
      this.createShopCell(cx, cy, cellW, cellH, key);
    });

    // Gold display
    const goldY = gridStartY + 2 * (cellH + gapY) + cellH + 30;
    const goldText = this.scene.add.text(40, goldY, `Gold: ${this.player.gold}`, {
      fontSize: '18px', color: '#ffcc00', fontFamily: 'monospace',
    });
    this.container.add(goldText);

    // Close (X) button
    const closeBg = this.scene.add.rectangle(width - 50, goldY, 50, 40, 0x333333);
    closeBg.setStrokeStyle(1, 0x666666);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerover', () => closeBg.setFillStyle(0x555555));
    closeBg.on('pointerout', () => closeBg.setFillStyle(0x333333));
    closeBg.on('pointerdown', () => this.closeSession('close-button'));
    this.container.add(closeBg);

    const closeText = this.scene.add.text(width - 50, goldY, 'X', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace',
    });
    closeText.setOrigin(0.5, 0.5);
    this.container.add(closeText);

    this.container.setVisible(true);
  }

  private createShopCell(cx: number, cy: number, w: number, h: number, upgradeKey: string): void {
    const def = UPGRADE_DEFS[upgradeKey];
    const level = this.statsManager.getLevel(upgradeKey);
    const isMaxed = level >= def.maxLevel;
    const cost = def.baseCost + level * def.costScale;
    const canAfford = !isMaxed && this.player.gold >= cost;

    // Colors per upgrade type (for icon placeholder)
    const iconColors: Record<string, number> = {
      attack: 0xff4444,
      armor: 0x888888,
      critDamage: 0xff8800,
      recovery: 0x44ff44,
      moveSpeed: 0x4488ff,
      maxHp: 0xff4444,
    };

    // Determine state
    let borderColor = 0x666666;
    let alpha = 0.5;
    if (isMaxed) {
      borderColor = 0x666666;
      alpha = 0.7;
    } else if (canAfford) {
      borderColor = 0xffcc00;
      alpha = 1.0;
    }

    // Cell background
    const cellBg = this.scene.add.rectangle(cx, cy, w, h, 0x222222, alpha);
    cellBg.setStrokeStyle(2, borderColor);
    this.container.add(cellBg);

    // Icon placeholder (colored circle)
    const icon = this.scene.add.graphics();
    icon.fillStyle(iconColors[upgradeKey] ?? 0xffffff, alpha);
    icon.fillCircle(cx, cy - 30, 16);
    this.container.add(icon);

    // Name
    const nameText = this.scene.add.text(cx, cy + 2, def.name.replace('+', ''), {
      fontSize: '11px', color: canAfford ? '#ffffff' : '#888888', fontFamily: 'monospace',
    });
    nameText.setOrigin(0.5, 0.5);
    this.container.add(nameText);

    // Cumulative bonus
    const totalBonus = def.effectPerLevel[0] * level;
    const bonusLabel = `+${totalBonus}`;
    const bonusText = this.scene.add.text(cx, cy + 18, bonusLabel, {
      fontSize: '10px', color: canAfford ? '#aaaaaa' : '#666666', fontFamily: 'monospace',
    });
    bonusText.setOrigin(0.5, 0.5);
    this.container.add(bonusText);

    // Cost or MAX
    const costLabel = isMaxed ? 'MAX' : `${cost}G`;
    const costColor = isMaxed ? '#888888' : (canAfford ? '#ffcc00' : '#663300');
    const costText = this.scene.add.text(cx, cy + 36, costLabel, {
      fontSize: '12px', color: costColor, fontFamily: 'monospace',
    });
    costText.setOrigin(0.5, 0.5);
    this.container.add(costText);

    // Level
    const levelLabel = `Lv.${level}/${def.maxLevel}`;
    const levelText = this.scene.add.text(cx, cy + 52, levelLabel, {
      fontSize: '9px', color: '#666666', fontFamily: 'monospace',
    });
    levelText.setOrigin(0.5, 0.5);
    this.container.add(levelText);

    // Interaction
    if (isMaxed) {
      return;
    }

    cellBg.setInteractive({ useHandCursor: canAfford });

    if (canAfford) {
      cellBg.on('pointerover', () => cellBg.setFillStyle(0x333333));
      cellBg.on('pointerout', () => cellBg.setFillStyle(0x222222));
    }

    cellBg.on('pointerdown', () => {
      if (!canAfford) {
        this.showFlash(cx, cy - 30, 'Not enough gold');
        return;
      }
      this.purchaseUpgrade(upgradeKey);
    });
  }

  private purchaseUpgrade(upgradeKey: string): void {
    const def = UPGRADE_DEFS[upgradeKey];
    const level = this.statsManager.getLevel(upgradeKey);
    const cost = def.baseCost + level * def.costScale;

    // Deduct gold
    this.player.gold -= cost;
    EventBus.emit('player-gold-changed', this.player.gold);

    // Apply stat bonuses
    def.statKeys.forEach((key, i) => {
      this.statsManager.addBonus(key as keyof StatBlock, def.effectPerLevel[i]);
    });
    this.statsManager.incrementLevel(upgradeKey);

    // Update player maxHp live
    this.player.maxHp = this.statsManager.getStat('maxHp');

    // Max HP+ heals
    if (upgradeKey === 'maxHp') {
      this.player.hp = Math.min(this.player.hp + def.effectPerLevel[0], this.player.maxHp);
      EventBus.emit('player-hp-changed', this.player.hp, this.player.maxHp);
    }

    // Refresh shop to update all cells
    this.showShop();
  }

  // ------------------------------------------------------------------ SESSION LIFECYCLE

  private closeSession(reason: 'close-button' | 'teardown' | 'debug'): void {
    if (!this.sessionActive) return;
    this.sessionActive = false;
    this.phase = 'CLOSED';
    this.container.setVisible(false);
    this.container.removeAll(true);

    // Unlock
    EventBus.emit('ui-input-unlock');
    EventBus.emit('gameplay-lock', false);

    // Notify altar
    EventBus.emit('altar-session-closed', { altar: this.altar, reason });
    this.altar = null;
  }

  /** Called when scene is shutting down — cleanup if session is active */
  destroy(): void {
    if (this.sessionActive) {
      this.closeSession('teardown');
    }
  }

  // ------------------------------------------------------------------ UTILITIES

  private showFlash(x: number, y: number, message: string): void {
    const now = Date.now();
    if (now - this.lastFlashTime < 1000) return;
    this.lastFlashTime = now;

    const text = this.scene.add.text(x, y, message, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(310);

    this.scene.tweens.add({
      targets: text,
      y: y - 30,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.Out',
      onComplete: () => text.destroy(),
    });
  }
}
