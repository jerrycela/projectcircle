import Phaser from 'phaser';
import { Joystick } from '../ui/Joystick';
import { HUD } from '../ui/HUD';
import { UpgradePanel } from '../ui/UpgradePanel';
import { EquipmentComparePanel } from '../ui/EquipmentComparePanel';
import { EquipmentPanel } from '../ui/EquipmentPanel';
import { CompanionPanel } from '../ui/CompanionPanel';
import { InitialSkillPanel } from '../ui/InitialSkillPanel';
import { COMPANION_DEFS } from '../config';
import type { GameScene } from './GameScene';
import type { Altar } from '../entities/Altar';
import EventBus from '../systems/EventBus';

export class UIScene extends Phaser.Scene {
  private joystick!: Joystick;
  private hud!: HUD;
  private upgradePanel!: UpgradePanel;
  private equipmentComparePanel!: EquipmentComparePanel;
  private equipmentPanel!: EquipmentPanel;
  private companionPanel!: CompanionPanel;
  private initialSkillPanel!: InitialSkillPanel;
  private rescueBtn?: Phaser.GameObjects.Text;
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
    this.companionPanel = new CompanionPanel(this);
    this.initialSkillPanel = new InitialSkillPanel(this);

    // Rescue button (hidden by default)
    EventBus.on('show-rescue-button', () => {
      if (this.rescueBtn) return;
      const cx = this.cameras.main.width - 80;
      const cy = this.cameras.main.height - 60;
      this.rescueBtn = this.add.text(cx, cy, '[RESCUE]', {
        fontSize: '20px',
        color: '#ffcc00',
        fontFamily: 'monospace',
        backgroundColor: '#333333',
        padding: { x: 12, y: 8 },
      });
      this.rescueBtn.setOrigin(0.5, 0.5);
      this.rescueBtn.setDepth(200);
      this.rescueBtn.setInteractive({ useHandCursor: true });
      this.rescueBtn.on('pointerup', () => {
        EventBus.emit('rescue-triggered');
      });
    });

    EventBus.on('hide-rescue-button', () => {
      if (this.rescueBtn) {
        this.rescueBtn.destroy();
        this.rescueBtn = undefined;
      }
    });

    // Token collection notification
    EventBus.on('companion-token-collected', (data: { companionId: string; amount: number }) => {
      const def = COMPANION_DEFS.find(d => d.id === data.companionId);
      if (!def) return;
      const notifCx = this.cameras.main.width / 2;
      const notif = this.add.text(notifCx, 100, `${def.tokenName} +${data.amount}`, {
        fontSize: '14px',
        color: `#${def.themeColor.toString(16).padStart(6, '0')}`,
        fontFamily: 'monospace',
      });
      notif.setOrigin(0.5, 0.5);
      notif.setDepth(100);
      this.tweens.add({
        targets: notif,
        y: notif.y - 30,
        alpha: 0,
        duration: 1500,
        onComplete: () => notif.destroy(),
      });
    });

    EventBus.on('show-initial-skill-pick', () => {
      const gameScene = this.scene.get('GameScene') as GameScene;
      if (gameScene?.skillManager) {
        this.initialSkillPanel.show(gameScene.skillManager);
      }
    });

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

    EventBus.on('game-scene-shutdown', () => {
      this.upgradePanel.destroy();
      this.companionPanel.destroy();
      this.initialSkillPanel.destroy();
      this.destroyDeathText();
      if (this.rescueBtn) { this.rescueBtn.destroy(); this.rescueBtn = undefined; }
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
