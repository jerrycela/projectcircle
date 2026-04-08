// src/ui/HUD.ts — Gothic HUD with globe HP/MP and repositioned elements
import Phaser from 'phaser';
import { SKILL_DEFS, GAME_CONFIG } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { SkillButton } from './SkillButton';
import { Globe } from './Globe';
import { GOTHIC_COLORS, GOTHIC_FONTS } from './GothicTheme';
import EventBus from '../systems/EventBus';

export class HUD {
  private scene: Phaser.Scene;

  // Globes (P1 修正: 合併為參數化 class, 半徑 35)
  private healthGlobe: Globe;
  private manaGlobe: Globe;

  // Top info
  private floorText: Phaser.GameObjects.Text;
  private goldText: Phaser.GameObjects.Text;
  private materialsText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private mpText: Phaser.GameObjects.Text;

  // Buttons
  private equipBtn: Phaser.GameObjects.Text;
  private companionBtn: Phaser.GameObjects.Text;

  // Skill buttons
  private skillButton0: SkillButton;
  private skillButton1: SkillButton;
  private skillButton2: SkillButton;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const camW = scene.cameras.main.width;

    // HUD background: clean dark panel (replaces broken hud-bg.png transparency)
    const hudBg = scene.add.graphics();
    hudBg.setDepth(19);
    // Gradient-like effect: darker at bottom, slightly lighter at top
    hudBg.fillStyle(0x111111, 0.88);
    hudBg.fillRect(0, 600, 450, 200);
    // Top border line
    hudBg.lineStyle(2, 0x2a2520);
    hudBg.beginPath();
    hudBg.moveTo(0, 600);
    hudBg.lineTo(450, 600);
    hudBg.strokePath();

    // --- Bottom globes (P1 修正: y=665, r=35) ---
    this.healthGlobe = new Globe(
      scene, 50, 665,
      GOTHIC_COLORS.GLOBE_HP_FILL, GOTHIC_COLORS.GLOBE_HP_EMPTY,
    );
    this.manaGlobe = new Globe(
      scene, camW - 50, 665,
      GOTHIC_COLORS.GLOBE_MP_FILL, GOTHIC_COLORS.GLOBE_MP_EMPTY,
    );

    // --- Top info (gothic text) ---
    this.floorText = scene.add.text(10, 6, 'B1F', GOTHIC_FONTS.BODY);
    this.floorText.setDepth(11);

    // HP/MP numeric text above globes
    this.hpText = scene.add.text(50, 630, '', { ...GOTHIC_FONTS.BODY, fontSize: '11px' });
    this.hpText.setOrigin(0.5, 0.5);
    this.hpText.setDepth(22);

    this.mpText = scene.add.text(camW - 50, 630, '', { ...GOTHIC_FONTS.BODY, fontSize: '11px' });
    this.mpText.setOrigin(0.5, 0.5);
    this.mpText.setDepth(22);

    // Gold
    this.goldText = scene.add.text(camW - 10, 6, 'Gold: 0', GOTHIC_FONTS.GOLD);
    this.goldText.setOrigin(1, 0);
    this.goldText.setDepth(11);

    // Materials
    this.materialsText = scene.add.text(camW - 10, 24, 'W:0 O:0 C:0', { ...GOTHIC_FONTS.BODY, fontSize: '12px' });
    this.materialsText.setOrigin(1, 0);
    this.materialsText.setDepth(11);

    // --- Skill buttons: horizontal row (P1 修正: y=590) ---
    const skillY = 590;
    const leftEdge = 90;      // right of HP globe area
    const rightEdge = camW - 90; // left of MP globe area
    const totalSpan = rightEdge - leftEdge;
    const spacing = totalSpan / (GAME_CONFIG.SKILL_SLOT_COUNT + 1);

    this.skillButton0 = new SkillButton(scene, leftEdge + spacing, skillY, 0);
    this.skillButton1 = new SkillButton(scene, leftEdge + spacing * 2, skillY, 1);
    this.skillButton2 = new SkillButton(scene, leftEdge + spacing * 3, skillY, 2);

    // --- Equipment and Companion buttons (gothic styled) ---
    this.equipBtn = scene.add.text(camW - 10, 44, '[Equip]', { ...GOTHIC_FONTS.BODY, fontSize: '13px' });
    this.equipBtn.setOrigin(1, 0);
    this.equipBtn.setDepth(11);
    this.equipBtn.setInteractive({ useHandCursor: true });
    this.equipBtn.on('pointerup', () => EventBus.emit('show-equipment-panel'));

    this.companionBtn = scene.add.text(camW - 10, 62, '[Companions]', { ...GOTHIC_FONTS.BODY, fontSize: '13px' });
    this.companionBtn.setOrigin(1, 0);
    this.companionBtn.setDepth(11);
    this.companionBtn.setInteractive({ useHandCursor: true });
    this.companionBtn.on('pointerup', () => EventBus.emit('show-companion-panel'));
  }

  // P2 修正: update(time, delta) signature
  update(time: number, delta: number): void {
    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    if (!gameScene || !gameScene.player) return;

    const p = gameScene.player;
    const floor = gameScene.floorManager?.currentFloor ?? 1;

    this.floorText.setText(`Floor ${floor}`);
    this.goldText.setText(`Gold: ${p.gold}`);
    const m = p.materials;
    this.materialsText.setText(`W:${m.wood} O:${m.ore} C:${m.cloth}`);

    // Update globes
    this.healthGlobe.update(p.hp, p.maxHp, delta);
    this.manaGlobe.update(p.mp, p.maxMp, delta);

    // Numeric labels
    this.hpText.setText(`${p.hp}/${p.maxHp}`);
    this.mpText.setText(`${Math.floor(p.mp)}/${p.maxMp}`);

    // Skill buttons
    if (gameScene.skillManager) {
      const sm = gameScene.skillManager;
      const buttons = [this.skillButton0, this.skillButton1, this.skillButton2];
      for (let i = 0; i < GAME_CONFIG.SKILL_SLOT_COUNT; i++) {
        const type = sm.getSlotType(i);
        const state = sm.getSlotState(i);
        const cooldownRatio = sm.getSlotCooldownRatio(i);
        const mpEnough = type
          ? (SKILL_DEFS[type] ? p.mp >= SKILL_DEFS[type].mpCost : true)
          : true;
        buttons[i].update(type, state, cooldownRatio, mpEnough);
      }
    }
  }

  destroy(): void {
    this.healthGlobe.destroy();
    this.manaGlobe.destroy();
    this.skillButton0.destroy();
    this.skillButton1.destroy();
    this.skillButton2.destroy();
  }
}
