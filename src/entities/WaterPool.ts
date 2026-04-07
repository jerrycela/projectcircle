import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';

const POOL_SIZE = GAME_CONFIG.TILE_SIZE * 2; // 128px (2x2 tiles)

export class WaterPool extends Phaser.GameObjects.Rectangle {
  constructor(scene: Phaser.Scene, tileX: number, tileY: number) {
    const worldX = tileX * GAME_CONFIG.TILE_SIZE;
    const worldY = tileY * GAME_CONFIG.TILE_SIZE;
    super(scene, worldX + POOL_SIZE / 2, worldY + POOL_SIZE / 2, POOL_SIZE, POOL_SIZE, 0x1a3a5c, 0.6);
    this.setOrigin(0.5, 0.5);
    this.setDepth(1);
    scene.add.existing(this);
  }
}
