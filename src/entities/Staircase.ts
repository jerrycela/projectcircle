import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import type { Player } from './Player';
import type { GameScene } from '../scenes/GameScene';

type StaircaseState = 'HIDDEN' | 'REVEALED' | 'ACTIVATED';

export class Staircase extends Phaser.GameObjects.Image {
  private staircaseState: StaircaseState = 'HIDDEN';
  private playerRef: Player;

  constructor(scene: Phaser.Scene, x: number, y: number, player: Player) {
    super(scene, x, y, 'staircase');
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
    this.setDepth(10);
    this.playerRef = player;
    this.setVisible(false);
  }

  reveal(): void {
    if (this.staircaseState !== 'HIDDEN') return;
    this.staircaseState = 'REVEALED';
    this.setVisible(true);

    // Glow pulse tween
    this.scene.tweens.add({
      targets: this,
      alpha: { from: 0.6, to: 1.0 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    console.log('[Staircase] Revealed');
  }

  update(): void {
    if (this.staircaseState !== 'REVEALED') return;
    if ((this.scene as GameScene).gameplayLocked) return;

    const dx = this.playerRef.x - this.x;
    const dy = this.playerRef.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < GAME_CONFIG.ALTAR_ACTIVATE_RANGE) {
      // Player must be stopped
      const body = this.playerRef.body as Phaser.Physics.Arcade.Body;
      const velMag = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
      if (velMag < 5) {
        this.staircaseState = 'ACTIVATED';
        console.log('[Staircase] Activated — triggering floor transition');
        (this.scene as GameScene).triggerFloorTransition();
      }
    }
  }

  getState(): StaircaseState {
    return this.staircaseState;
  }
}
