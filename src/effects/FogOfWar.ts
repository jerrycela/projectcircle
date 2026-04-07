import Phaser from 'phaser';
import type { Torch } from '../entities/Torch';

const PLAYER_LIGHT_RADIUS = 224; // ~3.5 tiles
const TORCH_LIGHT_RADIUS = 128;  // ~2 tiles
const FOG_ALPHA = 0.85;
const FLICKER_SPEED = 0.005; // radians per ms

export class FogOfWar {
  private rt: Phaser.GameObjects.RenderTexture;
  private playerBrush: Phaser.GameObjects.Graphics;
  private torchBrush: Phaser.GameObjects.Graphics;
  private flickerTime: number = 0;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.rt = scene.add.renderTexture(0, 0, mapWidth, mapHeight);
    this.rt.setOrigin(0, 0);
    this.rt.setDepth(90);
    this.rt.fill(0x000000, FOG_ALPHA);

    // Pre-build player stepped light brush
    // Drawn at (r, r) so center aligns when positioned at (playerX - r, playerY - r)
    const r = PLAYER_LIGHT_RADIUS;
    this.playerBrush = scene.make.graphics({ x: 0, y: 0 });
    // Outer step: erase 0.30 → remaining 0.55
    this.playerBrush.fillStyle(0xffffff, 0.30);
    this.playerBrush.fillCircle(r, r, r);
    // Mid step: erase +0.30 → remaining 0.25
    this.playerBrush.fillStyle(0xffffff, 0.30);
    this.playerBrush.fillCircle(r, r, r * 0.6);
    // Inner step: erase +0.25 → remaining ~0
    this.playerBrush.fillStyle(0xffffff, 0.25);
    this.playerBrush.fillCircle(r, r, r * 0.3);

    // Pre-build torch light brush (smaller, same stepped approach)
    const tr = TORCH_LIGHT_RADIUS;
    this.torchBrush = scene.make.graphics({ x: 0, y: 0 });
    this.torchBrush.fillStyle(0xffffff, 0.25);
    this.torchBrush.fillCircle(tr, tr, tr);
    this.torchBrush.fillStyle(0xffffff, 0.30);
    this.torchBrush.fillCircle(tr, tr, tr * 0.6);
    this.torchBrush.fillStyle(0xffffff, 0.30);
    this.torchBrush.fillCircle(tr, tr, tr * 0.3);
  }

  update(playerX: number, playerY: number, torches: Torch[], delta: number): void {
    this.rt.fill(0x000000, FOG_ALPHA);

    // Player light
    this.rt.erase(
      this.playerBrush,
      playerX - PLAYER_LIGHT_RADIUS,
      playerY - PLAYER_LIGHT_RADIUS,
    );

    // Torch lights with per-torch flicker
    this.flickerTime += delta * FLICKER_SPEED;

    for (let i = 0; i < torches.length; i++) {
      const torch = torches[i];
      const phase = this.flickerTime + i * 2.3;

      // Radius jitter +-5px via scale
      const radiusJitter = Math.sin(phase) * 5;
      const scale = (TORCH_LIGHT_RADIUS + radiusJitter) / TORCH_LIGHT_RADIUS;

      // Alpha jitter 0.85 ~ 1.0
      const alphaJitter = 0.925 + Math.sin(phase * 1.3) * 0.075;

      // Position jitter +-2px
      const jitterX = Math.sin(phase * 0.7) * 2;
      const jitterY = Math.cos(phase * 1.1) * 2;

      this.torchBrush.setScale(scale);
      this.torchBrush.setAlpha(alphaJitter);

      const offset = TORCH_LIGHT_RADIUS * scale;
      this.rt.erase(
        this.torchBrush,
        torch.x - offset + jitterX,
        torch.y - offset + jitterY,
      );
    }

    // Reset brush state
    this.torchBrush.setScale(1);
    this.torchBrush.setAlpha(1);
  }

  destroy(): void {
    this.rt.destroy();
    this.playerBrush.destroy();
    this.torchBrush.destroy();
  }
}
