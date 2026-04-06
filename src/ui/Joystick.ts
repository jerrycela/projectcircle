import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import EventBus from '../systems/EventBus';

export class Joystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Image;
  private thumb: Phaser.GameObjects.Image;

  private active: boolean = false;
  private baseX: number = 0;
  private baseY: number = 0;
  private pointerId: number = -1;

  public dirX: number = 0;
  public dirY: number = 0;

  private readonly maxRadius: number = GAME_CONFIG.JOYSTICK_MAX_RADIUS;
  private readonly deadZone: number = GAME_CONFIG.JOYSTICK_DEAD_ZONE;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.base = scene.add.image(100, 500, 'joystick-base');
    this.base.setScrollFactor(0);
    this.base.setVisible(false);
    this.base.setDepth(10);

    this.thumb = scene.add.image(100, 500, 'joystick-thumb');
    this.thumb.setScrollFactor(0);
    this.thumb.setVisible(false);
    this.thumb.setDepth(11);

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
  }

  private resetJoystick(): void {
    this.active = false;
    this.pointerId = -1;
    this.dirX = 0;
    this.dirY = 0;
    this.base.setVisible(false);
    this.thumb.setVisible(false);
    EventBus.emit('joystick-stop');
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Reset stale state — if a pointerup was missed, allow new activation
    if (this.active && this.pointerId !== pointer.id) {
      this.resetJoystick();
    }
    if (this.active) return;

    // Only activate in bottom half of screen
    const gameHeight = this.scene.scale.height;
    if (pointer.y <= gameHeight / 2) return;

    this.active = true;
    this.pointerId = pointer.id;
    this.baseX = pointer.x;
    this.baseY = pointer.y;

    this.base.setPosition(this.baseX, this.baseY);
    this.thumb.setPosition(this.baseX, this.baseY);
    this.base.setVisible(true);
    this.thumb.setVisible(true);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.active || pointer.id !== this.pointerId) return;

    const dx = pointer.x - this.baseX;
    const dy = pointer.y - this.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.deadZone) {
      this.dirX = 0;
      this.dirY = 0;
      this.thumb.setPosition(this.baseX, this.baseY);
      EventBus.emit('joystick-move', { dirX: 0, dirY: 0 });
      return;
    }

    const clampedDist = Math.min(dist, this.maxRadius);
    const nx = dx / dist;
    const ny = dy / dist;

    this.dirX = nx;
    this.dirY = ny;

    this.thumb.setPosition(
      this.baseX + nx * clampedDist,
      this.baseY + ny * clampedDist,
    );

    EventBus.emit('joystick-move', { dirX: this.dirX, dirY: this.dirY });
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.active || pointer.id !== this.pointerId) return;
    this.resetJoystick();
  }
}
