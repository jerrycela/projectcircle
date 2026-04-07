import Phaser from 'phaser';
import { SKILL_DEFS, GAME_CONFIG } from '../config';
import type { SkillManager } from '../systems/SkillManager';
import EventBus from '../systems/EventBus';

/**
 * Shows 3 random skills at the start of a new run.
 * Player must pick one before gameplay begins.
 */
export class InitialSkillPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private skillManager: SkillManager | null = null;
  private picked = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(300);
    this.container.setVisible(false);
  }

  show(skillManager: SkillManager): void {
    this.skillManager = skillManager;
    this.picked = false;

    EventBus.emit('ui-input-lock');
    EventBus.emit('gameplay-lock', true);

    const allKeys = Object.keys(SKILL_DEFS);
    const shuffled = [...allKeys];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const cards = shuffled.slice(0, Math.min(3, shuffled.length));

    if (cards.length === 0) { this.close(); return; }

    this.render(cards);
  }

  private render(cards: string[]): void {
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    // Background overlay
    const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);
    bg.setInteractive();
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(width / 2, 80, 'Choose Your Skill', {
      fontSize: '24px', color: '#cc66ff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    // Subtitle
    const subtitle = this.scene.add.text(width / 2, 115, 'Pick one to begin', {
      fontSize: '14px', color: '#8866aa', fontFamily: 'monospace',
    });
    subtitle.setOrigin(0.5, 0.5);
    this.container.add(subtitle);

    // Skill cards
    const cardW = 300;
    const cardH = 140;
    const gap = 16;
    const startY = 170;

    cards.forEach((skillKey, i) => {
      const cy = startY + i * (cardH + gap) + cardH / 2;
      this.createSkillCard(width / 2, cy, cardW, cardH, skillKey);
    });

    this.container.setVisible(true);
  }

  private createSkillCard(cx: number, cy: number, w: number, h: number, skillKey: string): void {
    const def = SKILL_DEFS[skillKey];

    const cardBg = this.scene.add.rectangle(cx, cy, w, h, 0x1a1a33, 1.0);
    cardBg.setStrokeStyle(2, 0x9933ff);
    cardBg.setInteractive({ useHandCursor: true });
    this.container.add(cardBg);

    // Category badge
    const categoryLabel = def.category === 'magic' ? 'MAGIC' : 'PHYSICAL';
    const categoryColor = def.category === 'magic' ? '#4488ff' : '#ff8844';
    const badge = this.scene.add.text(cx + w / 2 - 12, cy - h / 2 + 8, categoryLabel, {
      fontSize: '10px', color: categoryColor, fontFamily: 'monospace',
    });
    badge.setOrigin(1, 0);
    this.container.add(badge);

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

    // Element tag (if any)
    if (def.fixedElement) {
      const elemNames: Record<string, string> = {
        WATER: 'Water', FIRE: 'Fire', THUNDER: 'Thunder', WIND: 'Wind',
      };
      const elemColors: Record<string, string> = {
        WATER: '#4488ff', FIRE: '#ff6600', THUNDER: '#ffff44', WIND: '#88ffcc',
      };
      const elemName = elemNames[def.fixedElement] ?? def.fixedElement;
      const elemText = this.scene.add.text(cx - w / 2 + 20, cy + 36, elemName, {
        fontSize: '11px', color: elemColors[def.fixedElement] ?? '#aaaaaa', fontFamily: 'monospace',
      });
      this.container.add(elemText);
    }

    // Click handler
    cardBg.on('pointerdown', () => {
      this.onCardClicked(skillKey, cx, cy);
    });

    cardBg.on('pointerover', () => cardBg.setFillStyle(0x2a2a44));
    cardBg.on('pointerout', () => cardBg.setFillStyle(0x1a1a33));
  }

  private onCardClicked(skillKey: string, cx: number, cy: number): void {
    if (this.picked || !this.skillManager) return;
    this.picked = true;

    const def = SKILL_DEFS[skillKey];
    this.skillManager.addSkill(skillKey);

    // Flash feedback (added to container so destroy() cleans it up)
    const flash = this.scene.add.text(cx, cy - 60, `${def.name} acquired!`, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    });
    flash.setOrigin(0.5, 0.5);
    flash.setDepth(310);
    this.container.add(flash);

    this.scene.tweens.add({
      targets: flash,
      y: cy - 90,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.Out',
    });

    // Close after short delay
    this.scene.time.delayedCall(400, () => {
      this.close();
    });
  }

  private close(): void {
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.skillManager = null;
    this.picked = false;

    EventBus.emit('ui-input-unlock');
    EventBus.emit('gameplay-lock', false);
  }

  destroy(): void {
    if (this.skillManager !== null) {
      EventBus.emit('ui-input-unlock');
      EventBus.emit('gameplay-lock', false);
    }
    this.container.setVisible(false);
    this.container.removeAll(true);
    this.skillManager = null;
    this.picked = false;
  }
}
