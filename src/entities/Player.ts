import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import EventBus from '../systems/EventBus';
import type { StatsManager } from '../systems/StatsManager';
import { ElementalState } from '../systems/ElementalState';
import { PlayerAnimator } from './PlayerAnimator';

export class Player extends Phaser.GameObjects.Container {
  public hp: number;
  public maxHp: number;
  public mp: number;
  public maxMp: number;
  public speed: number;
  public gold: number = 0;
  public materials: { wood: number; ore: number; cloth: number } = { wood: 0, ore: 0, cloth: 0 };
  public invincible: boolean = false;
  public statsManager!: StatsManager;
  public elementalState: ElementalState = new ElementalState(false);

  declare body: Phaser.Physics.Arcade.Body;

  private flickerEvent?: Phaser.Time.TimerEvent;

  public readonly baseSprite: Phaser.GameObjects.Image;
  public readonly weaponSprite: Phaser.GameObjects.Image;
  public readonly indicator: Phaser.GameObjects.Graphics;
  public animator!: PlayerAnimator;

  constructor(scene: Phaser.Scene, x: number, y: number, statsManager: StatsManager) {
    super(scene, x, y);

    this.statsManager = statsManager;
    this.hp = statsManager.getStat('maxHp');
    this.maxHp = statsManager.getStat('maxHp');
    this.mp = GAME_CONFIG.PLAYER_MP;
    this.maxMp = GAME_CONFIG.PLAYER_MP;
    this.speed = statsManager.getStat('moveSpeed');

    // Ground indicator — subtle glow beneath player for visibility
    this.indicator = scene.add.graphics();
    this.indicator.fillStyle(0xffcc44, 0.15);
    this.indicator.fillCircle(0, 4, 24);
    this.indicator.fillStyle(0xffcc44, 0.3);
    this.indicator.fillCircle(0, 4, 12);

    // Visual children — no physics on these
    this.baseSprite = scene.add.image(0, 0, 'player-body');
    this.baseSprite.setOrigin(0.5, 0.5);

    this.weaponSprite = scene.add.image(15, 0, 'player-weapon');
    this.weaponSprite.setOrigin(0.5, 0.5);

    this.add([this.indicator, this.baseSprite, this.weaponSprite]);

    // Add container to scene and enable physics
    scene.add.existing(this);
    scene.physics.world.enable(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 32);
    body.setOffset(-16, -16);
    body.setCollideWorldBounds(true);

    // Animator — procedural puppet animations
    this.animator = new PlayerAnimator(scene, this, this.baseSprite, this.weaponSprite, this.indicator);

    // Listen for weapon type changes
    EventBus.on('weapon-changed', (subtype: string) => {
      const textureKey = `weapon-${subtype}`;
      if (this.scene.textures.exists(textureKey)) {
        this.weaponSprite.setTexture(textureKey);
      }
    });
  }

  get isMoving(): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    return vx * vx + vy * vy > 0;
  }

  move(dirX: number, dirY: number): void {
    if (dirX === 0 && dirY === 0) {
      this.stop();
      return;
    }

    // Normalize diagonal movement
    let nx = dirX;
    let ny = dirY;
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len > 0) {
      nx = nx / len;
      ny = ny / len;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    const speed = this.statsManager.getStat('moveSpeed');
    body.setVelocity(nx * speed, ny * speed);

    // Flip container based on horizontal direction
    if (dirX !== 0) {
      this.scaleX = dirX > 0 ? 1 : -1;
    }
  }

  stop(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
  }

  takeDamage(amount: number): void {
    if (this.invincible) return;
    if (!this.active) return;

    const armor = this.statsManager.getStat('armor');
    const reduced = Math.max(1, amount - armor);
    this.hp = Math.max(0, this.hp - reduced);

    // Camera flash red to signal damage
    EventBus.emit('player-hit');
    EventBus.emit('player-hp-changed', this.hp, this.maxHp);

    this.setInvincible(true);

    if (this.hp <= 0) {
      EventBus.emit('player-died');
    }
  }

  heal(amount: number): void {
    this.hp = Math.min(this.hp + amount, this.maxHp);
    EventBus.emit('player-hp-changed', this.hp, this.maxHp);
    EventBus.emit('player-heal-flash');
  }

  addGold(amount: number): void {
    this.gold += amount;
    EventBus.emit('player-gold-changed', this.gold);
  }

  addMaterial(type: 'wood' | 'ore' | 'cloth', amount: number): void {
    this.materials[type] += amount;
    EventBus.emit('player-material-changed', { type, amount: this.materials[type] });
  }

  setInvincible(on: boolean): void {
    this.invincible = on;

    // Cancel any existing flicker
    if (this.flickerEvent) {
      this.flickerEvent.remove();
      this.flickerEvent = undefined;
    }

    if (on) {
      // Flicker alpha every 100ms for PLAYER_INVINCIBLE_MS total
      let flickerCount = 0;
      const totalFlickers = GAME_CONFIG.PLAYER_INVINCIBLE_MS / 100;

      this.flickerEvent = this.scene.time.addEvent({
        delay: 100,
        repeat: totalFlickers - 1,
        callback: () => {
          flickerCount++;
          this.setAlpha(this.alpha === 1.0 ? 0.3 : 1.0);

          if (flickerCount >= totalFlickers) {
            // Invincibility ended
            this.setAlpha(1.0);
            this.invincible = false;
            this.flickerEvent = undefined;
          }
        },
      });
    } else {
      // Immediately clear invincibility
      this.setAlpha(1.0);
    }
  }

  override destroy(fromScene?: boolean): void {
    this.animator?.destroy();
    super.destroy(fromScene);
  }

  updateElementVisual(): void {
    const el = this.elementalState.element;
    if (el === null) {
      this.baseSprite.clearTint();
      this.baseSprite.setAlpha(1);
      return;
    }

    const tints: Record<string, number> = {
      WATER: 0x4488ff,
      FIRE: 0xff6600,
      THUNDER: 0xffff44,
      WIND: 0x88ffcc,
    };
    const tint = tints[el] ?? 0xffffff;

    if (this.elementalState.isFlickering()) {
      const flicker = Math.floor(Date.now() / 200) % 2 === 0;
      if (flicker) {
        this.baseSprite.setTint(tint);
        this.baseSprite.setAlpha(1);
      } else {
        this.baseSprite.clearTint();
        this.baseSprite.setAlpha(0.7);
      }
    } else {
      this.baseSprite.setTint(tint);
      this.baseSprite.setAlpha(1);
    }
  }
}
