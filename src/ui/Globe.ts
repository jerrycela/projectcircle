// src/ui/Globe.ts — Parameterized globe for HP/MP (P3 修正: merged into single class)
import Phaser from 'phaser';
import { GOTHIC_COLORS, drawStoneCircle } from './GothicTheme';

const GLOBE_RADIUS = 35; // P1 修正: 從 40 改為 35

export class Globe {
  private scene: Phaser.Scene;
  private x: number;
  private y: number;
  private fillColor: number;
  private emptyColor: number;
  private graphics: Phaser.GameObjects.Graphics;
  private liquidGraphics: Phaser.GameObjects.Graphics;
  private frameGraphics: Phaser.GameObjects.Graphics;
  private mask: Phaser.Display.Masks.GeometryMask;
  private maskGraphics: Phaser.GameObjects.Graphics;
  private elapsed: number = 0;
  private ratio: number = 1;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    fillColor: number, emptyColor: number,
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.fillColor = fillColor;
    this.emptyColor = emptyColor;

    // Empty background
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(20);

    // Liquid fill (masked by GeometryMask) — P1 修正: 用 GeometryMask 取代 overdraw
    this.liquidGraphics = scene.add.graphics();
    this.liquidGraphics.setDepth(20);

    // Mask shape: circle clipped by liquid level
    this.maskGraphics = scene.add.graphics();
    this.maskGraphics.setVisible(false);
    this.mask = new Phaser.Display.Masks.GeometryMask(scene, this.maskGraphics);
    this.liquidGraphics.setMask(this.mask);

    // Stone frame on top
    this.frameGraphics = scene.add.graphics();
    this.frameGraphics.setDepth(21);
    drawStoneCircle(this.frameGraphics, x, y, GLOBE_RADIUS);
  }

  update(current: number, max: number, delta: number): void {
    this.ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    this.elapsed += delta;

    const r = GLOBE_RADIUS - 3;

    // Empty background circle
    this.graphics.clear();
    this.graphics.fillStyle(this.emptyColor);
    this.graphics.fillCircle(this.x, this.y, r);

    // Liquid: draw full circle, mask controls visible portion
    this.liquidGraphics.clear();
    this.liquidGraphics.fillStyle(this.fillColor);
    this.liquidGraphics.fillCircle(this.x, this.y, r);

    // Specular highlight
    this.liquidGraphics.fillStyle(0xffffff, 0.08);
    this.liquidGraphics.fillCircle(this.x - 8, this.y - 10, 10);

    // Update mask shape: rect from liquid surface to bottom of globe
    this.maskGraphics.clear();
    if (this.ratio <= 0) return;

    const fillHeight = (r * 2) * this.ratio;
    const waveAmp = 2;
    const surfaceY = this.y + r - fillHeight
      + Math.sin(this.elapsed / 1000 * Math.PI) * waveAmp;

    // Draw mask as a shape: wave surface + rect to bottom
    this.maskGraphics.fillStyle(0xffffff);
    this.maskGraphics.beginPath();

    // Wave across surface
    const steps = 16;
    const left = this.x - r;
    const right = this.x + r;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = left + t * (right - left);
      const py = surfaceY + Math.sin((t * Math.PI * 2) + this.elapsed / 500) * waveAmp;
      if (i === 0) {
        this.maskGraphics.moveTo(px, py);
      } else {
        this.maskGraphics.lineTo(px, py);
      }
    }
    // Close to bottom-right, bottom-left, back to start
    this.maskGraphics.lineTo(right, this.y + r + 5);
    this.maskGraphics.lineTo(left, this.y + r + 5);
    this.maskGraphics.closePath();
    this.maskGraphics.fillPath();
  }

  destroy(): void {
    this.liquidGraphics.clearMask();
    this.graphics.destroy();
    this.liquidGraphics.destroy();
    this.maskGraphics.destroy();
    this.frameGraphics.destroy();
  }
}
