import Phaser from 'phaser';
import type { Torch } from '../entities/Torch';

const PLAYER_LIGHT_RADIUS = 180; // tighter, more oppressive
const TORCH_LIGHT_RADIUS = 128;
const FOG_ALPHA = 0.85;           // almost black outside light
const FLICKER_SPEED = 0.005;

export class FogOfWar {
  private rt: Phaser.GameObjects.RenderTexture;
  private playerBrush: Phaser.GameObjects.Graphics;
  private torchBrush: Phaser.GameObjects.Graphics;
  private warmOverlay: Phaser.GameObjects.Graphics;
  private groundSpot: Phaser.GameObjects.Graphics;
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
    // 16-step smooth gradient: low alpha per step, cumulative erase
    const PLAYER_STEPS = 16;
    for (let i = 0; i < PLAYER_STEPS; i++) {
      const t = i / (PLAYER_STEPS - 1);
      const stepRadius = r * (1 - t * 0.9);  // r → r*0.1
      const stepAlpha = 0.03 + t * 0.10;     // 0.03 → 0.13
      this.playerBrush.fillStyle(0xffffff, stepAlpha);
      this.playerBrush.fillCircle(r, r, stepRadius);
    }

    // Pre-build torch light brush (12-step)
    const tr = TORCH_LIGHT_RADIUS;
    this.torchBrush = scene.make.graphics({ x: 0, y: 0 });
    const TORCH_STEPS = 12;
    for (let i = 0; i < TORCH_STEPS; i++) {
      const t = i / (TORCH_STEPS - 1);
      const stepRadius = tr * (1 - t * 0.9);
      const stepAlpha = 0.03 + t * 0.12;
      this.torchBrush.fillStyle(0xffffff, stepAlpha);
      this.torchBrush.fillCircle(tr, tr, stepRadius);
    }

    // Warm tint overlay — orange glow at player center
    this.warmOverlay = scene.add.graphics();
    this.warmOverlay.setDepth(91);
    this.warmOverlay.setBlendMode(Phaser.BlendModes.ADD);

    // Ground light spot — small orange circle at player feet
    this.groundSpot = scene.add.graphics();
    this.groundSpot.setDepth(5);
    this.groundSpot.fillStyle(0xff8800, 0.1);
    this.groundSpot.fillCircle(0, 0, 40);
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

    // Warm tint centered on player (enhanced radius + alpha)
    this.warmOverlay.clear();
    this.warmOverlay.fillStyle(0xff8800, 0.12);
    this.warmOverlay.fillCircle(playerX, playerY, PLAYER_LIGHT_RADIUS * 0.65);

    // Torch warm orange glow
    for (const torch of torches) {
      this.warmOverlay.fillStyle(0xff6622, 0.06);
      this.warmOverlay.fillCircle(torch.x, torch.y, TORCH_LIGHT_RADIUS * 0.4);
    }

    // Ground spot follows player
    this.groundSpot.setPosition(playerX, playerY);
  }

  destroy(): void {
    this.rt.destroy();
    this.playerBrush.destroy();
    this.torchBrush.destroy();
    this.warmOverlay.destroy();
    this.groundSpot.destroy();
  }
}
