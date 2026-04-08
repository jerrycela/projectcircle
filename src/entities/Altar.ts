import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import type { Player } from './Player';
import EventBus from '../systems/EventBus';

type AltarState = 'IDLE' | 'IN_RANGE' | 'ARMING' | 'OPEN' | 'COOLDOWN';

export class Altar extends Phaser.GameObjects.Image {
  private altarState: AltarState = 'IDLE';
  private armTimer: number = 0;
  private promptText: Phaser.GameObjects.Text;
  private playerRef: Player;
  public skillOffered: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, player: Player) {
    super(scene, x, y, 'altar');
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
    this.setDepth(5);
    this.playerRef = player;

    this.promptText = scene.add.text(x, y - 40, 'Upgrade', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: '"Pirata One", monospace',
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.promptText.setOrigin(0.5, 0.5);
    this.promptText.setDepth(6);
    this.promptText.setVisible(false);
  }

  update(_time: number, delta: number): void {
    const dx = this.playerRef.x - this.x;
    const dy = this.playerRef.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inRange = dist < GAME_CONFIG.ALTAR_ACTIVATE_RANGE;

    const body = this.playerRef.body as Phaser.Physics.Arcade.Body;
    const velMag = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
    const stopped = velMag < 5;

    switch (this.altarState) {
      case 'IDLE':
        if (inRange) {
          this.altarState = 'IN_RANGE';
          this.promptText.setVisible(true);
          this.promptText.setAlpha(1);
        }
        break;

      case 'IN_RANGE':
        if (!inRange) {
          this.altarState = 'IDLE';
          this.promptText.setVisible(false);
        } else if (stopped) {
          this.altarState = 'ARMING';
          this.armTimer = 0;
        }
        break;

      case 'ARMING':
        if (!inRange || !stopped) {
          this.altarState = 'IN_RANGE';
          this.armTimer = 0;
          this.promptText.setAlpha(1);
        } else {
          this.armTimer += delta;
          this.promptText.setAlpha(0.5 + 0.5 * Math.sin(this.armTimer * 0.01));
          if (this.armTimer >= GAME_CONFIG.ALTAR_ARM_DELAY) {
            this.altarState = 'OPEN';
            this.promptText.setVisible(false);
            EventBus.emit('altar-activated', this);
          }
        }
        break;

      case 'OPEN':
        // Waiting for panel to close — do nothing
        break;

      case 'COOLDOWN':
        // Wait for player to leave range before allowing re-trigger
        if (!inRange) {
          this.altarState = 'IDLE';
        }
        break;
    }
  }

  endSession(): void {
    this.altarState = 'COOLDOWN';
    this.promptText.setVisible(false);
  }
}
