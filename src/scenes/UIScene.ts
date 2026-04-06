import Phaser from 'phaser';
import { Joystick } from '../ui/Joystick';
import { HUD } from '../ui/HUD';
import { UpgradePanel } from '../ui/UpgradePanel';
import { EquipmentComparePanel } from '../ui/EquipmentComparePanel';
import { EquipmentPanel } from '../ui/EquipmentPanel';
import type { GameScene } from './GameScene';
import type { Altar } from '../entities/Altar';
import EventBus from '../systems/EventBus';

export class UIScene extends Phaser.Scene {
  private joystick!: Joystick;
  private hud!: HUD;
  private upgradePanel!: UpgradePanel;
  private equipmentComparePanel!: EquipmentComparePanel;
  private equipmentPanel!: EquipmentPanel;
  private deathText?: Phaser.GameObjects.Text;

  constructor() {
    super('UIScene');
  }

  create(): void {
    console.log('UIScene started');
    this.joystick = new Joystick(this);
    this.hud = new HUD(this);
    this.upgradePanel = new UpgradePanel(this);
    this.equipmentComparePanel = new EquipmentComparePanel(this);
    this.equipmentPanel = new EquipmentPanel(this);

    EventBus.on('altar-activated', (altar: Altar) => {
      const gameScene = this.scene.get('GameScene') as GameScene;
      if (gameScene?.statsManager && gameScene?.player && gameScene?.skillManager) {
        this.upgradePanel.show(gameScene.statsManager, gameScene.player, gameScene.skillManager, altar);
      }
    });

    // Forward skill button taps to GameScene
    EventBus.on('skill-button-pressed', (slotIndex: number) => {
      EventBus.emit('skill-cast-request', slotIndex);
    });

    EventBus.on('show-death-text', (floor: number) => {
      this.showDeathText(floor);
    });

    EventBus.on('scene-ready', () => {
      this.destroyDeathText();
    });
  }

  update(): void {
    this.hud.update();
  }

  private showDeathText(floor: number): void {
    if (this.deathText) return;

    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;

    this.deathText = this.add.text(cx, cy, `You Died - Floor ${floor}`, {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 4,
    });
    this.deathText.setOrigin(0.5, 0.5);
    this.deathText.setDepth(200);
  }

  private destroyDeathText(): void {
    if (this.deathText) {
      this.deathText.destroy();
      this.deathText = undefined;
    }
  }
}
