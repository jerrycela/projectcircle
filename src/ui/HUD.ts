import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';

const HP_BAR_W = 200;
const HP_BAR_H = 20;
const HP_BAR_X = 10;
const HP_BAR_Y = 26; // below floor label

const MP_BAR_W = 160;
const MP_BAR_H = 16;
const MP_BAR_X = 10;
const MP_BAR_Y = HP_BAR_Y + HP_BAR_H + 6;

const BORDER = 2;
const GOLD_PADDING = 10;
const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '13px',
  color: '#ffffff',
  fontFamily: 'monospace',
};

export class HUD {
  private scene: Phaser.Scene;
  private barGraphics: Phaser.GameObjects.Graphics;

  // HP
  private hpFillW: number = HP_BAR_W;
  private hpText: Phaser.GameObjects.Text;

  // MP
  private mpFillW: number = MP_BAR_W;
  private mpText: Phaser.GameObjects.Text;

  // Gold / materials
  private goldText: Phaser.GameObjects.Text;
  private materialsText: Phaser.GameObjects.Text;

  // Floor label
  private floorText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Single graphics object for all bars
    this.barGraphics = scene.add.graphics();
    this.barGraphics.setDepth(10);

    // Floor label — top-left, above HP bar
    this.floorText = scene.add.text(HP_BAR_X, 6, 'B1F', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    this.floorText.setDepth(11);

    // HP value text — right of HP bar
    this.hpText = scene.add.text(
      HP_BAR_X + HP_BAR_W + 6,
      HP_BAR_Y,
      'HP: ---/---',
      TEXT_STYLE,
    );
    this.hpText.setDepth(11);

    // MP value text — right of MP bar
    this.mpText = scene.add.text(
      MP_BAR_X + MP_BAR_W + 6,
      MP_BAR_Y,
      'MP: ---/---',
      TEXT_STYLE,
    );
    this.mpText.setDepth(11);

    // Gold — top-right
    const camW = scene.cameras.main.width;
    this.goldText = scene.add.text(
      camW - GOLD_PADDING,
      6,
      'Gold: 0',
      { ...TEXT_STYLE, color: '#ffcc00' },
    );
    this.goldText.setOrigin(1, 0);
    this.goldText.setDepth(11);

    // Materials — below gold
    this.materialsText = scene.add.text(
      camW - GOLD_PADDING,
      24,
      'W:0 O:0 C:0',
      { ...TEXT_STYLE, fontSize: '12px' },
    );
    this.materialsText.setOrigin(1, 0);
    this.materialsText.setDepth(11);
  }

  /** Call every frame from UIScene.update() */
  update(): void {
    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    if (!gameScene || !gameScene.player) return;

    const p = gameScene.player;

    // Compute fill widths
    this.hpFillW = Math.max(0, (p.hp / p.maxHp) * HP_BAR_W);
    this.mpFillW = Math.max(0, (p.mp / p.maxMp) * MP_BAR_W);

    // Update text labels
    this.hpText.setText(`HP: ${p.hp}/${p.maxHp}`);
    this.mpText.setText(`MP: ${Math.floor(p.mp)}/${p.maxMp}`);
    this.goldText.setText(`Gold: ${p.gold}`);
    const m = p.materials;
    this.materialsText.setText(`W:${m.wood} O:${m.ore} C:${m.cloth}`);

    this.drawBars();
  }

  private drawBars(): void {
    const g = this.barGraphics;
    g.clear();

    // --- HP bar ---
    // Background (slightly taller for border effect)
    g.fillStyle(0x333333);
    g.fillRect(
      HP_BAR_X - BORDER,
      HP_BAR_Y - BORDER,
      HP_BAR_W + BORDER * 2,
      HP_BAR_H + BORDER * 2,
    );
    // Fill
    if (this.hpFillW > 0) {
      g.fillStyle(0x00ff00);
      g.fillRect(HP_BAR_X, HP_BAR_Y, this.hpFillW, HP_BAR_H);
    }

    // --- MP bar ---
    g.fillStyle(0x333333);
    g.fillRect(
      MP_BAR_X - BORDER,
      MP_BAR_Y - BORDER,
      MP_BAR_W + BORDER * 2,
      MP_BAR_H + BORDER * 2,
    );
    if (this.mpFillW > 0) {
      g.fillStyle(0x0066ff);
      g.fillRect(MP_BAR_X, MP_BAR_Y, this.mpFillW, MP_BAR_H);
    }
  }
}
