import Phaser from 'phaser';
import { Joystick } from '../ui/Joystick';
import { HUD } from '../ui/HUD';
import { UpgradePanel } from '../ui/UpgradePanel';
import type { GameScene } from './GameScene';
import EventBus from '../systems/EventBus';

export class UIScene extends Phaser.Scene {
  private joystick!: Joystick;
  private hud!: HUD;
  private upgradePanel!: UpgradePanel;
  private deathOverlay?: Phaser.GameObjects.Container;

  constructor() {
    super('UIScene');
  }

  create(): void {
    console.log('UIScene started');
    this.joystick = new Joystick(this);
    this.hud = new HUD(this);
    this.upgradePanel = new UpgradePanel(this);

    EventBus.on('altar-activated', () => {
      const gameScene = this.scene.get('GameScene') as GameScene;
      if (gameScene?.statsManager && gameScene?.player) {
        this.upgradePanel.show(gameScene.statsManager, gameScene.player);
      }
    });

    EventBus.on('show-death-screen', () => {
      this.showDeathScreen();
    });
  }

  update(): void {
    this.hud.update();
  }

  private showDeathScreen(): void {
    if (this.deathOverlay) return; // Already shown

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const cx = width / 2;
    const cy = height / 2;

    this.deathOverlay = this.add.container(0, 0);
    this.deathOverlay.setDepth(200);

    // Semi-transparent black background
    const bg = this.add.rectangle(cx, cy, width, height, 0x000000, 0.7);
    this.deathOverlay.add(bg);

    // "You died" text
    const titleText = this.add.text(cx, cy - 60, 'You Died', {
      fontSize: '48px',
      color: '#cc0000',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 4,
    });
    titleText.setOrigin(0.5, 0.5);
    this.deathOverlay.add(titleText);

    // Restart button background
    const btnBg = this.add.rectangle(cx, cy + 40, 180, 50, 0x333333, 1.0);
    btnBg.setStrokeStyle(2, 0xffffff);
    btnBg.setInteractive({ useHandCursor: true });
    this.deathOverlay.add(btnBg);

    // Restart button text
    const btnText = this.add.text(cx, cy + 40, 'Restart', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    btnText.setOrigin(0.5, 0.5);
    this.deathOverlay.add(btnText);

    // Hover effect
    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0x555555);
    });
    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(0x333333);
    });

    // Restart on click
    btnBg.on('pointerdown', () => {
      this.restartGame();
    });
  }

  private restartGame(): void {
    // Clean up EventBus listeners to avoid duplicates on restart
    EventBus.off('altar-activated');
    EventBus.off('altar-consumed');
    EventBus.off('gameplay-lock');
    EventBus.off('show-death-screen');

    // Stop both scenes and restart from Boot
    this.scene.stop('UIScene');
    this.scene.stop('GameScene');
    this.scene.start('BootScene');
  }
}
