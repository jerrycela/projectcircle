import Phaser from 'phaser';

type AnimState = 'idle' | 'walking' | 'attacking' | 'casting' | 'hit' | 'dead';

const STATE_PRIORITY: Record<AnimState, number> = {
  idle: 0,
  walking: 0,
  casting: 1,
  attacking: 1,
  hit: 2,
  dead: 3,
};

export class PlayerAnimator {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private baseSprite: Phaser.GameObjects.Image;
  private weaponSprite: Phaser.GameObjects.Image;
  private indicator: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Graphics;

  private state: AnimState = 'idle';
  private activeTweens: Set<Phaser.Tweens.Tween> = new Set();

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    baseSprite: Phaser.GameObjects.Image,
    weaponSprite: Phaser.GameObjects.Image,
    indicator: Phaser.GameObjects.Graphics
  ) {
    this.scene = scene;
    this.container = container;
    this.baseSprite = baseSprite;
    this.weaponSprite = weaponSprite;
    this.indicator = indicator;

    // Ground shadow — black ellipse at bottom of container
    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.15);
    this.shadow.fillEllipse(0, 10, 36, 12);
    // Insert at index 0 so it renders below everything else
    container.addAt(this.shadow, 0);

    this.enterIdle();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  destroy(): void {
    this.stopAllTweens();
    this.shadow.destroy();
  }

  update(_delta: number, isMoving: boolean): void {
    // Only idle <-> walking transitions handled per-frame
    if (this.state === 'idle' && isMoving) {
      this.enterWalking();
    } else if (this.state === 'walking' && !isMoving) {
      this.enterIdle();
    }
  }

  playAttack(dirX: number, cooldownMs: number): void {
    if (!this.canInterrupt('attacking')) return;
    this.stopAllTweens();
    this.resetSpriteTransforms();
    this.state = 'attacking';

    // Container.scaleX already handles facing flip, so lunge is always +x in local space
    const lungeDir = 3;

    const weaponDuration = Math.max(cooldownMs * 0.3, 120);

    this.addTween({
      targets: this.baseSprite,
      x: { from: 0, to: lungeDir },
      duration: 150,
      ease: 'Sine.Out',
      yoyo: true,
      onComplete: () => this.returnFromAction(),
    });

    this.addTween({
      targets: this.weaponSprite,
      rotation: { from: 0, to: -Math.PI / 3 },
      duration: weaponDuration,
      ease: 'Sine.InOut',
      yoyo: true,
    });
  }

  playCast(): void {
    if (!this.canInterrupt('casting')) return;
    this.stopAllTweens();
    this.resetSpriteTransforms();
    this.state = 'casting';

    this.addTween({
      targets: this.baseSprite,
      scaleY: { from: 1, to: 0.9 },
      duration: 100,
      ease: 'Sine.Out',
      yoyo: true,
      onComplete: () => this.returnFromAction(),
    });

    // Indicator fills already have baked alpha (0.15/0.3); pulse via scale instead
    this.addTween({
      targets: this.indicator,
      scaleX: { from: 1, to: 1.4 },
      scaleY: { from: 1, to: 1.4 },
      duration: 200,
      ease: 'Sine.InOut',
      yoyo: true,
    });
  }

  playHit(): void {
    if (!this.canInterrupt('hit')) return;
    this.stopAllTweens();
    this.resetSpriteTransforms();
    this.state = 'hit';

    const originalTint = this.baseSprite.tintTopLeft;

    this.addTween({
      targets: this.baseSprite,
      rotation: { from: -0.14, to: 0.14 },
      duration: 100,
      ease: 'Sine.Out',
      yoyo: true,
    });

    this.baseSprite.setTint(0xff4444);

    this.scene.time.delayedCall(80, () => {
      if (this.baseSprite.active) {
        this.baseSprite.setTint(originalTint);
      }
    });

    this.scene.time.delayedCall(150, () => {
      if (this.state === 'hit') {
        this.returnFromAction();
      }
    });
  }

  playDead(): void {
    // dead is terminal — only enter if not already dead
    if (this.state === 'dead') return;
    this.stopAllTweens();
    this.resetSpriteTransforms();
    this.state = 'dead';

    this.addTween({
      targets: this.baseSprite,
      rotation: 0.26,
      duration: 300,
      ease: 'Sine.Out',
    });

    this.addTween({
      targets: this.container,
      scaleY: 0.3,
      duration: 400,
      ease: 'Sine.Out',
    });

    this.addTween({
      targets: this.container,
      alpha: 0,
      duration: 200,
      delay: 200,
      ease: 'Linear',
    });

    this.addTween({
      targets: this.weaponSprite,
      alpha: 0,
      duration: 150,
      ease: 'Linear',
    });
  }

  playHealFlash(): void {
    const originalTint = this.baseSprite.tintTopLeft;

    this.baseSprite.setTint(0x44ff44);

    this.scene.time.delayedCall(80, () => {
      if (this.baseSprite.active) {
        this.baseSprite.setTint(originalTint);
      }
    });

    this.addTween({
      targets: this.baseSprite,
      y: { from: 0, to: -2 },
      duration: 150,
      ease: 'Sine.Out',
      yoyo: true,
    });
  }

  // -------------------------------------------------------------------------
  // Internal state transitions
  // -------------------------------------------------------------------------

  private enterIdle(): void {
    this.stopAllTweens();
    this.resetSpriteTransforms();
    this.state = 'idle';

    // baseSprite bob
    this.addTween({
      targets: this.baseSprite,
      y: { from: -1.5, to: 1.5 },
      scaleY: { from: 1, to: 1.02 },
      duration: 1200,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });

    // weaponSprite bob — phase offset via delay
    this.addTween({
      targets: this.weaponSprite,
      y: { from: -1, to: 1 },
      duration: 1200,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
      delay: 200,
    });

    // Shadow subtle pulse at 30% amplitude of bob
    this.addTween({
      targets: this.shadow,
      scaleX: { from: 1, to: 1.015 },
      scaleY: { from: 1, to: 0.985 },
      duration: 1200,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private enterWalking(): void {
    this.stopAllTweens();
    this.resetSpriteTransforms();
    this.state = 'walking';

    this.addTween({
      targets: this.baseSprite,
      y: { from: -2, to: 2 },
      duration: 200,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });

    this.addTween({
      targets: this.weaponSprite,
      y: { from: -1.5, to: 1.5 },
      duration: 200,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });

    // Shadow bob at 30% amplitude
    this.addTween({
      targets: this.shadow,
      scaleX: { from: 1, to: 1.02 },
      scaleY: { from: 1, to: 0.97 },
      duration: 200,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private returnFromAction(): void {
    // After a one-shot animation, return to idle/walking based on current situation
    // We don't have velocity info here, so default to idle;
    // update() will correct to walking on the next frame if needed
    if (this.state === 'dead') return;
    this.enterIdle();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private canInterrupt(incoming: AnimState): boolean {
    if (this.state === 'dead') return false;
    return STATE_PRIORITY[incoming] >= STATE_PRIORITY[this.state];
  }

  private addTween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    const originalOnComplete = config.onComplete;

    const tween = this.scene.tweens.add({
      ...config,
      onComplete: (tw: Phaser.Tweens.Tween, targets: unknown[], ...args: unknown[]) => {
        this.activeTweens.delete(tw);
        if (originalOnComplete) {
          (originalOnComplete as (tw: Phaser.Tweens.Tween, targets: unknown[], ...args: unknown[]) => void)(tw, targets, ...args);
        }
      },
    });

    this.activeTweens.add(tween);
    return tween;
  }

  private stopAllTweens(): void {
    const toStop = [...this.activeTweens];
    this.activeTweens.clear();
    for (const tw of toStop) {
      tw.stop();
    }
  }

  private resetSpriteTransforms(): void {
    // baseSprite
    this.baseSprite.x = 0;
    this.baseSprite.y = 0;
    this.baseSprite.scaleX = 1;
    this.baseSprite.scaleY = 1;
    this.baseSprite.rotation = 0;
    this.baseSprite.angle = 0;

    // weaponSprite — preserve original x offset (15)
    this.weaponSprite.x = 15;
    this.weaponSprite.y = 0;
    this.weaponSprite.rotation = 0;
    this.weaponSprite.alpha = 1;

    // indicator — fills have baked alpha, keep Graphics alpha at default
    this.indicator.alpha = 1;
    this.indicator.scaleX = 1;
    this.indicator.scaleY = 1;

    // shadow
    this.shadow.scaleX = 1;
    this.shadow.scaleY = 1;

    // container — do not reset x/y (those are physics-driven)
    this.container.scaleY = 1;
    this.container.alpha = 1;
  }
}
