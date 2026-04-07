import Phaser from 'phaser';
import { COMPANION_DEFS, COMPANION_CONFIG } from '../config';

export const HostageState = {
  CAGED:   'CAGED',
  RESCUED: 'RESCUED',
  FREED:   'FREED',
} as const;

export type HostageState = typeof HostageState[keyof typeof HostageState];

export class Hostage extends Phaser.GameObjects.Container {
  public companionId: string;
  public hostageState: HostageState = HostageState.CAGED;
  private cage: Phaser.GameObjects.Graphics;
  private npc: Phaser.GameObjects.Graphics;
  private themeColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number, companionId: string) {
    super(scene, x, y);
    this.companionId = companionId;

    const def = COMPANION_DEFS.find(d => d.id === companionId);
    this.themeColor = def ? def.themeColor : 0xffffff;

    // Draw cage: grey grid lines
    this.cage = scene.add.graphics();
    // Vertical bars every 10px from -20 to 20
    this.cage.lineStyle(2, 0x888888, 1);
    for (let bx = -20; bx <= 20; bx += 10) {
      this.cage.strokeLineShape(new Phaser.Geom.Line(bx, -24, bx, 24));
    }
    // Horizontal bars at y=-24 and y=24
    this.cage.strokeLineShape(new Phaser.Geom.Line(-20, -24, 20, -24));
    this.cage.strokeLineShape(new Phaser.Geom.Line(-20,  24, 20,  24));

    // Draw NPC: filled circle at (0,0) radius 12
    this.npc = scene.add.graphics();
    this.npc.fillStyle(this.themeColor, 1);
    this.npc.fillCircle(0, 0, 12);

    this.add([this.cage, this.npc]);
    scene.add.existing(this);
  }

  isInRange(playerX: number, playerY: number): boolean {
    const dx = this.x - playerX;
    const dy = this.y - playerY;
    return Math.sqrt(dx * dx + dy * dy) <= COMPANION_CONFIG.INTERACTION_RANGE;
  }

  startRescue(onComplete: () => void): void {
    if (this.hostageState !== HostageState.CAGED) return;

    this.hostageState = HostageState.RESCUED;

    const rescueDuration = COMPANION_CONFIG.RESCUE_DURATION_MS;

    // Tween cage: alpha->0, scaleX/Y->1.5
    this.scene.tweens.add({
      targets: this.cage,
      alpha:  0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: rescueDuration * 0.6,
      ease: 'Power2',
    });

    // After RESCUE_DURATION_MS delay
    this.scene.time.delayedCall(rescueDuration, () => {
      this.hostageState = HostageState.FREED;

      // Show heart text
      const heart = this.scene.add.text(this.x, this.y - 30, '♥', {
        fontSize: '24px',
        color: '#' + this.themeColor.toString(16).padStart(6, '0'),
      }).setOrigin(0.5);

      this.scene.tweens.add({
        targets: heart,
        y:     heart.y - 20,
        alpha: 0,
        duration: 1500,
        ease: 'Linear',
        onComplete: () => heart.destroy(),
      });

      onComplete();

      // Fade out NPC then destroy container
      this.scene.tweens.add({
        targets: this.npc,
        alpha: 0,
        duration: 2000,
        ease: 'Linear',
        onComplete: () => this.destroy(),
      });
    });
  }
}
