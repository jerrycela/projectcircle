// src/ui/DPad.ts — Stone d-pad with scene-level pointer events (P1 修正)
import Phaser from 'phaser';
import { GOTHIC_COLORS } from './GothicTheme';
import EventBus from '../systems/EventBus';

const KEY_SIZE = 32;     // P1 修正: 從 36 改為 32
const CENTER_SIZE = 18;
const KEY_GAP = 2;

type Direction = 'up' | 'down' | 'left' | 'right';

interface KeyRect {
  dir: Direction;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class DPad {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private cx: number;
  private cy: number;
  private locked: boolean = false;
  private keys: KeyRect[];

  // Per-pointer tracking for multi-touch drag support
  private pointerDirs: Map<number, Direction | null> = new Map();
  private pressed: Set<Direction> = new Set();

  public get dirX(): number {
    const l = this.pressed.has('left') ? -1 : 0;
    const r = this.pressed.has('right') ? 1 : 0;
    return l + r;
  }

  public get dirY(): number {
    const u = this.pressed.has('up') ? -1 : 0;
    const d = this.pressed.has('down') ? 1 : 0;
    return u + d;
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    // P1 修正: DPad center y=750
    this.cx = camW / 2;
    this.cy = 750;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(20);

    // Define key rectangles (touch area slightly enlarged)
    const touchPad = 4;
    this.keys = [
      { dir: 'up',    x: this.cx - KEY_SIZE / 2 - touchPad, y: this.cy - KEY_SIZE - KEY_GAP - KEY_SIZE + touchPad, w: KEY_SIZE + touchPad * 2, h: KEY_SIZE + touchPad * 2 },
      { dir: 'down',  x: this.cx - KEY_SIZE / 2 - touchPad, y: this.cy + KEY_GAP - touchPad, w: KEY_SIZE + touchPad * 2, h: KEY_SIZE + touchPad * 2 },
      { dir: 'left',  x: this.cx - KEY_SIZE - KEY_GAP - KEY_SIZE + touchPad, y: this.cy - KEY_SIZE / 2 - touchPad, w: KEY_SIZE + touchPad * 2, h: KEY_SIZE + touchPad * 2 },
      { dir: 'right', x: this.cx + KEY_GAP - touchPad, y: this.cy - KEY_SIZE / 2 - touchPad, w: KEY_SIZE + touchPad * 2, h: KEY_SIZE + touchPad * 2 },
    ];

    // P1 修正: Scene-level pointer events for drag-across and multi-finger diagonal
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.locked) return;
      const dir = this.hitTest(pointer.x, pointer.y);
      this.pointerDirs.set(pointer.id, dir);
      this.recomputeDirection();
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.locked) return;
      if (!this.pointerDirs.has(pointer.id)) return;
      const dir = this.hitTest(pointer.x, pointer.y);
      this.pointerDirs.set(pointer.id, dir);
      this.recomputeDirection();
    });

    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.pointerDirs.delete(pointer.id);
      this.recomputeDirection();
    });

    // Lock/unlock via EventBus
    EventBus.on('ui-input-lock', () => {
      this.locked = true;
      this.pressed.clear();
      this.pointerDirs.clear();
      this.draw();
      EventBus.emit('joystick-stop');
    });
    EventBus.on('ui-input-unlock', () => {
      this.locked = false;
    });

    this.draw();
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.pressed.clear();
      this.pointerDirs.clear();
      this.draw();
      EventBus.emit('joystick-stop');
    }
  }

  private hitTest(px: number, py: number): Direction | null {
    for (const k of this.keys) {
      if (px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h) {
        return k.dir;
      }
    }
    return null;
  }

  private recomputeDirection(): void {
    this.pressed.clear();
    for (const dir of this.pointerDirs.values()) {
      if (dir) this.pressed.add(dir);
    }
    this.draw();
    this.emitDirection();
  }

  private emitDirection(): void {
    const dx = this.dirX;
    const dy = this.dirY;
    if (dx === 0 && dy === 0) {
      EventBus.emit('joystick-stop');
    } else {
      EventBus.emit('joystick-move', { dirX: dx, dirY: dy });
    }
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();

    // Center decorative square
    const halfC = CENTER_SIZE / 2;
    g.fillStyle(GOTHIC_COLORS.STONE_MID);
    g.fillRect(this.cx - halfC, this.cy - halfC, CENTER_SIZE, CENTER_SIZE);
    g.lineStyle(1, GOTHIC_COLORS.STONE_HIGHLIGHT);
    g.strokeRect(this.cx - halfC, this.cy - halfC, CENTER_SIZE, CENTER_SIZE);

    this.drawKey('up');
    this.drawKey('down');
    this.drawKey('left');
    this.drawKey('right');
  }

  private drawKey(dir: Direction): void {
    const g = this.graphics;
    const isPressed = this.pressed.has(dir);
    const fillColor = isPressed ? GOTHIC_COLORS.STONE_PRESSED : GOTHIC_COLORS.STONE_SURFACE;
    const offsetY = isPressed ? 1 : 0;

    let kx: number, ky: number;
    switch (dir) {
      case 'up':
        kx = this.cx - KEY_SIZE / 2;
        ky = this.cy - KEY_SIZE - KEY_GAP - KEY_SIZE / 2 + offsetY;
        break;
      case 'down':
        kx = this.cx - KEY_SIZE / 2;
        ky = this.cy + KEY_GAP + KEY_SIZE / 2 + offsetY;
        break;
      case 'left':
        kx = this.cx - KEY_SIZE - KEY_GAP - KEY_SIZE / 2;
        ky = this.cy - KEY_SIZE / 2 + offsetY;
        break;
      case 'right':
        kx = this.cx + KEY_GAP + KEY_SIZE / 2;
        ky = this.cy - KEY_SIZE / 2 + offsetY;
        break;
    }

    // Key body
    g.fillStyle(GOTHIC_COLORS.STONE_MID);
    g.fillRect(kx, ky, KEY_SIZE, KEY_SIZE);
    g.fillStyle(fillColor);
    g.fillRect(kx + 2, ky + 2, KEY_SIZE - 4, KEY_SIZE - 4);

    // Highlight / shadow edges
    if (!isPressed) {
      g.lineStyle(1, GOTHIC_COLORS.STONE_HIGHLIGHT);
      g.beginPath();
      g.moveTo(kx + 2, ky + KEY_SIZE - 3);
      g.lineTo(kx + 2, ky + 2);
      g.lineTo(kx + KEY_SIZE - 3, ky + 2);
      g.strokePath();
      g.lineStyle(1, GOTHIC_COLORS.STONE_DARK);
      g.beginPath();
      g.moveTo(kx + 3, ky + KEY_SIZE - 3);
      g.lineTo(kx + KEY_SIZE - 3, ky + KEY_SIZE - 3);
      g.lineTo(kx + KEY_SIZE - 3, ky + 3);
      g.strokePath();
    }

    // Arrow indicator
    g.fillStyle(GOTHIC_COLORS.TEXT_PARCHMENT, 0.6);
    const acx = kx + KEY_SIZE / 2;
    const acy = ky + KEY_SIZE / 2;
    const arrowSize = 5;
    switch (dir) {
      case 'up':
        g.fillTriangle(acx, acy - arrowSize, acx - arrowSize, acy + arrowSize / 2, acx + arrowSize, acy + arrowSize / 2);
        break;
      case 'down':
        g.fillTriangle(acx, acy + arrowSize, acx - arrowSize, acy - arrowSize / 2, acx + arrowSize, acy - arrowSize / 2);
        break;
      case 'left':
        g.fillTriangle(acx - arrowSize, acy, acx + arrowSize / 2, acy - arrowSize, acx + arrowSize / 2, acy + arrowSize);
        break;
      case 'right':
        g.fillTriangle(acx + arrowSize, acy, acx - arrowSize / 2, acy - arrowSize, acx - arrowSize / 2, acy + arrowSize);
        break;
    }
  }

  destroy(): void {
    // P1 修正: 清理 scene-level listeners
    this.scene.input.off('pointerdown');
    this.scene.input.off('pointermove');
    this.scene.input.off('pointerup');
    EventBus.off('ui-input-lock');
    EventBus.off('ui-input-unlock');
    this.graphics.destroy();
  }
}
