import Phaser from 'phaser';
import { SKILL_DEFS } from '../config';
import EventBus from '../systems/EventBus';
import type { SkillSlotState } from '../systems/SkillManager';
import { GOTHIC_COLORS, drawStoneCircle } from './GothicTheme';

const VISUAL_RADIUS = 25;   // 50px diameter visual
const TOUCH_RADIUS = 30;    // 60px hit zone
const PRESSED_RADIUS = 22;  // P2 修正: redraw smaller instead of setScale

export class SkillButton {
  private scene: Phaser.Scene;
  private slotIndex: number;
  private x: number;
  private y: number;

  // Graphics layers
  private bgGraphics: Phaser.GameObjects.Graphics;
  private iconGraphics: Phaser.GameObjects.Graphics;
  private overlayGraphics: Phaser.GameObjects.Graphics;

  // Text labels
  private plusText: Phaser.GameObjects.Text;
  private mpText: Phaser.GameObjects.Text;

  // Touch zone
  private hitZone: Phaser.GameObjects.Zone;

  // Current state (cached for redraw)
  private currentType: string | null = null;
  private currentState: SkillSlotState = 'EMPTY';
  private currentMpEnough: boolean = true;
  private currentCooldownRatio: number = 0;

  // Press state
  private isPressed: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, slotIndex: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.slotIndex = slotIndex;

    this.bgGraphics = scene.add.graphics();
    this.bgGraphics.setDepth(20);

    this.iconGraphics = scene.add.graphics();
    this.iconGraphics.setDepth(21);

    this.overlayGraphics = scene.add.graphics();
    this.overlayGraphics.setDepth(22);

    this.plusText = scene.add.text(x, y, '+', {
      fontSize: '20px',
      color: '#d4c4a0',
      fontFamily: 'monospace',
    });
    this.plusText.setOrigin(0.5, 0.5);
    this.plusText.setDepth(23);
    this.plusText.setAlpha(0.6);

    this.mpText = scene.add.text(x, y + VISUAL_RADIUS + 8, '', {
      fontSize: '10px',
      color: '#d4c4a0',
      fontFamily: 'monospace',
    });
    this.mpText.setOrigin(0.5, 0.5);
    this.mpText.setDepth(23);
    this.mpText.setVisible(false);

    // Interactive hit zone
    this.hitZone = scene.add.zone(x, y, TOUCH_RADIUS * 2, TOUCH_RADIUS * 2);
    this.hitZone.setDepth(24);
    this.hitZone.setInteractive({ useHandCursor: false });

    this.hitZone.on('pointerdown', () => this.onPointerDown());
    this.hitZone.on('pointerup', () => this.onPointerUp());
    this.hitZone.on('pointerout', () => this.onPointerUp());

    // Initial draw
    this.drawEmpty();
  }

  // ------------------------------------------------------------------ UPDATE

  update(skillType: string | null, state: SkillSlotState, cooldownRatio: number, mpEnough: boolean): void {
    this.currentType = skillType;
    this.currentState = state;
    this.currentCooldownRatio = cooldownRatio;
    this.currentMpEnough = mpEnough;

    this.redraw();
  }

  // ------------------------------------------------------------------ DRAWING

  private redraw(): void {
    this.bgGraphics.clear();
    this.iconGraphics.clear();
    this.overlayGraphics.clear();

    switch (this.currentState) {
      case 'EMPTY':
        this.drawEmpty();
        break;
      case 'READY':
        this.drawReady();
        break;
      case 'CASTING':
        this.drawCasting();
        break;
      case 'COOLDOWN':
        this.drawCooldown();
        break;
    }
  }

  private drawEmpty(): void {
    this.bgGraphics.fillStyle(GOTHIC_COLORS.STONE_DARK, 0.4);
    this.bgGraphics.fillCircle(this.x, this.y, VISUAL_RADIUS);
    drawStoneCircle(this.bgGraphics, this.x, this.y, VISUAL_RADIUS);

    this.plusText.setVisible(true);
    this.plusText.setAlpha(0.4);
    this.mpText.setVisible(false);
  }

  private drawReady(): void {
    const alpha = this.currentMpEnough ? 1.0 : 0.5;
    // P2 修正: press feedback via smaller radius, not setScale
    const r = this.isPressed ? PRESSED_RADIUS : VISUAL_RADIUS;

    this.bgGraphics.fillStyle(GOTHIC_COLORS.STONE_SURFACE, alpha);
    this.bgGraphics.fillCircle(this.x, this.y, r);
    drawStoneCircle(this.bgGraphics, this.x, this.y, r);

    if (!this.currentMpEnough) {
      this.bgGraphics.lineStyle(2, GOTHIC_COLORS.TEXT_BLOOD, 0.8);
      this.bgGraphics.strokeCircle(this.x, this.y, r + 1);
    }

    this.plusText.setVisible(false);
    this.drawSkillIcon(alpha);

    // MP cost label
    if (this.currentType) {
      const def = SKILL_DEFS[this.currentType];
      if (def) {
        this.mpText.setText(`${def.mpCost} MP`);
        this.mpText.setColor(this.currentMpEnough ? '#d4c4a0' : '#8b0000');
        this.mpText.setVisible(true);
      }
    }
  }

  private drawCasting(): void {
    this.bgGraphics.fillStyle(GOTHIC_COLORS.STONE_DARK, 0.4);
    this.bgGraphics.fillCircle(this.x, this.y, VISUAL_RADIUS);
    drawStoneCircle(this.bgGraphics, this.x, this.y, VISUAL_RADIUS);

    this.plusText.setVisible(false);
    this.drawSkillIcon(0.4);
    this.mpText.setVisible(false);
  }

  private drawCooldown(): void {
    this.bgGraphics.fillStyle(GOTHIC_COLORS.STONE_SURFACE, 1.0);
    this.bgGraphics.fillCircle(this.x, this.y, VISUAL_RADIUS);
    drawStoneCircle(this.bgGraphics, this.x, this.y, VISUAL_RADIUS);

    this.plusText.setVisible(false);
    this.drawSkillIcon(0.6);

    // Clockwise dark arc overlay — ratio 1.0 = full cooldown (just cast), 0.0 = ready
    if (this.currentCooldownRatio > 0) {
      const startAngle = -Math.PI / 2; // top
      const endAngle = startAngle + this.currentCooldownRatio * Math.PI * 2;

      this.overlayGraphics.fillStyle(0x2a1a0a, 0.7); // dark brown
      this.overlayGraphics.beginPath();
      this.overlayGraphics.moveTo(this.x, this.y);
      this.overlayGraphics.arc(this.x, this.y, VISUAL_RADIUS, startAngle, endAngle, false);
      this.overlayGraphics.closePath();
      this.overlayGraphics.fillPath();
    }

    this.mpText.setVisible(false);
  }

  private drawSkillIcon(alpha: number): void {
    if (!this.currentType) return;

    this.iconGraphics.fillStyle(0xffffff, alpha);

    switch (this.currentType) {
      case 'whirlwind':
        // Circular swirl — concentric arcs
        this.iconGraphics.lineStyle(3, 0xffffff, alpha);
        this.iconGraphics.beginPath();
        this.iconGraphics.arc(this.x, this.y, 14, 0, Math.PI * 1.5, false);
        this.iconGraphics.strokePath();
        this.iconGraphics.beginPath();
        this.iconGraphics.arc(this.x, this.y, 8, Math.PI * 0.5, Math.PI * 2, false);
        this.iconGraphics.strokePath();
        // Arrow tip for whirl direction
        this.iconGraphics.fillCircle(this.x + 14, this.y, 3);
        break;

      case 'shadow-dash':
        // Arrow pointing right
        this.iconGraphics.fillStyle(0xaaaaff, alpha);
        this.iconGraphics.fillRect(this.x - 14, this.y - 4, 18, 8);
        // Arrow head
        this.iconGraphics.fillTriangle(
          this.x + 4, this.y - 10,
          this.x + 4, this.y + 10,
          this.x + 16, this.y,
        );
        break;

      case 'tornado':
        // Swirling wind lines
        this.iconGraphics.lineStyle(2, 0x88ffcc, alpha);
        this.iconGraphics.beginPath();
        this.iconGraphics.arc(this.x, this.y, 16, 0, Math.PI * 1.2, false);
        this.iconGraphics.strokePath();
        this.iconGraphics.beginPath();
        this.iconGraphics.arc(this.x, this.y - 4, 10, Math.PI, Math.PI * 2.2, false);
        this.iconGraphics.strokePath();
        this.iconGraphics.beginPath();
        this.iconGraphics.arc(this.x, this.y + 4, 6, 0, Math.PI * 1.5, false);
        this.iconGraphics.strokePath();
        break;

      case 'thunderstorm':
        // Lightning bolt shape
        this.iconGraphics.fillStyle(0xffff44, alpha);
        this.iconGraphics.beginPath();
        this.iconGraphics.moveTo(this.x - 2, this.y - 16);
        this.iconGraphics.lineTo(this.x + 8, this.y - 16);
        this.iconGraphics.lineTo(this.x + 2, this.y - 2);
        this.iconGraphics.lineTo(this.x + 10, this.y - 2);
        this.iconGraphics.lineTo(this.x - 4, this.y + 16);
        this.iconGraphics.lineTo(this.x, this.y + 2);
        this.iconGraphics.lineTo(this.x - 8, this.y + 2);
        this.iconGraphics.closePath();
        this.iconGraphics.fillPath();
        break;

      default:
        // Generic: small circle
        this.iconGraphics.fillCircle(this.x, this.y, 10);
    }
  }

  // ------------------------------------------------------------------ INPUT

  private onPointerDown(): void {
    if (this.currentState === 'READY' && this.currentMpEnough) {
      this.isPressed = true;
      this.redraw();
      EventBus.emit('skill-button-pressed', this.slotIndex);
    } else if (this.currentState !== 'EMPTY') {
      // Disabled tap — shake feedback
      this.playShakeAnimation();
    }
  }

  private onPointerUp(): void {
    if (this.isPressed) {
      this.isPressed = false;
      this.redraw();
    }
  }

  private playShakeAnimation(): void {
    // Use a proxy object to drive x offset, apply to all layers each update
    const shakeObj = { offset: 0 };
    const origX = this.x;

    this.scene.tweens.add({
      targets: shakeObj,
      offset: 2,
      duration: 25,
      yoyo: true,
      repeat: 5, // 3 full cycles = repeat 5 (yoyo counts as half)
      ease: 'Sine.InOut',
      onUpdate: () => {
        const nx = origX + shakeObj.offset;
        this.bgGraphics.setPosition(nx - origX, 0);
        this.iconGraphics.setPosition(nx - origX, 0);
        this.overlayGraphics.setPosition(nx - origX, 0);
        this.plusText.setX(nx);
        this.mpText.setX(nx);
      },
      onComplete: () => {
        this.bgGraphics.setPosition(0, 0);
        this.iconGraphics.setPosition(0, 0);
        this.overlayGraphics.setPosition(0, 0);
        this.plusText.setX(origX);
        this.mpText.setX(origX);
      },
    });
  }

  destroy(): void {
    this.bgGraphics.destroy();
    this.iconGraphics.destroy();
    this.overlayGraphics.destroy();
    this.plusText.destroy();
    this.mpText.destroy();
    this.hitZone.destroy();
  }
}
