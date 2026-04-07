import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';

const TORCH_SIZE = GAME_CONFIG.TILE_SIZE; // 64px (1x1 tile)

export class Torch extends Phaser.GameObjects.Rectangle {
  private fireParticleTimer: number = 0;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const worldX = tileX * GAME_CONFIG.TILE_SIZE + TORCH_SIZE / 2;
    const worldY = tileY * GAME_CONFIG.TILE_SIZE + TORCH_SIZE / 2;
    super(scene, worldX, worldY, TORCH_SIZE, TORCH_SIZE, 0xcc6600, 1.0);
    this.setOrigin(0.5, 0.5);
    this.setDepth(2);
    scene.add.existing(this);
  }

  updateParticles(delta: number): void {
    this.fireParticleTimer -= delta;
    if (this.fireParticleTimer <= 0) {
      this.fireParticleTimer = 200 + Math.random() * 200;
      this.spawnFireParticle();
    }
  }

  private spawnFireParticle(): void {
    const particle = this.scene.add.graphics();
    const startColor = Math.random() > 0.5 ? 0xff6600 : 0xff3300;
    particle.fillStyle(startColor, 0.8);
    particle.fillCircle(0, 0, Phaser.Math.Between(2, 4));
    particle.setPosition(
      this.x + Phaser.Math.Between(-8, 8),
      this.y,
    );
    particle.setDepth(3);

    this.scene.tweens.add({
      targets: particle,
      y: this.y - Phaser.Math.Between(20, 40),
      alpha: 0,
      duration: 400,
      ease: 'Cubic.Out',
      onComplete: () => particle.destroy(),
    });
  }
}
